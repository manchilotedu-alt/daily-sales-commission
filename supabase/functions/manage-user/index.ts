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
  const global=['super_admin','admin'].includes(cp.role),body=await req.json(),allowed=['branch_admin','lead','lead_sales','assistant','driver']
  const hasPerm=async code=>{if(global)return true;const {data}=await a.from('branch_admin_permissions').select('enabled').eq('user_id',caller.id).eq('permission_code',code).maybeSingle();return data?.enabled===true}
  if(body.action==='create'){
   if(!global && cp.role==='branch_admin' && !(await hasPerm('users.create')))return out({error:'የሰራተኛ መፍጠር ፍቃድ አልተሰጠዎትም'},403)
   if(!allowed.includes(body.role)||!body.full_name||!body.password)return out({error:'Required fields are missing'},400)
   const org=global?body.organization_id:cp.organization_id,branch=global?body.branch_id:cp.branch_id;if(!org||!branch)return out({error:'Organization and branch are required'},400)
   if(!global&&(org!==cp.organization_id||branch!==cp.branch_id))return out({error:'Forbidden'},403)
   const {data:b}=await a.from('branches').select('id,organization_id,active').eq('id',branch).maybeSingle();if(!b?.active||b.organization_id!==org)return out({error:'Invalid branch'},400)
   if(body.role==='branch_admin'){const {data:x}=await a.from('profiles').select('id').eq('branch_id',branch).eq('role','branch_admin').eq('active',true).limit(1);if(x?.length)return out({error:'This branch already has an active Branch Admin'},409)}
   const phone=normalize(body.phone);if(!/^\+2519\d{8}$/.test(phone))return out({error:'Valid Ethiopian phone number is required'},400)
   const {data:u,error:ue}=await a.auth.admin.createUser({phone,password:body.password,phone_confirm:true,user_metadata:{full_name:body.full_name}});if(ue)return out({error:ue.message},400)
   const {error:pe}=await a.from('profiles').upsert({id:u.user.id,full_name:body.full_name,phone,role:body.role,active:true,organization_id:org,branch_id:branch});if(pe){await a.auth.admin.deleteUser(u.user.id);return out({error:pe.message},400)}
   return out({ok:true,user_id:u.user.id})
  }
  const id=body.user_id;if(!id)return out({error:'user_id is required'},400)
  const {data:t}=await a.from('profiles').select('role,phone,organization_id,branch_id').eq('id',id).single();if(!t)return out({error:'User not found'},404)
  if(['super_admin','admin'].includes(t.role))return out({error:'Global administrators cannot be managed here'},403)
  if(!global&&(t.organization_id!==cp.organization_id||t.branch_id!==cp.branch_id))return out({error:'Forbidden'},403)
  if(!global && cp.role==='branch_admin' && !(await hasPerm('users.manage')))return out({error:'የሰራተኛ ማስተዳደር ፍቃድ አልተሰጠዎትም'},403)
  if(body.action==='activate'){const {error}=await a.from('profiles').update({active:!!body.active}).eq('id',id);if(error)throw error;return out({ok:true})}
  if(body.action==='reset_password'){if(String(body.password||'').length<6)return out({error:'Password must be at least 6 characters'},400);const {error}=await a.auth.admin.updateUserById(id,{password:body.password});if(error)throw error;return out({ok:true})}
  if(body.action==='delete'){const {error}=await a.auth.admin.deleteUser(id);if(error)throw error;return out({ok:true})}
  if(body.action==='update'){const org=global?body.organization_id:cp.organization_id,branch=global?body.branch_id:cp.branch_id;if(!org||!branch)return out({error:'Organization and branch are required'},400);if(!allowed.includes(body.role))return out({error:'Invalid role'},400);if(!global&&(org!==cp.organization_id||branch!==cp.branch_id))return out({error:'Forbidden'},403);const {data:b}=await a.from('branches').select('id,organization_id,active').eq('id',branch).maybeSingle();if(!b?.active||b.organization_id!==org)return out({error:'Invalid branch'},400);if(body.role==='branch_admin'){const {data:x}=await a.from('profiles').select('id').eq('branch_id',branch).eq('role','branch_admin').eq('active',true).neq('id',id).limit(1);if(x?.length)return out({error:'This branch already has an active Branch Admin'},409)}const nextPhone=normalize(body.phone);const {error:ae}=await a.auth.admin.updateUserById(id,{phone:nextPhone});if(ae)throw ae;const {error:pe}=await a.from('profiles').update({full_name:body.full_name,phone:nextPhone,role:body.role,organization_id:org,branch_id:branch}).eq('id',id);if(pe){await a.auth.admin.updateUserById(id,{phone:t.phone||undefined}).catch(()=>{});throw pe}return out({ok:true})}
  return out({error:'Unknown action'},400)
 }catch(e){return out({error:e?.message||'Unexpected error'},500)}
})