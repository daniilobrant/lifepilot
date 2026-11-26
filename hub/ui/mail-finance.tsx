import {BulkApproval} from './bulk-approval.tsx'
import {displayIdentity} from './presentation.tsx'
import {DateInput} from './presentation.tsx'
import {useEffect,useState,type FormEvent} from 'react'
import {money} from '../runtime/finance-types.ts'
import type {MailFinanceProposal} from '../runtime/mail-finance.ts'

type Api=<T>(path:string,payload?:object,timeout?:number)=>Promise<T>
type Decide=(id:string,approved:boolean,draft?:{title:string,date:string})=>Promise<void>

function Proposal({proposal,decide}:{proposal:MailFinanceProposal,decide:Decide}){
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const title=displayIdentity(proposal.title,true)
  const subscription=proposal.subscription
  const kind=subscription?'Abo · '+(subscription.cycle==='monthly'?'monatlich':'jährlich'):proposal.refund?'Erstattung':proposal.direction==='incoming'?'Einnahme':'Ausgabe'
  async function answer(approved:boolean,form?:HTMLFormElement){
    if(busy) return
    setBusy(true);setError('')
    try{
      const data=form?new FormData(form):undefined
      await decide(proposal.id,approved,data ? {title:String(data.get('title')),date:String(data.get('date'))} : undefined)
    } catch(reason){setError(reason instanceof Error?reason.message:'Die Entscheidung konnte nicht gespeichert werden.')}
    finally{setBusy(false)}
  }
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();void answer(true,event.currentTarget)}
  return <details className="mail-finance-proposal disclosure"><summary>
    <span><strong>{title}</strong><small>{kind}{title!==proposal.title?' · '+proposal.title:''}</small></span><strong>{money(proposal.cents)}</strong>
  </summary><form onSubmit={submit}>
    <fieldset disabled={busy}>
      {subscription ? <p>{subscription.confirmed?'Abrechnungsrhythmus laut Beleg.':'Vorschlag aus drei wiederkehrenden Zahlungen.'}
        {subscription.renewal?' Nächste Verlängerung laut Beleg am '+subscription.renewal.split('-').reverse().join('.')+'.':''}</p>:null}
      {proposal.orderReference ? <p>Bestellbetrag laut Amazon. Prüfe das Zahlungsdatum vor der Übernahme.</p>:null}
      {proposal.counterparty?<p>{proposal.direction==='outgoing'?'An':'Von'} {proposal.counterparty}{proposal.description?' · '+proposal.description:''}</p>:null}
      <div className="profile-grid">
        <label>Titel<input name="title" defaultValue={title} maxLength={120} required/></label>
        <label>{subscription?'Abo erfassen ab':proposal.mailDate?'Zahlungsdatum prüfen':'Buchungsdatum'}<DateInput name="date"  defaultValue={proposal.date} required/></label>
      </div>
      <div className="actions">
        <button className="primary" type="submit">{subscription?'Ja, Abo übernehmen':'Ja, hinzufügen'}</button>
        <button type="button" onClick={()=>void answer(false)}>Nein</button>
      </div>
    </fieldset>
    {error ? <p role="alert">{error}</p> : null}
  </form></details>
}

export function MailFinance({api,refreshKey,onUpdate,compact,onOpen}:{
  api:Api,refreshKey:string,onUpdate:()=>void,compact?:boolean,onOpen?:()=>void,
}){
  const [entries,setEntries]=useState<MailFinanceProposal[]>([])
  const [error,setError]=useState('')
  const [submitted,setSubmitted]=useState(false)
  useEffect(()=>{
    let active=true
    void api<MailFinanceProposal[]>('/inbox/finance').then(value=>{
      if(active){setEntries(value);setError('')}
    }).catch(reason=>{if(active)setError(reason.message)})
    return ()=>{active=false}
  },[api,refreshKey])
  async function decide(id:string,approved:boolean,draft?:{title:string,date:string}){
    await api('/inbox/finance',{proposal:id,approved,draft,confirm:true})
    setEntries(current=>current.filter(item=>item.id!==id))
    onUpdate()
  }
  async function approveAll(items:readonly MailFinanceProposal[]){
    const {accepted,failed}=await api<{accepted:string[],failed:{id:string,reason:string}[]}>('/inbox/finance/bulk',{
      proposals:items.map(({id,...draft})=>({id,expected:JSON.stringify(draft)})),confirm:true,
    },30000)
    setSubmitted(true)
    const resolved=new Set(accepted)
    setEntries(current=>current.filter(item=>!resolved.has(item.id)))
    if(accepted.length)onUpdate()
    try{setEntries(await api<MailFinanceProposal[]>('/inbox/finance'))}
    catch(cause){setError(cause instanceof Error?cause.message:'Finanzvorschläge konnten nicht aktualisiert werden.')}
    return {approved:accepted.length,failures:failed.map(item=>({...item,title:items.find(entry=>entry.id===item.id)?.title??'Finanzvorschlag'}))}
  }
  if(!entries.length && !error && !submitted) return null
  return <details className="card settings mail-finance disclosure" aria-label="Finanzvorschläge aus Gmail">
    <summary><strong>Finanzvorschläge</strong><span className="count-badge">{entries.length} offen</span></summary>
    {error ? <p role="alert">{error}</p>:null}
    {compact && entries.length ? <><p>{entries.length===1?'Eine Buchung wartet auf deine Entscheidung.':entries.length+' Buchungen warten auf deine Entscheidung.'}</p>
      <button type="button" onClick={onOpen}>Vorschläge prüfen</button></>:null}
    {!compact ? <>
      {entries.map(proposal=><Proposal key={proposal.id+proposal.title} proposal={proposal} decide={decide}/>)}
      <BulkApproval items={entries} approve={approveAll} description="LifePilot übernimmt die angezeigten Einnahmen, Ausgaben und Abos mit den vorgeschlagenen Beträgen und Daten."/>
    </> : null}
  </details>
}

