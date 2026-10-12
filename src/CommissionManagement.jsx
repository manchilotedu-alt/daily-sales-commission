import React,{useEffect,useState} from 'react'
import {supabase} from './lib/supabase'

export function GlobalCommissionPolicy({user,onOpenEarnings}){
 const canEdit=['super_admin','admin'].includes(user?.role)
 const [rule,setRule]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ok,setOk]=useState('')
 const [form,setForm]=useState({method:'percentage',basis:'sales_amount',salesSource:'receipt_sales',value:'',effectiveFrom:new Date().toISOString().slice(0,10)})
 const load=async()=>{
  setLoading(true);setError('')
  const {data,error}=await supabase.from('commission_rules').select('id,name,code,rule_type,basis,price_dependency,sales_source,priority,status,active,commission_rule_versions(id,version,effective_from,effective_to,fixed_amount,rate_percent,rule_type,basis,sales_source,status)').eq('organization_id',user.organization_id).is('product_id',null).is('product_variant_id',null).is('branch_id',null).order('created_at',{ascending:true})
  if(error){setError(error.message);setRule(null)}else{
   const rows=data||[],found=rows.find(x=>x.code==='organization_default_commission')||rows[0]||null
   setRule(found)
   const versions=(found?.commission_rule_versions||[]).slice().sort((a,b)=>b.version-a.version),v=versions.find(x=>['active','approved'].includes(x.status))||versions[0]
   setForm(prev=>({...prev,method:(v?.rule_type||found?.rule_type)==='fixed_amount'?'fixed':(v?.rule_type||found?.rule_type)==='no_commission'?'none':'percentage',basis:v?.basis||found?.basis||'sales_amount',salesSource:v?.sales_source||found?.sales_source||'receipt_sales',value:v?.rate_percent??v?.fixed_amount??'',effectiveFrom:new Date().toISOString().slice(0,10)}))
  }
  setLoading(false)
 }
 useEffect(()=>{if(user?.organization_id)load()},[user?.organization_id])
 const save=async e=>{
  e.preventDefault();if(!canEdit)return
  const value=Number(form.value),type=form.method==='fixed'?'fixed_amount':form.method==='none'?'no_commission':'percentage'
  if(!form.effectiveFrom){setError('የሚጀምርበትን ቀን ያስገቡ።');return}
  if((form.method==='percentage'&&(!Number.isFinite(value)||value<0||value>100))||(form.method==='fixed'&&(!Number.isFinite(value)||value<0))){setError('የኮሚሽን መጠኑን በትክክል ያስገቡ።');return}
  setBusy(true);setError('');setOk('')
  try{
   const versions=(rule?.commission_rule_versions||[]).slice().sort((a,b)=>b.version-a.version),latest=versions[0]
   if(latest&&form.effectiveFrom<=String(latest.effective_from).slice(0,10))throw new Error('አዲሱ የሚጀምርበት ቀን ከቀድሞው ስሪት ቀን በኋላ መሆን አለበት።')
   const payload={name:'Organization default commission',rule_type:type,basis:form.basis,price_dependency:'independent',sales_source:form.salesSource,priority:100,status:'active',active:true,updated_at:new Date().toISOString()}
   let current=rule
   if(!current){const {data,error}=await supabase.from('commission_rules').insert({organization_id:user.organization_id,product_id:null,product_variant_id:null,branch_id:null,code:'organization_default_commission',...payload,created_by:user.id}).select().single();if(error)throw error;current=data}
   else{const {data,error}=await supabase.from('commission_rules').update(payload).eq('id',current.id).select().single();if(error)throw error;current={...current,...data}}
   const {data:v,error:ve}=await supabase.from('commission_rule_versions').insert({commission_rule_id:current.id,version:(latest?.version||0)+1,effective_from:new Date(form.effectiveFrom+'T00:00:00').toISOString(),fixed_amount:form.method==='fixed'?value:null,rate_percent:form.method==='percentage'?value:null,rule_type:type,basis:form.basis,sales_source:form.salesSource,status:'draft',created_by:user.id,submitted_by:user.id,submitted_at:new Date().toISOString(),approved_by:user.id,approved_at:new Date().toISOString()}).select().single()
   if(ve)throw ve
   if(latest){const {error}=await supabase.from('commission_rule_versions').update({effective_to:new Date(form.effectiveFrom+'T00:00:00').toISOString(),status:'expired'}).eq('id',latest.id);if(error)throw error}
   const {error:activateError}=await supabase.from('commission_rule_versions').update({status:'active'}).eq('id',v.id);if(activateError)throw activateError
   await load();setOk('የድርጅት ነባሪ የኮሚሽን ሕግ ተመዝግቧል።')
  }catch(e){setError(e.message||'የነባሪ ኮሚሽን ሕጉን ማስቀመጥ አልተቻለም።')}finally{setBusy(false)}
 }
 return <section className="mb-5 space-y-4 rounded-2xl border border-white/10 bg-[#101827] p-5">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">የድርጅት ነባሪ የኮሚሽን ሕግ</h2><p className="mt-1 text-sm text-slate-400">ምርት የተለየ ሕግ ካልነበረው ብቻ ይሠራል። የምርት ልዩ ሕግ ከዚህ በላይ ቅድሚያ አለው።</p></div><div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={onOpenEarnings}>ማስተካከያዎች / ክፍያዎች</button><button type="button" className="btn-secondary" onClick={load} disabled={loading}>አድስ</button></div></div>
  {error&&<div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}{ok&&<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{ok}</div>}
  {loading?<p className="text-sm text-slate-400">በመጫን ላይ…</p>:canEdit?<form onSubmit={save} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
   <label className="text-xs font-semibold text-slate-400">የኮሚሽን አይነት<select className="input mt-1" value={form.method} onChange={e=>setForm({...form,method:e.target.value,value:''})}><option value="percentage">በመቶኛ (%)</option><option value="fixed">ቋሚ ኮሚሽን (ETB)</option><option value="none">ኮሚሽን የለውም</option></select></label>
   <label className="text-xs font-semibold text-slate-400">የስሌት መነሻ<select className="input mt-1" value={form.basis} onChange={e=>setForm({...form,basis:e.target.value})}><option value="sales_amount">የሽያጭ ጠቅላላ ዋጋ</option><option value="quantity">የእቃ ብዛት</option><option value="unit_price">የአንድ እቃ ዋጋ</option></select></label>
   <label className="text-xs font-semibold text-slate-400">የኮሚሽን መነሻ ሽያጭ<select className="input mt-1" value={form.salesSource} onChange={e=>setForm({...form,salesSource:e.target.value})}><option value="receipt_sales">የደረሰኝ ሽያጭ</option><option value="system_sales">የውጭ ሲስተም ሽያጭ</option></select></label>
   {(form.method==='percentage'||form.method==='fixed')&&<label className="text-xs font-semibold text-slate-400">መጠን {form.method==='percentage'?'(%)':'(ብር)'}<input className="input mt-1" type="number" min="0" max={form.method==='percentage'?'100':undefined} step="0.01" required value={form.value} onChange={e=>setForm({...form,value:e.target.value})}/></label>}
   <label className="text-xs font-semibold text-slate-400">የሚጀምርበት ቀን<input className="input mt-1" type="date" required value={form.effectiveFrom} onChange={e=>setForm({...form,effectiveFrom:e.target.value})}/></label>
   <button className="btn self-end" disabled={busy}>{busy?'በማስቀመጥ ላይ…':'ነባሪ ሕጉን አስቀምጥ'}</button>
  </form>:<p className="text-sm text-slate-400">ይህን ሕግ ማስተካከል የሚችሉት የድርጅት አስተዳዳሪዎች ብቻ ናቸው።</p>}
  {rule&&<div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm"><b>የአሁኑ ሕግ:</b> {rule.rule_type==='no_commission'?'ኮሚሽን የለውም':rule.rule_type==='fixed_amount'?'ቋሚ ኮሚሽን':'በመቶኛ'} · {rule.basis==='quantity'?'ብዛት':rule.basis==='unit_price'?'የአንድ እቃ ዋጋ':'ጠቅላላ ዋጋ'} · {rule.sales_source==='system_sales'?'የውጭ ሲስተም':'የደረሰኝ'}</div>}
  <p className="text-xs text-slate-500">የቅርንጫፍ Split፣ የሠራተኛ ምደባ እና የAttendance ሕጎች በዚህ ለውጥ አይቀየሩም።</p>
 </section>
}
