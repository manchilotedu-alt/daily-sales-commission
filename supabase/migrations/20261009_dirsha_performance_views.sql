-- Dirsha-ድርሻ performance reporting foundation
create or replace view public.performance_sales_daily as
select s.organization_id,s.branch_id,s.sale_date::date as performance_date,
       count(distinct s.id) as sale_count,
       coalesce(sum(si.qty),0) as total_quantity,
       coalesce(sum(si.sales_value),0) as total_sales_value,
       coalesce(sum(si.commission_amount),0) as total_commission
from public.sales s
join public.sale_items si on si.sale_id=s.id
where coalesce(s.status,'pending') in ('approved','verified')
group by s.organization_id,s.branch_id,s.sale_date::date;

create or replace view public.performance_product_daily as
select s.organization_id,s.branch_id,s.sale_date::date as performance_date,
       si.product_id,si.product_variant_id,
       coalesce(sum(si.qty),0) as total_quantity,
       coalesce(sum(si.sales_value),0) as total_sales_value,
       coalesce(sum(si.commission_amount),0) as total_commission
from public.sales s
join public.sale_items si on si.sale_id=s.id
where coalesce(s.status,'pending') in ('approved','verified')
group by s.organization_id,s.branch_id,s.sale_date::date,si.product_id,si.product_variant_id;