type PayPalRow=MailFinanceProposal & {state:'open'|'assigned'|'ignored'}
const dayText=(date:string)=>date.split('-').reverse().join('.')
/** Optionale Übersicht aller erkannten PayPal-Zahlungen. Nichts davon zählt, bis es zugeordnet wird. */
export function PayPalList({api,month,refreshKey,onChange}:{api:Api,month:string,refreshKey:string,onChange:()=>void}){
  const [rows,setRows]=useState<PayPalRow[]>([])
  const [error,setError]=useState('')
  const [busy,setBusy]=useState('')
  useEffect(()=>{
    let active=true
    void api<PayPalRow[]>('/inbox/paypal?month='+month).then(value=>{if(active){setRows(value);setError('')}})
      .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'PayPal-Zahlungen konnten nicht geladen werden.')})
    return ()=>{active=false}
  },[api,month,refreshKey])
  async function decide(row:PayPalRow,assign:boolean){
    if(busy)return
    setBusy(row.id);setError('')
    try{
      await api('/inbox/paypal',{entry:row.id,assign,confirm:true})
      setRows(current=>current.map(item=>item.id===row.id?{...item,state:assign?'assigned':'ignored'}:item))
      onChange()
    }catch(reason){setError(reason instanceof Error?reason.message:'Die Entscheidung konnte nicht gespeichert werden.')}
    finally{setBusy('')}
  }
  const incoming=(row:PayPalRow)=>row.direction==='incoming'||row.refund
  return <section className="card settings finance-paypal" aria-label="Zahlungen aus Mails">
    <div className="editor-title"><h2>Zahlungen aus Mails</h2><span className="count-badge">{rows.filter(row=>row.state==='open').length} offen</span></div>
    <p className="finance-paypal-note">Erkannte Zahlungen aus PayPal, Karte und Bestellungen. „Zuordnen“ übernimmt sie in die variablen Einnahmen oder Ausgaben, „Nicht beachten“ lässt sie nur hier stehen und aus dem Budget heraus. Beides lässt sich jederzeit ändern.</p>
    {error?<p role="alert">{error}</p>:null}
    {!rows.length&&!error?<p className="empty">Keine Zahlungen in diesem Monat.</p>:null}
    <ul className="finance-list">{rows.map(row=><li key={row.id} className="finance-paypal-row">
      <div className="finance-paypal-info"><strong>{displayIdentity(row.title,true)}</strong>
        <small>{[incoming(row)?'Eingang':'Ausgang',dayText(row.date),row.state==='assigned'?'zugeordnet':row.state==='ignored'?'nicht beachtet':''].filter(Boolean).join(' · ')}</small></div>
      <strong className={incoming(row)?'finance-in':'finance-out'}>{incoming(row)?'+':'−'}{money(row.cents)}</strong>
      <div className="finance-paypal-actions">
        <button type="button" className={row.state==='assigned'?'finance-chosen':''} disabled={Boolean(busy)} aria-pressed={row.state==='assigned'} onClick={()=>void decide(row,true)}>Zuordnen</button>
        <button type="button" className={row.state==='ignored'?'finance-chosen':''} disabled={Boolean(busy)} aria-pressed={row.state==='ignored'} onClick={()=>void decide(row,false)}>Nicht beachten</button>
      </div>
    </li>)}</ul>
  </section>
}
