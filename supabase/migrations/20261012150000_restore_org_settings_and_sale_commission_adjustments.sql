-- Restore the organization settings contract used by the existing create-sale function.
-- Add append-only per-sale commission adjustment history; all writes go through a service-side function.
create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  sales_date_policy text not null default 'allow_backdate',
  backdate_days integer not null default 0 check (backdate_days >= 0),
  multiple_lead_policy text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.organization_settings enable row level security;
drop policy if exists organization_settings_select_admin on public.organization_settings;
create policy organization_settings_select_admin on public.organization_settings
for select to authenticated using (
  is_super_admin() or (is_admin() and organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid()))
);
drop policy if exists organization_settings_write_admin on public.organization_settings;
create policy organization_settings_write_admin on public.organization_settings
for all to authenticated using (
  is_super_admin() or (is_admin() and organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid()))
) with check (
  is_super_admin() or (is_admin() and organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid()))
);

create table if not exists public.sale_commission_adjustments (
  id uuid primary key default gen_random_uuid(),
  sale_id bigint not null references public.sales(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  base_commission numeric(14,2) not null check (base_commission >= 0),
  increase_percent numeric(7,3) not null default 0 check (increase_percent >= 0 and increase_percent <= 100),
  decrease_percent numeric(7,3) not null default 0 check (decrease_percent >= 0 and decrease_percent <= 100),
  increase_amount numeric(14,2) not null default 0 check (increase_amount >= 0),
  decrease_amount numeric(14,2) not null default 0 check (decrease_amount >= 0),
  override_commission numeric(14,2) check (override_commission is null or override_commission >= 0),
  adjustment_amount numeric(14,2) not null,
  final_commission numeric(14,2) not null check (final_commission >= 0),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  before_data jsonb not null,
  after_data jsonb not null
);
create index if not exists sale_commission_adjustments_sale_created_idx on public.sale_commission_adjustments(sale_id, created_at desc);
create index if not exists sale_commission_adjustments_org_created_idx on public.sale_commission_adjustments(organization_id, created_at desc);
alter table public.sale_commission_adjustments enable row level security;
drop policy if exists sale_commission_adjustments_select_admin_scope on public.sale_commission_adjustments;
create policy sale_commission_adjustments_select_admin_scope on public.sale_commission_adjustments
for select to authenticated using (
  is_super_admin()
  or (organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid())
      and (is_admin() or (is_branch_admin() and branch_id = current_branch_id())))
);
drop policy if exists sale_commission_adjustments_client_mutation_deny on public.sale_commission_adjustments;
create policy sale_commission_adjustments_client_mutation_deny on public.sale_commission_adjustments
for all to authenticated using (false) with check (false);
