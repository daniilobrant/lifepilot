import {scanProjectMails} from './project-mail.ts'
import { scanClothingOrders } from './clothing-orders.ts'
import { GmailRateLimit, type GmailPage, type GoogleConnector, type MailContent } from '../connectors/google.ts'
import type { Store } from './store.ts'
import { Problem } from './settings.ts'
import { classifyMail, inboxLabel, inboxLabelNames, type InboxLabel, type MailClassification } from '../../agents/lifepilot/tools/classify-mail.ts'
import { scanApplicationMails } from './applications.ts'
import { listInbox, clothingDemoMail, mailDemoFixtures, readGmailPage, scanInbox, scanTicketEvents, scanHfuCancellations } from './inbox.ts'
import { availability, type BusySpan, type FreeWindow } from './availability.ts'
import { berlinInstant } from '../../agents/lifepilot/tools/validate.ts'
import { dateInBerlin } from './values.ts'

export type RefreshResult = {
  checked: number, added: number, applications: number, labeled: number, limited: boolean, labelsAvailable: boolean,
  modelChecked: number, modelIncomplete: boolean, labelError: string | null, classified: MailClassification[],
}
import { financeFromMail, scanMailFinances } from './mail-finance.ts'
import { triageMails, triagedImportant } from './mail-triage.ts'

export const refreshPageLimit = 3
export type AttentionMail = MailClassification & { from: string, at: string | null, label:InboxLabel, preview?: string, forwardedBy?: string }

