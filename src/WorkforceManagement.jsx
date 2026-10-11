import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from './lib/supabase'

const today=()=>new Date().toISOString().slice(0,10)
const money=n=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const isSalesRole=r=>['lead','lead_sales','assistant'].includes(r)
const staffType=r=>r==='driver'?'driver':'sales'
const roleLabel=r=>staffType(r)==='driver'?'ሹፌር':'ሴልስ'
const attendanceLabel=s=>s==='present'?'ተገኝቷል':s==='absent'?'ቀሪ':s==='late'?'ዘግይቶ መጣ':s==='leave'?'ፈቃድ':s==='sick_leave'?'የህመም ፈቃድ':s==='official_duty'?'በመደበኛ ስራ ላይ':'—'
const statusLabel=s=>({active:'ንቁ',inactive:'ቦዝኗል',fired:'ከስራ ተሰናብቷል',resigned:'ራሱን አግልሏል',promoted:'ደረጃ ከፍ ብሏል',suspended:'ታግዷል'})[s]||s||'—'
const dateText=d=>d.toISOString().slice(0,10)
function dateRanges(date){
 const d=new Date(date+'T00:00:00Z')
 const dayStart=new Date(d),dayEnd=new Date(d)
 const weekday=d.getUTCDay()||7
 const weekStart=new Date(d),weekEnd=new Date(d)
 weekStart.setUTCDate(d.getUTCDate()-weekday+1)
 weekEnd.setUTCDate(weekStart.getUTCDate()+6)
 const monthStart=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1))
 const monthEnd=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0))
 const periods={
  day:{label:'ዕለታዊ',from:dateText(dayStart),to:dateText(dayEnd)},
  week:{label:'ሳምንታዊ',from:dateText(weekStart),to:dateText(weekEnd)},
  month:{label:'ወርሃዊ',from:dateText(monthStart),to:dateText(monthEnd)}
 }
 return {periods,from:[periods.week.from,periods.month.from].sort()[0],to:[periods.week.to,periods.month.to].sort().reverse()[0]}
}
async function act(body){
 const {data,error}=await supabase.functions.invoke('manage-workforce',{body})
 if(error)throw error
 if(data?.error)throw new Error(data.error)
 return data
}

