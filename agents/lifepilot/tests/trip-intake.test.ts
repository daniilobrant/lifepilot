import {test} from 'node:test'
import assert from 'node:assert/strict'
import {verifyOutput} from '../tools/validate.ts'
import {mergeTripIntake} from '../../../hub/runtime/trip-intake.ts'
import {splitLongInput,boundedDialogue} from '../../../hub/runtime/model-payload.ts'
import {previewTrip} from '../../../hub/runtime/trips.ts'
import type {TripChatPlan} from '../../../hub/runtime/trip-types.ts'

const modelPlan:TripChatPlan={intent:'draft',destination:'Teneriffa',departure:'Baden-Baden',start:'2027-12-10',end:'2027-12-17',
  people:5,maxLeave:null,detail:null,transport:'flight',luggage:'cabin'}
const checked=(plan:TripChatPlan,questions:string[]=[])=>verifyOutput({tasks:[],questions,skill:'travel',skillData:plan},'Plane diese Reise')

test('Detailed diary-style requests produce a valid draft and preserve itinerary requirements for the guide',()=>{
  const text='Zuerst drei Nächte in El Médano.\nDanach vier Nächte in Puerto de la Cruz.\n'+
    'Bitte Tagesausflüge mit Wandern unterbringen, für Regentage etwas in der Stadt, keine langen Fahrten. '.repeat(5)
  const result=checked({...modelPlan,detail:text,stay:'El Médano und Puerto de la Cruz',exclusions:'Keine langen Fahrten'})
  assert.deepEqual(result.questions,[])
  const plan=result.skillData as TripChatPlan
  assert.ok(plan.detail && plan.detail.length<=220)
  assert.ok(plan.brief?.includes('Puerto de la Cruz'))
  const preview=previewTrip({...plan,interests:plan.detail})
  assert.equal(preview.plan.draft.brief,plan.brief)
  assert.equal(preview.plan.draft.stay,'El Médano und Puerto de la Cruz')
})

test('Only missing fields are asked and answering one does not erase the existing plan',()=>{
  const initial={...modelPlan,destination:'Madeira',end:null,luggage:null,brief:'Wanderung am Westküstenabschnitt'}
  assert.deepEqual(checked(initial).questions,['Wann endet die Reise?','Fliegst du mit Rucksack, Handgepäck oder Koffer?'])
  const reply={...modelPlan,destination:null,departure:null,start:null,end:'2027-12-18',people:null,transport:null,luggage:'backpack'} as const
  const merged=mergeTripIntake(initial,reply)
  assert.deepEqual(checked(merged,['Wohin geht es?']).questions,[])
  assert.deepEqual([merged.destination,merged.departure,merged.start,merged.end,merged.people,merged.brief],
    ['Madeira','Baden-Baden','2027-12-10','2027-12-18',5,'Wanderung am Westküstenabschnitt'])
})

test('Long multilingual chat messages can be partitioned without losing any characters and remain available for follow-up',()=>{
  const text='Reise nach Porto. Nächte in São Bento. 🌴\n'.repeat(3750)+'Am Ende Rückfahrt über Braga.'
  const pieces=splitLongInput(text)
  assert.ok(pieces.length>1)
  assert.ok(pieces.every(part=>Buffer.byteLength(part)<=52000))
  assert.equal(pieces.join(''),text)
  assert.deepEqual(boundedDialogue([{input:text,referenceDay:null},{input:'Nur Handgepäck.',referenceDay:null}]).map(message=>message.input),
    [text,'Nur Handgepäck.'])
})
