import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { fragranceProfiles, fragranceOccasions, fragranceSeasons, fragranceTimes, saleConditions,
  type Fragrance, type FragranceDraft, type ResaleDraft } from '../runtime/wardrobe-extras-types.ts'
import { outfitSlot, outfitSlotOrder, outfitSlots, outfitDayparts, type OutfitDaypart, type Outfit, type OutfitChoice, type WardrobeItem } from '../runtime/outfit-types.ts'
import type { TripSummary } from '../runtime/trip-types.ts'

type Api=<T>(path:string,payload?:object,timeout?:number)=>Promise<T>
type Candidate={draft:FragranceDraft,photoToken:string}
const imagePath=(token:string)=>'/api/outfits/prepared-photo?token='+encodeURIComponent(token)
export const scentPhotoPath=(id:string)=>'/api/outfits/fragrance-photo?scent='+encodeURIComponent(id)
const errorMessage=(error:unknown)=>error instanceof Error?error.message:'Die Aktion konnte nicht abgeschlossen werden.'
const formatDay=(value:string)=>value.split('-').reverse().join('.')

const euros=new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'})

export function ResalePanel({api,item,wardrobe,onDone}:{api:Api,item?:WardrobeItem,wardrobe:WardrobeItem[],onDone:()=>Promise<void>}) {
  const panel=useRef<HTMLElement>(null)
  const [rows,setRows]=useState<ResaleDraft[]>()
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [editing,setEditing]=useState<string>()
  const [adding,setAdding]=useState(false)
  const [selectedItem,setSelectedItem]=useState('')
  const [photoChoice,setPhotoChoice]=useState(0)
  useEffect(()=>{
    let active=true
    void api<ResaleDraft[]>('/outfits/resale').then(rows=>{if(active)setRows(rows)}).catch(error=>{if(active)setError(errorMessage(error))})
    return ()=>{active=false}
  },[api])
  useEffect(()=>{
    if(item)panel.current?.scrollIntoView({block:'start'})
  },[item?.id])
  async function perform(action:()=>Promise<void>) {
    setBusy(true);setError('');setNotice('')
    try {await action()} catch(error) {setError(errorMessage(error))} finally {setBusy(false)}
  }
  async function change(id:string,action:string,details?:object) {
    setRows(await api('/outfits/resale',{item:id,action,details,confirm:true}))
    setEditing(undefined)
    await onDone()
  }
  function startSale(id:string) {
    void perform(async()=>{
      await change(id,'start')
      setEditing(id)
      setSelectedItem('')
      setAdding(false)
    })
  }
  async function updatePhoto(id:string,file:File) {
    if(file.size>4*1024*1024)throw Error('Das Foto darf bis zu 4 MB groß sein.')
    const response=await fetch('/api/outfits/photo?item='+encodeURIComponent(id),{method:'POST',
      headers:{'Content-Type':'application/octet-stream','X-LifePilot-Confirm':'image'},body:file})
    if(!response.ok)throw Error((await response.json()).error)
    setRows(await api<ResaleDraft[]>('/outfits/resale'))
    setPhotoChoice(value=>value+1)
    await onDone()
  }
  function editor(row:ResaleDraft) {
    return <form className="resale-editor" onSubmit={event=>{
      event.preventDefault()
      const fields=new FormData(event.currentTarget)
      const asking=fields.get('asking')
      void perform(()=>change(row.id,'selling',{condition:fields.get('condition'),flaws:fields.get('flaws'),
        originalPrice:fields.get('price') ? Number(fields.get('price')) : null,
        askingPriceCents:asking ? Math.round(Number(asking)*100) : null}))
    }}>
      <label>Zustand<select name="condition" defaultValue={row.condition} required>
        <option value="" disabled>Zustand auswählen</option>{saleConditions.map(value=><option key={value}>{value}</option>)}
      </select></label>
      <label>Gebrauchsspuren oder Mängel<input name="flaws" maxLength={350} defaultValue={row.flaws}/></label>
      <div className="resale-prices">
        <label>Ungefährer Neupreis (€)<input name="price" type="number" min={1} max={100000} step={1} defaultValue={row.originalPrice??''}/></label>
        <label>Verkaufspreis (€)<input name="asking" type="number" min={0.01} max={100000} step={0.01}
          defaultValue={row.askingPriceCents===null?'':row.askingPriceCents/100}/></label>
      </div>
      <div className="resale-actions">
        <button type="submit" className="outfit-primary" disabled={busy}>Anzeige vorbereiten</button>
        {row.condition?<button type="button" disabled={busy} onClick={()=>setEditing(undefined)}>Abbrechen</button>:null}
      </div>
    </form>
  }
  function card(row:ResaleDraft) {
      const price=euros.format(row.askingPriceCents===null?row.listing.start:row.askingPriceCents/100)
      const preparing=row.state==='selling' && (editing===row.id || !row.condition)
      const photo='/api/outfits/photo?item='+encodeURIComponent(row.id)
      return <article key={row.id} className="outfit-inventory resale-card">
        {row.hasPhoto?<img className="resale-photo" src={photo+'&v='+photoChoice} alt={row.name} loading="lazy"/>:
          <div className="outfit-piece-placeholder resale-photo">Kleidungsstück</div>}
        <header><h3>{row.name}</h3>
          <small>{row.state==='sold'?'Verkauft am '+formatDay(row.sold??row.created):'Zum Verkauf seit '+formatDay(row.created)}</small>
        </header>
        {row.state==='selling' ? <>
          {preparing ? editor(row) : <>
            <p className="resale-price">{row.askingPriceCents===null?'Preisvorschlag':'Verkaufspreis'} <strong>{price}</strong></p>
            <div className="resale-summary">
              <p>{row.listing.description.split('\n').join(' · ')}</p>
              <button type="button" disabled={busy} onClick={()=>void perform(async()=>{
                await navigator.clipboard.writeText([row.listing.title,row.listing.description,'Preis: '+price].join('\n\n'))
                setNotice('Inseratstext kopiert.')
              })}>Text kopieren</button>
            </div>
            <div className="resale-links">
              <a href="https://www.kleinanzeigen.de/p-anzeige-aufgeben.html" target="_blank" rel="noreferrer">Kleinanzeigen öffnen</a>
              <a href="https://www.vinted.de/items/new" target="_blank" rel="noreferrer">Vinted öffnen</a>
            </div>
          </>}
          <details className="resale-photo-options">
            <summary>Eigenes Foto</summary>
            {row.hasOwnPhoto ? <a href={photo} download>Foto herunterladen</a> : null}
            <label>Eigenes Foto hinzufügen<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event=>{
              const file=event.currentTarget.files?.[0]
              event.currentTarget.value=''
              if(file)void perform(()=>updatePhoto(row.id,file))
            }}/></label>
          </details>
        </> : null}
        <div className="resale-actions">
          {row.state==='selling' ? <>
            {!preparing ? <button type="button" disabled={busy} onClick={()=>setEditing(row.id)}>Zustand bearbeiten</button> : null}
            <button type="button" disabled={busy} onClick={()=>{
              if(window.confirm(row.name+' als verkauft markieren?'))void perform(()=>change(row.id,'sold'))
            }}>Als verkauft markieren</button>
          </> : null}
          <button type="button" disabled={busy} onClick={()=>void perform(()=>change(row.id,'restore'))}>
            {row.state==='selling'?'Verkauf stoppen':'Zurück in den Kleiderschrank'}
          </button>
        </div>
      </article>
  }
  return <section ref={panel} className="resale-panel">
    <header className="outfit-actions wardrobe-extra-header"><h2>Verkaufen</h2>
      <button type="button" className="icon-button" aria-label="Teil zum Verkauf hinzufügen" aria-expanded={adding}
        onClick={()=>setAdding(!adding)}>+</button>
    </header>
    {adding ? <div className="outfit-actions resale-chooser">
      <label>Kleidungsstück<select value={selectedItem} onChange={event=>setSelectedItem(event.currentTarget.value)}>
        <option value="">Teil auswählen</option>{wardrobe.filter(piece=>!piece.orderState&&!piece.saleState).map(piece=>
          <option value={piece.id} key={piece.id}>{piece.name}</option>)}
      </select></label>
      <button type="button" className="outfit-primary" disabled={busy||!selectedItem} onClick={()=>startSale(selectedItem)}>Übernehmen</button>
    </div> : null}
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {!rows && !error ? <p role="status">Verkaufsartikel werden geladen …</p> : null}
    {rows?.length===0 ? <p>Wähle ein Kleidungsstück für den Verkauf aus.</p> : null}
    {([['selling','Wird verkauft'],['sold','Verkauft']] as const).map(([state,title])=>{
      const items=rows?.filter(row=>row.state===state)
      return items?.length ? <section key={state} className="wardrobe-section">
        <h3>{title}</h3>
        <div className="resale-grid">{items.map(card)}</div>
      </section> : null
    })}
  </section>
}

