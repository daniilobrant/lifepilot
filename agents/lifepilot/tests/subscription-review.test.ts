import test from 'node:test'
import assert from 'node:assert/strict'
import { readReview, subscriptionData } from '../../../hub/runtime/subscription-review.ts'
import type { FinanceEntry } from '../../../hub/runtime/finance-types.ts'

const entry=(title:string,cents:number,extra:Partial<FinanceEntry>={}):FinanceEntry=>({kind:'subscription',title,cents,cycle:'monthly',category:'Freizeit & Abos',date:null,dueDay:null,
  noticeDays:null,renewal:null,local:false,note:'',id:title,month:'2026-11',until:null,revision:1,...extra})
const alternative=(extra:object={})=>({name:'Anbieter',monthlyEuro:7.5,priceNote:null,pros:['günstig'],cons:['weniger Speicher'],url:'https://example.com/tarif',...extra})
const raw=(items:object[])=>({summary:'Zusammenfassung',subscriptions:items})
const item=(title:string,extra:object={})=>({title,verdict:'switch',headline:'Wechseln lohnt sich',reasoning:'Begründung',alternatives:[alternative()],...extra})

test('Abo-Prüfung rechnet Preise und Jahresersparnis serverseitig', () => {
  const review=readReview(raw([item('Streaming')]),[entry('Streaming',1000)],'Esslingen','2026-11-26')
  assert.equal(review.items[0].alternatives[0].monthlyCents,750)
  assert.equal(review.items[0].alternatives[0].savingsYearCents,3000)
  assert.equal(review.checked,'2026-11-26')
})
test('Abo-Prüfung berechnet die Kündigungsfrist selbst', () => {
  const review=readReview(raw([item('Studio',{verdict:'keep',alternatives:[]})]),[entry('Studio',3000,{renewal:'2027-01-31',noticeDays:30,local:true})],'Esslingen')
  assert.equal(review.items[0].cutoff,'2027-01-01')
})
test('Abo-Prüfung lehnt Links ohne https und fremde Titel ab', () => {
  const entries=[entry('Streaming',1000)]
  assert.throws(()=>readReview(raw([item('Streaming',{alternatives:[alternative({url:'http://example.com'})]})]),entries,''))
  assert.throws(()=>readReview(raw([item('Streaming',{alternatives:[alternative({url:'javascript:alert(1)'})]})]),entries,''))
  assert.throws(()=>readReview(raw([item('Streaming',{alternatives:[alternative({url:'https://user:pw@example.com/'})]})]),entries,''))
  assert.throws(()=>readReview(raw([item('Anderes')]),entries,''))
  assert.throws(()=>readReview(raw([item('Streaming',{alternatives:[]})]),entries,''))
  assert.throws(()=>readReview(raw([]),entries,''))
})
test('Abo-Prüfung kürzt überlange Texte statt zu verwerfen', () => {
  const review=readReview(raw([item('Streaming',{reasoning:'Wort '.repeat(300)})]),[entry('Streaming',1000)],'')
  assert.ok(review.items[0].reasoning.length<=700)
})
test('Abo-Prüfung sendet nur Abo-Angaben und den Ort nur bei lokalen Anbietern', () => {
  const data=subscriptionData([entry('Streaming',1000,{note:'privat'}),entry('Studio',3000,{local:true})],'Esslingen','2026-11-26')
  assert.equal('city' in data[0],false)
  assert.equal(data[1].city,'Esslingen')
  assert.equal(JSON.stringify(data).includes('privat'),false)
})
test('Abo-Prüfung entfernt Markdown-Links aus Texten', () => {
  const review=readReview(raw([item('Streaming',{reasoning:'Fair bepreist. [Apple-Tarife](https://www.apple.com/de/icloud/) · [Hinweise](https://support.apple.com/x) Mehr auf https://example.org/a'})]),[entry('Streaming',1000)],'')
  assert.equal(review.items[0].reasoning,'Fair bepreist. Mehr auf')
})
