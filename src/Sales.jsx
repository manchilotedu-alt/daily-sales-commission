import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from './lib/supabase'

const roleLabels={lead:'መሪ ሻጭ',lead_sales:'መሪ ሻጭ',assistant:'ረዳት',driver:'ሾፌር'}
const normalize= v=>String(v||'').trim()

export function SalesPage({user}){
 const [products,setProducts]=useState([]),[variants,setVariants]=useState([]),[priceVersions,setPriceVersions]=useState([]),[staff,setStaff]=useState([]),[items,setItems]=useState([]),[teams,setTeams]=useState([]),[teamId,setTeamId]=useState(''),[receiptReference,setReceiptReference]=useState(''),[saleDate,setSaleDate]=useState(new Date().toISOString().slice(0,10))
 const [leadId,setLeadId]=useState(user.role==='lead'||user.role==='lead_sales'?user.id:''),[assistantId,setAssistantId]=useState(user.role==='assistant'?user.id:''),[driverId,setDriverId]=useState(user.role==='driver'?user.id:'')
 const [productId,setProductId]=useState(''),[variantId,setVariantId]=useState(''),[qty,setQty]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ok,setOk]=useState('')
 const canSubmit=user.role==='branch_admin'
 const canAssignStaff=['super_admin','admin','branch_admin'].includes(user.role)

 useEffect(()=>{(async()=>{try{
   const [p,v,s,a]=await Promise.all([
    supabase.from('products').select('id,en,am,rate,organization_id,active').eq('organization_id',user.organization_id).eq('active',true).order('en'),
    supabase.from('product_variants').select('id,product_id,name_en,name_am,unit,active,organization_id').eq('organization_id',user.organization_id).eq('active',true).order('name_en'),
    canAssignStaff ? supabase.from('profiles').select('id,full_name,phone,role').eq('active',true).in('role',['lead','lead_sales','assistant','driver']).eq('organization_id',user.organization_id).eq('branch_id',user.branch_id).order('full_name') : Promise.resolve({data:[],error:null}),
    user.branch_id ? supabase.from('product_branch_assignments').select('product_id').eq('organization_id',user.organization_id).eq('branch_id',user.branch_id).eq('active',true) : supabase.from('product_branch_assignments').select('product_id').eq('organization_id',user.organization_id).is('branch_id',null).eq('active',true)
   ])
   if(p.error)throw p.error
   if(v.error)throw v.error
   if(s.error)throw s.error
   if(a.error)throw a.error
   const allowed=new Set((a.data||[]).map(x=>Number(x.product_id)))
   const visibleProducts=(p.data||[]).filter(x=>allowed.has(Number(x.id)))
   let priceRows=[]
   if(visibleProducts.length){
    const {data:pr,error:priceError}=await supabase.from('product_price_versions').select('product_id,product_variant_id,variant_id,price,effective_from,effective_to,status').eq('organization_id',user.organization_id).in('product_id',visibleProducts.map(x=>x.id)).eq('status','active').lte('effective_from',saleDate).or(`effective_to.is.null,effective_to.gte.${saleDate}`).order('effective_from',{ascending:false})
    if(priceError)throw priceError
    priceRows=pr||[]
   }
   setProducts(visibleProducts);setVariants(v.data||[]);setStaff(s.data||[]);setPriceVersions(priceRows)
  }catch(e){setError(e.message)}})()},[user.organization_id,user.branch_id,canAssignStaff,saleDate])

 useEffect(()=>{(async()=>{
  if(user.role!=='branch_admin'||!user.organization_id||!user.branch_id)return
  const {data,error}=await supabase.from('teams').select('id,name,status').eq('organization_id',user.organization_id).eq('branch_id',user.branch_id).eq('status','active').order('name')
  if(error){setError(error.message);return}
  const rows=data||[];setTeams(rows);setTeamId(prev=>rows.some(t=>t.id===prev)?prev:(rows[0]?.id||''))
 })()},[user.role,user.organization_id,user.branch_id])

 const selected=products.find(p=>String(p.id)===String(productId))
 const selectedVariants=variants.filter(v=>String(v.product_id)===String(productId))
 const selectedVariant=selectedVariants.find(v=>String(v.id)===String(variantId))
 const displayName=selected?((selected.am||selected.en)+(selectedVariant?' — '+(selectedVariant.name_am||selectedVariant.name_en||'') :'')):''
 const total=useMemo(()=>items.reduce((n,x)=>n+x.salesValue,0),[items])
 const totalQuantity=useMemo(()=>items.reduce((n,x)=>n+x.qty,0),[items])

 const resolveRate=(product,variant)=>{
  const rows=priceVersions.filter(x=>Number(x.product_id)===Number(product.id))
  const latest=matches=>matches.slice().sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)))[0]
  const variantPrice=variant?latest(rows.filter(x=>String(x.product_variant_id)===String(variant.id))):null
  const basePrice=latest(rows.filter(x=>x.product_variant_id==null&&x.variant_id==null))
  return Number(variantPrice?.price??basePrice?.price??product.rate??0)
 }
 const add=()=>{
  setError('');setOk('')
  const n=Number(qty)
  if(!selected||!Number.isInteger(n)||n<1)return setError('ምርት እና ትክክለኛ ብዛት ይምረጡ።')
  if(selectedVariants.length&&!selectedVariant)return setError('የምርቱን መጠን ይምረጡ።')
  const key=selected.id+':'+(variantId||'')
  const rate=resolveRate(selected,selectedVariant)
  setItems(prev=>{const i=prev.findIndex(x=>x.key===key);if(i<0)return [...prev,{key,product_id:selected.id,product_variant_id:variantId||null,name:displayName,qty:n,rate,salesValue:n*rate}];const a=[...prev];a[i]={...a[i],qty:a[i].qty+n,salesValue:(a[i].qty+n)*a[i].rate};return a})
  setProductId('');setVariantId('');setQty(1)
 }
 const submit=async e=>{
  e.preventDefault();setBusy(true);setError('');setOk('')
  try{
   if(!canSubmit)throw new Error('ይህ ሚና ሽያጭ ማስገባት አይችልም።')
   if(!teamId)throw new Error('የሽያጭ ቡድን ይምረጡ።')
   if(!receiptReference.trim())throw new Error('የደረሰኝ ቁጥር / የሽያጭ ማጣቀሻ ያስገቡ።')
   if(!items.length)throw new Error('ቢያንስ አንድ የሽያጭ እቃ ያስገቡ።')
   const {data,error}=await supabase.functions.invoke('create-sale',{body:{sale_date:saleDate,team_id:teamId,receipt_reference:receiptReference.trim(),items:items.map(x=>({product_id:x.product_id,product_variant_id:x.product_variant_id,qty:x.qty}))}})
   if(error)throw error
   if(data?.error)throw new Error(data.error)
   setItems([]);setReceiptReference('');setOk('ሽያጩ ተመዝግቦ ለማረጋገጫ ተልኳል።')
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const staffByRole=r=>staff.filter(x=>x.role===r||((r==='lead'||r==='lead_sales')&&['lead','lead_sales'].includes(x.role)))
 return <section className="space-y-5">
  <div><h2 className="text-2xl font-bold">አዲስ ሽያጭ</h2><p className="text-sm text-zinc-500">ሽያጭን በቅርንጫፍዎ ውስጥ ይመዝግቡ። የኮሚሽን መጠኖች በስርዓቱ ይሰላሉ።</p></div>
  {error&&<div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
  {ok&&<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-300">{ok}</div>}
  <form onSubmit={submit} className="space-y-5">
   <div className="grid gap-3 rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-2">
    <label className="text-sm">የሽያጭ ቀን<input className="input mt-1" type="date" value={saleDate} onChange={e=>setSaleDate(e.target.value)} disabled={items.length>0} title={items.length?'የቀን ለውጥ ለማድረግ መጀመሪያ የሽያጭ ዝርዝሩን ባዶ ያድርጉ።':''} required/></label>
    <label className="text-sm">የሽያጭ ቡድን<select className="input mt-1" value={teamId} onChange={e=>setTeamId(e.target.value)} required><option value="">ቡድን ይምረጡ</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label className="text-sm">የደረሰኝ ቁጥር / ማጣቀሻ<input className="input mt-1" type="text" maxLength="120" value={receiptReference} onChange={e=>setReceiptReference(e.target.value)} placeholder="ለምሳሌ: RCP-000123" required/></label>
    <label className="text-sm">ምርት<select className="input mt-1" value={productId} onChange={e=>{setProductId(e.target.value);setVariantId('')}}><option value="">ምርት ይምረጡ</option>{products.map(p=><option key={p.id} value={p.id}>{p.am||p.en}</option>)}</select></label>
    {selectedVariants.length>0&&<label className="text-sm">መጠን / ቫሪያንት<select className="input mt-1" value={variantId} onChange={e=>setVariantId(e.target.value)}><option value="">መጠን ይምረጡ</option>{selectedVariants.map(v=><option key={v.id} value={v.id}>{v.name_am||v.name_en}{v.unit?' · '+v.unit:''}</option>)}</select></label>}
    <label className="text-sm">ብዛት<input className="input mt-1" type="number" min="1" step="1" value={qty} onChange={e=>setQty(e.target.value)}/></label>
    <div className="flex items-end"><button type="button" onClick={add} className="btn w-full">ወደ ዝርዝር ጨምር</button></div>
   </div>

   <div className="overflow-x-auto rounded-2xl border bg-white dark:border-zinc-800 dark:bg-zinc-900">
    <table className="w-full text-sm"><thead><tr className="border-b dark:border-zinc-800"><th className="p-3 text-left">ምርት</th><th className="p-3">ብዛት</th><th className="p-3">የአንድ ዋጋ</th><th className="p-3">የሽያጭ ዋጋ</th><th className="p-3"></th></tr></thead><tbody>
     {items.map(x=><tr key={x.key} className="border-b last:border-0 dark:border-zinc-800"><td className="p-3">{x.name}</td><td className="p-3 text-center">{x.qty}</td><td className="p-3 text-right">{x.rate.toLocaleString()} ብር</td><td className="p-3 text-right">{x.salesValue.toLocaleString()} ብር</td><td className="p-3 text-center"><button type="button" className="text-rose-500" onClick={()=>setItems(a=>a.filter(i=>i.key!==x.key))}>ሰርዝ</button></td></tr>)}
     {!items.length&&<tr><td colSpan="5" className="p-8 text-center text-zinc-500">የሽያጭ ዝርዝር እዚህ ይታያል።</td></tr>}
    </tbody>{items.length&&<tfoot><tr><td className="p-3 font-bold">ጠቅላላ</td><td className="p-3 text-center font-bold">{totalQuantity}</td><td/><td className="p-3 text-right font-black">{total.toLocaleString()} ብር</td><td/></tr></tfoot>}</table>
   </div>
   <button disabled={busy||!canSubmit||!items.length||!teamId||!receiptReference.trim()} className="btn w-full md:w-auto">{busy?'በመላክ ላይ…':canSubmit?'ሽያጭ አስገባ':'ሽያጭ ማስገባት የቅርንጫፍ አስተዳዳሪ ብቻ ይችላል'}</button>
  </form>
 </section>
}
function Person({label,value,onChange,options}){return <label className="text-sm">{label}<select className="input mt-1" value={value} onChange={e=>onChange(e.target.value)}><option value="">አልተመደበም</option>{options.map(x=><option key={x.id} value={x.id}>{x.full_name} · {roleLabels[x.role]||x.role}</option>)}</select></label>}
