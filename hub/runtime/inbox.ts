import {hfuMail} from '../../agents/lifepilot/tools/university-mail.ts'
import type {LectureTarget} from './university-calendar.ts'
import { parseClothingMail } from './clothing-mail.ts'
import { createHash, randomUUID } from 'node:crypto'
import type { GmailPage, MailContent } from '../connectors/google.ts'
import { Problem } from './settings.ts'
import type { Channel, Store } from './store.ts'
import { classifyMail } from '../../agents/lifepilot/tools/classify-mail.ts'
import type { FreeWindow } from './availability.ts'
import { dateInBerlin, isDate, shiftDay } from './values.ts'
import { berlinInstant } from '../../agents/lifepilot/tools/validate.ts'
import { eventIdentity, readTicketEvent, type TicketEvent } from './event-mail.ts'

const topics = [
  ['returns', /retoure|rücksend|rückgabefrist|zurücksenden|return by/iu, 'Rücksendung prüfen'],
  ['deadlines', /abgabe|deadline|einreich|zahlungsziel|fällig|frist/iu, 'Frist prüfen'],
  ['appointments', /einladung|besprechung|terminbestätigung|termin findet/iu, 'Termin prüfen'],
  ['orders', /bestellbestätigung|sendungsverfolgung|versandbestätigung|abholbereit/iu, 'Bestellung prüfen'],
] as const

export type InboxProposal = {
  id: string, subject: string, evidence: string, due_date: string | null, category: typeof topics[number][0],
  state: 'pending' | 'accepted' | 'denied', task_id: string | null, event?: TicketEvent,
  lectureCancellation?: {course:string,date:string|null,time:string|null,sender:string,approvedTarget?:LectureTarget,target?:LectureTarget,reason?:string},
}

const explicitDate = /(?:bis|spätestens am|fällig am|deadline:)\s+(\d{4}-\d{2}-\d{2}|(\d{1,2})\.(\d{1,2})\.(\d{4}))(?!\d)/giu

export function inboxSuggestion(mail: MailContent) {
  const subject = mail.subject.replace(/\s+/gu, ' ').trim().slice(0, 100)
  const topic = topics.find(([, words]) => words.test(subject)) ?? topics.find(([, words]) => words.test(mail.text))
  if (!subject || !topic) return
  const lines = mail.text.split(/\r?\n/u).map(line => line.trim()).filter(line => line && !line.startsWith('>'))
  const evidence = lines.find(line => topic[1].test(line) && [...line.matchAll(explicitDate)].length > 0) ??
    lines.find(line => topic[1].test(line)) ?? subject
  const dates = new Set([...evidence.matchAll(explicitDate)].map(match => match[4]
    ? match[4] + '-' + match[3].padStart(2, '0') + '-' + match[2].padStart(2, '0') : match[1]).filter(isDate))
  return { subject, category: topic[0], evidence: evidence.slice(0, 280), date: dates.size === 1 ? [...dates][0] : null }
}

export function readGmailPage(store: Store, account: string) {
  return store.db.prepare('SELECT page_token AS pageToken, after_epoch AS afterEpoch FROM gmail_pages WHERE account_key=? AND saved_at>?')
    .get(account, Date.now() - 86400_000) as GmailPage | undefined
}

export function scanInbox(store: Store, mails: MailContent[], gmail?: { account: string, next: GmailPage | null }) {
  const insert = store.db.prepare(`INSERT OR IGNORE INTO inbox_proposals
    (id,source_key,subject,category,evidence,due_date,created_at) VALUES (?,?,?,?,?,?,?)`)
  return store.transaction(() => {
    let added = 0
    for (const mail of mails) {
      if (hfuMail(mail)?.kind==='cancellation' || readTicketEvent(mail) || mail.clothing || parseClothingMail(mail) || !recordableMail(mail)) continue
      const proposal = inboxSuggestion(mail)
      if (!proposal) continue
      const sourceKey = createHash('sha256').update(JSON.stringify([mail.id, mail.subject, mail.from, mail.at])).digest('hex')
      added += Number(insert.run(randomUUID(), sourceKey, proposal.subject, proposal.category,
        proposal.evidence, proposal.date, new Date().toISOString()).changes)
    }
    if (gmail?.next) store.db.prepare('INSERT OR REPLACE INTO gmail_pages VALUES (?,?,?,?)')
      .run(gmail.account, gmail.next.pageToken, gmail.next.afterEpoch, Date.now())
    else if (gmail) store.db.prepare('DELETE FROM gmail_pages WHERE account_key=?').run(gmail.account)
    return { checked: mails.length, added }
  })
}

