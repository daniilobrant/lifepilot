import { test } from 'node:test'
import assert from 'node:assert/strict'
import { previewTrip } from '../../../hub/runtime/trips.ts'
import { applyTripGuide } from '../../../hub/runtime/trip-guide.ts'
import { tipTopics, tripPeriods } from '../../../hub/runtime/trip-types.ts'

const draft={destination:'Lissabon, Portugal',departure:'Stuttgart',start:'2027-05-06',end:'2027-05-08'}
const generate=()=>({
  overview:'Drei Tage mit Belém und Alfama.',
  days:['2027-05-06','2027-05-07','2027-05-08'].map(date=>({date,title:'Unterwegs in Lissabon',
    activities:tripPeriods.map(period=>({period,text:'Am Ufer von Belém spazieren.',place:'Belém, Lissabon'}))})),
  tips:tipTopics.map((topic,i)=>({topic,items:Array.from({length:[3,3,9,5,5,6,3,8][i]},(_,j)=>({
    title:'Eintrag '+j,detail:'Für den Vormittag Zeit einplanen.',translation:null,pronunciation:null,
  }))})),
})
test('Travel guide replaces the suggestion content and preserves the local plan',()=>{
  const base=previewTrip(draft).plan
  const result=applyTripGuide(base,generate())
  assert.equal(result.guide,'generated')
  assert.equal(result.days.length,3)
  assert.equal(result.days[0].activities[0].place,'Belém, Lissabon')
  assert.equal(result.tips.flatMap(tip=>tip.content.sections.flatMap(section=>section.items)).length,42)
  assert.deepEqual(result.checklist,base.checklist)
  assert.deepEqual(result.packing,base.packing)
  assert.deepEqual(result.draft,base.draft)
  assert.deepEqual(result.sources,[])
})
test('Travel guide refuses wrong dates, reordered blocks and incomplete tips',()=>{
  const base=previewTrip(draft).plan
  const invalid=generate()
  invalid.days[0].date='2027-05-05'
  assert.throws(()=>applyTripGuide(base,invalid),{status:422})
  const reversed=generate()
  reversed.days[0].activities.reverse()
  assert.throws(()=>applyTripGuide(base,reversed),{status:422})
  const partial=generate()
  partial.tips[0].items.pop()
  assert.throws(()=>applyTripGuide(base,partial),{status:422})
})
