import React,{useEffect,useState} from 'react'
import {supabase} from './lib/supabase'
import {OrganizationManagement,UserManagement} from './Management'
import {SalesPage} from './Sales'
import {SalesReviewPage} from './SalesReview'
import {TeamManagement} from './TeamManagement'
import {WorkforceManagement} from './WorkforceManagement'
import {ReportsPage} from './Reports'
import {EarningsPage} from './Earnings'

const roles={
 super_admin:'ዋና አስተዳዳሪ',admin:'ዋና አስተዳዳሪ',branch_admin:'የቅርንጫፍ አስተዳዳሪ',
 lead:'መሪ ሻጭ',lead_sales:'መሪ ሻጭ',assistant:'ረዳት',driver:'ሾፌር'
}
const nav={dashboard:'ዳሽቦርድ',products:'ምርቶች',earnings:'ገቢ እና ክፍያ',branches:'ድርጅቶች እና ቅርንጫፎች',users:'ተጠቃሚዎች',teams:'ቡድን እና Split',workforce:'ሰራተኛ እና Attendance',sales:'ሽያጭ',commissions:'ኮሚሽን',reports:'ሪፖርቶች',profile:'መገለጫ'}
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

function ProductsPage({user}){
 const global=['super_admin','admin'].includes(user?.role)
 const branchAdmin=user?.role==='branch_admin'
 const [orgs,setOrgs]=useState([]),[branches,setBranches]=useState([]),[selectedOrg,setSelectedOrg]=useState(user?.organization_id||''),[rows,setRows]=useState([]),[assigned,setAssigned]=useState([]),[selected,setSelected]=useState(null),[variants,setVariants]=useState([]),[prices,setPrices]=useState([])
 const [error,setError]=useState(''),[form,setForm]=useState({code:'',am:'',en:'',rate:''}),[variant,setVariant]=useState({code:'',am:'',en:'',unit:''}),[price,setPrice]=useState({value:'',from:''}),[saving,setSaving]=useState(false)
 const targetOrg=global?selectedOrg:user?.organization_id
 const ownBranch=user?.branch_id||''
 const loadOrgs=async()=>{if(!global)return;const {data,error}=await supabase.from('organizations').select('id,name,code,active').eq('active',true).order('name');if(error)setError(error.message);else setOrgs(data||[])}
 const loadBranches=async()=>{if(!targetOrg){setBranches([]);return}let q=supabase.from('branches').select('id,name,code,active,organization_id').eq('organization_id',targetOrg).eq('active',true).order('name');if(branchAdmin&&ownBranch)q=q.eq('id',ownBranch);const {data,error}=await q;if(error)setError(error.message);else setBranches(data||[])}
 const load=async()=>{setError('');if(!targetOrg){setRows([]);return}const {data,error}=await supabase.from('products').select('id,code,en,am,rate,active,organization_id').eq('organization_id',targetOrg).order('id');if(error)setError(error.message||'ምርቶችን ማምጣት አልተቻለም።');else setRows(data||[])}
 const loadAssignments=async productId=>{if(!productId){setAssigned([]);return}let q=supabase.from('product_branch_assignments').select('id,product_id,branch_id,organization_id,active,assigned_at,branches(id,name,code)').eq('product_id',productId).eq('active',true);const {data,error}=await q;if(error)setError(error.message);else setAssigned(data||[])}
 const openProduct=async p=>{setSelected(p);setError('');const [v,pr]=await Promise.all([supabase.from('product_variants').select('*').eq('product_id',p.id).order('id'),supabase.from('product_price_versions').select('*').eq('product_id',p.id).order('effective_from',{ascending:false}),loadAssignments(p.id)]);if(v.error||pr.error)setError(v.error?.message||pr.error?.message||'');else{setVariants(v.data||[]);setPrices(pr.data||[])}}
 useEffect(()=>{loadOrgs()},[])
 useEffect(()=>{loadBranches();load()},[targetOrg,ownBranch])
 const add=async e=>{e.preventDefault();if(!global)return;setError('');if(!targetOrg){setError('መጀመሪያ ድርጅት ይምረጡ።');return}if(!form.am.trim()&&!form.en.trim()){setError('የምርት ስም ያስገቡ።');return}const rate=Number(form.rate);if(!Number.isFinite(rate)||rate<0){setError('ትክክለኛ ዋጋ ያስገቡ።');return}setSaving(true);const {data,error}=await supabase.from('products').insert({code:form.code.trim()||null,am:form.am.trim()||null,en:form.en.trim()||null,rate,organization_id:targetOrg,active:true}).select().single();if(!error&&data){const p={product_id:data.id,price:rate,effective_from:new Date().toISOString(),version:1,active:true};const pr=await supabase.from('product_price_versions').insert(p);if(pr.error)setError(pr.error.message)}setSaving(false);if(error)setError(error.message||'ምርቱን ማስገባት አልተቻለም።');else{setForm({code:'',am:'',en:'',rate:''});load()}}
 const addVariant=async e=>{e.preventDefault();if(!global||!selected)return;const {error}=await supabase.from('product_variants').insert({product_id:selected.id,code:variant.code.trim()||null,name_am:variant.am.trim()||null,name_en:variant.en.trim()||null,unit:variant.unit.trim()||null,active:true});if(error)setError(error.message);else{setVariant({code:'',am:'',en:'',unit:''});openProduct(selected)}}
 const addPrice=async e=>{e.preventDefault();if(!global||!selected)return;const value=Number(price.value);if(!Number.isFinite(value)||value<0||!price.from){setError('ትክክለኛ ዋጋ እና የሚጀምርበት ቀን ያስገቡ።');return}const last=prices[0];const {error}=await supabase.from('product_price_versions').insert({product_id:selected.id,variant_id:null,price:value,effective_from:new Date(price.from).toISOString(),version:(last?.version||0)+1,active:true});if(error)setError(error.message);else{setPrice({value:'',from:''});openProduct(selected)}}
 const assign=async()=>{if(!branchAdmin||!selected)return;const existing=assigned.find(a=>a.branch_id===ownBranch);if(existing){setError('ይህ ምርት በእርስዎ ቅርንጫፍ ውስጥ አስቀድሞ ተመድቧል።');return}const {error}=await supabase.from('product_branch_assignments').insert({product_id:selected.id,organization_id:targetOrg,branch_id:ownBranch,active:true,assigned_by:user.id});if(error)setError(error.message);else{await openProduct(selected)}}
 const toggle=async r=>{if(!global)return;const {error}=await supabase.from('products').update({active:!r.active,updated_at:new Date().toISOString()}).eq('id',r.id).eq('organization_id',targetOrg);if(error)setError(error.message);else load()}
 return <section className="space-y-5"><div><h2 className="text-2xl font-black">ምርቶች</h2><p className="text-sm text-zinc-500">{global?'Super Admin ምርት፣ Variant፣ ዋጋ እና የምርት መረጃን ይቆጣጠራል።':'ከSuper Admin የተፈቀዱ ምርቶችን ወደ ራስዎ ቅርንጫፍ ያስገቡ።'}</p></div>
 {global&&<div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><label className="mb-2 block text-sm font-semibold">ድርጅት ምረጥ</label><select className="input" value={selectedOrg} onChange={e=>{setSelectedOrg(e.target.value);setSelected(null)}}><option value="">-- ድርጅት ምረጥ --</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}{o.code?' ('+o.code+')':''}</option>)}</select></div>}
 {branchAdmin&&<div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><div className="text-sm text-zinc-500">የእርስዎ ቅርንጫፍ</div><div className="mt-1 font-bold">{branches[0]?.name||'ቅርንጫፍ አልተመደበም'}</div></div>}
 {error&&<div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600">{error}</div>}
 {global&&targetOrg&&<form onSubmit={add} className="grid gap-3 rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-5"><input className="input" placeholder="የምርት ኮድ" value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/><input className="input" placeholder="ስም (አማርኛ)" value={form.am} onChange={e=>setForm({...form,am:e.target.value})}/><input className="input" placeholder="Product name" value={form.en} onChange={e=>setForm({...form,en:e.target.value})}/><input className="input" type="number" min="0" step="0.01" required placeholder="መነሻ ዋጋ" value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})}/><button className="btn" disabled={saving}>{saving?'በመጨመር ላይ...':'ምርት ጨምር'}</button></form>}
 <div className="overflow-x-auto rounded-2xl border bg-white dark:border-zinc-800 dark:bg-zinc-900"><table className="w-full text-sm"><thead><tr className="border-b dark:border-zinc-800"><th className="p-3 text-left">ኮድ</th><th className="p-3 text-left">ምርት</th><th className="p-3 text-right">ዋጋ</th><th className="p-3 text-center">ሁኔታ</th><th className="p-3 text-center">ተግባር</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-b dark:border-zinc-800"><td className="p-3">{r.code||'—'}</td><td className="p-3"><button className="font-semibold underline" onClick={()=>openProduct(r)}>{r.am||r.en||'—'}</button></td><td className="p-3 text-right">{Number(r.rate||0).toLocaleString()} ብር</td><td className="p-3 text-center">{r.active?'ንቁ':'የተዘጋ'}</td><td className="p-3 text-center">{global?<button className="btn-secondary" onClick={()=>toggle(r)}>{r.active?'አቦዝን':'አንቃ'}</button>:<button className="btn" onClick={()=>openProduct(r)}>ይመልከቱ / ያስገቡ</button>}</td></tr>)}{!rows.length&&<tr><td colSpan="5" className="p-8 text-center text-zinc-500">ምርት የለም።</td></tr>}</tbody></table></div>
 {selected&&<div className="grid gap-5 md:grid-cols-2"><div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><h3 className="mb-3 font-bold">{selected.am||selected.en} — መጠኖች / Variants</h3>{global?<form onSubmit={addVariant} className="grid gap-2"><input className="input" placeholder="ኮድ" value={variant.code} onChange={e=>setVariant({...variant,code:e.target.value})}/><input className="input" placeholder="መጠን (አማርኛ) — 10g" value={variant.am} onChange={e=>setVariant({...variant,am:e.target.value})}/><input className="input" placeholder="Variant — 10g" value={variant.en} onChange={e=>setVariant({...variant,en:e.target.value})}/><input className="input" placeholder="Unit — g/ml/pcs" value={variant.unit} onChange={e=>setVariant({...variant,unit:e.target.value})}/><button className="btn">መጠን ጨምር</button></form>:<div className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-800">Variant እና መጠን መጨመር የሚችለው Super Admin ብቻ ነው።</div>}<div className="mt-4 space-y-2">{variants.map(v=><div key={v.id} className="rounded-xl border p-3"><b>{v.name_am||v.name_en}</b><span className="ml-2 text-xs text-zinc-500">{v.unit||''} {v.code?'· '+v.code:''}</span></div>)}{!variants.length&&<p className="text-sm text-zinc-500">እስካሁን መጠን የለም።</p>}</div></div>
 <div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><h3 className="mb-3 font-bold">ዋጋ እና የBranch ምደባ</h3>{global?<form onSubmit={addPrice} className="grid gap-2"><input className="input" type="number" min="0" step="0.01" placeholder="አዲስ ዋጋ" value={price.value} onChange={e=>setPrice({...price,value:e.target.value})}/><input className="input" type="datetime-local" value={price.from} onChange={e=>setPrice({...price,from:e.target.value})}/><button className="btn">አዲስ ዋጋ መዝግብ</button></form>:<button className="btn w-full" onClick={assign}>{ownBranch?'ወደ ራሴ ቅርንጫፍ አስገባ':'ወደ ድርጅቴ አስገባ'}</button>}<div className="mt-4 space-y-2">{global&&prices.map(p=><div key={p.id} className="rounded-xl border p-3"><b>{Number(p.price).toLocaleString()} ብር</b><span className="ml-2 text-xs text-zinc-500">Version {p.version} · {new Date(p.effective_from).toLocaleString()}</span></div>)}{branchAdmin&&assigned.map(a=><div key={a.id} className="rounded-xl border p-3"><b>{a.branches?.name||'ቅርንጫፍ'}</b><span className="ml-2 text-xs text-zinc-500">ተመድቧል</span></div>)}{global&&<p className="mt-4 text-xs text-zinc-500">Commission እና ዋና የዋጋ ውሳኔ የSuper Admin ስልጣን ነው።</p>}</div></div></div>}
 </section>
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

 const items=global?['dashboard','branches','users','teams','products','sales','commissions','earnings','reports','profile']:branchAdmin?['dashboard','users','teams','products','sales','commissions','earnings','reports','profile']:['dashboard','sales','commissions','earnings','reports','profile']
 return <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
  <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3"><div><div className="font-black text-emerald-600 dark:text-emerald-400">Dirsha-ድርሻ</div><div className="text-xs text-zinc-500">{roles[role]||role}</div></div><button onClick={logout} className="btn-secondary">ውጣ</button></div></header>
  <main className="mx-auto max-w-7xl p-4 md:p-6">
   <nav className="mb-6 flex gap-2 overflow-x-auto pb-1">{items.map(x=><button key={x} onClick={()=>setPage(x)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold ${page===x?'bg-emerald-600 text-white':'bg-white dark:bg-zinc-900'}`}>{nav[x]}</button>)}</nav>
   {page==='dashboard'&&<Dashboard user={user} global={global} branchAdmin={branchAdmin}/>}{page==='products'&&(global||branchAdmin)&&<ProductsPage user={user}/>}
   {page==='branches'&&global&&<OrganizationManagement/>}
   {page==='users'&&(global||branchAdmin)&&<UserManagement currentUser={user}/>} {page==='teams'&&(global||branchAdmin)&&<TeamManagement currentUser={user}/>}
   {page==='sales'&&<SalesPage user={user}/>} {page==='commissions'&&(global||branchAdmin)&&<SalesReviewPage user={user}/>} {page==='reports'&&<ReportsPage user={user}/>} {page==='earnings'&&(global||branchAdmin||role==='lead'||role==='lead_sales'||role==='assistant'||role==='driver')&&<EarningsPage user={user}/>}  {page==='profile'&&<Placeholder title={nav[page]}/>}  
  </main>
 </div>
}
function Dashboard({user,global,branchAdmin}){ 
 const [stats,setStats]=useState({employees:0,teams:0,products:0,sales:0,commission:0})
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 useEffect(()=>{let live=true;(async()=>{try{
   const org=user?.organization_id,branch=user?.branch_id
   if(!org){if(live)setLoading(false);return}
   const scope=q=>{let x=q.eq('organization_id',org);if(branchAdmin&&branch)x=x.eq('branch_id',branch);return x}
   const [employees,teams,products,sales]=await Promise.all([
     supabase.from('profiles').select('id',{count:'exact',head:true}).eq('organization_id',org).eq('active',true),
     supabase.from('teams').select('id',{count:'exact',head:true}).eq('organization_id',org).eq('active',true),
     supabase.from('products').select('id',{count:'exact',head:true}).eq('organization_id',org).eq('active',true),
     scope(supabase.from('sales').select('id,total_sales_value,gross_commission')).limit(500)
   ])
   if(!live)return
   const firstError=employees.error||teams.error||products.error||sales.error
   if(firstError){setError(firstError.message);setLoading(false);return}
   const saleRows=sales.data||[]
   setStats({employees:employees.count||0,teams:teams.count||0,products:products.count||0,sales:saleRows.reduce((n,r)=>n+Number(r.total_sales_value||0),0),commission:saleRows.reduce((n,r)=>n+Number(r.gross_commission||0),0)})
   setLoading(false)
 }catch(e){if(live){setError(e.message||'Dashboard መረጃ ማምጣት አልተቻለም።');setLoading(false)}}})()
 return()=>{live=false}
 },[user?.organization_id,user?.branch_id,branchAdmin])
 const statCards=[
  ['ሰራተኞች',stats.employees,'👥','active'],
  ['ቡድኖች',stats.teams,'🚚','active'],
  ['ንቁ ምርቶች',stats.products,'📦','active'],
  ['ጠቅላላ ሽያጭ',stats.sales.toLocaleString()+' ብር','📈','money'],
  ['ጠቅላላ Commission',stats.commission.toLocaleString()+' ብር','💰','money']
 ]
 return <section className="space-y-6">
  <div className="relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-500 p-6 text-white shadow-xl md:p-8">
   <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"/>
   <div className="absolute -bottom-20 right-20 h-56 w-56 rounded-full bg-lime-300/10 blur-3xl"/>
   <div className="relative">
    <div className="text-sm font-semibold text-emerald-100">Dirsha-ድርሻ · የአስተዳደር ማዕከል</div>
    <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">እንኳን ደህና መጡ፣ {user.full_name||'ተጠቃሚ'}!</h2>
    <p className="mt-2 max-w-2xl text-sm text-emerald-50 md:text-base">{global?'የድርጅቶች፣ ሰራተኞች፣ ሽያጭ እና ኮሚሽን አጠቃላይ እይታ።':branchAdmin?'የቅርንጫፍዎን ዕለታዊ እንቅስቃሴ ከአንድ ቦታ ይከታተሉ።':'የሽያጭ እና የገቢ እንቅስቃሴዎን በቀላሉ ይከታተሉ።'}</p>
    <div className="mt-5 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">{roles[user.role]||user.role}</span><span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">{user.branch_id?'ቅርንጫፍ ያለው አካባቢ':'ድርጅት ደረጃ'}</span></div>
   </div>
  </div>
  {error&&<div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
   {statCards.map(([label,value,icon,type])=><div key={label} className="group rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
    <div className="flex items-center justify-between"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-xl dark:bg-emerald-950/50">{icon}</div><span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{type==='money'?'ETB':'LIVE'}</span></div>
    <div className="mt-4 text-xs font-semibold text-zinc-500">{label}</div><div className="mt-1 text-2xl font-black tracking-tight">{loading?'—':value}</div>
   </div>)}
  </div>
  <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
   <div className="rounded-3xl border bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
    <div className="flex items-center justify-between"><div><h3 className="text-lg font-black">የስራ እንቅስቃሴ</h3><p className="mt-1 text-xs text-zinc-500">Dirsha-ድርሻ የዛሬ አጠቃላይ እይታ</p></div><div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">Overview</div></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800/60"><div className="text-xs text-zinc-500">የሽያጭ ዋጋ</div><div className="mt-2 text-xl font-black">{loading?'—':stats.sales.toLocaleString()+' ብር'}</div></div>
      <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800/60"><div className="text-xs text-zinc-500">Commission</div><div className="mt-2 text-xl font-black">{loading?'—':stats.commission.toLocaleString()+' ብር'}</div></div>
      <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800/60"><div className="text-xs text-zinc-500">የአሁኑ ሁኔታ</div><div className="mt-2 text-xl font-black text-emerald-600">ንቁ</div></div>
    </div>
    <div className="mt-5 rounded-2xl border border-dashed p-5 text-sm text-zinc-500">የዕለት፣ የሳምንት እና የወር ግራፎች ከPerformance ሞጁል ጋር በሚቀጥለው ደረጃ ይገናኛሉ።</div>
   </div>
   <div className="rounded-3xl border bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
    <h3 className="text-lg font-black">ፈጣን መዳረሻ</h3><p className="mt-1 text-xs text-zinc-500">በብዛት የሚጠቀሙትን ክፍል በቀጥታ ይክፈቱ።</p>
    <div className="mt-5 space-y-3">
      {([['products','📦','ምርቶች'],['sales','🛒','ሽያጭ'],['teams','👥','ቡድኖች'],['earnings','💰','ገቢ እና ክፍያ']]).filter(([p])=>global||branchAdmin||p==='sales'||p==='earnings').map(([p,i,l])=><button key={p} onClick={()=>window.dispatchEvent(new CustomEvent('dirsha:navigate',{detail:p}))} className="flex w-full items-center justify-between rounded-2xl border p-4 text-left transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-zinc-800 dark:hover:bg-emerald-950/30"><span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 dark:bg-zinc-800">{i}</span><span className="font-bold">{l}</span></span><span className="text-zinc-400">→</span></button>)}
    </div>
   </div>
  </div>
 </section>
}
function Card({title,value}){return <div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><div className="text-xs text-zinc-500">{title}</div><div className="mt-2 break-all font-bold">{value}</div></div>}
function Placeholder({title}){return <section className="rounded-2xl border bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900"><div className="text-4xl">🚧</div><h2 className="mt-3 text-xl font-bold">{title}</h2><p className="mt-2 text-zinc-500">ይህ ክፍል በሚቀጥለው የልማት ደረጃ ይጨመራል።</p></section>}
