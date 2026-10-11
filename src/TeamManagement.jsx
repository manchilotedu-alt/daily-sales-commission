import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from './lib/supabase'

const roleNames={lead:'መሪ ሻጭ',assistant:'ረዳት',driver:'ሾፌር'}
const money=n=>Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})
const today=()=>new Date().toISOString().slice(0,10)
async function teamAction(body){const {data,error}=await supabase.functions.invoke('manage-team',{body});if(error)throw error;if(data?.error)throw new Error(data.error);return data}

export function TeamManagement({currentUser}){
 const global=['super_admin','admin'].includes(currentUser.role)
 const [teams,setTeams]=useState([]),[users,setUsers]=useState([]),[vehicles,setVehicles]=useState([]),[splits,setSplits]=useState([]),[selected,setSelected]=useState(''),[teamState,setTeamState]=useState(null)
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[teamName,setTeamName]=useState(''),[vehicle,setVehicle]=useState('')
 const [lead,setLead]=useState(''),[assistants,setAssistants]=useState(['']),[driver,setDriver]=useState(''),[effectiveFrom,setEffectiveFrom]=useState(today())
 const [splitLines,setSplitLines]=useState([{role_code:'lead',employee_position:1,percentage:50,residual_eligible:true},{role_code:'driver',employee_position:1,percentage:20,residual_eligible:false}])
 const [confirmChange,setConfirmChange]=useState(false)
 const load=async()=>{
  setError('')
  try{
   let tq=supabase.from('teams').select('id,name,status,vehicle_id,branch_id,organization_id,created_at').order('created_at',{ascending:false})
   let uq=supabase.from('profiles').select('id,full_name,phone,role,active,organization_id,branch_id').eq('active',true).order('full_name')
   let sq=supabase.from('team_split_versions').select('id,version,status,effective_from,effective_to,submitted_by,submitted_at,approved_by,approved_at,returned_reason,team_structure_id').order('created_at',{ascending:false})
   let vq=supabase.from('vehicles').select('id,plate_number,vehicle_code,branch_id,organization_id,status').eq('status','active').order('plate_number')
   if(!global){tq=tq.eq('organization_id',currentUser.organization_id).eq('branch_id',currentUser.branch_id);uq=uq.eq('organization_id',currentUser.organization_id).eq('branch_id',currentUser.branch_id);vq=vq.eq('organization_id',currentUser.organization_id).eq('branch_id',currentUser.branch_id)}
   const [t,u,s,v]=await Promise.all([tq,uq,sq,vq])
   if(t.error||u.error||s.error||v.error)throw t.error||u.error||s.error||v.error
   const teamRows=t.data||[],teamIds=new Set(teamRows.map(x=>x.id))
   let splitRows=s.data||[]
   if(!global&&teamIds.size){const {data:structures,error}=await supabase.from('team_structures').select('id,team_id').in('team_id',[...teamIds]);if(error)throw error;const ids=new Set((structures||[]).map(x=>x.id));splitRows=splitRows.filter(x=>ids.has(x.team_structure_id))}
   setTeams(teamRows);setUsers(u.data||[]);setVehicles(v.data||[]);setSplits(splitRows)
   if(!selected&&teamRows.length)setSelected(teamRows[0].id)
  }catch(e){setError(e.message||'መረጃውን መጫን አልተቻለም')}
 }
 const loadState=async(teamId,date=today())=>{
  if(!teamId){setTeamState(null);return}
  try{
   const state=await teamAction({action:'get_team_state',team_id:teamId,as_of:date})
   setTeamState(state)
   const rows=state.assignments||[]
   const leader=rows.find(x=>x.team_role==='lead'),driverRow=rows.find(x=>x.team_role==='driver')
   const assistantRows=rows.filter(x=>x.team_role==='assistant').sort((a,b)=>Number(a.employee_position||1)-Number(b.employee_position||1))
   setLead(leader?.employee_id||'');setDriver(driverRow?.employee_id||'')
   setAssistants(assistantRows.length?assistantRows.map(x=>x.employee_id):[''])
   const lines=state.split?.team_split_lines||[]
   if(lines.length){setSplitLines(lines.map(x=>({role_code:x.role_code,employee_position:Number(x.employee_position),percentage:Number(x.percentage),residual_eligible:!!x.residual_eligible})));setConfirmChange(false)}
   else setSplitLines(defaultLines(assistantRows.length))
  }catch(e){setError(e.message||'የቡድኑን ሁኔታ ማምጣት አልተቻለም')}
 }
 useEffect(()=>{load()},[])
 useEffect(()=>{if(selected)loadState(selected,effectiveFrom)},[selected,effectiveFrom])
 const defaultLines=(assistantCount)=>{
  const rows=[{role_code:'lead',employee_position:1,percentage:50,residual_eligible:true}]
  for(let i=1;i<=assistantCount;i++)rows.push({role_code:'assistant',employee_position:i,percentage:Math.floor(30/Math.max(assistantCount,1)*100)/100,residual_eligible:false})
  rows.push({role_code:'driver',employee_position:1,percentage:assistantCount?20:50,residual_eligible:!assistantCount})
  const sum=rows.reduce((n,x)=>n+x.percentage,0)
  rows[0].percentage=Number((rows[0].percentage+100-sum).toFixed(2))
  return rows
 }
 const visibleUsers=useMemo(()=>users,[users])
 const leadOptions=visibleUsers.filter(u=>['lead','lead_sales','assistant'].includes(u.role))
 const assistantOptions=leadOptions
 const driverOptions=visibleUsers.filter(u=>u.role==='driver')
 const rosterAssignments=()=>{
  const rows=[]
  if(lead)rows.push({team_role:'lead',employee_id:lead,employee_position:1})
  assistants.filter(Boolean).forEach((id,i)=>rows.push({team_role:'assistant',employee_id:id,employee_position:i+1}))
  if(driver)rows.push({team_role:'driver',employee_id:driver,employee_position:1})
  return rows
 }
 const structureCount=assistants.filter(Boolean).length
 const shapeLabel=`1+${structureCount}+1`
 const splitSum=splitLines.reduce((n,x)=>n+Number(x.percentage||0),0)
 const create=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{const r=await teamAction({action:'create_team',name:teamName,vehicle_id:vehicle||null,organization_id:currentUser.organization_id,branch_id:currentUser.branch_id});setTeamName('');setVehicle('');await load();setSelected(r.team_id)}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const assign=async e=>{
  e.preventDefault();if(!selected)return setError('ቡድን ይምረጡ')
  if(!lead||!driver)return setError('መሪ ሻጭ እና ሾፌር ይምረጡ')
  const rows=rosterAssignments()
  if(new Set(rows.map(x=>x.employee_id)).size!==rows.length)return setError('አንድ ሰራተኛን በአንድ ቡድን ውስጥ ሁለት ቦታ ላይ መመደብ አይቻልም')
  setBusy(true);setError('')
  try{await teamAction({action:'set_assignments',team_id:selected,assignments:rows,effective_from:effectiveFrom});await loadState(selected,effectiveFrom);await load()}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const updateAssistant=(index,value)=>setAssistants(prev=>prev.map((x,i)=>i===index?value:x))
 const addAssistant=()=>setAssistants(prev=>[...prev,''])
 const removeAssistant=index=>setAssistants(prev=>{const next=prev.filter((_,i)=>i!==index);return next.length?next:['']})
 const prepareSplit=()=>{
  const n=assistants.filter(Boolean).length
  setSplitLines(defaultLines(n));setConfirmChange(true)
 }
 const submitSplit=async e=>{
  e.preventDefault();if(!selected)return setError('ቡድን ይምረጡ')
  if(!teamState?.structure)return setError('መጀመሪያ የቡድን ምደባውን አስቀምጡ')
  if(Math.abs(Math.round(splitSum*100)-10000)>0)return setError('የSplit ድምር 100% መሆን አለበት')
  setBusy(true);setError('')
  try{await teamAction({action:'create_split',team_id:selected,lines:splitLines,effective_from:effectiveFrom,confirm_change:confirmChange});setConfirmChange(false);await loadState(selected,effectiveFrom);await load()}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const review=async(s,decision)=>{
  setBusy(true);setError('')
  try{await teamAction({action:'review_split',split_version_id:s.id,decision});await loadState(selected,effectiveFrom);await load()}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <section className="space-y-5">
  <div><h2 className="text-2xl font-black">የሽያጭ ቡድን እና የኮሚሽን ክፍፍል</h2><p className="text-sm text-zinc-500">የቡድን ምደባ በየቀኑ አይደገምም፤ እስኪቀየር ድረስ ይቀጥላል። ለውጥ ሲኖር የሚጀምርበትን ቀን ይምረጡ።</p></div>
  {error&&<div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
  <form onSubmit={create} className="grid gap-3 rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-3">
   <input className="input" required placeholder="የቡድን ስም" value={teamName} onChange={e=>setTeamName(e.target.value)}/>
   <select className="input" value={vehicle} onChange={e=>setVehicle(e.target.value)}><option value="">መኪና አልተመደበም (አማራጭ)</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate_number}{v.vehicle_code?` · ${v.vehicle_code}`:''}</option>)}</select>
   <button className="btn" disabled={busy}>ቡድን ፍጠር</button>
  </form>
  <div className="grid gap-4 lg:grid-cols-2">
   <div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
    <h3 className="font-bold mb-3">ቡድኖች</h3>
    <div className="space-y-2">{teams.map(t=><button type="button" key={t.id} onClick={()=>setSelected(t.id)} className={`w-full rounded-xl border p-3 text-left ${selected===t.id?'border-emerald-500 bg-emerald-500/10':''}`}><b>{t.name}</b><div className="text-xs text-zinc-500">{t.status} · {t.vehicle_id||'መኪና አልተመደበም'}</div></button>)}{!teams.length&&<div className="text-sm text-zinc-500">ቡድን የለም።</div>}</div>
   </div>
   <form onSubmit={assign} className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
    <h3 className="font-bold mb-1">የቡድን ምደባ</h3><p className="mb-3 text-xs text-zinc-500">የአሁኑ አደረጃጀት፦ {shapeLabel} · ረዳቶች ከ0 ጀምሮ ሊሆኑ ይችላሉ</p>
    <label className="mb-3 block text-sm">ለውጡ የሚጀምርበት ቀን<input className="input mt-1" type="date" required value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)}/></label>
    <label className="mb-3 block text-sm">መሪ ሻጭ<select className="input mt-1" value={lead} onChange={e=>setLead(e.target.value)} required><option value="">ይምረጡ</option>{leadOptions.map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</select></label>
    <div className="mb-3 space-y-2"><div className="text-sm font-medium">ረዳቶች</div>{assistants.map((id,i)=><div key={i} className="flex gap-2"><select className="input" value={id} onChange={e=>updateAssistant(i,e.target.value)}><option value="">ረዳት ይምረጡ (አማራጭ)</option>{assistantOptions.map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</select><button type="button" className="btn-secondary" onClick={()=>removeAssistant(i)}>አስወግድ</button></div>)}<button type="button" className="btn-secondary" onClick={addAssistant}>+ ረዳት ጨምር</button></div>
    <label className="mb-3 block text-sm">ሾፌር<select className="input mt-1" value={driver} onChange={e=>setDriver(e.target.value)} required><option value="">ይምረጡ</option>{driverOptions.map(u=><option key={u.id} value={u.id}>{u.full_name} · {u.phone||'ስልክ የለም'}</option>)}</select></label>
    <button className="btn w-full" disabled={busy||!selected}>የቡድን ምደባ አስቀምጥ</button>
   </form>
  </div>
  {teamState?.assignments?.length>0&&<div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><h3 className="mb-2 font-bold">የተመደቡ ሰራተኞች — {teamState.as_of}</h3><div className="flex flex-wrap gap-2">{teamState.assignments.map(a=><span key={a.id} className="rounded-full border px-3 py-1 text-sm">{roleNames[a.team_role]||a.team_role} {a.employee_position>1?'#'+a.employee_position:''} · {a.profiles?.full_name||a.employee_id}</span>)}</div></div>}
  <form onSubmit={submitSplit} className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
   <h3 className="font-bold">የኮሚሽን Split ማስቀመጫ</h3><p className="mt-1 text-xs text-zinc-500">ለዚህ የቡድን አወቃቀር አንድ ጊዜ ያስቀምጡ። እንደገና እስካልቀየሩት ድረስ ይህ ስርዓት ይጠቀምበታል። ለውጥ ሲያስፈልግ ብቻ የለውጥ ሁኔታን ያንቁ።</p>
   <div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-zinc-100 px-3 py-1 text-sm dark:bg-zinc-800">Structure: {shapeLabel}</span><span className="text-xs text-zinc-500">{teamState?.split?('የተፈቀደ Split አለ።'): 'ገና የተፈቀደ Split የለም።'}</span><button type="button" className="btn-secondary" onClick={prepareSplit}>Split አዘጋጅ / አስተካክል</button></div>
   <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{splitLines.map((l,i)=><label key={l.role_code+'-'+l.employee_position} className="text-sm">{roleNames[l.role_code]||l.role_code}{l.role_code==='assistant'?' #'+l.employee_position:''} (%)<input className="input mt-1" type="number" min="0" max="100" step="0.01" value={l.percentage} onChange={e=>setSplitLines(prev=>prev.map((x,j)=>j===i?{...x,percentage:e.target.value}:x))}/></label>)}</div>
   <div className="mt-3 text-sm font-bold">ድምር፦ {money(splitSum)}%</div>
   {teamState?.split&&<label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmChange} onChange={e=>setConfirmChange(e.target.checked)}/> ነባሩን Split በአዲስ ስሪት ለመቀየር እፈልጋለሁ</label>}
   <button className="btn mt-3" disabled={busy||!selected||!teamState?.structure||!confirmChange&&!teamState?.split&&false}>Split ለSuper Admin ላክ</button>
  </form>
  <div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
   <h3 className="font-bold mb-3">የSplit ማጽደቂያ እና ታሪክ</h3>
   <div className="space-y-2">{splits.map(s=><div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><b>Version {s.version}</b><div className="text-xs text-zinc-500">{s.effective_from} · {s.status}{s.returned_reason?' · '+s.returned_reason:''}</div></div>{global&&s.status==='pending'&&<div className="flex gap-2"><button type="button" className="btn" disabled={busy} onClick={()=>review(s,'approve')}>አጽድቅ</button><button type="button" className="btn-secondary" disabled={busy} onClick={()=>review(s,'return')}>መልስ</button></div>}</div>)}{!splits.length&&<div className="text-sm text-zinc-500">የSplit ስሪት አልተገኘም።</div>}</div>
  </div>
 </section>
}
