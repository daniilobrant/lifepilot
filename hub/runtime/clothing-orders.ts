import { createHash, randomUUID } from 'node:crypto'
import type { MailContent } from '../connectors/google.ts'
import type { Store } from './store.ts'
import { Problem } from './settings.ts'
import { isUnderwear, parseClothingMail, shopDomain, type ClothingMail, type ClothingProduct, type OrderProductDraft } from './clothing-mail.ts'
import { saveWardrobe } from './outfits.ts'
import { outfitGarment } from './outfit-fields.ts'
import { isSportItem, type WardrobeDraft } from './outfit-types.ts'
import type { TaskPatch } from './workspace.ts'
import { financeMonth, saveFinance } from './finance.ts'
import { dateInBerlin, isDate, shiftDay } from './values.ts'

type Decision = 'pending'|'kept'|'return'|'returned'
type OrderRow = {id:string,account:string,sender:string,reference:string,merchant:string,ordered_on:string,delivered_on:string|null,
  deadline:string|null,task_id:string|null,estimated_on:string|null,shipped_on:string|null,cancelled_on:string|null,total_cents:number|null,
  refund_on:string|null,refund_cents:number|null,source_kind:ClothingMail['kind']}
type ItemRow = {id:string,order_id:string,item_key:string,wardrobe_id:string|null,details:string,image_url:string,
  arrived:number,decision:Decision,image_checked:number}
export type OrderStage='ordered'|'shipping'|'review'|'return'|'closed'|'cancelled'
export type ClothingOrderView = {
  status:OrderStage, estimatedOn:string|null, shippedOn:string|null, cancelledOn:string|null, sourceKind:ClothingMail['kind'],
  totals:{purchase:number|null,refund:number|null,refundOn:string|null,purchaseBooked:boolean,refundBooked:boolean}, tracking:string[],
  id:string, merchant:string, reference:string, orderedOn:string, deliveredOn:string|null, deadline:string|null, taskId:string|null,
  items:{id:string, draft:OrderProductDraft, wardrobeId:string|null, arrived:boolean, decision:Decision, hasPhoto:boolean, canLoadPhoto:boolean, hasExpectedPhoto:boolean, hasProductPhoto?:boolean}[],
}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex')
function fingerprint(product:ClothingProduct) {
  return [product.sku || product.draft.name,product.draft.color,product.draft.size].map(value=>value?.toLocaleLowerCase('de-DE')??'').join('|')
}
// Dieselbe Bestellung kann über verschiedene Absender desselben Shops kommen. Duplikate werden zusammengeführt,
// doppelt angelegte Kleiderschrankteile entfernt, sofern sie in keinem gespeicherten Look stecken.
export function mergeDuplicateOrders(store:Store,account:string) {
  const rows=store.db.prepare('SELECT id,sender,reference,merchant FROM clothing_orders WHERE account=? ORDER BY ordered_on,rowid').all(account) as {id:string,sender:string,reference:string,merchant:string}[]
  const groups=new Map<string,typeof rows>()
  for (const row of rows) {
    const key=row.reference+'|'+shopDomain(row.sender)
    groups.set(key,[...(groups.get(key)??[]),row])
  }
  let merged=0
  for (const group of groups.values()) {
    if (group.length<2) continue
    const keep=group.find(row=>!/\./u.test(row.merchant)) ?? group[0]
    const keptNames=new Set(orderItems(store,keep.id).filter(item=>item.wardrobe_id).map(item=>String(JSON.parse(item.details).name).toLowerCase()))
    for (const duplicate of group.filter(row=>row!==keep)) {
      for (const item of orderItems(store,duplicate.id)) {
        if (!item.wardrobe_id || !keptNames.has(String(JSON.parse(item.details).name).toLowerCase())) continue
        const inLook=store.db.prepare("SELECT 1 FROM outfit_looks, json_each(outfit_looks.result,'$.itemIds') WHERE json_each.value=? LIMIT 1").get(item.wardrobe_id)
        if (!inLook) store.db.prepare('DELETE FROM wardrobe_items WHERE id=?').run(item.wardrobe_id)
      }
      store.db.prepare('DELETE FROM clothing_orders WHERE id=?').run(duplicate.id)
      merged++
    }
    if (/\./u.test(keep.merchant)) store.db.prepare('UPDATE clothing_orders SET merchant=?,sender=? WHERE id=?')
      .run(shopDomain(keep.sender).split('.')[0].replace(/^./u,letter=>letter.toUpperCase()),shopDomain(keep.sender),keep.id)
  }
  // Unterwäsche und Socken aus Bestellungen gehören nicht in den Kleiderschrank (Looks bleiben unberührt).
  for (const row of (store.db.prepare('SELECT id,wardrobe_id,details FROM clothing_order_items WHERE wardrobe_id IS NOT NULL').all() as {id:string,wardrobe_id:string,details:string}[])
    .filter(row=>isUnderwear(outfitGarment(String(JSON.parse(row.details).name ?? ''))?.garmentType ?? ''))) {
    store.db.prepare("UPDATE clothing_order_items SET wardrobe_id=NULL,details=json_set(details,'$.isClothing',json('false')) WHERE id=?").run(row.id)
    const inLook=store.db.prepare("SELECT 1 FROM outfit_looks, json_each(outfit_looks.result,'$.itemIds') WHERE json_each.value=? LIMIT 1").get(row.wardrobe_id)
    if (!inLook) store.db.prepare('DELETE FROM wardrobe_items WHERE id=?').run(row.wardrobe_id)
  }
  // Fotos, die nur über eine zu ungenaue Bildersuche kamen (kein Bild, kein Link, keine Farbe), werden entfernt.
  store.db.exec(`UPDATE wardrobe_items SET photo=NULL,mime=NULL,photo_origin=NULL WHERE photo IS NOT NULL AND photo_origin='web' AND coalesce(source,'')=''
    AND id IN (SELECT wardrobe_id FROM clothing_order_items WHERE coalesce(image_url,'')='' AND coalesce(json_extract(details,'$.source'),'')=''
      AND coalesce(json_extract(details,'$.color'),'')='' AND wardrobe_id IS NOT NULL)`)
  store.db.exec(`UPDATE clothing_order_items SET product_photo=NULL,image_checked=1 WHERE product_photo IS NOT NULL AND coalesce(image_url,'')=''
    AND coalesce(json_extract(details,'$.source'),'')='' AND coalesce(json_extract(details,'$.color'),'')='' AND coalesce(json_extract(details,'$.isClothing'),1)<>0`)
  return merged
}

