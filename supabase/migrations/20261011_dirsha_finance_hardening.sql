-- Dirsha finance hardening: reconcile legacy finance tables and enforce workflow-safe fields.
create extension if not exists pgcrypto;

alter table public.disputes add column if not exists employee_period_earnings_id uuid references public.employee_period_earnings(id) on delete restrict;
alter table public.disputes add column if not exists submitted_by uuid references public.profiles(id);
alter table public.disputes add column if not exists submitted_at timestamptz not null default now();
alter table public.disputes add column if not exists resolved_by uuid references public.profiles(id);
alter table public.disputes add column if not exists resolved_at timestamptz;
alter table public.disputes add column if not exists resolution_note text;

alter table public.corrections add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.corrections add column if not exists employee_period_earnings_id uuid references public.employee_period_earnings(id) on delete restrict;
alter table public.corrections add column if not exists dispute_id uuid references public.disputes(id) on delete restrict;

-- Daily adjustments are intentionally signed; the positive/negative direction is business data.
alter table public.employee_period_earnings drop constraint if exists employee_period_earnings_amounts_nonnegative;
alter table public.employee_period_earnings add constraint employee_period_earnings_amounts_nonnegative check(gross_commission>=0 and bonuses>=0 and support_allocations>=0 and deductions>=0 and penalties>=0 and tax>=0 and legal_deductions>=0 and amount_held>=0 and net_payable>=0);

-- Payment read policies use the actual schema: payments -> employee_period_earnings -> employee.
alter table public.employee_period_earnings enable row level security;
alter table public.payments enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.disputes enable row level security;
alter table public.corrections enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists employee_period_earnings_select on public.employee_period_earnings;
create policy employee_period_earnings_select on public.employee_period_earnings for select using (
 public.is_super_admin() or employee_id=auth.uid()
 or exists(select 1 from public.profiles me join public.profiles ep on ep.id=employee_period_earnings.employee_id where me.id=auth.uid() and me.role in ('branch_admin','finance_officer','finance') and me.branch_id=ep.branch_id)
);

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select using (
 public.is_super_admin()
 or exists(select 1 from public.employee_period_earnings e where e.id=payments.employee_period_earnings_id and e.employee_id=auth.uid())
 or exists(select 1 from public.profiles me join public.employee_period_earnings e on e.id=payments.employee_period_earnings_id join public.profiles ep on ep.id=e.employee_id where me.id=auth.uid() and me.role in ('branch_admin','finance_officer','finance') and me.branch_id=ep.branch_id)
);

drop policy if exists payment_transactions_select on public.payment_transactions;
create policy payment_transactions_select on public.payment_transactions for select using (
 public.is_super_admin()
 or exists(select 1 from public.payments p join public.employee_period_earnings e on e.id=p.employee_period_earnings_id where p.id=payment_transactions.payment_id and e.employee_id=auth.uid())
 or exists(select 1 from public.profiles me join public.payments p on p.id=payment_transactions.payment_id join public.employee_period_earnings e on e.id=p.employee_period_earnings_id join public.profiles ep on ep.id=e.employee_id where me.id=auth.uid() and me.role in ('branch_admin','finance_officer','finance') and me.branch_id=ep.branch_id)
);

drop policy if exists disputes_select on public.disputes;
create policy disputes_select on public.disputes for select using (
 public.is_super_admin() or employee_id=auth.uid() or submitted_by=auth.uid()
 or exists(select 1 from public.profiles me join public.profiles ep on ep.id=disputes.employee_id where me.id=auth.uid() and me.role in ('branch_admin','finance_officer','finance') and me.branch_id=ep.branch_id)
);

drop policy if exists corrections_select on public.corrections;
create policy corrections_select on public.corrections for select using (
 public.is_super_admin() or created_by=auth.uid()
 or exists(select 1 from public.corrections c join public.employee_period_earnings e on e.id=c.employee_period_earnings_id join public.profiles me on me.id=auth.uid() join public.profiles ep on ep.id=e.employee_id where me.role in ('branch_admin','finance_officer','finance') and me.branch_id=ep.branch_id and c.id=corrections.id)
);

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select using (public.is_super_admin() or actor_id=auth.uid());

create index if not exists idx_disputes_earnings on public.disputes(employee_period_earnings_id,status);
create index if not exists idx_corrections_earnings on public.corrections(employee_period_earnings_id,created_at);
