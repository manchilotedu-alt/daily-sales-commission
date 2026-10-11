import React,{useEffect,useState} from 'react'
import {supabase} from './lib/supabase'

export function ManagementRoles({currentUser}){
 const [roles,setRoles]=useState([]),[permissions,setPermissions]=useState([]),[selected,setSelected]=useState(null)
 const [form,setForm]=useState({code:'',name_am:'',name_en:'',description:''}),[enabled,setEnabled]=useState({})
 const [error,setError]=useState(''),[busy,setBusy]=useState(false)
 const load=async()=>{
  const [r,p]=await Promise.all([
   supabase.from('management_roles').select('id,code,name_am,name_en,description,active,created_at').order('created_at',{ascending:false}),
   supabase.from('permissions').select('code,name_am,module,active').eq('active',true).order('module').order('id')
  ])
  if(r.error||p.error)throw r.error||p.error
  setRoles(r.data||[]);setPermissions(p.data||[])
 }
 useEffect(()=>{load().catch(e=>setError(e.message))},[])
 const selectRole=async r=>{
  setSelected(r);setForm({code:r.code.replace(/^custom_/,'').replace(/_/g,' '),name_am:r.name_am||'',name_en:r.name_en||'',description:r.description||''})
  const {data,error}=await supabase.from('management_role_permissions').select('permission_code,enabled').eq('role_id',r.id)
  if(error){setError(error.message);return}
  const m={};(data||[]).forEach(x=>m[x.permission_code]=x.enabled);setEnabled(m)
 }
 const save=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{
   const code='custom_'+form.code.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')
   if(code.length<9)throw new Error('የሚና ኮድ ቢያንስ 2 የእንግሊዝኛ ፊደል/ቁጥር ይኑረው።')
   if(!form.name_am.trim())throw new Error('የሚና ስም በአማርኛ ያስገቡ።')
   const permissionRows=permissions.map(p=>({permission_code:p.code,enabled:!!enabled[p.code]}))
   const {data,error}=await supabase.functions.invoke('manage-user',{body:{action:'management_role',role_id:selected?.id||null,code,name_am:form.name_am.trim(),name_en:form.name_en.trim()||null,description:form.description.trim()||null,permissions:permissionRows}})
   if(error)throw error;if(data?.error)throw new Error(data.error)
   setSelected(null);setForm({code:'',name_am:'',name_en:'',description:''});setEnabled({});await load()
  }catch(e){setError(e.message||'ሚናውን ማስቀመጥ አልተቻለም።')}finally{setBusy(false)}
 }
 const toggle=async r=>{
  setBusy(true);setError('')
  try{const {data,error}=await supabase.functions.invoke('manage-user',{body:{action:'management_role_status',role_id:r.id,active:!r.active}});if(error)throw error;if(data?.error)throw new Error(data.error);await load()}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <section className="space-y-5">
  <div><h2 className="text-2xl font-bold">የአስተዳደር ሚናዎች</h2><p className="text-sm text-zinc-500">Super Admin/Admin ሚና ይፍጠሩ፣ ፈቃዶችን ON/OFF ያድርጉ። የቅርንጫፍ አስተዳዳሪ ይህን ገጽ ማስተዳደር አይችልም።</p></div>
  {error&&<div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600">{error}</div>}
  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
   <div className="rounded-2xl border bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><h3 className="mb-3 font-bold">ያሉ ሚናዎች</h3><div className="space-y-2">{roles.map(r=><div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 dark:border-zinc-700"><button type="button" className="min-w-0 text-left" onClick={()=>selectRole(r)}><b className="block">{r.name_am}</b><span className="text-xs text-zinc-500">{r.code}</span></button><div className="flex items-center gap-2"><span className={r.active?'text-emerald-600':'text-rose-500'}>{r.active?'ንቁ':'የተዘጋ'}</span><button type="button" disabled={busy} className="btn-secondary" onClick={()=>toggle(r)}>{r.active?'አቦዝን':'አንቃ'}</button></div></div>)}{!roles.length&&<p className="text-sm text-zinc-500">እስካሁን ተጨማሪ ሚና የለም።</p>}</div><button type="button" className="btn mt-4 w-full" onClick={()=>{setSelected(null);setForm({code:'',name_am:'',name_en:'',description:''});setEnabled({})}}>አዲስ ሚና ፍጠር</button></div>
   <form onSubmit={save} className="rounded-2xl border bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><h3 className="mb-3 font-bold">{selected?'ሚና አስተካክል':'አዲስ ሚና ፍጠር'}</h3><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">የሚና ኮድ<input className="input mt-1" required disabled={!!selected} placeholder="finance_officer" value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/></label><label className="text-sm">ስም (አማርኛ)<input className="input mt-1" required value={form.name_am} onChange={e=>setForm({...form,name_am:e.target.value})}/></label><label className="text-sm">Name (English)<input className="input mt-1" value={form.name_en} onChange={e=>setForm({...form,name_en:e.target.value})}/></label><label className="text-sm">መግለጫ<input className="input mt-1" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label></div><div className="mt-5"><div className="mb-2 font-bold">የገጽ/ተግባር ፈቃዶች — ON / OFF</div><div className="grid gap-2 sm:grid-cols-2">{permissions.map(p=><label key={p.code} className="flex items-center justify-between gap-2 rounded-lg border p-3 dark:border-zinc-700"><span className="min-w-0"><b className="block">{p.name_am||p.code}</b><span className="text-xs text-zinc-500">{p.module} · {p.code}</span></span><input type="checkbox" checked={!!enabled[p.code]} onChange={e=>setEnabled({...enabled,[p.code]:e.target.checked})}/></label>)}</div></div><div className="mt-4 flex gap-2"><button disabled={busy} className="btn">{busy?'በማስቀመጥ ላይ…':'ሚናና ፈቃዶች አስቀምጥ'}</button>{selected&&<button type="button" className="btn-secondary" onClick={()=>{setSelected(null);setForm({code:'',name_am:'',name_en:'',description:''});setEnabled({})}}>ይቅር</button>}</div></form>
  </div>
 </section>
}