function orderItems(store:Store,key:string) {
  return store.db.prepare('SELECT * FROM clothing_order_items WHERE order_id=? ORDER BY rowid').all(key) as ItemRow[]
}
function loadOrder(store:Store,key:string) {
  const order=store.db.prepare('SELECT * FROM clothing_orders WHERE id=?').get(key) as OrderRow|undefined
  if (!order) throw new Problem(404,'Bestellung nicht gefunden.')
  return order
}
function hasOrderPhotoSource(draft:OrderProductDraft,image:string,_merchant:string) {
  // Ohne Bild in der Mail sucht LifePilot über Produktnamen oder -nummer.
  return Boolean(image || draft.source || draft.name)
}
function asView(store:Store,order:OrderRow):ClothingOrderView {
  const productPhoto=store.db.prepare('SELECT 1 FROM clothing_order_items WHERE id=? AND product_photo IS NOT NULL')
  const hasPhoto=store.db.prepare('SELECT 1 FROM wardrobe_items WHERE id=? AND photo IS NOT NULL')
  const items=orderItems(store,order.id).map(item=>{
      const draft=JSON.parse(item.details) as OrderProductDraft
      return {id:item.id,draft,wardrobeId:item.wardrobe_id,arrived:Boolean(item.arrived),decision:item.decision,
        hasPhoto:Boolean(item.wardrobe_id && hasPhoto.get(item.wardrobe_id) || productPhoto.get(item.id)),
        hasProductPhoto:Boolean(productPhoto.get(item.id)),
        canLoadPhoto:Boolean(!item.image_checked && hasOrderPhotoSource(draft,item.image_url,order.merchant)),hasExpectedPhoto:Boolean(item.image_url)}
  })
  const status:OrderStage=order.cancelled_on?'cancelled':items.some(item=>item.decision==='return')?'return':
    items.some(item=>item.arrived && item.decision==='pending')?'review':
    items.length && items.every(item=>item.decision==='kept'||item.decision==='returned') || !items.length && order.refund_on?'closed':
    order.delivered_on?'review':order.shipped_on?'shipping':'ordered'
  const bookings=store.db.prepare('SELECT kind FROM order_finance_entries WHERE order_id=?').all(order.id)
  const tracking=store.db.prepare('SELECT tracking FROM clothing_order_shipments WHERE order_id=? ORDER BY rowid').all(order.id)
  return {id:order.id,merchant:order.merchant,reference:order.reference,orderedOn:order.ordered_on,
    deliveredOn:order.delivered_on,deadline:order.deadline,taskId:order.task_id,shippedOn:order.shipped_on,cancelledOn:order.cancelled_on,
    sourceKind:order.source_kind,status,estimatedOn:order.estimated_on,
    totals:{purchase:order.total_cents,refund:order.refund_cents,refundOn:order.refund_on,
      purchaseBooked:bookings.some(item=>item.kind==='purchase'),refundBooked:bookings.some(item=>item.kind==='refund')},
    tracking:tracking.map(item=>String(item.tracking)),items}
}

