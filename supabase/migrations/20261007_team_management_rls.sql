-- Team management read policies and safe assignment visibility
alter table public.team_assignments enable row level security;
alter table public.team_split_versions enable row level security;
alter table public.team_split_lines enable row level security;
alter table public.team_structures enable row level security;
drop policy if exists team_assignments_select on public.team_assignments;
create policy team_assignments_select on public.team_assignments for select using(
 exists(select 1 from public.teams t where t.id=team_assignments.team_id and (public.is_super_admin() or t.organization_id=public.current_organization_id()))
);
drop policy if exists team_structures_select on public.team_structures;
create policy team_structures_select on public.team_structures for select using(
 exists(select 1 from public.teams t where t.id=team_structures.team_id and (public.is_super_admin() or t.organization_id=public.current_organization_id()))
);
drop policy if exists team_split_versions_select on public.team_split_versions;
create policy team_split_versions_select on public.team_split_versions for select using(
 exists(select 1 from public.team_structures ts join public.teams t on t.id=ts.team_id where ts.id=team_split_versions.team_structure_id and (public.is_super_admin() or t.organization_id=public.current_organization_id()))
);
drop policy if exists team_split_lines_select on public.team_split_lines;
create policy team_split_lines_select on public.team_split_lines for select using(
 exists(select 1 from public.team_split_versions sv join public.team_structures ts on ts.id=sv.team_structure_id join public.teams t on t.id=ts.team_id where sv.id=team_split_lines.team_split_version_id and (public.is_super_admin() or t.organization_id=public.current_organization_id()))
);
