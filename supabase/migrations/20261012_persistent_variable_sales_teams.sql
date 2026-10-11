-- Persistent variable-size sales teams and receipt references.
-- Additive only: no existing sales, assignments, splits, or allocations are deleted.
alter table public.sales
  add column if not exists receipt_reference text;

alter table public.team_assignments
  add column if not exists employee_position integer not null default 1;

create index if not exists idx_sales_receipt_reference
  on public.sales(organization_id, branch_id, receipt_reference)
  where receipt_reference is not null;

create index if not exists idx_team_assignments_effective_lookup
  on public.team_assignments(team_id, effective_from, effective_to, assignment_status);

create index if not exists idx_team_structures_effective_lookup
  on public.team_structures(team_id, effective_from, effective_to, status);

create index if not exists idx_team_split_versions_effective_lookup
  on public.team_split_versions(team_structure_id, effective_from, effective_to, status);

create index if not exists idx_team_split_lines_version_role_position
  on public.team_split_lines(team_split_version_id, role_code, employee_position);
