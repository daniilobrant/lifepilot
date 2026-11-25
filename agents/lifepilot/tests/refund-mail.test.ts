import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Store} from '../../../hub/runtime/store.ts'
import {financeFromMail,pendingMailFinances,scanMailFinances} from '../../../hub/runtime/mail-finance.ts'
import {needsMailBody} from '../tools/mail-depth.ts'
import {inboxLabel} from '../tools/classify-mail.ts'
import type {MailContent} from '../../../hub/connectors/google.ts'

const mail=(id:string,subject:string,text:string,from='Shop <noreply@shop.example>',at='2026-11-20T10:00:00Z'):MailContent=>
  ({id,subject,text,from,at,dates:[],truncated:false})

const credit=mail('credit','Gutschriftbestätigung für Bestellung 123-4567890-1234567',
  'Guten Tag, Beispielhändler informiert zu Ihrer Gutschrift. Wir bestaetigen die heute erfolgte Erstattung von 25,55 € fuer Ihre Bestellung 123-4567890-1234567. '+
  'Die Erstattung bezieht sich auf folgende(n) Artikel :     Artikel: Beispiel Socken 3er Pack, Schwarz     Menge: 1     Grund der Erstattung: beschädigt '+
  'Und so setzt sich die Erstattung zusammen:     Artikel Erstattung: 21,47 €     Artikel erstattete Mehrwertsteuer: 4,08 €     Versand Erstattung: 1,12 € '+
  'Die Erstattung erfolgt auf die bei der Bestellung verwendete Zahlungsart: Kreditkarte: 25,55 €',
  '"Amazon.de" <payments-messages@amazon.de>')

test('A merchant credit note outside PayPal becomes one refund proposal with the total, not the partial amounts',()=>{
  assert.equal(needsMailBody({...credit,text:'Wir bestaetigen die heute erfolgte Erstattung von 25,55 € fuer Ihre Bestellung',previewOnly:true}),true)
  assert.equal(inboxLabel(credit),'finance')
  const draft=financeFromMail(credit)!.draft
  assert.equal(draft.cents,2555)
  assert.equal(draft.refund,true)
  assert.equal(draft.direction,'refund')
  assert.equal(draft.title,'Beispiel Socken 3er Pack, Schwarz · Amazon')
  assert.equal(draft.merchantRefund?.reference,'123-4567890-1234567')
  const second=financeFromMail({...credit,id:'credit-2',text:credit.text.replaceAll('25,55','24,90')})!.draft
  assert.notEqual(second.sourceKey,draft.sourceKey)
})

test('Announcements, requests, vouchers, transfers and ambiguous amounts stay without a proposal',()=>{
  for(const [subject,text,from] of [
    ['Wir haben Ihre Rücksendeanfrage registriert','Erstattungsbetrag: 49,99 € nach Eingang der Ware'],
    ['Ihre Erstattung wurde beantragt','Eine Erstattung von 20,00 € wird geprüft'],
    ['Ein Gutschein über € 15 wartet auf Sie','Gutschrift von 15,00 € bei Ihrer nächsten Buchung'],
    ['Wir haben den gewünschten Betrag auf Ihr Bankkonto überwiesen','Angeforderter Abbuchungsbetrag 300,00 € EUR','PayPal <service@paypal.de>'],
    ['Deine Bestellung wurde storniert','Wir haben dir den Betrag nicht in Rechnung gestellt. Gesamt 59,99 €'],
    ['Gutschrift erhalten','Gutschrift von 10,00 € und Gutschrift von 12,00 € wurden gebucht'],
  ] as const)assert.equal(financeFromMail(mail(subject,subject,text,from)),undefined,subject)
})

test('A merchant refund and the PayPal refund for the same money produce a single proposal',()=>{
  const store=new Store(':memory:')
  try{
    const merchant=mail('merchant','Ihre Rückerstattung wurde bearbeitet',
      'Bestellung Nr. 98765432 Ihre Rückerstattung wurde erfolgreich verarbeitet. Rückerstattungsbetrag: 75,90 €','Beispielmode <noreply@beispielmode.example>')
    const paypal=mail('paypal','Sie haben eine Rückzahlung von BEISPIELMODE.COM erhalten',
      'Gesamtbetrag des Einkaufs\n120,00 € EUR\nZurückgezahlter Betrag\n75,90 € EUR\nRückzahlung gezahlt von\nBEISPIELMODE.COM\nTransaktionscode\nREFUND98765',
      'PayPal <service@paypal.de>','2026-11-21T08:00:00Z')
    assert.equal(financeFromMail(merchant)!.draft.cents,7590)
    scanMailFinances(store,[merchant,paypal],'account')
    const refunds=pendingMailFinances(store,'account')
    assert.equal(refunds.length,1)
    assert.equal(refunds[0].cents,7590)
    const other=mail('other','Ihre Rückerstattung wurde bearbeitet','Ihre Rückerstattung wurde verarbeitet. Rückerstattungsbetrag: 75,90 €','Anderer Laden <noreply@anderer.example>')
    scanMailFinances(store,[other],'account')
    assert.equal(pendingMailFinances(store,'account').length,2)
  }finally{store.db.close()}
})
