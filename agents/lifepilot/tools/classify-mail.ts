import {hfuMail,type HfuMail} from './university-mail.ts'
import {amazonOrderSubject,amazonSender} from '../../../hub/runtime/purchase-mail.ts'
import {readTicketEvent} from '../../../hub/runtime/event-mail.ts'
export const mailCategoryNames = {
  newsletter: 'Newsletter', spam: 'Spamverdacht', orders: 'Bestellungen',
  volleyball: 'Volleyball', applications: 'Bewerbungen', jobs: 'Jobs', university: 'Uni', work: 'Arbeit',
} as const
export type MailClassificationCategory = keyof typeof mailCategoryNames
export type MailClassification = {
  id: string, subject: string, category: MailClassificationCategory | null,
  important: boolean, reply: boolean, reasons: string[],
  university?: Pick<HfuMail,'sender'|'kind'|'reply'|'replyRequired'>,
  shipment?: 'order' | 'return-open' | 'return-in-transit' | 'return-closed' | 'return-unknown',
}

const topics = [
  ['orders', /bestell(?:ung|bestätigung|nummer)|^bestellt:|^ordered:|versandbestätigung|sendungsverfolgung|retoure|rücksendung|lieferung/iu],
  ['volleyball', /volleyball|spieltag|ligaspiel|abschlagtraining|hallentraining/iu],
  ['applications', /bewerbung|vorstellungsgespräch|job offer|application (?:received|update|status)|your application.{0,65}(?:sent|received|submitted)|interview invitation/iu],
  ['jobs', /jobangebot|stellenanzeige|karriereportal|bewerbungsportal/iu],
  ['university', /\buni\b|universität|hochschule|klausur|seminar|bachelorarbeit|vorlesung|prüfungsamt|studiengang/iu],
  ['work', /kundentermin|arbeitsvertrag|dienstplan|schichtplan|projektstatus|personalabteilung|gehaltsabrechnung/iu],
] as const
const bulk = /newsletter|wochenangebote|exklusive angebote|(?:vom|diesen) verteiler abmelden/iu
const saleSubject = /black[ -]friday|black[ -]days|cyber[ -]monday|sonderangebote|rabatt(?:e|aktion)?|(?:extra|bis zu)\s+-?\d+\s*%|\bsale\b|\bdeals\b/iu
const transactionSubject = /^bestellt:|^ordered:|bestellbestätigung|bestellnummer|versandbestätigung|sendungsverfolgung|(?:deine|ihre) (?:bestellung|retoure|rücksendung|sendung)|(?:dein|ihr) paket|retoure ist|order confirmation|shipped your order/iu
const applicationUpdate = /bewerbung.{0,65}(?:erhalten|eingegangen|rückmeldung|status)|(?:danke|dank|rückmeldung|absage|zusage).{0,55}bewerbung|vorstellungsgespräch|application (?:received|update|status)|your application.{0,65}(?:sent|received|submitted)|interview invitation|job offer/iu
const risky = /passwort.{0,30}(?:bestätigen|eingeben)|zahlungsdaten.{0,30}(?:aktualisieren|eingeben)|sie haben gewonnen|krypto.{0,30}garantiert/iu
const deadline = /(?:abgabe|frist|fällig|rücksendung|retoure|spätestens|zahlung).{0,85}(?:bis|am|spätestens)\s+(?:\d|morgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)|\b(?:abgabefrist|rückgabefrist|zahlungsfrist)\b.{0,40}\d/iu
const asks = /(?:kannst du|können sie|könntest du|würdest du|würden sie|passt dir|passt ihnen)[^?\n]{1,125}\?|bitte (?:antworte|antworten|bestätige|bestätigen|melde dich|melden sie sich)|(?:bitte um|brauch(?:e|en))\s+(?:eine |deine |ihre )?rückmeldung/iu
const changes = /(?:abgesagt|verschoben|abholbereit|vorstellungsgespräch|prüfungstermin|mahnung|zahlungserinnerung)/iu

