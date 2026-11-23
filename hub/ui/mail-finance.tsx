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
  if(!entries.length && !error) return null
  return <details className="card settings mail-finance disclosure" aria-label="Finanzvorschläge aus Gmail">
    <summary><strong>Finanzvorschläge</strong><span className="count-badge">{entries.length} offen</span></summary>
    {error ? <p role="alert">{error}</p>:null}
    {compact && entries.length ? <><p>{entries.length===1?'Eine Buchung wartet auf deine Entscheidung.':entries.length+' Buchungen warten auf deine Entscheidung.'}</p>
      <button type="button" onClick={onOpen}>Vorschläge prüfen</button></>:null}
    {!compact ? entries.map(proposal=><Proposal key={proposal.id+proposal.title} proposal={proposal} decide={decide}/>) : null}
  </details>
}
