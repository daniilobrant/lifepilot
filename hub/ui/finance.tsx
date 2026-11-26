import { SubscriptionReviewPanel, startSubscriptionReview, useSubscriptionJob } from './subscription-review.tsx'
import {DateInput,monthAtOffset as shiftMonth} from './presentation.tsx'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { budgetCategories, budgetCategory, financeCategories, financeKinds, money, monthlyCents, type FinanceDraft, type FinanceEntry, type FinanceKind, type FinanceOverview } from '../runtime/finance-types.ts'
import { dateInBerlin, shiftDay } from '../runtime/values.ts'

type Api=<T>(path:string,payload?:object)=>Promise<T>
type Editor={draft:FinanceDraft, entry?:FinanceEntry}
const monthLabel=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric',timeZone:'UTC'})
const compactMonth=new Intl.DateTimeFormat('de-DE',{month:'short',timeZone:'UTC'})
const colors=['#53836a','#ad794e','#608fb0','#a476aa','#bf6370','#4f948b','#7b8a52','#87959d']
const asAmount=(cents:number|null)=>cents===null?'':(cents/100).toFixed(2).replace('.',',')
const errorText=(error:unknown)=>error instanceof Error?error.message:'Die Änderung konnte nicht gespeichert werden.'
function asCents(input:FormDataEntryValue|null) {
  const value=String(input??'').trim()
  if(!value) return null
  if(!/^\d{1,7}(?:[,.]\d{1,2})?$/u.test(value)) throw Error('Gib den Betrag in Euro ein, zum Beispiel 14,50.')
  const [whole,fraction='']=value.split(/[,.]/u)
  return Number(whole)*100+Number(fraction.padEnd(2,'0'))
}
function monthName(month:string, short=false) { return (short?compactMonth:monthLabel).format(new Date(month+'-01T00:00:00Z')) }
function newDraft(kind:FinanceKind,month:string,variable=false):FinanceDraft {
  const today=dateInBerlin()
  return {kind,title:'',cents:0,cycle:'monthly',category:'',date:kind==='expense'||variable?(today.startsWith(month)?today:month+'-01'):null,
    dueDay:null,noticeDays:null,renewal:null,local:false,note:''}
}
export function FinanceForm({draft,save,cancel,label='Speichern'}: {
  draft:FinanceDraft, save:(draft:FinanceDraft)=>Promise<unknown>, cancel:()=>void,label?:string,
}) {
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const dated=draft.kind==='expense'||draft.kind==='income'&&draft.date!==null
  const subscription=draft.kind==='subscription'
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(busy) return
    const form=new FormData(event.currentTarget)
    setBusy(true);setError('')
    try {
      const cents=asCents(form.get('amount'))
      if (!cents) throw Error('Gib einen Betrag größer als 0 € ein.')
      const number=(field:string)=>form.get(field)?Number(form.get(field)):null
      await save({...draft,title:String(form.get('title')),cents,category:String(form.get('category')??''),
        cycle:form.get('cycle')==='yearly'?'yearly':'monthly',date:String(form.get('date')??'')||null,
        dueDay:number('dueDay'),noticeDays:number('noticeDays'),renewal:String(form.get('renewal')??'')||null,
        local:form.get('local')==='on',note:String(form.get('note')??'')})
    } catch(reason){setError(errorText(reason))}
    finally{setBusy(false)}
  }
  return <form className="finance-form" onSubmit={submit}>
    <fieldset disabled={busy}>
      <div className="finance-form-grid">
        <label>Titel<input name="title" autoFocus defaultValue={draft.title} required maxLength={120}/></label>
        <label>Betrag in €<input name="amount" inputMode="decimal" defaultValue={draft.cents?asAmount(draft.cents):''} required/></label>
        {dated?<label>Datum<DateInput name="date"  defaultValue={draft.date??''} required/></label>:
          <label>Abrechnung<select name="cycle" defaultValue={draft.cycle}><option value="monthly">Monatlich</option><option value="yearly">Jährlich</option></select></label>}
        {draft.kind!=='income'&&<label>Kategorie<select name="category" defaultValue={draft.category||''}>
          <option value="">Automatisch</option>
          {[...new Set([...financeCategories,...(draft.category?[draft.category]:[])])].map(option=><option key={option}>{option}</option>)}
        </select></label>}
      </div>
      <details>
        <summary>Weitere Angaben</summary>
        <div className="finance-form-grid">
          {draft.kind==='fixed'?<label>Abbuchungstag<input name="dueDay" type="number" min={1} max={31} defaultValue={draft.dueDay??''}/></label>:null}
          {subscription?<><label>Nächste Verlängerung<DateInput name="renewal"  defaultValue={draft.renewal??''}/></label>
            <label>Kündigungsfrist in Tagen<input name="noticeDays" type="number" min={0} max={730} defaultValue={draft.noticeDays??''}/></label>
            <label className="data-check"><input name="local" type="checkbox" defaultChecked={draft.local}/> Lokale Mitgliedschaft</label></>:null}
          <label>Notiz<input name="note" maxLength={480} defaultValue={draft.note}/></label>
        </div>
      </details>
      <div className="actions"><button type="submit" className="primary">{label}</button><button type="button" onClick={cancel}>Abbrechen</button></div>
    </fieldset>
    {error?<p role="alert">{error}</p>:null}
  </form>
}

