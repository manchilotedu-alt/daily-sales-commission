import React,{useEffect,useState} from 'react'
import {supabase} from './lib/supabase'

const defaults={
 company_name:'',business_phone:'',business_email:'',registration_number:'',
 currency:'ETB',commission_period:'monthly',commission_period_start_day:1,
 date_format:'DD/MM/YYYY',number_format:'en-ET',rounding_scale:2,rounding_mode:'half_up',
 notify_in_app:true,notify_email:false,notify_payment_events:true,notify_commission_changes:true,
 audit_retention_days:365,require_commission_approval:true,session_timeout_minutes:60
}
const fieldClass='input mt-1.5'
const panel='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900'
function Field({label,help,children}){return <label className="block text-sm font-semibold">{label}{children}{help&&<span className="mt-1 block text-xs font-normal text-zinc-500">{help}</span>}</label>}
function Toggle({label,description,checked,onChange}){return <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-zinc-700"><input className="mt-1 h-4 w-4 shrink-0 accent-sky-500" type="checkbox" checked={!!checked} onChange={e=>onChange(e.target.checked)}/><span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs font-normal text-zinc-500">{description}</span></span></label>}

export function SettingsPage({user}){
 const [organizations,setOrganizations]=useState([])
 const [organizationId,setOrganizationId]=useState(user?.organization_id||'')
 const [form,setForm]=useState(defaults)
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false)
 const [error,setError]=useState(''),[success,setSuccess]=useState('')
 const update=(key,value)=>setForm(prev=>({...prev,[key]:value}))
 useEffect(()=>{let live=true;(async()=>{setLoading(true);setError('');try{
  const {data:orgs,error:orgError}=await supabase.from('organizations').select('id,name,code,active').eq('active',true).order('name')
  if(orgError)throw orgError
  if(!live)return
  const list=orgs||[];setOrganizations(list)
  const initial=organizationId||list[0]?.id||''
  if(initial&&!organizationId)setOrganizationId(initial)
  if(!initial){setForm(defaults);setLoading(false);return}
  const [{data:org,error:orgLoadError},{data:stored,error:settingsError}]=await Promise.all([
   supabase.from('organizations').select('id,name,code').eq('id',initial).single(),
   supabase.from('organization_settings').select('settings,updated_at').eq('organization_id',initial).maybeSingle()
  ])
  if(orgLoadError)throw orgLoadError
  if(settingsError)throw settingsError
  if(!live)return
  setForm({...defaults,company_name:org?.name||'',...(stored?.settings||{})})
 }catch(e){if(live)setError(e.message||'የስርዓት ቅንብሮችን ማምጣት አልተቻለም።')}finally{if(live)setLoading(false)}})();return()=>{live=false}},[])
 useEffect(()=>{if(!organizationId)return;let live=true;(async()=>{setLoading(true);setError('');setSuccess('');try{
  const [{data:org,error:orgError},{data:stored,error:settingsError}]=await Promise.all([
   supabase.from('organizations').select('id,name,code').eq('id',organizationId).single(),
   supabase.from('organization_settings').select('settings,updated_at').eq('organization_id',organizationId).maybeSingle()
  ])
  if(orgError)throw orgError
  if(settingsError)throw settingsError
  if(live)setForm({...defaults,company_name:org?.name||'',...(stored?.settings||{})})
 }catch(e){if(live)setError(e.message||'የድርጅት ቅንብሮችን ማምጣት አልተቻለም።')}finally{if(live)setLoading(false)}})();return()=>{live=false}},[organizationId])
 const save=async e=>{e.preventDefault();setError('');setSuccess('');if(!organizationId){setError('መጀመሪያ ድርጅት ይምረጡ።');return}
  const periodStart=Number(form.commission_period_start_day),scale=Number(form.rounding_scale),retention=Number(form.audit_retention_days),timeout=Number(form.session_timeout_minutes)
  if(!form.company_name.trim()){setError('የድርጅት ስም ያስገቡ።');return}
  if(!Number.isInteger(periodStart)||periodStart<1||periodStart>28){setError('የወርሃዊ ኮሚሽን መጀመሪያ ቀን ከ1 እስከ 28 ይሁን።');return}
  if(!Number.isInteger(scale)||scale<0||scale>6){setError('የማጠጋጋት የአሃዝ ብዛት ከ0 እስከ 6 ይሁን።');return}
  if(!Number.isInteger(retention)||retention<30||retention>3650){setError('የAudit መዝገብ ጊዜ ከ30 እስከ 3650 ቀን ይሁን።');return}
  if(!Number.isInteger(timeout)||timeout<5||timeout>1440){setError('የSession timeout ከ5 እስከ 1440 ደቂቃ ይሁን።');return}
  setSaving(true);try{
   const payload={...form,company_name:form.company_name.trim(),business_phone:form.business_phone.trim(),business_email:form.business_email.trim(),registration_number:form.registration_number.trim(),commission_period_start_day:periodStart,rounding_scale:scale,audit_retention_days:retention,session_timeout_minutes:timeout,currency:'ETB'}
   const {error:saveError}=await supabase.from('organization_settings').upsert({organization_id:organizationId,settings:payload,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:'organization_id'})
   if(saveError)throw saveError
   setForm(payload);setSuccess('የስርዓት ቅንብሮቹ በተሳካ ሁኔታ ተቀምጠዋል።')
  }catch(e){setError(e.message||'ቅንብሮቹን ማስቀመጥ አልተቻለም።')}finally{setSaving(false)}
 }
 return <section className="mx-auto max-w-5xl space-y-5">
  <div><p className="text-xs font-bold uppercase tracking-[.18em] text-sky-300">SYSTEM / CONFIGURATION</p><h2 className="mt-2 text-2xl font-black">ስርዓት ቅንብሮች እና የንግድ መረጃ</h2><p className="mt-1 text-sm text-zinc-500">የድርጅት መረጃ፣ የኮሚሽን ጊዜ፣ የቁጥር ቅርጸት፣ ማሳወቂያ እና የደህንነት መመሪያዎችን ያዘጋጁ።</p></div>
  <div className={panel}><Field label="ድርጅት ምረጥ"><select className={fieldClass} value={organizationId} onChange={e=>setOrganizationId(e.target.value)} required><option value="">-- ድርጅት ምረጥ --</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}{o.code?' ('+o.code+')':''}</option>)}</select></Field></div>
  {error&&<div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
  {success&&<div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{success}</div>}
  {loading?<div className={panel}>ቅንብሮችን በመጫን ላይ…</div>:!organizationId?<div className={panel}>የሚያስተዳድሩት ንቁ ድርጅት አልተገኘም።</div>:<form onSubmit={save} className="space-y-5">
   <div className={panel}><h3 className="mb-4 text-lg font-bold">1. የድርጅት / የንግድ መረጃ</h3><div className="grid gap-4 md:grid-cols-2">
    <Field label="የድርጅት ስም"><input className={fieldClass} value={form.company_name||''} onChange={e=>update('company_name',e.target.value)} maxLength={160} required/></Field>
    <Field label="የምዝገባ ቁጥር"><input className={fieldClass} value={form.registration_number||''} onChange={e=>update('registration_number',e.target.value)} maxLength={80} placeholder="ካለ ያስገቡ"/></Field>
    <Field label="የስልክ ቁጥር"><input className={fieldClass} type="tel" value={form.business_phone||''} onChange={e=>update('business_phone',e.target.value)} maxLength={40}/></Field>
    <Field label="የኢሜይል አድራሻ"><input className={fieldClass} type="email" value={form.business_email||''} onChange={e=>update('business_email',e.target.value)} maxLength={160}/></Field>
    <Field label="ገንዘብ"><select className={fieldClass} value="ETB" disabled><option value="ETB">ETB — የኢትዮጵያ ብር</option></select><span className="mt-1 block text-xs font-normal text-zinc-500">የኮሚሽን ስርዓቱ አሁን በETB ይሰራል።</span></Field>
   </div></div>
   <div className={panel}><h3 className="mb-4 text-lg font-bold">2. የኮሚሽን ጊዜ እና ማጠጋጋት</h3><div className="grid gap-4 md:grid-cols-2">
    <Field label="የኮሚሽን የጊዜ ክፍል"><select className={fieldClass} value={form.commission_period||'monthly'} onChange={e=>update('commission_period',e.target.value)}><option value="monthly">ወርሃዊ</option><option value="weekly">ሳምንታዊ</option></select></Field>
    <Field label="የወርሃዊ ኮሚሽን መጀመሪያ ቀን" help="ለወርሃዊ ክፍያ የሚተገበር፤ 1 ማለት የወሩ መጀመሪያ ነው።"><input className={fieldClass} type="number" min="1" max="28" step="1" value={form.commission_period_start_day??1} onChange={e=>update('commission_period_start_day',e.target.value)}/></Field>
    <Field label="የኮሚሽን ማጠጋጋት"><select className={fieldClass} value={form.rounding_mode||'half_up'} onChange={e=>update('rounding_mode',e.target.value)}><option value="half_up">Half up — መደበኛ</option><option value="half_even">Half even — ወደ እኩል</option><option value="down">Down — ወደ ታች</option><option value="up">Up — ወደ ላይ</option></select></Field>
    <Field label="ከዴሲማል በኋላ የአሃዝ ብዛት"><select className={fieldClass} value={form.rounding_scale??2} onChange={e=>update('rounding_scale',e.target.value)}>{[0,1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}</option>)}</select></Field>
   </div></div>
   <div className={panel}><h3 className="mb-4 text-lg font-bold">3. የቀን እና የቁጥር ቅርጸት</h3><div className="grid gap-4 md:grid-cols-2">
    <Field label="የቀን ቅርጸት"><select className={fieldClass} value={form.date_format||'DD/MM/YYYY'} onChange={e=>update('date_format',e.target.value)}><option value="DD/MM/YYYY">DD/MM/YYYY (31/12/2026)</option><option value="YYYY-MM-DD">YYYY-MM-DD (2026-12-31)</option><option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2026)</option></select></Field>
    <Field label="የቁጥር ቅርጸት"><select className={fieldClass} value={form.number_format||'en-ET'} onChange={e=>update('number_format',e.target.value)}><option value="en-ET">1,234.56 — English (Ethiopia)</option><option value="am-ET">1,234.56 — Amharic (Ethiopia)</option></select></Field>
   </div></div>
   <div className={panel}><h3 className="mb-4 text-lg font-bold">4. ማሳወቂያዎች</h3><div className="grid gap-3 md:grid-cols-2">
    <Toggle label="በመተግበሪያ ውስጥ ማሳወቂያ" description="ለአስፈላጊ የስርዓት ለውጦች ማሳወቂያ እንዲታይ።" checked={form.notify_in_app} onChange={v=>update('notify_in_app',v)}/>
    <Toggle label="በኢሜይል ማሳወቂያ" description="ኢሜይል ማሳወቂያ እንዲፈቀድ።" checked={form.notify_email} onChange={v=>update('notify_email',v)}/>
    <Toggle label="የክፍያ ሁኔታ ማሳወቂያ" description="ክፍያ ሲፈቀድ ወይም ሲፈጸም።" checked={form.notify_payment_events} onChange={v=>update('notify_payment_events',v)}/>
    <Toggle label="የኮሚሽን ለውጥ ማሳወቂያ" description="የኮሚሽን መመሪያ ሲቀየር።" checked={form.notify_commission_changes} onChange={v=>update('notify_commission_changes',v)}/>
   </div></div>
   <div className={panel}><h3 className="mb-4 text-lg font-bold">5. Audit እና ደህንነት</h3><div className="grid gap-4 md:grid-cols-2">
    <Field label="የAudit መዝገብ ማቆያ (ቀናት)" help="የቅንብር እሴት ብቻ ነው፤ የመዝገብ ማጥፋት ስራ በዚህ ገጽ አይካሄድም።"><input className={fieldClass} type="number" min="30" max="3650" step="1" value={form.audit_retention_days??365} onChange={e=>update('audit_retention_days',e.target.value)}/></Field>
    <Field label="የSession ጊዜ ገደብ (ደቂቃ)" help="ይህን እሴት በAuthentication ላይ ማስፈጸም የተለየ የደህንነት ለውጥ ይፈልጋል።"><input className={fieldClass} type="number" min="5" max="1440" step="5" value={form.session_timeout_minutes??60} onChange={e=>update('session_timeout_minutes',e.target.value)}/></Field>
    <div className="md:col-span-2"><Toggle label="የኮሚሽን ማጽደቅ እንዲጠይቅ" description="የማጽደቅ መመሪያ ቅንብር፤ አሁን ያለውን የሽያጭ ማጽደቅ ፍሰት በራሱ አይቀይርም።" checked={form.require_commission_approval} onChange={v=>update('require_commission_approval',v)}/></div>
   </div><p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-zinc-500 dark:bg-zinc-800">የAudit እና የደህንነት እሴቶች እዚህ ይመዘገባሉ። የክፍያ ፍሰት፣ የቅርንጫፍ መለያየት፣ Attendance እና የነባር ፈቃዶች ባህሪ አይቀይሩም።</p></div>
   <div className="flex flex-wrap justify-end gap-3"><button type="button" className="btn-secondary" disabled={saving} onClick={()=>{const org=organizations.find(o=>o.id===organizationId);setForm({...defaults,company_name:org?.name||''});setError('');setSuccess('')}}>ነባሪ መመለስ</button><button type="submit" className="btn" disabled={saving}>{saving?'በማስቀመጥ ላይ…':'ቅንብሮችን አስቀምጥ'}</button></div>
  </form>}
 </section>
}
