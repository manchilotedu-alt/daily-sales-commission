import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const url=Deno.env.get('SUPABASE_URL')!, key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, db=createClient(url,key)
const h={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'}
const out=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:h})
const globalRole=(r:string)=>['super_admin','admin'].includes(r)
async function actor(req:Request){const t=req.headers.get('Authorization')?.replace('Bearer ','');if(!t)throw Error('Unauthorized');const c=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')||key,{global:{headers:{Authorization:'Bearer '+t}}});const {data:{user},error}=await c.auth.getUser(t);if(error||!user)throw Error('Unauthorized');const {data:p,error:pe}=await db.from('profiles').select('*').eq('id',user.id).single();if(pe||!p||!p.active)throw Error('Account is inactive');return p}
const today=()=>new Date().toISOString().slice(0,10)
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:h});try{
 const me=await actor(req), b=await req.json(), a=String(b.action||'')
 if(!globalRole(me.role)&&me.role!=='branch_admin')return out({error:'Management access required'},403)
 if(a==='set_employee_status'){
  const {data:e,error}=await db.from('profiles').select('id,organization_id,branch_id,role,active,employee_status,status_effective_date').eq('id',b.employee_id).single();if(error||!e)return out({error:'Employee not found'},404)
  if(!globalRole(me.role)&&(e.organization_id!==me.organization_id||e.branch_id!==me.branch_id))return out({error:'Outside branch'},403)
  const s=String(b.status), allowed=['active','inactive','fired','resigned','promoted','suspended'];if(!allowed.includes(s))return out({error:'Invalid status'},400)
  if(s==='promoted'&&!b.new_role)return out({error:'New role is required'},400)
  const eff=String(b.effective_date||today()), nr=String(b.new_role||e.role), active=['active','promoted'].includes(s)
  const {error:u}=await db.from('profiles').update({active,employee_status:s,status_effective_date:eff,role:nr}).eq('id',e.id);if(u)throw u
  const {error:hh}=await db.from('employee_status_history').insert({employee_id:e.id,old_status:e.employee_status|| (e.active?'active':'inactive'),new_status:s,old_role:e.role,new_role:nr,effective_date:eff,reason:String(b.reason||''),changed_by:me.id,approved_by:globalRole(me.role)?me.id:null});if(hh)throw hh
  await db.from('audit_logs').insert({organization_id:e.organization_id,branch_id:e.branch_id,actor_id:me.id,action:'employee_status_changed',entity_type:'profile',entity_id:e.id,before_data:{status:e.employee_status,active:e.active,role:e.role},after_data:{status:s,active,role:nr},reason:String(b.reason||'')})
  return out({ok:true})
 }
 if(a==='set_vehicle_status'){
  const {data:v,error}=await db.from('vehicles').select('*').eq('id',b.vehicle_id).single();if(error||!v)return out({error:'Vehicle not found'},404)
  if(!globalRole(me.role)&&(v.organization_id!==me.organization_id||v.branch_id!==me.branch_id))return out({error:'Outside branch'},403)
  const s=String(b.status);if(!['active','inactive','maintenance'].includes(s))return out({error:'Invalid vehicle status'},400)
  const {error:u}=await db.from('vehicles').update({status:s,updated_at:new Date().toISOString()}).eq('id',v.id);if(u)throw u
  const {error:hh}=await db.from('vehicle_status_history').insert({vehicle_id:v.id,old_status:v.status,new_status:s,effective_date:String(b.effective_date||today()),reason:String(b.reason||''),changed_by:me.id});if(hh)throw hh
  await db.from('audit_logs').insert({organization_id:v.organization_id,branch_id:v.branch_id,actor_id:me.id,action:'vehicle_status_changed',entity_type:'vehicle',entity_id:v.id,before_data:{status:v.status},after_data:{status:s},reason:String(b.reason||'')})
  return out({ok:true})
 }
 if(a==='set_daily_work_status'){
  if(me.role!=='branch_admin')return out({error:'Only Branch Manager can record daily work status'},403)
  const {data:e,error}=await db.from('profiles').select('id,organization_id,branch_id,employee_status').eq('id',b.employee_id).single();if(error||!e)return out({error:'Employee not found'},404)
  if(!globalRole(me.role)&&(e.organization_id!==me.organization_id||e.branch_id!==me.branch_id))return out({error:'Outside branch'},403)
  const s=String(b.work_status), date=String(b.work_date||today());if(!['working','rest_day','leave','official_duty'].includes(s))return out({error:'Invalid work status'},400)
  if(s!=='rest_day'&&!['active','promoted'].includes(e.employee_status))return out({error:'Inactive employee cannot be scheduled to work'},409)
  const {error:u}=await db.from('employee_daily_work_status').upsert({organization_id:e.organization_id,branch_id:e.branch_id,employee_id:e.id,work_date:date,work_status:s,reason:String(b.reason||''),created_by:me.id},{onConflict:'employee_id,work_date'});if(u)throw u
  return out({ok:true})
 }
 if(a==='record_attendance'){
  return out({error:'Attendance status is system-derived from the employee team assignment effective on the selected date. Do not manually mark present or absent; correct the effective-dated team assignment if the roster is wrong.'},409)
 }
 const attendanceDate=String(b.work_date||today())
 const validAttendanceDate=/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)&&!Number.isNaN(Date.parse(attendanceDate))
 const attendanceScope=async(date:string)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date)))throw new Error('Invalid attendance date')
  const isGlobal=globalRole(me.role)
  let tq=db.from('teams').select('id,organization_id,branch_id').eq('status','active')
  if(!isGlobal)tq=tq.eq('organization_id',me.organization_id).eq('branch_id',me.branch_id)
  const {data:teams,error:te}=await tq
  if(te)throw te
  const activeTeams=teams||[], teamIds=activeTeams.map((x:any)=>x.id)
  if(!teamIds.length)throw new Error('No active sales teams exist for this scope; attendance was not changed')
  let pq=db.from('profiles').select('id,full_name,phone,plate_number,role,active,employee_status,status_effective_date,organization_id,branch_id').eq('active',true).in('role',['lead','lead_sales','assistant','driver'])
  if(!isGlobal)pq=pq.eq('organization_id',me.organization_id).eq('branch_id',me.branch_id)
  const {data:people,error:pe}=await pq.order('full_name')
  if(pe)throw pe
  const staff=(people||[]).filter((p:any)=>p.branch_id&&activeTeams.some((t:any)=>t.branch_id===p.branch_id&&t.organization_id===p.organization_id))
  if(!staff.length)return {employees:[],teams:activeTeams,date}
  const ids=staff.map((p:any)=>p.id)
  const {data:structures,error:se}=await db.from('team_structures').select('id,team_id,effective_from,effective_to,status,team_structure_roles(role_code,required_count)').in('team_id',teamIds).eq('status','active').lte('effective_from',date).or(`effective_to.is.null,effective_to.gte.${date}`).order('effective_from',{ascending:false})
  if(se)throw se
  const structureCounts=new Map<string,any>()
  for(const s of structures||[])if(!structureCounts.has(s.team_id))structureCounts.set(s.team_id,(s.team_structure_roles||[]).reduce((acc:any,r:any)=>({...acc,[r.role_code]:Number(r.required_count)}),{}))
  if(activeTeams.some((t:any)=>!structureCounts.has(t.id)))throw new Error('At least one active team has no effective structure for this date; attendance was not changed')
  const {data:assignments,error:ae}=await db.from('team_assignments').select('id,team_id,employee_id,team_role,employee_position,effective_from,effective_to,created_at').in('team_id',teamIds).eq('assignment_status','active').lte('effective_from',date).or(`effective_to.is.null,effective_to.gte.${date}`).order('created_at',{ascending:false})
  if(ae)throw ae
  const currentByPosition=new Map<string,any>()
  for(const x of assignments||[]){
   const position=Number(x.employee_position||1), counts=structureCounts.get(x.team_id)||{}
   if(position>Number(counts[x.team_role]||0))continue
   const k=`${x.team_id}:${x.team_role}:${position}`
   if(!currentByPosition.has(k))currentByPosition.set(k,x)
  }
  const assignedIds=new Set([...currentByPosition.values()].map((x:any)=>x.employee_id))
  const {data:workRows,error:we}=await db.from('employee_daily_work_status').select('employee_id,work_status,reason').in('employee_id',ids).eq('work_date',date)
  if(we)throw we
  const workMap=new Map((workRows||[]).map((x:any)=>[x.employee_id,x]))
  const {data:existing,error:ee}=await db.from('employee_attendance').select('employee_id,attendance_status,reason').in('employee_id',ids).eq('work_date',date)
  if(ee)throw ee
  const existingMap=new Map((existing||[]).map((x:any)=>[x.employee_id,x]))
  const employees=staff.map((p:any)=>{
   const work:any=workMap.get(p.id), prior:any=existingMap.get(p.id)
   const rest=work?.work_status==='rest_day'
   let status=rest?'rest_day':!assignedIds.has(p.id)?'absent':(work?.work_status==='leave'?'leave':work?.work_status==='official_duty'?'official_duty':'present')
   return {employee_id:p.id,full_name:p.full_name,phone:p.phone,plate_number:p.plate_number,role:p.role,organization_id:p.organization_id,branch_id:p.branch_id,work_status:work?.work_status||'working',attendance_status:status,reason:prior?.reason||work?.reason||''}
  })
  return {employees,teams:activeTeams,date}
 }
 if(a==='get_team_attendance_roster'){
  if(!globalRole(me.role)&&me.role!=='branch_admin')return out({error:'Attendance management access required'},403)
  try{return out({ok:true,...await attendanceScope(attendanceDate)})}catch(e){return out({error:e?.message||'Unable to load attendance roster'},409)}
 }
 if(a==='save_team_attendance'||a==='sync_team_attendance'){
  if(me.role!=='branch_admin')return out({error:'Only Branch Manager can save team attendance'},403)
  if(a==='sync_team_attendance'&&me.role!=='branch_admin')return out({error:'Only Branch Admin can sync branch attendance'},403)
  if(!validAttendanceDate)return out({error:'Invalid attendance date'},400)
  let roster:any
  try{roster=await attendanceScope(attendanceDate)}catch(e){return out({error:e?.message||'Unable to build attendance roster'},409)}
  const reasons=b.absence_reasons&&typeof b.absence_reasons==='object'?b.absence_reasons:{}
  const missing=roster.employees.filter((p:any)=>p.attendance_status==='absent'&&!String(reasons[p.employee_id]??p.reason??'').trim())
  if(missing.length)return out({error:'Absence reason is required for every absent employee',missing_employee_ids:missing.map((p:any)=>p.employee_id)},400)
  const rows=roster.employees.filter((p:any)=>p.work_status!=='rest_day'&&p.attendance_status!=='rest_day').map((p:any)=>({
   organization_id:p.organization_id,branch_id:p.branch_id,employee_id:p.employee_id,work_date:attendanceDate,
   attendance_status:p.attendance_status,reason:String(reasons[p.employee_id]??p.reason??''),recorded_by:me.id
  }))
  if(rows.length){
   const {error:upsertError}=await db.from('employee_attendance').upsert(rows,{onConflict:'employee_id,work_date'})
   if(upsertError)throw upsertError
  }
  const staffById=new Map(roster.employees.map((p:any)=>[p.employee_id,p]))
  const count=(status:string,roles:string[])=>rows.filter((x:any)=>x.attendance_status===status&&roles.includes(staffById.get(x.employee_id)?.role)).length
  const summary={sales_present:count('present',['lead','lead_sales','assistant'])+count('late',['lead','lead_sales','assistant']),sales_absent:count('absent',['lead','lead_sales','assistant']),drivers_present:count('present',['driver'])+count('late',['driver']),drivers_absent:count('absent',['driver']),leave:rows.filter((x:any)=>x.attendance_status==='leave'||x.attendance_status==='sick_leave').length,official_duty:rows.filter((x:any)=>x.attendance_status==='official_duty').length,created:rows.length,skipped_rest_days:roster.employees.filter((p:any)=>p.work_status==='rest_day').length}
  if(!globalRole(me.role))await db.from('audit_logs').insert({organization_id:me.organization_id,branch_id:me.branch_id,actor_id:me.id,action:'team_roster_attendance_saved',entity_type:'attendance',after_data:{work_date:attendanceDate,...summary}})
  return out({ok:true,work_date:attendanceDate,...summary})
 }
 return out({error:'Unknown action'},400)
}catch(e){return out({error:e?.message||'Unexpected error'},500)}})