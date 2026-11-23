import { previewTripChange, decideTripChange } from '../../../hub/runtime/trip-chat-change.ts'

import { mapRoute, recommendArrival } from '../../../hub/runtime/trip-routes.ts'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../../../hub/runtime/store.ts'
import { changeTrip, previewTrip, saveTrip, trip, trips, readTripPreview, removeSavedTrip } from '../../../hub/runtime/trips.ts'
import { travelWindows } from '../../../hub/runtime/trip-windows.ts'
import { bookingOutsideTrip, packingCategories, tipTopics } from '../../../hub/runtime/trip-types.ts'
import { verifyOutput } from '../tools/validate.ts'

const draft={destination:'Beispielstadt, Deutschland',departure:'Musterstadt',start:'2027-05-06',end:'2027-05-09',people:2,interests:'Wandern',
  transport:'rail'}
test('Trip draft builds all dates, six preparation topics, seven packing categories and eight tip topics',()=>{
  const result=previewTrip(draft)
  assert.deepEqual(result.plan.days.map(day=>day.date),['2027-05-06','2027-05-07','2027-05-08','2027-05-09'])
  assert.deepEqual(result.plan.checklist.map(item=>item.topic),['entry','accommodation','health','connectivity','banking','insurance'])
  assert.deepEqual(new Set(result.plan.packing.map(item=>item.category)),new Set(packingCategories))
  assert.deepEqual(result.plan.tips.map(item=>item.topic),tipTopics)
  assert.equal('budgetFacts' in result.plan,false)
  assert.equal(result.plan.sources.length,0)
  assert.match(result.plan.packingWeather,/Keine bestätigte/u)
  assert.throws(()=>previewTrip({...draft,transport:'flight'}),/Rucksack/u)
  assert.throws(()=>previewTrip({...draft,end:'2027-08-09'}),{status:400})
})

test('Confirmed trip persists once and stale updates cannot alter the saved version',()=>{
  const directory=mkdtempSync(join(tmpdir(),'trip-test-'))
  const database=join(directory,'hub.sqlite3')
  let store=new Store(database)
  try {
    assert.equal(trips(store).length,0)
    assert.throws(()=>saveTrip(store,randomUUID()),{status:410})
    const preview=previewTrip(draft)
    const saved=saveTrip(store,preview.id)
    assert.equal(saveTrip(store,preview.id).id,saved.id)
    const first=saveTrip(store,preview.id).checklist[0]
    const checked=changeTrip(store,saved.id,1,{kind:'toggle',item:first.id,done:true})
    const activity=checked.days[1].activities[0]
    assert.throws(()=>changeTrip(store,saved.id,1,{kind:'move',item:activity.id,date:'2027-05-08',period:'Abend'}),{status:409})
    const changed=changeTrip(store,saved.id,2,{kind:'move',item:activity.id,date:'2027-05-08',period:'Abend'})
    assert.ok(changed.days[2].activities.some(entry=>entry.id===activity.id&&entry.period==='Abend'))
    assert.ok(changed.checklist[0].done)
    const reservation={kind:'stay',date:draft.start,name:'Fiktives Hotel',time:'15:30',timezone:'Europe/Berlin',reference:'L-1'}
    const booked=changeTrip(store,saved.id,3,{kind:'booking',booking:reservation})
    assert.throws(()=>changeTrip(store,saved.id,4,{kind:'booking',booking:reservation}),{status:409})
    store.db.close()
    store=new Store(database)
    assert.equal(trips(store)[0].revision,4)
    assert.deepEqual(trip(store,saved.id),booked)
    assert.equal(store.db.prepare('select count(*) AS count from trip_revisions').get()?.count,3)
  } finally {store.db.close();rmSync(directory,{recursive:true,force:true})}
})

test('Holiday windows require known work schedules, account for shifts, approved leave and local conflicts',()=>{
  const store=new Store(':memory:')
  try {
    const query={start:draft.start,end:draft.end,state:'BW',maxLeave:1,includeCalendar:true}
    assert.equal(travelWindows(store,query).status,'unknown')
    store.workspace.add(null,{title:'Fiktiver ganztägiger Termin',detail:'',kind:'appointment',date:'2027-05-09'},'Test')
    const result=travelWindows(store,{...query,weekdays:[1,2,3,4,5],shiftWork:['2027-05-06'],approved:['2027-05-07']})
    const [option]=result.options
    assert.deepEqual(option.leave,['2027-05-06'])
    assert.ok(option.holidays.some(day=>day.name==='Christi Himmelfahrt'))
    assert.ok(option.freeReasons.some(day=>day.reason==='Genehmigter Urlaub'))
    assert.ok(!option.conflicts.length)
    const only=travelWindows(store,{...query,start:'2027-05-08',weekdays:[1,2,3,4,5]}).options[0]
    assert.deepEqual(only.conflicts,['2027-05-09'])
    const compatible=travelWindows(store,{...query,weekdays:[1,2,3,4,5],includeCalendar:false},{
      id:randomUUID(),kind:'stay',name:'Fiktives Hotel',date:'2027-05-06',until:'2027-05-09',
      time:'15:00',timezone:'Europe/Berlin',location:'',reference:'',status:'confirmed',
    })
    assert.equal(compatible.stayName,'Fiktives Hotel')
    assert.equal(compatible.options[0].stayMatch,'fits')

  } finally {store.db.close()}
})