export function scanTicketEvents(store:Store,mails:MailContent[],account:string,today=dateInBerlin()){
  const insert=store.db.prepare(`INSERT OR IGNORE INTO inbox_proposals
    (id,source_key,subject,category,evidence,due_date,created_at) VALUES (?,?,?,'appointments',?,?,?)`)
  let added=0
  for(const mail of mails){
    const event=readTicketEvent(mail)
    if(!event||event.date<today)continue
    const source=createHash('sha256').update(JSON.stringify(['ticket-event',account,event.date,event.time,eventIdentity(event.title)])).digest('hex')
    added+=Number(insert.run(randomUUID(),source,event.title,JSON.stringify(event),event.date,new Date().toISOString()).changes)
  }
  return added
}

export function scanHfuCancellations(store:Store,mails:MailContent[],account:string,today=dateInBerlin()){
  const insert=store.db.prepare(`INSERT OR IGNORE INTO inbox_proposals
    (id,source_key,subject,category,evidence,due_date,created_at) VALUES (?,?,?,'appointments',?,?,?)`)
  let added=0
  for(const mail of mails){
    const university=hfuMail(mail)
    const event=university?.cancellation
    if(!event||classifyMail(mail).category==='spam'||event.date&&event.date<today)continue
    const source=createHash('sha256').update(JSON.stringify(['hfu-cancellation',account,event.date&&event.course?
      [event.course,event.date,event.time??'']:[mail.id]])).digest('hex')
    const lectureCancellation={course:event.course,date:event.date??null,time:event.time??null,sender:university.sender}
    added+=Number(insert.run(randomUUID(),source,university.subject.slice(0,120),JSON.stringify({lectureCancellation}),event.date??null,new Date().toISOString()).changes)
  }
  return added
}

function decodeInboxEvent(row:InboxProposal):InboxProposal{
  if(row.category==='appointments'&&row.evidence.startsWith('{"lectureCancellation":')){
    const {lectureCancellation}=JSON.parse(row.evidence) as {lectureCancellation:NonNullable<InboxProposal['lectureCancellation']>}
    return {...row,lectureCancellation,evidence:'Absender: '+lectureCancellation.sender}
  }
  if(row.category!=='appointments'||!row.evidence.startsWith('{"title":'))return row
  try{
    const event=JSON.parse(row.evidence) as TicketEvent
    if(!isDate(event.date)||!/^\d{2}:\d{2}$/u.test(event.time)||typeof event.title!=='string')return row
    const evidence=['Beginn '+event.time+' Uhr',event.doors?'Einlass '+event.doors+' Uhr':'',event.venue,
      event.end?'Ende '+event.end+' Uhr':'Kalenderdauer ohne Endzeit: 1 Stunde'].filter(Boolean).join(' · ')
    return {...row,event,evidence}
  }catch{return row}
}

export function listInbox(store: Store) {
  return (store.db.prepare(`SELECT id, subject, evidence, category, due_date, state, task_id
    FROM inbox_proposals ORDER BY (state='pending') DESC, created_at DESC, id LIMIT 100`).all() as unknown as InboxProposal[]).map(decodeInboxEvent)
}

export function inboxProposal(store:Store,id:string){
  const row=store.db.prepare('SELECT * FROM inbox_proposals WHERE id=?').get(id) as InboxProposal|undefined
  return row&&decodeInboxEvent(row)
}

