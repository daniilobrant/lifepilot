import { confirmImageTransfer } from './image-consent.ts'
import {outfitCalendarContext} from '../runtime/outfit-calendar.ts'
import type {Week} from '../runtime/workspace.ts'
import type {GoogleEvent} from '../connectors/google.ts'
import {displayColor,productDisplayName} from './presentation.tsx'
import {DateInput} from './presentation.tsx'
import { outfitGarment, productColorName, productWardrobeFields } from '../runtime/outfit-fields.ts'
import { FragrancePanel, ResalePanel, TravelOutfits, scentPhotoPath } from './wardrobe-extras.tsx'
import { dateInBerlin, shiftDay } from '../runtime/values.ts'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { bodyProportions, bodyShapes, emptyWardrobe, outfitDayparts, outfitSlot, outfitSlotOrder, outfitSlots, outfitStyles, preferredCuts, wardrobeCategories, wardrobeTypes, type Outfit, type OutfitChoice, type OutfitOverview,
  type OutfitChatPlan, type OutfitQuery, type StyleProfile, type WardrobeDraft, type WardrobeItem } from '../runtime/outfit-types.ts'

type Api = <T>(path: string, payload?: object, timeout?: number) => Promise<T>
type Tab = 'Styling-Studio' | 'Kleiderschrank' | 'Einstellungen' | 'Meine Looks' | 'Verkaufen' | 'Parfüm' | 'Urlaubsgarderobe'
type Overview = OutfitOverview & { weatherPlace: string }
const tabs: Tab[] = ['Styling-Studio', 'Kleiderschrank', 'Meine Looks', 'Urlaubsgarderobe', 'Parfüm', 'Verkaufen']
const series = (from: number, to: number, step = 1) =>
  Array.from({length:Math.floor((to-from)/step)+1},(_,i)=>from+i*step)
const fitFields = [
  ['height', 'Körpergröße', series(120,230).map(value=>value+' cm')],
  ['topSize', 'Oberteilgröße', ['XXS','XS','S','M','L','XL','XXL','3XL','4XL','5XL',...series(30,68,2).map(value=>'EU '+value)]],
  ['bottomSize', 'Hosengröße', [...series(30,68,2).map(value=>'EU '+value),...series(22,48).map(value=>'W'+value)]],
  ['shoeSize', 'Schuhgröße', series(32,54,.5).map(value=>'EU '+String(value).replace('.',','))],
  ['shape', 'Statur', bodyShapes],
  ['proportions', 'Proportionen', bodyProportions],
] as const
const styleFields = [
  ['preferredStyle', 'Bevorzugter Stil', outfitStyles],
  ['preferredCut', 'Bevorzugter Schnitt', preferredCuts],
] as const

function photoPath(id: string) { return '/api/outfits/photo?item=' + encodeURIComponent(id) }
function message(error: unknown) { return error instanceof Error ? error.message : 'Die Aktion konnte nicht abgeschlossen werden.' }

async function upload(item: string, file: File) {
  if (file.size > 4 * 1024 * 1024) throw Error('Das Foto darf höchstens 4 MB groß sein.')
  const response = await fetch(photoPath(item), {
    method:'POST', headers:{ 'Content-Type':'application/octet-stream', 'X-LifePilot-Confirm':'image' },
    body:file, signal:AbortSignal.timeout(10000),
  })
  if (!response.ok) throw Error((await response.json()).error)
}

function Piece({ item, imageVersion }: { item: WardrobeItem, imageVersion: number }) {
  const title=productDisplayName(item.name)
  const color=displayColor(item.color)
  const slotLabel=outfitSlots[outfitSlot(item)]
  const attributes=[color.label,item.fit||item.material].filter(Boolean).join(' · ')
  return <article className="outfit-piece">
    <div className="outfit-piece-media">
      {item.hasPhoto ? <img src={photoPath(item.id) + '&v=' + imageVersion} alt={title} width={320} height={400} loading="lazy" /> :
        <div className="outfit-piece-placeholder">{color.label || slotLabel}</div>}
    </div>
    <div className="outfit-piece-info"><small>{slotLabel}</small><h3 title={title}>{title}</h3>
      <p className="outfit-piece-attributes" title={attributes}>{item.orderState ? (item.orderState==='ordered'?'Bestellt':'Behalten oder zurückgeben?') : <>
        {color.swatch&&<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeOpacity=".3" fill={color.swatch}/></svg>}
        <span>{attributes}</span>
      </>}</p>
    </div>
  </article>
}

function WardrobeMenu({title,children}:{title:string,children:ReactNode}){
  const menu=useRef<HTMLDetailsElement>(null)
  const [open,setOpen]=useState(false)
  useEffect(()=>{
    if(!open)return
    function dismiss(event:PointerEvent){
      const details=menu.current
      if(details && event.target instanceof Node && !details.contains(event.target)) details.open=false
    }
    document.addEventListener('pointerdown',dismiss,true)
    return ()=>document.removeEventListener('pointerdown',dismiss,true)
  },[open])
  return <details ref={menu} className="wardrobe-menu" name="wardrobe-actions"
    onToggle={event=>setOpen(event.currentTarget.open)}
    onKeyDown={event=>{
      if(event.key!=='Escape'||!event.currentTarget.open)return
      event.preventDefault()
      event.currentTarget.open=false
      event.currentTarget.querySelector('summary')?.focus()
    }}>
    <summary className="icon-button" aria-label={'Aktionen für '+title}><span aria-hidden="true">⋯</span></summary>
    <div className="wardrobe-menu-actions" onClick={event=>{
      if(event.target instanceof HTMLElement && event.target.closest('button')){
        const details=menu.current
        if(details){details.open=false;details.querySelector('summary')?.focus()}
      }
    }}>{children}</div>
  </details>
}

