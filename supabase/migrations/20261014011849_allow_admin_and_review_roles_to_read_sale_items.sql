drop policy if exists sale_items_select on public.sale_items;

create policy sale_items_select
on public.sale_items
for select
to authenticated
using (
  exists (
    select 1
    from public.sales s
    where s.id = sale_items.sale_id
      and (
        (select public.is_super_admin())
        or (select public.is_admin())
        or s.submitted_by = (select auth.uid())
        or (
          (select public.is_branch_admin())
          and s.organization_id = (select public.current_organization_id())
          and s.branch_id = (select public.current_branch_id())
        )
        or (
          s.organization_id = (select public.current_organization_id())
          and (
            (select private.has_management_permission('sales.review'))
            or (select private.has_management_permission('commission.view'))
            or (select private.has_management_permission('earnings.view'))
            or (select private.has_management_permission('performance.view'))
            or (select private.has_management_permission('reports.export'))
          )
        )
      )
  )
);
