import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 try{
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!key)return reply({error:'Server configuration missing'},500)
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})
  const authorization=req.headers.get('Authorization')||''
  if(!authorization.startsWith('Bearer '))return reply({error:'Unauthorized'},401)
  const {data:authData,error:authError}=await admin.auth.getUser(authorization.slice(7))
  if(authError||!authData.user)return reply({error:'Unauthorized'},401)

  const {data:caller,error:callerError}=await admin.from('profiles')
   .select('id,role,active,organization_id,branch_id').eq('id',authData.user.id).single()
  if(callerError||!caller?.active)return reply({error:'Forbidden'},403)
  if(!['super_admin','admin','branch_admin'].includes(caller.role))return reply({error:'This role cannot review sales'},403)

  const body=await req.json()
  const saleId=String(body.sale_id||'').trim()
  const action=String(body.action||'')
  const reason=String(body.reason||'').trim()
  if(!/^[0-9a-f-]{36}$/i.test(saleId))return reply({error:'Invalid sale id'},400)
  if(!['verify','reject'].includes(action))return reply({error:'Invalid review action'},400)
  if(action==='reject'&&!reason)return reply({error:'Rejection reason is required'},400)

  const {data:sale,error:saleError}=await admin.from('sales')
   .select('id,organization_id,branch_id,status,total_sales_value,gross_commission,team_split_version_id,sales_source_policy_version_id,submitted_by')
   .eq('id',saleId).single()
  if(saleError||!sale)return reply({error:'Sale not found'},404)

  const global=['super_admin','admin'].includes(caller.role)
  if(!global&&(sale.organization_id!==caller.organization_id||sale.branch_id!==caller.branch_id))
   return reply({error:'Sale is outside your branch'},403)
  if(sale.status!=='pending')return reply({error:'Only pending sales can be reviewed'},409)

  if(action==='verify'){
   const {data:items,error:itemError}=await admin.from('sale_items')
    .select('qty,unit_price_snapshot,sales_value,commission_amount,commission_rule_version_id').eq('sale_id',saleId)
   if(itemError)throw itemError
   if(!items?.length)return reply({error:'Cannot verify a sale without sale items'},409)
   const calcSales=items.reduce((n,x)=>n+Number(x.sales_value??Number(x.unit_price_snapshot||0)*Number(x.qty||0),0),0)
   const calcCommission=items.reduce((n,x)=>n+Number(x.commission_amount||0),0)
   if(Math.abs(calcSales-Number(sale.total_sales_value||0))>0.01||Math.abs(calcCommission-Number(sale.gross_commission||0))>0.01)
    return reply({error:'Sale totals do not match its item snapshots. Review or correct the sale before approval.'},409)
   const {data:alloc,error:allocError}=await admin.from('sale_commission_allocations').select('split_percentage,allocated_commission').eq('sale_id',saleId)
   if(allocError)throw allocError
   if(!alloc?.length&&Number(sale.gross_commission||0)>0)return reply({error:'Commission allocation is missing'},409)
   const allocationTotal=(alloc||[]).reduce((n,x)=>n+Number(x.allocated_commission||0),0)
   if(Math.abs(allocationTotal-Number(sale.gross_commission||0))>0.01)return reply({error:'Commission allocation does not match gross commission'},409)
  }

  const before={status:sale.status,reject_reason:null,verified_by:null,verified_at:null}
  const update=action==='verify'
   ?{status:'verified',verified_by:caller.id,verified_at:new Date().toISOString(),reject_reason:null}
   :{status:'rejected',verified_by:caller.id,verified_at:new Date().toISOString(),reject_reason:reason}
  const {data:updated,error:updateError}=await admin.from('sales').update(update).eq('id',saleId).eq('status','pending')
   .select('id,status,verified_by,verified_at,reject_reason').maybeSingle()
  if(updateError)throw updateError
  if(!updated)return reply({error:'Sale was already reviewed'},409)

  const {error:auditError}=await admin.from('audit_logs').insert({
   organization_id:sale.organization_id,branch_id:sale.branch_id,actor_id:caller.id,
   action:action==='verify'?'sale_verified':'sale_rejected',entity_type:'sale',entity_id:saleId,
   before_data:before,after_data:updated,reason:reason||null
  })
  if(auditError)throw auditError

  return reply({ok:true,sale:updated})
 }catch(error){return reply({error:error instanceof Error?error.message:'Unexpected error'},500)}
})