function Board({ look, wardrobe, imageVersion, actions }: { look: Outfit, wardrobe: WardrobeItem[], imageVersion: number, actions?: ReactNode }) {
  const pieces = look.itemIds.map(id => wardrobe.find(item => item.id === id)).filter((item): item is WardrobeItem => Boolean(item))
  if (!pieces.length && !look.rationale) return <div className="outfit-actions">{actions}</div>
  return <article className="outfit-board">
    <header className="outfit-board-head"><small>{look.occasion} · {look.style}</small><h2>{look.title}</h2><p>{look.rationale}</p></header>
    {look.date ? <div className="outfit-weather">
      <strong>{new Intl.DateTimeFormat('de-DE',{dateStyle:'long',timeZone:'UTC'}).format(new Date(look.date+'T12:00Z'))}</strong>
      {look.weather ? <>
        <span>{look.weather.place}</span>
        {look.weather.current!==undefined ? <span>Jetzt {Math.round(look.weather.current)} °C</span> : null}
        <span>{Math.round(look.weather.min)} bis {Math.round(look.weather.max)} °C</span>
        {look.weather.rain!==undefined ? <span>Niederschlag bis {Math.round(look.weather.rain)} %</span> : null}
        {look.weather.wind!==undefined ? <span>Wind bis {Math.round(look.weather.wind)} km/h</span> : null}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>
      </> : <span>Ohne Wetterdaten</span>}
    </div> : null}
    {look.fragrance ? <section className="outfit-scent"><img src={scentPhotoPath(look.fragrance.id)} alt="" loading="lazy"/>
      <div><h3>{[look.fragrance.brand,look.fragrance.name].filter(Boolean).join(' · ')}</h3><p>{look.fragrance.reason}</p>{look.fragrance.pairing ? <small>{look.fragrance.pairing}</small>:null}</div>
    </section>:null}
    <div className="outfit-look-grid">{outfitSlotOrder.map(slot=>{
      const items=pieces.filter(item=>outfitSlot(item)===slot)
      return <section className="outfit-look-slot" key={slot} aria-label={outfitSlots[slot]}>
        {items.length ? items.map(item=><Piece key={item.id} item={item} imageVersion={imageVersion} />) :
          <div className="outfit-empty-slot"><small>{outfitSlots[slot]}</small><span>Kein Teil gewählt</span></div>}
      </section>
    })}</div>
    <div className="outfit-details">
      <section><h3>Styling-Tipps</h3><ul>{look.tips.map(tip => <li key={tip}>{tip}</li>)}</ul></section>

    </div>
    {actions ? <div className="outfit-actions">{actions}</div> : null}
  </article>
}

type PreparedPiece = { draft: Partial<WardrobeDraft>, photoToken?: string, note?: string, colors?:string[], sizes?:string[] }

type ProductCandidate = { name:string, source:string, draft:Partial<WardrobeDraft>, photoToken:string, colors?:string[], sizes?:string[] }
const preparedPath = (token:string) => '/api/outfits/prepared-photo?token='+encodeURIComponent(token)

const importFormats = 'image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif'

async function sendOutfitImage<T>(path: string, file: File, codex=false): Promise<T> {
  if (file.size > 16 * 1024 * 1024) throw Error('Das Foto darf höchstens 16 MB groß sein.')
  const response = await fetch(path, {
    method:'POST', headers:{ 'Content-Type':'application/octet-stream','X-LifePilot-Confirm':codex?'codex-image':'image' },
    body:file, signal:AbortSignal.timeout(codex?105000:50000),
  })
  const value = await response.json()
  if (!response.ok) throw Error(value.error)
  return value
}
function analyzePhoto(file: File, codex: boolean) { return sendOutfitImage<PreparedPiece>('/api/outfits/analyze-photo',file,codex) }
const lookPhotoPath = (id: string) => '/api/outfits/look-photo?photo='+encodeURIComponent(id)

function LookPhotos({look,reload}:{look?:Overview['looks'][number],reload:()=>Promise<void>}) {
  const [file,setFile]=useState<File>()
  const [title,setTitle]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  return <form className="outfit-form look-upload" onSubmit={async event=>{
    event.preventDefault()
    if (!file || busy) return
    const form=event.currentTarget
    const query=new URLSearchParams(look?{look:look.id}:{name:title.trim()})
    if (look?.photoIds[0]) query.set('replace',look.photoIds[0])
    setBusy(true);setError('')
    try {
      await sendOutfitImage('/api/outfits/look-photo?'+query,file)
      setFile(undefined);setTitle('');form.reset();await reload()
    } catch (reason) {setError(message(reason))} finally {setBusy(false)}
  }}>
    {!look && <label>Name <input maxLength={120} value={title} onChange={event=>setTitle(event.target.value)} placeholder="Optional"/></label>}
    <label>{look?.photoIds.length?'Tragefoto ersetzen':'Tragefoto auswählen'}
      <input type="file" accept={importFormats} disabled={busy} onChange={event=>setFile(event.currentTarget.files?.[0])}/>
    </label>
    <div className="outfit-actions"><button type="submit" className="outfit-primary" disabled={busy||!file}>
      {look?'Foto speichern':'Eigenen Look speichern'}</button></div>
    {busy && <progress aria-label="Tragefoto wird gespeichert"/>}
    {error && <p role="alert">{error}</p>}
  </form>
}

function LookPieces({look,wardrobe,api,reload,cloudImages}:{
  look:Overview['looks'][number],wardrobe:WardrobeItem[],api:Api,reload:()=>Promise<void>,cloudImages:boolean
}) {
  const [picked,setPicked]=useState(look.itemIds)
  const [suggested,setSuggested]=useState<string[]>([])
  const [busy,setBusy]=useState(false)
  const [feedback,setFeedback]=useState('')
  async function perform(action:()=>Promise<void>) {
    setBusy(true);setFeedback('')
    try {await action()} catch (reason) {setFeedback(message(reason))} finally {setBusy(false)}
  }
  return <div className="outfit-form">
    {look.photoIds[0] && <button type="button" disabled={busy} onClick={()=>void perform(async()=>{
      const result=await api<{pieces:{name:string,suggestions:string[]}[]}>('/outfits/look-analyze',{photo:look.photoIds[0],confirm:true,codex:cloudImages && confirmImageTransfer()},105000)
      setSuggested(result.pieces.flatMap(piece=>piece.suggestions))
      setFeedback(result.pieces.some(piece=>piece.suggestions.length)?'Passende Teile sind in der Auswahl markiert.':'Keine passenden Teile erkannt. Wähle sie unten aus.')
    })}>Teilvorschläge aus dem Foto</button>}
    <div className="outfit-form-grid">{Object.entries(wardrobeCategories).flatMap(([category,label])=>{
      const available=wardrobe.filter(item=>item.category===category)
      const types=[...new Set(available.map(item=>item.garmentType||label))]
      if (!types.length) types.push(label)
      return types.flatMap(type=>{
        const options=available.filter(item=>(item.garmentType||label)===type)
        const selected=picked.filter(id=>options.some(item=>item.id===id))
        return (selected.length?selected:['']).map((id,index)=><label key={category+type+index}>
          {type}<select value={id} disabled={busy} onChange={event=>{
            const value=event.currentTarget.value
            setPicked(current=>[...current.filter(entry=>entry!==id),...(value?[value]:[])])
          }}><option value="">Nicht angehabt</option>{options.filter(item=>!selected.includes(item.id)||item.id===id)
            .map(item=><option key={item.id} value={item.id}>{suggested.includes(item.id)?'Vorschlag · ':''}{item.name}</option>)}
          </select>
        </label>)
      })
    })}</div>
    <div className="outfit-actions"><button type="button" disabled={busy || picked.join(',')===look.itemIds.join(',')} onClick={()=>void perform(async()=>{
      await api('/outfits/look-pieces',{look:look.id,items:picked.filter(id=>wardrobe.some(item=>item.id===id)),confirm:true})
      await reload();setFeedback('Zuordnung gespeichert.')
    })}>Zuordnung speichern</button></div>
    {feedback && <p role="status">{feedback}</p>}
  </div>
}

