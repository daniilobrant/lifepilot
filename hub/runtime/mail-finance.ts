import {readAmazonOrder,readRecurringCharge,type RecurringCharge} from './purchase-mail.ts'
import {eventIdentity,readTicketEvent} from './event-mail.ts'
import {paypalSender,readPayPalPayment} from './paypal-mail.ts'
import {merchantKey,readMerchantPayment,readMerchantRefund} from './refund-mail.ts'
import { createHash, randomUUID } from 'node:crypto'
import { inboxLabel } from '../../agents/lifepilot/tools/classify-mail.ts'
import type { MailContent } from '../connectors/google.ts'
import { financeDraft, financeMonth, saveFinance } from './finance.ts'
import type { FinanceDraft } from './finance-types.ts'
import { Problem } from './settings.ts'
import type { Store } from './store.ts'
import { dateInBerlin, isDate } from './values.ts'

export type MailFinanceDraft = {title:string, cents:number, date:string, refund:boolean, mailDate:boolean, direction?:'incoming'|'outgoing'|'refund', counterparty?:string, description?:string, sourceKey?:string, ticket?:{reference:string,merchants:string[]}, paypal?:{reference:string}, merchantRefund?:{reference:string}, merchantPayment?:{reference:string}, category?:string, orderReference?:string, subscription?:RecurringCharge, recurrenceKey?:string}
export type MailFinanceProposal = MailFinanceDraft & {id:string}
type ProposalRow = {id:string,draft:string,state:string,entry_id:string|null,fingerprint:string}

