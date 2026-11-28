import { useEffect, useRef, useState } from 'react'
import { money } from '../runtime/finance-types.ts'
import { depotCategories, depotColors, depotSectors, investedCents, type Candidate, type DepotCategory, type DepotSector, type DepotState, type Holding } from '../runtime/depot-types.ts'

type Api=<T>(path:string,payload?:object,timeout?:number)=>Promise<T>
type Form={id?:string,name:string,isin:string,symbol:string,category:DepotCategory,sector:DepotSector,quantity:string,buyPrice:string,buyDate:string,price:string}
type Recognized={name:string,isin:string,symbol:string,category:DepotCategory,sector:DepotSector,quantity:number|null,price:number|null,valueCents:number}

const palette=['#53836a','#608fb0','#c19a4a','#a476aa','#ad794e','#4f948b','#bf6370','#7b8a52','#8e7cc3','#d08c9a','#87959d','#5f7fa3','#b58b5a','#7aa38f']
const dayFormat=new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'})
const shortDay=new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',timeZone:'UTC'})
const day=(value:string,short=false)=>(short?shortDay:dayFormat).format(new Date(value+'T00:00:00Z'))
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date())
const percent=(value:number)=>(value>0?'+':'')+value.toLocaleString('de-DE',{maximumFractionDigits:1,minimumFractionDigits:1})+' %'
const num=(value:number|null)=>value===null?'':String(value).replace('.',',')
const eur=(value:number)=>money(Math.round(value*100))
const parse=(text:string)=>{const clean=text.trim().replace(/\s|€/gu,'');return clean===''?null:Number(/,/u.test(clean)?clean.replace(/\./gu,'').replace(',','.'):clean)}
const blank=():Form=>({name:'',isin:'',symbol:'',category:'ETF',sector:'Breit gestreut',quantity:'',buyPrice:'',buyDate:'',price:''})
const toForm=(item:Holding):Form=>({id:item.id,name:item.name,isin:item.isin,symbol:item.symbol,category:item.category,sector:item.sector,quantity:num(item.quantity),buyPrice:num(item.buyPrice),buyDate:item.buyDate??'',price:num(item.price)})
const failure=(reason:unknown,fallback:string)=>reason instanceof Error?reason.message:fallback

/** Verkleinert den Screenshot im Browser, damit er klein genug für die Erkennung ist. */
async function prepare(file:File):Promise<Blob> {
  if(file.size>25*1024*1024) throw Error('Der Screenshot darf höchstens 25 MB groß sein.')
  const bitmap=await createImageBitmap(file).catch(()=>{throw Error('Das Bild konnte nicht gelesen werden. Verwende PNG oder JPEG.')})
  const scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height))
  const canvas=document.createElement('canvas')
  canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale)
  canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height)
  for(const quality of [.9,.8,.65]) {
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality))
    if(blob&&blob.size<=3.8*1024*1024) return blob
  }
  throw Error('Das Bild ist auch verkleinert zu groß.')
}

function Ring({items,total,label}:{items:{label:string,cents:number,color:string}[],total:number,label:string}) {
  let offset=0
  return <div className="finance-split-chart">
    <div className="finance-ring">
      <svg viewBox="0 0 42 42" role="img" aria-label={label}>
        {items.map(item=>{
          const length=item.cents/total*100, start=offset
          offset+=length
          return <circle key={item.label} cx="21" cy="21" r="15.9" fill="none" stroke={item.color} strokeWidth="5.6" pathLength="100"
            strokeDasharray={length+' '+(100-length)} strokeDashoffset={-start} transform="rotate(-90 21 21)"><title>{item.label} · {money(item.cents)}</title></circle>
        })}
      </svg>
      <div className="finance-ring-centre"><small>Gesamt</small><strong>{money(total)}</strong></div>
    </div>
    <ul className="finance-distribution-list">{items.map(item=><li key={item.label}>
      <span className="finance-swatch" style={{background:item.color}} aria-hidden/><span>{item.label}</span>
      <strong>{(item.cents/total*100).toLocaleString('de-DE',{maximumFractionDigits:1})} %</strong></li>)}</ul>
  </div>
}