function WardrobeChoice({label,value,options,maxLength,onChange}:{
  label:string, value:string, options:readonly string[], maxLength:number, onChange:(value:string)=>void,
}) {
  const [custom,setCustom]=useState(false)
  const choices=[...new Set([...options,...(value?[value]:[])])]
  return <div className="wardrobe-attribute-choice">
    {custom ? <>
      <label>{label}<input autoFocus maxLength={maxLength} value={value}
        onChange={event=>onChange(event.currentTarget.value)}/></label>
      <button type="button" className="quiet" onClick={()=>setCustom(false)} aria-label={label+' aus Liste wählen'}>Liste</button>
    </> : <label>{label}<select value={value} onChange={event=>{
      if(event.currentTarget.selectedOptions[0]?.dataset.custom) setCustom(true)
      else onChange(event.currentTarget.value)
    }}>
      <option value="">Offen</option>
      {choices.map(choice=><option key={choice}>{choice}</option>)}
      <option data-custom="true">Eigene Angabe …</option>
    </select></label>}
  </div>
}

function sizeField(category:WardrobeDraft['category']) {
  if(category==='top'||category==='outer') return fitFields[1]
  if(category==='bottom') return fitFields[2]
  if(category==='shoes') return fitFields[3]
}

function WardrobeEditor({ api, item, profile, onDone, onCancel, cloudImages }: {
  api:Api, item:WardrobeItem|null, profile:StyleProfile, onDone:()=>Promise<void>, onCancel:()=>void, cloudImages:boolean,
}) {
  const [draft,setDraft] = useState<WardrobeDraft>(()=>item ? {...item,color:productColorName(item.color)} : emptyWardrobe)
  const [mode,setMode] = useState<'photo'|'link'|'basic'>()
  const [searchName,setSearchName] = useState('')
  const [basicSearched,setBasicSearched] = useState(false)
  const [enterSource,setEnterSource] = useState(!item)
  const [sizeEdited,setSizeEdited] = useState(Boolean(item?.size))
  const [productOptions,setProductOptions]=useState<{colors:string[],sizes:string[]}>()
  const [address,setAddress] = useState(item?.source ?? '')
  const [photoToken,setPhotoToken] = useState<string>()
  const [searchOpen,setSearchOpen] = useState(false)
  const [searchDetails,setSearchDetails] = useState('')
  const [candidates,setCandidates] = useState<ProductCandidate[]>([])
  function clearSearch() {
    setCandidates([]);setSearchOpen(false);setSearchDetails('')
  }
  const [busy,setBusy] = useState(false)
  const [feedback,setFeedback] = useState('')
  const [failed,setFailed] = useState(false)
  const [files,setFiles] = useState<File[]>([])
  const [fileIndex,setFileIndex] = useState(0)
  const [hints,setHints] = useState<Partial<WardrobeDraft>>({})
  const hintFields=[['name','Bezeichnung',120],['brand','Marke',70],['color','Farbe',100],
    ['size','Größe',40],['material','Material',120],['fit','Passform',70]] as const
  function selectPhoto(index:number) {
    setFileIndex(index);setHints({});setPhotoToken(undefined);setProductOptions(undefined)
    clearSearch();setSizeEdited(false);setEnterSource(true);setFeedback('')
  }
  function queryFor(details:WardrobeDraft) {
    return [...new Set([details.brand,details.name,details.color,details.size,details.material,details.fit,searchDetails]
      .map(value=>value?.trim()).filter(Boolean))].join(' ').slice(0,420)
  }
  async function findProducts(query:string) {
    if (query.length<3) {
      setFeedback('Ergänze den Namen oder ein Produktmerkmal, um nach Bildern zu suchen.')
      return
    }
    const result=await api<{candidates:ProductCandidate[]}>('/outfits/product-search',{query,confirm:true},76000)
    setCandidates(result.candidates)
    if (!result.candidates.length) setFeedback('Kein passendes Produktbild gefunden.')
  }
  function withProfileSize(details:WardrobeDraft) {
    const field=sizeField(details.category)
    return {...details,size:(field && profile[field[0]]) || details.size || ''}
  }
  async function prepareNext(file:File,search:boolean) {
    const result=await analyzePhoto(file,cloudImages && confirmImageTransfer())
    const inputs=Object.fromEntries(Object.entries(hints).filter(([,value])=>value.trim()).map(([key,value])=>[key,value.trim()]))
    const recognized=withProfileSize({...emptyWardrobe,...result.draft,...outfitGarment(hints.name??''),
      ...inputs,color:productColorName(hints.color || result.draft.color || '')})
    if(hints.size) recognized.size=hints.size
    setSizeEdited(Boolean(hints.size))
    setDraft(recognized)
    setPhotoToken(result.photoToken)
    setProductOptions(undefined)
    setCandidates([])
    setSearchOpen(search)
    setEnterSource(search)
    setFeedback(result.note || 'Prüfe die erkannten Angaben.')
    if (search) await findProducts(queryFor(recognized))
  }
  function change<K extends keyof WardrobeDraft>(key: K, value: WardrobeDraft[K]) {
    if(key==='size') setSizeEdited(true)
    setDraft(current=>{
      const next={...current,[key]:value}
      if(key!=='category') return next
      next.garmentType=''
      return sizeEdited ? next : withProfileSize({...next,size:''})
    })
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true); setFeedback(''); setFailed(false)
    try { await action() } catch (error) { setFailed(true); setFeedback(message(error)) } finally { setBusy(false) }
  }
  async function loadProduct(link:string, color?:string) {
    const result=await api<PreparedPiece>('/outfits/product',{address:link,color,prepareImage:true,confirm:true},33000)
    const sizes=result.sizes ?? []
    setDraft(current=>color ? {...current,color:productColorName(result.draft.color ?? color)} :
      withProfileSize({...emptyWardrobe,...result.draft}))
    setPhotoToken(result.photoToken)
    setProductOptions({colors:result.colors ?? [],sizes})
    setFeedback(result.note ?? '')
  }
  function selectSource(source:'photo'|'link'|'basic') {
    setMode(source);setFeedback('');setFailed(false);setBasicSearched(false)
    setPhotoToken(undefined);setProductOptions(undefined);setSizeEdited(false)
    clearSearch()
    if(source!=='photo'){setFiles([]);setFileIndex(0)}
  }
  function reviewBasicResult(candidate?:ProductCandidate) {
    const name=candidate?.name ?? searchName.trim()
    const {color,...attributes}=candidate?.draft ?? {}
    const photoDraft=mode==='photo' ? draft : emptyWardrobe
    const details=withProfileSize({...photoDraft,
      ...productWardrobeFields(name,'',mode==='photo'?queryFor(photoDraft):searchName.trim(),{
        ...attributes,...(color && !color.includes('#') && {color}),
      },color),source:candidate?.source ?? photoDraft.source})
    if(mode==='photo' && sizeEdited) details.size=draft.size??''
    setDraft(details)
    setPhotoToken(candidate?.photoToken)
    setProductOptions(candidate && {colors:candidate.colors??[],sizes:candidate.sizes??[]})
    setFeedback('')
    setEnterSource(false)
  }
  function cancelDetails() {
    if(item) return onCancel()
    setDraft(emptyWardrobe)
    setPhotoToken(undefined)
    setProductOptions(undefined)
    setSizeEdited(false)
    setSearchOpen(false)
    if(mode==='photo') setCandidates([])
    setFeedback('')
    setFailed(false)
    setEnterSource(true)
  }
  function changeColor(color:string) {
    const variant=productOptions?.colors.find(option=>productColorName(option)===color)
    if(variant && color!==draft.color && draft.source) {
      void perform(()=>loadProduct(draft.source,variant))
    } else change('color',color)
  }
  function inspect(event: FormEvent) {
    event.preventDefault()
    if(mode==='basic' && searchName.trim().length>=3) {
      void perform(async()=>{
        setBasicSearched(false);setCandidates([])
        await findProducts(searchName.trim())
        setBasicSearched(true)
      })
    } else if(mode==='link' && address.trim()) {
      void perform(async()=>{
        await loadProduct(address.trim())
        clearSearch()
        setEnterSource(false)
      })
    }
  }
  async function saveChoice() {
    await api('/outfits/item',{draft:{...draft,color:productColorName(draft.color)},item:item?.id,photoToken,confirm:true})
    if (files[fileIndex+1]) selectPhoto(fileIndex+1)
    else await onDone()
  }
  function save(event: FormEvent) {
    event.preventDefault()
    void perform(saveChoice)
  }
  const ownPreview = photoToken ? preparedPath(photoToken) :
    item?.hasPhoto ? photoPath(item.id) : undefined
  const profileSizes=sizeField(draft.category)?.[2] ?? []
  const sizes=[...(productOptions?.sizes ?? []),...profileSizes]
  const colors=[...(productOptions?.colors ?? []).map(productColorName).filter(Boolean),
    'Weiß','Cremeweiß','Schwarz','Grau','Beige','Braun','Rot','Weinrot','Blau','Dunkelblau','Hellblau',
    'Grün','Olivgrün','Gelb','Orange','Rosa','Violett','Türkis']
  return <form className="outfit-form" onSubmit={enterSource ? inspect : save}>
    <h2>{item ? 'Kleidungsstück bearbeiten' : 'Kleidungsstück hinzufügen'}</h2>
    <fieldset disabled={busy}>
      {files.length>1 ? <p role="status">Foto {fileIndex+1} von {files.length} · {files[fileIndex]?.name}</p> : null}
      {enterSource ? <>
        <div className="outfit-chips" aria-label="Quelle auswählen">
          <button type="button" aria-pressed={mode==='photo'} onClick={()=>selectSource('photo')}>Eigenes Bild oder Screenshot</button>
          <button type="button" aria-pressed={mode==='link'} onClick={()=>selectSource('link')}>Produktlink</button>
          <button type="button" aria-pressed={mode==='basic'} onClick={()=>selectSource('basic')}>Einfache Suche</button>
        </div>
        {mode==='photo' ? <label>{item?'Foto oder Screenshot auswählen':'Fotos oder Screenshots auswählen'}<input type="file" accept={importFormats} multiple={!item}
          onChange={event=>{
            const selected=Array.from(event.currentTarget.files??[])
            if (!selected.length) return
            if (selected.length>40) {setFailed(true);setFeedback('Wähle höchstens 40 Bilder pro Import.');return}
            setFiles(selected);selectPhoto(0)
          }} /></label> : mode==='link' ?
          <label>Produktlink<input type="url" autoFocus required maxLength={500} placeholder="https://" value={address}
            onChange={event=>setAddress(event.target.value)} /></label> : null}
        {mode==='basic' ? <>
          <div className="outfit-actions wardrobe-name-search">
            <label>Name des Kleidungsstücks<input type="search" autoFocus required maxLength={420}
              placeholder="z. B. Levi’s 501 Jeans" value={searchName} onChange={event=>{
                setSearchName(event.currentTarget.value);setBasicSearched(false);setCandidates([]);setFeedback('')
              }}/></label>
            <button type="submit" className="outfit-primary" disabled={searchName.trim().length<3}>Teil suchen</button>
          </div>
          {basicSearched && !candidates.length ? <button type="button" onClick={()=>reviewBasicResult()}>Manuell erfassen</button> : null}
        </> : null}
        {mode==='photo' && files[fileIndex] ? <section className="outfit-product-search" aria-labelledby="outfit-import-hints">
          <h3 id="outfit-import-hints">Was weißt du über das Teil?</h3>
          <p>Alle Angaben sind optional. Für die Produktsuche werden nur Suchwörter verwendet. Dein Foto bleibt auf dem Mac.</p>
          <div className="outfit-form-grid">{hintFields.map(([key,label,limit])=><label key={key}>{label}
            <input maxLength={limit} value={hints[key]??''} onChange={event=>setHints(current=>({...current,[key]:event.target.value}))}/>
          </label>)}</div>
          <label>Weitere Suchhinweise<input maxLength={180} value={searchDetails} onChange={event=>setSearchDetails(event.target.value)}
            placeholder="z. B. gerippter Kragen oder Artikelnummer" /></label>
          <div className="outfit-actions">
            <button type="button" className="outfit-primary" onClick={()=>void perform(()=>prepareNext(files[fileIndex],true))}>Produktbild suchen</button>
            <button type="button" onClick={()=>void perform(()=>prepareNext(files[fileIndex],false))}>Eigenes Foto analysieren</button>
          </div>
        </section> : null}
        {mode==='photo' && searchOpen && photoToken ? <button type="button"
          onClick={()=>{setEnterSource(false);setFeedback('')}}>Eigenes Foto verwenden</button> : null}
          {candidates.length>0 ? <div className="outfit-product-grid">
            {candidates.map(candidate=><figure key={candidate.photoToken}>
              <img src={preparedPath(candidate.photoToken)} alt={candidate.name}/>
              <figcaption>{candidate.name}</figcaption>
              <button type="button" aria-label={'Treffer auswählen: '+candidate.name}
                onClick={()=>reviewBasicResult(candidate)}>Auswählen</button>
            </figure>)}
          </div> : null}
        {busy ? <div className="loading" role="status"><span>Quelle wird analysiert …</span><progress aria-label="Kleidungsstück wird analysiert" /></div> : null}
        <div className="outfit-actions">
          {mode==='link' ? <button type="submit" className="outfit-primary" disabled={!address.trim()}>Link einlesen</button> : null}
          {failed && files[fileIndex+1] ? <button type="button" onClick={()=>selectPhoto(fileIndex+1)}>Foto überspringen</button>:null}
          <button type="button" onClick={onCancel}>Abbrechen</button>
        </div>
      </> : <>
        {ownPreview ? <div className="outfit-preview"><img src={ownPreview} alt="Vorschau des Kleidungsstücks" /></div> : null}
        <div className="wardrobe-attributes">
          <label>Name<input autoFocus={Boolean(item)} required maxLength={120} value={draft.name} onChange={event=>change('name',event.currentTarget.value)}/></label>
          <label>Kategorie<select value={draft.category} onChange={event=>change('category',event.currentTarget.value as WardrobeDraft['category'])}>
            {Object.entries(wardrobeCategories).map(([value,label])=><option value={value} key={value}>{label}</option>)}
          </select></label>
          <label>Art des Kleidungsstücks<select value={draft.garmentType??''} onChange={event=>change('garmentType',event.currentTarget.value)}>
            <option value="">Allgemein</option>
            {wardrobeTypes[draft.category].map(label=><option key={label}>{label}</option>)}
          </select></label>
          <WardrobeChoice label="Größe" value={draft.size??''} options={sizes} maxLength={40} onChange={value=>change('size',value)}/>
          <label>Marke<input maxLength={70} value={draft.brand??''} onChange={event=>change('brand',event.currentTarget.value)}/></label>
          <WardrobeChoice label="Farbe" value={draft.color} options={colors} maxLength={100} onChange={changeColor}/>
          <WardrobeChoice label="Passform" value={draft.fit} options={['Slim Fit','Regular Fit','Relaxed Fit','Straight Fit','Loose Fit','Oversized',...preferredCuts]}
            maxLength={70} onChange={value=>change('fit',value)}/>
          <WardrobeChoice label="Material" value={draft.material} options={['Baumwolle','Leinen','Wolle','Kaschmir','Seide','Viskose','Polyester','Denim','Leder']}
            maxLength={120} onChange={value=>change('material',value)}/>
          <WardrobeChoice label="Saison" value={draft.season} options={['Ganzjährig','Frühling','Sommer','Herbst','Winter','Frühling, Sommer','Herbst, Winter']}
            maxLength={70} onChange={value=>change('season',value)}/>
        </div>
        <div className="outfit-actions wardrobe-save-actions">
          <button type="button" onClick={cancelDetails}>Abbrechen</button>
          <button type="submit" className="outfit-primary" disabled={!draft.name.trim()}>Teil speichern</button>
        </div>
      </>}
    </fieldset>
    {feedback ? <p role={failed?'alert':'status'}>{feedback}</p> : null}
  </form>
}

