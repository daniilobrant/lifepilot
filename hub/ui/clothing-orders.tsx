import {MonthStepper,displayDay,displayIdentity} from './presentation.tsx'
import {DateInput} from './presentation.tsx'
import {useEffect,useState,type FormEvent} from 'react'
import type {ClothingOrderView,OrderStage} from '../runtime/clothing-orders.ts'
import {money} from '../runtime/finance-types.ts'
import {dateInBerlin} from '../runtime/values.ts'
import {orderDecisions} from './order-decisions.ts'

type Api=<T>(path:string,payload?:object,timeout?:number)=>Promise<T>
type Editor=(order?:ClothingOrderView)=>Promise<void>
const day=displayDay
const labels={pending:'Entscheidung offen',kept:'Behalten',return:'Retoure offen',returned:'Zurückgegeben'}
const stages:Record<OrderStage,string>={ordered:'Bestellt',shipping:'Unterwegs',review:'Zugestellt',return:'Retoure offen',closed:'Abgeschlossen',cancelled:'Storniert'}
const views={all:'Alle',ordered:'Bestellt',shipping:'Unterwegs',review:'Zugestellt',return:'Retouren',closed:'Abgeschlossen',cancelled:'Storniert'} as const
const errorText=(error:unknown)=>error instanceof Error?error.message:'Die Änderung konnte nicht gespeichert werden.'

function Booking({kind,order,api,busy,onChanged}:{
  kind:'purchase'|'refund',order:ClothingOrderView,api:Api,busy:boolean,onChanged:Editor,
}){
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const refund=kind==='refund'
  const amount=refund?order.totals.refund:order.totals.purchase
  const booked=refund?order.totals.refundBooked:order.totals.purchaseBooked
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    const fields=new FormData(event.currentTarget)
    const raw=String(fields.get('amount')??'').trim().replace(',','.')
    if(!/^\d{1,5}(?:\.\d{1,2})?$/u.test(raw)) {setError('Gib einen EUR-Betrag mit höchstens zwei Nachkommastellen ein.');return}
    const cents=Math.round(Number(raw)*100)
    setSaving(true);setError('')
    try{await onChanged(await api<ClothingOrderView>('/clothing-orders/finance',{
      order:order.id,kind,cents,date:fields.get('date'),confirm:true,
    }))}
    catch(reason){setError(errorText(reason))}
    finally{setSaving(false)}
  }
  return <form className="order-booking" onSubmit={submit}>
    <strong>{refund?'Erstattung':'Ausgabe'}{amount ? ' · '+money(amount):''}</strong>
    {booked ? <small>In Finanzen &amp; Abos gebucht</small>:<>
      <div className="order-form-grid">
        <label>Betrag (EUR)<input name="amount" inputMode="decimal" required disabled={busy||saving}
          defaultValue={amount?(amount/100).toFixed(2).replace('.',','):''} /></label>
        <label>Buchungsdatum<DateInput name="date"  disabled={busy||saving} required
          defaultValue={refund?order.totals.refundOn??'':order.orderedOn} /></label>
      </div>
      <button type="submit" disabled={busy||saving}>{refund?'Erstattung bestätigen':'Ausgabe bestätigen'}</button>
    </>}
    {error ? <p role="alert">{error}</p>:null}
  </form>
}