function paymentSeries(merchant:string|undefined,description:string|undefined){
  const service=description?.trim()??''
  if(!merchant||!/^[\p{L}][\p{L} +&’'().-]{2,69}$/u.test(service)||
    /^(?:zahlung|einkauf|bestellung|waren|rechnung|danke|dankeschön|geschenk|payment|purchase|order|goods|thank you)$/iu.test(service))return
  return hash(['recurring-payment',eventIdentity(merchant),eventIdentity(service)])
}

function legacyFinanceFromMail(mail:MailContent) {
  const subject=mail.subject
  const label=inboxLabel(mail)
  if (label!=='finance' && label!=='returns' && label!=='orders') return
  const refund=/rückzahlung|rückerstattung|erstattung|erstattet|gutschrift|gutgeschrieben|refunded|refund (?:sent|received)/iu.test(subject)
  if ((!refund && !/zahlung (?:gesendet|bestätigt)|zahlungsbestätigung|bezahlt|payment sent|payment confirmation|paid receipt|quittung|kassenbon/iu.test(subject)) ||
      /offen|ausstehend|fehlgeschlagen|storniert|fehlgeschlagene|gescheitert|betrugsverdacht|payment failed|pending|your password/iu.test(subject)) return
  const text=mail.text.split(/\r?\n/u).filter(line=>!line.trimStart().startsWith('>')).join('\n')
  // Only an unambiguous EUR amount qualifies. Repeated mentions of the same total are common.
  const euro=/(?:\bEUR\s*|€\s*)?((?:\d{1,3}(?:[.\s]\d{3})+|\d+)[,.]\d{2})(?:\s*(EUR\b|€))?/giu
  const amounts=new Set<number>()
  for(const match of (subject+'\n'+text).matchAll(euro)){
    if (!match[2] && !/^(?:EUR|€)/iu.test(match[0])) continue
    const normalized=match[1].replace(/[.\s](?=.*[,.]\d{2}$)/gu,'')
    const cents=Number(normalized.replace(/[,.]/u,''))
    if (Number.isSafeInteger(cents) && cents>0 && cents<10_000_000) amounts.add(cents)
  }
  if (amounts.size!==1 || !mail.at || !Number.isFinite(Date.parse(mail.at))) return
  const cents=[...amounts][0]
  const found=/\b(?:zahlungsdatum|erstattungsdatum|transaktionsdatum|payment date|refund date|datum)\s*:\s*(?:(\d{4}-\d{2}-\d{2})|(\d{1,2})\.(\d{1,2})\.(\d{4}))/iu.exec(text)
  const stated=found?.[1]??(found?.[4] ? found[4]+'-'+found[3].padStart(2,'0')+'-'+found[2].padStart(2,'0') : '')
  const date=isDate(stated)?stated:dateInBerlin(new Date(mail.at))
  const item=/^\s*(?:artikel|produkt|beschreibung|beschreibung des einkaufs|item)\s*:\s*([^\n<>]{3,110})/imu.exec(text)?.[1]?.trim()
  const merchant=/^\s*(?:händler|verkäufer|zahlung an|empfänger|merchant|seller)\s*:\s*([^\n<>]{3,95})/imu.exec(text)?.[1]?.trim()
    ?? /(?:zahlung an|rückzahlung von)\s+([^\n<>]{3,95})/iu.exec(subject)?.[1]?.trim()
  const sender=mail.from.split(/\s*</u)[0].replace(/^"|"$/gu,'').trim()
  const title=(item && merchant ? item+' · '+merchant : item||merchant||sender||subject).slice(0,120)
  const transaction=/\b(?:transaktions(?:code|nummer|[- ]?id)|transaction id)\s*:\s*([a-z0-9-]{8,40})\b/iu.exec(text)?.[1]
  const verifiedPayment=transaction&&!refund&&!paypalSender(mail.from)&&merchant&&item&&
    /zahlung (?:gesendet|bestätigt)|bezahlt|payment sent|paid receipt/iu.test(subject)
  const recurrenceKey=verifiedPayment?paymentSeries(merchant,item):undefined
  const draft:MailFinanceDraft={title,cents,date,refund,mailDate:!isDate(stated),
    ...(recurrenceKey&&{recurrenceKey,direction:'outgoing',counterparty:merchant,description:item})}
  const identity=transaction ? ['transaction',transaction.toUpperCase(),refund] : [date,cents,refund,title.toLowerCase()]
  return {draft,fingerprint:createHash('sha256').update(JSON.stringify(identity)).digest('hex')}
}

// Zahlungen zwischen Personen (PayPal „Freunde und Familie“) sind kein Shopping.
const company=/\b(?:gmbh|ag|bv|b\.v\.|ltd|limited|inc|llc|s\.a\.|sarl|payments?|europe|services?|shop|store|markt|online|\.com|\.de|dac|plc|co\.?)\b/iu
export function personalTransfer(draft:Pick<MailFinanceDraft,'paypal'|'counterparty'|'title'|'direction'>) {
  if (!draft.paypal) return false
  const name=(draft.counterparty ?? draft.title.split(' · ')[0] ?? '').trim()
  return /^\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}?[\p{L}'’-]+){1,3}$/u.test(name) && !company.test(name)
}
export function recategorizePersonal(store:Store,account:string) {
  const rows=store.db.prepare(`SELECT id,draft,entry_id FROM gmail_finance_suggestions WHERE account=?
    AND coalesce(json_extract(draft,'$.category'),'')<>'Freunde & Familie'`).all(account) as {id:string,draft:string,entry_id:string|null}[]
  for (const row of rows) {
    const draft=JSON.parse(row.draft) as MailFinanceDraft
    // Ältere PayPal-Vorschläge tragen noch keine PayPal-Markierung, aber Richtung und Gegenpartei.
    const legacy=!draft.paypal && Boolean(draft.direction && draft.counterparty && !draft.ticket && !draft.orderReference &&
      !draft.merchantPayment && !draft.merchantRefund && !draft.subscription)
    if (!personalTransfer(legacy ? {...draft,paypal:{reference:''}} : draft)) continue
    store.db.prepare('UPDATE gmail_finance_suggestions SET draft=? WHERE id=?').run(JSON.stringify({...draft,category:'Freunde & Familie'}),row.id)
    if (row.entry_id) store.db.prepare(`UPDATE finance_entries SET data=json_set(data,'$.category','Freunde & Familie'),revision=revision+1
      WHERE id=? AND coalesce(json_extract(data,'$.category'),'') IN ('','Shopping & Alltag','Sonstiges')`).run(row.entry_id)
  }
}

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function financeFromMail(mail:MailContent){
  if(mail.previewOnly)return
  const subscription=readRecurringCharge(mail)
  if(subscription){
    const sourceKey=hash(['mail-subscription',subscription.key])
    const draft:MailFinanceDraft={...subscription,subscription,sourceKey,refund:false,mailDate:false,direction:'outgoing'}
    return {draft,fingerprint:sourceKey,legacyFingerprint:undefined}
  }
  const order=readAmazonOrder(mail)
  if(order){
    const sourceKey=hash(['amazon-order',order.reference])
    const draft:MailFinanceDraft={...order,orderReference:order.reference,sourceKey,refund:false,mailDate:true,direction:'outgoing',counterparty:'Amazon'}
    return {draft,fingerprint:sourceKey,legacyFingerprint:undefined}
  }
  const ticket=readTicketEvent(mail)
  if(ticket){
    if(!ticket.cents||!mail.at||!Number.isFinite(Date.parse(mail.at)))return
    const date=dateInBerlin(new Date(mail.at))
    const provider=/@([^>\s]+)>?\s*$/u.exec(mail.from)?.[1]?.toLowerCase()??ticket.merchants.at(-1)??''
    const sourceKey=hash(ticket.reference&&provider?['ticket-order',provider,ticket.reference]:
      ['ticket-expense',date,String(ticket.cents),eventIdentity(ticket.title),ticket.date,ticket.time])
    const draft:MailFinanceDraft={title:ticket.title,cents:ticket.cents,date,refund:false,mailDate:true,direction:'outgoing',sourceKey,
      ticket:{reference:ticket.reference,merchants:ticket.merchants},category:'Freizeit & Kultur'}
    return {draft,fingerprint:sourceKey,legacyFingerprint:undefined}
  }
  const merchantRefund=readMerchantRefund(mail)
  if(merchantRefund){
    const {cents,counterparty,description,reference,date,domain}=merchantRefund
    const sourceKey=hash(['merchant-refund',domain,reference??'',cents,mail.id])
    const title=(description?[description,counterparty]:[counterparty??'Erstattung',reference&&'Bestellung '+reference]).filter(Boolean).join(' · ').slice(0,120)
    const draft:MailFinanceDraft={title,cents,date,refund:true,mailDate:true,direction:'refund',sourceKey,
      merchantRefund:{reference:reference??''},...(counterparty&&{counterparty}),...(description&&{description})}
    return {draft,fingerprint:sourceKey,legacyFingerprint:undefined}
  }
  const merchantPayment=readMerchantPayment(mail)
  if(merchantPayment){
    const {cents,counterparty,description,reference,date,domain,category}=merchantPayment
    const sourceKey=hash(['merchant-payment',domain,reference??'',cents,mail.id])
    const title=[description,counterparty??'Zahlung'].filter(Boolean).join(' · ').slice(0,120)
    const draft:MailFinanceDraft={title,cents,date,refund:false,mailDate:true,direction:'outgoing',sourceKey,
      merchantPayment:{reference:reference??''},...(category&&{category}),...(counterparty&&{counterparty}),...(description&&{description})}
    return {draft,fingerprint:sourceKey,legacyFingerprint:undefined}
  }
  const legacy=legacyFinanceFromMail(mail)
  const paypal=readPayPalPayment(mail)
  if(!paypal){
    if(legacy&&paypalSender(mail.from)&&/paypal|^rechnungen$/iu.test(legacy.draft.title))
      return {...legacy,draft:{...legacy.draft,title:legacy.draft.refund?'Erstattung · Absender unklar':'Zahlung · Gegenpartei unklar'},
        legacyFingerprint:legacy.fingerprint}
    return legacy?{...legacy,legacyFingerprint:undefined}:undefined
  }
  if(!mail.at||!Number.isFinite(Date.parse(mail.at)))return undefined
  const {direction,transaction,counterparty,description,cents}=paypal
  const refund=direction==='refund'
  const sourceKey=hash(['paypal',transaction,refund])
  const base=counterparty||(refund?'Erstattung · Absender unklar':direction==='incoming'?'Zahlungseingang · Absender unklar':'Zahlung · Empfänger unklar')
  const title=[base,description].filter(Boolean).join(' · ').slice(0,120)
  const stated=paypal.date
  const recurrenceKey=direction==='outgoing'?paymentSeries(counterparty,description):undefined
  const draft:MailFinanceDraft={title,cents,recurrenceKey,date:stated??dateInBerlin(new Date(mail.at)),refund,mailDate:!stated,
    direction,sourceKey,paypal:{reference:paypal.orderReference},...(counterparty&&{counterparty}),...(description&&{description})}
  if (personalTransfer(draft)) draft.category='Freunde & Familie'
  return {draft,fingerprint:sourceKey,legacyFingerprint:legacy?.fingerprint}
}
export const financeMailNote=(draft:MailFinanceDraft)=>
  [draft.description,'Aus einer bestätigten Gmail-Nachricht übernommen.'].filter(Boolean).join(' · ')
const genericPaypalTitle=(title:string)=>/^(?:rechnungen|.*\bpaypal(?:-service| kundendienst)?(?:\.de|\.com)?|(?:zahlung(?:seingang)?|erstattung) · (?:empfänger|absender|gegenpartei) unklar)$/iu.test(title)

function persistSubscription(store:Store,account:string,subscription:RecurringCharge) {
  const fingerprint=hash(['mail-subscription',subscription.key])
  const prior=store.db.prepare('SELECT * FROM gmail_finance_suggestions WHERE account=? AND fingerprint=?')
    .get(account,fingerprint) as ProposalRow|undefined
  const previous=prior?JSON.parse(prior.draft) as MailFinanceDraft:undefined
  if(previous?.date&&previous.date>subscription.date)return 0
  const draft:MailFinanceDraft={title:subscription.title,cents:subscription.cents,date:subscription.date,subscription,
    sourceKey:fingerprint,refund:false,mailDate:false,direction:'outgoing'}
  if(!prior){
    store.db.prepare('INSERT INTO gmail_finance_suggestions (id,account,fingerprint,draft) VALUES (?,?,?,?)')
      .run(randomUUID(),account,fingerprint,JSON.stringify(draft))
    return 1
  }
  if(JSON.stringify(previous)===JSON.stringify(draft))return 0
  const changed=previous?.cents!==draft.cents||previous.title!==draft.title||previous.subscription?.cycle!==subscription.cycle
  const state=changed?'pending':prior.state
  store.db.prepare('UPDATE gmail_finance_suggestions SET draft=?,state=? WHERE id=?')
    .run(JSON.stringify(draft),state,prior.id)
  return state==='pending'&&prior.state!=='pending'?1:0
}

const recurringPayments=(store:Store,account:string,key:string,cents:number)=>
  (store.db.prepare(`SELECT DISTINCT json_extract(draft,'$.date') AS date
     FROM gmail_finance_suggestions WHERE account=? AND json_extract(draft,'$.recurrenceKey')=?
       AND json_extract(draft,'$.cents')=? AND state<>'denied' ORDER BY date DESC LIMIT 8`)
    .all(account,key,cents)).map(row=>String(row.date))

function inferSubscription(store:Store,account:string,draft:MailFinanceDraft){
  const key=draft.recurrenceKey
  if(!key)return 0
  const days=recurringPayments(store,account,key,draft.cents)
  const gap=(later:string,earlier:string)=>(Date.parse(later)-Date.parse(earlier))/86_400_000
  const match=days.findIndex((date,index)=>index+2<days.length&&
    [gap(date,days[index+1]),gap(days[index+1],days[index+2])].every(value=>value>=26&&value<=35))
  return match<0?0:persistSubscription(store,account,{key,title:draft.description+' · '+draft.counterparty,cents:draft.cents,
    date:days[match],cycle:'monthly',confirmed:false})
}

// Händler und PayPal melden dieselbe Zahlung oder Erstattung oft getrennt. Gleicher Betrag, gleiche Richtung,
// gleicher Händler und höchstens drei Tage Abstand ergeben einen Vorschlag.
function refundTwin(store:Store,account:string,draft:MailFinanceDraft){
  const key=merchantKey(draft.counterparty)
  if(key.length<3)return false
  const rows=store.db.prepare(`SELECT draft FROM gmail_finance_suggestions WHERE account=? AND coalesce(json_extract(draft,'$.refund'),0)=?
    AND json_extract(draft,'$.cents')=? AND abs(julianday(json_extract(draft,'$.date'))-julianday(?))<=3`)
    .all(account,draft.refund?1:0,draft.cents,draft.date) as {draft:string}[]
  const merchant=(item:MailFinanceDraft)=>Boolean(item.merchantRefund||item.merchantPayment)
  return rows.some(row=>{
    const other=JSON.parse(row.draft) as MailFinanceDraft
    return Boolean((merchant(draft)&&other.paypal||draft.paypal&&merchant(other))&&merchantKey(other.counterparty)===key)
  })
}

export function scanMailFinances(store:Store,mails:MailContent[],account:string,existingOnly=false){
  return store.transaction(()=>{
    recategorizePersonal(store,account)
    const insert=store.db.prepare('INSERT OR IGNORE INTO gmail_finance_suggestions (id,account,fingerprint,draft) VALUES (?,?,?,?)')
    const find=store.db.prepare('SELECT * FROM gmail_finance_suggestions WHERE account=? AND fingerprint=?')
    const update=store.db.prepare('UPDATE gmail_finance_suggestions SET fingerprint=?,draft=? WHERE id=?')
    const candidates=store.db.prepare(`SELECT * FROM gmail_finance_suggestions WHERE account=?
      AND json_extract(draft,'$.cents')=? AND json_extract(draft,'$.direction')='outgoing'
      AND (json_extract(draft,'$.date')=? OR (?<>'' AND coalesce(json_extract(draft,'$.ticket.reference'),json_extract(draft,'$.orderReference'),json_extract(draft,'$.paypal.reference'))=?))`)
    let added=0, updated=0, bookings=0
    for(const mail of mails){
      const proposal=financeFromMail(mail)
      if(!proposal)continue
      const {fingerprint,draft,legacyFingerprint}=proposal
      if(draft.subscription){
        if(!existingOnly)added+=persistSubscription(store,account,draft.subscription)
        continue
      }
      let present=(find.get(account,fingerprint)??(legacyFingerprint?find.get(account,legacyFingerprint):undefined)) as ProposalRow|undefined
      const reference=draft.ticket?.reference??draft.orderReference??draft.paypal?.reference??''
      const matches=(draft.ticket||draft.orderReference||draft.paypal)&&draft.direction==='outgoing'?
        (candidates.all(account,draft.cents,draft.date,reference,reference) as ProposalRow[]).filter(row=>{
          if(row.id===present?.id)return false
          const other=JSON.parse(row.draft) as MailFinanceDraft
          if(draft.paypal&&other.paypal&&draft.sourceKey!==other.sourceKey)return false
          if(draft.ticket&&other.ticket&&draft.ticket.reference!==other.ticket.reference)return false
          if(draft.orderReference||other.orderReference){
            const reference=draft.orderReference??other.orderReference
            const payment=draft.paypal??other.paypal
            return Boolean(payment?.reference&&reference===payment.reference&&!(draft.paypal&&other.paypal))
          }
          const ticket=draft.ticket??other.ticket
          const payment=draft.paypal?draft:other
          if(!ticket||!payment.paypal||!(draft.ticket&&other.paypal||draft.paypal&&other.ticket))return false
          if(ticket.reference&&payment.paypal.reference)return ticket.reference===payment.paypal.reference
          if(payment.date!==(draft.ticket?draft.date:other.date))return false
          const merchant=eventIdentity(payment.counterparty??'').replace(/(?:gmbh|ltd|inc|limited)$/u,'')
          return merchant.length>=5&&ticket.merchants.some(name=>name.replace(/(?:gmbh|ltd|inc|limited)$/u,'')===merchant)
        }):[]
      if(matches.length===1){
        const other=matches[0]
        if(!present)present=other
        else if(other.state==='pending'||present.state==='pending'){
          const keep=other.state==='pending'?present:other
          const discard=keep===other?present:other
          store.db.prepare("DELETE FROM gmail_finance_suggestions WHERE id=? AND state='pending'").run(discard.id)
          present=keep
        }
      }
      if(!present&&(draft.merchantRefund||draft.merchantPayment||draft.paypal)&&refundTwin(store,account,draft))continue
      if(!present){
        if(!existingOnly){
          added+=Number(insert.run(randomUUID(),account,fingerprint,JSON.stringify(draft)).changes)
          added+=inferSubscription(store,account,draft)
        }
        continue
      }
      if(!draft.direction||present.state==='denied')continue
      const prior=JSON.parse(present.draft) as MailFinanceDraft
      if(prior.cents!==draft.cents||prior.refund!==draft.refund)continue
      const event=prior.ticket||prior.orderReference?prior:draft.ticket||draft.orderReference?draft:undefined
      const payment=draft.paypal?draft:prior.paypal?prior:undefined
      const combined=event&&payment?{...event,...payment,title:event.title,category:event.category,ticket:event.ticket}:undefined
      const enrichment={...(combined??{...prior,...draft}),date:present.state==='accepted'?prior.date:(combined??draft).date}
      const canonical=payment?.sourceKey??fingerprint
      if(JSON.stringify(prior)!==JSON.stringify(enrichment)||present.fingerprint!==canonical){
        update.run(canonical,JSON.stringify(enrichment),present.id)
        updated++
      }
      if(!present.entry_id||!enrichment.sourceKey)continue
      const row=store.db.prepare('SELECT data,revision FROM finance_entries WHERE id=?').get(present.entry_id)
      if(!row)continue
      const entry=JSON.parse(String(row.data)) as FinanceDraft
      if(entry.cents!==draft.cents||!!entry.refund!==draft.refund)continue
      const title=(entry.title===prior.title&&(genericPaypalTitle(prior.title)||combined))||genericPaypalTitle(entry.title)?enrichment.title:entry.title
      const note=draft.description&&(!entry.note||entry.note==='Aus einer bestätigten Gmail-Nachricht übernommen.')?financeMailNote(draft):entry.note
      if(title!==entry.title||note!==entry.note||entry.sourceKey!==enrichment.sourceKey){
        store.db.prepare('UPDATE finance_entries SET data=?,revision=revision+1 WHERE id=? AND revision=?')
          .run(JSON.stringify({...entry,title,note,sourceKey:enrichment.sourceKey}),present.entry_id,row.revision)
        bookings++
      }
    }
    return {added,updated,bookings}
  })
}

export function pendingMailFinances(store:Store,account:string):MailFinanceProposal[] {
  return (store.db.prepare(`SELECT candidate.id,candidate.draft FROM gmail_finance_suggestions candidate
    WHERE candidate.account=? AND candidate.state='pending' AND NOT EXISTS (
      SELECT 1 FROM gmail_finance_suggestions subscription
      WHERE subscription.account=candidate.account AND subscription.state IN ('pending','accepted')
        AND json_extract(subscription.draft,'$.subscription.key')=json_extract(candidate.draft,'$.recurrenceKey')
        AND (subscription.state='pending' OR EXISTS (
          SELECT 1 FROM finance_entries entry WHERE entry.id=subscription.entry_id
           AND entry.month<=substr(json_extract(candidate.draft,'$.date'),1,7)
           AND (entry.until_month IS NULL OR substr(json_extract(candidate.draft,'$.date'),1,7)<entry.until_month)
        ))
    ) ORDER BY json_extract(candidate.draft,'$.date') DESC,candidate.rowid DESC LIMIT 100`)
    .all(account) as ProposalRow[]).map(row=>({...JSON.parse(row.draft) as MailFinanceDraft,id:row.id}))
}

export function decideMailFinance(store:Store,account:string,id:string,approved:boolean,reviewed:unknown) {
  return store.transaction(()=>{
    const row=store.db.prepare('SELECT * FROM gmail_finance_suggestions WHERE id=? AND account=?').get(id,account) as ProposalRow|undefined
    if(!row) throw new Problem(404,'Der Finanzvorschlag ist nicht verfügbar.')
    if(row.state!=='pending') {
      if((row.state==='accepted')!==approved) throw new Problem(409,'Dieser Vorschlag wurde bereits entschieden.')
      return {entryId:row.entry_id}
    }
    const original=JSON.parse(row.draft) as MailFinanceDraft
    let entryId:string|null=null
    if(approved&&original.subscription){
      const reviewedFields=reviewed && typeof reviewed==='object' ? reviewed as Record<string,unknown> : {}
      const proposedDate=reviewedFields.date??original.date
      if(!isDate(proposedDate))throw new Problem(400,'Wähle ein gültiges Startdatum für das Abo.')
      const subscription=original.subscription
      let month=financeMonth(proposedDate.slice(0,7))
      const booked=store.db.prepare(`SELECT max(substr(json_extract(draft,'$.date'),1,7)) AS month FROM gmail_finance_suggestions
        WHERE account=? AND state='accepted' AND (json_extract(draft,'$.recurrenceKey')=? OR
        (?='apple.com:icloud+' AND lower(json_extract(draft,'$.title')) LIKE '%icloud%')) AND json_extract(draft,'$.subscription') IS NULL`)
        .get(account,subscription.key,subscription.key)?.month
      if(typeof booked==='string'&&booked>=month){
        const date=new Date(booked+'-01T00:00:00Z')
        date.setUTCMonth(date.getUTCMonth()+1)
        month=financeMonth(date.toISOString().slice(0,7))
      }
      const active=store.db.prepare(`SELECT id,revision FROM finance_entries WHERE kind='subscription' AND month<=?
        AND (until_month IS NULL OR ?<until_month) AND (json_extract(data,'$.sourceKey')=? OR lower(json_extract(data,'$.title'))=lower(?)
        OR (?='apple.com:icloud+' AND lower(json_extract(data,'$.title')) LIKE 'icloud%'))`)
        .all(month,month,original.sourceKey??'',original.title,subscription.key)
      if(active.length>1)throw new Problem(409,'Mehrere passende Abos gefunden. Prüfe Finanzen & Abos.')
      const current=active[0]
      entryId=saveFinance(store,{kind:'subscription',title:reviewedFields.title??original.title,cents:original.cents,cycle:subscription.cycle,
        renewal:subscription.renewal,category:'Freizeit & Abos',note:financeMailNote(original),sourceKey:original.sourceKey},month,
        current?{id:String(current.id),revision:Number(current.revision)}:undefined).id
    }else if(approved){
      const correction=reviewed && typeof reviewed==='object' ? reviewed as Record<string,unknown> : {}
      const draft=financeDraft({kind:original.direction==='incoming'?'income':'expense',title:correction.title??original.title,cents:original.cents,date:correction.date??original.date,
        category:original.category??'Shopping & Alltag',refund:original.refund,note:financeMailNote(original),sourceKey:original.sourceKey})
      const month=financeMonth(draft.date?.slice(0,7))
      const knownOrder=original.orderReference?store.db.prepare(`SELECT f.entry_id AS id FROM order_finance_entries f
        JOIN clothing_orders o ON o.id=f.order_id WHERE o.account=? AND o.reference=? AND f.kind='purchase'`)
        .get(account,original.orderReference):undefined
      const existing=knownOrder??(draft.sourceKey?store.db.prepare("SELECT id FROM finance_entries WHERE json_extract(data,'$.sourceKey')=?").get(draft.sourceKey):
        store.db.prepare(`SELECT id FROM finance_entries WHERE kind=? AND month=?
          AND json_extract(data,'$.date')=? AND json_extract(data,'$.cents')=? AND lower(json_extract(data,'$.title'))=lower(?)
          AND coalesce(json_extract(data,'$.refund'),0)=?`).get(draft.kind,month,draft.date,draft.cents,draft.title,draft.refund?1:0))
      entryId=existing ? String(existing.id) : saveFinance(store,draft as FinanceDraft,month).id
      if(original.orderReference)store.db.prepare(`INSERT OR IGNORE INTO order_finance_entries (order_id,kind,entry_id)
        SELECT id,'purchase',? FROM clothing_orders WHERE account=? AND reference=?`)
        .run(entryId,account,original.orderReference)
    }
    store.db.prepare('UPDATE gmail_finance_suggestions SET state=?,entry_id=? WHERE id=?').run(approved?'accepted':'denied',entryId,id)
    return {entryId}
  })
}
