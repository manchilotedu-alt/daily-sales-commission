import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

const ROLE = {
  SUPER_ADMIN: 'super_admin',
  BRANCH_ADMIN: 'branch_admin',
  LEAD: 'lead',
  ASSISTANT: 'assistant',
  DRIVER: 'driver',
}

const labels = {
  am: {
    brand:'Dirsha-ድርሻ',
    subtitle:'የኮሚሽን እና ሽያጭ ስርጭት ስርዓት',
    login:'ግባ',
    phone:'ስልክ ቁጥር',
    password:'የይለፍ ቃል',
    phoneHint:'09XXXXXXXX ወይም +251XXXXXXXXX',
    invalid:'ስልክ ቁጥር ወይም የይለፍ ቃል ስህተት ነው።',
    disabled:'ይህ አካውንት ታግዷል።',
    noProfile:'የተጠቃሚ ፕሮፋይል አልተገኘም።',
    network:'የኢንተርኔት ግንኙነት ችግር አለ።',
    database:'የዳታቤዝ አገልግሎት ለጊዜው አይገኝም።',
    config:'የስርዓቱ አወቃቀር አልተሟላም።',
    loading:'በመጫን ላይ…',
    dashboard:'ዳሽቦርድ',
    users:'ተጠቃሚዎች',
    branches:'ቅርንጫፎች',
    sales:'ሽያጮች',
    commission:'ኮሚሽን',
    reports:'ሪፖርቶች',
    profile:'የእኔ መገለጫ',
    settings:'ቅንብሮች',
    welcome:'እንኳን ደህና መጡ',
    signedInAs:'የገቡት እንደ',
    signOut:'ውጣ',
    systemReady:'የስርዓቱ መሠረት ተዘጋጅቷል',
    foundation:'ይህ የአዲሱ ስርዓት መሠረታዊ ስሪት ነው። የቅርንጫፍ ፍቃድ፣ ተጠቃሚ አስተዳደር፣ ሽያጭ እና ኮሚሽን በተለያዩ ደረጃዎች ይገነባሉ።',
    noBranch:'ቅርንጫፍ አልተመደበም',
    roleSuperAdmin:'ዋና አስተዳዳሪ',
    roleBranchAdmin:'የቅርንጫፍ አስተዳዳሪ',
    roleLead:'መሪ ሻጭ',
    roleAssistant:'ረዳት ሻጭ',
    roleDriver:'ሾፌር',
    adminScope:'ሁሉንም ቅርንጫፎች ማስተዳደር',
    branchScope:'የራስዎን ቅርንጫፍ ብቻ ማስተዳደር',
    upcoming:'ቀጣይ የሚገነባ',
    usersDesc:'ተጠቃሚዎችን መፍጠር፣ ማረም፣ ማገድ እና የይለፍ ቃል ማስተካከል',
    branchDesc:'ቅርንጫፎችን እና የቅርንጫፍ አስተዳዳሪዎችን ማስተዳደር',
    salesDesc:'የሽያጭ መመዝገብ እና የሽያጭ ሂደት',
    commissionDesc:'የግል እና የቡድን ኮሚሽን ስሌት',
    reportsDesc:'የቅርንጫፍ እና የአጠቃላይ ሪፖርቶች',
  },
  en: {
    brand:'Dirsha-ድርሻ',
    subtitle:'Commission & Sales Distribution System',
    login:'Sign In',
    phone:'Phone Number',
    password:'Password',
    phoneHint:'09XXXXXXXX or +251XXXXXXXXX',
    invalid:'Invalid phone number or password.',
    disabled:'This account is disabled.',
    noProfile:'User profile was not found.',
    network:'Network connection failed.',
    database:'Database service is temporarily unavailable.',
    config:'System configuration is incomplete.',
    loading:'Loading…',
    dashboard:'Dashboard',
    users:'Users',
    branches:'Branches',
    sales:'Sales',
    commission:'Commission',
    reports:'Reports',
    profile:'My Profile',
    settings:'Settings',
    welcome:'Welcome',
    signedInAs:'Signed in as',
    signOut:'Sign out',
    systemReady:'System foundation is ready',
    foundation:'This is the foundation of the rebuilt system. Branch permissions, user management, sales and commission will be implemented in controlled stages.',
    noBranch:'No branch assigned',
    roleSuperAdmin:'Super Admin',
    roleBranchAdmin:'Branch Admin',
    roleLead:'Lead Sales',
    roleAssistant:'Sales Assistant',
    roleDriver:'Sales Driver',
    adminScope:'Manage all branches',
    branchScope:'Manage your branch only',
    upcoming:'Coming next',
    usersDesc:'Create, edit, disable and reset user passwords',
    branchDesc:'Manage branches and Branch Admins',
    salesDesc:'Record and process sales',
    commissionDesc:'Calculate individual and team commission',
    reportsDesc:'Branch and global reports',
  }
}

