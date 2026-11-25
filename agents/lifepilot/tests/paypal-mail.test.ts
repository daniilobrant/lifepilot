import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {Store} from '../../../hub/runtime/store.ts'
import {financeFromMail,scanMailFinances,pendingMailFinances,decideMailFinance} from '../../../hub/runtime/mail-finance.ts'
import {financeOverview,saveFinance} from '../../../hub/runtime/finance.ts'
import type {MailContent} from '../../../hub/connectors/google.ts'

const email=(subject:string,text:string,id='message',from='PayPal <service@paypal.de>'):MailContent=>({
  id,subject,text,from,dates:[],truncated:false,at:'2026-11-22T09:00:00Z',
})
const sent=email('Du hast eine Zahlung gesendet',[
  'Du hast 24,50 € EUR an Alex Beispiel gesendet','Nachricht an den Empfänger: Pizzaabend',
  'Transaktionsdetails','Transaktionscode','ABCD1234567','Transaktionsdatum','21. November 2026',
  'Geld gesendet','24,50 € EUR','Gebühr','0,00 € EUR',
].join('\n'))

test('PayPal reads recipient, sender, purpose and explicit transaction date from payment emails',()=>{
  const paid=financeFromMail(sent)!.draft
  assert.deepEqual([paid.direction,paid.counterparty,paid.description,paid.date,paid.cents],['outgoing','Alex Beispiel','Pizzaabend','2026-11-21',2450])
  const received=financeFromMail(email('Du hast eine Zahlung erhalten','Sam Beispiel hat dir 19,90 € EUR gesendet\nVerwendungszweck\nKinokarte\nTransaktionscode\nEXAMPLE12345\nErhaltener Betrag\n19,90 € EUR'))!.draft
  assert.deepEqual([received.direction,received.title,received.mailDate],['incoming','Sam Beispiel · Kinokarte',true])
  const refund=financeFromMail(email('Sie haben eine Rückzahlung von Shop Beispiel erhalten','Gesamtbetrag des Einkaufs\n100,00 € EUR\nZurückgezahlter Betrag\n14,25 € EUR\nRückzahlung gezahlt von\nShop Beispiel\nTransaktionscode\nREFUND12345'))!.draft
  assert.deepEqual([refund.direction,refund.counterparty,refund.cents],['refund','Shop Beispiel',1425])
  assert.equal(financeFromMail({...sent,subject:'Ihre PayPal-Transaktion hat sich geändert'}),undefined)
  assert.equal(financeFromMail({...sent,from:'PayPal <mail@example.org>'})?.draft.direction,undefined)
})

test('The previous pending proposal is enriched in place and the payment is posted just once after confirmation',()=>{
  const store=new Store(':memory:')
  try{
    const fingerprint=createHash('sha256').update(JSON.stringify(['2026-11-22',2450,false,'paypal'])).digest('hex')
    const legacy={title:'PayPal',cents:2450,date:'2026-11-22',mailDate:true,refund:false}
    store.db.prepare('INSERT INTO gmail_finance_suggestions (id,account,fingerprint,draft) VALUES (?,?,?,?)')
      .run('original','account',fingerprint,JSON.stringify(legacy))
    assert.deepEqual(scanMailFinances(store,[sent],'account'),{added:0,updated:1,bookings:0})
    assert.deepEqual(scanMailFinances(store,[sent],'account'),{added:0,updated:0,bookings:0})
    const [item]=pendingMailFinances(store,'account')
    assert.deepEqual([item.id,item.title],['original','Alex Beispiel · Pizzaabend'])
    assert.equal(financeOverview(store,'2026-11').entries.length,0)
    decideMailFinance(store,'account',item.id,true,{})
    decideMailFinance(store,'account',item.id,true,{})
    const [entry]=financeOverview(store,'2026-11').entries
    assert.match(entry.note,/Pizzaabend/u)
    assert.equal(financeOverview(store,'2026-11').entries.length,1)
  }finally{store.db.close()}
})

test('Backfill preserves an already booked custom title, date, and amount',()=>{
  const store=new Store(':memory:')
  try {
    const input={title:'Mein eigener Titel',kind:'expense',cents:2450,date:'2026-11-20'}
    const entry=saveFinance(store,input,'2026-11')
    const fingerprint=createHash('sha256').update(JSON.stringify(['2026-11-22',2450,false,'paypal'])).digest('hex')
    store.db.prepare("INSERT INTO gmail_finance_suggestions (id,account,fingerprint,draft,state,entry_id) VALUES (?,?,?,?,'accepted',?)")
      .run('original','account',fingerprint,JSON.stringify({title:'PayPal',cents:2450,date:'2026-11-22',refund:false}),entry.id)
    assert.equal(scanMailFinances(store,[sent],'account',true).bookings,1)
    const [actual]=financeOverview(store,'2026-11').entries
    assert.deepEqual([actual.title,actual.date,actual.cents],[input.title,input.date,input.cents])
    assert.match(actual.note,/Pizzaabend/u)
  }finally{store.db.close()}
})

test('Incoming PayPal payments count as one-off income and are never repeated in the next month',()=>{
  const store=new Store(':memory:')
  try{
    const received=email('Du hast eine Zahlung erhalten','Sam Beispiel hat dir 19,90 EUR gesendet\nTransaktionscode\nEXAMPLE12345\nErhaltener Betrag\n19,90 EUR')
    scanMailFinances(store,[received,{...received,id:'repeat'}],'account')
    const proposals=pendingMailFinances(store,'account')
    assert.equal(proposals.length,1)
    assert.equal(financeOverview(store,'2026-11').totals.income,0)
    decideMailFinance(store,'account',proposals[0].id,true,{})
    assert.equal(financeOverview(store,'2026-11').totals.income,1990)
    assert.equal(financeOverview(store,'2026-12').totals.income,0)
  }finally{store.db.close()}
})

test('PayPal transfers between people are filed under Freunde & Familie, merchant payments are not',async()=>{
  const {personalTransfer}=await import('../../../hub/runtime/mail-finance.ts')
  const paypal={reference:''}
  for (const name of ['Alex Beispiel','Noelia Corica Cuello','Sam Müller-Lüdenscheidt']) assert.equal(personalTransfer({paypal,counterparty:name,title:name}),true,name)
  for (const name of ['Uber Payments BV','Deutsche Post AG','Google Payment Ireland','Ryanair DAC','Trip.com Netherlands','ASOS Payments Europe B.V.']) assert.equal(personalTransfer({paypal,counterparty:name,title:name}),false,name)
  assert.equal(personalTransfer({counterparty:'Alex Beispiel',title:'Alex Beispiel'}),false)
})
