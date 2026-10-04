import React, { useState, useEffect } from 'react'

/* ================= SUPABASE CONFIG ================= */
const SUPABASE_URL = 'https://cfjdhbldbmrzfgwzeran.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmamRoYmxkYm1yemZnd3plcmFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyOTI5NDcsImV4cCI6MjEwMTg2ODk0N30.IodZLHxIm-sJl8utu6tIq0LBjFNMJKmNRQ3pYcLmUYA'
const TERMS_VERSION = 1

const T = {
  brand:{en:'Agelgil',am:'አገልግል'},
  tagline:{en:'Commission & Sales Distribution',am:'የኮሚሽን እና ሽያጭ ስርጭት ስርዓት'},
  signIn:{en:'Sign In',am:'ግባ'}, phone:{en:'Phone Number',am:'ስልክ ቁጥር'}, password:{en:'Password',am:'የይለፍ ቃል'},
  invalidCredentials:{en:'Invalid phone or password',am:'ስልክ ቁጥር ወይም የይለፍ ቃል ስህተት ነው'},
  noProfile:{en:'Your account has no active profile. Please contact an administrator.',am:'አካውንትዎ የነቃ ፕሮፋይል የለውም። አስተዳዳሪን ያነጋግሩ።'},
  accountDisabled:{en:'This account is disabled. Please contact an administrator.',am:'ይህ አካውንት ታግዷል። አስተዳዳሪን ያነጋግሩ።'},
  databaseError:{en:'The account service is temporarily unavailable. Please try again.',am:'የአካውንት ስርዓቱ ለጊዜው አይሰራም። እባክዎ እንደገና ይሞክሩ።'},
  networkError:{en:'Network connection failed. Please check your internet connection.',am:'የኢንተርኔት ግንኙነት ችግር አለ። እባክዎ ግንኙነትዎን ያረጋግጡ።'},
  genericError:{en:'An error occurred',am:'ስህተት ተከስቷል'}, signOut:{en:'Sign out',am:'ውጣ'},
  navDashboard:{en:'Dashboard',am:'ዳሽቦርድ'}, navNewSale:{en:'New Sale',am:'አዲስ ሽያጭ'}, navReports:{en:'Reports',am:'ሪፖርቶች'},
  navProfile:{en:'My Profile',am:'የእኔ መገለጫ'}, navApprovals:{en:'Approvals',am:'ማረጋገጫ'}, navSettings:{en:'Settings',am:'ቅንብሮች'}, navUsers:{en:'Users',am:'ተጠቃሚዎች'},
  termsTitle:{en:'Mandatory Declaration',am:'ግዴታዊ መግለጫ'}, termsSub:{en:'You must accept before using the app.',am:'አፑን ከመጠቀምዎ በፊት መስማማት አለብዎት።'},
  termsText:{en:'I confirm that the sales data I enter matches official company records.',am:'እኔ የማስገባው የሽያጭ መረጃ ከድርጅቱ ትክክለኛ ዳታ ጋር አንድ አይነት መሆኑን አረጋግጣለሁ።'},
  agreeBtn:{en:'I Agree',am:'እስማማለሁ'}, roleAdmin:{en:'Admin',am:'አስተዳዳሪ'}, roleLead:{en:'Lead Sales',am:'መሪ ሻጭ'},
  roleAssistant:{en:'Assistant',am:'ረዳት'}, roleDriver:{en:'Driver',am:'ሾፌር'}, roleBranchAdmin:{en:'Branch Admin',am:'የቅርንጫፍ አስተዳዳሪ'},
  roleSuperAdmin:{en:'Super Admin',am:'ዋና አስተዳዳሪ'}, roleUnknown:{en:'User',am:'ተጠቃሚ'}, welcome:{en:'Welcome',am:'እንኳን ደህና መጡ'},
  loading:{en:'Loading…',am:'በመጫን ላይ…'}, statThisMonth:{en:'This Month',am:'በዚህ ወር'}, statRecords:{en:'Sales Records',am:'የሽያጭ መዝገቦች'},
  statStaff:{en:'Active Staff',am:'ገቢር ሰራተኞች'}, pendingCount:{en:'Pending',am:'የሚጠብቁ'}, developedBy:{en:'Developed by',am:'የተሰራው በ'},
  developerName:{en:'manchilotabd',am:'manchilotabd'}, comingSoon:{en:'Coming soon...',am:'በቅርቡ ይጨመራል...'},
}