const roleLabel = (role, lang) => labels[lang][({
  super_admin:'roleSuperAdmin',
  branch_admin:'roleBranchAdmin',
  lead:'roleLead',
  lead_sales:'roleLead',
  assistant:'roleAssistant',
  driver:'roleDriver'
}[String(role || '').toLowerCase()] || 'roleAssistant')]

function normalizePhone(value){
  let digits = String(value || '').replace(/\\D/g,'')
  if(digits.startsWith('251')) digits = '+' + digits
  else if(digits.startsWith('0')) digits = '+251' + digits.slice(1)
  else if(!digits.startsWith('+')) digits = '+251' + digits
  return digits
}

function friendlyError(error, lang){
  const message = String(error?.message || '').toLowerCase()
  if(message.includes('invalid login credentials')) return 'invalid'
  if(message.includes('user not found') || message.includes('invalid password')) return 'invalid'
  if(message.includes('failed to fetch') || message.includes('network')) return 'network'
  if(message.includes('profiles') || message.includes('branch') || message.includes('postgrest')) return 'database'
  return 'database'
}

function roleCapabilities(role){
  if(role === ROLE.SUPER_ADMIN) return {
    scope: labels.am.adminScope,
    pages: ['dashboard','branches','users','sales','commission','reports','profile','settings']
  }
  if(role === ROLE.BRANCH_ADMIN) return {
    scope: labels.am.branchScope,
    pages: ['dashboard','users','sales','commission','reports','profile','settings']
  }
  return {
    scope: '',
    pages: ['dashboard','sales','commission','reports','profile']
  }
}

async function getProfile(userId){
  const { data, error } = await supabase
    .from('profiles')
    .select('id,full_name,phone,role,active,organization_id,branch_id')
    .eq('id', userId)
    .maybeSingle()
  if(error) throw error
  return data
}

function Login({lang,setLang,onLogin}){
  const t = labels[lang]
  const [phone,setPhone] = useState('')
  const [password,setPassword] = useState('')
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)

  async function submit(event){
    event.preventDefault()
    setBusy(true); setError('')
    try{
      const {data,error:authError} = await supabase.auth.signInWithPassword({
        phone: normalizePhone(phone),
        password
      })
      if(authError) throw authError
      if(!data?.user) throw new Error('Invalid login credentials')
      const profile = await getProfile(data.user.id)
      if(!profile) { await supabase.auth.signOut(); throw new Error('profile missing') }
      if(profile.active === false) { await supabase.auth.signOut(); throw new Error('user disabled') }
      onLogin({...profile, email:null})
    }catch(error){
      if(String(error?.message || '').includes('user disabled')) setError('disabled')
      else if(String(error?.message || '').includes('profile missing')) setError('noProfile')
      else setError(friendlyError(error,lang))
    }finally{
      setBusy(false)
    }
  }

  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
    <div className="mx-auto flex min-h-[85vh] max-w-md items-center justify-center">
      <section className="w-full rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-2xl font-black text-emerald-400">D</div>
          <h1 className="text-3xl font-black tracking-tight">{t.brand}</h1>
          <p className="mt-2 text-sm text-slate-400">{t.subtitle}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">{t.phone}</span>
            <input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" autoComplete="username" placeholder={t.phoneHint} required className="h-12 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">{t.password}</span>
            <input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" required className="h-12 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
          </label>
          {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{t[error] || t.database}</div>}
          <button disabled={busy} className="h-12 w-full rounded-xl bg-emerald-600 font-bold transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">{busy ? t.loading : t.login}</button>
        </form>
        <button onClick={()=>setLang(lang==='am'?'en':'am')} className="mx-auto mt-5 block rounded-lg px-3 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800">{lang==='am'?'English':'አማርኛ'}</button>
        <p className="mt-5 text-center text-xs text-slate-500">Phone + Password authentication · No fake email identity</p>
      </section>
    </div>
  </main>
}

