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

test('Merchant payment confirmations outside PayPal become one expense with the paid total',()=>{
  const booking=mail('booking','Zahlung erfolgreich','Bestätigungsnummer: 1234567890\nwir haben Ihre Zahlung für Ihre Buchung in der Unterkunft Beispiel Bungalow erhalten.\nGesamtkosten\n€ 499,31\nInsgesamt bezahlt\n€ 499,31','Booking.com <noreply-payments@booking.com>')
  const draft=financeFromMail(booking)!.draft
  assert.equal(draft.cents,49931)
  assert.equal(draft.direction,'outgoing')
  assert.equal(draft.category,'Freizeit & Kultur')
  const park=financeFromMail(mail('park','i-Park - Payment confirmation','<body><h3>Payment Receipt</h3><span>Payment Date: 26/08/2026</span><span><b>Amount: </b></span><span>4.00 €</span></body>','no-reply@mail.parkalot.example'))!.draft
  assert.equal(park.cents,400)
  assert.equal(park.title,'i-Park')
  const flight=financeFromMail(mail('flight','Zahlung erfolgreich','Buchungsnr. 1234 Wir haben deine Zahlung erhalten. Stuttgart - Barcelona ｜ 13. Nov. Gesamt 45,67 € Ticketpreis 24,06 € Steuern und Gebühren 21,61 €','Trip.com <noreply@trip.com>'))!.draft
  assert.equal(flight.cents,4567)
  for(const [subject,text] of [['Payment Accepted Notification','The payment has succeeded. Amount: 75 MAD'],['Deine Zahlung steht an','Die Abbuchung von 617,00 € erfolgt in 3 Tagen']] as const)
    assert.equal(financeFromMail(mail(subject,subject,text)),undefined,subject)
  const store=new Store(':memory:')
  try{
    const paypal=mail('pp','Beleg für Ihre Zahlung an Trip.com Netherlands','Sie haben 45,67 € EUR an Trip.com Netherlands gezahlt\nHändler\nTrip.com Netherlands\nTransaktionscode\nABCD12345678','PayPal <service@paypal.de>')
    scanMailFinances(store,[mail('flight','Zahlung erfolgreich','Wir haben deine Zahlung erhalten. Gesamt 45,67 €','Trip.com <noreply@trip.com>'),paypal],'account')
    assert.equal(pendingMailFinances(store,'account').filter(item=>item.cents===4567).length,1)
  }finally{store.db.close()}
})

test('Invoices and order confirmations that state a paid total become expenses, open invoices do not',()=>{
  const paid=financeFromMail(mail('inv','Ihre Rechnung Nr. 4711','Vielen Dank für Ihren Einkauf. Gesamtbetrag 49,90 € Zahlungsart: Visa','Beispielshop <rechnung@beispielshop.example>'))!.draft
  assert.equal(paid.cents,4990)
  assert.equal(paid.direction,'outgoing')
  assert.equal(financeFromMail(mail('due','Ihre Rechnung ist fällig','Gesamtbetrag 49,90 € bitte bis 01.12. überweisen','Beispielshop <rechnung@beispielshop.example>')),undefined)
})

test('Ride, delivery and stay receipts are recognised with fitting categories, announcements are not',()=>{
  const ride=financeFromMail(mail('ride','Deine Fahrt mit Beispielride am Montagmorgen','Danke, dass du die Beispielride App nutzt. Gesamtsumme 36,94 € Fahrpreis 36,74 €','Beispielride Belege <noreply@ride.example>'))!.draft
  assert.equal(ride.cents,3694); assert.equal(ride.category,'Transport & Mobilität'); assert.equal(ride.title,'Beispielride')
  const food=financeFromMail(mail('food','Deine Beispiel Eats Bestellung','Hier ist dein Beleg für Burgerladen. Gesamtsumme 17,89 €','Beispiel <noreply@ride.example>'))!.draft
  assert.equal(food.category,'Essen & Trinken')
  assert.equal(financeFromMail(mail('stay','Deine Quittung von Beispielstay','Quittungsnummer: R1 3 Nächte Gesamtbetrag (EUR) 612,40 € Bezahlt','Beispielstay <automated@stay.example>'))!.draft.cents,61240)
  assert.equal(financeFromMail(mail('soon','Wir werden Ihre Karte bald belasten','Ihre Karte wird mit 499,31 € belastet','Beispiel <noreply@stay.example>')),undefined)
})