export function decideInbox(store: Store, id: string, decision: 'accept' | 'deny', via: Channel, slot?: FreeWindow) {
  return store.transaction(() => {
    const row = store.db.prepare('SELECT * FROM inbox_proposals WHERE id=?').get(id) as InboxProposal | undefined
    if (!row) throw new Problem(404, 'Der Mailvorschlag ist nicht vorhanden.')
    if (row.state !== 'pending') throw new Problem(409, 'Über diesen Vorschlag wurde bereits entschieden.')
    const state = decision === 'accept' ? 'accepted' : 'denied'
    const title = topics.find(([category]) => category === row.category)![2] + ' · ' + row.subject
    const decoded=decodeInboxEvent(row)
    if(decision==='accept'&&decoded.event){
      const event=decoded.event
      const start=berlinInstant(event.date+'T'+event.time)
      const statedEnd=event.end&&event.end!==event.time?berlinInstant((event.end<event.time?shiftDay(event.date,1):event.date)+'T'+event.end):undefined
      const end=statedEnd??new Date(Date.parse(start)+3600_000).toISOString()
      const existing=store.db.prepare(`SELECT tasks.id FROM tasks JOIN schedule ON schedule.task_id=tasks.id
        WHERE tasks.kind='appointment' AND tasks.status='open' AND lower(tasks.title)=lower(?) AND schedule.kind='slot' AND schedule.at=? AND schedule.state!='dismissed'`)
        .get(event.title,start)
      const taskId=existing?String(existing.id):store.workspace.add(null,{title:event.title,kind:'appointment',category:'leisure',detail:decoded.evidence,date:event.date},via).id
      const calendarSlot=existing?undefined:store.workspace.addSchedule(taskId,'slot',start,end,via)
      store.db.prepare("UPDATE inbox_proposals SET state='accepted',task_id=?,decided_at=?,decided_via=? WHERE id=?")
        .run(taskId,new Date().toISOString(),via,id)
      return {id,state,taskId,slotId:calendarSlot?.id??null}
    }
    if(decoded.lectureCancellation&&(decision==='accept'||decoded.lectureCancellation.approvedTarget))
      throw new Problem(409,'Prüfe die bestätigte Kalenderzuordnung zuerst.')
    const saved = decision === 'accept' ? store.workspace.add(null, {
      title: title.slice(0, 120), kind: 'task', detail: '', date: row.due_date,
    }, via) : undefined
    const calendarSlot = saved && slot ? store.workspace.addSchedule(saved.id, 'slot', slot.at, slot.endsAt, via) : undefined
    store.db.prepare('UPDATE inbox_proposals SET state=?,task_id=?,decided_at=?,decided_via=? WHERE id=?')
      .run(state, saved?.id ?? null, new Date().toISOString(), via, id)
    return { id, state, taskId: saved?.id ?? null, slotId: calendarSlot?.id ?? null }
  })
}

export const inboxFixtures: MailContent[] = [
  { id: 'uni-abgabe', subject: 'Abgabe im fiktiven Bachelorseminar', text: 'Bitte die Abgabe bis 30.11.2026 einreichen.' },
  { id: 'retoure', subject: 'Retoure zur fiktiven Bestellung', text: 'Bitte die Rücksendung spätestens am 04.12.2026 abgeben.' },
  { id: 'info', subject: 'Volleyballtraining', text: 'Die Vereinsfarben stehen fest.' },
].map(mail => ({ ...mail, from: 'Fiktives Testkonto', at: null, truncated: false, dates: [] }))

export const mailDemoFixtures: MailContent[] = [
  ...inboxFixtures,
  ...[
    { id: 'application-update', subject: 'Vorstellungsgespräch zu deiner Bewerbung',
      text: 'Firma: Beispieltechnik GmbH\nStelle: Werkstudent Datenanalyse\nOrt: Stuttgart\nBitte bestätige das Vorstellungsgespräch.' },
    { id: 'list', subject: 'Newsletter · Wochenangebote', text: 'Neue Angebote und Tipps der Woche.' },
    { id: 'suspicious', subject: 'Sie haben gewonnen', text: 'Bitte geben Sie Ihre Zahlungsdaten ein.' },
    { id: 'order', subject: 'Versandbestätigung zu deiner Bestellung', text: 'Dein Paket wurde verschickt.' },
    { id: 'job', subject: 'Stellenanzeige Werkstudent', text: 'Die Details stehen im Stellenportal.' },
    { id: 'work', subject: 'Kundentermin und Projektstatus', text: 'Kannst du die Zahlen bis morgen prüfen?' },
  ].map(mail => ({ ...mail, from: 'Fiktives Testkonto', at: null, truncated: false, dates: [] })),
]

export function recordableMail(mail: Parameters<typeof inboxSuggestion>[0]) {
  const classified = classifyMail(mail)
  if (classified.category==='jobs'||classified.category==='newsletter'||classified.category==='spam') return false
  if (classified.shipment === 'return-closed' || classified.shipment === 'return-in-transit') return false
  return classified.important || (classified.category === 'orders' &&
    /bestellbestätigung|bestellnummer|versandbestätigung|sendungsverfolgung|deine retoure|deine rücksendung/iu.test(mail.subject))
}

export const clothingDemoMail:MailContent[] = [
  {id:'clothing-mail-test-1',subject:'Deine Bestellbestätigung · Bestellnummer LP-4242',from:'Test-Shop <order@kleidung.example>',
    text:'Bestellnummer LP-4242\nArtikel: Baumwoll-T-Shirt\nFarbe: Weiß\nGröße: M\nMenge: 1\nArtikel: Schwarze Hose\nGröße: 42',
    at:null,truncated:false,dates:[]},
  {id:'clothing-mail-test-2',subject:'Dein Paket wurde zugestellt · Bestellnummer LP-4242',from:'Test-Shop <order@kleidung.example>',
    text:'Bestellnummer LP-4242',at:null,truncated:false,dates:[]},
]
