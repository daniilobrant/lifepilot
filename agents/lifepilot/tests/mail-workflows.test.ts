import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Store} from '../../../hub/runtime/store.ts'
import {decideMailFinance,financeFromMail,pendingMailFinances,scanMailFinances} from '../../../hub/runtime/mail-finance.ts'
import {financeOverview} from '../../../hub/runtime/finance.ts'
import {readInboxFeed} from '../../../hub/runtime/refresh-inbox.ts'
import {enableMailCategorization,mailAccountKey,syncCategorizedMail} from '../../../hub/runtime/mail-sync.ts'
import {inboxLabel} from '../tools/classify-mail.ts'
import type {GoogleConnector,GmailPage,GmailRange,MailContent} from '../../../hub/connectors/google.ts'

const email=(id:string,subject:string,text:string,from='Rechnungen <service@paypal.de>'):MailContent=>({
  id,subject,text,from,at:'2026-11-18T18:30:00Z',dates:[],truncated:false,
})

test('Gmail proposals preserve the payment month, never post automatically and deduct confirmed refunds once',()=>{
  const store=new Store(':memory:')
  try{
    const payment=email('payment','Du hast eine Zahlung gesendet','Händler: Beispielshop\nArtikel: Jeans\nDatum: 28.10.2026\nGesamt: 1.234,56 EUR\nTransaktionscode: ABCDEF123')
    const refund=email('refund','Du hast eine Rückzahlung erhalten','Verkäufer: Beispielshop\nErstattungsdatum: 03.11.2026\nBetrag: 29,90 €')
    const uncertain=email('invoice','Zahlungsbestätigung','Gesamt: 55,00 EUR\nAndere Zahlung: 45,00 EUR')
    assert.equal(financeFromMail(uncertain),undefined)
    assert.equal(financeFromMail(email('unpaid','Rechnung','Gesamt: 12,00 EUR')),undefined)
    scanMailFinances(store,[payment,{...payment,id:'duplicate'},refund,uncertain],'account')
    assert.equal(financeOverview(store,'2026-10').totals.variable,0)
    const proposals=pendingMailFinances(store,'account')
    assert.equal(proposals.length,2)
    const cost=proposals.find(item=>!item.refund)!
    const credit=proposals.find(item=>item.refund)!
    assert.equal(cost.title,'Jeans · Beispielshop')
    assert.throws(()=>decideMailFinance(store,'other',cost.id,true,{}),{status:404})
    decideMailFinance(store,'account',cost.id,true,{})
    decideMailFinance(store,'account',cost.id,true,{})
    decideMailFinance(store,'account',credit.id,true,{})
    assert.equal(financeOverview(store,'2026-10').totals.variable,123456)
    assert.equal(financeOverview(store,'2026-11').totals.variable,-2990)
    assert.equal(pendingMailFinances(store,'account').length,0)
  }finally{store.db.close()}
})

test('Job alerts and newsletters get Gmail labels without taking over the LifePilot feed',async()=>{
  const rows=[
    email('jobs','Neue Einsätze verfügbar','Bitte antworte.', 'InStaff <news@instaff.jobs>'),
    email('application','Vorstellungsgespräch zu deiner Bewerbung','Bitte bestätige den Termin.','Beispiel <recruiting@example.org>'),
    email('promo','Newsletter · Wochenangebote',''),
    email('uni','Prüfungstermin wurde verschoben','Bitte bestätige.', 'Uni <team@hs-esslingen.de>'),
    email('sport','Volleyball-Spieltag am Wochenende','','Verein <team@verein.example>'),
    email('payment','Du hast eine Zahlung gesendet','Gesamt: 19,90 EUR'),
    email('unknown','Hallo','Hallo','Person <person@example.org>'),
  ]
  const google={recentInbox:async()=>({account:'test',mails:rows,next:null})} as unknown as GoogleConnector
  assert.deepEqual(rows.map(row=>inboxLabel(row)),['careers','careers','newsletter','university','leisure','finance','review'])
  const result=await readInboxFeed(google,false)
  assert.deepEqual(new Set(result.messages.map(item=>item.id)),new Set(['application','uni','sport','payment']))
})

test('Automatic categorization keeps its date range and resumes the same Gmail page after a failed label write',async()=>{
  const store=new Store(':memory:')
  try{
    const address='user@example.com'
    const account=mailAccountKey(address)
    const seen:{token?:string,before?:number}[]=[]
    let fail=true
    const google={
      mailboxAddress:async()=>address,
      status:()=>[{service:'gmail-sort',connected:true},{service:'gmail-content',connected:true}],
      recentInbox:async(cursor:(account:string)=>GmailPage|undefined,_restart:boolean,range?:GmailRange)=>{
        const token=cursor(account)?.pageToken
        seen.push({token,before:range?.beforeEpoch})
        return {account,mails:[email('a','Du hast eine Zahlung gesendet','EUR 19,90')],
          next:token?null:{pageToken:'second',afterEpoch:range?.afterEpoch}}
      },
      sortInboxPage:async()=>{if(fail) throw Error('temporarily unavailable');return 1},
    } as unknown as GoogleConnector
    await enableMailCategorization(store,google,address)
    await assert.rejects(syncCategorizedMail(store,google),/temporarily unavailable/u)
    assert.equal(pendingMailFinances(store,account).length,1)
    fail=false
    assert.deepEqual(await syncCategorizedMail(store,google),{labeled:2,more:false})
    assert.deepEqual(seen.map(call=>call.token),[undefined,undefined,'second'])
    assert.ok(seen.every(call=>call.before===seen[0].before))
    assert.equal(pendingMailFinances(store,account).length,1)
  }finally{store.db.close()}
})
