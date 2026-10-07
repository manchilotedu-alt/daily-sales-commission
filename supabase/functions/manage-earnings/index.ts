import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})
const sum=(a:number,b:number)=>Math.round((a+b)*100)/100

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 try{
  const token=req.headers.get('Authorization')?.replace('Bearer ','');if(!token)return json({error:'Unauthorized'},401)
  const {data:{user},error:ue}=await supabase.auth.getUser(token);if(ue||!user)return json({error:'Unauthorized'},401)
  const {data:actor}=await supabase.from('profiles').select('*').eq('id',user.id).single();if(!actor)return json({error:'Profile not found'},403)
  const body=await req.json(),action=body.action
  const global=['super_admin','admin'].includes(actor.role),branchAdmin=actor.role==='branch_admin'
  if(action==='calculate_period'){
   if(!global&&!branchAdmin)return json({error:'Forbidden'},403)
   const periodId=body.commission_period_id
   const {data:period,error:pe}=await supabase.from('commission_periods').select('*').eq('id',periodId).eq('organization_id',actor.organization_id).single();if(pe||!period)return json({error:'Commission period not found'},404)
   await supabase.from('commission_periods').update({status:'calculating'}).eq('id',periodId)
   let sq=supabase.from('sale_commission_allocations').select('employee_id,allocated_commission,sale_id,sales:sale_id(organization_id,branch_id,status,sale_date)').eq('sales.status','approved')
   const {data:allocs,error:ae}=await sq; if(ae)throw ae
   const by:any={}
   for(const x of allocs||[]){const s=x.sales;if(!s||s.organization_id!==actor.organization_id||s.sale_date<period.period_start||s.sale_date>period.period_end)continue;if(branchAdmin&&s.branch_id!==actor.branch_id)continue;const k=x.employee_id;by[k]??={gross:0};by[k].gross=sum(by[k].gross,Number(x.allocated_commission||0))}
   for(const [employee_id,v] of Object.entries(by)){const {data:old}=await supabase.from('employee_period_earnings').select('*').eq('employee_id',employee_id).eq('commission_period_id',periodId).maybeSingle();const daily=Number(old?.daily_adjustments||0),bonus=Number(old?.bonuses||0),support=Number(old?.support_allocations||0),ded=Number(old?.deductions||0),pen=Number(old?.penalties||0),tax=Number(old?.tax||0),legal=Number(old?.legal_deductions||0),hold=Number(old?.amount_held||0);const net=Math.max(0,Number(v.gross)+daily+bonus-support-ded-pen-tax-legal-hold);const payload={employee_id,commission_period_id:periodId,gross_commission:Number(v.gross),daily_adjustments:daily,bonuses:bonus,support_allocations:support,deductions:ded,penalties:pen,tax,legal_deductions:legal,amount_held:hold,net_payable:net,status:'calculated',calculated_at:new Date().toISOString()};await supabase.from('employee_period_earnings').upsert(payload,{onConflict:'employee_id,commission_period_id'})}
   await supabase.from('commission_periods').update({status:'finance_review'}).eq('id',periodId)
   return json({ok:true,message:'Period calculated',employees:Object.keys(by).length})
  }
  if(action==='set_adjustment'){
   if(!global&&!branchAdmin)return json({error:'Forbidden'},403)
   const eId=body.employee_period_earnings_id,amount=Math.abs(Number(body.amount||0)),type=body.adjustment_type
   if(!eId||!type||!body.reason)return json({error:'employee_period_earnings_id, adjustment_type and reason are required'},400)
   const {data:e}=await supabase.from('employee_period_earnings').select('*,commission_periods:commission_period_id(organization_id)').eq('id',eId).single();if(!e||e.commission_periods.organization_id!==actor.organization_id)return json({error:'Not found'},404)
   const {data:created,error:ce}=await supabase.from('earnings_adjustments').insert({employee_period_earnings_id:eId,adjustment_type:type,amount,reason:body.reason,created_by:actor.id}).select().single();if(ce)throw ce
   const field=type==='bonus'?'bonuses':type==='support_allocation'?'support_allocations':type==='deduction'?'deductions':type==='penalty'?'penalties':type==='daily_adjustment'?'daily_adjustments':null;if(!field)return json({error:'Unsupported adjustment type'},400)
   const next=Number(e[field]||0)+(body.adjustment_type==='daily_adjustment'?Number(body.signed_amount??amount):amount);const gross=Number(e.gross_commission||0),daily=field==='daily_adjustments'?next:Number(e.daily_adjustments||0),bonus=field==='bonuses'?next:Number(e.bonuses||0),support=field==='support_allocations'?next:Number(e.support_allocations||0),ded=field==='deductions'?next:Number(e.deductions||0),pen=field==='penalties'?next:Number(e.penalties||0),tax=Number(e.tax||0),legal=Number(e.legal_deductions||0),hold=Number(e.amount_held||0);const net=Math.max(0,gross+daily+bonus-support-ded-pen-tax-legal-hold);await supabase.from('employee_period_earnings').update({[field]:next,net_payable:net}).eq('id',eId)
   return json({ok:true,adjustment:created,net_payable:net})
  }
  if(action==='place_hold'||action==='release_hold'){
   if(!global)return json({error:'Super Admin approval required'},403)
   const eId=body.employee_period_earnings_id;const {data:e}=await supabase.from('employee_period_earnings').select('*').eq('id',eId).single();if(!e)return json({error:'Earnings not found'},404)
   if(action==='place_hold'){const amount=body.full_hold?Number(e.gross_commission||0)+Number(e.daily_adjustments||0)+Number(e.bonuses||0):Number(body.amount||0);const {data:h,error:he}=await supabase.from('earnings_holds').insert({employee_period_earnings_id:eId,hold_type:body.hold_type||'operational_review',amount_held:amount,reason:body.reason,placed_by:actor.id}).select().single();if(he)throw he;await supabase.from('employee_period_earnings').update({amount_held:amount,status:'held',net_payable:Math.max(0,Number(e.net_payable||0)-amount)}).eq('id',eId);return json({ok:true,hold:h})}
   const {data:h,error:he}=await supabase.from('earnings_holds').select('*').eq('employee_period_earnings_id',eId).eq('status','active');if(he)throw he;const released=(h||[]).reduce((a,x)=>a+Number(x.amount_held||0),0);await supabase.from('earnings_holds').update({status:'released',released_by:actor.id,released_at:new Date().toISOString()}).eq('employee_period_earnings_id',eId).eq('status','active');const base=Number(e.gross_commission||0)+Number(e.daily_adjustments||0)+Number(e.bonuses||0)-Number(e.support_allocations||0)-Number(e.deductions||0)-Number(e.penalties||0)-Number(e.tax||0)-Number(e.legal_deductions||0);await supabase.from('employee_period_earnings').update({amount_held:0,status:'calculated',net_payable:Math.max(0,base)}).eq('id',eId);return json({ok:true,released})
  }
  if(action==='submit_dispute'){
   const eId=body.employee_period_earnings_id;if(!eId||!body.reason)return json({error:'Earnings ID and reason are required'},400);
   const {data:e}=await supabase.from('employee_period_earnings').select('*,commission_periods:commission_period_id(organization_id)').eq('id',eId).single();
   if(!e||e.commission_periods.organization_id!==actor.organization_id)return json({error:'Not found'},404);
   const {data:d,error:de}=await supabase.from('disputes').insert({organization_id:actor.organization_id,employee_id:e.employee_id,employee_period_earnings_id:eId,reason:body.reason,status:'open',submitted_by:actor.id}).select().single();if(de)throw de;
   await supabase.from('audit_logs').insert({organization_id:actor.organization_id,branch_id:actor.branch_id||null,actor_id:actor.id,action:'submit_dispute',entity_type:'dispute',entity_id:d.id,after_data:d,reason:body.reason});
   return json({ok:true,dispute:d});
  }
  if(action==='resolve_dispute'){
   if(!global)return json({error:'Super Admin approval required'},403);
   const id=body.dispute_id;if(!id||!body.resolution_note)return json({error:'Dispute ID and resolution note are required'},400);
   const {data:d}=await supabase.from('disputes').select('*').eq('id',id).eq('organization_id',actor.organization_id).single();if(!d)return json({error:'Dispute not found'},404);
   const next=body.resolution==='accepted'?'resolved':'rejected';
   const {data:u,error:ue}=await supabase.from('disputes').update({status:next,resolved_by:actor.id,resolved_at:new Date().toISOString(),resolution_note:body.resolution_note}).eq('id',id).select().single();if(ue)throw ue;
   if(next==='resolved'&&Number(body.correction_amount||0)!==0){const {data:corr,error:ce}=await supabase.from('corrections').insert({organization_id:actor.organization_id,dispute_id:id,employee_period_earnings_id:d.employee_period_earnings_id,amount:Number(body.correction_amount),reason:body.resolution_note,created_by:actor.id}).select().single();if(ce)throw ce;
    const {data:e}=await supabase.from('employee_period_earnings').select('*').eq('id',d.employee_period_earnings_id).single();if(e){const nextAdj=Number(e.daily_adjustments||0)+Number(body.correction_amount);const net=Math.max(0,Number(e.gross_commission||0)+nextAdj+Number(e.bonuses||0)-Number(e.support_allocations||0)-Number(e.deductions||0)-Number(e.penalties||0)-Number(e.tax||0)-Number(e.legal_deductions||0)-Number(e.amount_held||0));await supabase.from('employee_period_earnings').update({daily_adjustments:nextAdj,net_payable:net}).eq('id',e.id)}}
   await supabase.from('audit_logs').insert({organization_id:actor.organization_id,branch_id:actor.branch_id||null,actor_id:actor.id,action:'resolve_dispute',entity_type:'dispute',entity_id:id,before_data:d,after_data:u,reason:body.resolution_note});
   return json({ok:true,dispute:u});
  }
  if(action==='approve_period'){if(!global)return json({error:'Super Admin approval required'},403);const id=body.commission_period_id;await supabase.from('commission_periods').update({status:'approved'}).eq('id',id).eq('organization_id',actor.organization_id);await supabase.from('employee_period_earnings').update({status:'approved',approved_at:new Date().toISOString()}).eq('commission_period_id',id);return json({ok:true})}
  return json({error:'Unknown action'},400)
 }catch(e){return json({error:e.message||String(e)},500)}
})