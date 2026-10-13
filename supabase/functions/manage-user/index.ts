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
  const roleAllowed=async (role,organizationId,branchId)=>{
   if(allowed.includes(role))return true
   if(!/^custom_[a-z0-9_]{2,48}$/.test(String(role||'')))return false
   const {data,error}=await a.from('management_roles').select('id,scope_branch_id').eq('code',role).eq('organization_id',organizationId).eq('active',true).maybeSingle()
   if(error&&(/scope_branch_id|schema cache|does not exist/i.test(error.message||''))){const {data:legacyRole,error:legacyError}=await a.from('management_roles').select('id').eq('code',role).eq('organization_id',organizationId).eq('active',true).maybeSingle();return !legacyError&&!!legacyRole}
   if(error||!data)return false
   if(!global && data.scope_branch_id && data.scope_branch_id!==branchId)return false
   return !data.scope_branch_id||data.scope_branch_id===branchId
  }
  const saveEmployeePermissions=async (userId,items)=>{
   if(!Array.isArray(items))return null
   const {data:allPermissions,error:permissionError}=await a.from('permissions').select('code').eq('active',true)
   if(permissionError)return permissionError
   const selected=new Set(items.filter(p=>p&&typeof p.permission_code==='string'&&p.enabled===true).map(p=>p.permission_code))
   const validCodes=new Set((allPermissions||[]).map(p=>p.code))
   const invalid=[...selected].filter(code=>!validCodes.has(code))
   if(invalid.length)return new Error('Invalid permission code')
   const rows=[...validCodes].map(permission_code=>({user_id:userId,permission_code,enabled:selected.has(permission_code),updated_by:caller.id,updated_at:new Date().toISOString()}))
   if(!rows.length)return null
   const {error}=await a.from('employee_permissions').upsert(rows,{onConflict:'user_id,permission_code'})
   if(error&&selected.size===0&&(error.code==='42P01'||error.code==='PGRST205'||/employee_permissions.*(does not exist|schema cache|could not find)/i.test(error.message||'')))return null
   return error||null
  }
  const saveBranchAdminPermissions=async (userId,items)=>{
   if(!Array.isArray(items))return null
   const {data:allPermissions,error:permissionError}=await a.from('permissions').select('code').eq('active',true)
   if(permissionError)return permissionError
   const selected=new Set(items.filter(p=>p&&typeof p.permission_code==='string'&&p.enabled===true).map(p=>p.permission_code))
   const validCodes=new Set((allPermissions||[]).map(p=>p.code))
   if([...selected].some(code=>!validCodes.has(code)))return new Error('Invalid branch-admin permission code')
   const rows=[...validCodes].map(permission_code=>({user_id:userId,permission_code,enabled:selected.has(permission_code),updated_by:caller.id,updated_at:new Date().toISOString()}))
   if(!rows.length)return null
   const {error}=await a.from('branch_admin_permissions').upsert(rows,{onConflict:'user_id,permission_code'})
   return error||null
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
    const roleUpdate={name_am:nameAm,name_en:body.name_en||null,description:body.description||null,updated_at:new Date().toISOString()}
    if(Object.prototype.hasOwnProperty.call(body,'scope_branch_id'))roleUpdate.scope_branch_id=body.scope_branch_id||null
    const {data,error}=await a.from('management_roles').update(roleUpdate).eq('id',body.role_id).eq('organization_id',body.organization_id).select('id,code').single()
    if(error)throw error
    role=data
   }else{
    const {data:errorBranchScope,error:scopeError}=body.scope_branch_id?await a.from('branches').select('id').eq('id',body.scope_branch_id).eq('organization_id',body.organization_id).eq('active',true).maybeSingle():{data:{id:null},error:null}
    if(scopeError)throw scopeError
    if(body.scope_branch_id&&!errorBranchScope)return out({error:'Position scope must be an active Head Office or branch in the selected organization'},400)
    const roleInsert={code,name_am:nameAm,name_en:body.name_en||null,description:body.description||null,organization_id:body.organization_id,created_by:caller.id,active:true};if(body.scope_branch_id)roleInsert.scope_branch_id=body.scope_branch_id
    const {data,error}=await a.from('management_roles').insert(roleInsert).select('id,code').single()
    if(error)throw error
    role=data
   }
   const rows=Array.isArray(body.permissions)?body.permissions.filter(p=>p&&typeof p.permission_code==='string').map(p=>({role_id:role.id,permission_code:p.permission_code,enabled:p.enabled===true,updated_by:caller.id,updated_at:new Date().toISOString()})):[]
   if(rows.length){const {error}=await a.from('management_role_permissions').upsert(rows,{onConflict:'role_id,permission_code'});if(error)throw error}
   return out({ok:true,role_id:role.id,role:role.code})
  }
  if(body.action==='create'){
   if(!global && !(await hasPerm('users.create')))return out({error:'የሰራተኛ መፍጠር ፍቃድ አልተሰጠዎትም'},403)
   if(!(await roleAllowed(body.role,global?body.organization_id:cp.organization_id,(global?body.branch_id:cp.branch_id)))||!String(body.full_name||'').trim()||!String(body.password||'').trim())return out({error:'Full name, role, and password are required'},400)
   const username=String(body.username||'').trim().toLowerCase();if(!/^[a-z][a-z0-9._-]{2,31}$/.test(username))return out({error:'Username must start with a letter and contain 3–32 letters, numbers, dots, underscores, or hyphens'},400)
   const {data:existingUsername,error:usernameError}=await a.from('profiles').select('id').eq('username',username).limit(1);if(usernameError)throw usernameError;if(existingUsername?.length)return out({error:'This username is already in use'},409)
   if(String(body.password).length<8)return out({error:'Password must be at least 8 characters'},400)
   const org=global?body.organization_id:cp.organization_id,branch=(global?body.branch_id:cp.branch_id)||null;if(!org||!branch)return out({error:'Organization and Head Office/branch are required'},400)
   if(!global&&(org!==cp.organization_id||branch!==cp.branch_id))return out({error:'Forbidden'},403)
   const {data:b,error:branchError}=await a.from('branches').select('id,organization_id,active,is_head_office').eq('id',branch).maybeSingle();if(branchError)throw branchError;if(!b?.active||b.organization_id!==org)return out({error:'Invalid Head Office/branch'},400)
   if(/^custom_(hr|finance|commission_manager|auditor|operations_manager|it_admin)_/.test(String(body.role||''))&&!b.is_head_office)return out({error:'This job position is available only at Head Office'},400)
   if(/^custom_(sales_manager|branch_accountant|stock_manager|branch_manager)_/.test(String(body.role||''))&&b.is_head_office)return out({error:'This job position is available only at a branch'},400)
   if(body.department_id){const {data:department,error:departmentError}=await a.from('organization_departments').select('id,organization_id,active').eq('id',body.department_id).maybeSingle();if(departmentError)throw departmentError;if(!department?.active||department.organization_id!==org)return out({error:'Invalid department for this organization'},400)}
   if(body.role==='branch_admin'&&b.is_head_office)return out({error:'Branch Admin must be assigned to a regular branch, not Head Office'},400)
   if(body.role==='branch_admin'){const {data:x,error:xError}=await a.from('profiles').select('id').eq('branch_id',branch).eq('role','branch_admin').eq('active',true).limit(1);if(xError)throw xError;if(x?.length)return out({error:'This branch already has an active Branch Admin'},409)}
   const phone=normalize(body.phone);if(!/^\+2519\d{8}$/.test(phone))return out({error:'Valid Ethiopian phone number is required'},400)
   const plate=String(body.plate_number||'').trim();if(body.role==='driver'&&!plate)return out({error:'Vehicle plate number is required for a driver'},400)
   const {data:u,error:ue}=await a.auth.admin.createUser({phone,password:body.password,phone_confirm:true,user_metadata:{full_name:String(body.full_name).trim()}});if(ue)return out({error:ue.message},400)
   const profileInsert={id:u.user.id,full_name:String(body.full_name).trim(),phone,username,role:body.role,active:true,organization_id:org,branch_id:branch||null,plate_number:body.role==='driver'?plate:null};if(body.department_id)profileInsert.department_id=body.department_id
   const {error:pe}=await a.from('profiles').upsert(profileInsert);if(pe){await a.auth.admin.deleteUser(u.user.id);return out({error:pe.message},400)}
   const permissionSaveError=await saveEmployeePermissions(u.user.id,body.employee_permissions);if(permissionSaveError){await a.auth.admin.deleteUser(u.user.id);return out({error:'Employee was not saved because permissions failed: '+permissionSaveError.message},400)}
   if(body.role==='branch_admin'){const branchPermissionError=await saveBranchAdminPermissions(u.user.id,body.branch_admin_permissions);if(branchPermissionError){await a.auth.admin.deleteUser(u.user.id);return out({error:'Employee was not saved because branch permissions failed: '+branchPermissionError.message},400)}}
   return out({ok:true,user_id:u.user.id})
  }
  const id=body.user_id;if(!id)return out({error:'user_id is required'},400)
  const {data:t}=await a.from('profiles').select('role,phone,username,organization_id,branch_id,plate_number').eq('id',id).single();if(!t)return out({error:'User not found'},404)
  if(['super_admin','admin'].includes(t.role))return out({error:'Global administrators cannot be managed here'},403)
  if(!global && t.role==='branch_admin')return out({error:'Branch Admin accounts can only be managed by Super Admin/Admin'},403)
  if(!global&&(t.organization_id!==cp.organization_id||t.branch_id!==cp.branch_id))return out({error:'Forbidden'},403)
  if(!global && !(await hasPerm('users.manage')))return out({error:'የሰራተኛ ማስተዳደር ፍቃድ አልተሰጠዎትም'},403)
  if(body.action==='activate'){const {error}=await a.from('profiles').update({active:!!body.active}).eq('id',id);if(error)throw error;return out({ok:true})}
  if(body.action==='reset_password'){if(String(body.password||'').length<8)return out({error:'Password must be at least 8 characters'},400);const {error}=await a.auth.admin.updateUserById(id,{password:body.password});if(error)throw error;return out({ok:true})}
  if(body.action==='delete'){const {error}=await a.auth.admin.deleteUser(id);if(error)throw error;return out({ok:true})}
  if(body.action==='update'){
   const org=global?body.organization_id:cp.organization_id,branch=(global?body.branch_id:cp.branch_id)||null
   if(!org||!branch)return out({error:'Organization and Head Office/branch are required'},400)
   if(!(await roleAllowed(body.role,global?body.organization_id:cp.organization_id,(global?body.branch_id:cp.branch_id)))||!String(body.full_name||'').trim())return out({error:'Full name and valid role are required'},400)
   let username=t.username||null;if(body.username!==undefined){username=String(body.username||'').trim().toLowerCase();if(!/^[a-z][a-z0-9._-]{2,31}$/.test(username))return out({error:'Username must start with a letter and contain 3–32 letters, numbers, dots, underscores, or hyphens'},400);const {data:usernameRows,error:usernameError}=await a.from('profiles').select('id').eq('username',username).neq('id',id).limit(1);if(usernameError)throw usernameError;if(usernameRows?.length)return out({error:'This username is already in use'},409)}
   if(!global&&(org!==cp.organization_id||branch!==cp.branch_id))return out({error:'Forbidden'},403)
   const {data:b,error:branchError}=await a.from('branches').select('id,organization_id,active,is_head_office').eq('id',branch).maybeSingle();if(branchError)throw branchError;if(!b?.active||b.organization_id!==org)return out({error:'Invalid Head Office/branch'},400)
   if(/^custom_(hr|finance|commission_manager|auditor|operations_manager|it_admin)_/.test(String(body.role||''))&&!b.is_head_office)return out({error:'This job position is available only at Head Office'},400)
   if(/^custom_(sales_manager|branch_accountant|stock_manager|branch_manager)_/.test(String(body.role||''))&&b.is_head_office)return out({error:'This job position is available only at a branch'},400)
   if(body.department_id){const {data:department,error:departmentError}=await a.from('organization_departments').select('id,organization_id,active').eq('id',body.department_id).maybeSingle();if(departmentError)throw departmentError;if(!department?.active||department.organization_id!==org)return out({error:'Invalid department for this organization'},400)}
   if(body.role==='branch_admin'&&b.is_head_office)return out({error:'Branch Admin must be assigned to a regular branch, not Head Office'},400)
   if(body.role==='branch_admin'){const {data:x,error:xError}=await a.from('profiles').select('id').eq('branch_id',branch).eq('role','branch_admin').eq('active',true).neq('id',id).limit(1);if(xError)throw xError;if(x?.length)return out({error:'This branch already has an active Branch Admin'},409)}
   const nextPhone=normalize(body.phone);if(!/^\+2519\d{8}$/.test(nextPhone))return out({error:'Valid Ethiopian phone number is required'},400)
   const plate=String(body.plate_number||'').trim();if(body.role==='driver'&&!plate)return out({error:'Vehicle plate number is required for a driver'},400)
   const {error:ae}=await a.auth.admin.updateUserById(id,{phone:nextPhone});if(ae)throw ae
   const profileUpdate={full_name:String(body.full_name).trim(),phone:nextPhone,role:body.role,organization_id:org,branch_id:branch||null,plate_number:body.role==='driver'?plate:null};if(body.username!==undefined)profileUpdate.username=username;if(body.department_id!==undefined)profileUpdate.department_id=body.department_id||null
   const {error:pe}=await a.from('profiles').update(profileUpdate).eq('id',id)
   if(pe){await a.auth.admin.updateUserById(id,{phone:t.phone||undefined}).catch(()=>{});throw pe}
   const permissionSaveError=await saveEmployeePermissions(id,body.employee_permissions);if(permissionSaveError)return out({error:'Employee details were updated, but permissions were not saved: '+permissionSaveError.message},400)
   if(body.role==='branch_admin'){const branchPermissionError=await saveBranchAdminPermissions(id,body.branch_admin_permissions);if(branchPermissionError)return out({error:'Employee details were updated, but branch permissions were not saved: '+branchPermissionError.message},400)}
   return out({ok:true})
  }
  return out({error:'Unknown action'},400)
 }catch(e){return out({error:e?.message||'Unexpected error'},500)}
})