-- Additive organization-scoped employee positions and per-employee permissions.
-- Existing role codes and historical sales/commission records remain unchanged.

alter table public.management_roles
  add column if not exists scope_branch_id uuid references public.branches(id) on delete restrict;

create index if not exists management_roles_org_scope_active_idx
  on public.management_roles (organization_id, scope_branch_id, active);

-- A null scope_branch_id keeps legacy roles available organization-wide.
-- A non-null scope_branch_id limits the position to that exact Head Office or branch.
create or replace function public.validate_management_role_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $validate_role_scope$
declare
  branch_org uuid;
begin
  if new.scope_branch_id is null then
    return new;
  end if;

  select organization_id into branch_org
  from public.branches
  where id = new.scope_branch_id and active = true;

  if branch_org is null or branch_org <> new.organization_id then
    raise exception 'Position scope must be an active Head Office or branch in the same organization';
  end if;

  return new;
end;
$validate_role_scope$;

drop trigger if exists management_roles_validate_scope on public.management_roles;
create trigger management_roles_validate_scope
before insert or update of organization_id, scope_branch_id
on public.management_roles
for each row execute function public.validate_management_role_scope();

revoke all on function public.validate_management_role_scope() from public, anon, authenticated;

create table if not exists public.employee_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on update cascade on delete cascade,
  enabled boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (user_id, permission_code)
);

create index if not exists employee_permissions_user_enabled_idx
  on public.employee_permissions (user_id, enabled);

alter table public.employee_permissions enable row level security;
revoke all on public.employee_permissions from anon, authenticated;
grant select on public.employee_permissions to authenticated;

drop policy if exists employee_permissions_read_scoped on public.employee_permissions;
create policy employee_permissions_read_scoped
on public.employee_permissions
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_super_admin()
  or exists (
    select 1 from public.profiles caller
    join public.profiles target
      on target.id = employee_permissions.user_id
     and target.organization_id = caller.organization_id
     and target.branch_id = caller.branch_id
    where caller.id = (select auth.uid())
      and caller.active = true
      and caller.role = 'branch_admin'
  )
);

-- Optional employee department assignment. This is additive and preserves existing profiles.
create table if not exists public.organization_departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 120),
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organization_departments_org_name_uq
  on public.organization_departments (organization_id, lower(name));
create unique index if not exists organization_departments_org_code_uq
  on public.organization_departments (organization_id, lower(code))
  where code is not null and btrim(code) <> '';
create index if not exists organization_departments_org_active_idx
  on public.organization_departments (organization_id, active);

alter table public.profiles
  add column if not exists department_id uuid
  references public.organization_departments(id) on delete set null;
create index if not exists profiles_department_id_idx
  on public.profiles (department_id);

alter table public.organization_departments enable row level security;
revoke all on public.organization_departments from anon, authenticated;
grant select, insert, update on public.organization_departments to authenticated;

drop policy if exists organization_departments_scoped_read on public.organization_departments;
create policy organization_departments_scoped_read
on public.organization_departments for select to authenticated
using (
  public.is_super_admin()
  or (
    active = true
    and organization_id = (select public.current_organization_id())
  )
);

drop policy if exists organization_departments_admin_write on public.organization_departments;
create policy organization_departments_admin_write
on public.organization_departments for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());
