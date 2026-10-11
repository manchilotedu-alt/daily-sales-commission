-- Additive vehicle registry foundation for driver registration.
-- Existing sales, commission, team, and user records are not rewritten.

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  plate_number text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vehicles_org_branch on public.vehicles(organization_id, branch_id);
create index if not exists idx_vehicles_plate_number on public.vehicles(plate_number);

alter table public.profiles add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;
create index if not exists idx_profiles_vehicle_id on public.profiles(vehicle_id);

alter table public.vehicles enable row level security;
drop policy if exists vehicles_select_scoped on public.vehicles;
create policy vehicles_select_scoped on public.vehicles for select to authenticated using (
  public.is_super_admin() or (
    public.is_branch_admin() and organization_id = public.current_organization_id() and branch_id = public.current_branch_id()
  )
);
grant select on public.vehicles to authenticated;