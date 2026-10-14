import {createClient} from 'https://esm.sh/@supabase/supabase-js@2'
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type'}
const out=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json'}})
const today=()=>new Date().toISOString().slice(0,10)
const validDate=(v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))
const priorDate=(v:string)=>new Date(Date.parse(v+'T00:00:00Z')-86400000).toISOString().slice(0,10)
const roleCounts=(assignments:any[])=>({lead:assignments.filter(x=>x.team_role==='lead').length,assistant:assignments.filter(x=>x.team_role==='assistant').length,driver:assignments.filter(x=>x.team_role==='driver').length})
const sameShape=(a:any,b:any)=>['lead','assistant','driver'].every(k=>Number(a[k]||0)===Number(b[k]||0))
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 try{
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!key)return out({error:'Server configuration missing'},500)
  const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})
  const h=req.headers.get('Authorization')||''
  if(!h.startsWith('Bearer '))return out({error:'Unauthorized'},401)
  const {data:au,error:ae}=await db.auth.getUser(h.slice(7))
  if(ae||!au.user)return out({error:'Unauthorized'},401)
  const {data:me,error:pe}=await db.from('profiles').select('id,role,active,organization_id,branch_id').eq('id',au.user.id).single()
  if(pe||!me?.active)return out({error:'Forbidden'},403)
  const body=await req.json(),action=String(body.action||''),global=['super_admin','admin'].includes(me.role)
  if(!['super_admin','admin','branch_admin'].includes(me.role))return out({error:'This role cannot manage teams'},403)

  if(action==='create_team'){
   const org=global?body.organization_id:me.organization_id,branch=global?(body.branch_id||null):me.branch_id
   if(!org||!String(body.name||'').trim())return out({error:'Organization and team name are required'},400)
   const {data:t,error}=await db.from('teams').insert({organization_id:org,branch_id:branch,name:String(body.name).trim(),vehicle_id:body.vehicle_id||null,status:'active'}).select('id').single()
   if(error)throw error
   return out({ok:true,team_id:t.id})
  }

  if(action==='get_team_state'){
   const {data:team,error:te}=await db.from('teams').select('id,organization_id,branch_id,name,status').eq('id',body.team_id).single()
   if(te||!team)return out({error:'Team not found'},404)
   if(!global&&(team.organization_id!==me.organization_id||team.branch_id!==me.branch_id))return out({error:'Team is outside your branch'},403)
   const asOf=validDate(body.as_of)?body.as_of:today()
   const {data:assignments,error:ae2}=await db.from('team_assignments').select('id,employee_id,team_role,employee_position,effective_from,effective_to,assignment_status,created_at,profiles(id,full_name,phone,role)').eq('team_id',team.id).eq('assignment_status','active').lte('effective_from',asOf).or(`effective_to.is.null,effective_to.gte.${asOf}`).order('created_at',{ascending:false})
   if(ae2)throw ae2
   const {data:structures,error:se}=await db.from('team_structures').select('id,version,status,effective_from,effective_to,team_structure_roles(role_code,required_count,position_no),team_split_versions(id,version,status,effective_from,effective_to,team_split_lines(role_code,employee_position,percentage,residual_eligible))').eq('team_id',team.id).lte('effective_from',asOf).or(`effective_to.is.null,effective_to.gte.${asOf}`).order('version',{ascending:false})
   if(se)throw se
   const structure=(structures||[]).find((s:any)=>s.status==='active')||null
   const counts=(structure?.team_structure_roles||[]).reduce((acc:any,r:any)=>({...acc,[r.role_code]:Number(r.required_count)}),{})
   const seen=new Set<string>()
   const currentAssignments=(assignments||[]).filter((a:any)=>{
    const position=Number(a.employee_position||1),key=`${a.team_role}:${position}`
    if(position>Number(counts[a.team_role]||0)||seen.has(key))return false
    seen.add(key);return true
   }).sort((a:any,b:any)=>a.team_role.localeCompare(b.team_role)||Number(a.employee_position||1)-Number(b.employee_position||1))
   const approvedSplit=(structure?.team_split_versions||[]).filter((s:any)=>s.status==='approved'&&s.effective_from<=asOf&&(!s.effective_to||s.effective_to>=asOf)).sort((a:any,b:any)=>b.version-a.version)[0]||null
   return out({ok:true,team,as_of:asOf,assignments:currentAssignments,structure,split:approvedSplit})
  }

  if(action==='set_assignments'){
   const {data:team,error:te}=await db.from('teams').select('id,organization_id,branch_id,status').eq('id',body.team_id).single()
   if(te||!team)return out({error:'Team not found'},404)
   if(!global&&(team.organization_id!==me.organization_id||team.branch_id!==me.branch_id))return out({error:'Team is outside your branch'},403)
   const start=String(body.effective_from||today())
   if(!validDate(start))return out({error:'Invalid effective date'},400)
   if(start<today())return out({error:'Past effective dates are blocked to preserve historical team records'},409)
   const raw=Array.isArray(body.assignments)?body.assignments:[]
   const assignments=raw.map((a:any)=>({employee_id:String(a.employee_id||''),team_role:String(a.team_role||''),employee_position:Number(a.employee_position||1)}))
   if(assignments.some((a:any)=>!a.employee_id||!['lead','assistant','driver'].includes(a.team_role)||!Number.isInteger(a.employee_position)||a.employee_position<1))return out({error:'Invalid assignment data'},400)
   const counts=roleCounts(assignments)
   if(counts.lead!==1||counts.driver!==1)return out({error:'A team must have exactly one sales leader and one driver; assistants are optional'},400)
   if(assignments.some((a:any)=>a.team_role==='lead'&&a.employee_position!==1||a.team_role==='driver'&&a.employee_position!==1))return out({error:'Leader and driver positions must be 1'},400)
   const assistantPositions=assignments.filter((a:any)=>a.team_role==='assistant').map((a:any)=>a.employee_position).sort((a:number,b:number)=>a-b)
   if(assistantPositions.some((p:number,i:number)=>p!==i+1))return out({error:'Assistant positions must be consecutive starting at 1'},400)
   const ids=assignments.map((a:any)=>a.employee_id)
   if(new Set(ids).size!==ids.length)return out({error:'An employee cannot be assigned to two positions in the same team'},400)
   const {data:people,error:pe2}=await db.from('profiles').select('id,role,active,organization_id,branch_id').in('id',ids)
   if(pe2)throw pe2
   if((people||[]).length!==ids.length)return out({error:'An employee was not found'},400)
   for(const a of assignments){
    const p=people!.find((x:any)=>x.id===a.employee_id)
    const roleOk=a.team_role==='driver'?p?.role==='driver':['lead','lead_sales','assistant'].includes(p?.role)
    if(!p?.active||p.organization_id!==team.organization_id||p.branch_id!==team.branch_id||!roleOk)return out({error:'Employee is inactive, outside the branch, or has an incompatible registration role'},400)
   }

   // Close the selected team's previous roster and any overlapping roster in another team.
   // Future-dated assignments are preserved; the new assignment ends the day before the next scheduled team.
   const {data:oldRows,error:oe}=await db.from('team_assignments').select('id,effective_from').eq('team_id',team.id).eq('assignment_status','active').lte('effective_from',start).or(`effective_to.is.null,effective_to.gte.${start}`)
   if(oe)throw oe
   for(const old of oldRows||[]){
    const end=old.effective_from===start?start:priorDate(start)
    const {error}=await db.from('team_assignments').update({effective_to:end,assignment_status:'closed'}).eq('id',old.id)
    if(error)throw error
   }
   const {data:otherCurrent,error:ocErr}=await db.from('team_assignments').select('id,team_id,effective_from').in('employee_id',ids).neq('team_id',team.id).eq('assignment_status','active').lte('effective_from',start).or(`effective_to.is.null,effective_to.gte.${start}`)
   if(ocErr)throw ocErr
   for(const old of otherCurrent||[]){
    const end=old.effective_from===start?start:priorDate(start)
    const {error}=await db.from('team_assignments').update({effective_to:end,assignment_status:'closed'}).eq('id',old.id)
    if(error)throw error
   }
   const {data:futureRows,error:futureErr}=await db.from('team_assignments').select('employee_id,effective_from').in('employee_id',ids).eq('assignment_status','active').gt('effective_from',start).order('effective_from',{ascending:true})
   if(futureErr)throw futureErr
   const nextDateByEmployee=new Map<string,string>()
   for(const future of futureRows||[])if(!nextDateByEmployee.has(future.employee_id))nextDateByEmployee.set(future.employee_id,future.effective_from)
   const insertRows=assignments.map((a:any)=>({...a,team_id:team.id,effective_from:start,effective_to:nextDateByEmployee.has(a.employee_id)?priorDate(nextDateByEmployee.get(a.employee_id)!):null,assignment_status:'active',created_by:me.id}))
   const {error:ie}=await db.from('team_assignments').insert(insertRows)
   if(ie)throw ie

   const {data:allStructures,error:stErr}=await db.from('team_structures').select('id,version,status,effective_from,effective_to,team_structure_roles(role_code,required_count)').eq('team_id',team.id).order('version',{ascending:false})
   if(stErr)throw stErr
   const shapes=(allStructures||[]).map((s:any)=>({structure:s,counts:(s.team_structure_roles||[]).reduce((acc:any,r:any)=>({...acc,[r.role_code]:Number(r.required_count)}),{})}))
   const current=shapes.find((x:any)=>x.structure.status==='active'&&x.structure.effective_from<=start&&(!x.structure.effective_to||x.structure.effective_to>=start)&&sameShape(x.counts,counts))
   let structureId=current?.structure.id||null
   if(!structureId){
    const version=Math.max(0,...(allStructures||[]).map((s:any)=>Number(s.version||0)))+1
    const {data:ns,error:ne}=await db.from('team_structures').insert({team_id:team.id,version,status:'active',effective_from:start,created_by:me.id}).select('id').single()
    if(ne)throw ne
    structureId=ns.id
    const roleRows=[['lead',counts.lead],['assistant',counts.assistant],['driver',counts.driver]].filter((x:any)=>Number(x[1])>0).map((x:any)=>({team_structure_id:structureId,role_code:x[0],required_count:Number(x[1]),position_no:x[0]==='lead'?1:x[0]==='assistant'?2:3}))
    const {error:re}=await db.from('team_structure_roles').insert(roleRows)
    if(re)throw re
    const previousActive=(allStructures||[]).find((s:any)=>s.status==='active'&&s.effective_from<=start&&(!s.effective_to||s.effective_to>=start)&&s.id!==structureId)
    if(previousActive){const end=previousActive.effective_from===start?start:priorDate(start);const {error:ce}=await db.from('team_structures').update({effective_to:end,status:'closed'}).eq('id',previousActive.id);if(ce)throw ce}
    // Reuse a previously approved split only when the structure counts match exactly.
    const matching=shapes.find((x:any)=>sameShape(x.counts,counts)&&x.structure.id!==structureId)
    if(matching){
     const {data:approved,error:asErr}=await db.from('team_split_versions').select('id,version,status,effective_from,effective_to,submitted_by,approved_by,approved_at,team_split_lines(role_code,employee_position,percentage,residual_eligible)').eq('team_structure_id',matching.structure.id).eq('status','approved').order('version',{ascending:false}).limit(1).maybeSingle()
     if(asErr)throw asErr
     if(approved?.team_split_lines?.length){
      const {data:copy,error:copyErr}=await db.from('team_split_versions').insert({team_structure_id:structureId,version:1,status:'approved',effective_from:start,submitted_by:me.id,submitted_at:new Date().toISOString(),approved_by:approved.approved_by||me.id,approved_at:approved.approved_at||new Date().toISOString()}).select('id').single()
      if(copyErr)throw copyErr
      const cloned=approved.team_split_lines.map((l:any)=>({team_split_version_id:copy.id,role_code:l.role_code,employee_position:l.employee_position,percentage:l.percentage,residual_eligible:l.residual_eligible}))
      const {error:lineErr}=await db.from('team_split_lines').insert(cloned)
      if(lineErr)throw lineErr
     }
    }
   }
   return out({ok:true,structure_id:structureId,counts})
  }

  if(action==='create_split'){
   if(me.role!=='branch_admin')return out({error:'Only Branch Admin can configure a team split'},403)
   const {data:team,error:te}=await db.from('teams').select('id,organization_id,branch_id').eq('id',body.team_id).single()
   if(te||!team)return out({error:'Team not found'},404)
   if(team.organization_id!==me.organization_id||team.branch_id!==me.branch_id)return out({error:'Team is outside your branch'},403)
   const start=String(body.effective_from||today())
   if(!validDate(start))return out({error:'Invalid effective date'},400)
   if(start<today())return out({error:'Past effective dates are blocked to preserve historical team records'},409)
   const {data:structure,error:se}=await db.from('team_structures').select('id,version,team_structure_roles(role_code,required_count)').eq('team_id',team.id).eq('status','active').lte('effective_from',start).or(`effective_to.is.null,effective_to.gte.${start}`).order('version',{ascending:false}).limit(1).maybeSingle()
   if(se)throw se
   if(!structure)return out({error:'Save the team roster before configuring its split'},409)
   const counts=(structure.team_structure_roles||[]).reduce((acc:any,r:any)=>({...acc,[r.role_code]:Number(r.required_count)}),{})
   const lines=Array.isArray(body.lines)?body.lines.map((l:any)=>({role_code:String(l.role_code||''),employee_position:Number(l.employee_position||1),percentage:Number(l.percentage),residual_eligible:!!l.residual_eligible})):[]
   if(!lines.length||lines.some((l:any)=>!['lead','assistant','driver'].includes(l.role_code)||!Number.isInteger(l.employee_position)||l.employee_position<1||!Number.isFinite(l.percentage)||l.percentage<0||l.percentage>100))return out({error:'Invalid split lines'},400)
   const expected=[{role_code:'lead',employee_position:1},{...({role_code:'driver',employee_position:1})},...Array.from({length:Number(counts.assistant||0)},(_,i)=>({role_code:'assistant',employee_position:i+1}))].sort((a,b)=>a.role_code.localeCompare(b.role_code)||a.employee_position-b.employee_position)
   const supplied=lines.map((l:any)=>({role_code:l.role_code,employee_position:l.employee_position})).sort((a:any,b:any)=>a.role_code.localeCompare(b.role_code)||a.employee_position-b.employee_position)
   if(JSON.stringify(expected)!==JSON.stringify(supplied))return out({error:'Split positions must match this team structure exactly'},409)
   const sum=Math.round(lines.reduce((n:number,l:any)=>n+l.percentage,0)*10000)/10000
   if(Math.abs(sum-100)>0.0001)return out({error:'Split must total exactly 100%'},400)
   const {data:latest,error:le}=await db.from('team_split_versions').select('id,version,status,effective_from').eq('team_structure_id',structure.id).order('version',{ascending:false}).limit(1).maybeSingle()
   if(le)throw le
   if(latest?.status==='pending')return out({error:'A split version is already awaiting review for this structure'},409)
   if(latest?.status==='approved'&&!body.confirm_change)return out({error:'This structure already has a saved approved split. Set confirm_change=true only when intentionally changing it.'},409)
   const version=Number(latest?.version||0)+1
   const {data:sv,error:sve}=await db.from('team_split_versions').insert({team_structure_id:structure.id,version,status:'pending',effective_from:start,submitted_by:me.id,submitted_at:new Date().toISOString()}).select('id').single()
   if(sve)throw sve
   const rows=lines.map((l:any)=>({team_split_version_id:sv.id,...l}))
   const {error:lineErr}=await db.from('team_split_lines').insert(rows)
   if(lineErr)throw lineErr
   return out({ok:true,split_version_id:sv.id})
  }

  if(action==='review_split'){
   if(!global)return out({error:'Only Super Admin can approve a split'},403)
   const decision=String(body.decision||'')
   if(!['approve','return'].includes(decision))return out({error:'Invalid decision'},400)
   const {data:s,error:se}=await db.from('team_split_versions').select('id,status,team_structure_id,effective_from').eq('id',body.split_version_id).single()
   if(se||!s)return out({error:'Split not found'},404)
   if(s.status!=='pending')return out({error:'Only pending splits can be reviewed'},409)
   if(decision==='approve'){
    const {data:lines,error:le}=await db.from('team_split_lines').select('role_code,employee_position,percentage').eq('team_split_version_id',s.id)
    if(le)throw le
    const sum=Math.round((lines||[]).reduce((n:number,l:any)=>n+Number(l.percentage||0),0)*10000)/10000
    if(Math.abs(sum-100)>0.0001)return out({error:'Split lines must total 100% before approval'},409)
    const {data:previous,error:previousError}=await db.from('team_split_versions').select('id,effective_from').eq('team_structure_id',s.team_structure_id).eq('status','approved').is('effective_to',null).lte('effective_from',s.effective_from).neq('id',s.id)
    if(previousError)throw previousError
    for(const old of previous||[]){
     const end=old.effective_from===s.effective_from?s.effective_from:priorDate(s.effective_from)
     const {error:closeError}=await db.from('team_split_versions').update({effective_to:end}).eq('id',old.id)
     if(closeError)throw closeError
    }
   }
   const update=decision==='approve'?{status:'approved',approved_by:me.id,approved_at:new Date().toISOString()}:{status:'returned',returned_reason:'Super Admin returned the split',approved_by:me.id,approved_at:new Date().toISOString()}
   const {error}=await db.from('team_split_versions').update(update).eq('id',s.id).eq('status','pending')
   if(error)throw error
   return out({ok:true})
  }
  return out({error:'Unknown action'},400)
 }catch(e){return out({error:e?.message||'Unexpected error'},500)}
})
