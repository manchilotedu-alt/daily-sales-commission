-- Secure earnings workflow tables without changing commission calculations or sales/team workflows.
-- Client UI reads commission periods for the signed-in user's organization.
-- Adjustments and holds are accessed through the manage-earnings Edge Function using service_role.

alter table public.commission_periods enable row level security;
alter table public.earnings_adjustments enable row level security;
alter table public.earnings_holds enable row level security;

-- Remove broad API-role and PUBLIC table privileges. Keep postgres/service_role privileges intact.
revoke all privileges on table public.commission_periods from public, anon, authenticated;
revoke all privileges on table public.earnings_adjustments from public, anon, authenticated;
revoke all privileges on table public.earnings_holds from public, anon, authenticated;

-- The browser needs read-only access to periods within the user's organization.
grant select on table public.commission_periods to authenticated;

drop policy if exists commission_periods_select_organization on public.commission_periods;
create policy commission_periods_select_organization
  on public.commission_periods
  for select
  to authenticated
  using (organization_id = public.current_organization_id());

-- No direct browser policies are created for adjustments or holds.
-- Their reads/writes remain behind manage-earnings, which performs actor checks.
