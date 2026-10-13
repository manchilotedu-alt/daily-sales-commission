import React,{useEffect,useState} from 'react'
import {supabase} from './lib/supabase'

export function DepartmentManagement({currentUser}){
 const canManage=['super_admin','admin'].includes(currentUser?.role)
 const [organizations,setOrganizations]=useState([])
 const [departments,setDepartments]=useState([])
 const [organizationId,setOrganizationId]=useState(currentUser?.organization_id||'')
 const [name,setName]=useState('')
 const [code,setCode]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const load=async()=>{
  const [orgResult,departmentResult]=await Promise.all([
   supabase.from('organizations').select('id,name,active').order('name'),
   supabase.from('organization_departments').select('id,organization_id,name,code,active,created_at').order('name')
  ])
  if(orgResult.error)throw orgResult.error
  if(departmentResult.error)throw departmentResult.error
  setOrganizations(orgResult.data||[])
  setDepartments(departmentResult.data||[])
 }
 useEffect(()=>{if(canManage)load().catch(e=>setError(e.message||'የክፍሎች ዝርዝር መጫን አልተቻለም።'))},[canManage])
 const create=async e=>{
  e.preventDefault();setError('');setSuccess('')
  const cleanName=name.trim(),cleanCode=code.trim()||null
  if(!organizationId||!cleanName){setError('ድርጅትና የክፍል ስም ይምረጡ/ያስገቡ።');return}
  setBusy(true)
  try{
   const {data,error}=await supabase.from('organization_departments').insert({organization_id:organizationId,name:cleanName,code:cleanCode}).select('id,name').single()
   if(error)throw error
   if(!data?.id)throw new Error('ክፍሉ መቀመጡን ማረጋገጥ አልተቻለም።')
   setName('');setCode('');setSuccess('“'+data.name+'” ክፍል ተቀምጧል።')
   await load()
  }catch(e){setError(e.message||'ክፍሉን ማስቀመጥ አልተቻለም።')}finally{setBusy(false)}
 }
 const rename=async row=>{
  const next=prompt('የክፍሉ ስም:',row.name)
  if(!next||!next.trim()||next.trim()===row.name)return
  setError('');setSuccess('');setBusy(true)
  try{const {error}=await supabase.from('organization_departments').update({name:next.trim()}).eq('id',row.id);if(error)throw error;setSuccess('የክፍሉ ስም ተቀይሯል።');await load()}
  catch(e){setError(e.message||'ስሙን መቀየር አልተቻለም።')}finally{setBusy(false)}
 }
 const toggle=async row=>{
  setError('');setSuccess('');setBusy(true)
  try{const {error}=await supabase.from('organization_departments').update({active:!row.active}).eq('id',row.id);if(error)throw error;setSuccess(row.active?'ክፍሉ ተዘግቷል።':'ክፍሉ ነቅቷል።');await load()}
  catch(e){setError(e.message||'ሁኔታውን መቀየር አልተቻለም።')}finally{setBusy(false)}
 }
 if(!canManage)return null
 const visible=departments.filter(d=>!organizationId||d.organization_id===organizationId)
 return <section className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
  <div><h2 className="text-xl font-bold">የድርጅት ክፍሎች</h2><p className="mt-1 text-sm text-zinc-500">እንደ Human Resources፣ Finance እና Operations ያሉ ክፍሎችን በድርጅታቸው ስር ይመዝግቡ።</p></div>
  {error&&<div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
  {success&&<div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{success}</div>}
  <form onSubmit={create} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
   <select className="input" required value={organizationId} onChange={e=>setOrganizationId(e.target.value)}><option value="">ድርጅት ይምረጡ</option>{organizations.map(o=><option key={o.id} value={o.id} disabled={!o.active}>{o.name}{!o.active?' (ዝግ)':''}</option>)}</select>
   <input className="input" required maxLength={120} placeholder="የክፍል ስም (ለምሳሌ Finance)" value={name} onChange={e=>setName(e.target.value)}/>
   <input className="input" maxLength={40} placeholder="የክፍል ኮድ (አማራጭ)" value={code} onChange={e=>setCode(e.target.value)}/>
   <button className="btn" disabled={busy||!organizationId}>{busy?'በማስቀመጥ ላይ…':'ክፍል ጨምር'}</button>
  </form>
  <div className="space-y-2">{visible.map(d=><div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-zinc-700"><div><div className="font-semibold">{d.name}</div><div className="text-xs text-zinc-500">{organizations.find(o=>o.id===d.organization_id)?.name||'ድርጅት'} · {d.code||'ኮድ የለውም'}</div></div><div className="flex items-center gap-2"><span className={d.active?'text-xs text-emerald-600':'text-xs text-zinc-500'}>{d.active?'ንቁ':'ዝግ'}</span><button type="button" disabled={busy} className="btn-secondary" onClick={()=>rename(d)}>ስም ቀይር</button><button type="button" disabled={busy} className="btn-secondary" onClick={()=>toggle(d)}>{d.active?'አቁም':'አንቃ'}</button></div></div>)}{visible.length===0&&<p className="rounded-xl border border-dashed p-4 text-sm text-zinc-500">ለዚህ ድርጅት የተመዘገበ ክፍል የለም።</p>}</div>
 </section>
}