function BudgetChart({view}:{view:FinanceOverview}) {
  const totals=new Map<string,number>()
  for(const entry of view.entries) {
    if(entry.kind==='income')continue
    const category=budgetCategory(entry)
    totals.set(category,(totals.get(category)??0)+monthlyCents(entry))
  }
  const available=Math.max(0,view.totals.balance)
  const base=Math.max(view.totals.income,view.totals.spending)
  const groups:{label:string,cents:number,color:string}[]=budgetCategories.map((label,index)=>({label,cents:totals.get(label)??0,color:colors[index]}))
    .filter(group=>group.cents>0)
  if(available)groups.push({label:'Übrig',cents:available,color:'#b5caba'})
  let offset=0
  return <section className="card settings finance-distribution"><h2>Wofür geht dein Geld weg?</h2>
    {!base?<p className="empty">Füge Einnahmen oder Ausgaben hinzu, um die Verteilung zu sehen.</p>:<>
      <div className="finance-split-chart">
        <div className="finance-ring">
          <svg viewBox="0 0 42 42" role="img" aria-label="Monatsbudget nach Kategorien">
            {groups.map(group=>{
              const length=group.cents/base*100
              const start=offset
              offset+=length
              return <circle key={group.label} cx="21" cy="21" r="15.9" fill="none" stroke={group.color} strokeWidth="5.6" pathLength="100"
                strokeDasharray={length+' '+(100-length)} strokeDashoffset={-start} transform="rotate(-90 21 21)">
                <title>{group.label} · {money(group.cents)}</title>
              </circle>
            })}
          </svg>
          <div className="finance-ring-centre"><small>Einnahmen</small><strong>{money(view.totals.income)}</strong></div>
        </div>
        <ul className="finance-distribution-list">{groups.map(group=><li key={group.label}>
          <span className="finance-swatch" style={{background:group.color}} aria-hidden/><span>{group.label}</span>
          <strong>{money(group.cents)}</strong>
        </li>)}</ul>
      </div>
      {view.totals.balance<0&&<p className="finance-shortfall">Über dem erfassten Budget · {money(-view.totals.balance)}</p>}
    </>}
  </section>
}