const ranges=[['1W',7],['1M',30],['3M',91],['1J',365],['Max',0]] as const
const stamp=(date:string)=>Date.parse(date+'T00:00:00Z')

/** Verlauf im Stil der Broker-Apps: Zeitraumwahl, Wert beim Darüberfahren, grün oder rot je nach Entwicklung. */
function History({history}:{history:DepotState['history']}) {
  const [range,setRange]=useState<typeof ranges[number][0]>('Max')
  const [hover,setHover]=useState<number|null>(null)
  const days=ranges.find(item=>item[0]===range)![1]
  const last=history.at(-1)
  const shown=!last?[]:days?history.filter(item=>stamp(item.date)>=stamp(last.date)-days*86_400_000):history
  const width=640, height=230, top=14, bottom=14
  const withCost=shown.length>0&&shown.every(item=>item.investedCents>0)
  const values=shown.flatMap(item=>withCost?[item.totalCents,item.investedCents]:[item.totalCents])
  const min=Math.min(...values), max=Math.max(...values), span=Math.max(1,max-min)
  const first=shown[0], current=hover!==null?shown[hover]:shown.at(-1)
  const t0=first?stamp(first.date):0, t1=shown.length>1?stamp(shown.at(-1)!.date):t0+1
  const x=(date:string)=>shown.length<2?width/2:(stamp(date)-t0)/(t1-t0)*width
  const y=(value:number)=>top+(1-(value-min)/span)*(height-top-bottom)
  const up=!first||!current||current.totalCents>=first.totalCents
  const color=up?'#1f8a5b':'#c0463a'
  const diff=first&&current?current.totalCents-first.totalCents:0
  const line=shown.map(item=>x(item.date).toFixed(1)+','+y(item.totalCents).toFixed(1)).join(' ')
  function move(event:React.PointerEvent<SVGSVGElement>) {
    const box=event.currentTarget.getBoundingClientRect()
    const at=(event.clientX-box.left)/box.width*width
    let best=0
    shown.forEach((item,index)=>{if(Math.abs(x(item.date)-at)<Math.abs(x(shown[best].date)-at))best=index})
    setHover(best)
  }
  return <div className="depot-chart">
    <div className="depot-chart-head">
      <strong>{current?money(current.totalCents):'–'}</strong>
      <span style={{color}}>{first&&current?(diff>=0?'+':'−')+money(Math.abs(diff))+(first.totalCents>0?' · '+percent(diff/first.totalCents*100):''):''}</span>
      <small>{current?day(current.date):''}{hover===null&&first&&shown.length>1?' · seit '+day(first.date):''}</small>
    </div>
    <div className="depot-chart-plot">{shown.length<2?<p className="empty">Ab dem zweiten Tag mit einem Stand erscheint hier der Verlauf. Jede Änderung und jede Aktualisierung legt den Stand des Tages ab.</p>:
    <svg className="depot-chart-svg" viewBox={'0 0 '+width+' '+height} preserveAspectRatio="none" role="img" aria-label="Verlauf des Depotwerts"
      onPointerMove={move} onPointerDown={move} onPointerLeave={()=>setHover(null)}>
      <defs><linearGradient id="depot-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".22"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      {withCost?<polyline fill="none" stroke="#9aa5a0" strokeWidth="1.4" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" points={shown.map(item=>x(item.date).toFixed(1)+','+y(item.investedCents).toFixed(1)).join(' ')}/>:null}
      <polygon fill="url(#depot-fill)" points={line+' '+width+','+height+' 0,'+height}/>
      <polyline fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={line}/>
      {hover!==null?<line x1={x(shown[hover].date)} x2={x(shown[hover].date)} y1="0" y2={height} stroke="#7d8984" strokeWidth="1" vectorEffect="non-scaling-stroke"/>:null}
    </svg>}
    {shown.length>=2&&hover!==null?<span className="depot-chart-dot" style={{left:(x(shown[hover].date)/width*100)+'%',top:(y(shown[hover].totalCents)/height*100)+'%',background:color}} aria-hidden/>:null}</div>
    <div className="depot-ranges" role="group" aria-label="Zeitraum">{ranges.map(([name])=><button key={name} type="button" aria-pressed={range===name} onClick={()=>{setRange(name);setHover(null)}}>{name}</button>)}</div>
    {withCost&&shown.length>=2?<small className="depot-hint">Gestrichelt: investierter Betrag</small>:null}
  </div>
}

