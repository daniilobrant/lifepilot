import { useSyncExternalStore } from 'react'
import { money } from '../runtime/finance-types.ts'
import type { SubscriptionAssessment, SubscriptionReview, Verdict } from '../runtime/subscription-review.ts'

type Api=<T>(path:string,payload?:object,timeout?:number)=>Promise<T>
const verdicts:Record<Verdict,{label:string,tone:string}>={cancel:{label:'Kündigen',tone:'cancel'},switch:{label:'Wechseln',tone:'switch'},keep:{label:'Behalten',tone:'keep'}}
const day=(value:string)=>value.split('-').reverse().join('.')

function Assessment({item}:{item:SubscriptionAssessment}) {
  const verdict=verdicts[item.verdict]
  return <details className="sub-review-item" data-verdict={verdict.tone}>
    <summary><span className="sub-review-title">{item.title}</span><span className="sub-review-badge" data-verdict={verdict.tone}>{verdict.label}</span></summary>
    <p className="sub-review-headline">{item.headline}</p>
    <p>{item.reasoning}</p>
    {item.cutoff?<p className="sub-review-meta">Kündigungsfrist laut deinen Angaben: {day(item.cutoff)}</p>:null}
    {item.alternatives.length?<ul className="sub-review-alternatives">{item.alternatives.map(alternative=><li key={alternative.url+alternative.name}>
      <div className="sub-review-alt-head">
        <strong>{alternative.name}</strong>
        <span>{money(alternative.monthlyCents)}/Monat</span>
      </div>
      <span className="sub-review-saving" data-better={alternative.savingsYearCents>0||undefined}>{alternative.savingsYearCents>0?money(alternative.savingsYearCents)+' günstiger pro Jahr':
        alternative.savingsYearCents<0?money(-alternative.savingsYearCents)+' teurer pro Jahr':'gleich teuer'}</span>
      {alternative.priceNote?<small>{alternative.priceNote}</small>:null}
      <ul aria-label="Vorteile" className="pros">{alternative.pros.map(line=><li key={line}>{line}</li>)}</ul>
      <ul aria-label="Nachteile" className="cons">{alternative.cons.map(line=><li key={line}>{line}</li>)}</ul>
      <a href={alternative.url} target="_blank" rel="noreferrer noopener">Zum Angebot ↗</a>
    </li>)}</ul>:<p className="sub-review-meta">Keine belastbare Alternative gefunden.</p>}
  </details>
}

/*
 * Die Prüfung läuft im Hintergrund: Der Zustand liegt außerhalb der Seite, die Suche läuft weiter, wenn du den Bereich wechselst,
 * und das Ergebnis steht beim Zurückkehren bereit. Nur das Ergebnisfenster ist modal, und das öffnet nur ein Klick.
 */
type Job={status:'idle'|'running'|'done'|'error',review?:SubscriptionReview,error?:string}
let job:Job={status:'idle'}
const listeners=new Set<()=>void>()
const publish=(next:Job)=>{job=next;listeners.forEach(listener=>listener())}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener)}}
export const useSubscriptionJob=()=>useSyncExternalStore(subscribe,()=>job)

export function startSubscriptionReview(api:Api,month:string) {
  if(job.status==='running')return
  publish({status:'running'})
  api<SubscriptionReview>('/finance/subscription-review',{month,confirm:true},180_000).then(
    review=>publish({status:'done',review}),
    reason=>publish({status:'error',error:reason instanceof Error?reason.message:'Die Prüfung ist fehlgeschlagen.'}))
}

/** Ablauf im Abo-Bereich: Ladebalken nur in dieser Karte, danach die Ergebnisse als kompakte, aufklappbare Zeilen. */
export function SubscriptionReviewPanel() {
  const state=useSubscriptionJob()
  if(state.status==='idle')return null
  if(state.status==='running')return <div className="loading sub-review-status" role="status"><span>Pilot sucht Tarife und Alternativen … bis zu drei Minuten. Du kannst solange weiterarbeiten.</span><progress aria-label="Suche läuft"/></div>
  if(state.status==='error')return <p className="sub-review-status" role="alert">{state.error}</p>
  const review=state.review!
  const saving=review.items.reduce((sum,item)=>sum+(item.verdict==='cancel'?item.currentMonthlyCents*12:
    item.verdict==='switch'?Math.max(0,...item.alternatives.map(alternative=>alternative.savingsYearCents)):0),0)
  return <section className="sub-review" aria-label="Ergebnis der Abo-Prüfung">
    <div className="sub-review-summary">
      <p>{review.summary}</p>
      {saving>0?<strong>Bis zu {money(saving)} pro Jahr sparbar</strong>:null}
      <small>Stand {day(review.checked)} · Preise aus Websuche, vor einem Wechsel beim Anbieter prüfen. LifePilot kündigt und bucht nichts.</small>
    </div>
    {review.items.map(item=><Assessment key={item.title} item={item}/>)}
  </section>
}
