-- Commission Portal v2 foundation migration
-- Safe principle: add/extend structures; do not delete existing business data.

create extension if not exists pgcrypto;

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  phone text,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists branch_id uuid references public.branches(id) on delete restrict;

create index if not exists profiles_branch_id_idx on public.profiles(branch_id);
create index if not exists profiles_role_idx on public.profiles(role);

alter table public.sales
  add column if not exists branch_id uuid references public.branches(id) on delete restrict;

create index if not exists sales_branch_id_idx on public.sales(branch_id);
create index if not exists sales_sale_date_idx on public.sales(sale_date);

-- Normalize the supported role vocabulary while preserving existing rows.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin','branch_admin','lead','lead_sales','assistant','driver','admin'));

-- Replace the old admin-only helper with the intended global role model.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active = true
      and role in ('super_admin','admin')
  );
$$;

create or replace function public.is_branch_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active = true
      and role = 'branch_admin'
  );
$$;

create or replace function public.current_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.can_manage_profile(target_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
      or (public.is_branch_admin() and target_branch = public.current_branch_id());
$$;

-- Branch visibility: super admin sees all; branch admin sees own branch.
drop policy if exists "Users view own profile" on public.profiles;
drop policy if exists "Admin updates profiles" on public.profiles;

create policy "Users view permitted profiles"
on public.profiles for select
using (
  id = auth.uid()
  or public.is_super_admin()
  or (public.is_branch_admin() and branch_id = public.current_branch_id())
);

create policy "Managers update permitted profiles"
on public.profiles for update
using (public.can_manage_profile(branch_id))
with check (public.can_manage_profile(branch_id));

-- Branch management.
alter table public.branches enable row level security;

drop policy if exists "Managers view branches" on public.branches;
drop policy if exists "Super admins manage branches" on public.branches;

create policy "Managers view branches"
on public.branches for select
using (
  public.is_super_admin()
  or (public.is_branch_admin() and id = public.current_branch_id())
);

create policy "Super admins manage branches"
on public.branches for all
using (public.is_super_admin())
with check (public.is_super_admin());

-- Sales branch scoping.
drop policy if exists "Admin updates sales" on public.sales;
drop policy if exists "Users view own sales" on public.sales;
drop policy if exists "Authenticated insert sales" on public.sales;

create policy "Users view permitted sales"
on public.sales for select
using (
  public.is_super_admin()
  or (public.is_branch_admin() and branch_id = public.current_branch_id())
  or lead_id = auth.uid()
  or assistant_id = auth.uid()
  or driver_id = auth.uid()
);

create policy "Permitted users insert sales"
on public.sales for insert
with check (
  auth.uid() is not null
  and (
    public.is_super_admin()
    or (public.is_branch_admin() and branch_id = public.current_branch_id())
    or lead_id = auth.uid()
    or assistant_id = auth.uid()
    or driver_id = auth.uid()
  )
);

create policy "Managers update permitted sales"
on public.sales for update
using (
  public.is_super_admin()
  or (public.is_branch_admin() and branch_id = public.current_branch_id())
)
with check (
  public.is_super_admin()
  or (public.is_branch_admin() and branch_id = public.current_branch_id())
);

-- Never trust client-provided privileged roles in the auth trigger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, phone, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name','New User'),
    new.phone,
    'assistant',
    true
  )
  on conflict (id) do update
    set phone = excluded.phone;
  return new;
end;
$$;

-- NOTE:
-- Creating Auth users with a password must be performed by a trusted server/Edge Function
-- using the Supabase Auth admin API. The browser must never receive the service-role key.