function HoldingForm({api,form,setForm,done,cancel}:{api:Api,form:Form,setForm:(form:Form)=>void,done:(state:DepotState)=>void,cancel:()=>void}) {
  const [query,setQuery]=useState('')
  const [results,setResults]=useState<Candidate[]>()
  const [searching,setSearching]=useState(false)
  const [error,setError]=useState('')
  const set=(patch:Partial<Form>)=>setForm({...form,...patch})
  async function search() {
    if(query.trim().length<2){setError('Gib mindestens zwei Zeichen ein.');return}
    if(!window.confirm('Der Suchbegriff „'+query.trim()+'“ wird mit Websuche über das Modell deines Profils aufgelöst. Es werden keine Beträge oder Stückzahlen gesendet. Fortfahren?')) return
    setSearching(true);setError('');setResults(undefined)
    try { setResults((await api<{results:Candidate[]}>('/depot/search',{query:query.trim(),confirm:true},120_000)).results) }
    catch(reason){setError(failure(reason,'Die Suche ist fehlgeschlagen.'))}
    finally{setSearching(false)}
  }
  async function save() {
    const quantity=parse(form.quantity), buyPrice=parse(form.buyPrice), price=parse(form.price)
    if(!form.name.trim()){setError('Gib einen Namen ein oder wähle einen Suchtreffer.');return}
    if([quantity,buyPrice,price].some(value=>value!==null&&!Number.isFinite(value))){setError('Stückzahl und Kurse müssen Zahlen sein.');return}
    try {
      done(await api<DepotState>('/depot/holding',{id:form.id,confirm:true,holding:{name:form.name,isin:form.isin,symbol:form.symbol,category:form.category,sector:form.sector,quantity,buyPrice,buyDate:form.buyDate||null,price}}))
    } catch(reason){setError(failure(reason,'Die Position konnte nicht gespeichert werden.'))}
  }
  return <section className="card settings depot-editor"><h2>{form.id?'Position bearbeiten':'Position hinzufügen'}</h2>
    {!form.id?<div className="depot-search">
      <input aria-label="Aktie, ETF oder Krypto suchen" value={query} maxLength={60} placeholder="Aktie, ETF oder Krypto suchen (Name, Kürzel oder ISIN)" onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void search()}}}/>
      <button type="button" disabled={searching} onClick={()=>void search()}>{searching?'Suche läuft …':'Suchen'}</button>
    </div>:null}
    {results?!results.length?<p className="depot-hint">Keine Treffer. Du kannst die Angaben unten auch von Hand eintragen.</p>:
      <ul className="depot-results">{results.map(item=><li key={item.isin+item.symbol+item.name}><button type="button" className="depot-result" onClick={()=>{set({name:item.name,isin:item.isin,symbol:item.symbol,category:item.category,sector:item.sector,price:num(item.price)});setResults(undefined)}}>
        <strong>{item.name}</strong><small>{[item.symbol,item.isin,item.category,item.sector].filter(Boolean).join(' · ')}</small><span>{item.price!==null?eur(item.price):''}</span></button></li>)}</ul>:null}
    <div className="depot-form">
      <label>Name<input value={form.name} maxLength={80} onChange={event=>set({name:event.target.value})}/></label>
      <label>Kategorie<select value={form.category} onChange={event=>set({category:event.target.value as DepotCategory})}>{depotCategories.map(name=><option key={name}>{name}</option>)}</select></label>
      <label>Branche<select value={form.sector} onChange={event=>set({sector:event.target.value as DepotSector})}>{depotSectors.map(name=><option key={name}>{name}</option>)}</select></label>
      <label>Stückzahl<input inputMode="decimal" value={form.quantity} onChange={event=>set({quantity:event.target.value})}/></label>
      <label>Kaufkurs (€ je Stück)<input inputMode="decimal" value={form.buyPrice} onChange={event=>set({buyPrice:event.target.value})}/></label>
      <label>Kaufdatum<input type="date" max={today()} value={form.buyDate} onChange={event=>set({buyDate:event.target.value})}/></label>
      <label>Aktueller Kurs (€)<input inputMode="decimal" value={form.price} onChange={event=>set({price:event.target.value})}/></label>
      <label>ISIN<input value={form.isin} maxLength={12} onChange={event=>set({isin:event.target.value.toUpperCase()})}/></label>
    </div>
    {error?<p role="alert">{error}</p>:null}
    <div className="actions"><button type="button" className="primary" onClick={()=>void save()}>Speichern</button><button type="button" onClick={cancel}>Abbrechen</button></div>
  </section>
}

