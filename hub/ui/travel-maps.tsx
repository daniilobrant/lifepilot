import { useEffect, useMemo, useRef, useState } from 'react'
import { buildExport, categoryTitle, collectPlaces, defaultMapName, emptyMapState, exportWarnings, isSelected, mapCategories, type MapPlace, type MapState } from '../runtime/trip-maps.ts'
import type { Trip, TripPlan } from '../runtime/trip-types.ts'

type Api=<T>(path:string,payload?:object,timeout?:number)=>Promise<T>
const formats=[
  ['csv','Eine gemeinsame CSV-Datei','Schnellimport, empfohlen'],
  ['zip','ZIP mit einer CSV je Kategorie','Jede Kategorie wird eine eigene Ebene'],
  ['kml','KML mit Ordnern je Kategorie','Ebenen bleiben in einer Datei'],
] as const
const steps=[
  'In My Maps „Neue Karte erstellen“ wählen und den Kartennamen von oben einfügen.',
  'In der Ebene auf „Importieren“ klicken und die heruntergeladene Datei auswählen.',
  'Bei CSV die Spalte „Adresse“ als Position und „Name“ als Titel wählen. KML braucht keine Auswahl.',
  'Fertig: Die Orte erscheinen nach Kategorie, du kannst Stile und Reihenfolge in My Maps anpassen.',
]

