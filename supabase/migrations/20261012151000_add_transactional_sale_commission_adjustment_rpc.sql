create or replace function public.apply_sale_commission_adjustment(
  p_sale_id bigint,
  p_actor_id uuid,
  p_increase_percent numeric default 0,
  p_decrease_percent numeric default 0,
  p_increase_amount numeric default 0,
  p_decrease_amount numeric default 0,
  p_override_commission numeric default null,
  p_reason text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_sale public.sales%rowtype;
  v_base numeric(14,2);
  v_final numeric(14,2);
  v_adjustment numeric(14,2);
  v_alloc_sum numeric(14,2);
  v_item_sum numeric(14,2);
  v_alloc_weight numeric;
  v_item_weight numeric;
  v_count integer;
  v_i integer;
  v_running numeric(14,2);
  v_new_amount numeric(14,2);
  v_before jsonb;
  v_after jsonb;
  v_adjustment_id uuid;
  v_row record;
begin
  select * into v_actor from public.profiles where id = p_actor_id and active = true;
  if not found or v_actor.role not in ('super_admin','admin','branch_admin') then
    raise exception 'This role cannot adjust sale commission';
  end if;
  if p_sale_id is null or p_sale_id <= 0 then raise exception 'Invalid sale ID'; end if;
  if coalesce(length(trim(p_reason)),0) = 0 then raise exception 'Adjustment reason is required'; end if;
  if coalesce(p_increase_percent,0) < 0 or coalesce(p_increase_percent,0) > 100
    or coalesce(p_decrease_percent,0) < 0 or coalesce(p_decrease_percent,0) > 100
    or coalesce(p_increase_amount,0) < 0 or coalesce(p_decrease_amount,0) < 0
    or (p_override_commission is not null and p_override_commission < 0) then
    raise exception 'Adjustment values are invalid';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if v_sale.status <> 'approved' then raise exception 'Only approved sales can be adjusted'; end if;
  if v_actor.role <> 'super_admin' and v_sale.organization_id <> v_actor.organization_id then
    raise exception 'Sale is outside your organization';
  end if;
  if v_actor.role = 'branch_admin' and v_sale.branch_id <> v_actor.branch_id then
    raise exception 'Sale is outside your branch';
  end if;

  if exists (
    select 1 from public.commission_periods cp
    where cp.organization_id = v_sale.organization_id
      and v_sale.sale_date between cp.period_start and cp.period_end
      and cp.status in ('calculating','finance_review','submitted','approved','locked')
  ) then
    raise exception 'The commission period is already being calculated or under finance review/submitted/approved/locked; reopen it before adjusting this sale';
  end if;

  v_base := round(coalesce(v_sale.gross_commission,0),2);
  if p_override_commission is not null then
    v_final := round(p_override_commission,2);
  else
    v_final := round(v_base + v_base * (coalesce(p_increase_percent,0)-coalesce(p_decrease_percent,0))/100
      + coalesce(p_increase_amount,0)-coalesce(p_decrease_amount,0),2);
  end if;
  if v_final < 0 then raise exception 'The adjustment would make commission negative'; end if;
  v_adjustment := round(v_final-v_base,2);

  select round(coalesce(sum(allocated_commission),0),2), count(*)
    into v_alloc_sum, v_count
    from public.sale_commission_allocations where sale_id = p_sale_id;
  if v_count = 0 and v_final > 0 then raise exception 'Commission allocation is missing'; end if;
  if abs(coalesce(v_alloc_sum,0)-v_base) > 0.01 then raise exception 'Allocation total does not match the current commission'; end if;

  select round(coalesce(sum(commission_amount),0),2), count(*)
    into v_item_sum, v_count from public.sale_items where sale_id = p_sale_id;
  if v_count = 0 then raise exception 'Sale items are missing'; end if;
  if abs(coalesce(v_item_sum,0)-v_base) > 0.01 then raise exception 'Sale item commission total does not match the current commission'; end if;

  v_before := jsonb_build_object('gross_commission',v_base,'lead_amt',v_sale.lead_amt,'assistant_amt',v_sale.assistant_amt,'driver_amt',v_sale.driver_amt);
  v_running := 0;
  select count(*) into v_count from public.sale_commission_allocations where sale_id = p_sale_id;
  select coalesce(sum(case when v_base > 0 then allocated_commission else split_percentage end),0)
    into v_alloc_weight from public.sale_commission_allocations where sale_id = p_sale_id;
  v_i := 0;
  for v_row in select id, allocated_commission, split_percentage from public.sale_commission_allocations where sale_id = p_sale_id order by id loop
    v_i := v_i + 1;
    if v_i = v_count then
      v_new_amount := round(v_final-v_running,2);
    elsif v_alloc_weight > 0 then
      v_new_amount := round(v_final * (case when v_base > 0 then v_row.allocated_commission else v_row.split_percentage end) / v_alloc_weight,2);
      v_running := v_running + v_new_amount;
    else
      v_new_amount := 0;
    end if;
    update public.sale_commission_allocations set allocated_commission = v_new_amount where id = v_row.id;
  end loop;

  v_running := 0;
  select count(*) into v_count from public.sale_items where sale_id = p_sale_id;
  select coalesce(sum(case when v_base > 0 then commission_amount else coalesce(sales_value,line_amt,0) end),0)
    into v_item_weight from public.sale_items where sale_id = p_sale_id;
  v_i := 0;
  for v_row in select id, commission_amount, sales_value, line_amt from public.sale_items where sale_id = p_sale_id order by id loop
    v_i := v_i + 1;
    if v_i = v_count then
      v_new_amount := round(v_final-v_running,2);
    elsif v_item_weight > 0 then
      v_new_amount := round(v_final * (case when v_base > 0 then v_row.commission_amount else coalesce(v_row.sales_value,v_row.line_amt,0) end) / v_item_weight,2);
      v_running := v_running + v_new_amount;
    else
      v_new_amount := 0;
    end if;
    update public.sale_items set commission_amount = v_new_amount where id = v_row.id;
  end loop;

  update public.sales set
    gross_commission = v_final,
    lead_amt = (select round(coalesce(sum(allocated_commission),0),2) from public.sale_commission_allocations where sale_id=p_sale_id and role_code='lead'),
    assistant_amt = (select round(coalesce(sum(allocated_commission),0),2) from public.sale_commission_allocations where sale_id=p_sale_id and role_code='assistant'),
    driver_amt = (select round(coalesce(sum(allocated_commission),0),2) from public.sale_commission_allocations where sale_id=p_sale_id and role_code='driver')
  where id = p_sale_id;

  v_after := jsonb_build_object('gross_commission',v_final,'adjustment_amount',v_adjustment,
    'lead_amt',(select round(coalesce(sum(allocated_commission),0),2) from public.sale_commission_allocations where sale_id=p_sale_id and role_code='lead'),
    'assistant_amt',(select round(coalesce(sum(allocated_commission),0),2) from public.sale_commission_allocations where sale_id=p_sale_id and role_code='assistant'),
    'driver_amt',(select round(coalesce(sum(allocated_commission),0),2) from public.sale_commission_allocations where sale_id=p_sale_id and role_code='driver'));

  insert into public.sale_commission_adjustments(
    sale_id,organization_id,branch_id,base_commission,increase_percent,decrease_percent,increase_amount,decrease_amount,
    override_commission,adjustment_amount,final_commission,reason,created_by,before_data,after_data
  ) values (
    p_sale_id,v_sale.organization_id,v_sale.branch_id,v_base,coalesce(p_increase_percent,0),coalesce(p_decrease_percent,0),
    coalesce(p_increase_amount,0),coalesce(p_decrease_amount,0),p_override_commission,v_adjustment,v_final,
    trim(p_reason),p_actor_id,v_before,v_after
  ) returning id into v_adjustment_id;

  insert into public.audit_logs(organization_id,branch_id,actor_id,action,entity_type,entity_id,before_data,after_data,reason)
  values (v_sale.organization_id,v_sale.branch_id,p_actor_id,'sale_commission_adjusted','sale_commission_adjustment',v_adjustment_id,v_before,v_after,trim(p_reason));

  return jsonb_build_object('ok',true,'adjustment_id',v_adjustment_id,'base_commission',v_base,'adjustment_amount',v_adjustment,'final_commission',v_final);
end;
$$;
revoke all on function public.apply_sale_commission_adjustment(bigint,uuid,numeric,numeric,numeric,numeric,numeric,text) from public, anon, authenticated;
grant execute on function public.apply_sale_commission_adjustment(bigint,uuid,numeric,numeric,numeric,numeric,numeric,text) to service_role;
