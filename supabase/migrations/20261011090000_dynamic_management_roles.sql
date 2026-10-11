-- Additive dynamic management roles. Existing sales/commission/team/attendance tables are untouched.
create table if not exists public.management_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_am text not null,
  name_en text,
  description text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint management_roles_code_format check (code ~ '^custom_[a-z0-9_]{2,48}$')
);

create table if not exists public.management_role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.management_roles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on update cascade on delete cascade,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (role_id, permission_code)
);

alter table public.management_roles enable row level security;
alter table public.management_role_permissions enable row level security;

drop policy if exists management_roles_read_active on public.management_roles;
create policy management_roles_read_active on public.management_roles
for select to authenticated using (active or public.is_super_admin());

drop policy if exists management_roles_global_write on public.management_roles;
create policy management_roles_global_write on public.management_roles
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists management_role_permissions_read on public.management_role_permissions;
create policy management_role_permissions_read on public.management_role_permissions
for select to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.management_roles r on r.code = p.role and r.active = true
    where p.id = auth.uid() and r.id = management_role_permissions.role_id and p.active = true
  )
);

drop policy if exists management_role_permissions_global_write on public.management_role_permissions;
create policy management_role_permissions_global_write on public.management_role_permissions
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

-- Keep all existing built-in roles valid and allow only namespaced custom roles.
-- Drop only the confirmed built-in role constraint; preserve unrelated checks.
alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_builtin_or_custom_check
  check (
    role in ('super_admin','admin','branch_admin','lead','lead_sales','assistant','driver')
    or role ~ '^custom_[a-z0-9_]{2,48}$'
  );

grant select on public.management_roles, public.management_role_permissions to authenticated;
grant insert, update, delete on public.management_roles, public.management_role_permissions to authenticated;