function recordOrderActivity(store:Store,order:string,day:string) {
  store.db.prepare('INSERT OR IGNORE INTO clothing_order_activity VALUES (?,?)').run(order,day)
}
export function clothingOrders(store:Store,month?:string,focus?:string) {
  return (store.db.prepare(`SELECT orders.* FROM clothing_orders AS orders
    WHERE :month IS NULL OR orders.id=:focus OR
      :month IN (substr(ordered_on,1,7),substr(shipped_on,1,7),substr(delivered_on,1,7),substr(cancelled_on,1,7),substr(refund_on,1,7))
      OR EXISTS (SELECT 1 FROM clothing_order_activity activity WHERE order_id=orders.id AND substr(day,1,7)=:month)
      OR EXISTS (SELECT 1 FROM clothing_order_mail mail WHERE mail.account=orders.account AND mail.sender=orders.sender
        AND mail.reference=orders.reference AND mail.day>=orders.ordered_on AND substr(mail.day,1,7)=:month)
    ORDER BY coalesce(id=:focus,0) DESC,
    EXISTS (SELECT 1 FROM clothing_order_items WHERE order_id=orders.id AND (arrived=1 AND decision='pending' OR decision='return')) DESC,
    ordered_on DESC,rowid DESC LIMIT CASE WHEN :month IS NULL THEN 50 ELSE 300 END`)
    .all({month:month??null,focus:focus??null}) as OrderRow[]).map(order=>asView(store,order))
}

