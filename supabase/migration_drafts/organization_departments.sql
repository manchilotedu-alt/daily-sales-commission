-- DRAFT ONLY: review and create the official Supabase migration with the Supabase CLI before applying.
-- Adds organization-level departments and an optional employee department assignment.
-- This file has NOT been applied to any database.

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

-- Nullable and non-destructive: existing employee records remain valid.
alter table public.profiles
  add column if not exists department_id uuid
  references public.organization_departments(id) on delete set null;
create index if not exists profiles_department_id_idx
  on public.profiles (department_id);

alter table public.organization_departments enable row level security;
revoke all on public.organization_departments from anon, authenticated;
grant select, insert, update on public.organization_departments to authenticated;

drop policy if exists organization_departments_admin_select on public.organization_departments;
create policy organization_departments_admin_select
  on public.organization_departments for select to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'admin'
  ));

drop policy if exists organization_departments_admin_insert on public.organization_departments;
create policy organization_departments_admin_insert
  on public.organization_departments for insert to authenticated
  with check (public.is_super_admin() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'admin'
  ));

drop policy if exists organization_departments_admin_update on public.organization_departments;
create policy organization_departments_admin_update
  on public.organization_departments for update to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'admin'
  ))
  with check (public.is_super_admin() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'admin'
  ));