export function MapExportPanel({api,trip,onClose}:{api:Api,trip:Trip|TripPlan,onClose:()=>void}) {
  const tripId=(trip as Trip).id
  const [state,setState]=useState<MapState>()
  const [error,setError]=useState('')
  const [hidden,setHidden]=useState<Set<string>>(new Set())
  const [copied,setCopied]=useState(false)
  const timer=useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(()=>{
    let active=true
    void api<MapState>('/trips/map?trip='+tripId).then(value=>{if(active)setState(value)},reason=>{if(active)setError(reason instanceof Error?reason.message:'Die Kartenauswahl konnte nicht geladen werden.')})
    return ()=>{active=false;clearTimeout(timer.current)}
  },[api,tripId])
  const current=state??emptyMapState()
  const places=useMemo(()=>collectPlaces(trip,current),[trip,state])
  const visible=places.filter(place=>!hidden.size||hidden.has(place.category))
  const chosen=places.filter(place=>isSelected(place,current))
  const mapName=current.mapName??defaultMapName(trip)
  const counts=mapCategories.map(category=>({...category,count:places.filter(place=>place.category===category.id).length})).filter(category=>category.count>0)
  const warnings=exportWarnings(chosen)
  function update(next:MapState) {
    setState(next)
    clearTimeout(timer.current)
    timer.current=setTimeout(()=>{void api('/trips/map',{tripId,state:next,confirm:true}).catch(reason=>setError(reason instanceof Error?reason.message:'Die Auswahl konnte nicht gespeichert werden.'))},500)
  }
  const select=(place:MapPlace,selected:boolean)=>update({...current,overrides:{...current.overrides,[place.key]:{...current.overrides[place.key],selected}}})
  const selectMany=(keep:(place:MapPlace)=>boolean)=>update({...current,overrides:{...current.overrides,...Object.fromEntries(places.map(place=>[place.key,{...current.overrides[place.key],selected:keep(place)}]))}})
  const recategorize=(place:MapPlace,category:string)=>update({...current,overrides:{...current.overrides,[place.key]:{...current.overrides[place.key],category}}})
  const removePlace=(place:MapPlace)=>update({...current,manual:current.manual.filter(entry=>entry.name.trim().toLowerCase()!==place.name.toLowerCase()),
    overrides:{...current.overrides,[place.key]:{...current.overrides[place.key],hidden:true}}})
  async function copyName() {
    try { await navigator.clipboard.writeText(mapName) } catch { /* Auswahlfeld bleibt zum manuellen Kopieren */ }
    setCopied(true);setTimeout(()=>setCopied(false),1800)
  }
  function download() {
    const file=buildExport(mapName,chosen,current.format)
    const url=URL.createObjectURL(new Blob([file.bytes as BlobPart],{type:file.mime}))
    const link=document.createElement('a')
    link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove()
    setTimeout(()=>URL.revokeObjectURL(url),2000)
  }
  return <section className="card travel-stack travel-maps" aria-label="Export für Google My Maps">
    <div className="travel-maps-head"><h2>Für Google My Maps exportieren</h2><button type="button" className="quiet" onClick={onClose} aria-label="Export schließen">×</button></div>
    {error?<p role="alert">{error}</p>:null}
    <div className="travel-maps-name">
      <label>Kartenname<input value={mapName} maxLength={120} onChange={event=>update({...current,mapName:event.target.value})}/></label>
      <button type="button" className="travel-small-button" onClick={()=>void copyName()}>{copied?'Kopiert':'Kopieren'}</button>
    </div>
    <p className="travel-maps-summary">{chosen.length} {chosen.length===1?'Ort':'Orte'} ausgewählt{counts.length?' · '+counts.filter(category=>chosen.some(place=>place.category===category.id)).length+' Kategorien':''}</p>
    <div className="travel-maps-chips" role="group" aria-label="Kategorien filtern">
      {counts.map(category=><button type="button" key={category.id} aria-pressed={hidden.has(category.id)} className={hidden.has(category.id)?'primary':''}
        onClick={()=>setHidden(previous=>{const next=new Set(previous);if(next.has(category.id))next.delete(category.id);else next.add(category.id);return next})}>
        {category.emoji} {category.label} <small>{category.count}</small></button>)}
    </div>
    <div className="travel-maps-bulk">
      <button type="button" className="travel-small-button" onClick={()=>selectMany(()=>true)}>Alle auswählen</button>
      <button type="button" className="travel-small-button" onClick={()=>selectMany(()=>false)}>Alle abwählen</button>
      <button type="button" className="travel-small-button" onClick={()=>selectMany(place=>visible.includes(place))}>Nur sichtbare auswählen</button>
    </div>
    {!places.length?<p className="empty">Noch keine Orte. Trage bei Tagespunkten einen Ort ein oder füge unten einen hinzu.</p>:
      <ul className="travel-maps-list">{visible.map(place=><li key={place.key}>
        <label className="travel-maps-check"><input type="checkbox" checked={isSelected(place,current)} onChange={event=>select(place,event.target.checked)}/>
          <span><strong>{place.name}</strong><small>{place.address}{place.guess?' · Kategorie bitte prüfen':''}</small></span></label>
        <select aria-label={'Kategorie für '+place.name} value={place.category} onChange={event=>recategorize(place,event.target.value)}>
          {mapCategories.map(category=><option key={category.id} value={category.id}>{categoryTitle(category.id)}</option>)}</select>
        <button type="button" className="quiet" aria-label={place.name+' aus der Liste nehmen'} onClick={()=>removePlace(place)}>×</button>
      </li>)}</ul>}
    <details className="travel-inline-details"><summary>+ Ort hinzufügen</summary>
      <form className="travel-maps-add" onSubmit={event=>{
        event.preventDefault()
        const form=new FormData(event.currentTarget)
        const name=String(form.get('name')??'').trim()
        if(!name)return
        update({...current,manual:[...current.manual,{id:crypto.randomUUID(),name,address:String(form.get('address')??'').trim(),category:String(form.get('category')??'other')}]})
        event.currentTarget.reset()
      }}>
        <label>Name<input name="name" required maxLength={150}/></label>
        <label>Adresse (optional)<input name="address" maxLength={240} placeholder="sonst wird nach dem Namen gesucht"/></label>
        <label>Kategorie<select name="category" defaultValue="sights">{mapCategories.map(category=><option key={category.id} value={category.id}>{categoryTitle(category.id)}</option>)}</select></label>
        <button type="submit" className="travel-small-button primary">Hinzufügen</button>
      </form>
    </details>
    <div className="travel-maps-options">
      <label className="data-check"><input type="checkbox" checked={current.includeStay} onChange={event=>update({...current,includeStay:event.target.checked})}/> 🏠 Unterkunft einbeziehen</label>
      <label className="data-check"><input type="checkbox" checked={current.stayAddress} disabled={!current.includeStay} onChange={event=>update({...current,stayAddress:event.target.checked})}/> Unterkunftsadresse exportieren</label>
      {current.includeStay&&!current.stayAddress?<small>Ohne Freigabe wird die Unterkunft nur mit Name und Stadt exportiert, nicht mit der genauen Adresse.</small>:null}
    </div>
    <fieldset className="travel-maps-formats"><legend>Format</legend>
      {formats.map(([value,label,hint])=><label key={value} className="data-check"><input type="radio" name="map-format" checked={current.format===value} onChange={()=>update({...current,format:value})}/>
        <span>{label}<small>{hint}</small></span></label>)}
    </fieldset>
    {warnings.map(text=><p key={text} role="status">{text}</p>)}
    <div className="travel-maps-actions">
      <button type="button" className="primary" disabled={!chosen.length} onClick={download}>Export herunterladen</button>
      <a className="travel-maps-link" href="https://mymaps.google.com/" target="_blank" rel="noreferrer">Google My Maps öffnen</a>
    </div>
    <ol className="travel-maps-steps">{steps.map(text=><li key={text}>{text}</li>)}</ol>
    <small>Koordinaten werden nicht erfunden: My Maps sucht die Position anhand der Adresse. Orte ohne genaue Adresse werden mit Name und Stadt gesucht.</small>
  </section>
}
