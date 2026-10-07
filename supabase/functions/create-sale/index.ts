import {createClient} from 'https://esm.sh/@supabase/supabase-js@2'

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type'}
const out=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json'}})

const money=(n:number)=>Math.round((n+Number.EPSILON)*100)/100
const dateOk=(v:string)=>/^\\d{4}-\\d{2}-\\d{2}$/.test(v)

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

  const {data:cp,error:ce}=await admin.from('profiles')
   .select('id,role,active,organization_id,branch_id').eq('id',caller.id).single()
  if(ce||!cp?.active)return out({error:'Forbidden'},403)

  const allowed=['super_admin','admin','branch_admin','lead','lead_sales','assistant']
  if(!allowed.includes(cp.role))return out({error:'This role cannot submit sales'},403)

  const body=await req.json()
  const org=cp.organization_id
  const branch=cp.branch_id||null
  if(!org||!Array.isArray(body.items)||!body.items.length)return out({error:'Sale data is incomplete'},400)

  const saleDate=String(body.sale_date||'')
  if(!dateOk(saleDate))return out({error:'Invalid sale date'},400)

  // Organization controls whether backdated sales are allowed.
  const {data:settings,error:settingsError}=await admin.from('organization_settings')
   .select('sales_date_policy,backdate_days,multiple_lead_policy').eq('organization_id',org).maybeSingle()
  if(settingsError)throw settingsError
  const today=new Date().toISOString().slice(0,10)
  if(settings){
   if(settings.sales_date_policy==='same_day_only'&&saleDate!==today)
    return out({error:'This organization allows sales for today only'},409)
   if(settings.sales_date_policy==='backdate_window'){
    const diff=(Date.parse(today)-Date.parse(saleDate))/86400000
    if(diff<0||diff>Number(settings.backdate_days||0))
     return out({error:'Sale date is outside the allowed backdate window'},409)
   }
  }

  const requestedItems=body.items.map((x:any)=>({
   product_id:Number(x.product_id),
   product_variant_id:x.product_variant_id?String(x.product_variant_id):null,
   qty:Number(x.qty)
  }))
  if(requestedItems.some(x=>!Number.isInteger(x.product_id)||!Number.isInteger(x.qty)||x.qty<1||x.qty>100000))
   return out({error:'Invalid product or quantity'},400)
  const uniqueKeys=new Set(requestedItems.map(x=>`${x.product_id}:${x.product_variant_id||''}`))
  if(uniqueKeys.size!==requestedItems.length)return out({error:'Duplicate product/variant line'},400)

  const ids=[...new Set(requestedItems.map(x=>x.product_id))]
  const {data:products,error:pe}=await admin.from('products')
   .select('id,en,am,rate,organization_id,active').in('id',ids)
  if(pe)throw pe
  if(!products||products.length!==ids.length)return out({error:'One or more products were not found'},400)
  for(const p of products){
   if(p.active===false)return out({error:'One or more products are inactive'},409)
   if(p.organization_id&&p.organization_id!==org)return out({error:'Product belongs to another organization'},403)
  }

  const variants=requestedItems.filter(x=>x.product_variant_id).map(x=>x.product_variant_id)
  let variantRows:any[]=[]
  if(variants.length){
   const {data,error}=await admin.from('product_variants')
    .select('id,product_id,organization_id,active').in('id',variants)
   if(error)throw error
   variantRows=data||[]
   if(variantRows.length!==variants.length)return out({error:'One or more variants were not found'},400)
   for(const v of variantRows){
    if(v.organization_id!==org||v.active===false)return out({error:'Invalid product variant'},400)
   }
   for(const x of requestedItems){
    if(x.product_variant_id){
     const v=variantRows.find(v=>v.id===x.product_variant_id)
     if(!v||Number(v.product_id)!==x.product_id)return out({error:'Variant does not belong to product'},400)
    }
   }
  }

  // Resolve price at sale time. A variant price wins; otherwise product price version; legacy rate is final fallback.
  const clean:any[]=[]
  for(const x of requestedItems){
   const p=products.find(p=>Number(p.id)===x.product_id)
   let priceRow:any=null
   const q=admin.from('product_price_versions').select('id,price,product_id,product_variant_id')
    .eq('organization_id',org).eq('product_id',x.product_id).eq('status','active')
    .lte('effective_from',saleDate).or(`effective_to.is.null,effective_to.gte.${saleDate}`)
    .order('effective_from',{ascending:false}).limit(1)
   const {data,error}=await q
   if(error)throw error
   if(data?.length)priceRow=data[0]
   if(x.product_variant_id){
    const {data:vd,error:ve}=await admin.from('product_price_versions').select('id,price')
     .eq('organization_id',org).eq('product_id',x.product_id).eq('product_variant_id',x.product_variant_id)
     .eq('status','active').lte('effective_from',saleDate)
     .or(`effective_to.is.null,effective_to.gte.${saleDate}`)
     .order('effective_from',{ascending:false}).limit(1)
    if(ve)throw ve
    if(vd?.length)priceRow=vd[0]
   }
   const rate=Number(priceRow?.price ?? p.rate ?? 0)
   if(!Number.isFinite(rate)||rate<0)return out({error:'Invalid product price'},409)
   clean.push({product_id:x.product_id,product_variant_id:x.product_variant_id,qty:x.qty,rate,line_amt:money(x.qty*rate),price_version_id:priceRow?.id||null})
  }

  // Commission rules are independent from price. A rule may match product/variant through conditions JSON.
  const {data:rules,error:re}=await admin.from('commission_rules')
   .select('id,name,rule_type,calculation_basis,price_dependency_mode,commission_rule_versions(id,version,effective_from,effective_to,fixed_amount,percentage,tier_scope,conditions,status)')
   .eq('organization_id',org).eq('active',true)
  if(re)throw re

  const matchRule=(line:any)=>{
   const candidates:any[]=[]
   for(const r of rules||[]){
    for(const v of (r.commission_rule_versions||[])){
     if(v.status!=='active'||v.effective_from>saleDate||(v.effective_to&&v.effective_to<saleDate))continue
     const cond=v.conditions||{}
     const productMatch=cond.product_ids==null||cond.product_ids.map(Number).includes(Number(line.product_id))
     const variantMatch=cond.variant_ids==null||!line.product_variant_id||cond.variant_ids.includes(line.product_variant_id)
     if(productMatch&&variantMatch)candidates.push({r,v})
    }
   }
   candidates.sort((a,b)=>Number(b.v.version)-Number(a.v.version))
   return candidates[0]||null
  }

  let grossCommission=0
  for(const line of clean){
   const matched=matchRule(line)
   let commission=0
   if(matched){
    const {r,v}=matched
    const basis=r.calculation_basis
    const base=basis==='quantity'?line.qty:basis==='unit_price'?line.rate:line.line_amt
    if(r.rule_type==='fixed')commission=Number(v.fixed_amount||0)*(basis==='quantity'?line.qty:1)
    else if(r.rule_type==='percentage')commission=Number(base)*Number(v.percentage||0)/100
    else if(r.rule_type==='none')commission=0
    else if(r.rule_type==='tiered'){
     const tiers=Array.isArray(v.conditions?.tiers)?v.conditions.tiers:[]
     const tier=tiers.filter((t:any)=>base>=Number(t.min||0)&& (t.max==null||base<=Number(t.max))).sort((a:any,b:any)=>Number(b.min||0)-Number(a.min||0))[0]
     if(tier) commission=tier.type==='fixed'?Number(tier.amount||0)*(basis==='quantity'?line.qty:1):Number(base)*Number(tier.percentage||0)/100
    }
    line.commission_rule_version_id=v.id
   }else{
    // No configured rule means no commission, never invent a commission from product price.
    line.commission_rule_version_id=null
   }
   line.commission_amount=money(Math.max(0,commission))
   grossCommission=money(grossCommission+line.commission_amount)
  }

  // Validate and snapshot participants.
  const participants=[['lead_id',body.lead_id,'lead'],['assistant_id',body.assistant_id,'assistant'],['driver_id',body.driver_id,'driver']].filter(x=>x[1])
  const pids=[...new Set(participants.map(x=>String(x[1])))]
  let people:any[]=[]
  if(pids.length){
   const {data,error}=await admin.from('profiles').select('id,role,active,organization_id,branch_id').in('id',pids)
   if(error)throw error
   people=data||[]
   if(people.length!==pids.length)return out({error:'Invalid staff member'},400)
   for(const [field,id,role] of participants){
    const p=people.find(x=>String(x.id)===String(id))
    if(!p?.active||p.organization_id!==org||p.branch_id!==branch||!((role==='lead'&&['lead','lead_sales'].includes(p.role))||p.role===role))
     return out({error:'Invalid staff assignment'},400)
   }
  }

  if(settings?.multiple_lead_policy==='single_lead' && body.lead_id && body.second_lead_id)
   return out({error:'This organization allows only one lead per sale'},409)

  const totalQuantity=clean.reduce((n,x)=>n+x.qty,0)
  const totalSalesValue=money(clean.reduce((n,x)=>n+x.line_amt,0))

  // Prefer an approved versioned team split. Legacy split_settings is only a compatibility fallback.
  let splitVersion:any=null
  if(body.team_split_version_id){
   const {data,error}=await admin.from('team_split_versions')
    .select('id,status,version,team_structure_id').eq('id',body.team_split_version_id).single()
   if(error)throw error
   if(splitVersion?.status!=='approved')return out({error:'Team split is not approved'},409)
   splitVersion=data
  }
  let splitLines:any[]=[]
  if(splitVersion){
   const {data,error}=await admin.from('team_split_lines').select('role_code,employee_position,percentage,residual_eligible').eq('team_split_version_id',splitVersion.id)
   if(error)throw error
   splitLines=data||[]
  }else{
   const {data,error}=await admin.from('split_settings').select('lead_pct,assistant_pct,driver_pct').order('updated_at',{ascending:false}).limit(1).maybeSingle()
   if(error)throw error
   if(data){
    splitLines=[
     {role_code:'lead',employee_position:1,percentage:Number(data.lead_pct||0),residual_eligible:true},
     {role_code:'assistant',employee_position:1,percentage:Number(data.assistant_pct||0),residual_eligible:false},
     {role_code:'driver',employee_position:1,percentage:Number(data.driver_pct||0),residual_eligible:false}
    ]
   }
  }
  const splitSum=money(splitLines.reduce((n,x)=>n+Number(x.percentage||0),0))
  if(splitSum!==100)return out({error:'Approved team split must total 100%'},409)

  const recipients=[
   {id:body.lead_id,role:'lead',position:1},
   {id:body.assistant_id,role:'assistant',position:1},
   {id:body.driver_id,role:'driver',position:1}
  ].filter(x=>x.id)

  const allocations:any[]=[]
  let allocated=0
  for(const r of recipients){
   const line=splitLines.find(x=>x.role_code===r.role&&Number(x.employee_position)===r.position)
   if(!line)continue
   const amount=money(grossCommission*Number(line.percentage)/100)
   allocations.push({employee_id:r.id,role_code:r.role,team_split_version_id:splitVersion?.id||null,split_percentage:Number(line.percentage),allocated_commission:amount})
   allocated=money(allocated+amount)
  }
  const residual=money(grossCommission-allocated)
  if(Math.abs(residual)>0){
   const target=allocations.find(x=>splitLines.find(l=>l.role_code===x.role_code&&Number(l.employee_position)===1)?.residual_eligible)
   if(!target)return out({error:'Commission split leaves a remainder but no residual recipient is configured'},409)
   target.allocated_commission=money(target.allocated_commission+residual)
  }

  const leadAmt=money(allocations.find(x=>x.role_code==='lead')?.allocated_commission||0)
  const assistantAmt=money(allocations.find(x=>x.role_code==='assistant')?.allocated_commission||0)
  const driverAmt=money(allocations.find(x=>x.role_code==='driver')?.allocated_commission||0)

  const salePayload:any={
   sale_date:saleDate,lead_id:body.lead_id||null,assistant_id:body.assistant_id||null,driver_id:body.driver_id||null,
   submitted_by:caller.id,entered_by:caller.id,team_id:body.team_id||null,lead_employee_id:body.lead_id||null,
   sales_source_policy_version_id:body.sales_source_policy_version_id||null,
   team_structure_version_id:body.team_structure_version_id||null,team_split_version_id:splitVersion?.id||null,
   total,total_quantity:totalQuantity,total_sales_value:totalSalesValue,gross_commission:grossCommission,
   lead_amt:leadAmt,assistant_amt:assistantAmt,driver_amt:driverAmt,status:'pending',
   organization_id:org,branch_id:branch
  }
  const {data:sale,error:xe}=await admin.from('sales').insert(salePayload).select('id').single()
  if(xe)throw xe

  const rows=clean.map(x=>({
   sale_id:sale.id,product_id:x.product_id,product_variant_id:x.product_variant_id,
   qty:x.qty,rate:x.rate,line_amt:x.line_amt,unit_price_snapshot:x.rate,sales_value:x.line_amt,
   commission_rule_version_id:x.commission_rule_version_id,commission_amount:x.commission_amount
  }))
  const {error:ie}=await admin.from('sale_items').insert(rows)
  if(ie){await admin.from('sales').delete().eq('id',sale.id);throw ie}

  if(allocations.length){
   const allocationRows=allocations.map(x=>({...x,sale_id:sale.id}))
   const {error:ae}=await admin.from('sale_commission_allocations').insert(allocationRows)
   if(ae){await admin.from('sales').delete().eq('id',sale.id);throw ae}
  }

  return out({ok:true,sale_id:sale.id,total:totalSalesValue,total_quantity:totalQuantity,gross_commission:grossCommission})
 }catch(e){return out({error:e?.message||'Unexpected error'},500)}
})