function normalizePhone(phone){ let digits = String(phone).replace(/\D/g, ''); if(digits.startsWith('251')) digits = '0' + digits.slice(3); return digits }
function getRoleKey(role){
  const normalized = String(role || '').toLowerCase().replace(/[-\s]/g, '_')
  return ({admin:'roleAdmin',super_admin:'roleSuperAdmin',branch_admin:'roleBranchAdmin',lead:'roleLead',lead_sales:'roleLead',assistant:'roleAssistant',driver:'roleDriver'})[normalized] || 'roleUnknown'
}
function errorKey(error){
  if(error?.key) return error.key
  if(!error) return 'genericError'
  if(error.name === 'TypeError' || /failed to fetch|network/i.test(error.message || '')) return 'networkError'
  if(/profiles|terms_acceptances|rest\/v1/i.test(error.message || '')) return 'databaseError'
  return 'genericError'
}

let sbToken = localStorage.getItem('csd_sb_token') || null
async function sbReq(path, opts = {}){
  const { method='GET', body, auth=true } = opts
  const headers = { apikey: SUPABASE_ANON_KEY, 'Content-Type':'application/json' }
  if(auth) headers.Authorization = `Bearer ${sbToken || SUPABASE_ANON_KEY}`
  const res = await fetch(`${SUPABASE_URL}${path}`, {method, headers, body: body ? JSON.stringify(body) : undefined})
  if(!res.ok){ let msg=''; try{msg=await res.text()}catch{}; throw new Error(msg || 'HTTP '+res.status) }
  if(res.status === 204) return null
  const txt = await res.text(); return txt ? JSON.parse(txt) : null
}

