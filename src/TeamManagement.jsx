import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from './lib/supabase'

const roleNames={lead:'መሪ ሻጭ',lead_sales:'መሪ ሻጭ',assistant:'ረዳት',driver:'ሾፌር'}
const money=n=>Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})
const today=()=>new Date().toISOString().slice(0,10)

async function teamAction(body){const {data,error}=await supabase.functions.invoke('manage-team',{body});if(error)throw error;if(data?.error)throw new Error(data.error);return data}

export function TeamManagement({currentUser}){
 const global=['super_admin','admin'].includes(currentUser.role)
 const [teams,setTeams]=useState([]),[users,setUsers]=useState([]),[splits,setSplits]=useState([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [teamName,setTeamName]=useState(''),[vehicle,setVehicle]=useState('')
 const [members,setMembers]=useState({lead:'',assistant:'',driver:''})
 const [split,setSplit]=useState({lead:50,assistant:30,driver:20})
 const load=async()=>{
  setError('')
  try{
   let tq=supabase.from('teams').select('id,name,status,vehicle_id,branch_id,organization_id,created_at').order('created_at',{ascending:false})
   let uq=supabase.from('profiles').select('id,full_name,role,active,organization_id,branch_id').eq('active',true).order('full_name')
   let sq=supabase.from('team_split_versions').select('id,version,status,effective_from,effective_to,submitted_by,submitted_at,approved_by,approved_at,returned_reason,team_structure_id').order('created_at',{ascending:false})
   if(!global){tq=tq.eq('organization_id',currentUser.organization_id).eq('branch_id',currentUser.branch_id);uq=uq.eq('organization_id',currentUser.organization_id).eq('branch_id',currentUser.branch_id);sq=sq.eq('team_structure_id','00000000-0000-0000-0000-000000000000')}
   const [t,u,s]=await Promise.all([tq,uq,sq])
   if(t.error||u.error||s.error)throw t.error||u.error||s.error
   setTeams(t.data||[]);setUsers(u.data||[]);setSplits(s.data||[])
  }catch(e){setError(e.message)}
 }
 useEffect(()=>{load()},[])
 const visibleUsers=useMemo(()=>users,[users])
 const create=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{
   const r=await teamAction({action:'create_team',name:teamName,vehicle_id:vehicle||null,organization_id:currentUser.organization_id,branch_id:currentUser.branch_id})
   setTeamName('');setVehicle('');setSelected(r.team_id);await load()
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const assign=async e=>{
  e.preventDefault();if(!selected) return setError('ቡድን ይምረጡ')
  setBusy(true);setError('')
  try{await teamAction({action:'set_assignments',team_id:selected,assignments:Object.entries(members).filter(([,id])=>id).map(([team_role,employee_id])=>({team_role,employee_id,effective_from:today()}))});await load()}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const submitSplit=async e=>{
  e.preventDefault();if(!selected)return setError('ቡድን ይምረጡ')
  const sum=Number(split.lead)+Number(split.assistant)+Number(split.driver)
  if(sum!==100)return setError('የSplit ድምር 100% መሆን አለበት')
  setBusy(true);setError('')
  try{await teamAction({action:'create_split',team_id:selected,percentages:split,effective_from:today()});await load()}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const review=async(s,action)=>{
  setBusy(true);setError('')
  try{await teamAction({action:'review_split',split_version_id:s.id,decision:action});await load()}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <section className="space-y-5">
  <div><h2 className="text-2xl font-black">ቡድን፣ ሰራተኛ እና Split</h2><p className="text-sm text-zinc-500">Branch Manager ቡድንና የSplit መቶኛን ያዘጋጃል፤ Super Admin ያጸድቃል።</p></div>
  {error&&<div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
  <form onSubmit={create} className="grid gap-3 rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-3">
   <input className="input" required placeholder="የቡድን ስም" value={teamName} onChange={e=>setTeamName(e.target.value)}/>
   <input className="input" placeholder="Vehicle ID / Plate (አማራጭ)" value={vehicle} onChange={e=>setVehicle(e.target.value)}/>
   <button className="btn" disabled={busy}>ቡድን ፍጠር</button>
  </form>
  <div className="grid gap-4 lg:grid-cols-2">
   <div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
    <h3 className="font-bold mb-3">ቡድኖች</h3>
    <div className="space-y-2">{teams.map(t=><button type="button" key={t.id} onClick={()=>setSelected(t.id)} className={`w-full rounded-xl border p-3 text-left ${selected===t.id?'border-emerald-500 bg-emerald-500/10':''}`}><b>{t.name}</b><div className="text-xs text-zinc-500">{t.status} · {t.vehicle_id||'Vehicle የለም'}</div></button>)}{!teams.length&&<div className="text-sm text-zinc-500">ቡድን የለም።</div>}</div>
   </div>
   <form onSubmit={assign} className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
    <h3 className="font-bold mb-3">የአሁኑ ቡድን ምደባ</h3>
    {Object.entries(roleNames).filter(([r])=>['lead','assistant','driver'].includes(r)).map(([r,l])=><label key={r} className="mb-3 block text-sm">{l}<select className="input mt-1" value={members[r]||''} onChange={e=>setMembers({...members,[r]:e.target.value})}><option value="">አልተመረጠም</option>{visibleUsers.filter(u=>r==='lead'?['lead','lead_sales'].includes(u.role):u.role===r).map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</select></label>)}
    <button className="btn w-full" disabled={busy||!selected}>ምደባ አስቀምጥ</button>
   </form>
  </div>
  <form onSubmit={submitSplit} className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
   <h3 className="font-bold">Team Split ማቅረብ</h3><p className="text-xs text-zinc-500 mt-1">አዲስ ስሪት ይፈጠራል፤ ቀጥታ የተፈቀደ Split አይቀየርም።</p>
   <div className="mt-3 grid gap-3 sm:grid-cols-3">{Object.entries(split).map(([k,v])=><label key={k} className="text-sm">{roleNames[k]||k}<input className="input mt-1" type="number" min="0" max="100" step="0.01" value={v} onChange={e=>setSplit({...split,[k]:e.target.value})}/></label>)}</div>
   <div className="mt-3 text-sm font-bold">ድምር፦ {Number(split.lead)+Number(split.assistant)+Number(split.driver)}%</div>
   <button className="btn mt-3" disabled={busy||!selected}>ለSuper Admin ላክ</button>
  </form>
  <div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
   <h3 className="font-bold mb-3">የSplit ማጽደቂያ</h3>
   <div className="space-y-2">{splits.map(s=><div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><b>Version {s.version}</b><div className="text-xs text-zinc-500">{s.effective_from} · {s.status}{s.returned_reason?' · '+s.returned_reason:''}</div></div>{global&&s.status==='pending'&&<div className="flex gap-2"><button className="btn" disabled={busy} onClick={()=>review(s,'approve')}>አጽድቅ</button><button className="btn-secondary" disabled={busy} onClick={()=>review(s,'return')}>መልስ</button></div>}</div>)}{!splits.length&&<div className="text-sm text-zinc-500">የSplit ስሪት አልተገኘም።</div>}</div>
  </div>
 </section>
}