export function WorkforceManagement({currentUser}){
 const global=['super_admin','admin'].includes(currentUser.role)
 const branchAdmin=currentUser.role==='branch_admin'
 const permissions=currentUser.management_permissions||[]
 const orgWide=global||(String(currentUser.role||'').startsWith('custom_')&&permissions.some(p=>p.permission_code==='attendance.manage'))
 const canManageAttendance=global||branchAdmin||permissions.some(p=>p.permission_code==='attendance.manage')
 const canSeePerformance=global||branchAdmin||permissions.some(p=>['sales.review','commission.view','earnings.view','performance.view','reports.export'].includes(p.permission_code))
 const [users,setUsers]=useState([])
 const [branches,setBranches]=useState([])
 const [organizations,setOrganizations]=useState([])
 const [selected,setSelected]=useState(null)
 const [date,setDate]=useState(today())
 const [search,setSearch]=useState('')
 const [attendanceRows,setAttendanceRows]=useState([])
 const [reasonById,setReasonById]=useState({})
 const [salesRows,setSalesRows]=useState([])
 const [history,setHistory]=useState([])
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const ranges=useMemo(()=>dateRanges(date),[date])
 const rosterById=useMemo(()=>Object.fromEntries(attendanceRows.map(r=>[r.employee_id,r])),[attendanceRows])
 const selectedUser=users.find(u=>u.id===selected?.id)||selected

 const loadUsers=async()=>{
  setLoading(true);setError('')
  try{
   let q=supabase.from('profiles').select('id,full_name,phone,role,active,employee_status,status_effective_date,created_at,organization_id,branch_id,plate_number').in('role',['lead','lead_sales','assistant','driver']).order('full_name')
   if(!global)q=q.eq('organization_id',currentUser.organization_id)
   if(!orgWide)q=q.eq('branch_id',currentUser.branch_id)
   const [p,b,o]=await Promise.all([
    q,
    supabase.from('branches').select('id,name,organization_id').order('name'),
    supabase.from('organizations').select('id,name').order('name')
   ])
   if(p.error||b.error||o.error)throw p.error||b.error||o.error
   const people=p.data||[]
   setUsers(people)
   setBranches((b.data||[]).filter(x=>global||x.organization_id===currentUser.organization_id))
   setOrganizations((o.data||[]).filter(x=>global||x.id===currentUser.organization_id))
   if(selected&&!people.some(x=>x.id===selected.id))setSelected(null)
  }catch(e){setError(e.message||'የሰራተኞች መረጃ መጫን አልተቻለም')}
  finally{setLoading(false)}
 }

 const loadRoster=async()=>{
  if(!canManageAttendance){setAttendanceRows([]);return}
  try{
   const r=await act({action:'get_team_attendance_roster',work_date:date})
   const rows=r.employees||[]
   setAttendanceRows(rows)
   setReasonById(Object.fromEntries(rows.map(x=>[x.employee_id,x.reason||''])))
  }catch(e){setError(e.message||'የAttendance ዝርዝር መጫን አልተቻለም')}
 }

 const loadPerformance=async()=>{
  if(!canSeePerformance){setSalesRows([]);return}
  try{
   let q=supabase.from('sales').select('id,sale_date,status,total,total_sales_value,lead_id,lead_employee_id,assistant_id,driver_id,lead_amt,assistant_amt,driver_amt,organization_id,branch_id').eq('status','approved').gte('sale_date',ranges.from).lte('sale_date',ranges.to)
   if(!global)q=q.eq('organization_id',currentUser.organization_id)
   if(!orgWide)q=q.eq('branch_id',currentUser.branch_id)
   const {data,error}=await q.order('sale_date',{ascending:false}).limit(10000)
   if(error)throw error
   setSalesRows(data||[])
  }catch(e){setError(e.message||'የሽያጭና ኮሚሽን መረጃ መጫን አልተቻለም')}
 }

 const loadHistory=async()=>{
  if(!selectedUser){setHistory([]);return}
  const {data,error}=await supabase.from('employee_attendance').select('work_date,attendance_status,reason').eq('employee_id',selectedUser.id).gte('work_date',ranges.periods.month.from).lte('work_date',ranges.periods.month.to).order('work_date',{ascending:false}).limit(100)
  if(error){setError(error.message);setHistory([])}else setHistory(data||[])
 }

 useEffect(()=>{loadUsers()},[currentUser.id,currentUser.organization_id,currentUser.branch_id,currentUser.role])
 useEffect(()=>{loadRoster()},[date,currentUser.id])
 useEffect(()=>{loadPerformance()},[date,currentUser.id,currentUser.role])
 useEffect(()=>{loadHistory()},[selectedUser?.id,date])

 const performance=useMemo(()=>{
  const result={day:{},week:{},month:{}}
  const periodNames=['day','week','month']
  const add=(bucket,id,kind,sale)=>{
   if(!id)return
   const row=bucket[id]||(bucket[id]={count:0,sales:0,commission:0})
   row.count+=1
   row.sales+=Number(sale.total_sales_value??sale.total??0)
   row.commission+=Number(kind==='lead'?sale.lead_amt:kind==='assistant'?sale.assistant_amt:kind==='driver'?sale.driver_amt:0)||0
  }
  for(const sale of salesRows){
   const participants=new Map()
   if(sale.lead_employee_id||sale.lead_id)participants.set(sale.lead_employee_id||sale.lead_id,'lead')
   if(sale.assistant_id)participants.set(sale.assistant_id,'assistant')
   if(sale.driver_id)participants.set(sale.driver_id,'driver')
   for(const period of periodNames){
    const r=ranges.periods[period]
    if(sale.sale_date<r.from||sale.sale_date>r.to)continue
    for(const [id,kind] of participants)add(result[period],id,kind,sale)
   }
  }
  return result
 },[salesRows,ranges])

 const ranks=useMemo(()=>{
  const out={day:{},week:{},month:{}}
  for(const period of ['day','week','month']){
   const grouped=new Map()
   for(const u of users){
    const group=staffType(u.role)
    const key=String(u.organization_id||'')+'|'+String(u.branch_id||'')+'|'+group
    if(!grouped.has(key))grouped.set(key,[])
    grouped.get(key).push(u)
   }
   for(const list of grouped.values()){
    const sorted=[...list].sort((a,b)=>{
     const aa=performance[period][a.id]||{sales:0,commission:0}
     const bb=performance[period][b.id]||{sales:0,commission:0}
     return bb.sales-aa.sales||bb.commission-aa.commission||(a.full_name||'').localeCompare(b.full_name||'')
    })
    let previous=null,previousRank=0
    sorted.forEach((u,i)=>{
     const s=performance[period][u.id]||{sales:0,commission:0}
     const same=previous&&s.sales===previous.sales&&s.commission===previous.commission
     const rank=same?previousRank:i+1
     out[period][u.id]={rank,total:sorted.length}
     previous=s;previousRank=rank
    })
   }
  }
  return out
 },[users,performance])

 const filteredUsers=useMemo(()=>{
  const term=search.trim().toLowerCase()
  return users.filter(u=>!term||[u.full_name,u.phone,u.plate_number,branches.find(b=>b.id===u.branch_id)?.name,organizations.find(o=>o.id===u.organization_id)?.name].some(v=>String(v||'').toLowerCase().includes(term)))
 },[users,search,branches,organizations])

 const groups=useMemo(()=>{
  const map=new Map()
  for(const u of filteredUsers){
   const key=String(u.organization_id||'')+'|'+String(u.branch_id||'')
   if(!map.has(key)){
    const branch=branches.find(b=>b.id===u.branch_id)
    const org=organizations.find(o=>o.id===u.organization_id)
    map.set(key,{key,branchName:branch?.name||'ቅርንጫፍ አልተመደበም',orgName:org?.name||'',sales:[],drivers:[]})
   }
   const g=map.get(key)
   if(u.role==='driver')g.drivers.push(u);else g.sales.push(u)
  }
  return [...map.values()].sort((a,b)=>(a.orgName+' '+a.branchName).localeCompare(b.orgName+' '+b.branchName))
 },[filteredUsers,branches,organizations])

 const rosterCounts=useMemo(()=>({
  present:attendanceRows.filter(x=>x.attendance_status==='present'||x.attendance_status==='late').length,
  absent:attendanceRows.filter(x=>x.attendance_status==='absent').length,
  total:attendanceRows.length
 }),[attendanceRows])
 const absentEmployees=useMemo(()=>attendanceRows.filter(x=>x.attendance_status==='absent').map(x=>({...x,person:users.find(u=>u.id===x.employee_id)})).filter(x=>x.person),[attendanceRows,users])

 const saveAttendance=async()=>{
  const missing=attendanceRows.filter(x=>x.attendance_status==='absent'&&!String(reasonById[x.employee_id]||'').trim())
  if(missing.length){setError('ቀሪ የሆኑ ሰራተኞች ሁሉ የቀሪነት ምክንያት ያስገቡ።');setNotice('');return}
  setSaving(true);setError('');setNotice('')
  try{
   const r=await act({action:'save_team_attendance',work_date:date,absence_reasons:reasonById})
   setNotice('የ'+date+' Attendance ተመዝግቧል። ሴልስ፦ '+(r.sales_present||0)+' ተገኝቷል / '+(r.sales_absent||0)+' ቀሪ፤ ሹፌር፦ '+(r.drivers_present||0)+' ተገኝቷል / '+(r.drivers_absent||0)+' ቀሪ።')
   await loadRoster()
   await loadHistory()
  }catch(e){setError(e.message||'Attendance ማስቀመጥ አልተቻለም')}
  finally{setSaving(false)}
 }

 const branchFor=u=>branches.find(b=>b.id===u.branch_id)?.name||'—'
 const orgFor=u=>organizations.find(o=>o.id===u.organization_id)?.name||'—'
 const renderEmployee=(u)=> {
  const a=rosterById[u.id]
  const status=a?.attendance_status
  return <div key={u.id} className="rounded-xl border p-3 dark:border-zinc-700">
   <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
    <button type="button" onClick={()=>setSelected(u)} className="min-w-0 flex-1 text-left">
     <div className="flex flex-wrap items-center gap-2"><b>{u.full_name||'—'}</b><span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">{roleLabel(u.role)}</span>{status&&<span className={'rounded-full px-2 py-0.5 text-xs '+(status==='present'?'bg-emerald-500/10 text-emerald-600':status==='absent'?'bg-rose-500/10 text-rose-500':'bg-amber-500/10 text-amber-600')}>{attendanceLabel(status)}</span>}</div>
     <div className="mt-1 text-sm text-zinc-500">{u.phone||'ስልክ የለም'}{u.role==='driver'&&u.plate_number?' · ታርጋ: '+u.plate_number:''}</div>
    </button>
   </div>
   {!u.active&&<div className="mt-2 text-xs text-rose-500">{statusLabel(u.employee_status||'inactive')}</div>}
  </div>
 }

 return <section className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><h2 className="text-2xl font-black">ሰራተኛ እና Attendance</h2><p className="text-sm text-zinc-500">ሰራተኞች በቅርንጫፍ፣ በሴልስና በሹፌር ይከፈላሉ። Attendance ከSales Team ምደባ ይሰላል።</p></div>
   <button type="button" className="btn-secondary" onClick={()=>{loadUsers();loadRoster();loadPerformance()}} disabled={loading||saving}>መረጃ አድስ</button>
  </div>
  <div className="grid gap-3 rounded-2xl border bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-[1fr_2fr_auto]">
   <label className="text-sm">የAttendance ቀን<input className="input mt-1" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
   <label className="text-sm">ሰራተኛ ፈልግ<input className="input mt-1" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ሙሉ ስም፣ ስልክ፣ ታርጋ፣ ቅርንጫፍ"/></label>
   {canManageAttendance&&<div className="flex items-end"><button type="button" className="btn w-full" onClick={saveAttendance} disabled={saving||!attendanceRows.length}>{saving?'በማስቀመጥ ላይ…':'Attendance አስቀምጥ'}</button></div>}
  </div>
  {error&&<div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-500">{error}</div>}
  {notice&&<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600">{notice}</div>}
  <div className="grid gap-3 sm:grid-cols-3">
   <Metric label="ሰራተኞች" value={users.length}/>
   <Metric label="በዚህ ቀን ተገኝተዋል" value={rosterCounts.present}/>
   <Metric label="በዚህ ቀን ቀሪ" value={rosterCounts.absent}/>
  </div>
  {canManageAttendance&&absentEmployees.length>0&&<div className="rounded-2xl border bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><h3 className="mb-3 font-bold">የቀሪ ሰራተኞች ምክንያት</h3><p className="mb-3 text-sm text-zinc-500">ሁሉንም ቀሪ ሰራተኞች ምክንያት ያስገቡ። ይህ ዝርዝር ከላይ ባለው የፍለጋ ማጣሪያ አይደበቅም።</p><div className="grid gap-3 md:grid-cols-2">{absentEmployees.map(a=><label key={a.employee_id} className="text-sm"><span className="mb-1 block font-semibold">{a.person.full_name} · {roleLabel(a.person.role)} · {branchFor(a.person)}</span><input className="input" value={reasonById[a.employee_id]||''} onChange={e=>setReasonById(prev=>({...prev,[a.employee_id]:e.target.value}))} placeholder="የቀሪነት ምክንያት (አስፈላጊ)"/></label>)}</div></div>}
  {loading&&<div className="text-sm text-zinc-500">የሰራተኞች መረጃ በመጫን ላይ…</div>}
  {groups.map(g=><div key={g.key} className="rounded-2xl border bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
   <div className="mb-4"><h3 className="font-bold">{g.branchName}</h3><p className="text-xs text-zinc-500">{g.orgName}</p></div>
   <div className="grid gap-4 lg:grid-cols-2">
    <div><h4 className="mb-3 font-bold">ሴልስ ({g.sales.length})</h4><div className="space-y-2">{g.sales.map(renderEmployee)}{!g.sales.length&&<p className="text-sm text-zinc-500">የሴልስ ሰራተኛ የለም።</p>}</div></div>
    <div><h4 className="mb-3 font-bold">ሹፌሮች ({g.drivers.length})</h4><div className="space-y-2">{g.drivers.map(renderEmployee)}{!g.drivers.length&&<p className="text-sm text-zinc-500">ሹፌር የለም።</p>}</div></div>
   </div>
  </div>)}
  {!loading&&!groups.length&&<div className="rounded-2xl border p-8 text-center text-zinc-500">በዚህ ክልል ሰራተኛ አልተገኘም።</div>}
  {selectedUser&&<section className="space-y-4 rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
   <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-black">{selectedUser.full_name}</h3><p className="text-sm text-zinc-500">{selectedUser.phone||'ስልክ የለም'} · {roleLabel(selectedUser.role)} · {orgFor(selectedUser)} / {branchFor(selectedUser)}</p>{selectedUser.role==='driver'&&<p className="mt-1 text-sm">የታርጋ ቁጥር፦ {selectedUser.plate_number||'—'}</p>}</div><button className="btn-secondary" type="button" onClick={()=>setSelected(null)}>ዝጋ</button></div>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <Metric label="የሰራተኛ ሁኔታ" value={statusLabel(selectedUser.employee_status|| (selectedUser.active?'active':'inactive'))}/>
    <Metric label="በወሩ የተገኘባቸው ቀናት" value={history.filter(x=>['present','late'].includes(x.attendance_status)).length}/>
    <Metric label="በወሩ የቀሪነት ቀናት" value={history.filter(x=>x.attendance_status==='absent').length}/>
    <Metric label="በወሩ የAttendance መዝገቦች" value={history.length}/>
   </div>
   <div>
    <h4 className="mb-3 font-bold">የሽያጭ፣ ኮሚሽን እና Rank አፈጻጸም</h4>
    {canSeePerformance?<div className="overflow-x-auto rounded-xl border dark:border-zinc-700"><table className="w-full text-sm"><thead><tr className="border-b dark:border-zinc-700"><th className="p-3 text-left">ጊዜ</th><th className="p-3 text-right">የሽያጭ መጠን</th><th className="p-3 text-right">ኮሚሽን</th><th className="p-3 text-center">Rank</th></tr></thead><tbody>{['day','week','month'].map(k=>{const s=performance[k][selectedUser.id]||{count:0,sales:0,commission:0};const rank=ranks[k][selectedUser.id];return <tr key={k} className="border-b last:border-0 dark:border-zinc-700"><td className="p-3">{ranges.periods[k].label}<div className="text-xs text-zinc-500">{ranges.periods[k].from} → {ranges.periods[k].to}</div></td><td className="p-3 text-right">{money(s.sales)} ብር</td><td className="p-3 text-right">{money(s.commission)} ብር</td><td className="p-3 text-center font-bold">{rank?rank.rank+' / '+rank.total:'—'}</td></tr>})}</tbody></table></div>:<p className="text-sm text-zinc-500">የሽያጭና ኮሚሽን መረጃን ለማየት ተገቢው ፈቃድ ያስፈልጋል።</p>}
    <p className="mt-2 text-xs text-zinc-500">Rank በመጀመሪያ በሽያጭ መጠን፣ ሽያጩ እኩል ከሆነ በኮሚሽን መጠን ይወሰናል። ንጽጽሩ በተመሳሳይ ቅርንጫፍና የሰራተኛ ምድብ ውስጥ ነው።</p>
   </div>
   <div><h4 className="mb-3 font-bold">የወሩ Attendance ታሪክ</h4><div className="overflow-x-auto rounded-xl border dark:border-zinc-700"><table className="w-full text-sm"><thead><tr className="border-b dark:border-zinc-700"><th className="p-3 text-left">ቀን</th><th className="p-3">ሁኔታ</th><th className="p-3 text-left">ምክንያት</th></tr></thead><tbody>{history.map((h,i)=><tr key={h.work_date+'-'+i} className="border-b last:border-0 dark:border-zinc-700"><td className="p-3">{h.work_date}</td><td className="p-3 text-center">{attendanceLabel(h.attendance_status)}</td><td className="p-3">{h.reason||'—'}</td></tr>)}{!history.length&&<tr><td colSpan="3" className="p-5 text-center text-zinc-500">በዚህ ወር የAttendance መዝገብ የለም።</td></tr>}</tbody></table></div></div>
  </section>}
 </section>
}

function Metric({label,value}){return <div className="rounded-xl border p-3 dark:border-zinc-700"><div className="text-xs text-zinc-500">{label}</div><div className="mt-1 text-lg font-black">{value}</div></div>}