export function FragrancePanel({api,names=[]}:{api:Api,names?:string[]}) {
  const [rows,setRows]=useState<Fragrance[]>([])
  const [pendingNames,setPendingNames]=useState(names)
  const [selectedName,setSelectedName]=useState(names[0]??'')
  const [query,setQuery]=useState(names[0]??'')
  const [editingTags,setEditingTags]=useState<Fragrance>()
  const [candidates,setCandidates]=useState<Candidate[]>([])
  const [chosen,setChosen]=useState<Candidate>()
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [removing,setRemoving]=useState<string>()
  useEffect(()=>{
    let active=true
    void api<Fragrance[]>('/outfits/fragrances').then(rows=>{if(active)setRows(rows)}).catch(error=>{if(active)setError(errorMessage(error))})
    return ()=>{active=false}
  },[api])
  async function perform(action:()=>Promise<void>) {
    setBusy(true);setError('');setNotice('')
    try {await action()} catch(error) {setError(errorMessage(error))} finally {setBusy(false)}
  }
  async function search(value:string) {
    setCandidates([]);setChosen(undefined)
    const found=await api<{candidates:Candidate[],query:string}>('/outfits/fragrance-search',{query:value,confirm:true},76000)
    setQuery(found.query)
    setCandidates(found.candidates)
    if (!found.candidates.length) setNotice('Für diesen Namen fehlt ein verlässlicher Bildtreffer. Du kannst einen Produktlink einfügen.')
  }
  const initialSearch=useEffectEvent((value:string)=>void perform(()=>search(value)))
  const started=useRef(false)
  const firstName=names[0]
  useEffect(()=>{
    if (firstName && !started.current) {
      started.current=true
      initialSearch(firstName)
    }
  },[firstName])
  async function nextName() {
    const next=pendingNames.filter(name=>name!==selectedName)
    setPendingNames(next);setSelectedName(next[0]??'');setQuery(next[0]??'')
    setCandidates([]);setChosen(undefined)
    if (next[0]) await search(next[0])
  }
  function saveCandidate(candidate:Candidate) {
    void perform(async()=>{
      const saved=await api<Fragrance>('/outfits/fragrances',{...candidate,confirm:true})
      setRows(current=>[saved,...current])
      setNotice(saved.name+' wurde gespeichert.')
      await nextName()
    })
  }
  function edit<K extends keyof FragranceDraft>(key:K,value:FragranceDraft[K]) {
    setChosen(current=>current ? {...current,draft:{...current.draft,[key]:value}} : undefined)
  }
  function toggles(label:string,key:'occasions'|'times'|'seasons',options:readonly string[]) {
    const current=chosen?.draft[key]??[]
    return <fieldset><legend>{label}</legend><div className="outfit-chips">{options.map(value=><label key={value} className="outfit-check">
      <input type="checkbox" checked={current.includes(value)} onChange={()=>edit(key,current.includes(value)?
        current.filter(item=>item!==value):[...current,value])}/>{value}
    </label>)}</div></fieldset>
  }
  return <section className="outfit-form wardrobe-extras fragrance-panel">
    <h2>Parfüm &amp; Düfte</h2>
    {pendingNames.length>0 ? <section className="wardrobe-extra-card" aria-label="Aus Pilot übernehmen">
      <h3>Aus Pilot übernehmen</h3>
      <div className="outfit-chips">{pendingNames.map(name=><button type="button" key={name} disabled={busy}
        aria-pressed={name===selectedName} onClick={()=>{
          setSelectedName(name);setQuery(name);void perform(()=>search(name))
        }}>{name}</button>)}</div>
      {selectedName ? <button type="button" className="quiet" disabled={busy} onClick={()=>void perform(nextName)}>Diesen Namen überspringen</button>:null}
    </section>:null}
    {error ? <p role="alert">{error}</p>:null}{notice ? <p role="status">{notice}</p>:null}
    <h3>Duft hinzufügen</h3>
    <form className="outfit-actions fragrance-search-form" onSubmit={event=>{
      event.preventDefault();if (query.trim()) void perform(()=>search(query.trim()))
    }}>
      <label>Name oder Produktlink<input type="search" value={query} maxLength={500} required disabled={busy}
        placeholder="z. B. Dior Sauvage" onChange={event=>{setQuery(event.target.value);setCandidates([]);setChosen(undefined)}}/></label>
      <button type="submit" className="outfit-primary" disabled={busy||query.trim().length<3}>Duft suchen</button>
    <label>Oder Flakonfoto auswählen<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,.heic,.heif" disabled={busy}
      onChange={event=>{
        const file=event.target.files?.[0]
        if (!file) return
        void perform(async()=>{
          if (file.size>16*1024*1024) throw Error('Das Bild darf bis zu 16 MB groß sein.')
          const response=await fetch('/api/outfits/fragrance-label',{method:'POST',
            headers:{'Content-Type':'application/octet-stream','X-LifePilot-Confirm':'image'},body:file})
          const result=await response.json()
          if (!response.ok) throw Error(result.error)
          if (result.query) {setQuery(result.query);await search(result.query)}
          else setNotice('Am Flakon war kein Name lesbar. Gib den Namen oder die Artikelnummer ein.')
        })
      }}/></label></form>
    {busy ? <progress aria-label="Duftdaten werden geladen"/>:null}
    {candidates.length && !chosen ? <div className="fragrance-results">{candidates.map(candidate=><article className="wardrobe-extra-card fragrance-result" key={candidate.photoToken}>
      <img className="wardrobe-extra-image" src={imagePath(candidate.photoToken)} alt={'Flakon von '+candidate.draft.name}/>
      <div>
        {candidate.draft.brand ? <small>{candidate.draft.brand}</small>:null}
        <h3>{candidate.draft.name}</h3>
        {candidate.draft.notes ? <p><strong>Duftnoten</strong> · {candidate.draft.notes}</p>:null}
        <p><strong>Passend für</strong> · {candidate.draft.occasions.join(', ')}</p>
        {candidate.draft.pairing ? <p><strong>Styling</strong> · {candidate.draft.pairing}</p>:null}
        <div className="outfit-actions">
          <button type="button" className="outfit-primary" disabled={busy} onClick={()=>saveCandidate(candidate)}>Zur Sammlung hinzufügen</button>
          <button type="button" className="quiet" disabled={busy} onClick={()=>setChosen(candidate)}>Angaben bearbeiten</button>
        </div>
      </div>
    </article>)}</div>:null}
    {chosen ? <form className="outfit-form" onSubmit={event=>{
      event.preventDefault()
      saveCandidate(chosen)
    }}>
      <img className="wardrobe-extra-image" src={imagePath(chosen.photoToken)} alt="Ausgewähltes Produktfoto"/>
      <div className="outfit-form-grid">
        <label>Name in der Sammlung<input value={chosen.draft.name} required maxLength={120} onChange={event=>edit('name',event.target.value)}/></label>
        <label>Marke<input value={chosen.draft.brand} maxLength={75} onChange={event=>edit('brand',event.target.value)}/></label>
        <label>Flakongröße in Millilitern<input type="number" min={1} max={2000} value={chosen.draft.containerMl??''}
          onChange={event=>edit('containerMl',event.target.value?Number(event.target.value):null)}/></label>
        <label>Duftcharakter<select value={chosen.draft.profile} onChange={event=>edit('profile',event.target.value as FragranceDraft['profile'])}>
          {fragranceProfiles.map(label=><option key={label}>{label}</option>)}
        </select></label>
      </div>
      <label>Kurzbeschreibung<textarea value={chosen.draft.description} maxLength={330} required onChange={event=>edit('description',event.target.value)}/></label>
      <label>Styling-Kombination<input value={chosen.draft.pairing??''} maxLength={220} onChange={event=>edit('pairing',event.target.value)}/></label>
      <label>Duftnoten<input value={chosen.draft.notes} maxLength={180} onChange={event=>edit('notes',event.target.value)}/></label>
      {toggles('Anlass','occasions',fragranceOccasions)}{toggles('Jahreszeit','seasons',fragranceSeasons)}{toggles('Tageszeit','times',fragranceTimes)}
      <div className="outfit-actions"><button type="submit" className="outfit-primary" disabled={busy}>Duft speichern</button>
        <button type="button" disabled={busy} onClick={()=>setChosen(undefined)}>Anderen Treffer wählen</button></div>
    </form>:null}
    <div className="outfit-wardrobe-grid">{rows.map(item=><article className="wardrobe-extra-card fragrance-card" key={item.id}>
      <h3>{item.name}</h3>
      <img className="wardrobe-extra-image" src={scentPhotoPath(item.id)} alt={item.name} loading="lazy"/>
      <small>{[item.brand,item.containerMl && item.containerMl+' ml',item.profile].filter(Boolean).join(' · ')}</small>
      {item.guide ? <dl className="scent-usage">
        <div><dt>Charakter</dt><dd>{item.guide.character}</dd></div>
        <div><dt>Wofür</dt><dd>{item.guide.purpose}</dd></div>
        <div><dt>Intensität</dt><dd>{item.guide.intensity}</dd></div>
        <div><dt>Wann</dt><dd>{item.guide.timing}</dd></div>
        <div><dt>Jahreszeit</dt><dd>{item.guide.seasonText}</dd></div>
      </dl> : item.occasions.length>0 && <p>{item.occasions.join(' · ')}</p>}
      {item.notes && <p><strong>Duftnoten</strong> · {item.notes}</p>}
      {item.pairing && <p><strong>Styling</strong> · {item.pairing}</p>}
      <div className="outfit-actions">
        <button type="button" aria-expanded={editingTags?.id===item.id} onClick={()=>setEditingTags(editingTags?.id===item.id?undefined:item)}>Bearbeiten</button>
        {removing===item.id ? <><button type="button" disabled={busy} onClick={()=>void perform(async()=>{
          await api('/outfits/fragrances',{remove:item.id,confirm:true});setRows(rows=>rows.filter(row=>row.id!==item.id));setRemoving(undefined)
        })}>Entfernen bestätigen</button><button type="button" onClick={()=>setRemoving(undefined)}>Abbrechen</button></> :
          <button type="button" onClick={()=>setRemoving(item.id)}>Duft entfernen</button>}
      </div>
    </article>)}</div>
    {editingTags && <form className="outfit-form" onSubmit={event=>{
      event.preventDefault()
      void perform(async()=>{
        const {id:scent,occasions,seasons}=editingTags
        const updated=await api<Fragrance>('/outfits/fragrance-tags',{scent,occasions,seasons,confirm:true})
        setRows(rows=>rows.map(row=>row.id===updated.id?updated:row));setEditingTags(undefined)
      })
    }}>
      <h3>{editingTags.name}</h3>
      {([['occasions','Anlässe',fragranceOccasions],['seasons','Jahreszeiten',fragranceSeasons]] as const).map(([key,title,options])=>
        <fieldset key={key}><legend>{title}</legend><div className="outfit-chips">{options.map(value=>
          <label key={value} className="outfit-check"><input type="checkbox" checked={editingTags[key].includes(value)}
            onChange={()=>setEditingTags(current=>current?{...current,[key]:current[key].includes(value)?
              current[key].filter(choice=>choice!==value):[...current[key],value]}:undefined)}/>{value}</label>)}</div></fieldset>)}
      <div className="outfit-actions"><button type="button" onClick={()=>setEditingTags(undefined)}>Abbrechen</button>
        <button type="submit" className="outfit-primary" disabled={busy}>Speichern</button></div>
    </form>}
  </section>
}