function Shell({user,lang,setLang,onLogout}){
  const t = labels[lang]
  const [page,setPage] = useState('dashboard')
  const scopeLabel = user.organization_id ? `Organization: ${user.organization_id}` : ''
  const caps = roleCapabilities(user.role)
  const pages = caps.pages
  const cards = [
    ['users','usersDesc','👥'],
    ['branches','branchDesc','🏢'],
    ['sales','salesDesc','🧾'],
    ['commission','commissionDesc','💰'],
    ['reports','reportsDesc','📊'],
  ]
  const visibleCards = cards.filter(([key]) => pages.includes(key))

  return <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div>
          <div className="font-black text-emerald-600 dark:text-emerald-400">{t.brand}</div>
          <div className="text-xs text-slate-500">{roleLabel(user.role,lang)}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setLang(lang==='am'?'en':'am')} className="rounded-lg px-3 py-2 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800">{lang==='am'?'EN':'አማ'}</button>
          <button onClick={onLogout} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">{t.signOut}</button>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-7xl px-4 py-5 pb-10">
      <nav className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {pages.map(key=><button key={key} onClick={()=>setPage(key)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold ${page===key?'bg-emerald-600 text-white':'bg-white text-slate-600 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{t[key]}</button>)}
      </nav>

      {page==='dashboard' && <>
        <section className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{t.welcome}, {user.full_name}</p>
          <h1 className="mt-1 text-2xl font-black">{t.systemReady}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">{t.foundation}</p>
          <div className="mt-4 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">{scopeLabel}{scopeLabel && ' · '}{user.branch_id ? `Branch: ${user.branch_id}` : t.noBranch} · {roleLabel(user.role,lang)}</div>
        </section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCards.map(([key,desc,icon])=><button key={key} onClick={()=>setPage(key)} className="text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            <div className="text-2xl">{icon}</div><h2 className="mt-3 font-black">{t[key]}</h2><p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{t[desc]}</p>
          </button>)}
        </div>
      </>}

      {page!=='dashboard' && <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <div className="text-4xl">{page==='users'?'👥':page==='branches'?'🏢':page==='sales'?'🧾':page==='commission'?'💰':page==='reports'?'📊':'⚙️'}</div>
        <h2 className="mt-4 text-xl font-black">{t[page]}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">{t[page==='users'?'usersDesc':page==='branches'?'branchDesc':page==='sales'?'salesDesc':page==='commission'?'commissionDesc':page==='reports'?'reportsDesc':'foundation']}</p>
        <div className="mt-5 rounded-xl bg-slate-50 p-4 text-xs font-semibold text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">{t.upcoming}</div>
      </section>}
    </main>
  </div>
}

export default function App(){
  const [lang,setLang] = useState('am')
  const [user,setUser] = useState(null)
  const [loading,setLoading] = useState(true)
  const [fatal,setFatal] = useState('')

  useEffect(()=>{
    let active = true
    ;(async()=>{
      try{
        const {data,error} = await supabase.auth.getSession()
        if(error) throw error
        if(data.session?.user){
          const profile = await getProfile(data.session.user.id)
          if(profile && profile.active !== false && active) setUser(profile)
        }
      }catch(error){
        if(active) setFatal(friendlyError(error,lang))
      }finally{
        if(active) setLoading(false)
      }
    })()
    const {data:listener} = supabase.auth.onAuthStateChange(async (_event,session)=>{
      if(!session){ if(active) setUser(null); return }
      try{
        const profile = await getProfile(session.user.id)
        if(active && profile && profile.active !== false) setUser(profile)
      }catch{}
    })
    return ()=>{ active=false; listener.subscription.unsubscribe() }
  },[])

  async function logout(){
    await supabase.auth.signOut()
    setUser(null)
  }

  if(fatal==='config') return <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center text-white">{labels[lang].config}</div>
  if(loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-emerald-400">{labels[lang].loading}</div>
  if(!user) return <Login lang={lang} setLang={setLang} onLogin={setUser}/>
  return <Shell user={user} lang={lang} setLang={setLang} onLogout={logout}/>
}
