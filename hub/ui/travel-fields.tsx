import {useEffect,useId,useRef,useState} from 'react'
import type {TripPlace} from '../connectors/trip-places.ts'
import {dateInBerlin,shiftDay} from '../runtime/values.ts'
import {DateInput,monthAtOffset} from './presentation.tsx'

export function TripPlaceField({name,label,initial}:{name:'destination'|'departure',label:string,initial:string}) {
  const id=useId()
  const [draft,setDraft]=useState<string>()
  const value=draft??initial
  const [places,setPlaces]=useState<TripPlace[]>([])
  const [active,setActive]=useState(-1)
  const [status,setStatus]=useState('')
  const [open,setOpen]=useState(false)
  const query=open?draft?.trim():undefined
  useEffect(()=>{
    if (!query||query.length<2) return
    const controller=new AbortController()
    const timer=setTimeout(async()=>{
      setStatus('Orte werden gesucht …')
      try {
        const response=await fetch('/api/trips/places?'+new URLSearchParams({q:query,kind:name}),{signal:controller.signal})
        const result=await response.json()
        if (controller.signal.aborted) return
        if (!response.ok) throw Error(result.error)
        setPlaces(result.places)
        setStatus(result.places.length?'':'Keine passenden Orte gefunden.')
      } catch (reason) {
        if (!controller.signal.aborted) setStatus(reason instanceof Error?reason.message:'Die Ortssuche ist gerade nicht erreichbar.')
      }
    },250)
    return ()=>{clearTimeout(timer);controller.abort()}
  },[query,name])
  function choose(place:TripPlace) {
    const qualified=[...new Set([place.name,place.region,place.country].filter(Boolean))].join(', ')
    setDraft(qualified.length<=100?qualified:place.name+', '+place.country)
    setOpen(false);setPlaces([]);setActive(-1);setStatus('')
  }
  const expanded=open&&places.length>0
  return <div className="trip-place" onBlur={event=>{
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }}>
    <label htmlFor={id}>{label}</label>
    <input id={id} role="combobox" name={name} required maxLength={100} value={value}
      autoComplete="off" placeholder={name==='destination'?'Stadt oder Insel suchen':'Stadt suchen'}
      aria-autocomplete="list" aria-expanded={expanded} aria-controls={id+'-places'}
      aria-activedescendant={expanded&&active>=0?id+'-place-'+active:undefined}
      onFocus={()=>setOpen(true)} onChange={event=>{
        setDraft(event.currentTarget.value);setOpen(true);setPlaces([]);setActive(-1);setStatus('')
      }}
      onKeyDown={event=>{
        if (event.key==='Escape') {event.preventDefault();setOpen(false);return}
        if (!expanded) return
        if (event.key==='ArrowDown'||event.key==='ArrowUp') {
          event.preventDefault()
          setActive(index=>event.key==='ArrowDown'?(index+1)%places.length:(index<=0?places.length-1:index-1))
        }
        if (event.key==='Enter'&&active>=0) {event.preventDefault();choose(places[active])}
      }}/>
    <div className="trip-place-popup" hidden={!open||(!expanded&&!status)}>
      <ul id={id+'-places'} role="listbox" aria-label={label+' · Vorschläge'} hidden={!expanded}>
        {places.map((place,index)=><li key={index} id={id+'-place-'+index} role="option" aria-selected={active===index}
          onPointerDown={event=>event.preventDefault()} onClick={()=>choose(place)}>
          <strong>{place.name}</strong><small>{[place.kind==='island'?'Insel':'Stadt',place.region!==place.name?place.region:'',place.country].filter(Boolean).join(' · ')}</small>
        </li>)}
      </ul>
      {status&&<small role="status">{status}</small>}
      {expanded&&<small className="trip-place-attribution">Open-Meteo / GeoNames</small>}
    </div>
  </div>
}

const monthTitle=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric',timeZone:'UTC'})
const dayTitle=new Intl.DateTimeFormat('de-DE',{dateStyle:'full',timeZone:'UTC'})
const weekDays=['Mo','Di','Mi','Do','Fr','Sa','So']

export function TripDateField({name,label,value,change,min,max}:{name:string,label:string,value:string,change:(value:string)=>void,min?:string,max?:string}) {
  const id=useId()
  const trigger=useRef<HTMLButtonElement>(null)
  const [month,setMonth]=useState('')
  function close() {setMonth('');trigger.current?.focus()}
  const first=month+'-01'
  const offset=month?(new Date(first+'T00:00Z').getUTCDay()+6)%7:0
  const days=month?Number(shiftDay(monthAtOffset(month,1)+'-01',-1).slice(-2)):0
  return <div className="trip-date" onBlur={event=>{if (!event.currentTarget.contains(event.relatedTarget)) setMonth('')}}
    onKeyDown={event=>{if (month&&event.key==='Escape'){event.preventDefault();close()}}}>
    <label htmlFor={id}>{label}</label>
    <div className="trip-date-control">
      <DateInput id={id} name={name} required value={value} min={min} max={max} onChange={event=>change(event.currentTarget.value)}/>
      <button ref={trigger} type="button" className="icon-button" aria-label={label+' im Kalender wählen'} aria-expanded={Boolean(month)}
        aria-controls={id+'-calendar'} onClick={()=>setMonth(month?'':(value||min||dateInBerlin()).slice(0,7))}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="4" y="6" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v5m8-5v5"/>
        </svg>
      </button>
    </div>
    <section id={id+'-calendar'} className="trip-date-calendar card" aria-label={label+' Kalender'} hidden={!month}>
      {month&&<>
        <header>
          <button type="button" className="icon-button" aria-label="Vorheriger Kalendermonat" disabled={Boolean(min&&month<=min.slice(0,7))}
            onClick={()=>setMonth(monthAtOffset(month,-1))}>‹</button>
          <strong aria-live="polite">{monthTitle.format(new Date(first+'T00:00Z'))}</strong>
          <button type="button" className="icon-button" aria-label="Nächster Kalendermonat" disabled={Boolean(max&&month>=max.slice(0,7))}
            onClick={()=>setMonth(monthAtOffset(month,1))}>›</button>
        </header>
        <div className="trip-date-days">
          {weekDays.map(day=><small key={day}>{day}</small>)}
          {Array.from({length:offset},(_,index)=><span key={'blank'+index}/>)}
          {Array.from({length:days},(_,index)=>{
            const day=shiftDay(first,index)
            return <button key={day} type="button" disabled={Boolean(min&&day<min||max&&day>max)}
              aria-label={dayTitle.format(new Date(day+'T00:00Z'))} aria-pressed={day===value}
              onClick={()=>{change(day);close()}}>{index+1}</button>
          })}
        </div>
      </>}
    </section>
  </div>
}

export function TravelChoices({name,title,options,initial}:{name:string,title:string,options:readonly string[],initial:string}) {
  const selected=new Set(initial.split(/[,;·]+/u).map(part=>part.trim()).filter(Boolean))
  const labels=[...new Set([...options,...selected])]
  return <fieldset className="travel-choices">
    <legend>{title}</legend>
    <div>{labels.map(option=><label key={option}>
      <input type="checkbox" name={name} value={option} defaultChecked={selected.has(option)}/>{option}
    </label>)}</div>
  </fieldset>
}
