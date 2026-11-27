import {TripAddressField,TripDateField,TripPlaceField,TravelChoices} from './travel-fields.tsx'
import {DateInput,TimeInput} from './presentation.tsx'
import {MapExportPanel} from './travel-maps.tsx'
import {tripIntakeExtras} from '../runtime/trip-intake.ts'
import { mapProviders, mapRoute, type MapProvider } from '../runtime/trip-routes.ts'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { dateInBerlin, shiftDay } from '../runtime/values.ts'
import { currencyNames, destinationCurrency } from '../runtime/currency-codes.ts'
import { itemOccasion, outerWeight, outfitSlot, type OutfitSlot, type WardrobeItem } from '../runtime/outfit-types.ts'
import { bookingOutsideTrip, bookingKinds, packingCategories, tripPeriods, tripStates, type TravelWindows, type Trip, type TripChatPlan,
  type TripDraft, type TripPlan, type TripPreview, type TripSummary, type TripItem } from '../runtime/trip-types.ts'

type Api = <T>(path:string, payload?:object, timeout?:number)=>Promise<T>
type Patch = (value:object)=>Promise<void>
const modes={open:'Offen',rail:'Bahn',flight:'Flug',car:'Auto',bus:'Fernbus'} as const
const luggage={open:'Offen',backpack:'Nur Rucksack',cabin:'Handgepäck',checked:'Koffer'} as const
const statuses={confirmed:'Bestätigt',pending:'Offen',cancelled:'Storniert'} as const
const weekdays=[['Mo',1],['Di',2],['Mi',3],['Do',4],['Fr',5],['Sa',6],['So',0]] as const

