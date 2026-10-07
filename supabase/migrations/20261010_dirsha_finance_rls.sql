-- Dirsha finance read policies
drop policy if exists employee_period_earnings_select on public.employee_period_earnings;
create policy employee_period_earnings_select on public.employee_period_earnings for select using (
 public.is_super_admin()
 or employee_id=auth.uid()
 or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='branch_admin' and p.branch_id=(select branch_id from public.profiles ep where ep.id=employee_period_earnings.employee_id))
);
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select using (
 public.is_super_admin()
 or employee_id=auth.uid()
 or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='branch_admin' and p.branch_id=(select branch_id from public.profiles ep where ep.id=payments.employee_id))
);
drop policy if exists disputes_select on public.disputes;
create policy disputes_select on public.disputes for select using (
 public.is_super_admin() or submitted_by=auth.uid() or employee_id=auth.uid()
 or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='branch_admin' and p.branch_id=(select branch_id from public.profiles ep where ep.id=disputes.employee_id))
);
drop policy if exists corrections_select on public.corrections;
create policy corrections_select on public.corrections for select using (
 public.is_super_admin() or created_by=auth.uid()
 or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='branch_admin' and p.branch_id=(select branch_id from public.profiles ep where ep.id=corrections.created_by))
);
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select using (
 public.is_super_admin() or actor_id=auth.uid()
);