export function classifyMail(mail: { id: string, subject: string, from: string, text: string, mailingList?: boolean, at?:string|null, originalRecipients?:string, replyToMessage?:boolean, previewOnly?:boolean }): MailClassification {
  const subject = mail.subject.replace(/\s+/gu, ' ').trim().slice(0, 180)
  const text = mail.text.split(/\r?\n/u).filter(line => !line.trimStart().startsWith('>')).slice(0, 50).join('\n').slice(0, 5000)
  const topic = topics.find(([, words]) => words.test(subject)) ?? topics.find(([, words]) => words.test(mail.from + '\n' + text))
  const isRisky = risky.test(subject + '\n' + text)
  const transactional = transactionSubject.test(subject) || (topic?.[0] === 'applications' && applicationUpdate.test(subject))
  const isBulk = !transactional && (bulk.test(subject) || saleSubject.test(subject) || (mail.mailingList && (topic?.[0] !== 'applications' || !applicationUpdate.test(subject + '\n' + text))))
  const jobAlert=/job.?alert|jobangebot|stellenanzeige|passende jobs|(?:neue|verfügbare) einsätze|(?:neue|passende) stellen|people are hiring/iu.test(subject) ||
    /@(?:[a-z0-9.-]+\.)?(?:instaff\.jobs|indeed\.com|linkedin\.com)\b/iu.test(mail.from) && !applicationUpdate.test(subject)
  const university=hfuMail(mail)
  if(university&&!isRisky){
    const {sender,kind,reply,replyRequired}=university
    const reasons=[...(kind==='cancellation'?['Vorlesung fällt aus']:kind==='lecture'?['Nachricht zur Lehrveranstaltung']:[]),
      ...(replyRequired?['Rückmeldung erbeten']:reply?['Antwort auf frühere Nachricht']:[])]
    return {id:mail.id,subject:university.subject.slice(0,180),category:'university',important:university.important,
      reply:replyRequired,reasons,university:{sender,kind,reply,replyRequired}}
  }
  const category = isRisky ? 'spam' : jobAlert ? 'jobs' : isBulk ? 'newsletter' : topic?.[0] ?? (mail.mailingList ? 'newsletter' : null)
  const actionable = category !== 'spam' && category !== 'newsletter'
  const ownDeadline = actionable && deadline.test(subject + '\n' + text)
  const reply = actionable && !/\b(?:no[.-]?reply|do[.-]?not[.-]?reply)\b/iu.test(mail.from) && asks.test(text)
  const changed = actionable && category !== null && changes.test(subject + '\n' + text)
  const hiring = actionable && category === 'applications' && applicationUpdate.test(subject + '\n' + text)
  const reasons = [
    ...(hiring ? ['Rückmeldung zu einer Bewerbung'] : []),
    ...(isRisky ? ['Auffällige Zahlungs- oder Passwortaufforderung'] : []),
    ...(ownDeadline ? ['Ausdrücklicher Fristenhinweis'] : []),
    ...(reply ? ['Bitte um Antwort oder Bestätigung'] : []),
    ...(changed ? ['Terminänderung oder konkreter Handlungsbedarf'] : []),
  ]
  const transactionText = subject + '\n' + text
  let shipment: MailClassification['shipment']
  if (category === 'orders') {
    if (!/retoure|rücksendung|rückgabe/iu.test(transactionText)) {
      if (transactionSubject.test(subject)) shipment = 'order'
    }
    else if (/retoure|rücksendung|rückgabe/iu.test(subject) && /angekommen|eingegangen|erhalten|erstattet|abgeschlossen|gutgeschrieben/iu.test(subject)) shipment = 'return-closed'
    else if (/rücksendung|retoure/iu.test(subject) && /unterwegs|versandt|abgegeben|eingeliefert/iu.test(subject)) shipment = 'return-in-transit'
    else if (ownDeadline || /bitte.{0,65}(?:zurücksenden|zurückschicken|abgeben)|rücksendeetikett/iu.test(transactionText)) shipment = 'return-open'
    else if (/retoure|rücksendung|rückgabe/iu.test(subject)) shipment = 'return-unknown'
  }
  return { id: mail.id, subject, category, shipment, important: ownDeadline || reply || changed || hiring, reply, reasons }
}

export function automaticLabelCategory(mail: Parameters<typeof classifyMail>[0]) {
  const { category, subject, important } = classifyMail(mail)
  if (category === 'newsletter' || category === 'spam') return category
  if (category === 'orders') return transactionSubject.test(subject) ? category : null
  if (category === 'applications') return applicationUpdate.test(subject) || important ? category : null
  return topics.some(([name, words]) => name === category && words.test(subject)) ? category : null
}

