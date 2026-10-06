import {createClient} from 'https://esm.sh/@supabase/supabase-js@2'
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type'}
const out=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json'}})
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 try{
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!key)return out({error:'Server configuration missing'},500)
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})
  const auth=req.headers.get('Authorization')||''
  if(!auth.startsWith('Bearer '))return out({error:'Unauthorized'},401)
  const {data:{user:caller}}=await admin.auth.getUser(auth.slice(7))
  if(!caller)return out({error:'Unauthorized'},401)
  const {data:cp,error:ce}=await admin.from('profiles').select('id,role,active,organization_id,branch_id').eq('id',caller.id).single()
  if(ce||!cp?.active)return out({error:'Forbidden'},403)
  const allowed=['super_admin','admin','branch_admin','lead','lead_sales','assistant']
  if(!allowed.includes(cp.role))return out({error:'This role cannot submit sales'},403)
  const body=await req.json(),org=cp.organization_id,branch=cp.branch_id
  if(!org||!branch||!Array.isArray(body.items)||!body.items.length)return out({error:'Sale data is incomplete'},400)
  const saleDate=String(body.sale_date||'')
  if(!/^\d{4}-\d{2}-\d{2}$/.test(saleDate))return out({error:'Invalid sale date'},400)
  const ids=[...new Set(body.items.map(x=>Number(x.product_id)).filter(Number.isInteger))]
  if(ids.length!==body.items.length)return out({error:'Invalid product list'},400)
  const {data:products,error:pe}=await admin.from('products').select('id,rate').in('id',ids)
  if(pe)throw pe
  if(!products||products.length!==ids.length)return out({error:'One or more products were not found'},400)
  const rates=new Map(products.map(p=>[p.id,Number(p.rate)]))
  const clean=body.items.map(x=>{const q=Number(x.qty),id=Number(x.product_id);if(!Number.isInteger(q)||q<1||q>100000)throw new Error('Invalid quantity');return {product_id:id,qty:q,rate:rates.get(id),line_amt:q*rates.get(id)}})
  const total=clean.reduce((n,x)=>n+x.line_amt,0)
  if(!Number.isFinite(total)||total<0)throw new Error('Invalid sale total')
  const participants=[['lead_id',body.lead_id,'lead'],['assistant_id',body.assistant_id,'assistant'],['driver_id',body.driver_id,'driver']].filter(x=>x[1])
  const pids=[...new Set(participants.map(x=>x[1]))]
  if(pids.length){
   const {data:people,error:ue}=await admin.from('profiles').select('id,role,active,organization_id,branch_id').in('id',pids)
   if(ue)throw ue
   if(people.length!==pids.length)return out({error:'Invalid staff member'},400)
   for(const [field,id,role] of participants){const p=people.find(x=>x.id===id);if(!p?.active||p.organization_id!==org||p.branch_id!==branch||!((role==='lead'&&['lead','lead_sales'].includes(p.role))||p.role===role))return out({error:'Invalid staff assignment'},400)}
  }
  const {data:split,error:se}=await admin.from('split_settings').select('lead_pct,assistant_pct,driver_pct').order('updated_at',{ascending:false}).limit(1).maybeSingle()
  if(se)throw se
  const leadPct=Number(split?.lead_pct||0),assistantPct=Number(split?.assistant_pct||0),driverPct=Number(split?.driver_pct||0)
  if(leadPct+assistantPct+driverPct!==100)return out({error:'Commission split must total 100%'},409)
  const leadAmt=body.lead_id?total*leadPct/100:0,assistantAmt=body.assistant_id?total*assistantPct/100:0,driverAmt=body.driver_id?total*driverPct/100:0
  const {data:sale,error:xe}=await admin.from('sales').insert({sale_date:saleDate,lead_id:body.lead_id||null,assistant_id:body.assistant_id||null,driver_id:body.driver_id||null,submitted_by:caller.id,total,lead_amt:leadAmt,assistant_amt:assistantAmt,driver_amt:driverAmt,status:'pending',organization_id:org,branch_id:branch}).select('id').single()
  if(xe)throw xe
  const rows=clean.map(x=>({...x,sale_id:sale.id}))
  const {error:ie}=await admin.from('sale_items').insert(rows)
  if(ie){await admin.from('sales').delete().eq('id',sale.id);throw ie}
  return out({ok:true,sale_id:sale.id,total})
 }catch(e){return out({error:e?.message||'Unexpected error'},500)}
})