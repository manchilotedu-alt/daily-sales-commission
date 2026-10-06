import React,{useEffect,useState} from 'react'
import {supabase} from './lib/supabase'

const roles={lead:'መሪ ሻጭ',lead_sales:'መሪ ሻጭ',assistant:'ረዳት',driver:'ሾፌር'}

export function SalesReviewPage({user}){
  const [sales,setSales]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(null)

  const load=async()=>{
    setLoading(true);setError('')
    try{
      let q=supabase.from('sales').select('id,sale_date,total,lead_amt,assistant_amt,driver_amt,status,reject_reason,created_at,lead_id,assistant_id,driver_id,submitted_by,organization_id,branch_id').order('created_at',{ascending:false})
      if(user.role==='branch_admin') q=q.eq('organization_id',user.organization_id).eq('branch_id',user.branch_id)
      const {data,error}=await q
      if(error)throw error
      const rows=data||[]
      const ids=[...new Set(rows.flatMap(x=>[x.lead_id,x.assistant_id,x.driver_id,x.submitted_by]).filter(Boolean))]
      let people=[]
      if(ids.length){
        const r=await supabase.from('profiles').select('id,full_name,phone,role').in('id',ids)
        if(r.error)throw r.error
        people=r.data||[]
      }
      const byId=new Map(people.map(x=>[x.id,x]))
      setSales(rows.map(x=>({...x,lead:byId.get(x.lead_id),assistant:byId.get(x.assistant_id),driver:byId.get(x.driver_id),submitted:byId.get(x.submitted_by)})))
    }catch(e){setError(e.message||'ሽያጮችን ማምጣት አልተቻለምፕ')}
    finally{setLoading(false)}
  }

  useEffect(()=>{load()},[user.organization_id,user.branch_id,user.role])

  const review=async(saleId,action)=>{
    let reason=''
    if(action==='reject'){
      reason=window.prompt('የመሰረዝ ምክንያት ያስገቡ፦','')||''
      if(!reason.trim())return
    }
    setBusy(saleId);setError('')
    try{
      const {data,error}=await supabase.functions.invoke('review-sale',{body:{sale_id:saleId,action,reason}})
      if(error)throw error
      if(data?.error)throw new Error(data.error)
      await load()
    }catch(e){setError(e.message||'ማረጋገጫ አልተሳካም')}
    finally{setBusy(null)}
  }

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-2xl font-black">የሽያጭ ማረጋገጫ</h2><p className="text-sm text-zinc-500">የገቡ ሽያጮችን ይመልከቱ፣ ያረጋግጡ ወይም ይመልሱ።</p></div>
      <button className="btn-secondary" onClick={load} disabled={loading}>አድስ</button>
    </div>
    {error&&<div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
    <div className="overflow-x-auto rounded-2xl border bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full text-sm">
        <thead><tr className="border-b dark:border-zinc-800"><th className="p-3 text-left">ቀን</th><th className="p-3 text-left">ያስገባው</th><th className="p-3 text-left">ቡድን</th><th className="p-3 text-right">ጠቅላላ</th><th className="p-3">ሁኔታ</th><th className="p-3">ተግባር</th></tr></thead>
        <tbody>
          {sales.map(s=><tr key={s.id} className="border-b last:border-0 dark:border-zinc-800">
            <td className="p-3">{s.sale_date}</td>
            <td className="p-3">{s.submitted?.full_name||'—'}</td>
            <td className="p-3">{[s.lead,s.assistant,s.driver].filter(Boolean).map(p=>`${p.full_name} (${roles[p.role]||p.role})`).join('፣ ')||'—'}</td>
            <td className="p-3 text-right font-bold">{Number(s.total||0).toLocaleString()} ብር</td>
            <td className="p-3 text-center"><span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">{s.status==='pending'?'በመጠባበቅ ላይ':s.status==='verified'?'ተረጋግጧል':'ተመልሷል'}</span></td>
            <td className="p-3 text-center">{s.status==='pending'&&<div className="flex justify-center gap-2"><button className="btn" disabled={busy===s.id} onClick={()=>review(s.id,'verify')}>አረጋግጥ</button><button className="btn-secondary" disabled={busy===s.id} onClick={()=>review(s.id,'reject')}>መልስ</button></div>}{s.status==='rejected'&&<span className="text-xs text-rose-500">{s.reject_reason}</span>}</td>
          </tr>)}
          {!loading&&!sales.length&&<tr><td colSpan="6" className="p-10 text-center text-zinc-500">ምንም የሽያጭ መዝገብ የለም።</td></tr>}
          {loading&&<tr><td colSpan="6" className="p-10 text-center text-zinc-500">በመጫን ላይ…</td></tr>}
        </tbody>
      </table>
    </div>
  </section>
}
