-- Dirsha-ድርሻ Safe Upgrade Migration
-- Adds the versioned foundation without deleting or rewriting existing sales/products/splits.
-- Existing legacy columns remain usable until the backend cut-over is completed.

create extension if not exists pgcrypto;

-- Core RBAC
create table if not exists public.roles(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  active boolean not null default true,
  unique(organization_id,code)
);

create table if not exists public.permissions(
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text
);

create table if not exists public.role_permissions(
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key(role_id,permission_id)
);

-- Employee / vehicle lifecycle
create table if not exists public.employee_status_history(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  old_status text,
  new_status text not null,
  old_role text,
  new_role text,
  effective_date date not null,
  reason text,
  changed_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  vehicle_code text,
  plate_number text not null,
  vehicle_type text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_status_history(
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  old_status text,
  new_status text not null,
  effective_date date not null,
  reason text,
  changed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Team structure, assignment and split versions
create table if not exists public.teams(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  name text not null,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_structures(
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  version integer not null,
  status text not null default 'draft',
  effective_from date not null,
  effective_to date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(team_id,version)
);

create table if not exists public.team_structure_roles(
  id uuid primary key default gen_random_uuid(),
  team_structure_id uuid not null references public.team_structures(id) on delete cascade,
  role_code text not null,
  required_count integer not null default 1 check(required_count>0),
  sequence integer not null default 1
);

create table if not exists public.team_assignments(
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  team_role text not null,
  effective_from date not null,
  effective_to date,
  assignment_status text not null default 'active',
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.team_split_versions(
  id uuid primary key default gen_random_uuid(),
  team_structure_id uuid not null references public.team_structures(id) on delete cascade,
  version integer not null,
  status text not null default 'pending',
  effective_from date not null,
  effective_to date,
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  returned_reason text,
  created_at timestamptz not null default now(),
  unique(team_structure_id,version)
);

create table if not exists public.team_split_lines(
  id uuid primary key default gen_random_uuid(),
  team_split_version_id uuid not null references public.team_split_versions(id) on delete cascade,
  role_code text not null,
  employee_position integer not null default 1,
  percentage numeric(7,4) not null check(percentage>=0 and percentage<=100),
  residual_eligible boolean not null default false
);

-- Product catalogue. Variants are optional.
create table if not exists public.products(
  id bigint primary key,
  organization_id uuid references public.organizations(id) on delete restrict,
  code text,
  name text,
  description text,
  active boolean default true
);

alter table public.products add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.products add column if not exists code text;
alter table public.products add column if not exists description text;
alter table public.products add column if not exists active boolean default true;

create table if not exists public.product_variants(
  id uuid primary key default gen_random_uuid(),
  product_id bigint not null references public.products(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  variant_code text,
  variant_name text not null,
  unit text,
  active boolean not null default true
);

create table if not exists public.product_price_versions(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id bigint not null references public.products(id) on delete restrict,
  product_variant_id uuid references public.product_variants(id) on delete restrict,
  price numeric(18,2) not null check(price>=0),
  effective_from date not null,
  effective_to date,
  status text not null default 'active',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check(product_variant_id is not null or product_id is not null)
);

-- Commission is intentionally independent from price.
create table if not exists public.commission_rules(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  rule_type text not null,
  calculation_basis text not null,
  price_dependency_mode text not null default 'independent',
  active boolean not null default true
);

create table if not exists public.commission_rule_versions(
  id uuid primary key default gen_random_uuid(),
  commission_rule_id uuid not null references public.commission_rules(id) on delete cascade,
  version integer not null,
  effective_from date not null,
  effective_to date,
  fixed_amount numeric(18,4),
  percentage numeric(9,4),
  tier_scope text,
  conditions jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(commission_rule_id,version)
);

-- Sales source policy and acceptance
create table if not exists public.sales_source_policies(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true
);

create table if not exists public.sales_source_policy_versions(
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.sales_source_policies(id) on delete cascade,
  source_type text not null,
  version integer not null,
  effective_from date not null,
  effective_to date,
  agreement_required boolean not null default true,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique(policy_id,version)
);

create table if not exists public.policy_agreements(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  policy_version_id uuid not null references public.sales_source_policy_versions(id) on delete restrict,
  agreed boolean not null,
  agreed_at timestamptz not null default now(),
  ip_address inet,
  device_info text
);

-- Work schedule / rest-day control
create table if not exists public.work_schedules(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  name text not null,
  schedule_definition jsonb not null default '{}'::jsonb,
  effective_from date not null,
  effective_to date,
  status text not null default 'active'
);

create table if not exists public.daily_work_status(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  work_date date not null,
  work_status text not null,
  schedule_id uuid references public.work_schedules(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  unique(employee_id,work_date)
);

create table if not exists public.attendance_policies(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  attendance_earning_mode text not null default 'organization_policy',
  rules jsonb not null default '{}'::jsonb,
  effective_from date not null,
  effective_to date,
  status text not null default 'active'
);

create table if not exists public.attendance(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  work_date date not null,
  attendance_status text not null,
  check_in timestamptz,
  check_out timestamptz,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(employee_id,work_date)
);

-- Preserve existing sales columns. Add new snapshot fields alongside them.
alter table public.sales add column if not exists entered_by uuid references public.profiles(id);
alter table public.sales add column if not exists team_id uuid references public.teams(id);
alter table public.sales add column if not exists lead_employee_id uuid references public.profiles(id);
alter table public.sales add column if not exists sales_source_policy_version_id uuid references public.sales_source_policy_versions(id);
alter table public.sales add column if not exists team_structure_version_id uuid references public.team_structures(id);
alter table public.sales add column if not exists team_split_version_id uuid references public.team_split_versions(id);
alter table public.sales add column if not exists total_quantity numeric(18,3);
alter table public.sales add column if not exists total_sales_value numeric(18,2);
alter table public.sales add column if not exists gross_commission numeric(18,2);
alter table public.sales add column if not exists verified_by uuid references public.profiles(id);
alter table public.sales add column if not exists verified_at timestamptz;

-- Existing sale_items is retained. Add versioned snapshots without assuming old column types.
alter table public.sale_items add column if not exists product_variant_id uuid references public.product_variants(id);
alter table public.sale_items add column if not exists unit_price_snapshot numeric(18,2);
alter table public.sale_items add column if not exists sales_value numeric(18,2);
alter table public.sale_items add column if not exists commission_rule_version_id uuid references public.commission_rule_versions(id);

create table if not exists public.sale_commission_allocations(
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  role_code text not null,
  team_assignment_id uuid references public.team_assignments(id) on delete restrict,
  team_split_version_id uuid references public.team_split_versions(id) on delete restrict,
  split_percentage numeric(9,4) not null,
  allocated_commission numeric(18,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_adjustments(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  work_date date not null,
  adjustment_type text not null,
  percentage numeric(9,4),
  amount numeric(18,2),
  reason text not null,
  created_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.commission_periods(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'open',
  locked_at timestamptz,
  locked_by uuid references public.profiles(id),
  check(period_end>=period_start)
);

create table if not exists public.support_allocation_rules(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_role text not null,
  percentage numeric(9,4) not null check(percentage>=0 and percentage<=100),
  earnings_base text not null,
  effective_from date not null,
  effective_to date,
  status text not null default 'active',
  created_by uuid references public.profiles(id)
);

create table if not exists public.earnings_adjustments(
  id uuid primary key default gen_random_uuid(),
  employee_period_earnings_id uuid,
  adjustment_type text not null,
  amount numeric(18,2) not null default 0,
  percentage numeric(9,4),
  reason text not null,
  created_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.tax_rules(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  rule_type text not null,
  rule_definition jsonb not null,
  effective_from date not null,
  effective_to date,
  status text not null default 'active',
  created_by uuid references public.profiles(id)
);

create table if not exists public.employee_period_earnings(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  commission_period_id uuid not null references public.commission_periods(id) on delete restrict,
  gross_commission numeric(18,2) not null default 0,
  daily_adjustments numeric(18,2) not null default 0,
  bonuses numeric(18,2) not null default 0,
  support_allocations numeric(18,2) not null default 0,
  deductions numeric(18,2) not null default 0,
  penalties numeric(18,2) not null default 0,
  tax numeric(18,2) not null default 0,
  legal_deductions numeric(18,2) not null default 0,
  amount_held numeric(18,2) not null default 0,
  net_payable numeric(18,2) not null default 0,
  status text not null default 'calculated',
  calculated_at timestamptz,
  approved_at timestamptz,
  unique(employee_id,commission_period_id)
);

alter table public.earnings_adjustments
  drop constraint if exists earnings_adjustments_employee_period_earnings_id_fkey;
alter table public.earnings_adjustments
  add constraint earnings_adjustments_employee_period_earnings_id_fkey
  foreign key(employee_period_earnings_id) references public.employee_period_earnings(id) on delete cascade;

create table if not exists public.earnings_holds(
  id uuid primary key default gen_random_uuid(),
  employee_period_earnings_id uuid not null references public.employee_period_earnings(id) on delete cascade,
  hold_type text not null,
  amount_held numeric(18,2) not null check(amount_held>=0),
  reason text not null,
  status text not null default 'active',
  placed_by uuid references public.profiles(id),
  released_by uuid references public.profiles(id),
  placed_at timestamptz not null default now(),
  released_at timestamptz
);

create table if not exists public.payments(
  id uuid primary key default gen_random_uuid(),
  employee_period_earnings_id uuid not null references public.employee_period_earnings(id) on delete restrict,
  approved_amount numeric(18,2) not null default 0,
  paid_amount numeric(18,2) not null default 0,
  remaining_amount numeric(18,2) generated always as (greatest(approved_amount-paid_amount,0)) stored,
  payment_status text not null default 'unpaid',
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check(approved_amount>=0 and paid_amount>=0 and paid_amount<=approved_amount)
);

create table if not exists public.payment_transactions(
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  amount numeric(18,2) not null check(amount>0),
  payment_date timestamptz not null default now(),
  payment_method text not null,
  payment_reference text,
  processed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.disputes(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  related_type text,
  related_id uuid,
  reason text not null,
  status text not null default 'open',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  decision text,
  decision_at timestamptz
);

create table if not exists public.corrections(
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid references public.disputes(id) on delete restrict,
  related_type text,
  related_id uuid,
  correction_type text not null,
  amount numeric(18,2),
  before_value jsonb,
  after_value jsonb,
  reason text not null,
  created_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

-- Organization settings required for configurable sale-date governance.
create table if not exists public.organization_settings(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sales_date_policy text not null default 'same_day_only',
  backdate_days integer not null default 0 check(backdate_days>=0),
  multiple_lead_policy text not null default 'single_lead',
  disciplinary_policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id)
);

-- Helpful indexes.
create index if not exists idx_vehicle_org_branch on public.vehicles(organization_id,branch_id);
create index if not exists idx_team_org_branch on public.teams(organization_id,branch_id);
create index if not exists idx_assignment_employee_dates on public.team_assignments(employee_id,effective_from,effective_to);
create index if not exists idx_sale_alloc_sale on public.sale_commission_allocations(sale_id);
create index if not exists idx_commission_versions_dates on public.commission_rule_versions(commission_rule_id,effective_from,effective_to);
create index if not exists idx_price_versions_dates on public.product_price_versions(product_id,product_variant_id,effective_from,effective_to);
create index if not exists idx_sales_source_versions_dates on public.sales_source_policy_versions(policy_id,effective_from,effective_to);
create index if not exists idx_period_org_dates on public.commission_periods(organization_id,period_start,period_end);
create index if not exists idx_audit_org_time on public.audit_logs(organization_id,created_at);

-- Branchless organizations are supported by the final model.
alter table public.profiles alter column branch_id drop not null;
alter table public.sales alter column branch_id drop not null;

-- Tenant RLS. Server-side service-role functions remain responsible for writes.
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_status_history enable row level security;
alter table public.teams enable row level security;
alter table public.team_structures enable row level security;
alter table public.team_structure_roles enable row level security;
alter table public.team_assignments enable row level security;
alter table public.team_split_versions enable row level security;
alter table public.team_split_lines enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_price_versions enable row level security;
alter table public.commission_rules enable row level security;
alter table public.commission_rule_versions enable row level security;
alter table public.sales_source_policies enable row level security;
alter table public.sales_source_policy_versions enable row level security;
alter table public.policy_agreements enable row level security;
alter table public.work_schedules enable row level security;
alter table public.daily_work_status enable row level security;
alter table public.attendance_policies enable row level security;
alter table public.attendance enable row level security;
alter table public.sale_commission_allocations enable row level security;
alter table public.daily_adjustments enable row level security;
alter table public.commission_periods enable row level security;
alter table public.support_allocation_rules enable row level security;
alter table public.earnings_adjustments enable row level security;
alter table public.tax_rules enable row level security;
alter table public.employee_period_earnings enable row level security;
alter table public.earnings_holds enable row level security;
alter table public.payments enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.disputes enable row level security;
alter table public.corrections enable row level security;
alter table public.audit_logs enable row level security;
alter table public.organization_settings enable row level security;

-- Read policies are intentionally scoped by organization. Writes are cut over to trusted backend functions.
create policy if not exists roles_select on public.roles for select using(public.is_super_admin() or organization_id=public.current_organization_id());
create policy if not exists vehicles_select on public.vehicles for select using(public.is_super_admin() or organization_id=public.current_organization_id());
create policy if not exists teams_select on public.teams for select using(public.is_super_admin() or organization_id=public.current_organization_id());
create policy if not exists products_select on public.products for select using(public.is_super_admin() or organization_id=public.current_organization_id() or organization_id is null);
create policy if not exists product_variants_select on public.product_variants for select using(public.is_super_admin() or organization_id=public.current_organization_id());
create policy if not exists prices_select on public.product_price_versions for select using(public.is_super_admin() or organization_id=public.current_organization_id());
create policy if not exists commission_rules_select on public.commission_rules for select using(public.is_super_admin() or organization_id=public.current_organization_id());
create policy if not exists commission_versions_select on public.commission_rule_versions for select using(exists(select 1 from public.commission_rules r where r.id=commission_rule_versions.commission_rule_id and (public.is_super_admin() or r.organization_id=public.current_organization_id())));
create policy if not exists source_policies_select on public.sales_source_policies for select using(public.is_super_admin() or organization_id=public.current_organization_id());
create policy if not exists schedules_select on public.work_schedules for select using(public.is_super_admin() or organization_id=public.current_organization_id());
create policy if not exists periods_select on public.commission_periods for select using(public.is_super_admin() or organization_id=public.current_organization_id());
create policy if not exists settings_select on public.organization_settings for select using(public.is_super_admin() or organization_id=public.current_organization_id());
