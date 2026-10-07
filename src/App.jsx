import React,{useEffect,useState} from 'react'
import {supabase} from './lib/supabase'
import {OrganizationManagement,UserManagement} from './Management'
import {SalesPage} from './Sales'
import {SalesReviewPage} from './SalesReview'
import {TeamManagement} from './TeamManagement'

const roles={
 super_admin:'ዋና አስተዳዳሪ',admin:'ዋና አስተዳዳሪ',branch_admin:'የቅርንጫፍ አስተዳዳሪ',
 lead:'መሪ ሻጭ',lead_sales:'መሪ ሻጭ',assistant:'ረዳት',driver:'ሾፌር'
}
const nav={dashboard:'ዳሽቦርድ',branches:'ድርጅቶች እና ቅርንጫፎች',users:'ተጠቃሚዎች',teams:'ቡድን እና Split',sales:'ሽያጭ',commissions:'ኮሚሽን',reports:'ሪፖርቶች',profile:'መገለጫ'}
const normalizePhone=v=>{let d=String(v||'').replace(/\D/g,'');if(d.startsWith('251'))return '+'+d;if(d.startsWith('0'))return '+251'+d.slice(1);return d? '+'+d:''}

async function loadProfile(id){
 const {data,error}=await supabase.from('profiles').select('*').eq('id',id).single()
 if(error)throw error
 if(!data.active)throw new Error('ACCOUNT_DISABLED')
 return data
}
function errorText(e){
 const m=e?.message||''
 if(m==='ACCOUNT_DISABLED')return 'ይህ አካውንት ታግዷል።'
 if(/invalid login credentials/i.test(m))return 'ስልክ ቁጥር ወይም የይለፍ ቃል ስህተት ነው።'
 if(/network|fetch/i.test(m))return 'የኢንተርኔት ግንኙነት ችግር አለ።'
 return m||'ስህተት ተከስቷል።'
}

export default function App(){
 const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[page,setPage]=useState('dashboard'),[error,setError]=useState('')
 const role=user?.role||''
 const global=['super_admin','admin'].includes(role)
 const branchAdmin=role==='branch_admin'

 const refresh=async()=>{try{const {data:{user:u}}=await supabase.auth.getUser();if(!u){setUser(null);return}setUser(await loadProfile(u.id))}catch(e){setUser(null)}}
 useEffect(()=>{refresh().finally(()=>setLoading(false));const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,session)=>{if(session?.user)loadProfile(session.user.id).then(setUser).catch(()=>setUser(null));else setUser(null)});return()=>subscription.unsubscribe()},[])

 const login=async e=>{
  e.preventDefault();setError('')
  const identifier=String(e.currentTarget.identifier.value||'').trim(),password=e.currentTarget.password.value
  if(!identifier){setError('ስልክ ቁጥር ወይም ኢሜይል ያስገቡ');return}
  try{
   const credentials=identifier.includes('@')?{email:identifier,password}:{phone:normalizePhone(identifier),password}
   const {data,error}=await supabase.auth.signInWithPassword(credentials)
   if(error)throw error
   setUser(await loadProfile(data.user.id))
  }catch(e){setError(errorText(e))}
 }
 const logout=async()=>{await supabase.auth.signOut();setUser(null);setPage('dashboard')}

 if(loading)return <div className="min-h-screen grid place-items-center bg-zinc-950 text-white">በመጫን ላይ…</div>
 if(!user)return <div className="min-h-screen grid place-items-center bg-zinc-950 p-4"><form onSubmit={login} className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-7 text-white shadow-2xl">
  <div className="text-center mb-7"><div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-600 text-2xl font-black">D</div><h1 className="text-3xl font-black text-emerald-400">Dirsha-ድርሻ</h1><p className="mt-2 text-sm text-zinc-400">እንኳን ወደ Dirsha-ድርሻ መጡ</p></div>
  <label className="block text-sm mb-1">ስልክ ቁጥር ወይም ኢሜይል</label><input name="identifier" type="text" inputMode="email" autoComplete="username" placeholder="09XXXXXXXX ወይም admin@example.com" required className="input"/>
  <label className="block text-sm mb-1 mt-4">የይለፍ ቃል</label><input name="password" type="password" autoComplete="current-password" required className="input"/>
  {error&&<div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
  <button className="btn mt-5 w-full" type="submit">ግባ</button>
  <p className="mt-5 text-center text-xs text-zinc-500">Dirsha-ድርሻ</p>
 </form></div>

 const items=global?['dashboard','branches','users','teams','sales','commissions','reports','profile']:branchAdmin?['dashboard','users','teams','sales','commissions','reports','profile']:['dashboard','sales','commissions','reports','profile']
 return <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
  <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3"><div><div className="font-black text-emerald-600 dark:text-emerald-400">Dirsha-ድርሻ</div><div className="text-xs text-zinc-500">{roles[role]||role}</div></div><button onClick={logout} className="btn-secondary">ውጣ</button></div></header>
  <main className="mx-auto max-w-7xl p-4 md:p-6">
   <nav className="mb-6 flex gap-2 overflow-x-auto pb-1">{items.map(x=><button key={x} onClick={()=>setPage(x)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold ${page===x?'bg-emerald-600 text-white':'bg-white dark:bg-zinc-900'}`}>{nav[x]}</button>)}</nav>
   {page==='dashboard'&&<Dashboard user={user} global={global} branchAdmin={branchAdmin}/>}
   {page==='branches'&&global&&<OrganizationManagement/>}
   {page==='users'&&(global||branchAdmin)&&<UserManagement currentUser={user}/>} {page==='teams'&&(global||branchAdmin)&&<TeamManagement currentUser={user}/>}
   {page==='sales'&&<SalesPage user={user}/>} {page==='commissions'&&(global||branchAdmin)&&<SalesReviewPage user={user}/>} {['reports','profile'].includes(page)&&<Placeholder title={nav[page]}/>} 
  </main>
 </div>
}
function Dashboard({user,global,branchAdmin}){
 return <section className="space-y-5"><h2 className="text-2xl font-black">እንኳን ደህና መጡ፣ {user.full_name||'ተጠቃሚ'}!</h2><div className="grid gap-4 md:grid-cols-3"><Card title="ሚና" value={roles[user.role]||user.role}/><Card title="ድርጅት" value={user.organization_id||'—'}/><Card title="ቅርንጫፍ" value={user.branch_id||'—'}/></div><div className="rounded-2xl border bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"><b>{global?'Super Admin የስርዓቱን ድርጅቶች እና ቅርንጫፎች ይቆጣጠራል።':branchAdmin?'Branch Admin የራሱን ቅርንጫፍ ተጠቃሚዎች ያስተዳድራል።':'የሽያጭ እና የኮሚሽን ስራዎ በቅርቡ ይጨመራል።'}</b></div></section>
}
function Card({title,value}){return <div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><div className="text-xs text-zinc-500">{title}</div><div className="mt-2 break-all font-bold">{value}</div></div>}
function Placeholder({title}){return <section className="rounded-2xl border bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900"><div className="text-4xl">🚧</div><h2 className="mt-3 text-xl font-bold">{title}</h2><p className="mt-2 text-zinc-500">ይህ ክፍል በሚቀጥለው የልማት ደረጃ ይጨመራል።</p></section>}
