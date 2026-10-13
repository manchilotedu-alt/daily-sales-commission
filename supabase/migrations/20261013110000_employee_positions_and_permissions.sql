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
    select 1 from public.profiles global_caller
    where global_caller.id = (select auth.uid())
      and global_caller.active = true
      and global_caller.role in ('super_admin', 'admin')
  )
  or exists (
    select 1
    from public.profiles caller
    join public.profiles target
      on target.id = employee_permissions.user_id
     and target.organization_id = caller.organization_id
    where caller.id = (select auth.uid())
      and caller.active = true
      and (
        (caller.role = 'branch_admin' and target.branch_id = caller.branch_id)
        or exists (
          select 1
          from public.management_roles mr
          join public.management_role_permissions mrp on mrp.role_id = mr.id
          where mr.code = caller.role
            and mr.organization_id = caller.organization_id
            and mr.active = true
            and mrp.permission_code = 'users.manage'
            and mrp.enabled = true
            and (mr.scope_branch_id is null or mr.scope_branch_id = target.branch_id)
        )
      )
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
  or exists (
    select 1 from public.profiles global_caller
    where global_caller.id = (select auth.uid())
      and global_caller.active = true
      and global_caller.role in ('super_admin', 'admin')
  )
  or (
    active = true
    and organization_id = (select public.current_organization_id())
  )
);

drop policy if exists organization_departments_admin_write on public.organization_departments;
create policy organization_departments_admin_write
on public.organization_departments for all to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles global_caller
    where global_caller.id = (select auth.uid())
      and global_caller.active = true
      and global_caller.role in ('super_admin', 'admin')
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles global_caller
    where global_caller.id = (select auth.uid())
      and global_caller.active = true
      and global_caller.role in ('super_admin', 'admin')
  )
);

-- Username is a unique, case-insensitive sign-in alias; phone remains the Supabase Auth credential.
alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_lower_uq
  on public.profiles (lower(username))
  where username is not null and btrim(username) <> '';

-- Permission group used by the employee form's stock/inventory checkbox.
insert into public.permissions (code, name_am, module, active)
values ('stock.manage', 'የዕቃ/እስቶክ ቁጥጥር', 'stock', true)
on conflict (code) do update set name_am = excluded.name_am, module = excluded.module, active = true;

-- Additional standard job positions. These are templates only; office type is
-- validated by the Edge Function and the UI before a user can be assigned.
do $seed_extra_positions$
declare
  org record;
  template record;
  role_id uuid;
  role_code text;
begin
  for org in select id from public.organizations loop
    for template in
      select * from (values
        ('operations_manager', 'የኦፕሬሽን አስተዳዳሪ', array['users.create','users.manage','attendance.manage','sales.review','teams.manage','performance.view','reports.export']::text[]),
        ('it_admin', 'የIT አስተዳዳሪ', array['users.create','users.manage','audit.view','reports.export']::text[]),
        ('branch_accountant', 'የቅርንጫፍ አካውንታንት', array['commission.view','earnings.view','periods.manage','disputes.manage','reports.export']::text[]),
        ('stock_manager', 'የእስቶክ/ዕቃ ግምጃ ቤት ኃላፊ', array['stock.manage','products.view','products.assign']::text[]),
        ('procurement', 'የግዢና አቅርቦት ኃላፊ', array['stock.manage','products.view','products.assign','pricing.view']::text[])
      ) as templates(slug, name_am, permission_codes)
    loop
      role_code := 'custom_' || template.slug || '_' || replace(left(org.id::text, 8), '-', '');
      insert into public.management_roles(code, name_am, organization_id, active)
      values (role_code, template.name_am, org.id, true)
      on conflict (code) do nothing;

      select id into role_id from public.management_roles
      where code = role_code and organization_id = org.id limit 1;

      if role_id is not null then
        insert into public.management_role_permissions(role_id, permission_code, enabled)
        select role_id, p.code, p.code = any(template.permission_codes)
        from public.permissions p
        where p.active = true
        on conflict (role_id, permission_code) do nothing;
      end if;
    end loop;
  end loop;
end;
$seed_extra_positions$;