function FitEditor({ api, overview, imageVersion, reload }: { api: Api, overview: Overview, imageVersion: number, reload: () => Promise<void> }) {
  const [section,setSection] = useState<'Passform'|'Stil'|'Referenzfoto'>('Passform')
  const [profile,setProfile] = useState(overview.profile)
  const [file,setFile] = useState<File>()
  const [busy,setBusy] = useState(false)
  const [feedback,setFeedback] = useState('')
  const [failed,setFailed] = useState(false)

  async function apply(action: () => Promise<void>, success: string) {
    if (busy) return
    setBusy(true); setFeedback(''); setFailed(false)
    try { await action(); await reload(); setFeedback(success) }
    catch (error) { setFailed(true); setFeedback(message(error)) }
    finally { setBusy(false) }
  }
  function field([key,label,options]: readonly [keyof StyleProfile,string,readonly string[]]) {
    const value = profile[key]
    return <label key={key}>{label}
      <select value={value} onChange={event=>setProfile(current=>({...current,[key]:event.target.value}))}>
        <option value="">Keine Angabe</option>
        {value && !options.includes(value) ? <option value={value}>{value} · bisher gespeichert</option> : null}
        {options.map(option=><option key={option}>{option}</option>)}
      </select>
    </label>
  }
  return <section className="outfit-form outfit-settings">
    <nav className="outfit-chips" aria-label="Outfit-Einstellungen">
      {(['Passform','Stil','Referenzfoto'] as const).map(item=><button type="button" key={item}
        disabled={busy} aria-pressed={section===item} onClick={()=>{setSection(item);setFeedback('')}}>{item}</button>)}
    </nav>
    {section==='Referenzfoto' ? <div className="outfit-photo-settings">
      {overview.profilePhoto ? <div className="outfit-profile-photo">
        <img src={photoPath('profile') + '&v=' + imageVersion} alt="Persönliches Referenzfoto" />
        <button type="button" disabled={busy} onClick={()=>void apply(async()=>{
          await api('/outfits/remove',{target:'profile-photo',confirm:true})
          setFile(undefined)
        },'Referenzfoto entfernt.')}>Foto entfernen</button>
      </div> : null}
      <label>{overview.profilePhoto?'Neues Foto auswählen':'Foto auswählen'}
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event=>setFile(event.target.files?.[0])} />
      </label>
      {file ? <small>{file.name}</small> : null}
      <button type="button" className="outfit-primary" disabled={busy || !file} onClick={()=>file && void apply(async()=>{
        await upload('profile',file)
        setFile(undefined)
      },'Referenzfoto gespeichert.')}>Foto speichern</button>
      <small>Das Referenzfoto bleibt auf diesem Mac.</small>
    </div> : <form onSubmit={event=>{
      event.preventDefault()
      void apply(async()=>{ await api('/outfits/profile',{profile,confirm:true}) },'Einstellungen gespeichert.')
    }}>
      <fieldset disabled={busy}>
        <div className="outfit-form-grid">{(section==='Passform'?fitFields:styleFields).map(field)}</div>
        <button className="outfit-primary" type="submit">Einstellungen speichern</button>
      </fieldset>
    </form>}
    {feedback ? <p role={failed?'alert':'status'}>{feedback}</p> : null}
  </section>
}

