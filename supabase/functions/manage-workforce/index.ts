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
  const {data:e,error}=await db.from('profiles').select('id,organization_id,branch_id,employee_status').eq('id',b.employee_id).single();if(error||!e)return out({error:'Employee not found'},404)
  if(!globalRole(me.role)&&(e.organization_id!==me.organization_id||e.branch_id!==me.branch_id))return out({error:'Outside branch'},403)
  const s=String(b.work_status), date=String(b.work_date||today());if(!['working','rest_day','leave','official_duty'].includes(s))return out({error:'Invalid work status'},400)
  if(s!=='rest_day'&&!['active','promoted'].includes(e.employee_status))return out({error:'Inactive employee cannot be scheduled to work'},409)
  const {error:u}=await db.from('daily_work_status').upsert({employee_id:e.id,work_date:date,work_status:s,schedule_id:b.schedule_id||null,reason:String(b.reason||'')},{onConflict:'employee_id,work_date'});if(u)throw u
  return out({ok:true})
 }
 if(a==='record_attendance'){
  const {data:e,error}=await db.from('profiles').select('id,organization_id,branch_id,employee_status,status_effective_date').eq('id',b.employee_id).single();if(error||!e)return out({error:'Employee not found'},404)
  if(!globalRole(me.role)&&(e.organization_id!==me.organization_id||e.branch_id!==me.branch_id))return out({error:'Outside branch'},403)
  const date=String(b.work_date||today()), {data:w}=await db.from('daily_work_status').select('work_status').eq('employee_id',e.id).eq('work_date',date).maybeSingle()
  if(w?.work_status==='rest_day')return out({error:'Attendance is blocked: this is a rest day'},409)
  if(!['active','promoted'].includes(e.employee_status)&&date>=String(e.status_effective_date||date))return out({error:'Employee is inactive for this date'},409)
  const s=String(b.attendance_status||'present');if(!['present','late','absent','leave','sick_leave','official_duty'].includes(s))return out({error:'Invalid attendance status'},400)
  const {data:x,error:u}=await db.from('attendance').upsert({employee_id:e.id,work_date:date,attendance_status:s,check_in:b.check_in||null,check_out:b.check_out||null,recorded_by:me.id},{onConflict:'employee_id,work_date'}).select('id').single();if(u)throw u
  await db.from('audit_logs').insert({organization_id:e.organization_id,branch_id:e.branch_id,actor_id:me.id,action:'attendance_recorded',entity_type:'attendance',entity_id:x.id,after_data:{employee_id:e.id,work_date:date,status:s}})
  return out({ok:true,attendance_id:x.id})
 }
 return out({error:'Unknown action'},400)
}catch(e){return out({error:e?.message||'Unexpected error'},500)}})