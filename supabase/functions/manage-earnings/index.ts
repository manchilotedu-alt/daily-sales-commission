import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})
const n=(v:any)=>Number(v||0)
const round=(v:number)=>Math.round(v*100)/100
const netOf=(e:any,held=n(e.amount_held))=>Math.max(0,round(n(e.gross_commission)+n(e.daily_adjustments)+n(e.bonuses)-n(e.support_allocations)-n(e.deductions)-n(e.penalties)-n(e.tax)-n(e.legal_deductions)-held))

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 try{
  const token=req.headers.get('Authorization')?.replace('Bearer ','');if(!token)return json({error:'Unauthorized'},401)
  const {data:{user},error:ue}=await supabase.auth.getUser(token);if(ue||!user)return json({error:'Unauthorized'},401)
  const {data:actor}=await supabase.from('profiles').select('*').eq('id',user.id).single();if(!actor)return json({error:'Profile not found'},403)
  const body=await req.json(),action=body.action
  const global=['super_admin','admin'].includes(actor.role)
  const branchAdmin=actor.role==='branch_admin'
  const finance=['finance_officer','finance'].includes(actor.role)
  const canOperate=global||branchAdmin||finance
  const audit=async(actionName:string,type:string,id:string,before:any,after:any,reason?:string)=>{await supabase.from('audit_logs').insert({organization_id:actor.organization_id,branch_id:actor.branch_id||null,actor_id:actor.id,action:actionName,entity_type:type,entity_id:id,before_data:before||null,after_data:after||null,reason:reason||null})}
  const getPeriod=async(id:string)=>{const {data,error}=await supabase.from('commission_periods').select('*').eq('id',id).eq('organization_id',actor.organization_id).single();if(error||!data)throw new Error('Commission period not found');return data}
  const ensureUnlocked=async(period:any)=>{if(period.status==='locked')throw new Error('Commission period is locked')}

  if(action==='calculate_period'){
   if(!canOperate)return json({error:'Forbidden'},403)
   const period=await getPeriod(body.commission_period_id);await ensureUnlocked(period)
   if(!['open','finance_review','calculating'].includes(period.status))return json({error:'Period cannot be recalculated in its current status'},409)
   await supabase.from('commission_periods').update({status:'calculating'}).eq('id',period.id)
   let q=supabase.from('sale_commission_allocations').select('employee_id,allocated_commission,sale_id,sales:sale_id(organization_id,branch_id,status,sale_date)').eq('sales.status','approved')
   const {data:allocs,error:ae}=await q;if(ae)throw ae
   const by:any={}
   for(const x of allocs||[]){const s=x.sales;if(!s||s.organization_id!==actor.organization_id||s.sale_date<period.period_start||s.sale_date>period.period_end)continue;if((branchAdmin||finance)&&s.branch_id!==actor.branch_id)continue;const k=x.employee_id;by[k]??={gross:0};by[k].gross=round(by[k].gross+n(x.allocated_commission))}
   for(const [employee_id,v] of Object.entries(by)){
    const {data:old}=await supabase.from('employee_period_earnings').select('*').eq('employee_id',employee_id).eq('commission_period_id',period.id).maybeSingle()
    const payload={employee_id,commission_period_id:period.id,gross_commission:n((v as any).gross),daily_adjustments:n(old?.daily_adjustments),bonuses:n(old?.bonuses),support_allocations:n(old?.support_allocations),deductions:n(old?.deductions),penalties:n(old?.penalties),tax:n(old?.tax),legal_deductions:n(old?.legal_deductions),amount_held:n(old?.amount_held),net_payable:netOf({...old,gross_commission:n((v as any).gross)}),status:'calculated',calculated_at:new Date().toISOString()}
    if(old?.status==='paid')continue
    const {error:ee}=await supabase.from('employee_period_earnings').upsert(payload,{onConflict:'employee_id,commission_period_id'});if(ee)throw ee
   }
   await supabase.from('commission_periods').update({status:'finance_review'}).eq('id',period.id)
   await audit('calculate_period','commission_period',period.id,period,{...period,status:'finance_review'},'Finance calculation')
   return json({ok:true,message:'Period calculated',employees:Object.keys(by).length})
  }

  if(action==='set_adjustment'){
   if(!canOperate)return json({error:'Forbidden'},403)
   const eId=body.employee_period_earnings_id,amount=Math.abs(n(body.amount)),type=body.adjustment_type
   if(!eId||!type||!body.reason)return json({error:'employee_period_earnings_id, adjustment_type and reason are required'},400)
   const {data:e}=await supabase.from('employee_period_earnings').select('*,commission_periods:commission_period_id(*)').eq('id',eId).single()
   if(!e||e.commission_periods.organization_id!==actor.organization_id)return json({error:'Not found'},404)
   const period=e.commission_periods;await ensureUnlocked(period)
   if((branchAdmin||finance)&&e.employee_id!==user.id){const {data:ep}=await supabase.from('profiles').select('branch_id').eq('id',e.employee_id).single();if(!ep||ep.branch_id!==actor.branch_id)return json({error:'Outside branch scope'},403)}
   const field=type==='bonus'?'bonuses':type==='support_allocation'?'support_allocations':type==='deduction'?'deductions':type==='penalty'?'penalties':type==='daily_adjustment'?'daily_adjustments':null;if(!field)return json({error:'Unsupported adjustment type'},400)
   const signed=type==='daily_adjustment'?n(body.signed_amount??body.amount):amount
   const next=round(n(e[field])+signed)
   if(['bonuses','support_allocations','deductions','penalties'].includes(field)&&next<0)return json({error:'Adjustment cannot make this balance negative'},400)
   const {data:created,error:ce}=await supabase.from('earnings_adjustments').insert({employee_period_earnings_id:eId,adjustment_type:type,amount:Math.abs(signed),reason:body.reason,created_by:actor.id}).select().single();if(ce)throw ce
   const updated={...e,[field]:next,net_payable:netOf({...e,[field]:next})}
   const {error:up}=await supabase.from('employee_period_earnings').update({[field]:next,net_payable:updated.net_payable}).eq('id',eId);if(up)throw up
   await audit('set_adjustment','employee_period_earnings',eId,e,{[field]:next,net_payable:updated.net_payable},body.reason)
   return json({ok:true,adjustment:created,net_payable:updated.net_payable})
  }

  if(action==='place_hold'||action==='release_hold'){
   if(!global)return json({error:'Super Admin approval required'},403)
   const eId=body.employee_period_earnings_id;const {data:e}=await supabase.from('employee_period_earnings').select('*,commission_periods:commission_period_id(*)').eq('id',eId).single();if(!e)return json({error:'Earnings not found'},404);await ensureUnlocked(e.commission_periods)
   if(action==='place_hold'){
    const amount=body.full_hold?netOf(e,0):n(body.amount);if(amount<=0)return json({error:'Hold amount must be greater than zero'},400)
    const {data:h,error:he}=await supabase.from('earnings_holds').insert({employee_period_earnings_id:eId,hold_type:body.hold_type||'operational_review',amount_held:amount,reason:body.reason||'Operational review',placed_by:actor.id}).select().single();if(he)throw he
    const newHeld=round(n(e.amount_held)+amount);const {error:up}=await supabase.from('employee_period_earnings').update({amount_held:newHeld,status:'held',net_payable:netOf(e,newHeld)}).eq('id',eId);if(up)throw up
    await audit('place_hold','employee_period_earnings',eId,e,{amount_held:newHeld,net_payable:netOf(e,newHeld)},body.reason);return json({ok:true,hold:h})
   }
   const {data:h,error:he}=await supabase.from('earnings_holds').select('*').eq('employee_period_earnings_id',eId).eq('status','active');if(he)throw he
   const released=(h||[]).reduce((a,x)=>a+n(x.amount_held),0);await supabase.from('earnings_holds').update({status:'released',released_by:actor.id,released_at:new Date().toISOString()}).eq('employee_period_earnings_id',eId).eq('status','active')
   const newHeld=Math.max(0,n(e.amount_held)-released);const {error:up}=await supabase.from('employee_period_earnings').update({amount_held:newHeld,status:'calculated',net_payable:netOf(e,newHeld)}).eq('id',eId);if(up)throw up
   await audit('release_hold','employee_period_earnings',eId,e,{amount_held:newHeld,net_payable:netOf(e,newHeld)},body.reason);return json({ok:true,released})
  }

  if(action==='submit_period'){
   if(!canOperate)return json({error:'Forbidden'},403);const p=await getPeriod(body.commission_period_id);if(p.status!=='finance_review')return json({error:'Only a period in Finance Review can be submitted'},409)
   const {error}=await supabase.from('commission_periods').update({status:'submitted'}).eq('id',p.id);if(error)throw error;await audit('submit_period','commission_period',p.id,p,{...p,status:'submitted'},body.reason);return json({ok:true})
  }
  if(action==='return_period'){
   if(!global)return json({error:'Super Admin approval required'},403);const p=await getPeriod(body.commission_period_id);if(!['submitted','finance_review'].includes(p.status))return json({error:'Period cannot be returned'},409)
   const {error}=await supabase.from('commission_periods').update({status:'finance_review'}).eq('id',p.id);if(error)throw error;await audit('return_period','commission_period',p.id,p,{...p,status:'finance_review'},body.reason||'Returned for correction');return json({ok:true})
  }
  if(action==='approve_period'){
   if(!global)return json({error:'Super Admin approval required'},403);const p=await getPeriod(body.commission_period_id);if(p.status!=='submitted')return json({error:'Period must be submitted before approval'},409)
   const {error}=await supabase.from('commission_periods').update({status:'approved'}).eq('id',p.id);if(error)throw error;const {error:ee}=await supabase.from('employee_period_earnings').update({status:'approved',approved_at:new Date().toISOString()}).eq('commission_period_id',p.id);if(ee)throw ee;await audit('approve_period','commission_period',p.id,p,{...p,status:'approved'},body.reason);return json({ok:true})
  }
  if(action==='record_payment'){
   if(!global)return json({error:'Super Admin approval required'},403)
   const eId=body.employee_period_earnings_id,amount=n(body.amount);if(!eId||amount<=0)return json({error:'Valid earnings ID and payment amount are required'},400)
   const {data:e}=await supabase.from('employee_period_earnings').select('*,commission_periods:commission_period_id(*)').eq('id',eId).single();if(!e)return json({error:'Earnings not found'},404)
   if(!['approved'].includes(e.status)||!['approved'].includes(e.commission_periods.status))return json({error:'Payment requires an approved commission period'},409)
   let {data:p}=await supabase.from('payments').select('*').eq('employee_period_earnings_id',eId).maybeSingle()
   if(!p){const {data:np,error:pe}=await supabase.from('payments').insert({employee_period_earnings_id:eId,approved_amount:n(e.net_payable),paid_amount:0,payment_status:'unpaid',approved_by:actor.id}).select().single();if(pe)throw pe;p=np}
   const remaining=round(n(p.approved_amount)-n(p.paid_amount));if(amount>remaining)return json({error:'Payment exceeds remaining approved amount',remaining},400)
   const newPaid=round(n(p.paid_amount)+amount),status=newPaid>=n(p.approved_amount)?'fully_paid':'partially_paid'
   const {data:t,error:te}=await supabase.from('payment_transactions').insert({payment_id:p.id,amount,payment_method:body.payment_method||'manual',payment_reference:body.payment_reference||null,processed_by:actor.id}).select().single();if(te)throw te
   const {data:np,error:up}=await supabase.from('payments').update({paid_amount:newPaid,payment_status:status}).eq('id',p.id).select().single();if(up)throw up
   if(status==='fully_paid')await supabase.from('employee_period_earnings').update({status:'paid'}).eq('id',eId)
   await audit('record_payment','payment',p.id,p,np,body.payment_reference);return json({ok:true,payment:np,transaction:t})
  }
  if(action==='lock_period'){
   if(!global)return json({error:'Super Admin approval required'},403);const p=await getPeriod(body.commission_period_id);if(p.status!=='approved')return json({error:'Only an approved period can be locked'},409)
   const {data:es,error:ee}=await supabase.from('employee_period_earnings').select('id,status').eq('commission_period_id',p.id);if(ee)throw ee
   const unpaid=(es||[]).filter(x=>!['approved','paid'].includes(x.status));if(unpaid.length)return json({error:'Some earnings are not approved',count:unpaid.length},409)
   const {data:np,error}=await supabase.from('commission_periods').update({status:'locked',locked_at:new Date().toISOString(),locked_by:actor.id}).eq('id',p.id).select().single();if(error)throw error;await audit('lock_period','commission_period',p.id,p,np,'Period locked');return json({ok:true,period:np})
  }
  if(action==='submit_dispute'){
   const eId=body.employee_period_earnings_id;if(!eId||!body.reason)return json({error:'Earnings ID and reason are required'},400)
   const {data:e}=await supabase.from('employee_period_earnings').select('*,commission_periods:commission_period_id(*)').eq('id',eId).single();if(!e||e.commission_periods.organization_id!==actor.organization_id)return json({error:'Not found'},404)
   const {data:d,error:de}=await supabase.from('disputes').insert({organization_id:actor.organization_id,employee_id:e.employee_id,employee_period_earnings_id:eId,reason:body.reason,status:'open',submitted_by:actor.id}).select().single();if(de)throw de
   await audit('submit_dispute','dispute',d.id,null,d,body.reason);return json({ok:true,dispute:d})
  }
  if(action==='resolve_dispute'){
   if(!global)return json({error:'Super Admin approval required'},403);const id=body.dispute_id;if(!id||!body.resolution_note)return json({error:'Dispute ID and resolution note are required'},400)
   const {data:d}=await supabase.from('disputes').select('*').eq('id',id).eq('organization_id',actor.organization_id).single();if(!d)return json({error:'Dispute not found'},404);if(d.status!=='open')return json({error:'Dispute is already closed'},409)
   const next=body.resolution==='accepted'?'resolved':'rejected';const {data:u,error:ue}=await supabase.from('disputes').update({status:next,resolved_by:actor.id,resolved_at:new Date().toISOString(),resolution_note:body.resolution_note}).eq('id',id).select().single();if(ue)throw ue
   if(next==='resolved'&&n(body.correction_amount)!==0){const amount=n(body.correction_amount);const {data:e}=await supabase.from('employee_period_earnings').select('*').eq('id',d.employee_period_earnings_id).single();if(!e)throw new Error('Linked earnings not found');const {data:corr,error:ce}=await supabase.from('corrections').insert({organization_id:actor.organization_id,dispute_id:id,employee_period_earnings_id:e.id,amount,reason:body.resolution_note,created_by:actor.id}).select().single();if(ce)throw ce;const nextAdj=round(n(e.daily_adjustments)+amount);const newNet=netOf({...e,daily_adjustments:nextAdj});const {error:up}=await supabase.from('employee_period_earnings').update({daily_adjustments:nextAdj,net_payable:newNet}).eq('id',e.id);if(up)throw up;await audit('create_correction','correction',corr.id,e,{daily_adjustments:nextAdj,net_payable:newNet},body.resolution_note)}
   await audit('resolve_dispute','dispute',id,d,u,body.resolution_note);return json({ok:true,dispute:u})
  }
  return json({error:'Unknown action'},400)
 }catch(e){return json({error:e?.message||String(e)},500)}
})