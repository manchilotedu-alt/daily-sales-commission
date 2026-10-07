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
 const [orgs,setOrgs]=useState([]),[selectedOrg,setSelectedOrg]=useState(user?.organization_id||''),[rows,setRows]=useState([]),[selected,setSelected]=useState(null),[variants,setVariants]=useState([]),[prices,setPrices]=useState([])
 const [error,setError]=useState(''),[form,setForm]=useState({code:'',am:'',en:'',rate:''}),[variant,setVariant]=useState({code:'',am:'',en:'',unit:''}),[price,setPrice]=useState({value:'',from:''}),[saving,setSaving]=useState(false)
 const targetOrg=user?.role==='branch_admin'?user?.organization_id:selectedOrg
 const loadOrgs=async()=>{if(!global)return;const {data,error}=await supabase.from('organizations').select('id,name,code,active').eq('active',true).order('name');if(error)setError(error.message);else setOrgs(data||[])}
 const load=async()=>{setError('');if(!targetOrg){setRows([]);return}const {data,error}=await supabase.from('products').select('id,code,en,am,rate,active,organization_id').eq('organization_id',targetOrg).order('id');if(error)setError(error.message||'ምርቶችን ማምጣት አልተቻለም።');else setRows(data||[])}
 const openProduct=async p=>{setSelected(p);setError('');const [v,pr]=await Promise.all([supabase.from('product_variants').select('*').eq('product_id',p.id).order('id'),supabase.from('product_price_versions').select('*').eq('product_id',p.id).order('effective_from',{ascending:false})]);if(v.error||pr.error)setError(v.error?.message||pr.error?.message||'');else{setVariants(v.data||[]);setPrices(pr.data||[])}}
 useEffect(()=>{loadOrgs()},[]);useEffect(()=>{load()},[targetOrg])
 const add=async e=>{e.preventDefault();setError('');if(!targetOrg){setError('መጀመሪያ ድርጅት ይምረጡ።');return}if(!form.am.trim()&&!form.en.trim()){setError('የምርት ስም ያስገቡ።');return}const rate=Number(form.rate);if(!Number.isFinite(rate)||rate<0){setError('ትክክለኛ ዋጋ ያስገቡ።');return}setSaving(true);const {data,error}=await supabase.from('products').insert({code:form.code.trim()||null,am:form.am.trim()||null,en:form.en.trim()||null,rate,organization_id:targetOrg,active:true}).select().single();if(!error&&data)await supabase.from('product_price_versions').insert({product_id:data.id,price:rate,effective_from:new Date().toISOString(),version:1,active:true});setSaving(false);if(error)setError(error.message||'ምርቱን ማስገባት አልተቻለም።');else{setForm({code:'',am:'',en:'',rate:''});load()}}
 const addVariant=async e=>{e.preventDefault();if(!selected)return;const {error}=await supabase.from('product_variants').insert({product_id:selected.id,code:variant.code.trim()||null,name_am:variant.am.trim()||null,name_en:variant.en.trim()||null,unit:variant.unit.trim()||null,active:true});if(error)setError(error.message);else{setVariant({code:'',am:'',en:'',unit:''});openProduct(selected)}}
 const addPrice=async e=>{e.preventDefault();if(!selected)return;const value=Number(price.value);if(!Number.isFinite(value)||value<0||!price.from){setError('ትክክለኛ ዋጋ እና የሚጀምርበት ቀን ያስገቡ።');return}const last=prices[0];const {error}=await supabase.from('product_price_versions').insert({product_id:selected.id,variant_id:null,price:value,effective_from:new Date(price.from).toISOString(),version:(last?.version||0)+1,active:true});if(error)setError(error.message);else{setPrice({value:'',from:''});openProduct(selected)}}
 const toggle=async r=>{const {error}=await supabase.from('products').update({active:!r.active,updated_at:new Date().toISOString()}).eq('id',r.id).eq('organization_id',targetOrg);if(error)setError(error.message);else load()}
 return <section className="space-y-5"><div><h2 className="text-2xl font-black">ምርቶች</h2><p className="text-sm text-zinc-500">Product በድርጅት ይለያል፤ Variant/መጠን እና የዋጋ ታሪክም በተለየ ይተዳደራሉ።</p></div>
 {global&&<div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><label className="mb-2 block text-sm font-semibold">ድርጅት ምረጥ</label><select className="input" value={selectedOrg} onChange={e=>{setSelectedOrg(e.target.value);setSelected(null)}}><option value="">-- ድርጅት ምረጥ --</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}{o.code?' ('+o.code+')':''}</option>)}</select></div>}
 {error&&<div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600">{error}</div>}
 {targetOrg&&<form onSubmit={add} className="grid gap-3 rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-5"><input className="input" placeholder="የምርት ኮድ" value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/><input className="input" placeholder="ስም (አማርኛ)" value={form.am} onChange={e=>setForm({...form,am:e.target.value})}/><input className="input" placeholder="Product name" value={form.en} onChange={e=>setForm({...form,en:e.target.value})}/><input className="input" type="number" min="0" step="0.01" required placeholder="መነሻ ዋጋ" value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})}/><button className="btn" disabled={saving}>{saving?'በመጨመር ላይ...':'ምርት ጨምር'}</button></form>}
 <div className="overflow-x-auto rounded-2xl border bg-white dark:border-zinc-800 dark:bg-zinc-900"><table className="w-full text-sm"><thead><tr className="border-b dark:border-zinc-800"><th className="p-3 text-left">ኮድ</th><th className="p-3 text-left">ምርት</th><th className="p-3 text-right">ዋጋ</th><th className="p-3 text-center">ሁኔታ</th><th className="p-3 text-center">ተግባር</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-b dark:border-zinc-800"><td className="p-3">{r.code||'—'}</td><td className="p-3"><button className="font-semibold underline" onClick={()=>openProduct(r)}>{r.am||r.en||'—'}</button></td><td className="p-3 text-right">{Number(r.rate||0).toLocaleString()} ብር</td><td className="p-3 text-center">{r.active?'ንቁ':'የተዘጋ'}</td><td className="p-3 text-center"><button className="btn-secondary" onClick={()=>toggle(r)}>{r.active?'አቦዝን':'አንቃ'}</button></td></tr>)}{!rows.length&&<tr><td colSpan="5" className="p-8 text-center text-zinc-500">ምርት የለም።</td></tr>}</tbody></table></div>
 {selected&&<div className="grid gap-5 md:grid-cols-2"><div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><h3 className="mb-3 font-bold">{selected.am||selected.en} — መጠኖች / Variants</h3><form onSubmit={addVariant} className="grid gap-2"><input className="input" placeholder="ኮድ" value={variant.code} onChange={e=>setVariant({...variant,code:e.target.value})}/><input className="input" placeholder="መጠን (አማርኛ) — 10g" value={variant.am} onChange={e=>setVariant({...variant,am:e.target.value})}/><input className="input" placeholder="Variant — 10g" value={variant.en} onChange={e=>setVariant({...variant,en:e.target.value})}/><input className="input" placeholder="Unit — g/ml/pcs" value={variant.unit} onChange={e=>setVariant({...variant,unit:e.target.value})}/><button className="btn">መጠን ጨምር</button></form><div className="mt-4 space-y-2">{variants.map(v=><div key={v.id} className="rounded-xl border p-3"><b>{v.name_am||v.name_en}</b><span className="ml-2 text-xs text-zinc-500">{v.unit||''} {v.code?'· '+v.code:''}</span></div>)}{!variants.length&&<p className="text-sm text-zinc-500">እስካሁን መጠን የለም።</p>}</div></div>
 <div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><h3 className="mb-3 font-bold">የዋጋ ታሪክ</h3><form onSubmit={addPrice} className="grid gap-2"><input className="input" type="number" min="0" step="0.01" placeholder="አዲስ ዋጋ" value={price.value} onChange={e=>setPrice({...price,value:e.target.value})}/><input className="input" type="datetime-local" value={price.from} onChange={e=>setPrice({...price,from:e.target.value})}/><button className="btn">አዲስ ዋጋ መዝግብ</button></form><div className="mt-4 space-y-2">{prices.map(p=><div key={p.id} className="rounded-xl border p-3"><b>{Number(p.price).toLocaleString()} ብር</b><span className="ml-2 text-xs text-zinc-500">Version {p.version} · {new Date(p.effective_from).toLocaleString()}</span></div>)}</div></div></div>}
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
 return <section className="space-y-5"><h2 className="text-2xl font-black">እንኳን ደህና መጡ፣ {user.full_name||'ተጠቃሚ'}!</h2><div className="grid gap-4 md:grid-cols-3"><Card title="ሚና" value={roles[user.role]||user.role}/><Card title="ድርጅት" value={user.organization_id||'—'}/><Card title="ቅርንጫፍ" value={user.branch_id||'—'}/></div><div className="rounded-2xl border bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"><b>{global?'Super Admin የስርዓቱን ድርጅቶች እና ቅርንጫፎች ይቆጣጠራል።':branchAdmin?'Branch Admin የራሱን ቅርንጫፍ ተጠቃሚዎች ያስተዳድራል።':'የሽያጭ እና የኮሚሽን ስራዎ በቅርቡ ይጨመራል።'}</b></div></section>
}
function Card({title,value}){return <div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><div className="text-xs text-zinc-500">{title}</div><div className="mt-2 break-all font-bold">{value}</div></div>}
function Placeholder({title}){return <section className="rounded-2xl border bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900"><div className="text-4xl">🚧</div><h2 className="mt-3 text-xl font-bold">{title}</h2><p className="mt-2 text-zinc-500">ይህ ክፍል በሚቀጥለው የልማት ደረጃ ይጨመራል።</p></section>}
