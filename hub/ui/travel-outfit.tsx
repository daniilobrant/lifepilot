import { useMemo, useState } from 'react'
import type { OutfitChatPlan, OutfitChoice, OutfitDaypart } from '../runtime/outfit-types.ts'
import type { Trip } from '../runtime/trip-types.ts'
import { dateInBerlin } from '../runtime/values.ts'

type Api=<T>(path:string,payload?:object,timeout?:number)=>Promise<T>
export type OutfitHandoff = { run:string, plan:OutfitChatPlan, choice?:OutfitChoice, error?:string }

const daypart:Record<string,OutfitDaypart>={Vormittag:'Morgens',Nachmittag:'Mittags',Abend:'Abends'}
const dayLabel=new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'numeric',month:'long',timeZone:'UTC'})
const label=(value:string)=>dayLabel.format(new Date(value+'T12:00:00Z'))

export function TripOutfitPanel({api,trip,onResult,onClose}:{api:Api,trip:Trip,onResult:(request:OutfitHandoff)=>void,onClose:()=>void}) {
  const today=dateInBerlin()
  const days=useMemo(()=>trip.days.filter(day=>day.date>=today&&day.date>=trip.draft.start),[trip,today])
  const [date,setDate]=useState(()=>days[0]?.date??trip.draft.start)
  const [target,setTarget]=useState('day')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const day=trip.days.find(entry=>entry.date===date)
  const city=trip.draft.destination.split(',')[0].trim()
  const activity=day?.activities.find(entry=>entry.id===target)
  async function submit() {
    setBusy(true);setError('')
    // Kurze Anlassbezeichnung: ganzer Tag neutral, Aktivität auf den ersten Satzteil gekürzt (Titel und Anlassprüfung bleiben lesbar).
    const short=(activity?.text??'').split(/[.:;!?]/u)[0].trim()
    const occasion=activity?(short.length>64?short.slice(0,64).replace(/\s+\S*$/u,'')+' …':short):'Urlaubstag in '+city
    const plan:OutfitChatPlan={place:city,date,occasion,daypart:activity?daypart[activity.period]:null,vacation:trip.id}
    try {
      const choice=await api<OutfitChoice>('/outfits/generate',{query:{mode:'occasion',occasion,required:[],variant:0,place:city,date,vacation:trip.id,
        ...(activity&&{daypart:daypart[activity.period]})},confirm:true},25000)
      onResult({run:'trip-outfit:'+Date.now(),plan,choice})
    } catch(reason) {
      setError(reason instanceof Error?reason.message:'Der Outfit-Vorschlag konnte nicht erstellt werden.')
      setBusy(false)
    }
  }
  return <section className="card travel-stack travel-outfit" aria-label="Outfit-Vorschlag">
    <div className="travel-maps-head"><h2>Outfit-Vorschlag abrufen</h2><button type="button" className="quiet" onClick={onClose} aria-label="Schließen">×</button></div>
    {!days.length?<p className="empty">Für diese Reise liegen keine Tage mehr vor dir.</p>:<>
      <p className="travel-maps-summary">LifePilot wählt aus deinem Kleiderschrank passend zu Programm und Wetter in {city}.</p>
      <label>Datum<select value={date} onChange={event=>{setDate(event.target.value);setTarget('day')}} disabled={busy}>
        {days.map(entry=><option key={entry.date} value={entry.date}>{label(entry.date)}{entry.date===today?' · heute':''}</option>)}</select></label>
      <fieldset className="travel-outfit-targets" disabled={busy}><legend>Für welchen Teil des Tages?</legend>
        <label className={'travel-outfit-choice'+(target==='day'?' is-selected':'')}><input type="radio" name="outfit-target" checked={target==='day'} onChange={()=>setTarget('day')}/>
          <span><strong>Für den ganzen Tag</strong><small>{day?.title??'Tagesplan'}</small></span></label>
        {(day?.activities??[]).map(entry=><label key={entry.id} className={'travel-outfit-choice'+(target===entry.id?' is-selected':'')}>
          <input type="radio" name="outfit-target" checked={target===entry.id} onChange={()=>setTarget(entry.id)}/>
          <span><strong>{entry.text}</strong><small>{entry.period}{entry.place?' · '+entry.place.split(',')[0]:''}</small></span></label>)}
      </fieldset>
      {error?<p role="alert">{error}</p>:null}
      <div className="travel-maps-actions"><button type="button" className="primary" disabled={busy} onClick={()=>void submit()}>{busy?'Outfit wird zusammengestellt …':'Outfit vorschlagen'}</button>
        <button type="button" disabled={busy} onClick={onClose}>Abbrechen</button></div>
    </>}
  </section>
}