function ImportPreview({api,items,setItems,done,cancel}:{api:Api,items:Recognized[],setItems:(items:Recognized[])=>void,done:(state:DepotState)=>void,cancel:()=>void}) {
  const [error,setError]=useState('')
  const [removeMissing,setRemoveMissing]=useState(false)
  const update=(index:number,patch:Partial<Recognized>)=>setItems(items.map((item,i)=>i===index?{...item,...patch}:item))
  return <section className="card settings depot-editor"><h2>Erkannte Positionen prüfen</h2>
    <p className="depot-hint">Bekannte Positionen werden aktualisiert, ihre Kaufdaten bleiben erhalten. Neue Positionen werden angelegt; Kaufkurs und Datum trägst du danach über „Bearbeiten“ ein. Der Screenshot selbst wird nicht gespeichert.</p>
    <div className="depot-rows">{items.map((item,index)=><div className="depot-row" key={index}>
      <input aria-label="Name" value={item.name} maxLength={80} onChange={event=>update(index,{name:event.target.value})}/>
      <select aria-label="Kategorie" value={item.category} onChange={event=>update(index,{category:event.target.value as DepotCategory})}>{depotCategories.map(name=><option key={name}>{name}</option>)}</select>
      <select aria-label="Branche" value={item.sector} onChange={event=>update(index,{sector:event.target.value as DepotSector})}>{depotSectors.map(name=><option key={name}>{name}</option>)}</select>
      <span className="depot-row-value">{money(item.valueCents)}{item.quantity!==null&&item.quantity>0?' · '+num(item.quantity)+' Stück':''}</span>
      <button type="button" className="quiet" aria-label="Position entfernen" onClick={()=>setItems(items.filter((_,i)=>i!==index))}>×</button>
    </div>)}</div>
    <label className="depot-check"><input type="checkbox" checked={removeMissing} onChange={event=>setRemoveMissing(event.target.checked)}/>Positionen, die im Screenshot fehlen, aus dem Depot entfernen</label>
    {error?<p role="alert">{error}</p>:null}
    <div className="actions"><button type="button" className="primary" disabled={!items.length} onClick={async()=>{
      try{done(await api<DepotState>('/depot/import',{positions:items,removeMissing,confirm:true}))}catch(reason){setError(failure(reason,'Die Positionen konnten nicht übernommen werden.'))}
    }}>Übernehmen</button><button type="button" onClick={cancel}>Abbrechen</button></div>
  </section>
}

