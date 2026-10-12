import {createClient} from 'https://esm.sh/@supabase/supabase-js@2'

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type'}
const out=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json'}})

const money=(n:number)=>Math.round((n+Number.EPSILON)*100)/100
const dateOk=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)

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
  const systemSalesReference=String(body.system_sales_reference||'').trim()
  if(!systemSalesReference||systemSalesReference.length>120)return out({error:'External system sales reference is required (maximum 120 characters)'},400)
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
   qty:Number(x.qty),
   system_sales_value:Number(x.system_sales_value)
  }))
  if(requestedItems.some(x=>!Number.isInteger(x.product_id)||!Number.isInteger(x.qty)||x.qty<1||x.qty>100000||!Number.isFinite(x.system_sales_value)||x.system_sales_value<0))
   return out({error:'Invalid product or quantity'},400)
  const uniqueKeys=new Set(requestedItems.map(x=>`${x.product_id}:${x.product_variant_id||''}`))
  if(uniqueKeys.size!==requestedItems.length)return out({error:'Duplicate product/variant line'},400)

  const ids=[...new Set(requestedItems.map(x=>x.product_id))]
  // Chunk large ID lists to keep database request URLs manageable.
  const chunks=<T>(values:T[],size=100):T[][]=>{
   const result:T[][]=[]
   for(let i=0;i<values.length;i+=size)result.push(values.slice(i,i+size))
   return result
  }
  const products:any[]=[]
  for(const group of chunks(ids)){
   const {data,error}=await admin.from('products')
    .select('id,en,am,rate,organization_id,active').in('id',group)
   if(error)throw error
   products.push(...(data||[]))
  }
  if(products.length!==ids.length)return out({error:'One or more products were not found'},400)
  for(const p of products){
   if(p.active===false)return out({error:'One or more products are inactive'},409)
   if(p.organization_id!==org)return out({error:'Product belongs to another organization'},403)
  }
  const assignedProducts:any[]=[]
  for(const group of chunks(ids)){
   const {data,error}=await admin.from('product_branch_assignments')
    .select('product_id,branch_id').eq('organization_id',org).eq('active',true).in('product_id',group)
   if(error)throw error
   assignedProducts.push(...(data||[]))
  }
  const assignedSet=new Set(assignedProducts.filter((a:any)=>branch ? a.branch_id===branch : a.branch_id===null).map((a:any)=>Number(a.product_id)))
  if(ids.some(id=>!assignedSet.has(Number(id))))return out({error:'One or more products are not assigned to this branch'},403)

  const variants=requestedItems.filter(x=>x.product_variant_id).map(x=>x.product_variant_id)
  let variantRows:any[]=[]
  if(variants.length){
   for(const group of chunks([...new Set(variants)])){
    const {data,error}=await admin.from('product_variants')
     .select('id,product_id,organization_id,active').in('id',group)
    if(error)throw error
    variantRows.push(...(data||[]))
   }
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

  // Resolve prices in batches so large sales do not issue one database request per item.
  const basePriceRows:any[]=[]
  for(const group of chunks(ids)){
   const {data,error}=await admin.from('product_price_versions')
    .select('id,price,product_id,product_variant_id,variant_id,effective_from')
    .eq('organization_id',org).in('product_id',group).is('product_variant_id',null).is('variant_id',null)
    .eq('status','active').lte('effective_from',saleDate)
    .or(`effective_to.is.null,effective_to.gte.${saleDate}`)
    .order('effective_from',{ascending:false})
   if(error)throw error
   basePriceRows.push(...(data||[]))
  }
  const variantIds=[...new Set(requestedItems.filter(x=>x.product_variant_id).map(x=>x.product_variant_id as string))]
  const variantPriceRows:any[]=[]
  for(const group of chunks(variantIds)){
   const {data,error}=await admin.from('product_price_versions')
    .select('id,price,product_id,product_variant_id,effective_from')
    .eq('organization_id',org).in('product_variant_id',group).eq('status','active')
    .lte('effective_from',saleDate)
    .or(`effective_to.is.null,effective_to.gte.${saleDate}`)
    .order('effective_from',{ascending:false})
   if(error)throw error
   variantPriceRows.push(...(data||[]))
  }
  const latestByKey=(rows:any[],keyOf:(row:any)=>string)=>{
   const map=new Map<string,any>()
   for(const row of rows){
    const key=keyOf(row),existing=map.get(key)
    if(!existing||String(row.effective_from)>String(existing.effective_from))map.set(key,row)
   }
   return map
  }
  const basePriceByProduct=latestByKey(basePriceRows,(r:any)=>String(r.product_id))
  const variantPriceById=latestByKey(variantPriceRows,(r:any)=>String(r.product_variant_id))
  const clean:any[]=[]
  for(const x of requestedItems){
   const p=products.find(p=>Number(p.id)===x.product_id)
   const priceRow=(x.product_variant_id?variantPriceById.get(String(x.product_variant_id)):null)
    ||basePriceByProduct.get(String(x.product_id))
    ||null
   const rate=Number(priceRow?.price ?? p.rate ?? 0)
   if(!Number.isFinite(rate)||rate<0)return out({error:'Invalid product price'},409)
   clean.push({product_id:x.product_id,product_variant_id:x.product_variant_id,qty:x.qty,rate,line_amt:money(x.qty*rate),system_sales_value:money(x.system_sales_value),price_version_id:priceRow?.id||null})
  }

  // Commission rules are independent from price. A rule may match product/variant through conditions JSON.
  const {data:rules,error:re}=await admin.from('commission_rules')
   .select('id,name,rule_type,basis,price_dependency,sales_source,product_id,product_variant_id,branch_id,priority,status,commission_rule_versions(id,version,effective_from,effective_to,fixed_amount,rate_percent,status,rule_type,basis,sales_source,commission_rule_tiers(id,min_value,max_value,rate_percent,fixed_amount,tier_order))')
   .eq('organization_id',org).eq('active',true)
  if(re)throw re

  const matchRule=(line:any)=>{
   const candidates:any[]=[]
   for(const r of rules||[]){
    if(r.status!=='active')continue
    if(r.branch_id && r.branch_id!==branch)continue
    if(r.product_id!=null && Number(r.product_id)!==Number(line.product_id))continue
    if(r.product_variant_id!=null && String(r.product_variant_id)!==String(line.product_variant_id||''))continue
    for(const v of (r.commission_rule_versions||[])){
     if(!['active','approved','expired'].includes(v.status)||String(v.effective_from).slice(0,10)>saleDate||(v.effective_to&&String(v.effective_to).slice(0,10)<saleDate))continue
     candidates.push({r,v})
    }
   }
   candidates.sort((a,b)=>Number(b.r.product_variant_id!=null)-Number(a.r.product_variant_id!=null)||Number(b.r.product_id!=null)-Number(a.r.product_id!=null)||Number(a.r.priority||100)-Number(b.r.priority||100)||Number(b.v.version)-Number(a.v.version))
   return candidates[0]||null
  }

  let grossCommission=0
  for(const line of clean){
   const matched=matchRule(line)
   let commission=0
   if(matched){
    const {r,v}=matched
    const basis=v.basis||r.basis
    const salesSource=(v.sales_source||r.sales_source)==='system_sales'?'system_sales':'receipt_sales'
    const ruleType=v.rule_type||r.rule_type
    const sourceSalesValue=salesSource==='system_sales'?line.system_sales_value:line.line_amt
    const base=basis==='quantity'?line.qty:basis==='unit_price'?(salesSource==='system_sales'?sourceSalesValue/Math.max(1,line.qty):line.rate):sourceSalesValue
    line.commission_sales_source=salesSource
    if(ruleType==='fixed_amount')commission=Number(v.fixed_amount||0)*(basis==='quantity'?line.qty:1)
    else if(ruleType==='percentage')commission=Number(base)*Number(v.rate_percent||0)/100
    else if(ruleType==='no_commission')commission=0
    else if(ruleType==='tiered'||ruleType==='price_range'){
     const tiers=(v.commission_rule_tiers||[]).slice().sort((a:any,b:any)=>Number(a.tier_order)-Number(b.tier_order))
     const tier=tiers.filter((t:any)=>base>=Number(t.min_value||0)&&(t.max_value==null||base<=Number(t.max_value))).sort((a:any,b:any)=>Number(b.min_value||0)-Number(a.min_value||0))[0]
     if(tier) commission=tier.fixed_amount!=null?Number(tier.fixed_amount)*(basis==='quantity'?line.qty:1):Number(base)*Number(tier.rate_percent||0)/100
    } else if(r.rule_type==='daily_total'||r.rule_type==='period_total'){
     return out({error:'Daily-total and period-total commission rules need aggregate calculation before sales can be submitted'},409)
    }
    line.commission_rule_version_id=v.id
   }else{
    // No configured rule means no commission, never invent a commission from product price.
    line.commission_rule_version_id=null
    line.commission_sales_source='receipt_sales'
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
   .or(`effective_to.is.null,effective_to.gte.${saleDate}`).order('effective_from',{ascending:false}).order('created_at',{ascending:false}).limit(1)
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
  const {data:people,error:peopleError}=await admin.from('profiles').select('id,role,active,organization_id,branch_id').in('id',pids)
  if(peopleError)throw peopleError
  if((people||[]).length!==pids.length)return out({error:'A team member no longer exists'},409)
  for(const person of people||[]){
   if(!person.active||person.organization_id!==org||person.branch_id!==branch)
    return out({error:'A team member is inactive or outside this branch'},409)
   const assignedRoles=recipients.filter((x:any)=>x.id===person.id).map((x:any)=>x.role)
   if(assignedRoles.some((role:string)=>role==='driver'?person.role!=='driver':!['lead','lead_sales','assistant'].includes(person.role)))
    return out({error:'A team member registration is incompatible with the saved team position'},409)
  }
  const {data:splitRows,error:splitError}=await admin.from('team_split_versions')
   .select('id,version,status,team_structure_id,effective_from,effective_to,team_split_lines(role_code,employee_position,percentage,residual_eligible)')
   .eq('team_structure_id',structure.id).eq('status','approved').lte('effective_from',saleDate)
   .or(`effective_to.is.null,effective_to.gte.${saleDate}`).order('effective_from',{ascending:false}).order('created_at',{ascending:false}).order('version',{ascending:false}).limit(1)
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
  const systemSalesTotal=money(clean.reduce((n,x)=>n+x.system_sales_value,0))

  const allocations:any[]=[]
  let allocated=0
  for(const r of recipients){
   const line=splitLines.find((x:any)=>x.role_code===r.role&&Number(x.employee_position)===r.position)
   if(!line)continue
   const amount=money(grossCommission*Number(line.percentage)/100)
   allocations.push({employee_id:r.id,role_code:r.role,employee_position:r.position,team_assignment_id:r.assignment_id,team_split_version_id:splitVersion.id,split_percentage:Number(line.percentage),allocated_commission:amount})
   allocated=money(allocated+amount)
  }
  const residual=money(grossCommission-allocated)
  if(Math.abs(residual)>0){
   const target=allocations.find((x:any)=>splitLines.find((l:any)=>l.role_code===x.role_code&&Number(l.employee_position)===Number(recipients.find((r:any)=>r.id===x.employee_id&&r.role===x.role_code)?.position))?.residual_eligible)
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
   receipt_reference:receiptReference,system_sales_reference:systemSalesReference,system_sales_total:systemSalesTotal,
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
   qty:x.qty,rate:x.rate,line_amt:x.line_amt,unit_price_snapshot:x.rate,sales_value:x.line_amt,system_sales_value:x.system_sales_value,commission_sales_source:x.commission_sales_source||'receipt_sales',
   commission_rule_version_id:x.commission_rule_version_id,commission_amount:x.commission_amount
  }))
  let itemInsertError:any=null
  for(const batch of chunks(rows,100)){
   const {error}=await admin.from('sale_items').insert(batch)
   if(error){itemInsertError=error;break}
  }
  if(itemInsertError){await admin.from('sales').delete().eq('id',sale.id);throw itemInsertError}

  if(allocations.length){
   const allocationRows=allocations.map(x=>({...x,sale_id:sale.id}))
   const {error:ae}=await admin.from('sale_commission_allocations').insert(allocationRows)
   if(ae){await admin.from('sales').delete().eq('id',sale.id);throw ae}
  }

  return out({ok:true,sale_id:sale.id,total:totalSalesValue,total_quantity:totalQuantity,gross_commission:grossCommission})
 }catch(e){return out({error:e?.message||'Unexpected error'},500)}
})