function HistoryChart({history}:{history:FinanceOverview['history']}) {
  const format=new Intl.NumberFormat('de-DE',{notation:'compact',maximumFractionDigits:1})
  const rawMax=Math.max(10000,...history.flatMap(item=>[item.income,item.spending]))
  const unit=Math.pow(10,Math.floor(Math.log10(rawMax)))
  const max=Math.ceil(rawMax/unit*2)*unit/2
  const x=(index:number)=>65+86*index
  const y=(value:number)=>176-value/max*148
  const series=[['income','Einnahmen','#42775b'],['spending','Ausgaben','#bc7051']] as const
  return <>
    <div className="finance-trend-legend">{series.map(([key,label,color])=><span key={key}>
      <i style={{background:color}} aria-hidden/>{label}</span>)}</div>
    <svg className="finance-history-chart" viewBox="0 0 525 210" role="img" aria-label="Einnahmen und Ausgaben der letzten sechs Monate">
      {[0,.25,.5,.75,1].map(fraction=><g key={fraction} className="finance-gridline">
        <line x1="65" x2="495" y1={y(max*fraction)} y2={y(max*fraction)}/>
        <text x="54" y={y(max*fraction)+4} textAnchor="end">{format.format(max*fraction/100)} €</text>
      </g>)}
      <rect x={x(history.length-1)-27} y="14" width="54" height="166" rx="8" className="finance-trend-current"/>
      {series.map(([key,label,color])=><g key={key}>
        {history.slice(1).map((item,i)=>item.hasEntries && history[i].hasEntries ? <line key={item.month}
          x1={x(i)} y1={y(history[i][key])} x2={x(i+1)} y2={y(item[key])} stroke={color} strokeWidth="3"/> : null)}
        {history.map((item,i)=>item.hasEntries ? <circle cx={x(i)} cy={y(item[key])} r={i===history.length-1?5:3.5} key={item.month} fill={color}>
          <title>{monthName(item.month)} · {label} {money(item[key])}</title>
        </circle> : null)}
      </g>)}
      {history.map((item,i)=><text key={item.month} x={x(i)} y="202" textAnchor="middle" fill="currentColor">{monthName(item.month,true)}</text>)}
    </svg>
  </>
}

