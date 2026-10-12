-- Add parallel external-system sales capture while preserving receipt sales as the displayed sales total.
-- This migration is additive and does not convert or discard existing identifiers.

alter table public.commission_rules
  add column if not exists sales_source text not null default 'receipt_sales';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_rules_sales_source_check'
      and conrelid = 'public.commission_rules'::regclass
  ) then
    alter table public.commission_rules
      add constraint commission_rules_sales_source_check
      check (sales_source in ('receipt_sales', 'system_sales'));
  end if;
end $$;

alter table public.sales
  add column if not exists system_sales_reference text,
  add column if not exists system_sales_total numeric(14,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_system_sales_total_nonnegative'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_system_sales_total_nonnegative
      check (system_sales_total >= 0);
  end if;
end $$;

alter table public.sale_items
  add column if not exists system_sales_value numeric(14,2) not null default 0,
  add column if not exists commission_sales_source text not null default 'receipt_sales';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sale_items_system_sales_value_nonnegative'
      and conrelid = 'public.sale_items'::regclass
  ) then
    alter table public.sale_items
      add constraint sale_items_system_sales_value_nonnegative
      check (system_sales_value >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sale_items_commission_sales_source_check'
      and conrelid = 'public.sale_items'::regclass
  ) then
    alter table public.sale_items
      add constraint sale_items_commission_sales_source_check
      check (commission_sales_source in ('receipt_sales', 'system_sales'));
  end if;
end $$;
