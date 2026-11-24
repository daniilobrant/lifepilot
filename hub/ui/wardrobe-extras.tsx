import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { fragranceProfiles, fragranceOccasions, fragranceSeasons, fragranceTimes, saleConditions,
  type Fragrance, type FragranceDraft, type ResaleDraft } from '../runtime/wardrobe-extras-types.ts'
import { outfitDayparts, type OutfitDaypart, type Outfit, type OutfitChoice, type WardrobeItem } from '../runtime/outfit-types.ts'
import type { TripSummary } from '../runtime/trip-types.ts'

type Api=<T>(path:string,payload?:object,timeout?:number)=>Promise<T>
type Candidate={draft:FragranceDraft,photoToken:string}
const imagePath=(token:string)=>'/api/outfits/prepared-photo?token='+encodeURIComponent(token)
export const scentPhotoPath=(id:string)=>'/api/outfits/fragrance-photo?scent='+encodeURIComponent(id)
const errorMessage=(error:unknown)=>error instanceof Error?error.message:'Die Aktion konnte nicht abgeschlossen werden.'
const formatDay=(value:string)=>value.split('-').reverse().join('.')

export function ResalePanel({api,item,wardrobe,onDone}:{api:Api,item?:WardrobeItem,wardrobe:WardrobeItem[],onDone:()=>Promise<void>}) {
  const [rows,setRows]=useState<ResaleDraft[]>([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [editing,setEditing]=useState<string>()
  const [adding,setAdding]=useState(false)
  const [selectedItem,setSelectedItem]=useState('')
  const [photoChoice,setPhotoChoice]=useState<string>()
  useEffect(()=>{
    let active=true
    void api<ResaleDraft[]>('/outfits/resale').then(rows=>{if(active)setRows(rows)}).catch(error=>{if(active)setError(errorMessage(error))})
    return ()=>{active=false}
  },[api])
  async function perform(action:()=>Promise<void>) {
    setBusy(true);setError('');setNotice('')
    try {await action()} catch(error) {setError(errorMessage(error))} finally {setBusy(false)}
  }
  async function change(id:string,action:string,details?:object) {
    setRows(await api('/outfits/resale',{item:id,action,details,confirm:true}))
    setEditing(undefined)
    await onDone()
  }
  function editor(id:string,prior?:ResaleDraft) {
    return <form className="outfit-form" onSubmit={event=>{
      event.preventDefault()
      const data=new FormData(event.currentTarget)
      void perform(()=>change(id,'selling',{condition:data.get('condition'),flaws:data.get('flaws'),
        originalPrice:data.get('price') ? Number(data.get('price')) : null}))
    }}>
      <label>Zustand<select name="condition" defaultValue={prior?.condition||''} required>
        <option value="" disabled>Zustand auswählen</option>{saleConditions.map(value=><option key={value}>{value}</option>)}
      </select></label>
      <label>Gebrauchsspuren oder Mängel<input name="flaws" maxLength={350} defaultValue={prior?.flaws}/></label>
      <label>Ungefährer Neupreis in Euro<input name="price" type="number" min={1} max={100000} step={1} defaultValue={prior?.originalPrice??''}/></label>
      <button type="submit" className="outfit-primary" disabled={busy}>Anzeige vorbereiten</button>
    </form>
  }
  function copy(text:string) {
    void perform(async()=>{await navigator.clipboard.writeText(text);setNotice('Kopiert.')})
  }
  return <section className="outfit-form wardrobe-extras">
    <header className="outfit-actions wardrobe-extra-header"><h2>Verkaufen</h2>
      <button type="button" aria-label="Teil zum Verkauf hinzufügen" aria-expanded={adding} onClick={()=>setAdding(!adding)}>+</button>
    </header>
    {adding && <div className="outfit-actions">
      <label>Kleidungsstück <select value={selectedItem} onChange={event=>setSelectedItem(event.currentTarget.value)}>
        <option value="">Teil auswählen</option>{wardrobe.filter(piece=>!piece.orderState&&!piece.saleState).map(piece=>
          <option value={piece.id} key={piece.id}>{piece.name}</option>)}
      </select></label>
      <button type="button" disabled={busy||!selectedItem} onClick={()=>void perform(async()=>{
        await change(selectedItem,'start');setEditing(selectedItem);setSelectedItem('');setAdding(false)
      })}>Übernehmen</button>
    </div>}
    {item && !rows.some(row=>row.id===item.id) ? <section><h3>{item.name}</h3>{editor(item.id)}</section> : null}
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {!rows.length&&!item ? <p>Wähle im Kleiderschrank ein Teil zum Verkaufen oder Aussortieren.</p> : null}
    <div className="outfit-wardrobe-grid">{rows.map(row=><article key={row.id} className="wardrobe-extra-card resale-card">
      {row.hasPhoto?<img className="wardrobe-extra-image" src={'/api/outfits/photo?item='+row.id+'&v='+encodeURIComponent(photoChoice??'')} alt={row.name} loading="lazy"/>:
        <div className="outfit-piece-placeholder">Kleidungsstück</div>}
      <h3>{row.state==='sold'?<s>{row.name}</s>:row.name}</h3>
      <small>{row.state==='sold'?'Verkauft am '+formatDay(row.sold??row.created):row.state==='sorted'?'Aussortiert':'Zum Verkauf seit '+formatDay(row.created)}</small>
      {row.state==='selling' ? <>
        {(editing===row.id || !row.condition) ? editor(row.id,row) : <details>
          <summary>Inserat für Kleinanzeigen oder Vinted</summary>
          <p><strong>{row.listing.title}</strong></p><p className="resale-description">{row.listing.description}</p>
          <p>Startpreis ca. <strong>{row.listing.start} €</strong> · grobe Spanne {row.listing.minimum}–{row.listing.maximum} €</p>
          <small>Schätzung nach Zustand und {row.originalPrice?'Neupreis':'Artikelkategorie'}.</small>
          {row.hasOwnPhoto ? <div className="outfit-actions">
            <a href={'/api/outfits/photo?item='+row.id} download>Eigenes Foto herunterladen</a>
          </div>:<p>Für die Anzeige bitte eigene Fotos des tatsächlichen Artikels aufnehmen.</p>}
          <label>Eigenes Foto hinzufügen<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event=>{
            const file=event.target.files?.[0]
            if (!file) return
            void perform(async()=>{
              if (file.size>4*1024*1024) throw Error('Das Foto darf bis zu 4 MB groß sein.')
              const response=await fetch('/api/outfits/photo?item='+row.id,{method:'POST',
                headers:{'Content-Type':'application/octet-stream','X-LifePilot-Confirm':'image'},body:file})
              if (!response.ok) throw Error((await response.json()).error)
              setRows(await api<ResaleDraft[]>('/outfits/resale'));setPhotoChoice(String(Date.now()));await onDone()
            })
          }}/></label>
          <div className="outfit-actions">
            <button type="button" disabled={busy} onClick={()=>copy([
              row.listing.title,row.listing.description,'Preisvorstellung: '+row.listing.start+' €',
            ].join('\n\n'))}>Kleinanzeigen-Text kopieren</button>
            <button type="button" disabled={busy} onClick={()=>copy([
              row.listing.title,row.listing.description,'Preis: '+row.listing.start+' €',
            ].join('\n\n'))}>Vinted-Text kopieren</button>
            <a href="https://www.kleinanzeigen.de/p-anzeige-aufgeben.html" target="_blank" rel="noreferrer">Kleinanzeigen öffnen</a>
            <a href="https://www.vinted.de/items/new" target="_blank" rel="noreferrer">Vinted öffnen</a>
          </div>
          <button type="button" className="quiet" onClick={()=>setEditing(row.id)}>Zustand bearbeiten</button>
        </details>}
        <button type="button" disabled={busy} onClick={()=>void perform(async()=>{
          if (window.confirm(row.name+' als verkauft markieren?')) await change(row.id,'sold')
        })}>Als verkauft markieren</button>
      </>:null}
      <button type="button" className="quiet" disabled={busy} onClick={()=>void perform(()=>change(row.id,'restore'))}>
        {row.state==='selling'?'Verkauf stoppen':'Zurück in den Kleiderschrank'}
      </button>
    </article>)}</div>
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
      {item.occasions.length>0 && <p>{item.occasions.join(' · ')}</p>}
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

export function TravelOutfits({api,wardrobe,renderOutfit,renderPiece,requestedItem}:{api:Api,wardrobe:WardrobeItem[],renderPiece:(item:WardrobeItem)=>ReactNode,renderOutfit:(look:Outfit)=>ReactNode,requestedItem?:string}) {
  const [trips,setTrips]=useState<TripSummary[]>([])
  const [selected,setSelected]=useState('')
  const [picked,setPicked]=useState<string[]>([])
  const [savedItems,setSavedItems]=useState<string[]>([])
  const [ready,setReady]=useState('')
  const [occasion,setOccasion]=useState('')
  const [daypart,setDaypart]=useState<OutfitDaypart>()
  const [look,setLook]=useState<OutfitChoice>()
  const [variant,setVariant]=useState(0)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    void api<TripSummary[]>('/trips').then(rows=>{if(active){setTrips(rows);setSelected(rows[0]?.id??'')}})
      .catch(error=>{if(active)setError(errorMessage(error))})
    return ()=>{active=false}
  },[api])
  useEffect(()=>{
    let active=true
    if (selected) void api<string[]>('/outfits/travel?trip='+encodeURIComponent(selected)).then(items=>{
      if(active){
        setSavedItems(items)
        setPicked(requestedItem&&!items.includes(requestedItem)&&items.length<80?[...items,requestedItem]:items)
        setReady(selected)
      }
    }).catch(error=>{if(active)setError(errorMessage(error))})
    return ()=>{active=false}
  },[api,selected,requestedItem])
  const trip=trips.find(row=>row.id===selected)
  const selectable=wardrobe.filter(item=>!item.orderState&&!item.saleState)
  async function perform(generate:boolean) {
    if (!trip) return
    setBusy(true);setError('')
    try {
      await api('/outfits/travel',{tripId:trip.id,items:picked,confirm:true})
      setSavedItems(picked)
      if (generate) {
        setLook(await api<OutfitChoice>('/outfits/generate',{query:{
        tripId:trip.id,required:[],mode:occasion.trim()?'occasion':'inspiration',occasion:occasion.trim(),daypart,
        date:trip.start,variant,
        },confirm:true},24000))
        setVariant((variant+1)%10001)
      }
    } catch(error) {setError(errorMessage(error))} finally {setBusy(false)}
  }
  return <section className="outfit-form wardrobe-extras"><h2>Urlaubsgarderobe</h2>
    {error?<p role="alert">{error}</p>:null}
    {!trips.length?<p>Lege im Urlaubsplaner zuerst eine Reise an.</p>:<label>Reise<select value={selected} disabled={busy}
      onChange={event=>{
        const next=event.target.value
        if (next===selected) return
        setReady('');setLook(undefined);setVariant(0);setError('');setSelected(next)
      }}>
      {trips.map(trip=><option key={trip.id} value={trip.id}>{trip.destination} · {formatDay(trip.start)}</option>)}</select></label>}
    {trip && ready===trip.id ? <>
      {requestedItem&&<p role="status">{savedItems.includes(requestedItem)?'Das Teil steht bereits auf der Packliste.':
        picked.includes(requestedItem)?'Das Teil ist ausgewählt. Speichere die Auswahl für diese Reise.':'Das Teil ist für diese Reise noch nicht ausgewählt.'}</p>}
      <fieldset disabled={busy}><legend>Kleidungsstücke einpacken</legend><div className="outfit-wardrobe-grid">
        {selectable.map(item=><div className="travel-piece" key={item.id}>{renderPiece(item)}
          <label className="outfit-check"><input type="checkbox" checked={picked.includes(item.id)} aria-label={item.name+' einpacken'}
            onChange={()=>{setLook(undefined);setPicked(current=>current.includes(item.id)?current.filter(id=>id!==item.id):current.length<80?[...current,item.id]:current)}}/>
            Einpacken</label></div>)}
      </div></fieldset>
      <div className="outfit-form-grid"><label>Anlass<input maxLength={110} value={occasion} onChange={event=>setOccasion(event.target.value)}/></label>
        <label>Tageszeit<select value={daypart??''} onChange={event=>setDaypart(event.target.value as OutfitDaypart || undefined)}>
          <option value="">Egal</option>{outfitDayparts.map(part=><option key={part}>{part}</option>)}
        </select></label></div>
      <div className="outfit-actions"><button type="button" disabled={busy} onClick={()=>void perform(false)}>Auswahl speichern</button>
        <button type="button" className="outfit-primary" disabled={busy||!picked.length} onClick={()=>void perform(true)}>Urlaubsoutfit erstellen</button></div>
      {look?renderOutfit(look.look):null}
    </>:null}
  </section>
}
