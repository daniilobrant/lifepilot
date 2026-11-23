import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../../../hub/runtime/store.ts'
import { applicationHistory, applicationOverview, applicationFromMail, extractApplicationFields, saveApplication, scanApplicationMails } from '../../../hub/runtime/applications.ts'

const draft = { company:'Beispiel GmbH', role:'Werkstudent IT', location:'Berlin' }
test('Only three application fields required, outcomes count independently and prior revisions are blocked', () => {
  const store = new Store(':memory:')
  try {
    assert.throws(() => saveApplication(store,{ ...draft, location:'' }),{status:400})
    const offers = saveApplication(store,draft)
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

test('Mail suggestions retain their source, distinguish stages and never duplicate on a scan', () => {
  const store = new Store(':memory:')
  const base={ id:'message-1', subject:'Vielen Dank für deine Bewerbung',from:'Beispiel',at:null,dates:[],truncated:false,
    text:'Firma: Beispiel GmbH\nStelle: Werkstudent IT\nOrt: Berlin\nWir haben deine Bewerbung erhalten.'}
  try {
    assert.equal(scanApplicationMails(store,[base],'account'),1)
    assert.equal(scanApplicationMails(store,[base],'account'),0)
    const [proposal]=applicationOverview(store).sources
    assert.equal(proposal.status,'applied')
    assert.equal(applicationOverview(store).items.length,0)
    saveApplication(store,proposal,undefined,proposal.id)
    assert.equal(applicationOverview(store).items.length,1)
    assert.equal(applicationOverview(store).sources.length,0)
    assert.equal(applicationFromMail({...base,subject:'Stellenanzeigen der Woche',text:'Jobs und Bewerbungstipps.'}),undefined)
    assert.equal(applicationFromMail({...base,subject:'Rückmeldung zu deiner Bewerbung',text:'Leider können wir deine Bewerbung nicht berücksichtigen.'})?.status,'rejected')
    assert.equal(applicationFromMail({...base,subject:'Einladung zum Vorstellungsgespräch'})?.status,'interview')
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
