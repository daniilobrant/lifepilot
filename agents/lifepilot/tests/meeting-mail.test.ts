import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Store} from '../../../hub/runtime/store.ts'
import {readMeetingMail} from '../../../hub/runtime/meeting-mail.ts'
import {scanTicketEvents,listInbox} from '../../../hub/runtime/inbox.ts'
import {classifyMail} from '../tools/classify-mail.ts'
import {triageCandidates} from '../../../hub/runtime/mail-triage.ts'
import type {MailContent} from '../../../hub/connectors/google.ts'

const mail=(patch:Partial<MailContent>):MailContent=>({id:'m1',subject:'Meeting',text:'Hallo Person, heute Meeting um 15 Uhr auf Teams. VG Tom',
  from:'Tom <tom@example.org>',at:'2026-11-26T07:31:28Z',dates:[],truncated:false,...patch})

test('A personal mail with meeting word, day and time becomes an appointment proposal and an important message',()=>{
  const event=readMeetingMail(mail({}))!
  assert.deepEqual([event.title,event.date,event.time,event.venue],['Meeting mit Tom · Teams','2026-11-26','15:00','Teams'])
  assert.equal(readMeetingMail(mail({text:'Wir treffen uns von 14 bis 16 Uhr morgen im Büro, Termin steht.'}))!.end,'16:00')
  assert.equal(classifyMail(mail({})).important,true)
  assert.equal(readMeetingMail(mail({from:'news@shop.example',subject:'Newsletter',text:'Webinar heute um 15 Uhr'})),undefined)
  assert.equal(readMeetingMail(mail({text:'Lass uns bald mal ein Meeting machen.'})),undefined)
  const store=new Store(':memory:')
  try{
    assert.equal(scanTicketEvents(store,[mail({})],'acc','2026-11-26'),1)
    assert.equal(scanTicketEvents(store,[mail({})],'acc','2026-11-26'),0)
    const proposal=listInbox(store)[0]
    assert.equal(proposal.category,'appointments')
    assert.equal(proposal.event?.time,'15:00')
  }finally{store.db.close()}
})

test('Only unclear personal mails are sent to the model for review',()=>{
  const store=new Store(':memory:')
  try{
    const unclear=mail({id:'u',subject:'Kurze Frage',text:'Hast du kurz Zeit, wegen dem Projekt etwas zu klären? Danke.'})
    const picked=triageCandidates(store,[unclear,mail({id:'n',from:'noreply@shop.example',subject:'Hallo',text:'Willkommen bei uns, viel Spaß beim Stöbern.'}),mail({id:'m'})],'acc')
    assert.deepEqual(picked.map(item=>item.id),['u'])
  }finally{store.db.close()}
})

test('A forwarded course mail with an English agenda becomes one presentation appointment for that day',()=>{
  const forwarded=mail({id:'f',from:'student@hochschule.example',at:'2026-11-26T10:25:02Z',
    subject:'WG: [HfWU neo - Hochschule] [101-113: B2B-Sales Management (4 SWS) (immer im WiSe)]',
    text:'Von: "Prof. Dr. Beispiel"\nGesendet: Donnerstag, 26. November 2026 11:25:01\nAn: Beispiel, Person\nBetreff: [HfWU neo] [101-113: B2B-Sales Management (4 SWS) (immer im WiSe)]\n\nAttached are the topics and the agenda for today\'s interim presentation.\nWe’ll start at 12:00 p.m. with Group 2.\nGroup 2: 12:00\nGroup 3: 12:20\nThe link: https://eu02web.zoom-x.de/j/9859702453\nSee you online at 12:00.'})
  const event=readMeetingMail(forwarded)!
  assert.deepEqual([event.title,event.date,event.time],['B2B-Sales Management · Präsentation · Zoom','2026-11-26','12:00'])
})

test('The expanded inbox mail shows a short preview without quotes, headers and links',async()=>{
  const {mailPreview}=await import('../../../hub/runtime/refresh-inbox.ts')
  const preview=mailPreview('Von: Absender\nGesendet: Montag\nBetreff: Test\n\nHallo, wir starten um 12:00 Uhr.\n> altes Zitat\nLink: https://example.org/x\nBis gleich')
  assert.equal(preview,'Hallo, wir starten um 12:00 Uhr. Link: Bis gleich')
  assert.ok(mailPreview('Wort '.repeat(200)).length<=320)
})

test('Sender information shows the name once and, for forwarded mails, the original sender',async()=>{
  const {parseSender,senderLabel,forwardedOriginal,mailPreview}=await import('../../../hub/runtime/refresh-inbox.ts')
  assert.equal(senderLabel('"student@stud.hochschule.example" <student@stud.hochschule.example>'),'student@stud.hochschule.example')
  assert.equal(senderLabel('Tom Beispiel <tom@example.org>'),'Tom Beispiel')
  assert.deepEqual(parseSender('"Tom" <tom@example.org>'),{name:'Tom',address:'tom@example.org'})
  const forwarded={subject:'WG: Kurs',text:'________________________________\nVon: "Prof. Dr. Beispiel"\nGesendet: Donnerstag\nAn: Person\nBetreff: Kurs\n\n[Mail_header]\n\nHallo zusammen.'}
  assert.equal(forwardedOriginal(forwarded),'Prof. Dr. Beispiel')
  assert.equal(forwardedOriginal({subject:'Kurs',text:'Von: jemand\nText'}),undefined)
  assert.equal(mailPreview(forwarded.text),'Hallo zusammen.')
})

test('English am and pm times become 24-hour times in meeting proposals',async()=>{
  const {twentyFourHour}=await import('../../../hub/runtime/meeting-mail.ts')
  assert.equal(twentyFourHour('at 1 pm'),'at 13:00')
  assert.equal(twentyFourHour('start 1:30 p.m. sharp'),'start 13:30 sharp')
  assert.equal(twentyFourHour('12 am and 12 pm and 9 AM'),'00:00 and 12:00 and 09:00')
  assert.equal(twentyFourHour('um 13 Uhr, Raum 5'),'um 13 Uhr, Raum 5')
  assert.equal(readMeetingMail(mail({subject:'Meeting today',text:'Hi, our meeting is today at 1 pm on Teams. Tom'}))!.time,'13:00')
  assert.equal(readMeetingMail(mail({subject:'Meeting today',text:'Hi, the call is today 1:00 p.m.-2:00 p.m. on Zoom.'}))!.end,'14:00')
})
