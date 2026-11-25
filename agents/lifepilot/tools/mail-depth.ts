import {isHfuAddress} from './university-mail.ts'
import {classifyMail} from './classify-mail.ts'

const excluded=/newsletter|wochenangebote|stellenanzeige|job.?alert|produkte bewerten|bitte bewert|erwartungen erfüllt|(?:datenschutz|privacy policy).{0,30}(?:aktualisiert|update)|\b(?:black friday|cyber monday)\b/iu
const records=/(?:^|\b)(?:bestellt|ordered|versendet|shipped|zugestellt|deine bestellung|bestellbestätigung|bestellnummer|rechnung|beleg|quittung|zahlung|projektupdate|projektbesprechung|projektplan|feedback|gliederung|meilenstein|checkpoint|terminänderung|abbuchung|lastschrift|erstattung|rückerstattung|gutschrift\w*|gutgeschrieben|rückzahlung|quittung|zahlungsbestätigung|zahlung erfolgreich|payment accepted|payment confirmation|retoure|rücksendung|angebot gültig bis|payout|receipt|invoice|payment|refund|direct debit|buchung|booking|tickets?|veranstaltungsbestätigung|einladung|spieltag|training|frist|klausur|prüfung|vorstellungsgespräch|bewerbung|vertrag|kündigung|verlängerung|abo|abonnement|subscription)\b/iu
const trustedSender=/(?:bestellbestaetigung|versandbestaetigung|payments?(?:-[a-z]+)?|billing|invoices?|receipts?|abrechnung|buchhaltung|ticketing)@|@(?:[a-z0-9-]+\.)*paypal\.(?:de|com)>?\s*$/iu
const paidPreview=/(?:gesamtbetrag|zahlungsbetrag|abbuchung|erstattung (?:von|über)|gutschrift|gutgeschrieben|zurückgezahlt|rückzahlung|bestellnummer|kündigungsfrist|vorstellungsgespräch|zahlung erhalten|payment received|billing period)/iu
export function needsMailBody(mail:Parameters<typeof classifyMail>[0]&{originalRecipients?:string}){
  if(isHfuAddress(mail.from)||isHfuAddress(mail.originalRecipients??'')||isHfuAddress(mail.text))return true
  const item=classifyMail(mail)
  if(item.category==='spam'||item.category==='jobs'||excluded.test(mail.subject))return false
  if(records.test(mail.subject)&&(!mail.mailingList||trustedSender.test(mail.from)||paidPreview.test(mail.text)))return true
  if(item.category==='newsletter'||mail.mailingList)return false
  return item.important||Boolean(item.shipment)||paidPreview.test(mail.text)||trustedSender.test(mail.from)
}
