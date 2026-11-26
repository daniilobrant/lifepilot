import {dateInBerlin,isDate} from './values.ts'

const monthNames=['januar','februar','märz','april','mai','juni','juli','august','september','oktober','november','dezember']
function documentaryDate(line:string){
  const numeric=/\b(20\d\d-\d\d-\d\d)|(\d{1,2})\.(\d{1,2})\.(20\d\d)\b/u.exec(line)
  const written=/\b(\d{1,2})\.?\s+(\p{L}+)\s+(20\d\d)\b/iu.exec(line)
  const month=written?monthNames.indexOf(written[2].toLowerCase())+1:0
  const proposed=numeric?.[1]??(numeric?.[4]?[numeric[4],numeric[3].padStart(2,'0'),numeric[2].padStart(2,'0')].join('-'):
    written&&month?[written[3],String(month).padStart(2,'0'),written[1].padStart(2,'0')].join('-'):'')
  return isDate(proposed)?proposed:undefined
}

type BillingMail={from:string,subject:string,text:string,at:string|null}
export const amazonOrderSubject=/^(?:bestellt|ordered)\s*[:：]|bestellbestätigung|order confirmation/iu
export const amazonSender=(from:string)=>/@(?:[a-z0-9-]+\.)*amazon\.(?:de|com|co\.uk|fr|es|it|nl)>?\s*$/iu.test(from)
const appleSender=(from:string)=>/@(?:[a-z0-9-]+\.)*apple\.com>?\s*$/iu.test(from)
const usefulLines=(text:string)=>text.replace(/\p{Cf}|\u034f/gu,'').split(/\r?\n/u).map(line=>line.trim()).filter(line=>line&&!/^[>]/u.test(line))
function cents(line:string){
  const match=/(?:^|\s)(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:€|EUR\b)/iu.exec(line)
  const amount=match?Math.round(Number(match[1].replace(',','.'))*100):0
  return amount>0&&amount<10_000_000?amount:0
}
function uniqueAmount(values:number[]){
  const amounts=[...new Set(values.filter(Boolean))]
  return amounts.length===1?amounts[0]:0
}

export function readAmazonOrder(mail:BillingMail){
  if(!amazonSender(mail.from)||!amazonOrderSubject.test(mail.subject)||/werbung|rabatt|spar[et]|storniert|cancelled/iu.test(mail.subject))return
  const lines=usefulLines(mail.text)
  const reference=/\b(?:bestell[- ]?(?:nr\.?|nummer)|order (?:number|id))\s*[:#]?\s*(\d{3}-\d{7}-\d{7})\b/iu.exec(lines.join('\n'))?.[1]
  const total=uniqueAmount(lines.flatMap((line,index)=>/^(?:bestellsumme|summe|gesamt(?:betrag|summe)?|order total|grand total)(?:\s*[:：]|\s*$|\s+(?=[€\d]))/iu.test(line)?[cents(line)||cents(lines[index+1]??'')]:[]))
  if(!reference||!total||!mail.at||!Number.isFinite(Date.parse(mail.at)))return
  const snippet=mail.subject.replace(/^(?:bestellt|ordered)\s*[:：]\s*/iu,'').trim()
  const title=('Amazon · '+(snippet===mail.subject?'Bestellung '+reference:snippet)).slice(0,120)
  return {reference,cents:total,title,date:dateInBerlin(new Date(mail.at))}
}

export type RecurringCharge={key:string,title:string,cents:number,date:string,cycle:'monthly'|'yearly',renewal?:string,confirmed:boolean}
export function readRecurringCharge(mail:BillingMail):RecurringCharge|undefined{
  if(!/rechnung|beleg|invoice|receipt|zahlung|payment|abo[- ]?verlängerung|subscription renewal/iu.test(mail.subject)||
    /fehlgeschlagen|ausstehend|storniert|erstatte|mahnung|kündigung|failed|pending|cancelled|refund/iu.test(mail.subject))return
  const lines=usefulLines(mail.text)
  const apple=appleSender(mail.from)
  // App-Store-Belege nennen den Tarif ohne „Abo“ („Claude Pro - Monthly (Monatlich)“); das Wort steht in der Zeile davor.
  const plan=lines.find((line,index)=>/\b(?:monatlich|jährlich|monthly|yearly|annually|pro monat|pro jahr)\b/iu.test(line)&&line.length<=120&&
    (/\b(?:abo|abonnement|mitgliedschaft|tarif|plan|subscription|membership)\b|icloud\+/iu.test(line)||
      apple&&/\b(?:abo|plan|subscription|mitgliedschaft)\b|icloud/iu.test(lines[index-1]??'')))
  if(!plan)return
  const cloud=apple&&/icloud\+/iu.test(plan)
  const paid=lines.findIndex(line=>/^(?:visa|mastercard|amex|american express|paypal|lastschrift|apple (?:pay|account-guthaben))\b/iu.test(line))
  const explicitPaid=lines.some(line=>/^(?:zahlung (?:erfolgreich|bestätigt)|bezahlt|erfolgreich abgebucht|payment received|payment successful|paid)\b/iu.test(line))
  const paymentTotal=paid>=0?(cents(lines[paid])||cents(lines[paid+1]??'')):0
  const total=uniqueAmount(lines.flatMap((line,index)=>/^(?:bestellsumme|gesamtsumme|gesamtbetrag|rechnungsbetrag|zahlungsbetrag|order total|total paid)(?:\s*[:：]|\s*$|\s+(?=[€\d]))/iu.test(line)?[cents(line)||cents(lines[index+1]??'')]:[]))
  const planIndex=lines.indexOf(plan)
  const planAmount=cents(plan)||cents(lines[planIndex+1]??'')||(/^verlänger|^renew/iu.test(lines[planIndex+1]??'')?cents(lines[planIndex+2]??''):0)
  if(!(paymentTotal||explicitPaid&&total)||cloud&&planAmount!==paymentTotal)return
  const amount=cloud?planAmount:total||paymentTotal
  const dated=lines.findIndex(line=>/^(?:rechnung|rechnungsdatum|zahlungsdatum|invoice date|payment date)(?:$|\s*[:：])/iu.test(line))
  const date=dated>=0?(documentaryDate(lines[dated])??documentaryDate(lines[dated+1]??'')):undefined
  const paidDate=date??(mail.at&&Number.isFinite(Date.parse(mail.at))?dateInBerlin(new Date(mail.at)):undefined)
  const title=plan.replace(/^(?:abo|abonnement|tarif|plan|subscription|mitgliedschaft)\s*:\s*/iu,'')
    .replace(/\s*\(?(?:monatlich|jährlich|monthly|yearly|annually|pro Monat|pro Jahr)\)?\s*$/iu,'')
    .replace(/\s+-\s+(?:monthly|yearly|annual|monatlich|jährlich)$/iu,'').trim().slice(0,120)
  const domain=/@([a-z0-9.-]+\.[a-z]{2,})>?\s*$/iu.exec(mail.from)?.[1]?.toLowerCase()
  if(!paidDate||!domain||!title||!amount)return
  const renewal=lines.filter(line=>/^(?:verlängerung|verlängert|nächste (?:abbuchung|zahlung)|next (?:billing|payment|renewal)|renews)/iu.test(line)).map(documentaryDate).find(Boolean)
  const cycle=/jährlich|yearly|annually|pro jahr/iu.test(plan)?'yearly':'monthly'
  const key=cloud?'apple.com:icloud+':domain+':'+title.toLowerCase()
  return {key,title,cents:amount,date:paidDate,renewal,cycle,confirmed:true}
}