export function TravelOutfits({api,wardrobe,renderOutfit,renderPiece,requestedItem,onOpenPlanner}:{api:Api,wardrobe:WardrobeItem[],renderPiece:(item:WardrobeItem)=>ReactNode,renderOutfit:(look:Outfit)=>ReactNode,requestedItem?:string,onOpenPlanner?:()=>void}) {
  const panel=useRef<HTMLElement>(null)
  const [trips,setTrips]=useState<TripSummary[]>()
  const [selected,setSelected]=useState('')
  const [picked,setPicked]=useState<string[]>([])
  const [pendingItem,setPendingItem]=useState(requestedItem)
  const [notice,setNotice]=useState('')
  const [ready,setReady]=useState('')
  const [occasion,setOccasion]=useState('')
  const [daypart,setDaypart]=useState<OutfitDaypart>()
  const [look,setLook]=useState<OutfitChoice>()
  const [variant,setVariant]=useState(0)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    if(requestedItem)panel.current?.scrollIntoView({block:'start'})
  },[requestedItem])
  useEffect(()=>{
    let active=true
    void api<TripSummary[]>('/trips').then(async rows=>{
      if(!active)return
      setTrips(rows)
      if(!requestedItem)setSelected(rows[0]?.id??'')
      if(requestedItem && rows.length===1){
        setBusy(true)
        try {
          const items=await api<string[]>('/outfits/travel',{tripId:rows[0].id,item:requestedItem,confirm:true})
          if(active)finishAddition(items)
        } finally {if(active){setSelected(rows[0].id);setBusy(false)}}
      }
    }).catch(error=>{if(active)setError(errorMessage(error))})
    return ()=>{active=false}
  },[api,requestedItem])
  useEffect(()=>{
    let active=true
    if (selected) void api<string[]>('/outfits/travel?trip='+encodeURIComponent(selected)).then(items=>{
      if(active){
        setPicked(items)
        setReady(selected)
      }
    }).catch(error=>{if(active)setError(errorMessage(error))})
    return ()=>{active=false}
  },[api,selected])
  const trip=trips?.find(row=>row.id===selected)
  const requested=wardrobe.find(item=>item.id===requestedItem)
  const packed=wardrobe.filter(item=>picked.includes(item.id) && !item.saleState && !item.orderState)
  function finishAddition(items:string[]) {
    setPicked(items);setPendingItem(undefined)
    setNotice(requested ? `„${requested.name}“ ist auf der Urlaubspackliste.` : 'Kleidungsstück zur Urlaubspackliste hinzugefügt.')
  }
  async function addPendingItem() {
    if(!trip || !pendingItem || busy)return
    setBusy(true);setError('');setNotice('')
    try {
      finishAddition(await api<string[]>('/outfits/travel',{tripId:trip.id,item:pendingItem,confirm:true}))
    } catch(error) {setError(errorMessage(error))} finally {setBusy(false)}
  }
  async function perform(removeItem?:string) {
    if (!trip) return
    setBusy(true);setError('')
    try {
      if (removeItem) {
        setPicked(await api<string[]>('/outfits/travel',{tripId:trip.id,removeItem,confirm:true}))
        setLook(undefined);setNotice('')
      } else {
        setLook(await api<OutfitChoice>('/outfits/generate',{query:{
        tripId:trip.id,required:[],mode:occasion.trim()?'occasion':'inspiration',occasion:occasion.trim(),daypart,
        date:trip.start,variant,
        },confirm:true},24000))
        setVariant((variant+1)%10001)
      }
    } catch(error) {setError(errorMessage(error))} finally {setBusy(false)}
  }
  return <section ref={panel} className="outfit-form wardrobe-extras travel-wardrobe"><h2>Urlaubsgarderobe</h2>
    {error?<p role="alert">{error}</p>:null}
    {notice?<p role="status">{notice}</p>:null}
    {!trips && !error ? <p role="status">Reisen werden geladen …</p> : null}
    {pendingItem && requested ? <section className="travel-request" aria-label="Ausgewähltes Kleidungsstück">
      {renderPiece(requested)}
      {trips && trips.length>1 && !selected ? <p>Wähle die Reise für dieses Teil aus.</p> : null}
    </section> : null}
    {trips?.length===0 ? <div className="outfit-actions">
      <p>Für die Packliste brauchst du eine gespeicherte Reise.</p>
      {onOpenPlanner?<button type="button" onClick={onOpenPlanner}>Urlaubsplaner öffnen</button>:null}
    </div> : null}
    {trips && trips.length>0 ? <label>Reise<select value={selected} disabled={busy}
      onChange={event=>{
        const next=event.target.value
        if (next===selected) return
        setReady('');setLook(undefined);setVariant(0);setError('');setNotice('');setSelected(next)
      }}>
      {!selected ? <option value="" disabled>Reise auswählen</option> : null}
      {trips.map(trip=><option key={trip.id} value={trip.id}>{trip.destination} · {formatDay(trip.start)}</option>)}</select></label> : null}
    {trip && ready===trip.id ? <>
      {pendingItem ? <div className="outfit-actions">
        <button type="button" className="outfit-primary" disabled={busy} onClick={()=>void addPendingItem()}>Zur Packliste hinzufügen</button>
      </div> : null}
      {packed.length===0 ? <p>Noch nichts eingepackt. Wähle im Kleiderschrank am Teil „Für eine Reise einpacken“.</p> : null}
      {outfitSlotOrder.map(slot=>{
        const items=packed.filter(item=>outfitSlot(item)===slot)
        return items.length ? <section key={slot} className="wardrobe-section"><h3>{outfitSlots[slot]}</h3>
          <div className="outfit-wardrobe-grid travel-wardrobe-grid">{items.map(item=><div className="travel-piece" key={item.id}>
            {renderPiece(item)}<button type="button" disabled={busy || Boolean(pendingItem)} aria-label={item.name+' auspacken'} onClick={()=>void perform(item.id)}>Auspacken</button>
          </div>)}</div></section> : null
      })}
      <div className="outfit-form-grid"><label>Anlass<input maxLength={110} value={occasion} onChange={event=>setOccasion(event.target.value)}/></label>
        <label>Tageszeit<select value={daypart??''} onChange={event=>setDaypart(event.target.value as OutfitDaypart || undefined)}>
          <option value="">Egal</option>{outfitDayparts.map(part=><option key={part}>{part}</option>)}
        </select></label></div>
      <div className="outfit-actions">
        <button type="button" className="outfit-primary" disabled={busy || Boolean(pendingItem) || !packed.length} onClick={()=>void perform()}>Urlaubsoutfit erstellen</button></div>
      {look?renderOutfit(look.look):null}
    </>:null}
  </section>
}
