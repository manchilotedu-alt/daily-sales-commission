import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from './lib/supabase'

const roleLabels={lead:'መሪ ሻጭ',lead_sales:'መሪ ሻጭ',assistant:'ረዳት',driver:'ሾፌር'}
const normalize= v=>String(v||'').trim()

export function SalesPage({user}){
 const [products,setProducts]=useState([]),[variants,setVariants]=useState([]),[staff,setStaff]=useState([]),[items,setItems]=useState([]),[saleDate,setSaleDate]=useState(new Date().toISOString().slice(0,10))
 const [leadId,setLeadId]=useState(user.role==='lead'||user.role==='lead_sales'?user.id:''),[assistantId,setAssistantId]=useState(user.role==='assistant'?user.id:''),[driverId,setDriverId]=useState(user.role==='driver'?user.id:'')
 const [productId,setProductId]=useState(''),[variantId,setVariantId]=useState(''),[qty,setQty]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ok,setOk]=useState('')
 const canSubmit=['super_admin','admin','branch_admin','lead','lead_sales','assistant'].includes(user.role)
 const canAssignStaff=['super_admin','admin','branch_admin'].includes(user.role)

 useEffect(()=>{(async()=>{try{
   const [p,v,s]=await Promise.all([
    supabase.from('products').select('id,en,am,rate,organization_id,active').eq('organization_id',user.organization_id).eq('active',true).order('en'),
    supabase.from('product_variants').select('id,product_id,name_en,name_am,unit,active,organization_id').eq('organization_id',user.organization_id).eq('active',true).order('name_en'),
    canAssignStaff ? supabase.from('profiles').select('id,full_name,phone,role').eq('active',true).in('role',['lead','lead_sales','assistant','driver']).eq('organization_id',user.organization_id).eq('branch_id',user.branch_id).order('full_name') : Promise.resolve({data:[],error:null})
   ])
   if(p.error)throw p.error
   if(v.error)throw v.error
   if(s.error)throw s.error
   setProducts(p.data||[]);setVariants(v.data||[]);setStaff(s.data||[])
  }catch(e){setError(e.message)}})()},[user.organization_id,user.branch_id,canAssignStaff])

 const selected=products.find(p=>String(p.id)===String(productId))
 const selectedVariants=variants.filter(v=>String(v.product_id)===String(productId))
 const selectedVariant=selectedVariants.find(v=>String(v.id)===String(variantId))
 const displayName=selected?((selected.am||selected.en)+(selectedVariant?' — '+(selectedVariant.name_am||selectedVariant.name_en||'') :'')):''
 const total=useMemo(()=>items.reduce((n,x)=>n+x.salesValue,0),[items])
 const totalQuantity=useMemo(()=>items.reduce((n,x)=>n+x.qty,0),[items])

 const add=()=>{
  setError('');setOk('')
  const n=Number(qty)
  if(!selected||!Number.isInteger(n)||n<1)return setError('ምርት እና ትክክለኛ ብዛት ይምረጡ።')
  if(selectedVariants.length&&!selectedVariant)return setError('የምርቱን መጠን ይምረጡ።')
  const key=selected.id+':'+(variantId||'')
  setItems(prev=>{const i=prev.findIndex(x=>x.key===key);if(i<0)return [...prev,{key,product_id:selected.id,product_variant_id:variantId||null,name:displayName,qty:n,rate:Number(selected.rate||0),salesValue:n*Number(selected.rate||0)}];const a=[...prev];a[i]={...a[i],qty:a[i].qty+n,salesValue:(a[i].qty+n)*a[i].rate};return a})
  setProductId('');setVariantId('');setQty(1)
 }
 const submit=async e=>{
  e.preventDefault();setBusy(true);setError('');setOk('')
  try{
   if(!canSubmit)throw new Error('ይህ ሚና ሽያጭ ማስገባት አይችልም።')
   if(!items.length)throw new Error('ቢያንስ አንድ የሽያጭ እቃ ያስገቡ።')
   const {data,error}=await supabase.functions.invoke('create-sale',{body:{sale_date:saleDate,lead_id:leadId||null,assistant_id:assistantId||null,driver_id:driverId||null,items:items.map(x=>({product_id:x.product_id,product_variant_id:x.product_variant_id,qty:x.qty}))}})
   if(error)throw error
   if(data?.error)throw new Error(data.error)
   setItems([]);setOk('ሽያጩ ተመዝግቦ ለማረጋገጫ ተልኳል።')
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const staffByRole=r=>staff.filter(x=>x.role===r||((r==='lead'||r==='lead_sales')&&['lead','lead_sales'].includes(x.role)))
 return <section className="space-y-5">
  <div><h2 className="text-2xl font-bold">አዲስ ሽያጭ</h2><p className="text-sm text-zinc-500">ሽያጭን በቅርንጫፍዎ ውስጥ ይመዝግቡ። የኮሚሽን መጠኖች በስርዓቱ ይሰላሉ።</p></div>
  {error&&<div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
  {ok&&<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-300">{ok}</div>}
  <form onSubmit={submit} className="space-y-5">
   <div className="grid gap-3 rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-2">
    <label className="text-sm">የሽያጭ ቀን<input className="input mt-1" type="date" value={saleDate} onChange={e=>setSaleDate(e.target.value)} required/></label>
    <label className="text-sm">ምርት<select className="input mt-1" value={productId} onChange={e=>{setProductId(e.target.value);setVariantId('')}}><option value="">ምርት ይምረጡ</option>{products.map(p=><option key={p.id} value={p.id}>{p.am||p.en}</option>)}</select></label>
    {selectedVariants.length>0&&<label className="text-sm">መጠን / ቫሪያንት<select className="input mt-1" value={variantId} onChange={e=>setVariantId(e.target.value)}><option value="">መጠን ይምረጡ</option>{selectedVariants.map(v=><option key={v.id} value={v.id}>{v.name_am||v.name_en}{v.unit?' · '+v.unit:''}</option>)}</select></label>}
    <label className="text-sm">ብዛት<input className="input mt-1" type="number" min="1" step="1" value={qty} onChange={e=>setQty(e.target.value)}/></label>
    <div className="flex items-end"><button type="button" onClick={add} className="btn w-full">ወደ ዝርዝር ጨምር</button></div>
   </div>
   {canAssignStaff&&<div className="grid gap-3 rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-3">
    <Person label="መሪ ሻጭ" value={leadId} onChange={setLeadId} options={staffByRole('lead')}/>
    <Person label="ረዳት" value={assistantId} onChange={setAssistantId} options={staffByRole('assistant')}/>
    <Person label="ሾፌር" value={driverId} onChange={setDriverId} options={staffByRole('driver')}/>
   </div>}
   <div className="overflow-x-auto rounded-2xl border bg-white dark:border-zinc-800 dark:bg-zinc-900">
    <table className="w-full text-sm"><thead><tr className="border-b dark:border-zinc-800"><th className="p-3 text-left">ምርት</th><th className="p-3">ብዛት</th><th className="p-3">የአንድ ዋጋ</th><th className="p-3">የሽያጭ ዋጋ</th><th className="p-3"></th></tr></thead><tbody>
     {items.map(x=><tr key={x.key} className="border-b last:border-0 dark:border-zinc-800"><td className="p-3">{x.name}</td><td className="p-3 text-center">{x.qty}</td><td className="p-3 text-right">{x.rate.toLocaleString()} ብር</td><td className="p-3 text-right">{x.salesValue.toLocaleString()} ብር</td><td className="p-3 text-center"><button type="button" className="text-rose-500" onClick={()=>setItems(a=>a.filter(i=>i.key!==x.key))}>ሰርዝ</button></td></tr>)}
     {!items.length&&<tr><td colSpan="5" className="p-8 text-center text-zinc-500">የሽያጭ ዝርዝር እዚህ ይታያል።</td></tr>}
    </tbody>{items.length&&<tfoot><tr><td className="p-3 font-bold">ጠቅላላ</td><td className="p-3 text-center font-bold">{totalQuantity}</td><td/><td className="p-3 text-right font-black">{total.toLocaleString()} ብር</td><td/></tr></tfoot>}</table>
   </div>
   <button disabled={busy||!canSubmit||!items.length} className="btn w-full md:w-auto">{busy?'በመላክ ላይ…':'ሽያጭ አስገባ'}</button>
  </form>
 </section>
}
function Person({label,value,onChange,options}){return <label className="text-sm">{label}<select className="input mt-1" value={value} onChange={e=>onChange(e.target.value)}><option value="">አልተመደበም</option>{options.map(x=><option key={x.id} value={x.id}>{x.full_name} · {roleLabels[x.role]||x.role}</option>)}</select></label>}
