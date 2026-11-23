import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Store} from '../../../hub/runtime/store.ts'
import {dateInBerlin,shiftDay} from '../../../hub/runtime/values.ts'
import {readTicketEvent} from '../../../hub/runtime/event-mail.ts'
import {scanTicketEvents,listInbox,decideInbox} from '../../../hub/runtime/inbox.ts'
import {decideMailFinance,pendingMailFinances,scanMailFinances} from '../../../hub/runtime/mail-finance.ts'
import {inboxLabel} from '../tools/classify-mail.ts'
import type {MailContent} from '../../../hub/connectors/google.ts'

const today=dateInBerlin(), eventDay=shiftDay(today,6)
const dateLabel=new Intl.DateTimeFormat('de-DE',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(eventDay))
const ticket:MailContent={id:'ticket-1',subject:'Deine Tickets für Early Show',from:'"Tickets für Example Comedy Club · via Ticketdienst" <booking@example.org>',
  at:today+'T13:00:00Z',dates:[],truncated:false,text:`DEINE TICKETS SIND BEREIT!
  Deine Bestellung wurde erfolgreich abgeschlossen.
  Early Show
  So., ${dateLabel} · Einlass 17:00, Beginn 18:00 Uhr
  EXAMPLE COMEDY CLUB · Hauptstraße 22, 70173 Stuttgart
  Bestell-Nr. example42
  2× Standard · Einzelpreis 28,90 €
  Gesamt
  57,80 €
  Vertragspartner für den Ticketkauf ist Example Comedy GmbH, Hauptstraße 7.`}
const receipt:MailContent={id:'payment-1',subject:'Du hast eine Zahlung gesendet',from:'PayPal <service@paypal.de>',
  at:today+'T13:05:00Z',dates:[],truncated:false,
  text:`Du hast 57,80 € EUR an Safe Checkout gesendet
  Transaktionscode: 12ABC3456ABC12345
  Bestellnummer: example42
  Transaktionsdatum: ${today}`}

test('ticket confirmation uses real show date and time and amounts only from order total',()=>{
  const parsed=readTicketEvent(ticket)
  assert.equal(parsed?.date,eventDay)
  assert.equal(parsed?.time,'18:00')
  assert.equal(parsed?.doors,'17:00')
  assert.equal(parsed?.reference,'example42')
  assert.equal(parsed?.cents,5780)
  assert.equal(inboxLabel(ticket),'leisure')
  assert.equal(readTicketEvent({...ticket,subject:'Deine Tickets für Early Show wurden storniert'}),undefined)
  const store=new Store(':memory:','synthetic')
  try{
    assert.equal(scanTicketEvents(store,[ticket,{...ticket,id:'ticket-copy'}],'account'),1)
    const [proposal]=listInbox(store)
    assert.match(proposal.evidence,/Stuttgart/)
    assert.equal(proposal.event?.title,'Early Show · EXAMPLE COMEDY CLUB')
    const result=decideInbox(store,proposal.id,'accept','ui')
    assert.ok(result.slotId)
    assert.equal(store.db.prepare('SELECT kind FROM tasks WHERE id=?').get(result.taskId)?.kind,'appointment')
  }finally{store.db.close()}
})

test('ticket and PayPal become one finance proposal in either order and across runs',()=>{
  for(const mails of [[ticket,receipt],[receipt,ticket]]){
    const store=new Store(':memory:','synthetic')
    try{
      for(const mail of [...mails,...mails])scanMailFinances(store,[mail],'account')
      const pending=pendingMailFinances(store,'account')
      assert.equal(pending.length,1)
      assert.equal(pending[0].title,'Early Show · EXAMPLE COMEDY CLUB')
      assert.equal(pending[0].cents,5780)
      decideMailFinance(store,'account',pending[0].id,true,{})
      scanMailFinances(store,[ticket,receipt],'account')
      assert.equal(pendingMailFinances(store,'account').length,0)
      assert.equal(store.db.prepare('SELECT count(*) AS count FROM finance_entries').get()?.count,1)
    }finally{store.db.close()}
  }
})

test('PayPal confirms an already approved ticket amount without a second expense and leaves other same-price orders distinct',()=>{
  const store=new Store(':memory:','synthetic')
  try{
    scanMailFinances(store,[ticket],'account')
    decideMailFinance(store,'account',pendingMailFinances(store,'account')[0].id,true,{})
    scanMailFinances(store,[receipt,{...receipt,id:'other-payment',text:receipt.text.replace('example42','another99').replace('12ABC3456ABC12345','98XYZ7654XYZ54321')}],'account')
    assert.equal(pendingMailFinances(store,'account').length,1)
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM finance_entries').get()?.count,1)
  }finally{store.db.close()}
})