export function OutfitAssistant({ api, initialPlan, initialChoice, initialError, fragranceNames, initialRequired, cloudImages, onOpenPlanner }: {
  api:Api, initialPlan?:OutfitChatPlan, initialChoice?:OutfitChoice, initialError?:string, fragranceNames?:string[], initialRequired?:string[], cloudImages:boolean, onOpenPlanner?:()=>void,
}) {
  const [tab,setTab] = useState<Tab>(fragranceNames?.length?'Parfüm':'Styling-Studio')
  const [overview,setOverview] = useState<Overview>()
  const [imageVersion,setImageVersion] = useState(0)
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(false)
  const [generating,setGenerating] = useState(false)
  const [notice,setNotice] = useState('')
  const [error,setError] = useState(initialError ?? '')
  const [query,setQuery] = useState<Omit<OutfitQuery,'mode'|'style'> & {style?:OutfitQuery['style']}>({
    occasion:initialPlan?.occasion ?? '', daypart:initialPlan?.daypart??undefined, required:initialRequired??[],
    style:initialChoice?.look.style,variant:0 })
  const today=dateInBerlin()
  const [weatherInput,setPlace] = useState(initialPlan?.place ?? undefined)
  const place=weatherInput??overview?.weatherPlace??''
  const [day,setDay] = useState(initialPlan?.date ?? today)
  const [calendarEvents,setCalendarEvents]=useState<{id:string,title:string,at?:string,category?:string|null}[]>([])
  const [eventId,setEventId]=useState('')
  const [calendarStatus,setCalendarStatus]=useState('')
  const selectedEvent=calendarEvents.find(item=>item.id===eventId)
  const eventContext=selectedEvent?outfitCalendarContext(selectedEvent.title,selectedEvent.at,selectedEvent.category):undefined
  const selectedStyle = query.style || eventContext?.style || overview?.profile.preferredStyle || 'Schlicht'
  useEffect(()=>{
    if(tab!=='Styling-Studio'||!day)return
    let current=true
    setCalendarStatus('Kalendertermine werden geladen …')
    setCalendarEvents([]);setEventId('')
    void api<Week&{external?:GoogleEvent[],calendarIncomplete?:boolean}>('/calendar-grid?'+new URLSearchParams({start:day,days:'1'}))
      .then(result=>{
        if(!current)return
        const local=result.entries.filter(item=>item.day===day&&['slot','appointment'].includes(item.kind))
          .map(item=>({id:'local:'+item.id,title:item.title,at:item.at??undefined,category:item.category}))
        const remote=(result.external??[]).map(item=>({id:'google:'+item.id,title:item.title,at:item.allDay?undefined:item.start}))
        setCalendarEvents([...local,...remote])
        setCalendarStatus(result.calendarIncomplete?'Google-Termine sind teilweise nicht verfügbar.':'')
      },()=>{if(current)setCalendarStatus('Kalendertermine sind gerade nicht verfügbar.')})
    return ()=>{current=false}
  },[api,day,tab])
  const [choice,setChoice] = useState<OutfitChoice | undefined>(initialChoice)
  const [saved,setSaved] = useState(false)
  const [editor,setEditor] = useState<WardrobeItem | null>()
  const [packingItem,setPackingItem]=useState<string>()
  const [resaleItem,setResaleItem]=useState<WardrobeItem>()
  const [wardrobeRemoval,setWardrobeRemoval] = useState<WardrobeItem>()
  const wardrobeRemovalDialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    if(wardrobeRemoval && !wardrobeRemovalDialog.current?.open) wardrobeRemovalDialog.current?.showModal()
  },[wardrobeRemoval])
  const [removing,setRemoving] = useState('')
  const [editLook,setEditLook] = useState<string>()
  const [lookFilter,setLookFilter] = useState('')
  useEffect(() => {
    let active = true
    void api<Overview>('/outfits').then(result => { if(active) setOverview(result) })
      .catch(cause => { if(active) setError(message(cause)) }).finally(() => { if(active) setLoading(false) })
    return () => { active = false }
  },[api])
  async function reload() {
    setOverview(await api<Overview>('/outfits'))
    setImageVersion(version => version+1)
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (cause) { setError(message(cause)) } finally { setBusy(false) }
  }
  function change<K extends keyof typeof query>(key: K, value: typeof query[K]) {
    setQuery(current=>({...current,[key]:value,variant:0}))
  }
  function generate(variant: boolean) {
    setGenerating(true)
    void perform(async () => {
      const next: OutfitQuery = {...query, style:selectedStyle, mode,
        occasion:query.occasion.trim()||eventContext?.occasion||'',daypart:query.daypart??eventContext?.daypart,time:eventContext?.time, variant:variant ? query.variant+1 : 0,
        place:day<=lastWeatherDay?place.trim()||undefined:undefined, date:day}
      const result = await api<OutfitChoice>('/outfits/generate',{ query:next,confirm:true },20000)
      setChoice(result); setSaved(false); setQuery(current=>({...current,variant:next.variant}))
    }).finally(()=>setGenerating(false))
  }
  function remove(target: 'item' | 'look', item: string) {
    void perform(async () => {
      await api('/outfits/remove',{target,item,confirm:true})
      setRemoving('')
      await reload()
    })
  }
  function toggleWardrobeSorting(item:WardrobeItem) {
    const restore=item.saleState==='sorted'
    void perform(async()=>{
      await api('/outfits/resale',{item:item.id,action:restore?'restore':'sorted',confirm:true})
      await reload()
      setNotice(restore?'Zurück im Kleiderschrank.':'Teil aussortiert.')
    })
  }
  function wardrobeGrid(items:WardrobeItem[]) {
    return <div className="outfit-wardrobe-grid">{items.map(item=>(
      <div key={item.id} className={item.saleState?'outfit-inventory wardrobe-inactive':'outfit-inventory'}>
        <Piece item={item} imageVersion={imageVersion} />
        <WardrobeMenu title={productDisplayName(item.name)}>
          <button type="button" onClick={()=>setEditor(item)}>Bearbeiten</button>
          <button type="button" disabled={busy || Boolean(item.orderState || item.saleState)}
            onClick={()=>{setPackingItem(item.id);setTab('Urlaubsgarderobe')}}>Zur Urlaubspackliste hinzufügen</button>
          <button type="button" disabled={busy || Boolean(item.orderState)} onClick={()=>void perform(async()=>{
            await api('/outfits/resale',{item:item.id,action:'start',confirm:true})
            await reload();setResaleItem(item);setTab('Verkaufen')
          })}>Verkaufen</button>
          <button type="button" disabled={busy || Boolean(item.orderState)}
            onClick={()=>toggleWardrobeSorting(item)}>{item.saleState==='sorted'?'Einsortieren':'Aussortieren'}</button>
          <button type="button" className="wardrobe-remove-action" disabled={busy || Boolean(item.orderState)}
            onClick={()=>setWardrobeRemoval(item)}>Entfernen</button>
        </WardrobeMenu>
        {item.saleState==='sorted' ? <div className="outfit-actions">
          <button type="button" disabled={busy} onClick={()=>toggleWardrobeSorting(item)}>Zurück in den Kleiderschrank</button>
        </div> : null}
      </div>
    ))}</div>
  }
  const sortedItems=overview?.wardrobe.filter(item=>item.saleState==='sorted') ?? []
  const looks = overview?.looks.filter(look => [look.title,look.occasion,look.style].join(' ').toLocaleLowerCase('de-DE')
    .includes(overview.looks.length > 1 ? lookFilter.trim().toLocaleLowerCase('de-DE') : '')) ?? []
  const mode = query.required.length ? 'anchor' : query.occasion.trim() || eventContext ? 'occasion' : 'inspiration'
  const lastWeatherDay = shiftDay(today,15)
  const validDay = day >= today
  const ready = Boolean(overview?.wardrobe.some(item=>!item.orderState && !item.saleState) && validDay)

  return <div className="outfit-space">
    <div className="outfit-navigation">
      <nav className="outfit-tabs" aria-label="Outfit-Assistent">
        {tabs.map(name=><button key={name} type="button" aria-current={tab===name?'page':undefined} onClick={()=>{
          setPackingItem(undefined);setTab(name); if (name==='Verkaufen') setResaleItem(undefined); setError(''); setNotice(''); setRemoving('')
        }}>{name}</button>)}
      </nav>
      <button className="icon-button outfit-settings-trigger" type="button" aria-label="Outfit-Einstellungen" title="Outfit-Einstellungen"
        aria-pressed={tab==='Einstellungen'} onClick={()=>{setTab('Einstellungen');setError('');setNotice('');setRemoving('')}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 3h4l.6 2.5 2 .9 2.3-1.3 2 3.4-1.8 1.8.2 2.3 2 1.6-2 3.5-2.5-.8-1.9 1.2-.3 2.9h-4l-.6-2.5-2-.9-2.3 1.3-2-3.4 1.8-1.8-.2-2.3-2-1.6 2-3.5 2.5.8 1.9-1.2Z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>
    </div>
    <div className="outfit-body">
      {loading ? <div className="loading" role="status"><span>Kleiderschrank wird geladen …</span><progress aria-label="Kleiderschrank wird geladen" /></div> : null}
      {generating ? <div className="loading" role="status"><span>Outfit wird erstellt …</span><progress aria-label="Outfit wird erstellt" /></div> : null}
      {error ? <p className="outfit-feedback" role="alert">{error}</p> : null}
      {notice ? <p className="outfit-feedback" role="status">{notice}</p> : null}
      {!loading && !overview ? <button type="button" disabled={busy} onClick={()=>void perform(reload)}>Erneut laden</button> : null}
      {overview && tab==='Styling-Studio' ? <>
        <form className="outfit-form" onSubmit={event=>{event.preventDefault(); generate(false)}}>
          <fieldset disabled={busy}>
            <label>Für wann?<DateInput aria-label="Für wann?" min={today} value={day}
              onChange={event=>{setEventId('');setDay(event.target.value||today);change('variant',0)}}/></label>
            <label>Kalendertermin (optional)<select aria-label="Kalendertermin (optional)" value={eventId}
              onChange={event=>{setEventId(event.target.value);change('variant',0)}}>
              <option value="">{calendarEvents.length?'Keinen Termin auswählen':'Keine Termine zur Auswahl'}</option>
              {calendarEvents.map(item=><option key={item.id} value={item.id}>
                {outfitCalendarContext(item.title,item.at).time??'Ganztägig'} · {item.title}</option>)}
            </select></label>
            {calendarStatus?<small role="status">{calendarStatus}</small>:null}
            {eventContext?<small>{eventContext.occasion}{eventContext.daypart?' · '+eventContext.daypart:''}</small>:null}
            <label>Tageszeit<select value={query.daypart??eventContext?.daypart??''}
              onChange={event=>change('daypart',event.target.value as OutfitQuery['daypart'] || undefined)}>
              <option value="">Egal</option>{outfitDayparts.map(part=><option key={part}>{part}</option>)}
            </select></label>
            {overview.wardrobe.length ? <>
              <label>Anlass (optional)<input maxLength={110} placeholder="z. B. Abendessen mit Freunden" value={query.occasion}
                onChange={event=>change('occasion',event.target.value)} /></label>
              <details className="outfit-options" open={Boolean(initialPlan?.anchor && !initialRequired?.length) || undefined}><summary>Stil, Wetter und Kleidungsstücke{query.required.length ? ' · ' + query.required.length + ' gewählt' : ''}</summary>
                <div className="outfit-form-grid">
                  <label>Stil<select value={selectedStyle} onChange={event=>change('style',event.target.value as OutfitQuery['style'])}>
                    {outfitStyles.map(style=><option key={style}>{style}</option>)}</select></label>
                  <label>Ort für das Wetter<input maxLength={80} value={place} placeholder="z. B. Stuttgart"
                    onChange={event=>{setPlace(event.target.value);change('variant',0)}} /></label>
                </div>
                {place.trim()&&day>lastWeatherDay&&<small>Die Wettervorhersage reicht bis zu 15 Tage im Voraus.</small>}
                <fieldset className="outfit-anchors"><legend>Teile, die dabei sein sollen (max. 1 pro Kategorie)</legend>
                  <div className="outfit-anchor-groups">
                    {outfitSlotOrder.map(slot=>{
                      const items=overview.wardrobe.filter(item=>!item.orderState && !item.saleState && outfitSlot(item)===slot)
                      if (!items.length) return null
                      const selectedId=items.find(item=>query.required.includes(item.id))?.id
                      return <div key={slot} className="outfit-anchor-group">
                        <strong>{outfitSlots[slot]}</strong>
                        <div className="outfit-anchor-list">
                          {items.map(item=>{
                            const checked=selectedId===item.id
                            return <label key={item.id} className="outfit-check" data-checked={checked||undefined}>
                              <input type="checkbox" checked={checked}
                                onChange={event=>{
                                  const others=query.required.filter(id=>{
                                    const found=overview.wardrobe.find(entry=>entry.id===id)
                                    return found && outfitSlot(found)!==slot
                                  })
                                  change('required',event.target.checked ? [...others,item.id] : others)
                                }} />
                              <span title={item.name}>{productDisplayName(item.name)}</span>
                            </label>
                          })}
                        </div>
                      </div>
                    })}
                  </div>
                </fieldset>
              </details>
              {!validDay ? <p role="alert">Wähle heute oder ein späteres Datum.</p> : null}
            </> : null}
            {overview.wardrobe.length ? <button type="submit" className="outfit-primary" disabled={!ready}>
              {generating?'Wird erstellt …':'Outfit erstellen'}</button> :
              <button type="button" className="outfit-primary" onClick={()=>{setTab('Kleiderschrank');setEditor(null)}}>Erstes Teil hinzufügen</button>}
          </fieldset>
        </form>
        {choice ? <Board look={choice.look} wardrobe={overview.wardrobe} imageVersion={imageVersion} actions={<>
          <button type="button" disabled={busy || !ready} onClick={()=>generate(true)}>Variante neu würfeln</button>
          <button type="button" className="outfit-primary" disabled={busy || saved} onClick={()=>void perform(async ()=>{
            await api('/outfits/save',{proposal:choice.proposal,confirm:true})
            await reload(); setSaved(true); setNotice('Outfit gespeichert.')
          })}>{saved?'Gespeichert':'Outfit speichern'}</button>
        </>} /> : null}
      </> : null}
      {overview && tab==='Verkaufen' ? <ResalePanel key={resaleItem?.id??'sales'} api={api} item={resaleItem} wardrobe={overview.wardrobe} onDone={reload}/>:null}
      {overview && tab==='Parfüm' ? <FragrancePanel api={api} names={fragranceNames}/>:null}
      {overview && tab==='Urlaubsgarderobe' ? <TravelOutfits key={packingItem??'pack'} api={api} wardrobe={overview.wardrobe} requestedItem={packingItem} onOpenPlanner={onOpenPlanner}
        renderPiece={item=><Piece item={item} imageVersion={imageVersion}/> } renderOutfit={look=><Board look={look} wardrobe={overview.wardrobe} imageVersion={imageVersion}/>}/>:null}
      {overview && tab==='Kleiderschrank' ? <>
        <div className="outfit-bar">
          <button type="button" className="outfit-primary" onClick={()=>setEditor(null)}>Teile hinzufügen</button>
        </div>
        {editor !== undefined ? <WardrobeEditor cloudImages={cloudImages} key={editor?.id ?? 'new'} api={api}
          profile={overview.profile} onCancel={()=>setEditor(undefined)}
          item={editor} onDone={async()=>{await reload();setEditor(undefined)}} /> : null}
        {outfitSlotOrder.map(slot=>{
          const items=overview.wardrobe.filter(item=>outfitSlot(item)===slot&&!item.saleState)
          return <section key={slot} className="wardrobe-section">
            <h3>{outfitSlots[slot]}</h3>
            {items.length ? wardrobeGrid(items) : <p className="wardrobe-empty">Noch keine Artikel hinzugefügt.</p>}
          </section>
        })}
        {sortedItems.length ? <section className="wardrobe-section">
          <h3>Aussortierte Sachen</h3>{wardrobeGrid(sortedItems)}
        </section> : null}
      </> : null}
      {wardrobeRemoval ? <dialog ref={wardrobeRemovalDialog} className="task-dialog card wardrobe-remove-dialog"
        aria-labelledby="wardrobe-remove-title" onCancel={event=>{event.preventDefault();setWardrobeRemoval(undefined)}}>
        <h2 id="wardrobe-remove-title">Kleidungsstück wirklich entfernen?</h2>
        <p>„{wardrobeRemoval.name}“ wird dauerhaft aus dem Kleiderschrank gelöscht.</p>
        <div className="outfit-actions">
          <button type="button" autoFocus onClick={()=>setWardrobeRemoval(undefined)}>Nein</button>
          <button type="button" className="wardrobe-remove-action" onClick={()=>{
            setWardrobeRemoval(undefined)
            remove('item',wardrobeRemoval.id)
          }}>Ja, entfernen</button>
        </div>
      </dialog> : null}
      {overview && tab==='Einstellungen' ? <FitEditor api={api} overview={overview} imageVersion={imageVersion} reload={reload} /> : null}
      {overview && tab==='Meine Looks' ? <>
        <details className="outfit-saved"><summary>Eigenen Look als Foto speichern</summary><LookPhotos reload={reload}/></details>
        {overview.looks.length > 1 ? <div className="outfit-bar">
          <label>Looks suchen<input type="search" value={lookFilter} onChange={event=>setLookFilter(event.target.value)}
            placeholder="Name, Anlass oder Stil" /></label>
        </div> : null}
        {editLook && looks.find(look=>look.id===editLook) ? <section className="outfit-options look-editor">
          {looks.filter(look=>look.id===editLook).map(look=><div key={look.id}>
            <div className="outfit-actions"><h3>{look.title}</h3><button type="button" onClick={()=>setEditLook(undefined)}>Schließen</button></div>
            <LookPhotos look={look} reload={reload}/>
            <LookPieces cloudImages={cloudImages} look={look} wardrobe={overview.wardrobe.filter(item=>!item.orderState&&!item.saleState)} api={api} reload={reload}/>
            <div className="outfit-actions">{removing===look.id ?
              <><button type="button" disabled={busy} onClick={()=>{remove('look',look.id);setEditLook(undefined)}}>Look endgültig löschen</button>
                <button type="button" onClick={()=>setRemoving('')}>Abbrechen</button></> :
              <button type="button" onClick={()=>setRemoving(look.id)}>Look löschen</button>}</div>
          </div>)}
        </section> : null}
        {looks.length ? <div className="outfit-wardrobe-grid">{looks.map(look=>{
          const items=look.itemIds.flatMap(id=>overview.wardrobe.filter(item=>item.id===id))
          const firstImage=items.find(item=>item.hasPhoto)
          const image=look.photoIds[0]?lookPhotoPath(look.photoIds[0]):firstImage?photoPath(firstImage.id):''
          return <article key={look.id} className="outfit-piece look-card">
            {image ? <img src={image+(image.includes('?')?'&':'?')+'v='+imageVersion} alt={look.title} loading="lazy"/> :
              <div className="outfit-piece-placeholder">Look</div>}
            <div><h3>{look.title}</h3>
              {items.length>0 && <ul>{items.map(item=><li key={item.id}>{productDisplayName(item.name)}</li>)}</ul>}
              <button type="button" aria-expanded={editLook===look.id} onClick={()=>{setEditLook(editLook===look.id?undefined:look.id);setRemoving('')}}>Bearbeiten</button>
            </div>
          </article>
        })}</div> : <p>{overview.looks.length?'Keine Looks für diesen Filter.':'Du hast noch keine Looks gespeichert.'}</p>}
      </> : null}
    </div>
  </div>
}
