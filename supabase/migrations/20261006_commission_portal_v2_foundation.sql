-- Dirsha-ድርሻ multi-organization commission platform foundation
-- Safe principle: extend existing structures; do not delete existing business data.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  active boolean not null default true,
  branch_limit integer not null default 1 check (branch_limit > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  phone text,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.branches
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;

alter table public.profiles
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;

alter table public.profiles
  add column if not exists branch_id uuid references public.branches(id) on delete restrict;

alter table public.sales
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;

alter table public.sales
  add column if not exists branch_id uuid references public.branches(id) on delete restrict;

create index if not exists branches_organization_id_idx on public.branches(organization_id);
create index if not exists profiles_organization_id_idx on public.profiles(organization_id);
create index if not exists profiles_branch_id_idx on public.profiles(branch_id);
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists sales_organization_id_idx on public.sales(organization_id);
create index if not exists sales_branch_id_idx on public.sales(branch_id);
create index if not exists sales_sale_date_idx on public.sales(sale_date);

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin','branch_admin','lead','lead_sales','assistant','driver','admin'));

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.profiles
    where id=auth.uid() and active=true and role in ('super_admin','admin')
  );
$$;

create or replace function public.is_branch_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.profiles
    where id=auth.uid() and active=true and role='branch_admin'
  );
$$;

create or replace function public.current_organization_id()
returns uuid language sql stable security definer set search_path=public as $$
  select organization_id from public.profiles where id=auth.uid() and active=true;
$$;

create or replace function public.current_branch_id()
returns uuid language sql stable security definer set search_path=public as $$
  select branch_id from public.profiles where id=auth.uid() and active=true;
$$;

create or replace function public.can_manage_profile(target_org uuid, target_branch uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin()
      or (public.is_branch_admin()
          and target_org=public.current_organization_id()
          and target_branch=public.current_branch_id());
$$;

-- Enforce an organization's branch limit whenever a branch is created or moved.
create or replace function public.enforce_branch_limit()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  allowed integer;
  used_count integer;
begin
  if new.organization_id is null then
    raise exception 'Branch must belong to an organization';
  end if;

  select branch_limit into allowed
  from public.organizations
  where id=new.organization_id and active=true;

  if allowed is null then
    raise exception 'Organization is missing or inactive';
  end if;

  if tg_op='INSERT' then
    select count(*) into used_count
    from public.branches
    where organization_id=new.organization_id;
  else
    select count(*) into used_count
    from public.branches
    where organization_id=new.organization_id and id<>new.id;
  end if;

  if used_count >= allowed then
    raise exception 'Branch limit reached for this organization';
  end if;

  return new;
end;
$$;

drop trigger if exists branches_enforce_limit on public.branches;
create trigger branches_enforce_limit
before insert or update of organization_id on public.branches
for each row execute function public.enforce_branch_limit();

-- Prevent lowering an organization's branch limit below its current branch count.
create or replace function public.validate_branch_limit()
returns trigger language plpgsql security definer set search_path=public as $
declare
  used_count integer;
begin
  select count(*) into used_count from public.branches where organization_id=new.id;
  if new.branch_limit < used_count then
    raise exception 'Branch limit cannot be lower than the current number of branches';
  end if;
  return new;
end;
$;

drop trigger if exists organizations_validate_branch_limit on public.organizations;
create trigger organizations_validate_branch_limit
before update of branch_limit on public.organizations
for each row execute function public.validate_branch_limit();

-- Organization visibility and management are global Super Admin responsibilities.
alter table public.organizations enable row level security;
drop policy if exists "Super admins manage organizations" on public.organizations;
create policy "Super admins manage organizations"
on public.organizations for all
using (public.is_super_admin())
with check (public.is_super_admin());

-- Branch visibility is organization-scoped.
alter table public.branches enable row level security;
drop policy if exists "Managers view branches" on public.branches;
drop policy if exists "Super admins manage branches" on public.branches;
create policy "Managers view branches"
on public.branches for select
using (
  public.is_super_admin()
  or (public.is_branch_admin()
      and organization_id=public.current_organization_id()
      and id=public.current_branch_id())
);
create policy "Super admins manage branches"
on public.branches for all
using (public.is_super_admin())
with check (public.is_super_admin());

-- Profiles are explicitly tenant-scoped.
drop policy if exists "Users view own profile" on public.profiles;
drop policy if exists "Admin updates profiles" on public.profiles;
drop policy if exists "Users view permitted profiles" on public.profiles;
drop policy if exists "Managers update permitted profiles" on public.profiles;
create policy "Users view permitted profiles"
on public.profiles for select
using (
  id=auth.uid()
  or public.is_super_admin()
  or (public.is_branch_admin()
      and organization_id=public.current_organization_id()
      and branch_id=public.current_branch_id())
);
create policy "Managers update permitted profiles"
on public.profiles for update
using (public.can_manage_profile(organization_id,branch_id))
with check (public.can_manage_profile(organization_id,branch_id));

-- Sales are tenant and branch scoped.
drop policy if exists "Admin updates sales" on public.sales;
drop policy if exists "Users view own sales" on public.sales;
drop policy if exists "Authenticated insert sales" on public.sales;
drop policy if exists "Users view permitted sales" on public.sales;
drop policy if exists "Permitted users insert sales" on public.sales;
drop policy if exists "Managers update permitted sales" on public.sales;

create policy "Users view permitted sales"
on public.sales for select
using (
  public.is_super_admin()
  or (public.is_branch_admin()
      and organization_id=public.current_organization_id()
      and branch_id=public.current_branch_id())
  or lead_id=auth.uid() or assistant_id=auth.uid() or driver_id=auth.uid()
);

create policy "Permitted users insert sales"
on public.sales for insert
with check (
  auth.uid() is not null
  and (
    public.is_super_admin()
    or (
      organization_id=public.current_organization_id()
      and branch_id=public.current_branch_id()
      and (
        public.is_branch_admin()
        or lead_id=auth.uid() or assistant_id=auth.uid() or driver_id=auth.uid()
      )
    )
  )
);

create policy "Managers update permitted sales"
on public.sales for update
using (
  public.is_super_admin()
  or (public.is_branch_admin()
      and organization_id=public.current_organization_id()
      and branch_id=public.current_branch_id())
)
with check (
  public.is_super_admin()
  or (public.is_branch_admin()
      and organization_id=public.current_organization_id()
      and branch_id=public.current_branch_id())
);

-- New Auth users can never self-assign a privileged role.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,full_name,phone,role,active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name','New User'),
    new.phone,
    'assistant',
    true
  )
  on conflict (id) do update set phone=excluded.phone;
  return new;
end;
$$;

-- Password creation/reset must use a trusted Edge Function with the Auth admin API.
