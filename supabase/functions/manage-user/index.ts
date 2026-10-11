import {createClient} from 'https://esm.sh/@supabase/supabase-js@2'
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type'}
const out=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json'}})
const normalize=(v='')=>{const d=String(v).replace(/\D/g,'');return d.startsWith('251')?'+'+d:(d.startsWith('0')?'+251'+d.slice(1):'+'+d)}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 try{
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return out({error:'Server configuration missing'},500)
  const a=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}),h=req.headers.get('Authorization')||'';if(!h.startsWith('Bearer '))return out({error:'Unauthorized'},401)
  const {data:{user:caller}}=await a.auth.getUser(h.slice(7));if(!caller)return out({error:'Unauthorized'},401)
  const {data:cp}=await a.from('profiles').select('role,active,organization_id,branch_id').eq('id',caller.id).single();if(!cp?.active)return out({error:'Forbidden'},403)
  const global=['super_admin','admin'].includes(cp.role),body=await req.json(),allowed=global?['branch_admin','lead','lead_sales','assistant','driver']:['lead','lead_sales','assistant','driver']
  const hasPerm=async code=>{
   if(global)return true
   if(cp.role==='branch_admin'){
    const {data,error}=await a.from('branch_admin_permissions').select('enabled').eq('user_id',caller.id).eq('permission_code',code).maybeSingle()
    return !error&&data?.enabled===true
   }
   if(String(cp.role||'').startsWith('custom_')){
    const {data:role,error:roleError}=await a.from('management_roles').select('id,organization_id').eq('code',cp.role).eq('organization_id',cp.organization_id).eq('active',true).maybeSingle()
    if(roleError||!role)return false
    const {data,error}=await a.from('management_role_permissions').select('enabled').eq('role_id',role.id).eq('permission_code',code).maybeSingle()
    return !error&&data?.enabled===true
   }
   return false
  }
  const roleAllowed=async (role,organizationId)=>{
   if(allowed.includes(role))return true
   if(!global||!/^custom_[a-z0-9_]{2,48}$/.test(String(role||'')))return false
   const {data,error}=await a.from('management_roles').select('id').eq('code',role).eq('organization_id',organizationId).eq('active',true).maybeSingle()
   return !error&&!!data
  }
  if(body.action==='management_role'||body.action==='management_role_status'){
   if(!global)return out({error:'Only Super Admin/Admin can manage management roles'},403)
   if(body.action==='management_role'&&!body.organization_id)return out({error:'organization_id is required'},400)
   if(body.action==='management_role_status'){
    if(!body.role_id)return out({error:'role_id is required'},400)
    const {error}=await a.from('management_roles').update({active:!!body.active,updated_at:new Date().toISOString()}).eq('id',body.role_id)
    if(error)throw error
    return out({ok:true})
   }
   const code=String(body.code||'').trim()
   const nameAm=String(body.name_am||'').trim()
   if(!/^custom_[a-z0-9_]{2,48}$/.test(code)||!nameAm)return out({error:'Valid custom role code and Amharic name are required'},400)
   let role
   if(body.role_id){
    const {data,error}=await a.from('management_roles').update({name_am:nameAm,name_en:body.name_en||null,description:body.description||null,updated_at:new Date().toISOString()}).eq('id',body.role_id).eq('organization_id',body.organization_id).select('id,code').single()
    if(error)throw error
    role=data
   }else{
    const {data,error}=await a.from('management_roles').insert({code,name_am:nameAm,name_en:body.name_en||null,description:body.description||null,organization_id:body.organization_id,created_by:caller.id,active:true}).select('id,code').single()
    if(error)throw error
    role=data
   }
   const rows=Array.isArray(body.permissions)?body.permissions.filter(p=>p&&typeof p.permission_code==='string').map(p=>({role_id:role.id,permission_code:p.permission_code,enabled:p.enabled===true,updated_by:caller.id,updated_at:new Date().toISOString()})):[]
   if(rows.length){const {error}=await a.from('management_role_permissions').upsert(rows,{onConflict:'role_id,permission_code'});if(error)throw error}
   return out({ok:true,role_id:role.id,role:role.code})
  }
  if(body.action==='create'){
   if(!global && !(await hasPerm('users.create')))return out({error:'የሰራተኛ መፍጠር ፍቃድ አልተሰጠዎትም'},403)
   if(!(await roleAllowed(body.role,global?body.organization_id:cp.organization_id))||!String(body.full_name||'').trim()||!String(body.password||'').trim())return out({error:'Full name, role, and password are required'},400)
   if(String(body.password).length<8)return out({error:'Password must be at least 8 characters'},400)
   const org=global?body.organization_id:cp.organization_id,branch=global?body.branch_id:cp.branch_id;if(!org||!branch)return out({error:'Organization and branch are required'},400)
   if(!global&&(org!==cp.organization_id||branch!==cp.branch_id))return out({error:'Forbidden'},403)
   const {data:b}=await a.from('branches').select('id,organization_id,active').eq('id',branch).maybeSingle();if(!b?.active||b.organization_id!==org)return out({error:'Invalid branch'},400)
   if(body.role==='branch_admin'){const {data:x}=await a.from('profiles').select('id').eq('branch_id',branch).eq('role','branch_admin').eq('active',true).limit(1);if(x?.length)return out({error:'This branch already has an active Branch Admin'},409)}
   const phone=normalize(body.phone);if(!/^\+2519\d{8}$/.test(phone))return out({error:'Valid Ethiopian phone number is required'},400)
   const plate=String(body.plate_number||'').trim();if(body.role==='driver'&&!plate)return out({error:'Vehicle plate number is required for a driver'},400)
   const {data:u,error:ue}=await a.auth.admin.createUser({phone,password:body.password,phone_confirm:true,user_metadata:{full_name:String(body.full_name).trim()}});if(ue)return out({error:ue.message},400)
   const {error:pe}=await a.from('profiles').upsert({id:u.user.id,full_name:String(body.full_name).trim(),phone,role:body.role,active:true,organization_id:org,branch_id:branch});if(pe){await a.auth.admin.deleteUser(u.user.id);return out({error:pe.message},400)}
   if(body.role==='driver'){
    const {data:v,error:ve}=await a.from('vehicles').insert({organization_id:org,branch_id:branch,plate_number:plate,status:'active'}).select('id').single()
    if(ve){await a.auth.admin.deleteUser(u.user.id);return out({error:ve.message},400)}
    const {error:linkError}=await a.from('profiles').update({vehicle_id:v.id}).eq('id',u.user.id)
    if(linkError){await a.from('vehicles').delete().eq('id',v.id);await a.auth.admin.deleteUser(u.user.id);return out({error:linkError.message},400)}
   }
   return out({ok:true,user_id:u.user.id})
  }
  const id=body.user_id;if(!id)return out({error:'user_id is required'},400)
  const {data:t}=await a.from('profiles').select('role,phone,organization_id,branch_id,vehicle_id').eq('id',id).single();if(!t)return out({error:'User not found'},404)
  if(['super_admin','admin'].includes(t.role))return out({error:'Global administrators cannot be managed here'},403)
  if(!global && t.role==='branch_admin')return out({error:'Branch Admin accounts can only be managed by Super Admin/Admin'},403)
  if(!global&&(t.organization_id!==cp.organization_id||t.branch_id!==cp.branch_id))return out({error:'Forbidden'},403)
  if(!global && !(await hasPerm('users.manage')))return out({error:'የሰራተኛ ማስተዳደር ፍቃድ አልተሰጠዎትም'},403)
  if(body.action==='activate'){const {error}=await a.from('profiles').update({active:!!body.active}).eq('id',id);if(error)throw error;return out({ok:true})}
  if(body.action==='reset_password'){if(String(body.password||'').length<8)return out({error:'Password must be at least 8 characters'},400);const {error}=await a.auth.admin.updateUserById(id,{password:body.password});if(error)throw error;return out({ok:true})}
  if(body.action==='delete'){const {error}=await a.auth.admin.deleteUser(id);if(error)throw error;return out({ok:true})}
  if(body.action==='update'){
   const org=global?body.organization_id:cp.organization_id,branch=global?body.branch_id:cp.branch_id
   if(!org||!branch)return out({error:'Organization and branch are required'},400)
   if(!(await roleAllowed(body.role,global?body.organization_id:cp.organization_id))||!String(body.full_name||'').trim())return out({error:'Full name and valid role are required'},400)
   if(!global&&(org!==cp.organization_id||branch!==cp.branch_id))return out({error:'Forbidden'},403)
   const {data:b}=await a.from('branches').select('id,organization_id,active').eq('id',branch).maybeSingle();if(!b?.active||b.organization_id!==org)return out({error:'Invalid branch'},400)
   if(body.role==='branch_admin'){const {data:x}=await a.from('profiles').select('id').eq('branch_id',branch).eq('role','branch_admin').eq('active',true).neq('id',id).limit(1);if(x?.length)return out({error:'This branch already has an active Branch Admin'},409)}
   const nextPhone=normalize(body.phone);if(!/^\+2519\d{8}$/.test(nextPhone))return out({error:'Valid Ethiopian phone number is required'},400)
   const plate=String(body.plate_number||'').trim();if(body.role==='driver'&&!plate)return out({error:'Vehicle plate number is required for a driver'},400)
   let vehicleId=t.vehicle_id||null
   if(body.role==='driver'){
    if(vehicleId){const {error:ve}=await a.from('vehicles').update({plate_number:plate,organization_id:org,branch_id:branch,updated_at:new Date().toISOString()}).eq('id',vehicleId);if(ve)throw ve}
    else {const {data:v,error:ve}=await a.from('vehicles').insert({organization_id:org,branch_id:branch,plate_number:plate,status:'active'}).select('id').single();if(ve)throw ve;vehicleId=v.id}
   }
   const {error:ae}=await a.auth.admin.updateUserById(id,{phone:nextPhone});if(ae)throw ae
   const {error:pe}=await a.from('profiles').update({full_name:String(body.full_name).trim(),phone:nextPhone,role:body.role,organization_id:org,branch_id:branch,vehicle_id:vehicleId}).eq('id',id)
   if(pe){await a.auth.admin.updateUserById(id,{phone:t.phone||undefined}).catch(()=>{});throw pe}
   return out({ok:true})
  }
  return out({error:'Unknown action'},400)
 }catch(e){return out({error:e?.message||'Unexpected error'},500)}
})