export function DepotPage({api}:{api:Api}) {
  const [state,setState]=useState<DepotState>()
  const [error,setError]=useState('')
  const [form,setForm]=useState<Form>()
  const [recognized,setRecognized]=useState<Recognized[]>()
  const [busy,setBusy]=useState(false)
  const [mode,setMode]=useState<'Kategorie'|'Branche'|'Position'>('Branche')
  const [removing,setRemoving]=useState('')
  const input=useRef<HTMLInputElement>(null)
  const load=()=>api<DepotState>('/depot',undefined,10_000).then(setState,reason=>setError(failure(reason,'Das Depot konnte nicht geladen werden.')))
  useEffect(()=>{void load()},[api])
  useEffect(()=>{
    if(!state?.job.running) return
    const timer=setTimeout(()=>{void load()},3000)
    return ()=>clearTimeout(timer)
  },[state])

  async function recognise(file:File) {
    if(!window.confirm('Den Screenshot zur Erkennung an das Modell deines Profils senden? Er enthält Depotpositionen und Beträge. Gespeichert wird nur das Ergebnis, das du bestätigst.')) return
    setBusy(true);setError('')
    try {
      const response=await fetch('/api/depot/recognize',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-LifePilot-Confirm':'codex-image'},body:await prepare(file),signal:AbortSignal.timeout(125_000)})
      const value=await response.json()
      if(!response.ok) throw Error(value.error)
      setRecognized(value.positions);setForm(undefined)
    } catch(reason) { setError(failure(reason,'Die Erkennung ist fehlgeschlagen.')) }
    finally { setBusy(false) }
  }
  async function refresh() {
    setError('')
    try { setState(await api<DepotState>('/depot/refresh',{confirm:true},15_000)) }
    catch(reason){setError(failure(reason,'Die Kurse konnten nicht abgefragt werden.'))}
  }
  const applied=(next:DepotState)=>{setState(next);setForm(undefined);setRecognized(undefined);setError('')}

  const holdings=state?.holdings??[]
  const total=holdings.reduce((sum,item)=>sum+item.valueCents,0)
  const withCost=holdings.filter(item=>investedCents(item)!==null)
  const invested=withCost.reduce((sum,item)=>sum+(investedCents(item)??0),0)
  const gain=withCost.reduce((sum,item)=>sum+item.valueCents-(investedCents(item)??0),0)
  const group=(key:(item:Holding)=>string,color:(label:string,index:number)=>string)=>{
    const sums=new Map<string,number>()
    for(const item of holdings) if(item.valueCents>0) sums.set(key(item),(sums.get(key(item))??0)+item.valueCents)
    return [...sums].sort((a,b)=>b[1]-a[1]).map(([label,cents],index)=>({label,cents,color:color(label,index)}))
  }
  const slices=mode==='Kategorie'?group(item=>item.category,label=>depotColors[label as DepotCategory]):mode==='Branche'?group(item=>item.sector,(_,index)=>palette[index%palette.length]):group(item=>item.name,(_,index)=>palette[index%palette.length])
  const sorted=[...holdings].sort((a,b)=>b.valueCents-a.valueCents)
  const stale=holdings.map(item=>item.priceAt).filter((value):value is string=>Boolean(value)).sort().at(-1)

  return <div className="finance-space depot-space">
    <header className="finance-toolbar"><div className="actions">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void recognise(file)}}/>
      <button type="button" className="primary" disabled={busy} onClick={()=>{setForm(blank());setRecognized(undefined);setError('')}}>+ Position hinzufügen</button>
      <button type="button" disabled={busy||!state?.recognition} title={state?.recognition?undefined:'Die Bilderkennung ist in diesem Profil gesperrt.'} onClick={()=>input.current?.click()}>{busy?'Screenshot wird gelesen …':'Screenshot hochladen'}</button>
      <button type="button" disabled={!state?.recognition||!holdings.length||state?.job.running} onClick={()=>void refresh()}>{state?.job.running?'Kurse werden abgefragt …':'Aktualisieren'}</button>
    </div></header>
    {error?<p role="alert">{error}</p>:null}
    {state?.job.error&&!state.job.running?<p role="alert">{state.job.error}</p>:null}
    {state&&!state.job.running&&state.job.missing>0&&state.job.updatedAt?<p role="status">Für {state.job.missing} Position(en) wurde kein Kurs gefunden. Sie behalten ihren bisherigen Wert.</p>:null}
    {form?<HoldingForm api={api} form={form} setForm={setForm} done={applied} cancel={()=>setForm(undefined)}/>:null}
    {recognized?<ImportPreview api={api} items={recognized} setItems={setRecognized} done={applied} cancel={()=>setRecognized(undefined)}/>:null}
    {!state?<p role="status">Depot wird geladen …</p>:!holdings.length?<section className="card settings"><h2>Noch keine Positionen</h2>
      <p className="depot-hint">Lege Positionen über die Suche an (Aktie, ETF oder Krypto suchen, Kaufkurs und Stückzahl eintragen) oder lade einen Screenshot deines Depots hoch, zum Beispiel aus Trade Republic. LifePilot legt die Positionen dann automatisch an.</p></section>:<>
      <div className="depot-top">
        <section className="card settings depot-total"><h2>Depotwert</h2><strong>{money(total)}</strong>
          {stale?<small>Kurse vom {day(stale)}</small>:null}
          {withCost.length?<small className={gain>=0?'depot-up':'depot-down'}>{gain>=0?'+':'−'}{money(Math.abs(gain))}{invested>0?' · '+percent(gain/invested*100):''} seit Kauf</small>:<small>Trage Kaufkurs und Stückzahl ein, um den Gewinn zu sehen.</small>}
          {withCost.length?<small>Investiert {money(invested)}{withCost.length<holdings.length?' (für '+withCost.length+' von '+holdings.length+' Positionen)':''}</small>:null}
        </section>
        <section className="card settings finance-distribution"><div className="editor-title"><h2>Aufteilung</h2>
          <div className="finance-tabs" role="group" aria-label="Aufteilung nach">{(['Branche','Kategorie','Position'] as const).map(name=><button key={name} type="button" aria-pressed={mode===name} onClick={()=>setMode(name)}>{name}</button>)}</div></div>
          {total>0?<Ring items={slices} total={total} label={'Depot nach '+mode}/>:<p className="empty">Der Depotwert ist 0 €.</p>}
        </section>
      </div>
      <section className="card settings"><h2>Verlauf</h2><History history={state.history}/></section>
      <section className="card settings"><h2>Positionen</h2>
        <ul className="finance-list depot-positions">{sorted.map(item=>{
          const cost=investedCents(item), diff=cost!==null?item.valueCents-cost:null
          return <li key={item.id}><div className="finance-entry">
            <div className="finance-entry-title"><strong>{item.name}</strong><small>{[item.category,item.sector,item.quantity!==null&&num(item.quantity)+' Stück',item.buyPrice!==null&&'Kauf '+eur(item.buyPrice)+(item.buyDate?' am '+day(item.buyDate):''),item.price!==null&&'Kurs '+eur(item.price)].filter(Boolean).join(' · ')}</small></div>
            <strong>{money(item.valueCents)}</strong>
            <small className={diff===null?'':diff>=0?'depot-up':'depot-down'}>{diff===null||!cost?'':percent(diff/cost*100)}</small>
            {removing===item.id?<div className="actions"><button type="button" onClick={async()=>{
              try{applied(await api<DepotState>('/depot/holding/remove',{id:item.id,confirm:true}));setRemoving('')}catch(reason){setError(failure(reason,'Entfernen fehlgeschlagen.'))}
            }}>Entfernen bestätigen</button><button type="button" onClick={()=>setRemoving('')}>Abbrechen</button></div>:
              <div className="actions"><button type="button" className="quiet" onClick={()=>{setForm(toForm(item));setRecognized(undefined)}}>Bearbeiten</button>
                <button type="button" className="quiet" aria-label={item.name+' entfernen'} onClick={()=>setRemoving(item.id)}>×</button></div>}
          </div></li>})}</ul>
      </section>
      <p className="depot-hint">Hinweis: Kurse stammen aus einer Websuche über das Modell und können abweichen. Das ist keine Anlageberatung.</p>
    </>}
  </div>
}
