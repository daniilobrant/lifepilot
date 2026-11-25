import type {MailContent} from '../connectors/google.ts'
import {htmlMailText} from './clothing-mail.ts'
import {paypalSender} from './paypal-mail.ts'
import {dateInBerlin} from './values.ts'

/** Händler-Erstattungen außerhalb von PayPal, etwa „Gutschriftbestätigung für Bestellung …“ oder „Ihre Rückerstattung wurde bearbeitet“. */
export const refundSubject=/gutschrift|gutgeschrieben|erstattung|erstattet|rückzahlung|zurückgezahlt|geld zurück|\brefund(?:ed)?\b|money back/iu
// Angekündigte, beantragte oder abgelehnte Erstattungen bewegen noch kein Geld.
const notYet=/angefragt|beantragt|anfrage|registriert|wird geprüft|in prüfung|wird bearbeitet|in bearbeitung|abgelehnt|fehlgeschlagen|nicht erstattet|ausstehend|pending|requested|declined|failed|on its way back to us/iu
const promotion=/gutschein|rabatt|\d+\s*%|aktion|angebot|punkte|cashback|guthaben zurück|newsletter|\bdeals?\b|\bsale\b/iu
const amount='((?:\\d{1,3}(?:[.\\s]\\d{3})+|\\d+)[,.]\\d{2})'
// Nur Formulierungen, die den Gesamtbetrag nennen. „Artikel Erstattung: 21,47 €“ ist ein Teilbetrag und zählt nicht.
const anchored=[
  new RegExp('(?:rück)?(?:erstattung|gutschrift|zahlung)\\s+(?:von|über|in höhe von)\\s+(?:EUR\\s*|€\\s*)?'+amount+'\\s*(?:€|EUR)?','giu'),
  new RegExp('(?:teilrückzahlung|erstattungsbetrag|rückerstattungsbetrag|gutschriftsbetrag|gesamterstattung|erstatteter betrag|zurückgezahlter betrag|gutgeschriebener betrag|refund amount|total refund(?:ed)?|refund of)\\s*(?:in höhe von|von|:)?\\s*(?:EUR\\s*|€\\s*)?'+amount+'\\s*(?:€|EUR)?','giu'),
  new RegExp('(?:EUR\\s*|€\\s*)?'+amount+'\\s*(?:€|EUR)\\s+(?:wurden?\\s+|werden\\s+|have been\\s+|has been\\s+|was\\s+)?(?:(?:ihnen|dir|auf ihr\\w*|auf dein\\w*)\\s+(?:\\S+\\s+){0,3})?(?:erstattet|gutgeschrieben|zurückgezahlt|zurücküberwiesen|refunded|credited)','giu'),
]
const toCents=(raw:string)=>{
  const normalized=raw.replace(/[.\s](?=\d{3}(?:\D|$))/gu,'').replace(',','.')
  const cents=Math.round(Number(normalized)*100)
  return Number.isSafeInteger(cents)&&cents>0&&cents<10_000_000?cents:0
}
function uniqueAnchored(text:string){
  const found=new Set<number>()
  for(const pattern of anchored)for(const match of text.matchAll(pattern)){
    if(!/€|EUR/iu.test(match[0]))continue
    const cents=toCents(match[1])
    if(cents)found.add(cents)
  }
  return found.size===1?[...found][0]:0
}
const tidy=(text:string)=>text.replace(/\p{Cf}|͏/gu,'').replace(/\s+/gu,' ').trim()
function merchantName(from:string){
  const display=tidy(from.split(/\s*</u)[0].replace(/^"|"$/gu,''))
  const domain=/@([a-z0-9.-]+\.[a-z]{2,})>?\s*$/iu.exec(from)?.[1]?.toLowerCase()??''
  const generic=!display||/@|no-?reply|service|kundenservice|support|info|payments?|team/iu.test(display)
  const base=domain.split('.').slice(-2,-1)[0]??''
  const name=generic?(base?base[0].toUpperCase()+base.slice(1):''):display.replace(/\.(?:de|com|eu|at|ch|co\.uk|fr|nl|it|es)$/iu,'')
  return {name:name.slice(0,60),domain}
}

export function readMerchantRefund(mail:MailContent){
  if(mail.previewOnly||paypalSender(mail.from))return undefined
  const subject=tidy(mail.subject)
  if(!refundSubject.test(subject)||notYet.test(subject)||promotion.test(subject))return undefined
  if(!mail.at||!Number.isFinite(Date.parse(mail.at)))return undefined
  const raw=/<(?:table|html|body)\b/iu.test(mail.text)?htmlMailText(mail.text):mail.text
  const body=raw.split(/\r?\n/u).filter(line=>!line.trimStart().startsWith('>')).join('\n')
  const text=tidy(body).slice(0,6000)
  // Der Text muss die erfolgte Erstattung selbst bestätigen, nicht nur Rückgabebedingungen erklären.
  if(!/erstattet|gutgeschrieben|zurückgezahlt|erfolgte erstattung|erstattung (?:von|über|in höhe)|bestätigen .{0,60}(?:erstattung|gutschrift)|(?:rück)?erstattung (?:wurde|ist|haben wir)|teilrückzahlung|refund(?:ed| of| has been| was| is on its way)|ist unterwegs/iu.test(text))return undefined
  const cents=uniqueAnchored(subject+' '+text)
  if(!cents)return undefined
  const reference=/\b(?:bestellung|bestellnummer|bestell-?nr\.?|auftragsnummer|auftrag|order(?: number| id| no\.?)?)\s*(?:nr\.?|nummer|no\.?|#)?\s*:?\s*([a-z0-9][a-z0-9-]{4,30})\b/iu.exec(subject+' '+text)?.[1]
  const found=/\b(?:artikel|produkt|item)\s*:\s*(?!\s*(?:artikel|produkt|item)\b)(.{3,200}?)(?=\s+(?:menge|anzahl|asin|grund|größe|farbe|preis|quantity|qty)\b|\s*$)/iu.exec(tidy(body))?.[1]?.trim()
  // Eine Artikelliste mit Preisen ist keine eindeutige Beschreibung. Ein einzelner Preis am Ende wird abgeschnitten.
  const prices=found?[...found.matchAll(/\s*(?:€\s*)?\d+[,.]\d{2}\s*(?:€|EUR)/giu)]:[]
  const item=!found||prices.length>1?undefined:prices.length===1?(prices[0].index+prices[0][0].length>=found.length-1?found.slice(0,prices[0].index).trim():undefined):found
  const {name,domain}=merchantName(mail.from)
  const description=item&&item.length>=3?(item.length>70?item.slice(0,70).replace(/\s+\S*$/u,'')+' …':item):undefined
  return {cents,counterparty:name||undefined,domain,description,
    reference:reference&&/\d/u.test(reference)?reference:undefined,date:dateInBerlin(new Date(mail.at))}
}

/** Erster Namensbestandteil für den Abgleich Händler-Erstattung ↔ PayPal-Rückzahlung („ZARA.COM“ ↔ „Zara“). */
export const merchantKey=(name:string|undefined)=>(/\p{L}{3,}/u.exec((name??'').toLowerCase())?.[0])??''