/** Zerlegt „"Name" <adresse>“ in Name und Adresse. Ist der Name nur die Adresse, bleibt er leer. */
export function parseSender(raw: string) {
  const address = /[\w.%+-]+@[\w.-]+\.[a-z]{2,}/iu.exec(raw)?.[0] ?? ''
  const name = raw.replace(/<[^>]*>/gu, ' ').replace(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/giu, ' ').replace(/["'“”]/gu, ' ').replace(/\s+/gu, ' ').trim()
  return { name: name.slice(0, 80), address }
}
export const senderLabel = (raw: string) => { const { name, address } = parseSender(raw); return name || address || raw.trim().slice(0, 80) }

/** Bei weitergeleiteten Mails: der ursprüngliche Absender aus der „Von:“-Zeile im Text. */
export function forwardedOriginal(mail: Pick<MailContent, 'subject' | 'text'>) {
  const forwarded = /^\s*(?:wg|fw|fwd)\s*:/iu.test(mail.subject) || /(?:weitergeleitete nachricht|forwarded message)/iu.test(mail.text.slice(0, 600))
  if (!forwarded) return undefined
  const line = mail.text.split(/\r?\n/u).slice(0, 30).find(entry => /^\s*(?:von|from|absender)\s*:\s*\S/iu.test(entry))
  const original = line?.replace(/^\s*(?:von|from|absender)\s*:\s*/iu, '')
  return original ? senderLabel(original) : undefined
}

/** Kurzer Textauszug für die aufgeklappte Mail: ohne Zitate, Kopfzeilen weitergeleiteter Mails und Links. */
export function mailPreview(text: string, limit = 320) {
  const clean = text.split(/\r?\n/u).map(line => line.trim())
    .filter(line => line && !line.startsWith('>') && !/^(?:von|from|gesendet|sent|an|to|cc|betreff|subject|datum|date)\s*:/iu.test(line) && !/^_{5,}$/u.test(line))
    .join(' ').replace(/\[[A-Za-z_ ]{3,30}\]/gu, '').replace(/https?:\/\/\S+/gu, '').replace(/\p{Cf}|\u034f/gu, '').replace(/\s+/gu, ' ').trim()
  return clean.length > limit ? clean.slice(0, limit - 1).trimEnd() + '…' : clean
}

function needsAttention(item:MailClassification,mail?:MailContent) {
  if (!mail) return item.category!=='newsletter' && item.category!=='spam' && item.category!=='jobs' && (item.important || Boolean(item.shipment))
  if(item.university)return item.important
  if (item.category==='newsletter' || item.category==='spam' || item.category==='jobs') return false
  const label=inboxLabel(mail,item)
  if (label==='newsletter' || label==='learning') return false
  if (financeFromMail(mail)) return true
  if (label==='finance') return !mail.mailingList && /zahlung|rechnung|kontoauszug|lastschrift|erstattung|transaktion|paypal|klarna/iu.test(item.subject+' '+mail.from)
  if (label==='orders'|| label==='shipping'||label==='returns') return Boolean(item.shipment || mail.clothing ||
    /versendet|zugestellt|ausgeliefert|abholbereit|verschickt|wurde geliefert|refund|rückzahlung|retoure/iu.test(item.subject))
  if (label==='leisure'||label==='university'||label==='travel') return item.important || !mail.mailingList &&
    /spieltag|training|termin|prüf|abgabe|anmeldung|verschoben|abgesagt|tickets? (?:für|zu)|bestätigt/iu.test(item.subject)
  return item.category==='applications' || item.important
}

/** Von dir geänderte Kategorien (Stift im Posteingang), je Konto und Mail. */
export function labelOverrides(store: Store, account: string) {
  const rows = store.db.prepare('SELECT message_id,label FROM mail_label_overrides WHERE account=?').all(account) as { message_id: string, label: string }[]
  return new Map(rows.filter(row => row.label in inboxLabelNames).map(row => [row.message_id, row.label as InboxLabel]))
}

/** scan=false liest nur (Anzeige); scan=true gleicht zusätzlich Bestellungen, Finanzen, Termine und Projekte ab. */
export async function readInboxFeed(google: GoogleConnector, synthetic: boolean, store?:Store, scan = true) {
  const relevant: AttentionMail[] = []
  const seen = new Set<string>()
  let account: string | undefined
  let incomplete = false
  let rateLimited = false
  const collect = (mails: MailContent[], account?: string) => {
    const modelImportant = store && account ? triagedImportant(store, mails, account) : new Set<string>()
    const overrides = store && account ? labelOverrides(store, account) : new Map<string, InboxLabel>()
    for (const mail of mails) {
      if (seen.has(mail.id)) continue
      seen.add(mail.id)
      const classified = modelImportant.has(mail.id) ? { ...classifyMail(mail), important: true, reasons: ['Vom Modell als wichtig eingestuft'] } : classifyMail(mail)
      if (modelImportant.has(mail.id) || needsAttention(classified,mail)) {
        const original = forwardedOriginal(mail)
        relevant.push({ ...classified, from: original ?? senderLabel(classified.university?.sender ?? mail.from), at:mail.at,label:overrides.get(mail.id) ?? inboxLabel(mail,classified),preview:mailPreview(mail.text),
          ...(original && { forwardedBy: senderLabel(mail.from) }) })
      }
    }
  }
  if (synthetic) {
    collect(mailDemoFixtures, 'fixture')
    if (store && scan) scanClothingOrders(store,clothingDemoMail,'fixture')
  }
  else {
    let cursor: GmailPage | undefined
    const afterEpoch = Math.floor(Date.now()/1000) - 7*86400
    const deadline = Date.now()+40_000
    const pageTokens = new Set<string>()
    do {
      const result = await google.recentInbox(key => key === account ? cursor : undefined, false, undefined, afterEpoch)
        .catch(error => {
          if (!(error instanceof GmailRateLimit)) throw error
          return null
        })
      if (!result) {
        rateLimited = incomplete = true
        break
      }
      if (account && result.account !== account) throw new Problem(409, 'Das Gmail-Konto hat sich geändert. Aktualisiere erneut.')
      account = result.account
      collect(result.mails, account)
      if (store && scan) {
        scanClothingOrders(store,result.mails,result.account)
        scanMailFinances(store,result.mails,result.account)
        scanTicketEvents(store,result.mails,result.account)
        scanHfuCancellations(store,result.mails,result.account)
        scanProjectMails(store,result.mails,result.account)
      }
      cursor = result.next ?? undefined
      if (cursor && (Date.now() >= deadline || pageTokens.has(cursor.pageToken))) {
        incomplete = true
        break
      }
      if (cursor) pageTokens.add(cursor.pageToken)
    } while (cursor)
  }
  return { account, incomplete, rateLimited, messages: relevant.sort((a,b) => Number(b.important) - Number(a.important) ||
    (b.at ?? '').localeCompare(a.at ?? '')) }
}

export async function refreshInbox(store: Store, google: GoogleConnector, synthetic: boolean, restart = false, deep = false): Promise<RefreshResult> {
  const result: RefreshResult = {
    checked: 0, added: 0, applications: 0, labeled: 0, limited: false, labelsAvailable: false, labelError: null, classified: [], modelChecked:0, modelIncomplete:false,
  }
  if (synthetic) {
    scanClothingOrders(store,clothingDemoMail,'fixture')
    const classified = mailDemoFixtures.map(mail=>({mail,item:classifyMail(mail)})).filter(({mail,item})=>needsAttention(item,mail)).map(({item})=>item)
    const matching = new Set(classified.map(item => item.id))
    const mails = mailDemoFixtures.filter(mail => matching.has(mail.id))
    return { ...result, ...scanInbox(store, mails), checked: mailDemoFixtures.length,
      applications: scanApplicationMails(store, mails, 'fixture', true), classified }
  }
  const status = google.status()
  result.labelsAvailable = status.some(item => item.service === 'gmail-sort' && item.connected)
  const modelBudget = AbortSignal.timeout(65_000)
  for (let page = 0; page < refreshPageLimit; page++) {
    const batch = await google.recentInbox(account => readGmailPage(store, account), restart && page === 0)
    scanClothingOrders(store,batch.mails,batch.account)
    scanMailFinances(store,batch.mails,batch.account)
    result.added+=scanTicketEvents(store,batch.mails,batch.account)+scanHfuCancellations(store,batch.mails,batch.account)+scanProjectMails(store,batch.mails,batch.account)
    // Unklare Mails prüft das Modell einmalig; wichtige erscheinen unter „Wichtige Nachrichten“.
    try {
      const review = await triageMails(store,batch.mails,batch.account,modelBudget,undefined,deep?1800:700)
      result.added += review.proposals
      result.modelChecked += review.checked
      result.modelIncomplete ||= review.failed
    } catch { result.modelIncomplete = true }
    const modelImportant = triagedImportant(store,batch.mails,batch.account)
    const classified = batch.mails.map(mail=>({mail,item:modelImportant.has(mail.id)?{...classifyMail(mail),important:true,reasons:['Vom Modell als wichtig eingestuft']}:classifyMail(mail)}))
      .filter(({mail,item})=>modelImportant.has(mail.id)||needsAttention(item,mail)).map(({item})=>item)
    const matching = new Set(classified.map(item => item.id))
    const relevant = batch.mails.filter(mail => matching.has(mail.id))
    result.applications += scanApplicationMails(store, relevant, batch.account, true)
    result.classified.push(...classified)
    if (result.labelsAvailable) {
      try { result.labeled += await google.sortInboxPage(batch.account, batch.mails) }
      catch (error) {
        result.labelError = error instanceof Error ? error.message : 'Gmail konnte die Labels nicht bestätigen.'
      }
    }
    // Preserve this page on a failed write so a later click can safely retry its additive labels.
    const delta = scanInbox(store, relevant, result.labelError ? undefined : batch)
    result.checked += batch.mails.length
    result.added += delta.added
    result.limited = Boolean(batch.next) || Boolean(result.labelError)
    if (!result.limited || result.labelError) break
  }
  return result
}

export type InboxPlan = FreeWindow & { id: string }
export function inboxPlans(store: Store, busy: BusySpan[] = [], now = Date.now()): InboxPlan[] {
  const day = dateInBerlin(new Date(now))
  const candidates = listInbox(store).filter(item => item.state === 'pending' && item.due_date && item.due_date >= day && item.category !== 'appointments')
  if (!candidates.length) return []
  const free = availability(store.workspace, { date: day, days: 7, minutes: 30, start: '09:00', end: '19:00' }, now, busy)
  const windows = [...free.windows]
  return candidates.flatMap(item => {
    const index = windows.findIndex(window => window.day <= item.due_date! && !free.datesWithUntimedAppointments.includes(window.day))
    if (index < 0) return []
    return [{ ...windows.splice(index, 1)[0], id: item.id }]
  })
}


export async function planRefreshedInbox(store: Store, google: GoogleConnector, synthetic: boolean) {
  const local = !synthetic && !google.status().some(item => item.service === 'calendar' && item.connected)
  if (local) return { plans: [], calendar: 'unconnected' as const }
  try {
    const data = synthetic ? { events: [], limited: false } : await google.calendar(8)
    if (data.limited) return { plans: [], calendar: 'incomplete' as const }
    const busy = data.events.map(event => ({
      at: event.allDay ? berlinInstant(event.start + 'T00:00') : new Date(event.start).toISOString(),
      endsAt: event.allDay ? berlinInstant(event.end + 'T00:00') : new Date(event.end).toISOString(),
    }))
    return { plans: inboxPlans(store, busy), calendar: synthetic ? 'synthetic' as const : 'primary' as const }
  } catch {
    return { plans: [], calendar: 'unavailable' as const }
  }
}

export type InboxRefresh = RefreshResult & Awaited<ReturnType<typeof planRefreshedInbox>>