function showDay(value:string) {
  return new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00Z'))
}
function useDismissOnOutside(open: boolean, ref: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (ref.current && event.target instanceof Node && !ref.current.contains(event.target)) {
        ref.current.open = false
      }
    }
    document.addEventListener('pointerdown', dismiss, true)
    return () => document.removeEventListener('pointerdown', dismiss, true)
  }, [open, ref])
}
function closeMenuOnEscape(event: KeyboardEvent<HTMLDetailsElement>) {
  if (event.key !== 'Escape' || !event.currentTarget.open) return
  event.preventDefault()
  event.currentTarget.open = false
  event.currentTarget.querySelector('summary')?.focus()
}
function ChevronIcon({ size = 12 }: { size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 4.5 6 7.5 9 4.5" />
  </svg>
}
function TripActionsMenu({ busy, showCalendar, onCalendar, onWeather, onRemove }: {
  busy: boolean, showCalendar: boolean, onCalendar: () => void, onWeather: () => void, onRemove: () => void,
}) {
  const menu = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(false)
  useDismissOnOutside(open, menu)
  const choose = (action: () => void) => {
    menu.current?.removeAttribute('open')
    action()
  }
  return <details className="travel-trip-menu" ref={menu} onToggle={event => setOpen(event.currentTarget.open)} onKeyDown={closeMenuOnEscape}>
    <summary aria-label="Reise-Optionen">
      <span>Aktionen</span>
      <ChevronIcon />
    </summary>
    <div className="travel-trip-menu-panel">
      {showCalendar ? <button type="button" onClick={() => choose(onCalendar)}>Zu Google Kalender hinzufügen</button> : null}
      <button type="button" disabled={busy} onClick={() => choose(onWeather)}>Wetter für Duftvorschlag abrufen</button>
      <button type="button" className="travel-danger-action" onClick={() => choose(onRemove)}>Reise entfernen</button>
    </div>
  </details>
}
function RouteLink({ destination, origin, mode, label='Route öffnen' }: {
  destination?:string,origin?:string,mode?:Exclude<TripDraft['transport'],'open'>,label?:string,
}) {
  const choice = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(false)
  useDismissOnOutside(open, choice)
  if (!destination?.trim()) return null
  return <div className="travel-route-actions">
    <a className="travel-route" href={mapRoute('google',destination,origin,mode)} target="_blank" rel="noreferrer">
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 14s4.5-4.1 4.5-7.5a4.5 4.5 0 1 0-9 0C3.5 9.9 8 14 8 14Z" />
        <circle cx="8" cy="6.5" r="1.5" />
      </svg>
      <span>{label}</span>
    </a>
    <details className="travel-route-choice" ref={choice} onToggle={event => setOpen(event.currentTarget.open)} onKeyDown={closeMenuOnEscape}>
      <summary aria-label={'Karten-App für „'+label+'“'}><ChevronIcon size={11} /></summary>
      <span className="card">
        {(Object.keys(mapProviders) as MapProvider[]).map(provider=><a key={provider}
          href={mapRoute(provider,destination,origin,mode)} target="_blank" rel="noreferrer"
          onClick={event=>event.currentTarget.closest('details')?.removeAttribute('open')}>{mapProviders[provider]}</a>)}
      </span>
    </details>
  </div>
}
function inDestination(place:string|undefined,destination:string) {
  if (!place) return undefined
  return place.includes(',') || place.toLowerCase().includes(destination.split(',')[0].trim().toLowerCase()) ? place : place+', '+destination
}
function dates(value:FormDataEntryValue|null) { return String(value??'').trim().split(/[,\s]+/u).filter(Boolean) }
function errorMessage(reason:unknown) { return reason instanceof Error ? reason.message : 'Die Änderung konnte nicht gespeichert werden.' }

const travelInterests=['Natur & Aussicht','Wandern','Strand & Meer','Kultur & Sehenswürdigkeiten','Essen & Trinken',
  'Museen','Sport & Aktivitäten','Erholung','Shopping','Nachtleben']
const travelExclusions=['Nachtleben','Lange Wanderungen','Menschenmengen','Touristische Hotspots',
  'Hohe Eintrittspreise','Wassersport','Lange Fahrten','Strandtage','Museen']

function NewTrip({api,plan,selected,initial,busy,onPreview}:{
  api:Api,plan?:TripChatPlan,selected?:{start:string,end:string},initial?:TripDraft,busy:boolean,onPreview:(draft:object)=>void,
}) {
  const priorDeparture=initial?.departure??plan?.departure
  const [home,setHome]=useState('')
  const [start,setStart]=useState(initial?.start??selected?.start??(plan?.intent==='draft'?plan.start??'':''))
  const [end,setEnd]=useState(initial?.end??selected?.end??(plan?.intent==='draft'?plan.end??'':''))
  const [error,setError]=useState('')
  const maxEnd=start?shiftDay(start,30):undefined
  const transport=initial?.transport??plan?.transport??'open'
  useEffect(()=>{
    if (priorDeparture) return
    let current=true
    void api<{fields:{location:string}}>('/profile').then(profile=>{
      if (current) setHome(profile.fields.location.slice(0,100))
    }).catch(()=>{})
    return ()=>{current=false}
  },[api,priorDeparture])

  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form=new FormData(event.currentTarget)
    const interests=form.getAll('interests').join(', ')
    const exclusions=form.getAll('exclusions').join(', ')
    if (interests.length>220||exclusions.length>220) {
      setError('Wähle weniger Interessen oder Ausschlüsse.')
      return
    }
    setError('')
    onPreview({...tripIntakeExtras(plan,initial),...Object.fromEntries(form),people:Number(form.get('people')),
      interests,exclusions,transport,stay:initial?.stay??plan?.stay??'',stayAddress:initial?.stayAddress??plan?.stayAddress??''})
  }
  return <form className="card travel-form travel-intake" onSubmit={submit}>
    <h2>Reise vorbereiten</h2>
    <fieldset disabled={busy} className="travel-intake-fields">
      <div className="travel-intake-row">
        <TripPlaceField name="destination" label="Reiseziel" initial={initial?.destination??plan?.destination??''}/>
        <TripPlaceField name="departure" label="Abreiseort" initial={priorDeparture||home}/>
      </div>
      <div className="travel-intake-row">
        <TripDateField name="start" label="Anreise" value={start} change={value=>{
          setStart(value)
          if (end&&value&&(end<value||end>shiftDay(value,30))) setEnd('')
        }}/>
        <TripDateField name="end" label="Abreise" value={end} change={setEnd} min={start||undefined} max={maxEnd}/>
      </div>
      <div className="travel-intake-row">
        <label>Reisende<input required type="number" min={1} max={30} name="people" defaultValue={initial?.people??plan?.people??1}/></label>
        <label>Tempo<select name="tempo" defaultValue={initial?.tempo??plan?.tempo??'balanced'}>
          <option value="relaxed">Entspannt</option><option value="balanced">Ausgewogen</option><option value="active">Aktiv</option>
        </select></label>
      </div>
      {transport==='flight'&&<label>Gepäck<select required name="luggage" defaultValue={initial?.luggage??plan?.luggage??'open'}>
        <option value="open" disabled>Gepäck auswählen</option>{Object.entries(luggage).filter(([key])=>key!=='open').map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>}
      <TravelChoices name="interests" title="Interessen" options={travelInterests} initial={initial?.interests??(plan?.intent==='draft'?plan.detail??'':'')}/>
      <TravelChoices name="exclusions" title="Ausschlüsse" options={travelExclusions} initial={initial?.exclusions??plan?.exclusions??''}/>
    </fieldset>
    {error&&<p role="alert">{error}</p>}
    <div className="actions"><button type="submit" className="primary" disabled={busy}>{busy?'Vorschau wird vorbereitet …':'Reisevorschau öffnen'}</button></div>
  </form>
}

function WindowFinder({ api, plan, entries, onChoose }: { api:Api, plan?:TripChatPlan, entries:TripSummary[], onChoose:(start:string,end:string)=>void }) {
  const [known,setKnown]=useState(false)
  const [result,setResult]=useState<TravelWindows>()
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const today=dateInBerlin()
  async function search(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data=new FormData(event.currentTarget)
    setBusy(true);setError('');setResult(undefined)
    try {
      setResult(await api('/trips/windows',{
        start:data.get('start'),end:data.get('end'),state:data.get('state')||null,maxLeave:Number(data.get('maxLeave')),
        weekdays:known?data.getAll('workday').map(Number):null,approved:dates(data.get('approved')),
        shiftWork:dates(data.get('shiftWork')),tripId:data.get('tripId')||undefined, includeCalendar:data.has('localCalendar'),confirm:true,
      }))
    } catch (reason) { setError(errorMessage(reason)) } finally {setBusy(false)}
  }
  return <section className="card travel-form">
    <h2>Freie Reisezeiträume</h2>
    <form onSubmit={event=>void search(event)}>
      <fieldset disabled={busy} className="travel-grid">
        <label>Suche ab<DateInput required name="start"  defaultValue={plan?.start??today} /></label>
        <label>Suche bis<DateInput required name="end"  defaultValue={plan?.end??shiftDay(today,42)} /></label>
        <label>Arbeitsort · Bundesland<select name="state" defaultValue="">
          <option value="">Ohne Feiertage</option>{Object.entries(tripStates).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Höchstens Urlaubstage<input required type="number" min={0} max={14} name="maxLeave" defaultValue={plan?.maxLeave??1} /></label>
        <label className="data-check"><input type="checkbox" checked={known} onChange={event=>setKnown(event.target.checked)} /> Arbeitstage angeben</label>
        {known ? <fieldset className="travel-days"><legend>Reguläre Arbeitstage</legend>{weekdays.map(([label,value])=>
          <label key={label} className="data-check"><input type="checkbox" name="workday" value={value} /> {label}</label>)}</fieldset>:null}
        <label>Genehmigter Urlaub<input name="approved" maxLength={1100} placeholder="YYYY-MM-DD, …" /></label>
        <label>Zusätzliche Schichten<input name="shiftWork" maxLength={1100} placeholder="YYYY-MM-DD, …" /></label>
        {entries.length ? <label>Unterkunft einer Reise abgleichen<select name="tripId" defaultValue="">
          <option value="">Ohne Unterkunft</option>{entries.map(entry=><option key={entry.id} value={entry.id}>{entry.destination} · {showDay(entry.start)}</option>)}
        </select></label>:null}
        <label className="data-check"><input type="checkbox" name="localCalendar" defaultChecked /> Lokale LifePilot-Termine berücksichtigen</label>
      </fieldset>
      <button className="primary" disabled={busy}>{busy?'Wird geprüft …':'Reisezeiträume finden'}</button>
    </form>
    {error ? <p role="alert">{error}</p>:null}
    {result ? <div className="travel-stack">
      {result.state ? <p>Feiertage für {tripStates[result.state]}. Kommunale Ausnahmen sind offen.</p>:null}
      {result.reason ? <p role="status">{result.reason}</p>:null}
      {result.status==='known' && !result.options.length ? <p role="status">Für diese Angaben wurde kein Zeitfenster gefunden.</p>:null}
      {result.options.map(option=><article key={option.start} className="travel-day">
        <strong>{showDay(option.start)} – {showDay(option.end)} · {option.days} Tage</strong>
        <p>Bereits frei: {option.freeReasons.map(day=>showDay(day.date)+' ('+day.reason+')').join(', ')}</p>
        <p>Noch einzureichen: {option.leave.length ? option.leave.map(showDay).join(', ') : '0 Urlaubstage'}</p>
        {option.holidays.length ? <p>Feiertage: {option.holidays.map(day=>day.name+' · '+showDay(day.date)).join(', ')}</p>:null}
        {result.stayName ? <p>{result.stayName} · {option.stayMatch ? ({fits:'Zeitraum passt',partial:'Teilweise abgedeckt',outside:'Außerhalb der Buchung'})[option.stayMatch] : 'Check-out für den Abgleich ergänzen'}</p>:null}
        {option.conflicts.length ? <p>Terminkonflikte: {option.conflicts.map(showDay).join(', ')}</p>:null}
        <button type="button" onClick={()=>onChoose(option.start,option.end)}>Zeitraum in Reise übernehmen</button>
      </article>)}
    </div>:null}
  </section>
}

function LocalItem({ item, mutate }: { item:TripItem,mutate?:Patch }) {
  return <label className="travel-item" data-done={item.done}>
    <input type="checkbox" checked={item.done} disabled={!mutate} onChange={event=>void mutate?.({kind:'toggle',item:item.id,done:event.target.checked})} />
    <span><strong>{item.text}</strong>{item.detail ? <small>{item.detail}</small>:null}</span>
  </label>
}

function addItem(event:FormEvent<HTMLFormElement>,mutate:Patch,kind:'task'|'pack'|'activity'|'booking',date?:string) {
  event.preventDefault()
  const form=event.currentTarget
  const fields=Object.fromEntries(new FormData(form))
  const value=kind==='booking' ? {kind,booking:fields} : {...fields,kind,date,...(kind==='pack' && {quantity:Number(fields.quantity)})}
  void mutate(value).then(()=>{
    form.reset()
    form.closest('details.travel-add-activity')?.removeAttribute('open')
  }).catch(()=>{})
}

type Rate={from:string,to:string,rate:number,date:string,source:string,fetched:string}
const money=(value:number,currency:string)=>new Intl.NumberFormat('de-DE',{style:'currency',currency,maximumFractionDigits:currency==='JPY'||currency==='KRW'?0:2}).format(value)

/** Rechner zwischen Heimatwährung (Euro) und Landeswährung. Kurs beim Öffnen, auf Wunsch neu abrufen. */
function CurrencyConverter({api,destination}:{api?:Api,destination:string}) {
  const foreign=destinationCurrency(destination)
  const [pair,setPair]=useState<[string,string]>(['EUR',foreign])
  const [amount,setAmount]=useState('100')
  const [rate,setRate]=useState<Rate>()
  const [state,setState]=useState<'idle'|'loading'|'error'>('idle')
  const storage='lifepilot-rate-EUR'+foreign
  async function load(refresh=false) {
    if (!api || foreign==='EUR') return
    setState('loading')
    try {
      const value=await api<Rate>(`/currency?from=EUR&to=${foreign}${refresh?'&refresh=1':''}`)
      setRate(value);localStorage.setItem(storage,JSON.stringify(value));setState('idle')
    } catch {setState('error')}
  }
  useEffect(()=>{
    const saved=localStorage.getItem(storage)
    if (saved) try {setRate(JSON.parse(saved) as Rate)} catch {/* Neu laden. */}
    void load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[foreign])
  if (foreign==='EUR') return <section className="travel-currency"><strong>Währung</strong><p>Am Ziel gilt ebenfalls der Euro.</p></section>
  const value=Number(amount.replace(',','.'))
  const factor=rate ? (pair[0]==='EUR' ? rate.rate : 1/rate.rate) : undefined
  return <section className="travel-currency" aria-label="Währungsrechner">
    <header><strong>Währungsrechner</strong>
      <button type="button" className="travel-small-button" disabled={state==='loading'} onClick={()=>void load(true)}>{state==='loading'?'Lädt …':'Aktualisieren'}</button></header>
    <div className="travel-currency-row">
      <label><span>Betrag</span><input inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)} aria-label={'Betrag in '+pair[0]}/></label>
      <span className="travel-currency-code" title={currencyNames[pair[0]]}>{pair[0]}</span>
      <button type="button" className="travel-swap" aria-label="Währungen tauschen" onClick={()=>setPair(([a,b])=>[b,a])}>⇄</button>
      <output aria-live="polite">{factor && Number.isFinite(value) ? money(value*factor,pair[1]) : '–'}</output>
    </div>
    <small>{rate ? `1 ${pair[0]} = ${(pair[0]==='EUR'?rate.rate:1/rate.rate).toLocaleString('de-DE',{maximumFractionDigits:4})} ${pair[1]} · Stand ${showDay(rate.date)} · ${rate.source}` :
      state==='error' ? 'Kurs nicht abrufbar. Versuche es mit „Aktualisieren“ erneut.' : 'Kurs wird geladen …'}</small>
  </section>
}

function Stepper({value,label,onChange,disabled}:{value:number,label:string,onChange:(value:number)=>void,disabled?:boolean}) {
  return <div className="travel-stepper" role="group" aria-label={'Menge '+label}>
    <button type="button" disabled={disabled||value<=1} aria-label="Weniger" onClick={()=>onChange(value-1)}>−</button>
    <span aria-live="polite">{value}</span>
    <button type="button" disabled={disabled||value>=99} aria-label="Mehr" onClick={()=>onChange(value+1)}>+</button>
  </div>
}

// Packstücke, bei denen eine Menge keinen Sinn ergibt, zeigen keinen Zähler.
const countable=(entry:TripPlan['packing'][number])=>entry.category==='Kleidung' || /parfüm|parfum|kontaktlinsen|socken|unterwäsche/iu.test(entry.text) || entry.quantity>1
const packSlots:[RegExp,OutfitSlot][]=[[/oberteil|t-?shirt|shirt|langarm/iu,'base'],[/pullover|strick/iu,'knit'],[/hose/iu,'bottom'],
  [/jacke|mantel/iu,'outer'],[/schuh/iu,'shoes'],[/abends/iu,'outer']]
function wardrobeTips(entry:TripPlan['packing'][number],wardrobe:WardrobeItem[],temperature?:number) {
  const slot=packSlots.find(([pattern])=>pattern.test(entry.text))?.[1]
  if (!slot || entry.category!=='Kleidung') return []
  const pieces=wardrobe.filter(item=>!item.orderState && !item.saleState && outfitSlot(item)===slot)
  const wanted=/winter/iu.test(entry.text)?'winter':/regen/iu.test(entry.text)?'rain':/übergang/iu.test(entry.text)?'transition':undefined
  const fitting=slot==='outer' && wanted ? pieces.filter(item=>outerWeight(item)===wanted) : pieces
  const evening=/abends/iu.test(entry.text)
  return fitting.filter(item=>!evening || /büro|dinner|abends/iu.test(itemOccasion(item)))
    .filter(()=>temperature===undefined || true).slice(0,4)
}
function PackRow({entry,mutate,busy,wardrobe,temperature}:{entry:TripPlan['packing'][number],mutate?:Patch,busy?:boolean,wardrobe:WardrobeItem[],temperature?:number}) {
  const suggestions=/^Vorschläge: /u.exec(entry.detail) ? entry.detail.slice(12).split('. ')[0].split(' · ') : []
  const detail=suggestions.length ? entry.detail.slice(entry.detail.indexOf('. ')+2) : entry.detail
  const pieces=wardrobeTips(entry,wardrobe,temperature)
  return <div className="travel-pack-row" data-done={entry.done||undefined}>
    <label className="travel-item">
      <input type="checkbox" checked={entry.done} disabled={!mutate} onChange={event=>void mutate?.({kind:'toggle',item:entry.id,done:event.target.checked}).catch(()=>{})}/>
      <span><strong>{entry.text}</strong>{detail ? <small>{detail}</small> : null}</span>
    </label>
    {countable(entry) ? mutate ? <Stepper value={entry.quantity} label={entry.text} disabled={busy}
      onChange={quantity=>void mutate({kind:'quantity',item:entry.id,quantity}).catch(()=>{})}/> : <span className="travel-qty">× {entry.quantity}</span> : null}
    {suggestions.length || pieces.length ? <ul className="travel-pack-suggestions" aria-label="Vorschläge aus deinem Bestand">
      {suggestions.map(name=><li key={name}>{name}</li>)}
      {pieces.map(item=><li key={item.id} title={itemOccasion(item)}>{item.name.length>42?item.name.slice(0,40)+' …':item.name}<small>{itemOccasion(item)}</small></li>)}
    </ul> : null}
  </div>
}

function TripGuide({ plan,mutate,busy,api,wardrobe=[] }: { plan:TripPlan,mutate?:Patch,busy?:boolean,api?:Api,wardrobe?:WardrobeItem[] }) {
  const [section,setSection]=useState<'Tagesplan'|'Tipps'|'Vorbereitung'|'Buchungen'>('Tagesplan')
  const {arrival,draft}=plan
  const confirmed=plan.bookings.filter(entry=>entry.kind==='stay' && entry.status==='confirmed')
  const lodging=draft.stayAddress || (confirmed.length===1 ? confirmed[0].location || confirmed[0].name : '') || draft.stay
  return <div className="travel-stack">
    <section className="card travel-intro">
      <h2>{plan.draft.destination}</h2><p>{showDay(plan.draft.start)} – {showDay(plan.draft.end)} · {plan.days.length} Tage · {plan.draft.people} {plan.draft.people===1?'Person':'Personen'}</p>
      <p>{plan.overview}</p>
      {mutate ? <details className="travel-inline-details"><summary>Reisezeitraum ändern</summary>
        <form key={draft.start+draft.end} className="travel-compact-form" onSubmit={event=>{
          event.preventDefault()
          const details=event.currentTarget.closest('details')
          const fields=new FormData(event.currentTarget)
          void mutate({kind:'dates',start:fields.get('start'),end:fields.get('end')}).then(()=>details?.removeAttribute('open')).catch(()=>{})
        }}><fieldset disabled={busy} className="travel-date-row">
          <label>Anreise<DateInput name="start" defaultValue={draft.start} required /></label>
          <label>Abreise<DateInput name="end" defaultValue={draft.end} required /></label>
          <button type="submit">Speichern</button>
        </fieldset></form>
      </details>:null}
      {plan.bookings.some(entry=>bookingOutsideTrip(entry,draft)) ?
        <p role="status">Mindestens eine Buchung liegt außerhalb des neuen Reisezeitraums. Prüfe die markierten Buchungen.</p>:null}
      <div className="travel-intro-columns">
        <div className="travel-stack">
          <strong>Anreise{arrival.mode ? ' · '+modes[arrival.mode] : ''}</strong>
          <p>Ab {draft.departure}. {arrival.reason}</p>
          {arrival.mode!=='flight' ? <RouteLink origin={draft.departure} destination={draft.destination}
            mode={arrival.mode??undefined} label="Anreiseroute öffnen" /> : null}
          {arrival.mode==='flight' || arrival.mode===null ? <>
            {arrival.departureAirport ? <div><p>Abflug prüfen: {arrival.departureAirport}</p>
              <RouteLink origin={draft.departure} destination={arrival.departureAirport} label="Zum Abflughafen" /></div> : null}
            {arrival.arrivalAirport ? <div><p>Ankunft prüfen: {arrival.arrivalAirport}</p>
              <RouteLink origin={arrival.arrivalAirport} destination={inDestination(lodging,draft.destination) ?? draft.destination}
                label="Vom Flughafen zum Ziel" /></div> : null}
          </> : null}
          {arrival.mode==='flight' ? <small>Flugverbindungen für die Reisedaten prüfen.</small> : null}
        </div>
        <div className="travel-stack travel-stay-col"><strong>Unterkunft</strong><p>{draft.stay || (confirmed.length===1 ? confirmed[0].name : '') || 'Noch offen'}</p>
          {draft.stayAddress ? <p>{draft.stayAddress}</p> : null}
          <RouteLink destination={inDestination(lodging,draft.destination)} label="Route zur Unterkunft" />
          {mutate ? <details className="travel-inline-details"><summary>Unterkunft bearbeiten</summary><form className="travel-compact-form" onSubmit={event=>{
            event.preventDefault()
            const details=event.currentTarget.closest('details')
            const data=new FormData(event.currentTarget)
            void mutate({kind:'stay',text:data.get('text'),address:data.get('address')}).then(()=>details?.removeAttribute('open')).catch(()=>{})
          }}><fieldset disabled={busy} className="travel-stay-row">
            <label>Name<input name="text" maxLength={150} defaultValue={draft.stay} placeholder="Hotel oder Apartment" /></label>
            <TripAddressField name="address" label="Adresse" initial={draft.stayAddress} destination={draft.destination}
              placeholder="Adresse suchen …" fillSiblingName="text" />
            <button type="submit">Speichern</button>
          </fieldset></form></details> : null}
          <CurrencyConverter api={api} destination={draft.destination} />
        </div>
      </div>
    </section>
    <nav className="travel-guide-tabs actions" aria-label="Reiseabschnitte">
      {(['Tagesplan','Tipps','Vorbereitung','Buchungen'] as const).map(label=>
        <button type="button" aria-pressed={section===label} onClick={()=>setSection(label)} key={label}>{label}</button>)}
    </nav>
    {section==='Tagesplan' ? <>
      {plan.guide==='generated' ? <small>Reisevorschlag. Öffnungszeiten und Verfügbarkeit sind nicht live geprüft.</small> : null}
    <section className="card travel-stack"><h2>Tagesplan</h2>
      {plan.days.map((day,index)=><details key={day.date} className="travel-day" open={index===0 ? true : undefined}>
        <summary>{showDay(day.date)} · {day.title}</summary>
        {plan.bookings.filter(entry=>entry.date===day.date&&entry.status==='confirmed').map(entry=><div key={entry.id}>
          <p><strong>{entry.time||'Zeit offen'}{entry.time && entry.timezone?' '+entry.timezone:''} · {entry.name}</strong> · {bookingKinds[entry.kind]} · {entry.location}</p>
          <RouteLink origin={entry.origin} destination={entry.kind==='transport' ? entry.location : inDestination(entry.location,draft.destination)} />
        </div>)}
        {tripPeriods.filter(period=>day.activities.some(activity=>activity.period===period)).map(period=><div key={period} className="travel-period"><strong>{period}</strong>
          {day.activities.filter(entry=>entry.period===period).map(entry=><div className="travel-activity" key={entry.id}>
          <p>{entry.text}</p><RouteLink origin={plan.bookings.find(stay=>stay.kind==='stay' && stay.status==='confirmed' && stay.date<=day.date && (stay.until??stay.date)>=day.date)?.location || draft.stayAddress}
            destination={inDestination(entry.place,draft.destination)} />
          {mutate ? <details className="travel-inline-details"><summary>Tagespunkt bearbeiten</summary>
            <div className="travel-inline-panel travel-editor-stack">
              <form onSubmit={event=>{
                event.preventDefault()
                const details=event.currentTarget.closest('details')
                const data=new FormData(event.currentTarget)
                void mutate({kind:'activity-place',item:entry.id,place:data.get('place')}).then(()=>details?.removeAttribute('open')).catch(()=>{})
              }}><fieldset disabled={busy} className="travel-place-edit">
                <TripAddressField name="place" label="Ort oder Adresse" initial={entry.place} destination={draft.destination}
                  placeholder="Sehenswürdigkeit oder Adresse suchen …" />
                <button type="submit">Ort speichern</button>
              </fieldset></form>
              <form onSubmit={event=>{
                event.preventDefault()
                const data=new FormData(event.currentTarget)
                void mutate({kind:'move',item:entry.id,date:data.get('date'),period:data.get('period')}).catch(()=>{})
              }}><fieldset disabled={busy} className="travel-move-edit">
                <label>Verschieben auf<select name="date" defaultValue={day.date}>
                  {plan.days.map(option=><option key={option.date} value={option.date}>{showDay(option.date)}</option>)}
                </select></label>
                <label>Zeitblock<select name="period" defaultValue={entry.period}>{tripPeriods.map(value=><option key={value}>{value}</option>)}</select></label>
                <button type="submit">Verschieben</button>
              </fieldset></form>
            </div>
          </details>:null}</div>)}
        </div>)}
        {mutate ? <details className="travel-add-activity">
          <summary className="travel-add-summary">+ Tagespunkt hinzufügen</summary>
          <form className="travel-inline-panel" onSubmit={event=>addItem(event,mutate,'activity',day.date)}><fieldset disabled={busy} className="travel-activity-form">
            <label>Eigener Tagespunkt<input name="text" required maxLength={150} placeholder="z. B. Kathedrale besuchen" /></label>
            <TripAddressField name="place" label="Ort oder Adresse (optional)" initial="" destination={draft.destination}
              placeholder="z. B. Name der Sehenswürdigkeit oder Adresse" />
            <label>Zeitblock<select name="period">{tripPeriods.map(value=><option key={value}>{value}</option>)}</select></label>
            <button type="submit" className="primary">Hinzufügen</button>
          </fieldset></form>
        </details>:null}
      </details>)}
    </section>
    </> : null}
    {section==='Tagesplan' && Boolean(plan.unplacedDays?.length) ? <details className="card">
      <summary>Tagespunkte außerhalb des neuen Zeitraums</summary>
      {plan.unplacedDays?.map(day=><div key={day.date}><strong>{day.title}</strong>
        <ul>{day.activities.map(entry=><li key={entry.id}>{entry.text}</li>)}</ul></div>)}
    </details>:null}
    {section==='Buchungen' ? <section className="card travel-stack"><h2>Buchungen</h2>
      {plan.bookings.length?plan.bookings.map(entry=><article key={entry.id} className="travel-day">
        <strong>{entry.name}</strong>
        {bookingOutsideTrip(entry,draft) ?
          <p><strong>Buchung außerhalb des Reisezeitraums</strong></p>:null}
        <p>{bookingKinds[entry.kind]} · {showDay(entry.date)}{entry.until ? ' – '+showDay(entry.until):''} {entry.time} {entry.timezone} · {statuses[entry.status]}</p>
        {entry.location||entry.reference ? <p>{[entry.location,entry.reference].filter(Boolean).join(' · ')}</p>:null}
        {entry.status!=='cancelled' ? <RouteLink origin={entry.origin} destination={entry.kind==='transport' ? entry.location : inDestination(entry.location,draft.destination)} /> : null}
        {mutate ? <label>Status<select value={entry.status} disabled={busy} onChange={event=>
          void mutate({kind:'booking-status',item:entry.id,status:event.target.value}).catch(()=>{})}>
          {Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></label>:null}
      </article>):<p>Noch keine Buchung zugeordnet.</p>}
      {mutate ? <details className="travel-day"><summary>Buchung zuordnen</summary>
        <form onSubmit={event=>addItem(event,mutate,'booking')}><fieldset disabled={busy} className="travel-grid">
          <label>Art<select name="kind">{Object.entries(bookingKinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          <label>Anbieter oder Buchung<input name="name" required maxLength={120} /></label>
          <label>Tag<DateInput required name="date"  min={plan.draft.start} max={plan.draft.end} defaultValue={plan.draft.start} /></label>
          <label>Check-out für Unterkunft<DateInput name="until"  min={plan.draft.start} max={plan.draft.end} /></label>
          <label>Ortszeit<TimeInput name="time" /></label>
          <label>Zeitzone (optional)<input name="timezone" maxLength={70} placeholder="z. B. Europe/Lisbon" /></label>
          <TripAddressField name="location" label="Zielort oder Adresse" initial="" destination={draft.destination} />
          <TripAddressField name="origin" label="Startort der Route (optional)" initial="" destination={draft.destination} />
          <label>Belegverweis (optional)<input name="reference" maxLength={100} /></label>
          <label>Status<select name="status">{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          <button className="primary">Buchung zuordnen</button>
        </fieldset></form>
      </details>:null}
    </section>
    : null}
    {section==='Vorbereitung' ? <><section className="card travel-stack"><h2>Checkliste</h2><p>{[...plan.checklist, ...plan.extra].filter(entry=>entry.done).length} von {plan.checklist.length + plan.extra.length} Punkten erledigt</p>
      {plan.checklist.length + plan.extra.length ? <progress aria-label="Reisevorbereitung" max={plan.checklist.length + plan.extra.length}
        value={[...plan.checklist, ...plan.extra].filter(entry=>entry.done).length} /> : null}
      <fieldset disabled={busy}>{[...plan.checklist,...plan.extra].map(entry=><LocalItem item={entry} key={entry.id} mutate={mutate ? value=>mutate(value).catch(()=>{}) : undefined} />)}</fieldset>
      {mutate ? <details className="travel-add-activity travel-add-inline"><summary>+ Eigenen Punkt hinzufügen</summary>
        <form onSubmit={event=>addItem(event,mutate,'task')}><fieldset className="travel-inline-form" disabled={busy}>
          <input required name="text" maxLength={120} placeholder="z. B. Mietwagen bestätigen" aria-label="Eigener Punkt" />
          <button className="travel-small-button primary">Hinzufügen</button>
        </fieldset></form></details>:null}
    </section>
    <section className="card travel-stack"><h2>Packliste</h2><p>{plan.packingWeather}</p>
      {plan.packing.length ? <div className="travel-pack-progress">
        <label htmlFor="travel-pack-progress">Eingepackt {plan.packing.filter(item=>item.done).length} von {plan.packing.length}</label>
        <progress id="travel-pack-progress" max={plan.packing.length} value={plan.packing.filter(item=>item.done).length}/>
      </div> : null}
      {packingCategories.filter(category=>plan.packing.some(entry=>entry.category===category)).map(category=>{
        const rows=plan.packing.filter(entry=>entry.category===category)
        return <details key={category} className="travel-pack-group" open>
          <summary><span>{category}</span><span className="travel-pack-count">{rows.filter(entry=>entry.done).length}/{rows.length}</span></summary>
          <div className="travel-pack-list">{rows.map(entry=><PackRow key={entry.id} entry={entry} mutate={mutate} busy={busy}
            wardrobe={wardrobe} temperature={plan.packingTemperature}/>)}</div>
        </details>
      })}
      {mutate ? <details className="travel-add-activity travel-add-inline"><summary>+ Eigenen Gegenstand hinzufügen</summary>
        <form onSubmit={event=>addItem(event,mutate,'pack')}><fieldset disabled={busy} className="travel-inline-form">
          <input name="text" required maxLength={120} placeholder="z. B. Reiseadapter" aria-label="Eigener Gegenstand" />
          <select name="category" aria-label="Kategorie">{packingCategories.map(category=><option key={category}>{category}</option>)}</select>
          <input name="quantity" type="number" required defaultValue={1} min={1} max={99} aria-label="Menge" className="travel-qty-input" />
          <button className="travel-small-button primary">Hinzufügen</button>
        </fieldset></form></details>:null}
    </section>
    </> : null}
    {section==='Tipps' ? <section className="card travel-stack"><h2>Tipps</h2>
      {plan.tips.map(tip=><details key={tip.topic} className="travel-day"><summary>{tip.topic}{tip.status==='unvollständig'?' · Offen':''}</summary>
        {tip.content.sections.map(section=><div key={section.title} className="travel-tip-section">
          {section.title!==tip.topic ? <h3>{section.title}</h3> : null}
          <ul className={'travel-tip-items '+(section.style==='phrases'?'travel-tip-phrases':'')}>
            {section.items.map(item=><li key={item.title}>
              <div><strong>{item.title}</strong>{item.pronunciation ? <small>{' ['+item.pronunciation.replace(/^\[|\]$/gu,'')+']'}</small>:null}
                {item.detail ? <p>{item.detail}</p>:null}</div>
              {item.translation ? <span className="travel-translation">{item.translation}</span>:null}
            </li>)}
          </ul>
        </div>)}
      </details>)}
    </section>
    : null}
  </div>
}

export function TravelPlanner({ api, plan, handoff, initialId, cloudGuide, onSelect }: {
  api:Api, plan?:TripChatPlan,handoff?:string, initialId?:string, cloudGuide:boolean, onSelect:(id:string|undefined)=>void,
}) {
  const [startId]=useState(initialId)
  const [view,setView]=useState<'list'|'new'|'windows'|'trip'|'preview'>(plan?.intent==='windows'?'windows':plan?.intent==='draft'?'new':initialId?'trip':'list')
  const [entries,setEntries]=useState<TripSummary[]>([])
  const [loadingEntries,setLoadingEntries]=useState(true)
  const [current,setCurrent]=useState<Trip>()
  const [preview,setPreview]=useState<TripPreview>()
  const [calendarOffer,setCalendarOffer]=useState(false)
  const [removing,setRemoving]=useState(false)
  const [mapOpen,setMapOpen]=useState(false)
  const [wardrobe,setWardrobe]=useState<WardrobeItem[]>([])
  useEffect(()=>{void api<{wardrobe:WardrobeItem[]}>('/outfits').then(value=>setWardrobe(value.wardrobe)).catch(()=>{})},[api])
  function showPreview(preview:TripPreview) {
    localStorage.setItem('lifepilot-trip-draft',preview.id)
    setPreview(preview);setView('preview')
  }
  useEffect(()=>{
    const draftId=localStorage.getItem('lifepilot-trip-draft')
    if (!draftId || plan || startId) return
    let active=true
    void api<TripPreview>('/trips/draft/'+encodeURIComponent(draftId)).then(draft=>{
      if (active) showPreview(draft)
    }).catch(()=>{})
    return ()=>{active=false}
  },[api,plan,startId])
  const [window,setWindow]=useState<{start:string,end:string}>()
  /** Verwirft die entworfene Reise. Nur dieser Weg löscht die Vorschau, Wechsel in andere Bereiche lassen sie offen. */
  function discardPreview() {
    localStorage.removeItem('lifepilot-trip-draft')
    setPreview(undefined);setWindow(undefined);setError('');setView('new')
  }
  const [busy,setBusy]=useState(false)
  const [feedback,setFeedback]=useState('')
  const [error,setError]=useState('')
  useEffect(()=>{
    if (busy || !preview?.generating) return
    const timer=globalThis.setInterval(()=>{
      void api<TripPreview>('/trips/draft/'+encodeURIComponent(preview.id)).then(setPreview).catch(()=>{})
    },2500)
    return ()=>globalThis.clearInterval(timer)
  },[api,busy,preview?.id,preview?.generating])
  useEffect(()=>{
    let active=true
    void api<TripSummary[]>('/trips').then(async items=>{
      if (!active) return
      setEntries(items)
      const matched=plan?.destination ? items.filter(entry=>entry.destination.toLowerCase().includes(plan.destination!.toLowerCase())):[]
      const target=matched.length===1 ? matched[0].id : !plan?.destination ? startId:undefined
      if (target && (!plan || ['open','booking','change'].includes(plan.intent))) {
        const saved=await api<Trip>('/trips/'+target)
        if (active) {setCurrent(saved);setView('trip');onSelect(target)}
      } else if (active && (view==='trip'||matched.length>1)) {
        setView('list');setFeedback('Wähle die Reise aus der Liste aus.')
      }
    }).catch(reason=>{if(active)setError(errorMessage(reason))}).finally(()=>{if(active)setLoadingEntries(false)})
    return ()=>{active=false}
  // The initial selection is frozen for this chat handoff.
  },[api,startId,onSelect,plan])
  useEffect(()=>{
    if (!handoff || plan?.intent!=='draft' || !plan.destination || !plan.departure || !plan.start || !plan.end ||
      plan.transport==='flight' && (!plan.luggage || plan.luggage==='open')) return
    let active=true
    const [run,turn]=handoff.split(':')
    setBusy(true)
    void api<{preview?:TripPreview,saved?:Trip}>('/trips/chat-preview',{run,turn:Number(turn),confirm:true})
      .then(result=>{
        if (!active) return
        if (result.saved) {setCurrent(result.saved);onSelect(result.saved.id);setView('trip')}
        else if (result.preview) {showPreview(result.preview)}
      })
      .catch(reason=>{if(active)setError(errorMessage(reason))})
      .finally(()=>{if(active)setBusy(false)})
    return ()=>{active=false}
  },[api,handoff,onSelect,plan])
  async function perform(action:()=>Promise<void>) {
    setBusy(true);setError('');setFeedback('')
    try { await action() } catch (reason) {setError(errorMessage(reason));throw reason} finally{setBusy(false)}
  }
  const fire=(action:()=>Promise<void>)=>void perform(action).catch(()=>{})
  function startGuide(draft:TripPreview) {
    if (busy || draft.generating) return
    fire(async()=>setPreview(await api<TripPreview>('/trips/guide',{preview:draft.id,confirm:true},150000)))
  }
  function open(id:string) {
    fire(async()=>{setCurrent(await api('/trips/'+id));onSelect(id);setRemoving(false);setCalendarOffer(false);setView('trip')})
  }
  async function change(patch:object) {
    if (!current) return
    await perform(async()=>{
      setCurrent(await api('/trips/change',{tripId:current.id,revision:current.revision,patch,confirm:true},45000))
      setEntries(await api('/trips'))
      setFeedback('Änderung gespeichert.')
    })
  }
  return <div className="travel-stack travel-space">
    <nav className="actions" aria-label="Urlaubsplaner">
      <button type="button" disabled={busy} aria-pressed={view==='list'||view==='trip'} className={view==='list'||view==='trip'?'primary':undefined} onClick={()=>{setView('list');setError('');onSelect(undefined)}}>Meine Reisen</button>
      <button type="button" disabled={busy} aria-pressed={view==='new'||view==='preview'} className={view==='new'||view==='preview'?'primary':undefined} onClick={()=>{setView(preview?'preview':'new');setError('');if(!preview)setWindow(undefined);onSelect(undefined)}}>Neue Reise</button>
      <button type="button" disabled={busy} aria-pressed={view==='windows'} className={view==='windows'?'primary':undefined} onClick={()=>{setView('windows');setError('')}}>Freie Reisezeiträume</button>
    </nav>
    {error ? <p role="alert" className="banner">{error}</p>:null}
    {feedback ? <p role="status" className="banner">{feedback}</p>:null}
    {view==='list' ? <section className="card travel-stack"><h2>Meine Reisen</h2>
      {loadingEntries ? <p role="status">Reisen werden geladen …</p> : !entries.length ? <p>Hier erscheinen laufende und anstehende Reisen.</p> : (['ongoing','upcoming'] as const).map(status=>{
        const group=entries.filter(entry=>entry.status===status)
        if (!group.length) return null
        return <section className="travel-stack" key={status}><h3>{status==='ongoing'?'Laufend':'Anstehend'}</h3>
          {group.map(entry=><button type="button" className="travel-card travel-trip-row" key={entry.id} onClick={()=>open(entry.id)}>
            <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="4" y="7" width="16" height="12" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-11 5h16"/>
            </svg>
            <span><strong>{entry.destination}</strong><small>{showDay(entry.start)} – {showDay(entry.end)}</small></span><span aria-hidden="true">›</span>
          </button>)}</section>
      })}
    </section>:null}
    {view==='windows' ? <WindowFinder api={api} entries={entries} plan={plan?.intent==='windows'?plan:undefined}
      onChoose={(start,end)=>{setWindow({start,end});setPreview(undefined);setView('new');onSelect(undefined)}} />:null}
    {view==='new' ? <NewTrip key={window?.start ?? 'new'} api={api} plan={plan} selected={window} initial={preview?.plan.draft} busy={busy} onPreview={draft=>
      fire(async()=>{
        showPreview(await api<TripPreview>('/trips/preview',{draft,confirm:true}))
      })} />:null}
    {view==='preview' && preview ? <>
      {cloudGuide && !preview.plan.guide ? <section className="card travel-guide-status" aria-live="polite">
        {busy || preview.generating ? <div className="loading" role="status"><span>Reiseguide wird erstellt …</span><progress aria-label="Reiseguide wird erstellt" /></div> : <>
          <h2>Reisevorschau für {preview.plan.draft.destination}</h2>
          <p>{showDay(preview.plan.draft.start)} – {showDay(preview.plan.draft.end)} · ab {preview.plan.draft.departure} · {preview.plan.draft.people} {preview.plan.draft.people===1?'Person':'Personen'}</p>
          {preview.plan.draft.transport!=='open'&&<p>Anreise: {modes[preview.plan.draft.transport]}{preview.plan.draft.luggage!=='open' ? ' · '+luggage[preview.plan.draft.luggage] : ''}</p>}
          {preview.plan.draft.brief&&<details><summary>Übernommene Reisewünsche</summary><p>{preview.plan.draft.brief}</p></details>}
          <p>Pilot recherchiert nach deiner Freigabe und erstellt daraus den Reiseguide.</p>
          <div className="actions"><button type="button" className="primary" onClick={()=>startGuide(preview)}>Reisesuche akzeptieren</button>
            <button type="button" onClick={()=>setView('new')}>Angaben ändern</button>
            <button type="button" onClick={discardPreview}>Abbrechen</button></div>
        </>}
      </section> : <>
      <div className="card actions"><strong>Reisevorschau</strong><button type="button" className="primary" disabled={busy}
        onClick={()=>fire(async()=>{
          const saved=await api<Trip>('/trips/save',{preview:preview.id,confirm:true})
          setCurrent(saved);onSelect(saved.id);setView('trip');setCalendarOffer(!saved.googleCalendar)
          localStorage.removeItem('lifepilot-trip-draft')
          setEntries(await api('/trips'));setFeedback('Reise und privater LifePilot-Kalenderblock gespeichert.')
        })}>Reise speichern</button><button type="button" disabled={busy} onClick={()=>setView('new')}>Angaben ändern</button>
        <button type="button" disabled={busy} onClick={discardPreview}>Abbrechen</button></div>
      <TripGuide plan={preview.plan} api={api} wardrobe={wardrobe} />
      </>}
    </>:null}
    {view==='trip' && current ? <>
      <div className="travel-trip-bar">
        <button type="button" className="quiet travel-back" onClick={()=>{setView('list');onSelect(undefined)}}>← Meine Reisen</button>
        <div className="travel-bar-actions">
        <button type="button" className="travel-small-button" aria-pressed={mapOpen} onClick={()=>setMapOpen(open=>!open)}>Für Google My Maps exportieren</button>
        <TripActionsMenu
          busy={busy}
          showCalendar={!current.googleCalendar}
          onCalendar={()=>setCalendarOffer(true)}
          onWeather={()=>fire(async()=>{
            const updated=await api<Trip>('/trips/packing-weather',{tripId:current.id,confirm:true},25000)
            setCurrent(updated);setFeedback('Der Duftvorschlag berücksichtigt jetzt das Wetter am Reiseziel.')
          })}
          onRemove={()=>setRemoving(true)}
        />
        </div>
      </div>
      {mapOpen ? <MapExportPanel api={api} trip={current} onClose={()=>setMapOpen(false)} /> : null}
      {(calendarOffer || current.googleCalendar==='pending') ? <section className="card travel-stack">
        <p>Soll ich den privaten ganztägigen Reiseblock auch in Google Kalender eintragen?</p>
        <div className="actions">
          <button type="button" className="primary" disabled={busy} onClick={()=>fire(async()=>{
            setCurrent(await api<Trip>('/trips/google',{tripId:current.id,confirm:true},45000))
            setCalendarOffer(false);setFeedback('Der Reiseblock steht jetzt auch in Google Kalender.')
          })}>Ja, in Google Kalender eintragen</button>
          {!current.googleCalendar ? <button type="button" disabled={busy} onClick={()=>setCalendarOffer(false)}>Nur LifePilot</button> : null}
        </div>
      </section> : null}
      {removing ? <section className="card travel-stack">
        <p>Reise und zugehörigen Kalenderblock {current.googleCalendar?'auch aus Google Kalender ':''}entfernen?</p>
        <div className="actions">
          <button type="button" disabled={busy} onClick={()=>fire(async()=>{
            await api('/trips/remove',{tripId:current.id,confirm:true},45000)
            setCurrent(undefined);onSelect(undefined);setView('list');setRemoving(false);setCalendarOffer(false)
            setEntries(await api('/trips'));setFeedback('Reise und Kalenderblock entfernt.')
          })}>Reise und Kalenderblock entfernen</button>
          <button type="button" disabled={busy} onClick={()=>setRemoving(false)}>Abbrechen</button>
        </div>
      </section> : null}
      <TripGuide key={current.id} plan={current} mutate={change} busy={busy} api={api} wardrobe={wardrobe} />
    </>:null}
  </div>
}
