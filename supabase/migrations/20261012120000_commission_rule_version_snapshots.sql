-- Preserve the exact commission policy used by each effective-dated rule version.
-- Existing versions are backfilled before the parent rule can be edited for future periods.

alter table public.commission_rule_versions
  add column if not exists rule_type text,
  add column if not exists basis text,
  add column if not exists sales_source text;

update public.commission_rule_versions v
set rule_type = coalesce(v.rule_type, r.rule_type),
    basis = coalesce(v.basis, r.basis),
    sales_source = coalesce(v.sales_source, r.sales_source)
from public.commission_rules r
where r.id = v.commission_rule_id
  and (v.rule_type is null or v.basis is null or v.sales_source is null);

-- New versions should always store all three values. Keep nullable columns for
-- compatibility with legacy records; the create-sale function falls back safely.