test('Travel chat cannot write separate tasks or inject booking IDs',()=>{
  const pick={intent:'draft',destination:'Fiktiver Ort',departure:'Musterstadt',start:'2027-05-06',end:'2027-05-09',
    people:2,detail:'Wandern',transport:'rail',luggage:null,maxLeave:null}
  const out={skill:'travel',skillData:pick,tasks:[],questions:[]}
  assert.deepEqual(verifyOutput(out,'Plane eine Reise').skillData,pick)
  assert.throws(()=>verifyOutput({...out,skillData:{...pick,bookingId:'fake'}},'Plane eine Reise'))
  assert.deepEqual(verifyOutput({...out,skillData:{...pick,start:'2027-05-99'}},'Plane eine Reise').questions,['Wann beginnt die Reise?'])
})

test('Travel routing honors a chosen mode and suggests relevant airport transfers for a long trip',()=>{
  const flight=recommendArrival({departure:'Stuttgart',destination:'Lissabon, Portugal',transport:'open'})
  assert.equal(flight.mode,'flight')
  assert.match(flight.departureAirport ?? '',/STR/u)
  assert.match(flight.arrivalAirport ?? '',/LIS/u)
  assert.equal(recommendArrival({departure:'Stuttgart',destination:'Frankfurt am Main',transport:'open'}).mode,'rail')
  assert.equal(recommendArrival({departure:'Stuttgart',destination:'Lissabon',transport:'rail'}).mode,'rail')
  assert.equal(recommendArrival({departure:'Beispielstadt',destination:'Lissabon',transport:'open'}).departureAirport,undefined)
})

test('Map links are fixed to the selected provider and encode place names only as values',()=>{
  const destination='Museu de Arte & História, Lissabon'
  const google=new URL(mapRoute('google',destination,'Unterkunft','rail'))
  assert.equal(google.hostname,'www.google.com')
  assert.equal(google.searchParams.get('api'),'1')
  assert.equal(google.searchParams.get('destination'),destination)
  assert.equal(google.searchParams.get('travelmode'),'transit')
  const apple=new URL(mapRoute('apple',destination,'Unterkunft','car'))
  assert.equal(apple.hostname,'maps.apple.com')
  assert.equal(apple.pathname,'/directions')
  assert.equal(apple.searchParams.get('source'),'Unterkunft')
  assert.equal(apple.searchParams.get('destination'),destination)
  assert.equal(apple.searchParams.get('mode'),'driving')
})

test('A saved activity place and accommodation address survive targeted edits',()=>{
  const store=new Store(':memory:')
  try {
    const saved=saveTrip(store,previewTrip(draft).id)
    const stay=changeTrip(store,saved.id,1,{kind:'stay',text:'Fiktives Hotel',address:'Musterweg 1'})
    const activity=changeTrip(store,saved.id,2,{kind:'activity',date:draft.start,period:'Vormittag',text:'Museum',place:'Musterplatz'})
    const entry=activity.days[0].activities.find(item=>item.text==='Museum')!
    const moved=changeTrip(store,saved.id,3,{kind:'move',item:entry.id,date:draft.end,period:'Nachmittag'})
    assert.equal(stay.draft.stayAddress,'Musterweg 1')
    assert.equal(moved.days.at(-1)?.activities.find(row=>row.id===entry.id)?.place,'Musterplatz')
    assert.equal('budgetFacts' in moved,false)
  } finally {store.db.close()}
})

test('Saved travel overview shows ongoing through the last day and future, hides completed plans',()=>{
  const store=new Store(':memory:')
  try {
    const past=saveTrip(store,previewTrip({...draft,start:'2027-04-15',end:'2027-04-16'}).id)
    const active=saveTrip(store,previewTrip(draft).id)
    const future=saveTrip(store,previewTrip({...draft,start:'2027-06-05',end:'2027-06-06'}).id)
    assert.deepEqual(trips(store,'2027-05-09').map(entry=>[entry.id,entry.status]),[[active.id,'ongoing'],[future.id,'upcoming']])
    assert.equal(trip(store,past.id).id,past.id)
  } finally {store.db.close()}
})

