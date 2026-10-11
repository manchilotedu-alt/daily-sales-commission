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

  const allowed=['branch_admin']
  if(!allowed.includes(cp.role))return out({error:'This role cannot submit sales'},403)

  const body=await req.json()
  const org=cp.organization_id
  const branch=cp.branch_id||null
  if(!org||!Array.isArray(body.items)||!body.items.length)return out({error:'Sale data is incomplete'},400)
  const receiptReference=String(body.receipt_reference||'').trim()
  if(!receiptReference||receiptReference.length>120)return out({error:'Receipt/reference number is required (maximum 120 characters)'},400)
  if(!body.team_id)return out({error:'Select the sales team for this sale'},400)

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
   if(p.organization_id!==org)return out({error:'Product belongs to another organization'},403)
  }
  const {data:assignedProducts,error:assignmentError}=await admin.from('product_branch_assignments')
   .select('product_id,branch_id').eq('organization_id',org).eq('active',true).in('product_id',ids)
  if(assignmentError)throw assignmentError
  const assignedSet=new Set((assignedProducts||[]).filter((a:any)=>branch ? a.branch_id===branch : a.branch_id===null).map((a:any)=>Number(a.product_id)))
  if(ids.some(id=>!assignedSet.has(Number(id))))return out({error:'One or more products are not assigned to this branch'},403)

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

  // Resolve the roster and approved split from the selected team's effective-dated history.
  const {data:team,error:teamError}=await admin.from('teams')
   .select('id,organization_id,branch_id,status').eq('id',body.team_id).single()
  if(teamError||!team)return out({error:'Sales team was not found'},404)
  if(team.organization_id!==org||team.branch_id!==branch)return out({error:'Sales team is outside this branch'},403)
  const {data:assignmentRows,error:assignmentError}=await admin.from('team_assignments')
   .select('id,employee_id,team_role,employee_position,effective_from,effective_to,created_at')
   .eq('team_id',team.id).lte('effective_from',saleDate)
   .or(`effective_to.is.null,effective_to.gte.${saleDate}`).order('created_at',{ascending:false})
  if(assignmentError)throw assignmentError
  const latestByPosition=new Map<string,any>()
  for(const row of assignmentRows||[]){
   const key=`${row.team_role}:${Number(row.employee_position||1)}`
   if(!latestByPosition.has(key))latestByPosition.set(key,row)
  }
  const {data:structureRows,error:structureError}=await admin.from('team_structures')
   .select('id,version,status,effective_from,effective_to,team_structure_roles(role_code,required_count)')
   .eq('team_id',team.id).lte('effective_from',saleDate)
   .or(`effective_to.is.null,effective_to.gte.${saleDate}`).order('effective_from',{ascending:false}).limit(1)
  if(structureError)throw structureError
  const structure=structureRows?.[0]
  if(!structure)return out({error:'No team structure is configured for this sale date'},409)
  const roleCounts=(structure.team_structure_roles||[]).reduce((acc:any,r:any)=>({...acc,[r.role_code]:Number(r.required_count)}),{})
  const recipients:any[]=[]
  for(const role of ['lead','assistant','driver']){
   const count=Number(roleCounts[role]||0)
   for(let position=1;position<=count;position++){
    const assignment=latestByPosition.get(`${role}:${position}`)
    if(!assignment)return out({error:`Team roster is incomplete for ${role} position ${position} on ${saleDate}`},409)
    recipients.push({id:assignment.employee_id,role,position,assignment_id:assignment.id})
   }
  }
  if(recipients.filter((x:any)=>x.role==='lead').length!==1||recipients.filter((x:any)=>x.role==='driver').length!==1)
   return out({error:'The team must have one leader and one driver'},409)
  const pids=[...new Set(recipients.map((x:any)=>String(x.id)))]
  const {data:people,error:peopleError}=await admin.from('profiles').select('id,active,organization_id,branch_id').in('id',pids)
  if(peopleError)throw peopleError
  if((people||[]).length!==pids.length)return out({error:'A team member no longer exists'},409)
  for(const person of people||[]){
   if(!person.active||person.organization_id!==org||person.branch_id!==branch)
    return out({error:'A team member is inactive or outside this branch'},409)
  }
  const {data:splitRows,error:splitError}=await admin.from('team_split_versions')
   .select('id,version,status,team_structure_id,effective_from,effective_to,team_split_lines(role_code,employee_position,percentage,residual_eligible)')
   .eq('team_structure_id',structure.id).eq('status','approved').lte('effective_from',saleDate)
   .or(`effective_to.is.null,effective_to.gte.${saleDate}`).order('effective_from',{ascending:false}).limit(1)
  if(splitError)throw splitError
  const splitVersion=splitRows?.[0]||null
  if(!splitVersion)return out({error:'No approved commission split exists for this team structure and sale date'},409)
  const splitLines:any[]=splitVersion.team_split_lines||[]
  const splitSum=money(splitLines.reduce((n:number,x:any)=>n+Number(x.percentage||0),0))
  if(splitSum!==100)return out({error:'Approved team split must total 100%'},409)
  const expectedKeys=recipients.map((x:any)=>`${x.role}:${x.position}`).sort()
  const configuredKeys=splitLines.map((x:any)=>`${x.role_code}:${Number(x.employee_position)}`).sort()
  if(JSON.stringify(expectedKeys)!==JSON.stringify(configuredKeys))
   return out({error:'Approved split does not match the team structure positions'},409)

  const totalQuantity=clean.reduce((n,x)=>n+x.qty,0)
  const totalSalesValue=money(clean.reduce((n,x)=>n+x.line_amt,0))

  const allocations:any[]=[]
  let allocated=0
  for(const r of recipients){
   const line=splitLines.find((x:any)=>x.role_code===r.role&&Number(x.employee_position)===r.position)
   if(!line)continue
   const amount=money(grossCommission*Number(line.percentage)/100)
   allocations.push({employee_id:r.id,role_code:r.role,team_assignment_id:r.assignment_id,team_split_version_id:splitVersion.id,split_percentage:Number(line.percentage),allocated_commission:amount})
   allocated=money(allocated+amount)
  }
  const residual=money(grossCommission-allocated)
  if(Math.abs(residual)>0){
   const target=allocations.find((x:any)=>splitLines.find((l:any)=>l.role_code===x.role_code&&Number(l.employee_position)===Number(recipients.find((r:any)=>r.id===x.employee_id&&r.role===x.role_code)?.position))?.residual_eligible)
   if(!target)return out({error:'Commission split leaves a remainder but no residual recipient is configured'},409)
   target.allocated_commission=money(target.allocated_commission+residual)
  }

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

  const leadAmt=money(allocations.filter(x=>x.role_code==='lead').reduce((n,x)=>n+x.allocated_commission,0))
  const assistantAmt=money(allocations.filter(x=>x.role_code==='assistant').reduce((n,x)=>n+x.allocated_commission,0))
  const driverAmt=money(allocations.filter(x=>x.role_code==='driver').reduce((n,x)=>n+x.allocated_commission,0))
  const leadRecipient=recipients.find((x:any)=>x.role==='lead')
  const assistantRecipient=recipients.find((x:any)=>x.role==='assistant')
  const driverRecipient=recipients.find((x:any)=>x.role==='driver')

  const salePayload:any={
   sale_date:saleDate,lead_id:leadRecipient?.id||null,assistant_id:assistantRecipient?.id||null,driver_id:driverRecipient?.id||null,
   submitted_by:caller.id,entered_by:caller.id,team_id:team.id,lead_employee_id:leadRecipient?.id||null,
   receipt_reference:receiptReference,
   sales_source_policy_version_id:body.sales_source_policy_version_id||null,
   team_structure_version_id:structure.id,team_split_version_id:splitVersion.id,
   total:totalSalesValue,total_quantity:totalQuantity,total_sales_value:totalSalesValue,gross_commission:grossCommission,
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