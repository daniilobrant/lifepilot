import { useEffect, useRef, useState } from 'react'
import { money } from '../runtime/finance-types.ts'
import type { SubscriptionAssessment, SubscriptionReview, Verdict } from '../runtime/subscription-review.ts'

type Api=<T>(path:string,payload?:object)=>Promise<T>
const verdicts:Record<Verdict,{label:string,tone:string}>={cancel:{label:'Kündigen',tone:'cancel'},switch:{label:'Wechseln',tone:'switch'},keep:{label:'Behalten',tone:'keep'}}
const day=(value:string)=>value.split('-').reverse().join('.')

function Assessment({item}:{item:SubscriptionAssessment}) {
  const verdict=verdicts[item.verdict]
  return <article className="sub-review-item" data-verdict={verdict.tone}>
    <header>
      <div><h3>{item.title}</h3><p className="sub-review-price">Aktuell {money(item.currentMonthlyCents)} pro Monat · {money(item.currentMonthlyCents*12)} pro Jahr</p></div>
      <span className="sub-review-badge" data-verdict={verdict.tone}>{verdict.label}</span>
    </header>
    <p className="sub-review-headline">{item.headline}</p>
    <p>{item.reasoning}</p>
    {item.cutoff?<p className="sub-review-cutoff">Kündigungsfrist laut deinen Angaben: {day(item.cutoff)}</p>:null}
    {item.alternatives.length?<ul className="sub-review-alternatives">{item.alternatives.map(alternative=><li key={alternative.url+alternative.name}>
      <div className="sub-review-alt-head">
        <strong>{alternative.name}</strong>
        <span>{money(alternative.monthlyCents)} pro Monat</span>
        <span className="sub-review-saving" data-better={alternative.savingsYearCents>0||undefined}>{alternative.savingsYearCents>0?money(alternative.savingsYearCents)+' günstiger pro Jahr':
          alternative.savingsYearCents<0?money(-alternative.savingsYearCents)+' teurer pro Jahr':'gleich teuer'}</span>
      </div>
      {alternative.priceNote?<small>{alternative.priceNote}</small>:null}
      <div className="sub-review-columns">
        <ul aria-label="Vorteile" className="pros">{alternative.pros.map(line=><li key={line}>{line}</li>)}</ul>
        <ul aria-label="Nachteile" className="cons">{alternative.cons.map(line=><li key={line}>{line}</li>)}</ul>
      </div>
      <a href={alternative.url} target="_blank" rel="noreferrer noopener">Zum Angebot ↗</a>
    </li>)}</ul>:<p className="empty">Keine belastbare Alternative gefunden.</p>}
  </article>
}

/** Übersichtsfenster der Abo-Prüfung: startet die Suche beim Öffnen und zeigt Empfehlung, Alternativen und Quicklinks. */
export function SubscriptionReviewWindow({api,month,close}:{api:Api,month:string,close:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null)
  const [review,setReview]=useState<SubscriptionReview>()
  const [error,setError]=useState('')
  const [run,setRun]=useState(0)
  useEffect(()=>{dialog.current?.showModal()},[])
  useEffect(()=>{
    let current=true
    setReview(undefined);setError('')
    api<SubscriptionReview>('/finance/subscription-review',{month,confirm:true}).then(
      result=>{if(current)setReview(result)},reason=>{if(current)setError(reason instanceof Error?reason.message:'Die Prüfung ist fehlgeschlagen.')})
    return ()=>{current=false}
  },[api,month,run])
  const saving=review?.items.reduce((sum,item)=>sum+(item.verdict==='cancel'?item.currentMonthlyCents*12:
    item.verdict==='switch'?Math.max(0,...item.alternatives.map(alternative=>alternative.savingsYearCents)):0),0)??0
  return <dialog ref={dialog} className="task-dialog card sub-review" aria-labelledby="sub-review-title" onClose={close}>
    <header className="editor-title"><h2 id="sub-review-title">Abos &amp; Alternativen</h2><button type="button" className="quiet" onClick={()=>dialog.current?.close()} aria-label="Fenster schließen">×</button></header>
    {!review&&!error?<div className="loading" role="status"><span>Pilot sucht aktuelle Tarife und Alternativen … das kann bis zu drei Minuten dauern.</span><progress aria-label="Suche läuft"/></div>:null}
    {error?<div role="alert"><p>{error}</p><button type="button" className="primary" onClick={()=>setRun(value=>value+1)}>Erneut prüfen</button></div>:null}
    {review?<>
      <section className="sub-review-summary">
        <p>{review.summary}</p>
        {saving>0?<strong>Mögliche Ersparnis: bis zu {money(saving)} pro Jahr</strong>:null}
        <small>Stand {day(review.checked)} · Preise aus Websuche, bitte vor einem Wechsel auf der Anbieterseite prüfen. LifePilot kündigt und bucht nichts.</small>
      </section>
      {review.items.map(item=><Assessment key={item.title} item={item}/>)}
      <div className="actions"><button type="button" onClick={()=>setRun(value=>value+1)}>Neu prüfen</button><button type="button" className="primary" onClick={()=>dialog.current?.close()}>Schließen</button></div>
    </>:null}
  </dialog>
}
