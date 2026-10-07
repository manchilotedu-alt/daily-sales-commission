import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from './lib/supabase'

const money=n=>Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})
const statusLabel={calculated:'ተቆጥሯል',approved:'ተፈቅዷል',paid:'ተከፍሏል',held:'ታግዷል'}

export function EarningsPage({user}){
 const [periods,setPeriods]=useState([]),[selected,setSelected]=useState(''),[rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const global=['super_admin','admin'].includes(user.role)
 useEffect(()=>{(async()=>{setLoading(true);setError('');try{
  let q=supabase.from('commission_periods').select('*').eq('organization_id',user.organization_id).order('period_start',{ascending:false})
  const {data,error:e}=await q;if(e)throw e;setPeriods(data||[]);if(!selected&&data?.[0])setSelected(data[0].id)
 }catch(e){setError(e.message)}finally{setLoading(false)}})()},[user.organization_id,selected])
 useEffect(()=>{if(!selected)return;(async()=>{setLoading(true);try{
  let q=supabase.from('employee_period_earnings').select('*,profiles:employee_id(full_name,role,branch_id)').eq('commission_period_id',selected)
  if(!global)q=q.eq('employee_id',user.id)
  if(user.role==='branch_admin')q=q.eq('profiles.branch_id',user.branch_id)
  const {data,error:e}=await q.order('net_payable',{ascending:false});if(e)throw e;setRows(data||[])
 }catch(e){setError(e.message)}finally{setLoading(false)}})()},[selected,user.id,user.branch_id,user.role,global])
 const totals=useMemo(()=>rows.reduce((a,r)=>({gross:a.gross+Number(r.gross_commission||0),bonuses:a.bonuses+Number(r.bonuses||0),deductions:a.deductions+Number(r.deductions||0)+Number(r.penalties||0)+Number(r.tax||0)+Number(r.legal_deductions||0),held:a.held+Number(r.amount_held||0),net:a.net+Number(r.net_payable||0)}),{gross:0,bonuses:0,deductions:0,held:0,net:0}),[rows])
 const period=periods.find(p=>p.id===selected)
 return <section className="space-y-5">
  <div><h2 className="text-2xl font-black">የኮሚሽን እና ገቢ ማስሊያ</h2><p className="text-sm text-zinc-500">Gross Commission → Adjustments/Bonuses → Allocations/Deductions/Tax → Hold → Net Payable</p></div>
  <div className="rounded-2xl border bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><label className="block text-sm">የኮሚሽን ጊዜ<select className="input mt-1 w-full" value={selected} onChange={e=>setSelected(e.target.value)}>{periods.map(p=><option key={p.id} value={p.id}>{p.name} — {p.period_start} → {p.period_end} ({p.status})</option>)}</select></label></div>
  {error&&<div className="rounded-xl bg-rose-500/10 p-3 text-rose-300">{error}</div>}
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Metric t="Gross Commission" v={money(totals.gross)+' ብር'}/><Metric t="Bonus" v={money(totals.bonuses)+' ብር'}/><Metric t="Deductions/Tax" v={money(totals.deductions)+' ብር'}/><Metric t="Held" v={money(totals.held)+' ብር'}/><Metric t="Net Payable" v={money(totals.net)+' ብር'}/></div>
  <div className="rounded-2xl border bg-white dark:border-zinc-800 dark:bg-zinc-900"><div className="border-b p-4 font-bold dark:border-zinc-800">{period?.name||'የገቢ መዝገብ'}</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b dark:border-zinc-800"><th className="p-3 text-left">ሰራተኛ</th><th className="p-3">Gross</th><th className="p-3">Bonus</th><th className="p-3">Deduction/Tax</th><th className="p-3">Held</th><th className="p-3">Net Payable</th><th className="p-3">Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-b last:border-0 dark:border-zinc-800"><td className="p-3">{r.profiles?.full_name||r.employee_id}</td><td className="p-3 text-right">{money(r.gross_commission)}</td><td className="p-3 text-right">{money(r.bonuses)}</td><td className="p-3 text-right">{money(Number(r.deductions||0)+Number(r.penalties||0)+Number(r.tax||0)+Number(r.legal_deductions||0))}</td><td className="p-3 text-right">{money(r.amount_held)}</td><td className="p-3 text-right font-bold">{money(r.net_payable)} ብር</td><td className="p-3 text-center">{statusLabel[r.status]||r.status}</td></tr>)}{!loading&&!rows.length&&<tr><td colSpan="7" className="p-8 text-center text-zinc-500">ለዚህ የኮሚሽን ጊዜ የተሰላ ገቢ የለም።</td></tr>}</tbody></table></div></div>
 </section>
}
function Metric({t,v}){return <div className="rounded-2xl border bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><div className="text-xs text-zinc-500">{t}</div><div className="mt-2 font-black">{v}</div></div>}
