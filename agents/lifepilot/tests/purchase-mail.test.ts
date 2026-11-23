import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Store} from '../../../hub/runtime/store.ts'
import {readAmazonOrder,readRecurringCharge} from '../../../hub/runtime/purchase-mail.ts'
import {decideMailFinance,pendingMailFinances,scanMailFinances} from '../../../hub/runtime/mail-finance.ts'
import {needsMailBody} from '../tools/mail-depth.ts'
import type {MailContent} from '../../../hub/connectors/google.ts'

const receipt=(patch:Partial<MailContent>):MailContent=>({
  id:'fixture',from:'Beispiel <kontakt@example.org>',text:'',subject:'Deine Rechnung',
  at:'2026-11-03T18:00:00Z',dates:[],truncated:false,...patch,
})
const amazon=receipt({id:'amazon-order',from:'Amazon <bestellbestaetigung@amazon.de>',subject:'Bestellt: Beispiel und zwei weitere Artikel',
  text:'Vielen Dank für deine Bestellung!\nBestellnr.\n123-1234567-1234567\nEinzelpreis 24.9 EUR\nEinzelpreis 15.99 EUR\nSumme\n66.44 EUR'})
const apple=(day:string,size='2 TB',price='9,99')=>receipt({
  id:'apple-'+day,at:day+'T18:00:00Z',from:'Apple <no_reply@email.apple.com>',subject:'Deine Rechnung von Apple',
  text:`Rechnung\n${day}\niCloud+ mit ${size} (Monatlich)\nVerlängerung am 1. Dezember 2026\n${price} €\nZwischensumme\n8,40 €\nVisa •••• 0000 (Apple Pay)\n${price} €`,
})
const payment=(day:string,id:string,merchant='Medienladen',service='Premium Musik')=>receipt({
  id,at:day+'T18:00:00Z',from:'PayPal <service@paypal.de>',subject:'Du hast eine Zahlung gesendet',
  text:`Du hast 11,99 € EUR an ${merchant} gesendet\nTransaktionscode: ${id}\nTransaktionsdatum: ${day}\nBeschreibung: ${service}`,
})

test('relevant headers trigger full reading while reviews, newsletters and unsafe requests remain at preview',()=>{
  assert.equal(needsMailBody(amazon),true)
  assert.equal(needsMailBody(apple('2026-11-01')),true)
  assert.equal(needsMailBody(receipt({subject:'Kurz zur Sache',text:'Heute ist die Kündigungsfrist'})),true)
  assert.equal(needsMailBody({...amazon,subject:'Bestellung: Haben sich deine Erwartungen erfüllt?'}),false)
  assert.equal(needsMailBody(receipt({subject:'Newsletter: Tickets und Angebote',mailingList:true})),false)
  assert.equal(needsMailBody(receipt({subject:'Bestellung',text:'Bitte Zahlungsdaten eingeben'})),false)
})

test('Amazon uses the order total once across confirmation copies and ignores shipping-only mail',()=>{
  assert.equal(readAmazonOrder(amazon)?.cents,6644)
  const store=new Store(':memory:','synthetic')
  try{
    scanMailFinances(store,[amazon,{...amazon,id:'forwarded-copy'},{...amazon,id:'shipping',subject:'Versendet: Beispiel'}],'a')
    const proposals=pendingMailFinances(store,'a')
    assert.equal(proposals.length,1)
    assert.equal(proposals[0].cents,6644)
    decideMailFinance(store,'a',proposals[0].id,true,{})
    scanMailFinances(store,[amazon],'a')
    assert.equal(pendingMailFinances(store,'a').length,0)
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM finance_entries').get()?.n,1)
  }finally{store.db.close()}
})

test('iCloud uses one subscription, ignores older terms and asks again for a later price change',()=>{
  const latest=apple('2026-11-01')
  assert.equal(readRecurringCharge(latest)?.cents,999)
  assert.equal(readRecurringCharge(latest)?.renewal,'2026-12-01')
  const store=new Store(':memory:','synthetic')
  try{
    scanMailFinances(store,[latest,apple('2026-10-01'),apple('2026-09-01','200 GB','2,99')],'a')
    const [proposal]=pendingMailFinances(store,'a')
    assert.equal(pendingMailFinances(store,'a').length,1)
    assert.equal(proposal.title,'iCloud+ mit 2 TB')
    assert.equal(proposal.subscription?.cycle,'monthly')
    decideMailFinance(store,'a',proposal.id,true,{})
    scanMailFinances(store,[apple('2026-12-01'),latest],'a')
    assert.equal(pendingMailFinances(store,'a').length,0)
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM finance_entries WHERE kind='subscription'").get()?.n,1)
    scanMailFinances(store,[apple('2027-01-01','2 TB','10,99')],'a')
    const [change]=pendingMailFinances(store,'a')
    assert.equal(change?.cents,1099)
    decideMailFinance(store,'a',change.id,true,{})
    const rows=store.db.prepare("SELECT month,until_month FROM finance_entries WHERE kind='subscription' ORDER BY month").all()
    assert.equal(rows[0].until_month,'2027-01')
    assert.equal(rows[1].month,'2027-01')
  }finally{store.db.close()}
})

test('inference requires three distinct dates in monthly cadence for the same payer and service',()=>{
  const store=new Store(':memory:','synthetic')
  try{
    const first=payment('2026-09-01','EXAMPLEPAY001')
    const second=payment('2026-10-01','EXAMPLEPAY002')
    const third=payment('2026-11-01','EXAMPLEPAY003')
    const unrelated=payment('2026-11-01','EXAMPLEPAY004','Medienladen','Filmabend')
    scanMailFinances(store,[first,second,second,unrelated],'a')
    assert.equal(pendingMailFinances(store,'a').filter(row=>row.subscription).length,0)
    scanMailFinances(store,[third],'a')
    const subscription=pendingMailFinances(store,'a').find(row=>row.subscription)
    assert.ok(subscription)
    assert.equal(subscription.subscription?.confirmed,false)
    decideMailFinance(store,'a',subscription.id,false,{})
    assert.equal(pendingMailFinances(store,'a').length,4)
  }finally{store.db.close()}
})