test('Chat change is read-only until confirmed and bound to the displayed trip revision',()=>{
  const store=new Store(':memory:','private')
  try {
    const saved=saveTrip(store,previewTrip(draft).id)
    changeTrip(store,saved.id,1,{kind:'activity',date:draft.start,period:'Vormittag',text:'Fiktives Museum'})
    function propose() {
      const request=store.create('Verschiebe Fiktives Museum auf 08.05.2027','lifepilot',randomUUID(),'cli')
      store.next()
      store.finish(request.id,{skill:'travel',tasks:[],questions:[],skillData:{
        intent:'change',destination:null,departure:null,start:'2027-05-08',end:null,people:null,maxLeave:null,
        detail:'Fiktives Museum',transport:null,luggage:null,
      }},null,{wallMs:1,model:null,cost:null,usage:null})
      const result=previewTripChange(store,request.id,0,saved.id)
      assert.ok('offer' in result)
      return {id:request.id,offer:result.offer}
    }
    const first=propose()
    assert.equal(trip(store,saved.id).revision,2)
    assert.equal(decideTripChange(store,first.offer.id,false).message,'Die Reise bleibt wie geplant.')
    assert.equal(decideTripChange(store,first.offer.id,true).message,'Die Reise bleibt wie geplant.')
    assert.equal(trip(store,saved.id).revision,2)
    const stale=propose()
    changeTrip(store,saved.id,2,{kind:'stay',text:'Fiktives Hotel',address:'Musterweg'})
    assert.throws(()=>decideTripChange(store,stale.offer.id,true),{status:409})
    const next=propose()
    assert.equal(decideTripChange(store,next.offer.id,true).tripId,saved.id)
    assert.ok(trip(store,saved.id).days[2].activities.some(entry=>entry.text==='Fiktives Museum'))
    assert.equal(trip(store,saved.id).revision,4)
    assert.equal(decideTripChange(store,next.offer.id,true).message,'Tagespunkt verschoben.')
    assert.equal(trip(store,saved.id).revision,4)
  } finally {store.db.close()}
})

test('A durable Tenerife draft produces one inclusive travel block and removal clears every calendar day',()=>{
  const directory=mkdtempSync(join(tmpdir(),'trip-calendar-'))
  const database=join(directory,'hub.sqlite3')
  let store=new Store(database)
  try {
    const preview=previewTrip({...draft,destination:'Teneriffa',start:'2027-12-10',end:'2027-12-17'},undefined,undefined,store)
    store.db.close()
    store=new Store(database)
    assert.equal(readTripPreview(store,preview.id).plan.draft.destination,'Teneriffa')
    const trip=saveTrip(store,preview.id)
    assert.equal(saveTrip(store,preview.id).id,trip.id)
    const week=()=>store.workspace.week('2027-12-09','2027-12-08T23:00:00.000Z','2027-12-19T23:00:00.000Z',11)
    assert.deepEqual(week().entries.map(item=>item.day),['10','11','12','13','14','15','16','17'].map(day=>'2027-12-'+day))
    assert.ok(week().entries.every(item=>item.title==='Teneriffa Urlaub' && item.taskId===trip.id && item.at===null))
    assert.equal(store.workspace.busySpans('2027-12-10T00:00:00.000Z','2027-12-18T00:00:00.000Z').length,1)
    removeSavedTrip(store,trip.id)
    assert.equal(week().entries.length,0)
  } finally {store.db.close();rmSync(directory,{recursive:true,force:true})}
})


test('Changing trip dates moves the day plan, keeps bookings and restores overflow when the stay grows',()=>{
  const store=new Store(':memory:')
  try {
    let saved=saveTrip(store,previewTrip(draft,undefined,undefined,store).id)
    const original=saved.days.map(day=>day.activities[0].id)
    saved=changeTrip(store,saved.id,saved.revision,{kind:'booking',booking:{
      kind:'stay',name:'Beispielhotel',date:draft.start,until:draft.end,
    }})
    const booking=saved.bookings[0]
    saved=changeTrip(store,saved.id,saved.revision,{kind:'dates',start:'2027-06-05',end:'2027-06-06'})
    assert.deepEqual(saved.days.map(day=>day.date),['2027-06-05','2027-06-06'])
    assert.deepEqual(saved.days.map(day=>day.activities[0].id),original.slice(0,2))
    assert.deepEqual(saved.unplacedDays?.map(day=>day.activities[0].id),original.slice(2))
    assert.deepEqual(saved.bookings,[booking])
    assert.equal(bookingOutsideTrip(booking,saved.draft),true)
    saved=changeTrip(store,saved.id,saved.revision,{kind:'dates',start:'2027-06-05',end:'2027-06-08'})
    assert.deepEqual(saved.days.map(day=>day.activities[0].id),original)
    assert.deepEqual(saved.unplacedDays,[])
  } finally {store.db.close()}
})
