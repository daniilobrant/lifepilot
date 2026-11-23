import type {MailContent} from '../connectors/google.ts'
import {htmlMailText} from './clothing-mail.ts'
import {isDate} from './values.ts'

const value=(text:string,pattern:RegExp)=>pattern.exec(text)?.[1]?.trim()||''
const tidy=(text:string)=>text.replace(/\s+/gu,' ').trim()
export const paypalSender=(from:string)=>/@(?:[a-z0-9-]+\.)*paypal\.(?:de|com)>?\s*$/iu.test(from)
const euro='(?:€\\s*[\\d., ]+(?:EUR)?|[\\d., ]+(?:€(?:\\s*EUR)?|EUR))'
function euros(raw:string){
  if(!/EUR|€/iu.test(raw))return undefined
  const found=/(?:€\s*)?((?:\d{1,3}(?:[. ]\d{3})+|\d+)[,.]\d{2})(?=\s*(?:€|EUR|$))/iu.exec(raw.trim())
  if(!found)return undefined
  const cents=Number(found[1].replace(/[^\d]/gu,''))
  return cents>0&&cents<10_000_000?cents:undefined
}
const months=['januar','februar','märz','april','mai','juni','juli','august','september','oktober','november','dezember']
function date(raw:string){
  const numeric=/\b(20\d\d-\d\d-\d\d|(?<day>\d{1,2})\.(?<month>\d{1,2})\.(?<year>20\d\d))\b/u.exec(raw)
  if(numeric){
    const value=numeric.groups?.year?numeric.groups.year+'-'+numeric.groups.month.padStart(2,'0')+'-'+numeric.groups.day.padStart(2,'0'):numeric[1]
    if(isDate(value))return value
  }
  const written=/\b(\d{1,2})\.?\s+([\p{L}]+)\s+(20\d\d)\b/iu.exec(raw)
  const month=written?months.indexOf(written[2].toLowerCase())+1:0
  if(written&&month){
    const value=written[3]+'-'+String(month).padStart(2,'0')+'-'+written[1].padStart(2,'0')
    if(isDate(value))return value
  }
}
function namedField(lines:string[],name:RegExp){
  for(const [index,line] of lines.entries()){
    const match=name.exec(line)
    if(match){const result=match[1]?.trim()||lines[index+1];if(result)return result}
  }
  return ''
}
function verifiedField(raw:string,description=false){
  const text=tidy(raw).replace(/^[„“"»]+|[“”"«]+$/gu,'')
  if(!text||text.length>(description?350:115)||/https?:\/\/|[<>]|^(?:paypal(?:\s+(?:service|kundendienst))?|transaktions(?:code|datum|details)|gebühr|zahlungsdetails|nicht angegeben|[-–—]+)$/iu.test(text))return ''
  return text
}
export function readPayPalPayment(mail:MailContent){
  if(!paypalSender(mail.from))return undefined
  const subject=tidy(mail.subject)
  if(/fehlgeschlagen|storniert|betrug|ausstehend|pending|failed|cancelled|abgelehnt|eingezogen|konflikt|ratenzahlung|überwiesen|in \d+ tagen|hat sich geändert/iu.test(subject))return undefined
  const original=/<(?:table|html|body)\b/iu.test(mail.text)?htmlMailText(mail.text):mail.text
  const lines=original.split(/\r?\n/u).map(line=>tidy(line)).filter(line=>line&&!line.startsWith('>'))
  const joined=lines.slice(0,30).join(' ')
  const incoming=new RegExp('(?:^|[.!?] )(.{2,110}?) hat (?:dir|ihnen) ('+euro+') gesendet','iu')
  const outgoing=new RegExp('(?:du hast|sie haben) ('+euro+') an (.{2,110}?) (?:gesendet|gezahlt)','iu')
  const find=(pattern:RegExp)=>lines.map(line=>pattern.exec(line)).find(result=>result)
  const received=find(incoming)
  const sent=find(outgoing)
  const refund=/rückzahlung|rückerstattung|refund/iu.test(subject)
  const direction=refund?'refund':/zahlung erhalten|payment received|received a payment/iu.test(subject)?'incoming':
    /zahlung (?:gesendet|(?:wurde )?verarbeitet|an )|beleg für ihre zahlung|payment sent|receipt for your payment/iu.test(subject)||sent?'outgoing':undefined
  const transaction=value(lines.join('\n'),/^(?:transaktions(?:code|nummer|[- ]?id)|transaction id)\s*:?\s*\n?\s*([a-z0-9-]{8,40})\b/imu)
  if(!direction||!transaction)return undefined
  const merchant=namedField(lines,/^(?:händler|verkäufer|firmenname|empfänger|zahlung an|gesendet an|merchant|seller|recipient|paid to)\s*(?::\s*(.*))?$/iu)
  const payer=namedField(lines,/^(?:absender|von|zahlung von|erhalten von|gesendet von|sender|paid by|received from)\s*(?::\s*(.*))?$/iu)
  const counterparty=verifiedField(direction==='refund'?
    namedField(lines,/^(?:rückzahlung gezahlt von|refunded by)\s*(?::\s*(.*))?$/iu)||value(subject,/(?:rückzahlung von|refund from)\s+(.+?)[.!]?$/iu):
    direction==='incoming'?received?.[1]||payer:
    sent?.[2]||merchant||value(subject,/(?:zahlung an|payment to)\s+(.+?)[.!]?$/iu)||
    value(joined,/sie haben eine zahlung.{0,95}? an (.{2,110}?) gesendet/iu))
  const description=verifiedField(namedField(lines,/^(?:beschreibung(?: des einkaufs| der zahlung)?|artikel(?:beschreibung)?|produkt|zahlungsgrund|verwendungszweck|persönliche nachricht|nachricht(?: von .{2,85}| (?:an|für) den empfänger)?|notiz(?: von .{2,85})?|mitteilung|item description|payment note|note|description)\s*(?::\s*(.*))?$/iu),true)
  const amountField=direction==='refund'?/^(?:zurückgezahlter betrag|erstatteter betrag|refund amount)\s*(?::\s*(.*))?$/iu:
    direction==='incoming'?/^(?:erhaltener betrag|zahlung erhalten|amount received|received amount|bruttobetrag)\s*(?::\s*(.*))?$/iu:
    /^(?:geld gesendet|zahlungsbetrag|amount sent|payment amount)\s*(?::\s*(.*))?$/iu
  const cents=euros(namedField(lines,amountField))??euros(direction==='incoming'?received?.[2]??'':direction==='outgoing'?sent?.[1]??'':'')
  if(!cents)return undefined
  const orderReference=value(lines.join('\n'),/^(?:bestell[- ]?(?:nr\.?|nummer)|order (?:id|number|reference))\s*:?\s*\n?\s*([a-z0-9][a-z0-9-]{3,39})\b/imu).toLowerCase()
  return {direction,orderReference,transaction:transaction.toUpperCase(),counterparty,description,cents,
    date:date(namedField(lines,/^(?:transaktionsdatum|zahlungsdatum|erstattungsdatum|datum|transaction date|payment date)\s*(?::\s*(.*))?$/iu))} as const
}
