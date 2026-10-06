create extension if not exists pgcrypto;

create table if not exists public.organizations(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  active boolean not null default true,
  branch_limit integer not null default 1 check(branch_limit>0),
  created_at timestamptz not null default now()
);
create table if not exists public.branches(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  phone text,
  address text,
  active boolean not null default true,
  organization_id uuid references public.organizations(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.profiles add column if not exists branch_id uuid references public.branches(id) on delete restrict;
alter table public.sales add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.sales add column if not exists branch_id uuid references public.branches(id) on delete restrict;

-- Preserve existing production data by placing legacy rows in one explicit organization/branch.
insert into public.organizations(name,code,active,branch_limit)
select 'Legacy Organization','LEGACY',true,1
where not exists(select 1 from public.organizations where code='LEGACY');

insert into public.branches(name,code,active,organization_id)
select 'Main Branch','MAIN',true,id from public.organizations where code='LEGACY'
and not exists(select 1 from public.branches where code='MAIN');

update public.profiles
set organization_id=(select id from public.organizations where code='LEGACY'),
    branch_id=(select id from public.branches where code='MAIN')
where organization_id is null or branch_id is null;

update public.sales
set organization_id=coalesce(organization_id,(select id from public.organizations where code='LEGACY')),
    branch_id=coalesce(branch_id,(select id from public.branches where code='MAIN'))
where organization_id is null or branch_id is null;

alter table public.branches alter column organization_id set not null;
alter table public.profiles alter column organization_id set not null;
alter table public.profiles alter column branch_id set not null;
alter table public.sales alter column organization_id set not null;
alter table public.sales alter column branch_id set not null;

create index if not exists idx_branches_org on public.branches(organization_id);
create index if not exists idx_profiles_org_branch on public.profiles(organization_id,branch_id);
create index if not exists idx_sales_org_branch_date on public.sales(organization_id,branch_id,sale_date);

create or replace function public.is_super_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active=true and role in ('super_admin','admin'));
$$;
create or replace function public.is_branch_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active=true and role='branch_admin');
$$;
create or replace function public.current_organization_id() returns uuid language sql stable security definer set search_path=public as $$
 select organization_id from public.profiles where id=auth.uid();
$$;
create or replace function public.current_branch_id() returns uuid language sql stable security definer set search_path=public as $$
 select branch_id from public.profiles where id=auth.uid();
$$;

create or replace function public.enforce_branch_limit() returns trigger language plpgsql security definer set search_path=public as $$
declare lim integer; used integer;
begin
 if new.organization_id is null then raise exception 'organization_id is required'; end if;
 select branch_limit into lim from public.organizations where id=new.organization_id and active=true;
 if lim is null then raise exception 'Organization is missing or inactive'; end if;
 select count(*) into used from public.branches where organization_id=new.organization_id and id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid);
 if used>=lim then raise exception 'Branch limit reached'; end if;
 return new;
end; $$;
drop trigger if exists branches_limit on public.branches;
create trigger branches_limit before insert or update of organization_id on public.branches for each row execute function public.enforce_branch_limit();

create or replace function public.validate_branch_limit() returns trigger language plpgsql security definer set search_path=public as $$
declare used integer;
begin
 select count(*) into used from public.branches where organization_id=new.id;
 if new.branch_limit<used then raise exception 'Branch limit cannot be below existing branch count'; end if;
 return new;
end; $$;
drop trigger if exists organizations_limit on public.organizations;
create trigger organizations_limit before update of branch_limit on public.organizations for each row execute function public.validate_branch_limit();

alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.sales enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select using(public.is_super_admin());
drop policy if exists organizations_manage on public.organizations;
create policy organizations_manage on public.organizations for all using(public.is_super_admin()) with check(public.is_super_admin());

drop policy if exists branches_select on public.branches;
create policy branches_select on public.branches for select using(public.is_super_admin() or (organization_id=public.current_organization_id() and public.is_branch_admin() and id=public.current_branch_id()));
drop policy if exists branches_manage on public.branches;
create policy branches_manage on public.branches for all using(public.is_super_admin()) with check(public.is_super_admin());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using(id=auth.uid() or public.is_super_admin() or (public.is_branch_admin() and organization_id=public.current_organization_id() and branch_id=public.current_branch_id()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using(id=auth.uid() or public.is_super_admin() or (public.is_branch_admin() and organization_id=public.current_organization_id() and branch_id=public.current_branch_id())) with check(id=auth.uid() or public.is_super_admin() or (public.is_branch_admin() and organization_id=public.current_organization_id() and branch_id=public.current_branch_id()));

drop policy if exists admin_update on public.sales;
drop policy if exists authenticated_insert on public.sales;
drop policy if exists own_sales_select on public.sales;
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select using(
 id is not null and (public.is_super_admin() or submitted_by=auth.uid() or
 (public.is_branch_admin() and organization_id=public.current_organization_id() and branch_id=public.current_branch_id()))
);
drop policy if exists sales_insert on public.sales;
create policy sales_insert on public.sales for insert with check(
 public.is_super_admin() or
 (organization_id=public.current_organization_id() and branch_id=public.current_branch_id() and
  (submitted_by=auth.uid() or public.is_branch_admin()))
);
drop policy if exists sales_update on public.sales;
create policy sales_update on public.sales for update using(
 public.is_super_admin() or
 (public.is_branch_admin() and organization_id=public.current_organization_id() and branch_id=public.current_branch_id())
) with check(
 public.is_super_admin() or
 (public.is_branch_admin() and organization_id=public.current_organization_id() and branch_id=public.current_branch_id())
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,full_name,phone,role,active)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name','New User'),new.phone,'assistant',true)
 on conflict(id) do update set phone=excluded.phone;
 return new;
end; $$;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select public.is_super_admin();
$$;


-- Sale items are written only by the trusted create-sale function.
alter table public.sale_items enable row level security;
drop policy if exists sale_items_select on public.sale_items;
create policy sale_items_select on public.sale_items for select using(
 exists(
   select 1 from public.sales s
   where s.id=sale_items.sale_id
   and (public.is_super_admin() or s.submitted_by=auth.uid() or
        (public.is_branch_admin() and s.organization_id=public.current_organization_id() and s.branch_id=public.current_branch_id()))
 )
);
drop policy if exists sale_items_insert on public.sale_items;
drop policy if exists sale_items_update on public.sale_items;
drop policy if exists sale_items_delete on public.sale_items;

-- Only the trusted server function creates sale rows/items; clients cannot inject
-- totals or commission amounts directly.
drop policy if exists sales_direct_insert on public.sales;
drop policy if exists sales_direct_update on public.sales;
