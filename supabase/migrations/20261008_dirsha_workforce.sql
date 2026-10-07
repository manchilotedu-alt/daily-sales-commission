-- Dirsha-ድርሻ workforce status and attendance hardening
alter table public.profiles add column if not exists employee_status text not null default 'active';
alter table public.profiles add column if not exists status_effective_date date not null default current_date;
create index if not exists idx_profiles_org_branch_status on public.profiles(organization_id,branch_id,employee_status);
create index if not exists idx_daily_work_employee_date on public.daily_work_status(employee_id,work_date);
create index if not exists idx_attendance_employee_date on public.attendance(employee_id,work_date);

alter table public.employee_status_history enable row level security;
alter table public.daily_work_status enable row level security;
alter table public.attendance_policies enable row level security;
alter table public.attendance enable row level security;
alter table public.work_schedules enable row level security;

drop policy if exists employee_status_history_select on public.employee_status_history;
create policy employee_status_history_select on public.employee_status_history for select using(
 public.is_super_admin() or exists(select 1 from public.profiles p where p.id=employee_status_history.employee_id and p.organization_id=public.current_organization_id() and public.is_branch_admin() and p.branch_id=public.current_branch_id())
);
drop policy if exists daily_work_status_select on public.daily_work_status;
create policy daily_work_status_select on public.daily_work_status for select using(
 public.is_super_admin() or employee_id=auth.uid() or exists(select 1 from public.profiles p where p.id=daily_work_status.employee_id and p.organization_id=public.current_organization_id() and public.is_branch_admin() and p.branch_id=public.current_branch_id())
);
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance for select using(
 public.is_super_admin() or employee_id=auth.uid() or exists(select 1 from public.profiles p where p.id=attendance.employee_id and p.organization_id=public.current_organization_id() and public.is_branch_admin() and p.branch_id=public.current_branch_id())
);
drop policy if exists work_schedules_select on public.work_schedules;
create policy work_schedules_select on public.work_schedules for select using(public.is_super_admin() or organization_id=public.current_organization_id());
drop policy if exists attendance_policies_select on public.attendance_policies;
create policy attendance_policies_select on public.attendance_policies for select using(public.is_super_admin() or organization_id=public.current_organization_id());

-- Writes are performed only by the trusted workforce Edge Function.
drop policy if exists employee_status_history_insert on public.employee_status_history;
drop policy if exists daily_work_status_insert on public.daily_work_status;
drop policy if exists attendance_insert on public.attendance;
drop policy if exists attendance_update on public.attendance;