export function FinancePanel({api,refreshKey,reviewTools,focus}:{api:Api,refreshKey:string,reviewTools?:ReactNode,focus?:{id?:string,month?:string}}) {
  const [month,setMonth]=useState(()=>focus?.month??dateInBerlin().slice(0,7))
  const [view,setView]=useState<FinanceOverview>()
  const [localRevision,setLocalRevision]=useState(0)
  const [error,setError]=useState('')
  const [editor,setEditor]=useState<Editor>()
  const [filter,setFilter]=useState('')
  const reviewJob=useSubscriptionJob()
  const [removing,setRemoving]=useState('')
  const url='/finance?'+new URLSearchParams({month})
  useEffect(()=>{
    let current=true
    void api<FinanceOverview>(url).then(result=>{if(current){setView(result);setError('')}},
      reason=>{if(current)setError(errorText(reason))})
    return ()=>{current=false}
  },[api,url,refreshKey,localRevision])
  useEffect(()=>{
    const entry=view?.entries.find(row=>row.id===focus?.id)
    if(entry)setEditor({entry,draft:entry})
  },[focus?.id,view?.totals.month])
  const isCurrent=view?.totals.month===month
  const reload=()=>setLocalRevision(value=>value+1)
  function selectMonth(value:string) {
    setMonth(value);setEditor(undefined);setFilter('');setRemoving('');setError('')
  }
  function section(kind:FinanceKind, title:string, button:string, children?:ReactNode,variable=false,extra?:ReactNode) {
    const entries=view?.entries.filter(item=>item.kind===kind && (kind!=='income'||Boolean(item.date)===variable) && (kind!=='expense'||!filter||item.category===filter))??[]
    if(kind==='expense')entries.sort((a,b)=>(b.date??'').localeCompare(a.date??''))
    return <section className={"card settings finance-section"+(entries.length ? "" : " finance-section-empty")}>
      <div className="editor-title"><h2>{title}</h2><div className="finance-head-actions"><button className="inline-action" type="button" onClick={()=>setEditor({draft:newDraft(kind,month,variable)})}>{button}</button>{extra}</div></div>
      {children}
      {!entries.length?<p className="empty">Keine Einträge.</p>:<ul className="finance-list">{entries.map(item=><li key={item.id}>
        <div className="finance-entry">
          <button className="quiet finance-entry-title" type="button" onClick={()=>setEditor({draft:item,entry:item})} aria-label={item.title+' bearbeiten'}>
            <strong>{item.title}</strong><small>{[item.category,item.date?.split('-').reverse().join('.'),item.dueDay && 'Abbuchung am '+item.dueDay+'.',
              item.cycle==='yearly' && money(item.cents)+' jährlich',item.local && 'Lokal'].filter(Boolean).join(' · ')}</small>
          </button>
          <strong>{money(monthlyCents(item))}</strong>
          {removing===item.id?<div className="actions"><button type="button" onClick={async()=>{
            try {await api('/finance/entry',{id:item.id,revision:item.revision,month,remove:true,confirm:true});setRemoving('');reload()}
            catch(reason){setError(errorText(reason))}
          }}>Entfernen bestätigen</button><button type="button" onClick={()=>setRemoving('')}>Abbrechen</button></div>:
            <button type="button" className="quiet" onClick={()=>setRemoving(item.id)} aria-label={item.title+' entfernen'}>×</button>}
        </div>
      </li>)}</ul>}
    </section>
  }
  return <div className="finance-space">
    <header className="finance-toolbar">
    <div className="actions finance-month" aria-label="Monat">
      <button type="button" aria-label="Vorheriger Monat" onClick={()=>selectMonth(shiftMonth(month,-1))}>‹</button>
      <select aria-label="Monat auswählen" value={month} onChange={event=>selectMonth(event.target.value)}>
        {Array.from({length:37},(_,index)=>shiftMonth(month,index-24)).map(value=><option key={value} value={value}>{monthName(value)}</option>)}
      </select>
      <button type="button" aria-label="Nächster Monat" onClick={()=>selectMonth(shiftMonth(month,1))}>›</button>
    </div>
    </header>
    {error?<p role="alert">{error}</p>:null}
    {!isCurrent||!view?<p role="status">Monatsübersicht wird geladen …</p>:<>
      <div className="finance-metrics">
        <section className="card settings"><h2>Einnahmen</h2><strong>{money(view.totals.income)}</strong></section>
        <section className="card settings"><h2>Ausgaben</h2><strong>{money(view.totals.spending)}</strong>
          <small>Fix {money(view.totals.fixed)} · Abos {money(view.totals.subscriptions)} · Variabel {money(view.totals.variable)}</small></section>
        <section className={'card settings finance-balance '+(view.totals.balance<0||view.totals.income&&view.totals.balance/view.totals.income<.1?'negative':
          view.totals.income&&view.totals.balance/view.totals.income<=.25?'warning':'')}><h2>Restbudget</h2><strong>{money(view.totals.balance)}</strong>
          {view.settings.target!==null && <small>Ziel {money(view.settings.target)} · {view.totals.balance>=view.settings.target?'erreicht':
            money(view.settings.target-view.totals.balance)+' darunter'}</small>}
          {view.totals.income?<progress value={Math.min(view.totals.spending,view.totals.income)} max={view.totals.income} aria-label="Verbrauchtes Monatsbudget"/>:null}</section>
      </div>
      {editor?<section className="card settings"><h2>{financeKinds[editor.draft.kind]} {editor.entry?'bearbeiten':'eintragen'}</h2>
        <FinanceForm key={editor.entry?.id??(editor.draft.kind+Boolean(editor.draft.date))} draft={editor.draft} cancel={()=>setEditor(undefined)} save={async draft=>{
          await api('/finance/entry',{draft,month,id:editor.entry?.id,revision:editor.entry?.revision,confirm:true})
          setEditor(undefined);reload()
        }}/></section>:null}

      <div className="finance-columns finance-detail-columns">
        {section('income','Fixe Einnahmen','+ Einnahme')}
        {section('fixed','Fixkosten','+ Fixkosten')}
        {section('income','Variable Einnahmen','+ Einnahme',undefined,true)}
        {section('expense','Variable Ausgaben','+ Ausgabe',view.totals.variable>0?<label className="finance-expense-filter">Kategorie
          <select value={filter} onChange={event=>setFilter(event.target.value)}><option value="">Alle Ausgaben</option>
            {[...new Set(view.entries.filter(item=>item.kind==='expense').map(item=>item.category))].map(category=><option key={category}>{category}</option>)}</select></label>:null)}
      </div>
      <div className="finance-columns finance-summary-columns"><BudgetChart view={view}/>
        {section('subscription','Abos & Mitgliedschaften','+ Abo',<>{reviewTools}<SubscriptionReviewPanel/></>,false,
          <button className="inline-action" type="button" disabled={reviewJob.status==='running'} onClick={()=>startSubscriptionReview(api,month)}>{reviewJob.status==='running'?'Suche läuft …':reviewJob.status==='done'?'Neu prüfen':'Abos & Alternativen prüfen'}</button>)}
      </div>
      <section className="card settings finance-history"><h2>Sechsmonatsvergleich</h2><HistoryChart history={view.history}/></section>
    </>}
  </div>
}