export function bookOrderFinance(store:Store,key:string,kind:unknown,date:unknown,cents:unknown) {
  if(kind!=='purchase' && kind!=='refund') throw new Problem(400,'Wähle Ausgabe oder Erstattung.')
  if(!isDate(date) || typeof cents!=='number' || !Number.isSafeInteger(cents) || cents<1 || cents>=10_000_000) {
    throw new Problem(400,'Gib ein gültiges Datum und den bestätigten EUR-Betrag ein.')
  }
  return store.transaction(()=>{
    const order=loadOrder(store,key)
    if(kind==='purchase' && order.cancelled_on) throw new Problem(409,'Diese Bestellung wurde storniert.')
    if(kind==='refund' && !order.refund_on && !orderItems(store,key).some(item=>item.decision==='returned')) {
      throw new Problem(409,'Bestätige die Rückgabe des Artikels zuerst.')
    }
    const already=store.db.prepare('SELECT entry_id FROM order_finance_entries WHERE order_id=? AND kind=?').get(key,kind)
    if(already) return asView(store,order)
    const refund=kind==='refund'
    const month=financeMonth(date.slice(0,7))
    const merchant=order.merchant.split(/[ .]/u)[0].toLowerCase()
    const matches=store.db.prepare(`SELECT id FROM finance_entries AS entry WHERE kind='expense' AND month=?
      AND json_extract(data,'$.date')=? AND json_extract(data,'$.cents')=? AND coalesce(json_extract(data,'$.refund'),0)=?
      AND instr(lower(json_extract(data,'$.title')),?)>0
      AND NOT EXISTS (SELECT 1 FROM order_finance_entries WHERE entry_id=entry.id)`).all(month,date,cents,refund?1:0,merchant)
    if(matches.length>1) throw new Problem(409,'Mehrere ähnliche Buchungen gefunden. Prüfe Finanzen & Abos.')
    const entryId=matches.length ? String(matches[0].id) : saveFinance(store,{
      kind:'expense',title:(order.merchant+' · Bestellung '+order.reference).slice(0,120),cents,date,
      category:'Shopping',refund,note:'Im Bestellungstracker bestätigt.',
    },month).id
    store.db.prepare('INSERT INTO order_finance_entries VALUES (?,?,?)').run(key,kind,entryId)
    store.db.prepare(`UPDATE gmail_finance_suggestions SET state='accepted',entry_id=? WHERE account=? AND state='pending'
      AND json_extract(draft,'$.date')=? AND json_extract(draft,'$.cents')=? AND coalesce(json_extract(draft,'$.refund'),0)=?
      AND instr(lower(json_extract(draft,'$.title')),?)>0`).run(entryId,order.account,date,cents,refund?1:0,merchant)
    return asView(store,order)
  })
}

const keptNote='Beim Behalten im Bestellungstracker gebucht.'
/** Behält man Teile einer Bestellung, entsteht die Ausgabe automatisch (Summe der behaltenen Teile) und wächst mit weiteren behaltenen Teilen. */
function bookKeptItems(store:Store,key:string) {
  const order=loadOrder(store,key)
  const items=orderItems(store,key)
  const kept=items.filter(item=>item.decision==='kept')
  const priced=kept.map(item=>JSON.parse(item.details) as OrderProductDraft)
  if(!kept.length || priced.some(draft=>!draft.cents)) return
  const cents=kept.length===items.length && order.total_cents ? order.total_cents : priced.reduce((sum,draft)=>sum+(draft.cents??0),0)
  if(cents<1 || cents>=10_000_000) return
  const date=order.delivered_on ?? order.ordered_on
  const month=financeMonth(date.slice(0,7))
  const title=(order.merchant+' · '+priced.map(draft=>draft.name).join(', ')).slice(0,120)
  const category=priced.every(draft=>isSportItem(draft)) ? 'Shopping' : 'Shopping'
  const booked=store.db.prepare("SELECT f.entry_id AS id,e.revision,e.data FROM order_finance_entries f JOIN finance_entries e ON e.id=f.entry_id WHERE f.order_id=? AND f.kind='purchase'").get(key)
  if(booked){
    const data=JSON.parse(String(booked.data)) as {note?:string,cents:number}
    if(data.note===keptNote && data.cents!==cents) saveFinance(store,{...data,title,cents,category,date},month,{id:String(booked.id),revision:Number(booked.revision)})
    return
  }
  const entry=saveFinance(store,{kind:'expense',title,cents,date,category,note:keptNote},month)
  store.db.prepare('INSERT INTO order_finance_entries VALUES (?,?,?)').run(key,'purchase',entry.id)
}