function OrderCard({order,api,onChanged,onTask}:{
  order:ClothingOrderView,api:Api,onChanged:Editor,onTask:(id:string)=>void,
}){
  const [open,setOpen]=useState(order.status==='review'||order.status==='return')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const cancelled=order.status==='cancelled'
  const needsPhoto=order.items.some(item=>item.canLoadPhoto && !item.hasPhoto)
  const hasReturn=order.items.some(item=>item.decision==='return')
  const returned=order.items.filter(item=>item.decision==='returned').length
  async function perform(action:()=>Promise<void>){
    setBusy(true);setError('');setNotice('')
    try{await action()}catch(reason){setError(errorText(reason))}finally{setBusy(false)}
  }
  function change(action:string,item?:string,value?:string){
    void perform(async()=>await onChanged(await api<ClothingOrderView>('/clothing-orders/change',{order:order.id,item,action,value,confirm:true})))
  }
  return <details className="order-card card" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>
      <span className="order-identity"><strong>{displayIdentity(order.merchant)}</strong><small>Bestellung {order.reference} · {day(order.orderedOn)}{displayIdentity(order.merchant)!==order.merchant?' · '+order.merchant:''}</small></span>
      <span className={'order-state order-state-'+order.status}>{stages[order.status]}</span>
    </summary>
    <div className="order-card-body">
      <dl className="order-dates">
        {order.shippedOn ? <div><dt>Versandt</dt><dd>{day(order.shippedOn)}</dd></div>:null}
        {order.deliveredOn ? <div><dt>Zugestellt</dt><dd>{day(order.deliveredOn)}</dd></div>:
          order.estimatedOn&&!cancelled ? <div><dt>Voraussichtlich</dt><dd>{day(order.estimatedOn)}</dd></div>:null}
        {order.cancelledOn ? <div><dt>Storniert</dt><dd>{day(order.cancelledOn)}</dd></div>:null}
        {order.deadline ? <div><dt>Rückgabefrist</dt><dd>{day(order.deadline)}</dd></div>:null}
      </dl>
      {order.tracking.length ? <details className="order-optional"><summary>Sendungsnummern</summary><ul>{order.tracking.map(value=><li key={value}>{value}</li>)}</ul></details>:null}
      {!order.deliveredOn && !cancelled && order.items.length ? <button type="button" disabled={busy} onClick={()=>change('received')}>Alle Artikel erhalten</button>:null}
      {error ? <p role="alert">{error}</p>:null}
      {notice ? <p role="status">{notice}</p>:null}
      {order.items.length ? <ul className="order-items">{order.items.map((item,index)=><li key={item.id}>
        <div className="order-thumb">
          {item.hasPhoto && item.wardrobeId && !item.hasProductPhoto ? <img src={'/api/outfits/photo?item='+encodeURIComponent(item.wardrobeId)} alt="" loading="lazy"/> :
           item.hasProductPhoto ? <img src={'/api/clothing-orders/photo?item='+encodeURIComponent(item.id)} alt="" loading="lazy"/> :
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10"/></svg>}
        </div>
        <div className="order-item-info">
          <strong>{item.draft.name}{order.items.slice(0,index).some(other=>other.draft.name===item.draft.name && other.draft.size===item.draft.size && other.draft.color===item.draft.color)?' ('+(index+1)+')':''}</strong>
          <small>{[item.draft.color,item.draft.size&&'Größe '+item.draft.size,item.draft.cents && money(item.draft.cents)].filter(Boolean).join(' · ')}</small>
          <small className="order-item-state">{cancelled?'Storniert':item.arrived?labels[item.decision]:'Ausstehend'}</small>
        </div>
        {!cancelled && item.arrived && item.decision!=='returned' ? <div className="order-item-actions">
          {item.decision==='pending' ? <>
            <button type="button" className="primary" disabled={busy} onClick={()=>change('kept',item.id)}>
              {item.draft.isClothing===false?'Ja, behalten':'Ja, behalten und hinzufügen'}</button>
            <button type="button" disabled={busy} onClick={()=>change('return',item.id)}>Nein, zurückgeben</button>
          </>:null}
          {item.decision==='kept' ? <button type="button" disabled={busy} onClick={()=>change('return',item.id)}>Doch zurückgeben</button>:null}
          {item.decision==='return' ? <>
            <button type="button" className="primary" disabled={busy} onClick={()=>change('returned',item.id)}>Retoure abgegeben</button>
            <button type="button" disabled={busy} onClick={()=>change('kept',item.id)}>Doch behalten</button>
          </>:null}
        </div>:null}
      </li>)}</ul>:<p className="empty">Aus den Mails liegen noch keine eindeutigen Artikeldetails vor.</p>}
      {needsPhoto&&!cancelled ? <button type="button" disabled={busy} onClick={()=>void perform(async()=>{
        const result=await api<{loaded:number}>('/clothing-orders/photos',{order:order.id,confirm:true},76000)
        await onChanged()
        setNotice(result.loaded?'Artikelbilder aktualisiert.':'Keine weiteren verifizierten Artikelbilder gefunden.')
      })}>Artikelbilder aktualisieren</button>:null}
      {hasReturn && !cancelled ? <form key={order.deadline??'offen'} className="order-date-form" onSubmit={event=>{
        event.preventDefault();change('deadline',undefined,String(new FormData(event.currentTarget).get('deadline')??''))
      }}>
        <label>Rückgabefrist<DateInput  name="deadline" required defaultValue={order.deadline??''}/></label>
        <button type="submit" disabled={busy}>Frist speichern</button>
        {order.taskId ? <button type="button" className="quiet" onClick={()=>onTask(order.taskId!)}>Retourenaufgabe öffnen</button>:null}
      </form>:null}
      {(!cancelled || order.totals.purchaseBooked || order.totals.refundOn) ? <details className="order-optional">
        <summary>Abrechnung</summary>
        <p>{order.items.filter(item=>item.decision==='kept').length} behalten · {order.items.filter(item=>item.decision==='return').length} Retoure offen · {returned} zurückgegeben</p>
        <div className="order-form-grid">
          {!cancelled || order.totals.purchaseBooked ? <Booking kind="purchase" order={order} api={api} busy={busy} onChanged={onChanged}/>:null}
          {returned || order.totals.refundOn ? <Booking kind="refund" order={order} api={api} busy={busy} onChanged={onChanged}/>:null}
        </div>
      </details>:null}
    </div>
  </details>
}

export function OrderTracker({api,refreshKey,onTask,onUpdate,focusId}:{
  api:Api,refreshKey:string,focusId?:string,onTask:(id:string)=>void,onUpdate:()=>void,
}){
  const [orders,setOrders]=useState<ClothingOrderView[]>([])
  const [view,setView]=useState<keyof typeof views>('all')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [month,setMonth]=useState(()=>dateInBerlin().slice(0,7))
  const [busy,setBusy]=useState(false)
  const [loadedMonth,setLoadedMonth]=useState('')
  const [focus,setFocus]=useState(focusId)
  const path='/clothing-orders?'+new URLSearchParams({month,...(focus?{focus}:{})})
  const loading=loadedMonth!==month
  useEffect(()=>setFocus(focusId),[focusId])
  useEffect(()=>{
    let active=true
    function load(){
      void api<ClothingOrderView[]>(path).then(result=>{
        if(active){setOrders(result);setError('')}
      }).catch(reason=>{if(active)setError(errorText(reason))}).finally(()=>{if(active)setLoadedMonth(month)})
    }
    load()
    const timer=window.setInterval(()=>{if(!document.hidden && !busy)load()},20_000)
    return ()=>{active=false;window.clearInterval(timer)}
  },[api,refreshKey,busy,month,path])
  async function searched(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    setBusy(true);setNotice('');setError('')
    try{
      const data=await api<{checked:number,changed:number,limited:boolean}>('/clothing-orders/refresh',{month,confirm:true},120000)
      setOrders(await api<ClothingOrderView[]>(path))
      setNotice(data.checked+' Nachrichten geprüft. '+(data.changed?'Bestellungen aktualisiert.':'Bestellungen sind auf dem aktuellen Stand.')+
        (data.limited?' Der Suchlauf war begrenzt.':''))
      onUpdate()
    }catch(reason){setError(errorText(reason))}
    finally{setBusy(false)}
  }
  const visible=view==='all'?orders:orders.filter(item=>item.status===view)
  useEffect(()=>{
    const element=focus?document.getElementById('board-order-'+focus):null
    if(element){
      const details=element.querySelector('details')
      if(details)details.open=true
      element.scrollIntoView({block:'center'})
    }
  },[focus,loading,orders.length])
  return <section className="order-tracker" aria-label="Bestellungstracker">
    <form className="order-toolbar card settings" onSubmit={searched}>
      <MonthStepper month={month} onChange={value=>{setFocus(undefined);setMonth(value);setView('all');setOrders([])}} max={dateInBerlin().slice(0,7)} disabled={busy}/>
      <button type="submit" disabled={busy}>{busy?'Gmail wird geprüft …':'Bestellungen in Gmail prüfen'}</button>
    </form>
    {error ? <p role="alert" className="banner">{error}</p>:null}
    {notice ? <p role="status">{notice}</p>:null}
    <nav className="actions order-filters" aria-label="Bestellstatus">
      {(Object.keys(views) as (keyof typeof views)[]).map(key=><button type="button" key={key}
        className={view===key?'primary':undefined} aria-pressed={view===key} onClick={()=>setView(key)}>{views[key]}</button>)}
    </nav>
    {loading ? <p role="status">Bestellungen werden geladen …</p>:null}
    {!loading && !visible.length ? <p className="card empty">Keine Bestellungen in dieser Ansicht.</p>:null}
    {visible.map(order=><div id={'board-order-'+order.id} key={order.id}><OrderCard key={order.id} order={order} api={api} onTask={onTask} onChanged={async updated=>{
      if(updated)setOrders(current=>current.map(row=>row.id===updated.id?updated:row))
      else setOrders(await api(path))
      onUpdate()
    }}/></div>)}
  </section>
}

export function OrderApprovals({api,refreshKey,onOpen,onUpdate}:{api:Api,refreshKey:string,onOpen:(id:string)=>void,onUpdate:()=>void}){
  const [orders,setOrders]=useState<ClothingOrderView[]>([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    void api<ClothingOrderView[]>('/clothing-orders').then(value=>{if(active){setOrders(value);setError('')}})
      .catch(reason=>{if(active)setError(errorText(reason))})
    return ()=>{active=false}
  },[api,refreshKey])
  const open=orderDecisions(orders)
  if(!open.length&&!error)return null
  const count=open.reduce((sum,entry)=>sum+entry.pending.length+entry.returns.length+(entry.due?1:0),0)
  async function change(order:string,action:string,item?:string){
    setBusy(true);setError('')
    try{
      const updated=await api<ClothingOrderView>('/clothing-orders/change',{order,item,action,confirm:true})
      setOrders(current=>current.map(entry=>entry.id===updated.id?updated:entry))
      onUpdate()
    }catch(reason){setError(errorText(reason))}finally{setBusy(false)}
  }
  return <details className="card settings mail-finance disclosure order-approvals" aria-label="Bestellungen, die auf dich warten">
    <summary><strong>Bestellungen</strong><span className="count-badge">{count} offen</span></summary>
    {error?<p role="alert">{error}</p>:null}
    <ul className="order-approval-list">{open.map(({order,pending,returns,due})=><li key={order.id}>
      <button type="button" className="quiet order-approval-title" onClick={()=>onOpen(order.id)}>
        <strong>{displayIdentity(order.merchant)}</strong><small>Bestellung {order.reference}{order.deadline&&returns.length?' · Rückgabe bis '+day(order.deadline):''}</small></button>
      {due&&!pending.length&&!returns.length?<div className="order-approval-row"><span>Lieferung {order.estimatedOn?'erwartet '+day(order.estimatedOn):'unterwegs'} – schon angekommen?</span>
        <button type="button" disabled={busy} onClick={()=>void change(order.id,'received')}>Angekommen</button></div>:null}
      {pending.map(item=><div className="order-approval-row" key={item.id}><span>{item.draft.name}</span>
        <button type="button" disabled={busy} onClick={()=>void change(order.id,'kept',item.id)}>Behalten</button>
        <button type="button" disabled={busy} onClick={()=>void change(order.id,'return',item.id)}>Zurücksenden</button></div>)}
      {returns.map(item=><div className="order-approval-row" key={item.id}><span>Retoure: {item.draft.name}</span>
        <button type="button" disabled={busy} onClick={()=>void change(order.id,'returned',item.id)}>Abgegeben</button></div>)}
    </li>)}</ul>
  </details>
}
