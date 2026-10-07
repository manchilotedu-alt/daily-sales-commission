import {createClient} from 'https://esm.sh/@supabase/supabase-js@2'
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type'}
const out=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json'}})
const today=()=>new Date().toISOString().slice(0,10)
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 try{
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return out({error:'Server configuration missing'},500)
  const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})
  const h=req.headers.get('Authorization')||'';if(!h.startsWith('Bearer '))return out({error:'Unauthorized'},401)
  const {data:au,error:ae}=await db.auth.getUser(h.slice(7));if(ae||!au.user)return out({error:'Unauthorized'},401)
  const {data:me,error:pe}=await db.from('profiles').select('id,role,active,organization_id,branch_id').eq('id',au.user.id).single()
  if(pe||!me?.active)return out({error:'Forbidden'},403)
  const body=await req.json(),action=String(body.action||''),global=['super_admin','admin'].includes(me.role)
  if(!['super_admin','admin','branch_admin'].includes(me.role))return out({error:'This role cannot manage teams'},403)

  if(action==='create_team'){
   if(me.role!=='branch_admin'&&!global)return out({error:'Only management can create teams'},403)
   const org=global?body.organization_id:me.organization_id,branch=global?(body.branch_id||null):me.branch_id
   if(!org)return out({error:'Organization is required'},400)
   const {data:t,error}=await db.from('teams').insert({organization_id:org,branch_id:branch,name:String(body.name||'').trim(),vehicle_id:body.vehicle_id||null,status:'active'}).select('id').single()
   if(error)throw error
   return out({ok:true,team_id:t.id})
  }
  if(action==='set_assignments'){
   if(me.role!=='branch_admin'&&!global)return out({error:'Forbidden'},403)
   const {data:team,error:te}=await db.from('teams').select('id,organization_id,branch_id,status').eq('id',body.team_id).single();if(te||!team)return out({error:'Team not found'},404)
   if(!global&&(team.organization_id!==me.organization_id||team.branch_id!==me.branch_id))return out({error:'Team is outside your branch'},403)
   const assignments=Array.isArray(body.assignments)?body.assignments:[];if(!assignments.length)return out({error:'At least one assignment is required'},400)
   const start=String(body.effective_from||today())
   for(const a of assignments){
    const {data:p}=await db.from('profiles').select('id,role,active,organization_id,branch_id').eq('id',a.employee_id).single()
    const ok=p?.active&&p.organization_id===team.organization_id&&p.branch_id===team.branch_id&&((a.team_role==='lead'&&['lead','lead_sales'].includes(p.role))||p.role===a.team_role)
    if(!ok)return out({error:'Invalid employee assignment'},400)
    await db.from('team_assignments').update({effective_to:new Date(new Date(start).getTime()-86400000).toISOString().slice(0,10),assignment_status:'closed'}).eq('team_id',team.id).eq('team_role',a.team_role).is('effective_to',null)
    const {error}=await db.from('team_assignments').insert({team_id:team.id,employee_id:a.employee_id,team_role:a.team_role,effective_from:start,assignment_status:'active',created_by:me.id})
    if(error)throw error
   }
   return out({ok:true})
  }
  if(action==='create_split'){
   if(me.role!=='branch_admin')return out({error:'Only Branch Manager can submit the split'},403)
   const {data:team,error:te}=await db.from('teams').select('id,organization_id,branch_id').eq('id',body.team_id).single();if(te||!team)return out({error:'Team not found'},404)
   if(team.organization_id!==me.organization_id||team.branch_id!==me.branch_id)return out({error:'Team is outside your branch'},403)
   const p=body.percentages||{},sum=Number(p.lead||0)+Number(p.assistant||0)+Number(p.driver||0);if(sum!==100)return out({error:'Split must total 100%'},400)
   const {data:latest}=await db.from('team_split_versions').select('version').eq('team_structure_id',team.id).order('version',{ascending:false}).limit(1).maybeSingle()
   const version=Number(latest?.version||0)+1
   const {data:structure,error:se}=await db.from('team_structures').insert({team_id:team.id,version,status:'active',effective_from:String(body.effective_from||today()),created_by:me.id}).select('id').single();if(se)throw se
   const {data:sv,error:sve}=await db.from('team_split_versions').insert({team_structure_id:structure.id,version,status:'pending',effective_from:String(body.effective_from||today()),submitted_by:me.id,submitted_at:new Date().toISOString()}).select('id').single();if(sve)throw sve
   const lines=[['lead',p.lead,true],['assistant',p.assistant,false],['driver',p.driver,false]].filter(x=>Number(x[1])>0).map(x=>({team_split_version_id:sv.id,role_code:x[0],employee_position:1,percentage:Number(x[1]),residual_eligible:x[2]}))
   const {error:le}=await db.from('team_split_lines').insert(lines);if(le)throw le
   return out({ok:true,split_version_id:sv.id})
  }
  if(action==='review_split'){
   if(!global)return out({error:'Only Super Admin can approve a split'},403)
   const decision=String(body.decision||'');if(!['approve','return'].includes(decision))return out({error:'Invalid decision'},400)
   const {data:s,error:se}=await db.from('team_split_versions').select('id,status,team_structure_id').eq('id',body.split_version_id).single();if(se||!s)return out({error:'Split not found'},404)
   if(s.status!=='pending')return out({error:'Only pending splits can be reviewed'},409)
   const update=decision==='approve'?{status:'approved',approved_by:me.id,approved_at:new Date().toISOString()}:{status:'returned',returned_reason:'Super Admin returned the split',approved_by:me.id,approved_at:new Date().toISOString()}
   const {error}=await db.from('team_split_versions').update(update).eq('id',s.id).eq('status','pending');if(error)throw error
   return out({ok:true})
  }
  return out({error:'Unknown action'},400)
 }catch(e){return out({error:e?.message||'Unexpected error'},500)}
})
