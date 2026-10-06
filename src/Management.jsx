import React, { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const roleNames = { lead: 'መሪ ሻጭ', lead_sales: 'መሪ ሻጭ', assistant: 'ረዳት ሻጭ', driver: 'ሾፌር', branch_admin: 'የቅርንጫፍ አስተዳዳሪ' }

async function callManageUser(body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL || 'https://cfjdhbldbmrzfgwzeran.supabase.co'}/functions/v1/manage-user`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Operation failed')
  return data
}

export function OrganizationManagement({ lang }) {
  const am = lang === 'am'
  const [orgs, setOrgs] = useState([])
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState({ name: '', code: '', branch_limit: 1 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setError('')
    const [{ data: o, error: oe }, { data: b, error: be }] = await Promise.all([
      supabase.from('organizations').select('id,name,code,active,branch_limit,created_at').order('created_at', { ascending: true }),
      supabase.from('branches').select('id,name,code,organization_id,active,created_at').order('created_at', { ascending: true })
    ])
    if (oe || be) throw oe || be
    setOrgs(o || []); setBranches(b || [])
  }
  useEffect(() => { load().catch(e => setError(e.message)) }, [])

  async function createOrg(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const { error } = await supabase.from('organizations').insert({ name: form.name.trim(), code: form.code.trim() || null, branch_limit: Math.max(1, Number(form.branch_limit) || 1) })
      if (error) throw error
      setForm({ name: '', code: '', branch_limit: 1 }); await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function updateOrg(org, patch) {
    setError('')
    const { error } = await supabase.from('organizations').update(patch).eq('id', org.id)
    if (error) setError(error.message); else await load()
  }

  async function createBranch(org) {
    const name = window.prompt(am ? 'የቅርንጫፍ ስም' : 'Branch name')
    if (!name?.trim()) return
    const code = window.prompt(am ? 'የቅርንጫፍ ኮድ (ካለ)' : 'Branch code (optional)')
    setBusy(true); setError('')
    try {
      const { error } = await supabase.from('branches').insert({ name: name.trim(), code: code?.trim() || null, organization_id: org.id, active: true })
      if (error) throw error
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async async function renameBranch(branch) {
    const name = window.prompt(am ? 'አዲስ የቅርንጫፍ ስም' : 'New branch name', branch.name)
    if (!name?.trim()) return
    const { error } = await supabase.from('branches').update({ name: name.trim() }).eq('id', branch.id)
    if (error) setError(error.message); else await load()
  }

  async function assignBranchAdmin(branch) {
    const name = window.prompt(am ? 'የBranch Admin ሙሉ ስም' : 'Branch Admin full name')
    if (!name?.trim()) return
    const phone = window.prompt(am ? 'የስልክ ቁጥር' : 'Phone number')
    if (!phone?.trim()) return
    const password = window.prompt(am ? 'የመጀመሪያ የይለፍ ቃል' : 'Initial password')
    if (!password) return
    setBusy(true); setError('')
    try {
      await callManageUser({
        operation: 'create',
        full_name: name.trim(),
        phone: phone.trim(),
        password,
        role: 'branch_admin',
        branch_id: branch.id,
        organization_id: branch.organization_id
      })
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return <section className="space-y-5">
    <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
      <h2 className="text-xl font-black">{am ? 'ድርጅቶች እና ቅርንጫፎች' : 'Organizations & Branches'}</h2>
      <p className="mt-1 text-sm text-slate-500">{am ? 'የድርጅት ስም፣ የቅርንጫፍ ገደብ እና ቅርንጫፎችን ያስተዳድሩ።' : 'Manage organizations, branch limits and branches.'}</p>
    </div>
    <form onSubmit={createOrg} className="grid gap-3 rounded-2xl bg-white p-5 shadow-sm md:grid-cols-4 dark:bg-slate-900">
      <input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder={am?'የድርጅት ስም':'Organization name'} className="h-11 rounded-xl border bg-transparent px-3" />
      <input value={form.code} onChange={e=>setForm({...form,code:e.target.value})} placeholder={am?'ኮድ':'Code'} className="h-11 rounded-xl border bg-transparent px-3" />
      <input type="number" min="1" value={form.branch_limit} onChange={e=>setForm({...form,branch_limit:e.target.value})} placeholder={am?'የቅርንጫፍ ገደብ':'Branch limit'} className="h-11 rounded-xl border bg-transparent px-3" />
      <button disabled={busy} className="rounded-xl bg-emerald-600 px-4 font-bold text-white">{am?'ድርጅት ፍጠር':'Create organization'}</button>
    </form>
    {error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    <div className="space-y-4">
      {orgs.map(org => {
        const bs = branches.filter(b => b.organization_id === org.id)
        return <div key={org.id} className="rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-black">{org.name}</h3><p className="text-xs text-slate-500">{org.code || '—'} · {bs.length} / {org.branch_limit} {am?'ቅርንጫፍ':'branches'}</p></div>
            <div className="flex gap-2">
              <input type="number" min={Math.max(1,bs.length)} value={org.branch_limit} onChange={e=>updateOrg(org,{branch_limit:Math.max(1,Number(e.target.value)||1)})} className="w-24 rounded-lg border bg-transparent px-2 py-2 text-sm" title={am?'የቅርንጫፍ ገደብ':'Branch limit'} />
              <button onClick={()=>createBranch(org)} disabled={busy || bs.length >= org.branch_limit} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{am?'ቅርንጫፍ ጨምር':'Add branch'}</button>
              <button onClick={()=>updateOrg(org,{active:!org.active})} className="rounded-lg border px-3 py-2 text-xs font-bold">{org.active?(am?'አቦዝን':'Deactivate'):(am?'አንቃ':'Activate')}</button>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            {bs.map(b=><div key={b.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><div><span className="font-bold">{b.name}</span><span className="ml-2 text-xs text-slate-500">{b.code || ''}</span></div><div className="flex gap-2"><button onClick={()=>renameBranch(b)} className="rounded-lg border px-2 py-1 text-xs">{am?'ስም ቀይር':'Rename'}</button><button onClick={()=>assignBranchAdmin(b)} disabled={busy || !b.active} className="rounded-lg border px-2 py-1 text-xs">{am?'Branch Admin መመደብ':'Assign Branch Admin'}</button><button onClick={()=>supabase.from('branches').update({active:!b.active}).eq('id',b.id).then(({error})=>error?setError(error.message):load())} className="rounded-lg border px-2 py-1 text-xs">{b.active?(am?'አቦዝን':'Deactivate'):(am?'አንቃ':'Activate')}</button></div></div>)}
          </div>
        </div>
      })}
    </div>
  </section>
}

export function UserManagement({ user, lang }) {
  const am = lang === 'am'
  const [users,setUsers]=useState([]); const [branches,setBranches]=useState([])
  const [form,setForm]=useState({full_name:'',phone:'',password:'',role:'assistant',branch_id:user.branch_id||''})
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [editing,setEditing]=useState(null)
  async function load() {
    const q=supabase.from('profiles').select('id,full_name,phone,role,active,branch_id,organization_id,created_at').order('created_at',{ascending:false})
    if(user.role==='branch_admin') q.eq('branch_id',user.branch_id).eq('organization_id',user.organization_id)
    const [{data:u,error:ue},{data:b,error:be}]=await Promise.all([q,user.role==='super_admin'?supabase.from('branches').select('id,name,organization_id').order('name'):Promise.resolve({data:[]})])
    if(ue||be) throw ue||be; setUsers(u||[]); setBranches(b||[])
  }
  useEffect(()=>{load().catch(e=>setError(e.message))},[])
  function reset(){setEditing(null);setForm({full_name:'',phone:'',password:'',role:'assistant',branch_id:user.branch_id||''})}
  async function save(e){e.preventDefault();setBusy(true);setError('')
    try{
      if(editing){ await callManageUser({operation:'update',user_id:editing.id,full_name:form.full_name,phone:form.phone,role:form.role,branch_id:form.branch_id,organization_id:user.organization_id}) }
      else { await callManageUser({operation:'create',full_name:form.full_name,phone:form.phone,password:form.password,role:form.role,branch_id:form.branch_id,organization_id:user.organization_id}) }
      reset(); await load()
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function action(body){setBusy(true);setError('');try{await callManageUser(body);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <section className="space-y-5">
    <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900"><h2 className="text-xl font-black">{am?'ተጠቃሚ አስተዳደር':'User management'}</h2><p className="mt-1 text-sm text-slate-500">{am?'በራስዎ ቅርንጫፍ ውስጥ ተጠቃሚዎችን ይፍጠሩ እና ያስተዳድሩ።':'Create and manage users in your permitted scope.'}</p></div>
    <form onSubmit={save} className="grid gap-3 rounded-2xl bg-white p-5 shadow-sm md:grid-cols-5 dark:bg-slate-900">
      <input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} placeholder={am?'ሙሉ ስም':'Full name'} className="h-11 rounded-xl border bg-transparent px-3" />
      <input required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="09XXXXXXXX" className="h-11 rounded-xl border bg-transparent px-3" />
      {!editing && <input required minLength="6" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder={am?'የይለፍ ቃል':'Password'} className="h-11 rounded-xl border bg-transparent px-3" />}
      <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})} className="h-11 rounded-xl border bg-transparent px-3">{(user.role==='super_admin'?['branch_admin','lead','assistant','driver']:['lead','assistant','driver']).map(r=><option key={r} value={r}>{roleNames[r]}</option>)}</select>
      {user.role==='super_admin' && <select required value={form.branch_id} onChange={e=>setForm({...form,branch_id:e.target.value})} className="h-11 rounded-xl border bg-transparent px-3"><option value="">{am?'ቅርንጫፍ ምረጥ':'Select branch'}</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}
      <div className="flex gap-2"><button disabled={busy} className="rounded-xl bg-emerald-600 px-4 font-bold text-white">{editing?(am?'አስተካክል':'Update'):(am?'ፍጠር':'Create')}</button>{editing&&<button type="button" onClick={reset} className="rounded-xl border px-4">{am?'ሰርዝ':'Cancel'}</button>}</div>
    </form>
    {error&&<div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm dark:bg-slate-900"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">{am?'ስም':'Name'}</th><th className="p-3">{am?'ስልክ':'Phone'}</th><th className="p-3">{am?'ሚና':'Role'}</th><th className="p-3">{am?'ሁኔታ':'Status'}</th><th className="p-3">{am?'ተግባር':'Actions'}</th></tr></thead><tbody>{users.map(u=><tr key={u.id} className="border-b last:border-0"><td className="p-3 font-semibold">{u.full_name}</td><td className="p-3">{u.phone||'—'}</td><td className="p-3">{roleNames[u.role]||u.role}</td><td className="p-3">{u.active?(am?'ንቁ':'Active'):(am?'ታግዷል':'Disabled')}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button onClick={()=>{setEditing(u);setForm({full_name:u.full_name,phone:u.phone||'',password:'',role:u.role,branch_id:u.branch_id||''})}} className="rounded-lg border px-2 py-1 text-xs">{am?'ማረም':'Edit'}</button><button onClick={()=>action({operation:u.active?'deactivate':'activate',user_id:u.id})} className="rounded-lg border px-2 py-1 text-xs">{u.active?(am?'አግድ':'Disable'):(am?'አንቃ':'Activate')}</button><button onClick={()=>{const p=window.prompt(am?'አዲስ የይለፍ ቃል':'New password');if(p)action({operation:'reset_password',user_id:u.id,password:p})}} className="rounded-lg border px-2 py-1 text-xs">{am?'ፓስወርድ ቀይር':'Reset password'}</button><button onClick={()=>{if(window.confirm(am?'ይህን ተጠቃሚ ማጥፋት ይፈልጋሉ?':'Delete this user?'))action({operation:'delete',user_id:u.id})}} className="rounded-lg border border-rose-300 px-2 py-1 text-xs text-rose-700">{am?'ሰርዝ':'Delete'}</button></div></td></tr>)}</tbody></table></div>
  </section>
}