const API = {
  async login(phone,password){
    try{
      const data = await sbReq('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{phone:normalizePhone(phone),password}})
      if(!data?.access_token || !data?.user?.id) throw {key:'invalidCredentials'}
      sbToken=data.access_token; localStorage.setItem('csd_sb_token',sbToken); localStorage.setItem('csd_sb_uid',data.user.id)
      const rows=await sbReq(`/rest/v1/profiles?id=eq.${data.user.id}&select=*`)
      if(!rows?.[0]) throw {key:'noProfile'}
      if(!rows[0].active) throw {key:'accountDisabled'}
      return {id:rows[0].id,phone,name:rows[0].full_name,role:rows[0].role,active:true}
    }catch(e){ if(e?.key) throw e; throw {key:errorKey(e)} }
  },
  async currentUser(){
    const uid=localStorage.getItem('csd_sb_uid'); if(!uid || !sbToken) return null
    try{
      const rows=await sbReq(`/rest/v1/profiles?id=eq.${uid}&select=*`)
      if(!rows?.[0] || !rows[0].active) return null
      return {id:rows[0].id,phone:rows[0].phone||'',name:rows[0].full_name,role:rows[0].role,active:true}
    }catch{
      localStorage.removeItem('csd_sb_token'); localStorage.removeItem('csd_sb_uid'); sbToken=null; return null
    }
  },
  async logout(){ try{await sbReq('/auth/v1/logout',{method:'POST'})}catch{}; sbToken=null; localStorage.removeItem('csd_sb_token'); localStorage.removeItem('csd_sb_uid') },
  async hasAcceptedTerms(uid){ const rows=await sbReq(`/rest/v1/terms_acceptances?user_id=eq.${uid}&version=eq.${TERMS_VERSION}&select=id&limit=1`); return !!rows?.[0] },
  async acceptTerms(uid,lang){ await sbReq('/rest/v1/terms_acceptances',{method:'POST',body:{user_id:uid,language:lang,version:TERMS_VERSION}}) },
}

export default function App(){
  const [lang,setLang]=useState('am'),[theme,setTheme]=useState('dark'),[user,setUser]=useState(null),[loading,setLoading]=useState(true)
  const [page,setPage]=useState('dashboard'),[accepted,setAccepted]=useState(true),[loginError,setLoginError]=useState(''),[loginLoading,setLoginLoading]=useState(false),[termsError,setTermsError]=useState('')
  const t=key=>T[key]?.[lang]||key
  useEffect(()=>{document.documentElement.classList.toggle('dark',theme==='dark')},[theme])
  useEffect(()=>{(async()=>{try{const u=await API.currentUser();if(u){setUser(u);setAccepted(await API.hasAcceptedTerms(u.id))}}catch{setUser(null);setAccepted(true)}finally{setLoading(false)}})()},[])

  const handleLogin=async e=>{
    e.preventDefault();setLoginLoading(true);setLoginError('')
    try{const u=await API.login(e.target.phone.value,e.target.password.value);setUser(u);setAccepted(await API.hasAcceptedTerms(u.id))}
    catch(err){setLoginError(errorKey(err));setUser(null)}finally{setLoginLoading(false)}
  }
  const handleLogout=async()=>{await API.logout();setUser(null);setPage('dashboard')}
  const handleAcceptTerms=async()=>{if(!user)return;setTermsError('');try{await API.acceptTerms(user.id,lang);setAccepted(true)}catch(err){setTermsError(errorKey(err))}}

  if(loading)return <div className="flex h-screen items-center justify-center bg-zinc-950"><div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent"></div></div>

  if(!user)return <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4"><div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100">
    <div className="text-center mb-6"><h1 className="text-3xl font-bold text-emerald-500 mb-2">{t('brand')}</h1><p className="text-sm text-zinc-400">{t('tagline')}</p></div>
    <form onSubmit={handleLogin} className="space-y-4">
      <div><label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">{t('phone')}</label><input name="phone" type="tel" defaultValue="0911000001" placeholder="09XXXXXXXX" required className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"/></div>
      <div><label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">{t('password')}</label><input name="password" type="password" defaultValue="demo123" required className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"/></div>
      {loginError&&<div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">{t(loginError)}</div>}
      <button type="submit" disabled={loginLoading} className="w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50">{loginLoading?t('loading'):t('signIn')}</button>
    </form>
    <div className="mt-6 pt-4 border-t border-zinc-800 text-center"><p className="text-xs text-zinc-500">{t('developedBy')} <span className="text-emerald-500 font-medium">{t('developerName')}</span></p></div>
  </div></div>

  if(!accepted)return <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4"><div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100">
    <h2 className="text-xl font-bold mb-2 text-emerald-400">{t('termsTitle')}</h2><p className="text-sm text-zinc-400 mb-4">{t('termsSub')}</p>
    <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700/50 mb-6 text-sm leading-relaxed text-zinc-200">{t('termsText')}</div>
    {termsError&&<div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs mb-4">{t(termsError)}</div>}
    <button onClick={handleAcceptTerms} className="w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium">{t('agreeBtn')}</button>
  </div></div>

  const roleKey=getRoleKey(user.role)
  const elevated=['admin','super_admin'].includes(String(user.role||'').toLowerCase())
  const navItems=['dashboard','newSale','reports','profile',...(elevated?['approvals','settings','users']:[])]

  return <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
    <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-3"><h1 className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{t('brand')}</h1><span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">{t(roleKey)}</span></div>
      <div className="flex items-center gap-2"><button onClick={()=>setLang(lang==='am'?'en':'am')} className="px-3 py-1.5 rounded-lg text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">{lang.toUpperCase()}</button><button onClick={()=>setTheme(theme==='dark'?'light':'dark')} className="px-3 py-1.5 rounded-lg text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">{theme==='dark'?'🌞':'🌙'}</button><button onClick={handleLogout} className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">{t('signOut')}</button></div>
    </header>
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2 overflow-x-auto">{navItems.map(p=><button key={p} onClick={()=>setPage(p)} className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${page===p?'bg-emerald-600 text-white':'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>{t('nav'+p.charAt(0).toUpperCase()+p.slice(1))}</button>)}</div>
      {page==='dashboard'&&<div className="space-y-6"><h2 className="text-2xl font-bold">{t('welcome')}, {user.name}! 👋</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"><p className="text-xs text-zinc-500 mb-1">{t('statThisMonth')}</p><p className="text-2xl font-bold">0 ብር</p></div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"><p className="text-xs text-zinc-500 mb-1">{t('statRecords')}</p><p className="text-2xl font-bold">0</p></div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"><p className="text-xs text-zinc-500 mb-1">{t('statStaff')}</p><p className="text-2xl font-bold">-</p></div>
        {elevated&&<div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"><p className="text-xs text-zinc-500 mb-1">{t('pendingCount')}</p><p className="text-2xl font-bold">0</p></div>}
      </div></div>}
      {page!=='dashboard'&&<div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center"><div className="text-4xl mb-3">🚧</div><h2 className="text-lg font-bold mb-2">{t('nav'+page.charAt(0).toUpperCase()+page.slice(1))}</h2><p className="text-zinc-500">{t('comingSoon')}</p></div>}
    </div>
    <footer className="mt-12 py-6 border-t border-zinc-200 dark:border-zinc-800 text-center"><p className="text-xs text-zinc-400 dark:text-zinc-500">{t('brand')} © {new Date().getFullYear()} · {t('developedBy')}{' '}<a href="https://github.com/manchilotabd" target="_blank" rel="noreferrer" className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium">{t('developerName')}</a></p></footer>
  </div>
}
