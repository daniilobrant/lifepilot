import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Store} from '../../../hub/runtime/store.ts'
import {adoptSeries,extendReminders,prepareSeries} from '../../../hub/runtime/calendar-series.ts'
import {seriesFromChat} from '../../../hub/runtime/calendar-series-chat.ts'
import {dateInBerlin,shiftDay} from '../../../hub/runtime/values.ts'
import {savePersonalProfile} from '../../../hub/runtime/personal-profile.ts'
import type {SeriesPlan} from '../../../hub/runtime/calendar-series-types.ts'

const metrics={wallMs:0,model:null,usage:null,cost:null}
const example='Ich arbeite als Werkstudent immer Montag und Freitag von 8 bis 16 Uhr. Der Vertrag läuft bis zum letzten Tag im März. Lass gesetzliche Feiertage aus.'
const parse=(input:string,day:string)=>{
  const result=seriesFromChat({day, timeZone:'Europe/Berlin', messages:[{input,referenceDay:day}], memory:[],context:[]})
  const plan=result?.skillData
  assert.ok(plan&&'seriesIntent' in plan)
  return plan
}
test('German Pilot phrasing resolves the contract end and marks the actual Baden-Württemberg holidays',()=>{
  const plan=parse(example,'2026-11-23')
  assert.deepEqual(plan.weekdays,[1,5])
  assert.equal(plan.endDate,'2027-03-31')
  assert.equal(plan.startTime,'08:00')
  assert.equal(plan.endTime,'16:00')
  const store=new Store(':memory:','synthetic')
  try{
    savePersonalProfile(store,{location:'Esslingen am Neckar'},0)
    const series=prepareSeries(store,plan,'2026-11-23',new Date('2026-11-23T06:00:00Z'))
    assert.equal(series.definition.region,'BW')
    assert.deepEqual(series.skipped.map(item=>item.date),['2026-12-25','2027-01-01','2027-03-26','2027-03-29'])
    assert.ok(series.blocks.some(item=>item.date==='2027-03-22'&&item.at.endsWith('07:00:00.000Z')))
    assert.ok(series.blocks.every(item=>item.end&&Date.parse(item.end)-Date.parse(item.at)===8*3600_000))
    assert.ok(!series.blocks.some(item=>item.date==='2027-03-31'))
  }finally{store.db.close()}
})

test('normal Pilot approval creates a series and another approval removes it, while retries leave no copies',()=>{
  const store=new Store(':memory:','private')
  try{
    const today=dateInBerlin(), until=shiftDay(today,35)
    savePersonalProfile(store,{location:'Esslingen am Neckar'},0)
    function chat(input:string){
      const run=store.create(input,'lifepilot',randomUUID(),'ui')
      const next=store.next()
      assert.equal(next?.id,run.id)
      assert.ok(next)
      const parsed=seriesFromChat(next.payload)
      assert.ok(parsed)
      store.finish(next.id,parsed,null,metrics)
      return store.present(store.run(run.id))
    }
    const created=chat('Plane die Serie „Werkstudent“ immer Montag und Freitag von acht bis sechzehn Uhr bis '+until+'.')
    assert.ok(created.seriesChange)
    const adopt=created.approvals.find(item=>item.state==='pending')!
    assert.equal(store.workspace.list().length,0)
    store.decide(created.id,String(adopt.id),'approve','ui')
    assert.equal(store.workspace.list().length,1)
    assert.throws(()=>store.decide(created.id,String(adopt.id),'approve','ui'),{status:409})
    const removed=chat('Lösche die Serie „Werkstudent“.')
    assert.equal(removed.seriesChange?.operation,'delete')
    assert.ok(removed.seriesChange?.existing?.count)
    const approval=removed.approvals.find(item=>item.state==='pending')!
    assert.equal(store.workspace.list().length,1)
    store.decide(removed.id,String(approval.id),'approve','ui')
    assert.equal(store.workspace.list().length,0)
  }finally{store.db.close()}
})

test('unbounded reminders roll forward and a dismissed occurrence is not recreated',()=>{
  const store=new Store(':memory:','synthetic')
  try{
    const today=dateInBerlin(), start=shiftDay(today,2)
    const plan:SeriesPlan={seriesIntent:'create',title:'Wochenerinnerung',seriesKind:'reminder',weekdays:[new Date(start).getUTCDay()],
      startDate:start,endDate:null,startTime:'10:00',endTime:null,category:'leisure',excludeHolidays:false,region:null}
    const preview=prepareSeries(store,plan,today)
    const run=store.create('Testserie','lifepilot',randomUUID(),'ui',true)
    store.transaction(()=>adoptSeries(store,run.id,preview,'ui'))
    const first=store.workspace.schedule()[0]
    store.workspace.dismiss(first.id,'ui')
    extendReminders(store,new Date(shiftDay(today,14)+'T08:00:00Z'))
    extendReminders(store,new Date(shiftDay(today,14)+'T08:00:00Z'))
    const dates=store.db.prepare("SELECT at,state FROM schedule ORDER BY at").all()
    assert.equal(dates[0].state,'dismissed')
    assert.equal(new Set(dates.map(item=>item.at)).size,dates.length)
    assert.ok(dates.length>preview.blocks.length)
  }finally{store.db.close()}
})

test('private task context requires separate analysis consent and a revision-bound edit confirmation',()=>{
  const store=new Store(':memory:','private')
  try{
    const task=store.workspace.add(null,{title:'Monatsbericht',detail:'persönlicher Detailtext',date:null,kind:'task'},'ui')
    const run=store.create('Ändere die Priorität von Monatsbericht auf hoch','lifepilot',randomUUID(),'ui')
    assert.equal(run.state,'permission')
    const model=run.approvals.find(item=>item.action==='model')!
    assert.equal(store.previewModel(run.id,String(model.id)).payload.context[0].detail,'')
    store.decide(run.id,String(model.id),'approve','ui')
    assert.equal(store.next()?.id,run.id)
    store.finish(run.id,{tasks:[],questions:[],actions:[{kind:'priority',target:task.id,value:'high',duration:null,reason:'Im Chat gewünscht.'}]},null,metrics)
    const review=store.present(store.run(run.id))
    assert.equal(store.workspace.get(task.id).priority,'normal')
    store.decide(run.id,String(review.approvals.find(item=>item.action==='adopt')?.id),'approve','ui')
    assert.equal(store.workspace.get(task.id).priority,'high')
  }finally{store.db.close()}
})
