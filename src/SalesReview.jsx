import React,{useEffect,useState} from 'react'
import {supabase} from './lib/supabase'

const roles={lead:'መሪ ሻጭ',lead_sales:'መሪ ሻጭ',assistant:'ረዳት',driver:'ሾፌር'}
const money=n=>Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})
const statusLabel=s=>s==='pending'?'በመጠባበቅ ላይ':s==='approved'?'ተፈቅዷል':s==='rejected'?'ተመልሷል':s||'—'

export function SalesReviewPage({user}){
 const [sales,setSales]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(null),[open,setOpen]=useState(null)

 const load=async()=>{
  setLoading(true);setError('')
  try{
   let q=supabase.from('sales').select('id,sale_date,total,total_quantity,total_sales_value,system_sales_reference,system_sales_total,gross_commission,lead_amt,assistant_amt,driver_amt,status,reject_reason,created_at,verified_at,lead_id,assistant_id,driver_id,submitted_by,verified_by,organization_id,branch_id,team_id,team_structure_version_id,team_split_version_id,sales_source_policy_version_id').order('created_at',{ascending:false})
   if(user.role==='branch_admin') q=q.eq('organization_id',user.organization_id).eq('branch_id',user.branch_id)
   const {data,error}=await q
   if(error)throw error
   const rows=data||[]
   const ids=[...new Set(rows.flatMap(x=>[x.lead_id,x.assistant_id,x.driver_id,x.submitted_by,x.verified_by]).filter(Boolean))]
   let people=[]
   if(ids.length){
    const r=await supabase.from('profiles').select('id,full_name,phone,role').in('id',ids)
    if(r.error)throw r.error
    people=r.data||[]
   }
   const byId=new Map(people.map(x=>[x.id,x]))
   setSales(rows.map(x=>({...x,lead:byId.get(x.lead_id),assistant:byId.get(x.assistant_id),driver:byId.get(x.driver_id),submitted:byId.get(x.submitted_by),verified:byId.get(x.verified_by)})))
  }catch(e){setError(e.message||'ሽያጮችን ማምጣት አልተቻለም')}
  finally{setLoading(false)}
 }

 useEffect(()=>{load()},[user.organization_id,user.branch_id,user.role])

 const review=async(saleId,action)=>{
  let reason=''
  if(action==='reject'){
   reason=window.prompt('የመመለሻ ምክንያት ያስገቡ፦','')||''
   if(!reason.trim())return
  }
  setBusy(saleId);setError('')
  try{
   const {data,error}=await supabase.functions.invoke('review-sale',{body:{sale_id:saleId,action,reason}})
   if(error)throw error
   if(data?.error)throw new Error(data.error)
   setOpen(null);await load()
  }catch(e){setError(e.message||'የሽያጭ ማረጋገጫ አልተሳካም')}
  finally{setBusy(null)}
 }

 return <section className="space-y-5">
  <div className="flex flex-wrap items-end justify-between gap-3">
   <div><h2 className="text-2xl font-black">የሽያጭ ማረጋገጫ</h2><p className="text-sm text-zinc-500">የገቡ ሽያጮችን ዝርዝር ይመልከቱ፣ ያረጋግጡ ወይም ይመልሱ።</p></div>
   <button className="btn-secondary" onClick={load} disabled={loading}>አድስ</button>
  </div>
  {error&&<div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
  <div className="overflow-x-auto rounded-2xl border bg-white dark:border-zinc-800 dark:bg-zinc-900">
   <table className="w-full text-sm">
    <thead><tr className="border-b dark:border-zinc-800">
     <th className="p-3 text-left">ቀን</th><th className="p-3 text-left">ያስገባው</th><th className="p-3 text-left">ቡድን</th><th className="p-3 text-right">የደረሰኝ ሽያጭ</th><th className="p-3 text-right">የሲስተም ሽያጭ</th><th className="p-3 text-right">ኮሚሽን</th><th className="p-3">ሁኔታ</th><th className="p-3">ተግባር</th>
    </tr></thead>
    <tbody>
     {sales.map(s=><React.Fragment key={s.id}>
      <tr className="border-b dark:border-zinc-800">
       <td className="p-3">{s.sale_date}</td>
       <td className="p-3">{s.submitted?.full_name||'—'}</td>
       <td className="p-3">{[s.lead,s.assistant,s.driver].filter(Boolean).map(p=>`${p.full_name} (${roles[p.role]||p.role})`).join('፣ ')||'—'}</td>
       <td className="p-3 text-right font-bold">{money(s.total_sales_value??s.total)} ብር</td>
       <td className="p-3 text-right"><div className="font-bold">{money(s.system_sales_total)} ብር</div><div className="max-w-36 truncate text-xs text-zinc-500" title={s.system_sales_reference||""}>{s.system_sales_reference||"የሲስተም ማጣቀሻ የለም"}</div></td>
       <td className="p-3 text-right font-bold">{money(s.gross_commission)} ብር</td>
       <td className="p-3 text-center"><span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">{statusLabel(s.status)}</span></td>
       <td className="p-3 text-center">
        <div className="flex justify-center gap-2">
         <button className="btn-secondary" onClick={()=>setOpen(open===s.id?null:s.id)}>{open===s.id?'ዝጋ':'ዝርዝር'}</button>
         {s.status==='pending'&&<><button className="btn" disabled={busy===s.id} onClick={()=>review(s.id,'verify')}>አረጋግጥ</button><button className="btn-secondary" disabled={busy===s.id} onClick={()=>review(s.id,'reject')}>መልስ</button></>}
        </div>
       </td>
      </tr>
      {open===s.id&&<tr className="border-b bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"><td colSpan="8" className="p-4">
       <SaleDetails sale={s}/>
      </td></tr>}
     </React.Fragment>)}
     {!loading&&!sales.length&&<tr><td colSpan="8" className="p-10 text-center text-zinc-500">ምንም የሽያጭ መዝገብ የለም።</td></tr>}
     {loading&&<tr><td colSpan="8" className="p-10 text-center text-zinc-500">በመጫን ላይ…</td></tr>}
    </tbody>
   </table>
  </div>
 </section>
}

function SaleDetails({sale}){
 const [items,setItems]=useState([]),[alloc,setAlloc]=useState([]),[teamVersion,setTeamVersion]=useState(null),[loading,setLoading]=useState(true)
 useEffect(()=>{
  let live=true
  ;(async()=>{
   setLoading(true)
   const [ir,ar,tr]=await Promise.all([
    supabase.from('sale_items').select('id,product_id,product_variant_id,qty,rate,line_amt,unit_price_snapshot,sales_value,system_sales_value,commission_sales_source,commission_amount').eq('sale_id',sale.id),
    supabase.from('sale_commission_allocations').select('id,employee_id,role_code,split_percentage,allocated_commission,team_assignment_id,team_split_version_id,employee_position').eq('sale_id',sale.id),
    sale.team_split_version_id
     ?supabase.from('team_split_versions').select('id,version,status,effective_from,effective_to,approved_at,returned_reason').eq('id',sale.team_split_version_id).maybeSingle()
     :Promise.resolve({data:null,error:null})
   ])
   const itemRows=ir.data||[]
   const allocationRows=ar.data||[]
   const employeeIds=[...new Set(allocationRows.map(x=>x.employee_id).filter(Boolean))]
   const employeeResult=employeeIds.length
    ?await supabase.from('profiles').select('id,full_name').in('id',employeeIds)
    :{data:[],error:null}
   const employeeMap=new Map((employeeResult.data||[]).map(x=>[x.id,x]))
   const productIds=[...new Set(itemRows.map(x=>x.product_id).filter(Boolean))]
   const variantIds=[...new Set(itemRows.map(x=>x.product_variant_id).filter(Boolean))]
   const [pr,vr]=await Promise.all([
    productIds.length?supabase.from('products').select('id,am,en').eq('organization_id',sale.organization_id).in('id',productIds):Promise.resolve({data:[],error:null}),
    variantIds.length?supabase.from('product_variants').select('id,name_am,name_en,unit').eq('organization_id',sale.organization_id).in('id',variantIds):Promise.resolve({data:[],error:null})
   ])
   const productMap=new Map((pr.data||[]).map(x=>[Number(x.id),x]))
   const variantMap=new Map((vr.data||[]).map(x=>[Number(x.id),x]))
   const displayItems=itemRows.map(x=>({...x,productName:productMap.get(Number(x.product_id))?.am||productMap.get(Number(x.product_id))?.en||String(x.product_id),variant:variantMap.get(Number(x.product_variant_id))}))
   const displayAllocations=allocationRows.map(a=>({...a,employeeName:employeeMap.get(a.employee_id)?.full_name||''}))
   if(live){setItems(displayItems);setAlloc(displayAllocations);setTeamVersion(tr.data||null);setLoading(false)}
  })()
  return()=>{live=false}
 },[sale.id])
 return <div className="space-y-4">
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
   <Info label="ጠቅላላ ብዛት" value={sale.total_quantity||0}/>
   <Info label="ጠቅላላ የደረሰኝ ሽያጭ" value={money(sale.total_sales_value??sale.total)+' ብር'}/>
   <Info label="ጠቅላላ የሲስተም ሽያጭ" value={money(sale.system_sales_total)+' ብር'}/>
   <Info label="የሲስተም ማጣቀሻ" value={sale.system_sales_reference||'—'}/>
   <Info label="ጠቅላላ ኮሚሽን" value={money(sale.gross_commission)+' ብር'}/>
   <Info label="የቡድን ስፕሊት" value={teamVersion?(`v${teamVersion.version} · ${teamVersion.status==='approved'?'ተፈቅዷል':teamVersion.status==='active'?'በስራ ላይ':teamVersion.status==='pending_approval'?'ማጽደቅ በመጠባበቅ ላይ':teamVersion.status==='draft'?'ረቂቅ':teamVersion.status==='expired'?'ጊዜው አልፏል':teamVersion.status==='archived'?'ተቀምጧል':teamVersion.status}`):sale.team_split_version_id?'የስሪት መረጃ አልተገኘም':'አልተያያዘም'}/>
  </div>
  <div className="overflow-x-auto rounded-xl border dark:border-zinc-800">
   <table className="w-full text-sm"><thead><tr className="border-b dark:border-zinc-800"><th className="p-2 text-left">ምርት</th><th className="p-2 text-left">መጠን/ቅጽ</th><th className="p-2 text-right">ብዛት</th><th className="p-2 text-right">የአንዱ ዋጋ</th><th className="p-2 text-right">የደረሰኝ ሽያጭ</th><th className="p-2 text-right">የሲስተም ሽያጭ</th><th className="p-2 text-left">የኮሚሽን መነሻ</th><th className="p-2 text-right">ኮሚሽን</th></tr></thead>
    <tbody>{items.map(i=><tr key={i.id} className="border-b last:border-0 dark:border-zinc-800"><td className="p-2">{i.productName}</td><td className="p-2">{i.variant?(i.variant.name_am||i.variant.name_en||'—')+(i.variant.unit?' · '+i.variant.unit:''):'—'}</td><td className="p-2 text-right">{i.qty}</td><td className="p-2 text-right">{money(i.unit_price_snapshot??i.rate)}</td><td className="p-2 text-right">{money(i.sales_value??i.line_amt)}</td><td className="p-2 text-right">{money(i.system_sales_value)}</td><td className="p-2">{i.commission_sales_source==='system_sales'?'የውጭ ሲስተም ሽያጭ':'የደረሰኝ ሽያጭ'}</td><td className="p-2 text-right">{money(i.commission_amount)}</td></tr>)}</tbody>
   </table>
   {loading&&<div className="p-3 text-sm text-zinc-500">ዝርዝሩን በመጫን ላይ…</div>}
  </div>
  <div>
   <h4 className="mb-2 font-bold">የኮሚሽን ክፍፍል</h4>
   <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{alloc.map(a=><div key={a.id} className="rounded-xl border p-3 dark:border-zinc-800"><div className="font-bold">{a.employeeName||'ስም አልተገኘም'}</div><div className="text-xs text-zinc-500">{roles[a.role_code]||a.role_code}</div>{!a.employeeName&&a.employee_id&&<div className="mt-1 break-all text-xs text-zinc-400">ID: {a.employee_id}</div>}<div className="mt-2 font-bold">{money(a.allocated_commission)} ብር</div><div className="text-xs text-zinc-500">{a.split_percentage}% · ቦታ {a.employee_position||1}</div>{a.team_split_version_id&&<div className="mt-1 text-xs text-zinc-400">የክፍፍል ስሪት ተመዝግቧል</div>}</div>)}</div>
  </div>
  {sale.status==='rejected'&&<div className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-400"><b>የመመለሻ ምክንያት፦</b> {sale.reject_reason||'—'}</div>}
  {sale.verified&&<div className="text-xs text-zinc-500">ያረጋገጠው፦ {sale.verified.full_name||'—'} {sale.verified_at?'• '+new Date(sale.verified_at).toLocaleString():''}</div>}
 </div>
}

function Info({label,value}){return <div className="rounded-xl border p-3 dark:border-zinc-800"><div className="text-xs text-zinc-500">{label}</div><div className="mt-1 font-bold">{value}</div></div>}
