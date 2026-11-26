import {scanProjectMails} from './project-mail.ts'
import { scanClothingOrders } from './clothing-orders.ts'
import type { GmailPage, GoogleConnector, MailContent } from '../connectors/google.ts'
import type { Store } from './store.ts'
import { Problem } from './settings.ts'
import { classifyMail, inboxLabel, type InboxLabel, type MailClassification } from '../../agents/lifepilot/tools/classify-mail.ts'
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
export type AttentionMail = MailClassification & { from: string, at: string | null, label:InboxLabel }

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

export async function readInboxFeed(google: GoogleConnector, synthetic: boolean, store?:Store) {
  const relevant: AttentionMail[] = []
  const seen = new Set<string>()
  let account: string | undefined
  const collect = (mails: MailContent[], account?: string) => {
    const modelImportant = store && account ? triagedImportant(store, mails, account) : new Set<string>()
    for (const mail of mails) {
      if (seen.has(mail.id)) continue
      seen.add(mail.id)
      const classified = modelImportant.has(mail.id) ? { ...classifyMail(mail), important: true, reasons: ['Vom Modell als wichtig eingestuft'] } : classifyMail(mail)
      if (modelImportant.has(mail.id) || needsAttention(classified,mail)) relevant.push({ ...classified, from:classified.university?.sender??mail.from, at:mail.at,label:inboxLabel(mail,classified) })
    }
  }
  if (synthetic) {
    collect(mailDemoFixtures)
    if (store) scanClothingOrders(store,clothingDemoMail,'fixture')
  }
  else {
    let cursor: GmailPage | undefined
    for (let i=0; i<refreshPageLimit; i++) {
      const result = await google.recentInbox(key => key === account ? cursor : undefined)
      if (account && result.account !== account) throw new Problem(409, 'Das Gmail-Konto hat sich geändert. Aktualisiere erneut.')
      account = result.account
      collect(result.mails, account)
      if (store) {
        scanClothingOrders(store,result.mails,result.account)
        scanMailFinances(store,result.mails,result.account)
        scanTicketEvents(store,result.mails,result.account)
        scanHfuCancellations(store,result.mails,result.account)
        scanProjectMails(store,result.mails,result.account)
      }
      if (!result.next || relevant.length >= 10) break
      cursor = result.next
      account = result.account
    }
  }
  return { account, messages: relevant.sort((a,b) => Number(b.important) - Number(a.important) ||
    (b.at ?? '').localeCompare(a.at ?? '')).slice(0,10) }
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