function syncReturnTask(store:Store,id:string) {
  const order=loadOrder(store,id)
  const rows=orderItems(store,id).filter(item=>item.decision==='return' || item.decision==='returned')
  const existing=order.task_id ? store.workspace.get(order.task_id) : undefined
  if (!rows.length) {
    if (existing && existing.status!=='archived') store.workspace.update(existing.id,existing.revision,{status:'archived'},'clothing-orders')
    if (order.task_id) store.db.prepare('UPDATE clothing_orders SET task_id=NULL WHERE id=?').run(id)
    return
  }
  const title=('Retoure · '+order.merchant+' · '+order.reference).slice(0,120)
  const detail=order.deadline ? 'Rückgabefrist für die ausgewählten Artikel.' : 'Rückgabefrist in der Bestellung prüfen und eintragen.'
  const steps=rows.map(item=>({title:(JSON.parse(item.details) as WardrobeDraft).name,done:item.decision==='returned'}))
  const task=existing && existing.status!=='archived' ? existing : store.workspace.add(null,
    {title,detail,kind:'task',date:order.deadline,category:'leisure'},'clothing-orders')
  store.workspace.update(task.id,task.revision,{title,detail,due_date:order.deadline,steps,
    status:steps.every(step=>step.done)?'done':'open'},'clothing-orders')
  if (order.task_id!==task.id) store.db.prepare('UPDATE clothing_orders SET task_id=? WHERE id=?').run(task.id,id)
}

function markArrived(store:Store, order:OrderRow, day:string, matches?:Map<string,number>) {
  for (const item of orderItems(store,order.id)) {
    if (item.arrived) continue
    const key=item.item_key.split('#')[0]
    const remaining=matches?.get(key)??0
    if (!matches || remaining>0) {
      store.db.prepare('UPDATE clothing_order_items SET arrived=1 WHERE id=?').run(item.id)
      matches?.set(key,remaining-1)
    }
  }
  const current=orderItems(store,order.id)
  if (!current.length || current.every(item=>item.arrived)) {
    store.db.prepare('UPDATE clothing_orders SET delivered_on=coalesce(delivered_on,?) WHERE id=?').run(day,order.id)
  }
}
function shipmentInfo(store:Store,account:string,number:string) {
  return number ? store.db.prepare('SELECT * FROM clothing_order_shipments WHERE account=? AND tracking=?').get(account,number) as
    {order_id:string,data:string,received:number}|undefined : undefined
}
function applyMail(store:Store, order:OrderRow, event:ClothingMail) {
  recordOrderActivity(store,order.id,event.day)
  if(event.kind==='cancel'){
    store.db.prepare('UPDATE clothing_orders SET cancelled_on=coalesce(cancelled_on,?) WHERE id=?').run(event.day,order.id)
    return
  }
  if(event.kind==='shipping') store.db.prepare('UPDATE clothing_orders SET shipped_on=coalesce(shipped_on,?) WHERE id=?').run(event.day,order.id)
  if(event.kind==='refund'){
    // A refund applies only to the uniquely identified returned products in this order.
    const normal=(value:string)=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'')
    const rows=orderItems(store,order.id)
    for(const product of event.items){
      const fingerprint=(draft:OrderProductDraft)=>[draft.name,draft.color??'',draft.size??''].map(normal).join('|')
      const matches=rows.filter(row=>fingerprint(JSON.parse(row.details))===fingerprint(product.draft))
      if(matches.length!==product.quantity) continue
      for(const row of matches){
        if(row.decision!=='kept') store.db.prepare("UPDATE clothing_order_items SET arrived=1,decision='returned' WHERE id=?").run(row.id)
      }
    }
    store.db.prepare('UPDATE clothing_orders SET refund_on=?,refund_cents=coalesce(?,refund_cents) WHERE id=?')
      .run(event.day,event.refundCents??null,order.id)
    if(order.task_id) syncReturnTask(store,order.id)
    return
  }
  if (event.kind==='shipping' && event.tracking) {
    store.db.prepare('INSERT OR IGNORE INTO clothing_order_shipments (account,tracking,order_id,data) VALUES (?,?,?,?)')
      .run(order.account,event.tracking,order.id,JSON.stringify(event))
    const shipment=shipmentInfo(store,order.account,event.tracking)
    if (shipment?.order_id===order.id && !shipment.received) {
      const delivery=store.db.prepare(`SELECT data FROM clothing_order_mail WHERE account=? AND tracking=? AND day>=?
        AND json_extract(data,'$.kind')='delivery' ORDER BY day,rowid LIMIT 1`).get(order.account,event.tracking,event.day)
      if (delivery) applyMail(store,order,JSON.parse(String(delivery.data)) as ClothingMail)
    }
  }
  if (event.kind==='delivery') {
    const shipment=shipmentInfo(store,order.account,event.tracking)
    if (shipment && (shipment.received || shipment.order_id!==order.id)) return
    const part=shipment ? JSON.parse(shipment.data) as ClothingMail : event
    const products=event.items.length ? event.items : part.items
    const quantities=new Map<string,number>()
    for (const product of products) {
      const key=fingerprint(product)
      quantities.set(key,(quantities.get(key)??0)+product.quantity)
    }
    const limited=event.partial || part.partial || products.length>0 &&
      products.reduce((sum,item)=>sum+item.quantity,0)<orderItems(store,order.id).length
    markArrived(store,order,event.day,limited?quantities:undefined)
    if (shipment) store.db.prepare('UPDATE clothing_order_shipments SET received=1 WHERE account=? AND tracking=?')
      .run(order.account,event.tracking)
  }
  if (event.deadline && (!order.deadline || event.deadline<order.deadline)) {
    store.db.prepare('UPDATE clothing_orders SET deadline=? WHERE id=?').run(event.deadline,order.id)
    if (order.task_id) syncReturnTask(store,order.id)
  }
}

