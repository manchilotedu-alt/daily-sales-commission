-- Dirsha finance dispute, correction and audit foundation
create table if not exists public.disputes (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 employee_id uuid not null references public.profiles(id),
 employee_period_earnings_id uuid references public.employee_period_earnings(id),
 reason text not null,
 status text not null default 'open',
 submitted_by uuid not null references public.profiles(id),
 submitted_at timestamptz not null default now(),
 resolved_by uuid references public.profiles(id),
 resolved_at timestamptz,
 resolution_note text
);
create table if not exists public.corrections (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 dispute_id uuid references public.disputes(id),
 employee_period_earnings_id uuid references public.employee_period_earnings(id),
 amount numeric not null default 0,
 reason text not null,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid references public.organizations(id),
 branch_id uuid references public.branches(id),
 actor_id uuid references public.profiles(id),
 action text not null,
 entity_type text not null,
 entity_id uuid,
 before_data jsonb,
 after_data jsonb,
 reason text,
 created_at timestamptz not null default now()
);
create index if not exists disputes_org_idx on public.disputes(organization_id,status);
create index if not exists corrections_org_idx on public.corrections(organization_id,created_at);
create index if not exists audit_logs_org_idx on public.audit_logs(organization_id,created_at desc);

-- Payment and dispute/audit read access for branch-scoped finance screens
drop policy if exists payment_transactions_select on public.payment_transactions;
create policy payment_transactions_select on public.payment_transactions for select using (
 public.is_super_admin() or exists(select 1 from public.payments p where p.id=payment_transactions.payment_id and (p.employee_id=auth.uid() or exists(select 1 from public.profiles me join public.profiles ep on ep.id=p.employee_id where me.id=auth.uid() and me.role='branch_admin' and me.branch_id=ep.branch_id)))
);