export const inboxLabelNames = {
  newsletter:'Newsletter & Angebote', careers:'Bewerbungen, Jobs & Einsätze', finance:'Finanzen & Belege',
  travel:'Reisen & Tickets', learning:'Lernen & Weiterbildung', orders:'Einkäufe/Bestellungen',
  shipping:'Einkäufe/Versand', returns:'Einkäufe/Retouren', accounts:'Apps, Konten & Sicherheit',
  personal:'Persönliche Korrespondenz', leisure:'Freizeit, Sport & Veranstaltungen',
  housing:'Wohnen, Abos & Verträge', university:'Uni', work:'Arbeit', review:'Zu prüfen',
} as const
export type InboxLabel = keyof typeof inboxLabelNames

export function inboxLabel(mail:Parameters<typeof classifyMail>[0], classification=classifyMail(mail)):InboxLabel {
  const subject=classification.subject
  const domain=/@([a-z0-9.-]+\.[a-z]{2,})>?\s*$/iu.exec(mail.from)?.[1]?.toLowerCase() ?? ''
  const from=(suffix:string)=>domain===suffix||domain.endsWith('.'+suffix)
  if (classification.category==='spam') return 'review'
  if(classification.university)return 'university'
  if (readTicketEvent(mail)) return 'leisure'
  if(amazonSender(mail.from)&&amazonOrderSubject.test(subject))return 'orders'
  if (classification.category==='jobs'||classification.category==='applications') return 'careers'
  if (classification.category==='newsletter' || ['seekingalpha.com','news.traderepublic.com','news.foto.dm.de'].some(from)) return 'newsletter'
  if (/gutschrift|gutgeschrieben/iu.test(subject)) return 'finance'
  if (/retoure|rücksendung|rückgabe|rückzahlung|rückerstattung|\brefund\b|return label/iu.test(subject)) return 'returns'
  if (/versandbestätigung|sendungsverfolgung|dein paket|ihr paket|abholbereit|zugestellt|ausgeliefert|wurde (?:geliefert|versendet|verschickt)|kommt bald an|\bshipped\b|delivery update/iu.test(subject) ||
      ['dhl.de','hermesworld.com','dpd.de'].some(from)) return 'shipping'
  if (/bestellbestätigung|bestellnummer|deine bestellung|order confirmation|thanks for your order/iu.test(subject)) return 'orders'
  if (['paypal.de','paypal.com','klarna.com','stripe.com'].some(from) ||
      /rechnung|zahlungsbestätigung|zahlungsbeleg|\bbeleg\b|quittung|zahlung gesendet|zahlung erhalten|zahlung erfolgreich|lastschrift|kontoauszug|deine fahrt mit|scooter-fahrt|eats bestellung|online frankierung|\binvoice\b|\breceipt\b/iu.test(subject)) return 'finance'
  if (classification.category==='university' || ['hs-esslingen.de','uni-stuttgart.de'].some(from)) return 'university'
  if (classification.category==='work') return 'work'
  if (classification.category==='volleyball' || /sportveranstaltung|spieltag|veranstaltung|ticket für|event bestätigung/iu.test(subject) ||
      ['eventbrite.com','schneebeben.de','rumbalist.com'].some(from)) return 'leisure'
  if (/buchungsbestätigung|boarding pass|reiseunterlagen|flugtickets?|check[ -]in|fahrkarte/iu.test(subject) ||
      ['skyscanner.com','airbnb.com','booking.com','ryanair.com','ryanairemail.com'].some(from)) return 'travel'
  if (['duolingo.com','speexx.com','santanderopenacademy.com','mastermessen.de'].some(from)) return 'learning'
  if (/abonnement|subscription|vertragsänderung|kündigungsbestätigung|mietvertrag/iu.test(subject) ||
      ['immobilienscout24.de','roomies.com'].some(from)) return 'housing'
  if (/sicherheitswarnung|neue anmeldung|bestätigungscode|verification code|passwort zurücksetzen|security alert/iu.test(subject) ||
      ['supabase.com','groq.com','ollama.com','elicit.com','stackfield.help','google.com','apple.com'].some(from)) return 'accounts'
  if (!mail.mailingList && /^(?:re|aw|sv|fw|fwd|wg):/iu.test(subject)) return 'personal'
  return 'review'
}