export function scanClothingOrders(store:Store, mails:MailContent[], account:string) {
  return store.transaction(()=>{
    const insertEvent=store.db.prepare('INSERT OR IGNORE INTO clothing_order_mail VALUES (?,?,?,?,?,?,?)')
    let changes=0
    const relevant=mails.flatMap(mail=>{
      const event=mail.clothing ?? parseClothingMail(mail)
      return event?[{event,id:mail.id}]:[]
    }).sort((a,b)=>['order','shipping','delivery','return','refund','cancel'].indexOf(a.event.kind)-['order','shipping','delivery','return','refund','cancel'].indexOf(b.event.kind))
    mergeDuplicateOrders(store,account)
    for (const {event,id} of relevant) {
      let current=(store.db.prepare('SELECT * FROM clothing_orders WHERE account=? AND reference=?').all(account,event.reference) as OrderRow[])
        .find(row=>shopDomain(row.sender)===shopDomain(event.sender))
      if (!current && event.kind==='delivery' && event.tracking) {
        const shipment=shipmentInfo(store,account,event.tracking)
        if (shipment) current=loadOrder(store,shipment.order_id)
      }
      if (event.kind==='order') {
        if (current){
          store.db.prepare('UPDATE clothing_orders SET total_cents=coalesce(total_cents,?),shipped_on=coalesce(shipped_on,?),estimated_on=coalesce(estimated_on,?) WHERE id=?')
            .run(event.totalCents??null,event.shipped??null,event.estimated??null,current.id)
          // Fehlende Artikel aus der Bestellbestätigung nachtragen (etwa nach verbessertem Auslesen).
          if (!current.cancelled_on) {
            const existing=new Map<string,number>()
            for (const item of orderItems(store,current.id)) {const base=item.item_key.replace(/#\d+$/u,'');existing.set(base,(existing.get(base)??0)+1)}
            const seen=new Map<string,number>()
            for (const product of event.items.flatMap(product=>Array.from({length:product.quantity},()=>product)).slice(0,30)) {
              const key=fingerprint(product)
              const occurrence=(seen.get(key)??0)+1
              seen.set(key,occurrence)
              if (occurrence<=(existing.get(key)??0)) continue
              const wardrobe=product.draft.isClothing!==false ? saveWardrobe(store,product.draft) : undefined
              store.db.prepare(`INSERT OR IGNORE INTO clothing_order_items (id,order_id,item_key,wardrobe_id,details,image_url) VALUES (?,?,?,?,?,?)`)
                .run(randomUUID(),current.id,key+'#'+occurrence,wardrobe?.id??null,JSON.stringify(product.draft),product.image)
              changes++
            }
          }
          continue
        }
        if (Number(store.db.prepare('SELECT count(*) AS n FROM clothing_orders').get()?.n)>=300) continue
        const occupied=Number(store.db.prepare('SELECT count(*) AS n FROM wardrobe_items').get()?.n)
        const occurrences=new Map<string,number>()
        const products=event.items.flatMap(product=>Array.from({length:product.quantity},()=>product)).slice(0,30)
        if (!products.length || occupied+products.filter(product=>product.draft.isClothing!==false).length>300) continue
        const orderId=randomUUID()
        store.db.prepare(`INSERT INTO clothing_orders (id,account,sender,reference,merchant,ordered_on,deadline,shipped_on,total_cents,estimated_on)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(orderId,account,event.sender,event.reference,event.merchant,event.day,event.deadline,event.shipped??null,event.totalCents??null,event.estimated??null)
        const order=loadOrder(store,orderId)
        for (const product of products) {
          const key=fingerprint(product)
          const occurrence=(occurrences.get(key)??0)+1
          occurrences.set(key,occurrence)
          const wardrobe=product.draft.isClothing!==false ? saveWardrobe(store,product.draft) : undefined
          store.db.prepare(`INSERT INTO clothing_order_items (id,order_id,item_key,wardrobe_id,details,image_url)
            VALUES (?,?,?,?,?,?)`).run(randomUUID(),order.id,key+'#'+occurrence,wardrobe?.id??null,JSON.stringify(product.draft),product.image)
        }
        const events=store.db.prepare(`SELECT data FROM clothing_order_mail WHERE account=? AND sender=? AND reference=? AND day>=?
          ORDER BY day,rowid`).all(account,event.sender,event.reference,event.day)
        for (const row of events) applyMail(store,loadOrder(store,order.id),JSON.parse(String(row.data)) as ClothingMail)
        changes++
      } else {
        const compact=event.items.length ? {...event,items:event.items.map(item=>({
          ...item,image:'',draft:{...item.draft,source:''},
        }))} : {...event,items:[]}
        const fresh=insertEvent.run(account,digest(id),event.sender,event.reference,event.tracking,event.day,JSON.stringify(compact)).changes
        if (!fresh) continue
        if (current && event.day>=current.ordered_on) {
          applyMail(store,current,event)
          changes++
        }
      }
    }
    store.db.prepare('DELETE FROM clothing_order_mail WHERE day<?').run(shiftDay(dateInBerlin(),-180))
    store.db.prepare(`DELETE FROM clothing_order_mail WHERE rowid IN (SELECT rowid FROM clothing_order_mail WHERE account=?
      ORDER BY day DESC,rowid DESC LIMIT -1 OFFSET 500)`).run(account)
    return changes
  })
}

export function changeClothingOrder(store:Store,key:string,action:unknown,itemId?:string,value?:unknown) {
  return store.transaction(()=>{
    const order=loadOrder(store,key)
    if(order.cancelled_on) throw new Problem(409,'Diese Bestellung wurde storniert.')
    if (action==='received') markArrived(store,order,dateInBerlin())
    else if (action==='deadline') {
      if (!isDate(value)) throw new Problem(400,'Gib die bestätigte Rückgabefrist ein.')
      store.db.prepare('UPDATE clothing_orders SET deadline=? WHERE id=?').run(value,key)
    } else {
      const item=orderItems(store,key).find(row=>row.id===itemId)
      if (!item || !item.arrived) throw new Problem(409,'Bestätige zuerst, dass das Teil angekommen ist.')
      if (action==='returned' && item.decision!=='return' && item.decision!=='returned') {
        throw new Problem(409,'Dieses Teil ist nicht zur Rückgabe vorgemerkt.')
      }
      if (!['kept','return','returned'].includes(String(action))) throw new Problem(400,'Wähle die Aktion für das bestellte Teil.')
      if (item.decision==='returned' && action!=='returned') throw new Problem(409,'Diese Retoure wurde bereits abgegeben.')
      const details=JSON.parse(item.details) as OrderProductDraft
      const wardrobe=item.wardrobe_id ?? (action==='kept' && details.isClothing!==false ? saveWardrobe(store,details).id:null)
      store.db.prepare('UPDATE clothing_order_items SET decision=?,wardrobe_id=? WHERE id=?').run(String(action),wardrobe,item.id)
      if (item.decision!==action) recordOrderActivity(store,key,dateInBerlin())
      if (action==='kept') bookKeptItems(store,key)
      if (action==='returned' && wardrobe) store.db.prepare('DELETE FROM wardrobe_travel WHERE wardrobe_id=?').run(wardrobe)
    }
    syncReturnTask(store,key)
    return asView(store,loadOrder(store,key))
  })
}
export function orderItemPhoto(store:Store,id:string) {
  return store.db.prepare('SELECT product_photo AS photo FROM clothing_order_items WHERE id=? AND product_photo IS NOT NULL').get(id)?.photo as Uint8Array|undefined
}
export function clothingPhotoTargets(store:Store,id:string) {
  const order=loadOrder(store,id)
  // Auch stornierte und nicht in den Kleiderschrank übernommene Artikel bekommen ein Bild am Bestellposten.
  return orderItems(store,id).filter(item=>!item.image_checked)
    .map(item=>{
      const draft=JSON.parse(item.details) as OrderProductDraft
      return {id:item.id,shop:shopDomain(order.sender),wardrobe:item.decision!=='returned' && !order.cancelled_on ? item.wardrobe_id : null,image:item.image_url,source:draft.source,draft,merchant:order.merchant,
        sku:item.item_key.split('|')[0]}
    }).filter(item=>hasOrderPhotoSource(item.draft,item.image,item.merchant))
}
export function updateClothingTask(store:Store,taskId:string,revision:number,patch:TaskPatch,actor:string) {
  const order=store.db.prepare('SELECT id FROM clothing_orders WHERE task_id=?').get(taskId)
  if (!order) return store.transaction(()=>store.workspace.update(taskId,revision,patch,actor))
  return store.transaction(()=>{
    const current=store.workspace.get(taskId)
    if (current.revision!==revision) throw new Problem(409,'Die Retourenaufgabe wurde inzwischen geändert.')
    if (patch.status==='archived') throw new Problem(409,'Schließe die Retoure über ihre Checkliste ab.')
    const key=String(order.id)
    const items=orderItems(store,key).filter(item=>item.decision==='return'||item.decision==='returned')
    if (patch.steps && (patch.steps.length!==items.length ||
        patch.steps.some((step,index)=>step.title!==(JSON.parse(items[index].details) as WardrobeDraft).name))) {
      throw new Problem(409,'Bearbeite die Artikelauswahl bei der Bestellung.')
    }
    for (const [index,item] of items.entries()) {
      if (patch.status==='done' || patch.steps?.[index]?.done) {
        store.db.prepare("UPDATE clothing_order_items SET decision='returned' WHERE id=? AND decision='return'").run(item.id)
        recordOrderActivity(store,key,dateInBerlin())
        if (item.wardrobe_id) store.db.prepare('DELETE FROM wardrobe_travel WHERE wardrobe_id=?').run(item.wardrobe_id)
      }
    }
    if (patch.due_date!==undefined) {
      store.db.prepare('UPDATE clothing_orders SET deadline=? WHERE id=?').run(patch.due_date,key)
    }
    syncReturnTask(store,key)
    const updated=store.workspace.get(taskId)
    const boardPatch={
      ...(patch.project_id!==undefined&&{project_id:patch.project_id}),
      ...(patch.priority&&{priority:patch.priority}),
      ...(patch.category!==undefined&&{category:patch.category}),
    }
    return Object.keys(boardPatch).length?store.workspace.update(taskId,updated.revision,boardPatch,actor):updated
  })
}
