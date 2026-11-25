import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../../../hub/runtime/store.ts'
import { applicationHistory, applicationOverview, applicationFromMail, extractApplicationFields, saveApplication, scanApplicationMails } from '../../../hub/runtime/applications.ts'

const draft = { company:'Beispiel GmbH', role:'Werkstudent IT', location:'Berlin' }
test('Company and role are required while location is optional, outcomes count independently and prior revisions are blocked', () => {
  const store = new Store(':memory:')
  try {
    assert.throws(() => saveApplication(store,{ ...draft, role:'' }),{status:400})
    const offers = saveApplication(store,{ ...draft, location:'' })
    const rejected = saveApplication(store,{...draft,role:'Werkstudent Daten'})
    const withdrawn = saveApplication(store,{...draft,role:'Praktikum IT'})
    saveApplication(store,{...offers,status:'offer'},offers)
    saveApplication(store,{...rejected,status:'rejected'},rejected)
    saveApplication(store,{...withdrawn,status:'withdrawn'},withdrawn)
    assert.throws(() => saveApplication(store,offers,offers),{status:409})
    assert.equal(applicationHistory(store,offers.id).length,2)
    assert.deepEqual(applicationOverview(store).stats,{applied:0,reply:0,interview:0,offer:1,rejected:1,withdrawn:1})
  } finally {store.db.close()}
})

test('Mail suggestions retain their source, distinguish stages, summarize content and next steps, and never duplicate on a scan', () => {
  const store = new Store(':memory:')
  const base={ id:'message-1', subject:'Vielen Dank für deine Bewerbung',from:'Beispiel',at:'2026-11-20T10:00:00Z',dates:[],truncated:false,
    text:'Firma: Beispiel GmbH\nStelle: Werkstudent IT\nOrt: Berlin\nWir haben deine Bewerbung erhalten.'}
  try {
    assert.equal(scanApplicationMails(store,[base],'account'),1)
    assert.equal(scanApplicationMails(store,[base],'account'),0)
    const [proposal]=applicationOverview(store).sources
    assert.equal(proposal.status,'applied')
    assert.equal(proposal.applied_on,'2026-11-20')
    assert.match(proposal.description ?? '',/Wir haben deine Bewerbung erhalten\./)
    assert.match(proposal.notes ?? '',/^Nächster Schritt erforderlich: Nein/)
    assert.equal(applicationOverview(store).items.length,0)
    const saved=saveApplication(store,proposal,undefined,proposal.id)
    assert.equal(saved.applied_on,'2026-11-20')
    assert.match(saved.description,/Wir haben deine Bewerbung erhalten\./)
    assert.match(saved.notes,/^Nächster Schritt erforderlich: Nein/)
    assert.equal(applicationOverview(store).items.length,1)
    assert.equal(applicationOverview(store).sources.length,0)
    assert.equal(applicationFromMail({...base,subject:'Stellenanzeigen der Woche',text:'Jobs und Bewerbungstipps.'}),undefined)
    const rej=applicationFromMail({...base,from:'"Mercedes-Benz Group AG" <no-reply@mercedes-benz.com>',subject:'Rückmeldung zu Ihrer Bewerbung (7241817)',text:'Sehr geehrter Bewerber,\nleider können wir Ihre Bewerbung am Standort Stuttgart nicht berücksichtigen.'})
    assert.equal(rej?.status,'rejected')
    assert.equal(rej?.role,'Bewerbung (7241817)')
    assert.equal(rej?.location,'Stuttgart')
    assert.match(rej?.notes ?? '',/^Nächster Schritt erforderlich: Nein/)
    const intv=applicationFromMail({...base,subject:'Einladung zum Vorstellungsgespräch'})
    assert.equal(intv?.status,'interview')
    assert.match(intv?.notes ?? '',/^Nächster Schritt erforderlich: Ja/)
  } finally {store.db.close()}
})

test('OCR field extraction uses visible labels and conservatively recognizes common layout', () => {
  assert.deepEqual(extractApplicationFields('Beispieltechnik GmbH\nWerkstudent Datenanalyse\n70173 Stuttgart\nGehalt: 20 EUR pro Stunde'),{
    company:'Beispieltechnik GmbH',role:'Werkstudent Datenanalyse',location:'Stuttgart',salary:'20 EUR pro Stunde',
  })
  assert.equal(extractApplicationFields('Bewerbung vom Freitag').company,'')
})

test('An explicit receipt creates one application and an ambiguous follow-up remains for review', () => {
  const store = new Store(':memory:')
  try {
    const original = { id:'receipt', from:'AT', subject:'Eingang Ihrer Bewerbung',
      text:'Firma: Beispiel GmbH\nStelle: Werkstudent IT\nOrt: Berlin\nWir haben deine Bewerbung erhalten.', at:null, dates:[], truncated:false }
    assert.equal(scanApplicationMails(store,[original],'account',true),1)
    assert.equal(applicationOverview(store).items.length,1)
    assert.equal(applicationOverview(store).sources.length,0)
    scanApplicationMails(store,[{...original,id:'second'},{...original,id:'interview',subject:'Einladung zum Vorstellungsgespräch'}],'account',true)
    assert.equal(applicationOverview(store).items.length,1)
    assert.equal(applicationOverview(store).sources.length,2)
  } finally {store.db.close()}
})

test('Recruiting prose and scholarship signatures populate review fields without guessing missing values', () => {
  const base={ id:'source', subject:'Rückmeldung zu Ihrer Bewerbung', from:'Recruiting <no-reply@example.com>', at:null }
  const position=applicationFromMail({...base,text:[
    'Vielen Dank für Ihre Bewerbung.',
    'Bei der Besetzung der Position Werkstudent (m/w/d) im Bereich Logistik gesucht! - MBG0000011',
    'Arbeitsort: Stuttgart',
    'https://example.com https://jobs.example.com/stellen/MBG0000011',
    'Rechtlicher Hinweis:','Interner Hinweis ohne Bezug',
  ].join('\n')})
  assert.equal(position?.role,'Werkstudent (m/w/d) im Bereich Logistik')
  assert.equal(position?.location,'Stuttgart')
  assert.equal(position?.link,'https://jobs.example.com/stellen/MBG0000011')
  assert.doesNotMatch(position?.description??'',/Interner Hinweis/)
  const scholarship=applicationFromMail({...base,text:[
    'Vielen Dank für Ihre Bewerbung (Bewerbungsnummer 709) für das Deutschlandstipendium.',
    'Ihr HfWU-Deutschlandstipendium-Team',
  ].join('\n')})
  assert.equal(scholarship?.company,'HfWU-Deutschlandstipendium')
  assert.equal(scholarship?.role,'Deutschlandstipendium (Nr. 709)')
  assert.equal(scholarship?.applied_on,null)
  assert.equal(applicationFromMail({...base,subject:'Bewerbung ist eingegangen',text:''})?.role,'')
})
