import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {honorSeriesPeriod,seriesFromChat} from '../../../hub/runtime/calendar-series-chat.ts'
import {prepareSeries} from '../../../hub/runtime/calendar-series.ts'
import {modelDialogue,type ModelPayload} from '../../../hub/runtime/model-payload.ts'
import {Store} from '../../../hub/runtime/store.ts'
import {mergeTripIntake} from '../../../hub/runtime/trip-intake.ts'
import type {SeriesPlan} from '../../../hub/runtime/calendar-series-types.ts'
import type {TripChatPlan} from '../../../hub/runtime/trip-types.ts'
import type {Result} from '../tools/validate.ts'

const day='2026-11-23'
const metrics={wallMs:0,model:null,usage:null,cost:null}
const oldPlan:SeriesPlan={seriesIntent:'create',title:'KI & Data Science Vorlesung',seriesKind:'appointment',weekdays:[4],
  startDate:'2027-01-11',endDate:'2027-01-31',startTime:'09:45',endTime:'13:00',category:'university',excludeHolidays:false,region:null}
const old:Result={skill:'calendar_series',skillData:oldPlan,tasks:[],actions:[],questions:[]}
const dictation='füge eine Serie für meine ki und Data scienece Vorlesungg die jeden Donnerstag stattfindet von 9.45-13 Uhr die Serie soll bis 20.12 laufen'
const payload=(input:string,previousResult=old):ModelPayload=>({day,timeZone:'Europe/Berlin',
  messages:[{input,referenceDay:day,previousResult}],memory:[],context:[]})
function series(result?:Result){
  const plan=result?.skillData
  assert.ok(plan&&'seriesIntent' in plan)
  return plan
}

test('dictated lecture corrects the stale January series and proposes the four requested Thursdays',()=>{
  const parsed=seriesFromChat(payload(dictation))
  const plan=series(parsed)
  assert.deepEqual(parsed?.questions,[])
  assert.equal(plan.title,'KI & Data Science Vorlesung')
  assert.equal(plan.startDate,day)
  assert.equal(plan.endDate,'2026-12-20')
  assert.equal(plan.startTime,'09:45')
  assert.equal(plan.endTime,'13:00')
  const store=new Store(':memory:','private')
  try{
    assert.deepEqual(prepareSeries(store,plan,day,new Date(day+'T14:00Z')).blocks.map(entry=>entry.date),
      ['2026-11-26','2026-12-03','2026-12-10','2026-12-17'])
  }finally{store.db.close()}
})

test('relative restart, holiday corrections and date-only answers use the latest message without borrowing an unrelated series',()=>{
  assert.equal(series(seriesFromChat(payload('Die kommenden Donnerstage bis Weihnachten'))).endDate,'2026-12-24')
  assert.equal(series(seriesFromChat(payload('Nein, vor Weihnachten soll es stattfinden.'))).endDate,'2026-12-23')
  assert.equal(series(seriesFromChat(payload('20.12'))).endDate,'2026-12-20')
  assert.equal(series(seriesFromChat(payload('Bis 20.12 statt bis 31.01'))).endDate,'2026-12-20')
  assert.ok(seriesFromChat(payload('Nur bis 34.12.'))?.questions.length)
  assert.ok(seriesFromChat(payload('Nur bis Fasching.'))?.questions.length)
  assert.equal(seriesFromChat(payload('Füge bitte Freitag Milch zur Einkaufsliste hinzu.')),undefined)
  const newSeries=seriesFromChat(payload('Erstelle eine neue Serie für mein Statistik Seminar jeden Freitag von 10 bis 12 Uhr.'))
  assert.ok(newSeries?.questions.length)
  assert.notEqual(series(newSeries).endDate,oldPlan.endDate)
  assert.equal(seriesFromChat(payload('21.12-10.01',{...old,questions:['Wann sind die Weihnachtsferien?']})),undefined)
  const earlier=payload('an allen kommenden')
  earlier.messages.unshift({input:'Nein, nur vor Weihnachten.',referenceDay:day})
  assert.equal(series(seriesFromChat(earlier)).endDate,'2026-12-23')
})

test('model fallback cannot submit January bounds when the newest series request explicitly says 20 December',()=>{
  const corrected=honorSeriesPeriod(old,payload(dictation))
  assert.equal(series(corrected).endDate,'2026-12-20')
  assert.equal(series(corrected).startDate,day)
  assert.ok(honorSeriesPeriod(old,payload('Bis zum 31.02.2027')).questions.length)
  assert.equal(honorSeriesPeriod(old,payload('Wie heißt die Vorlesung?')),old)
})

test('analysis and adoption honor the latest follow-up date and revoke the superseded draft',()=>{
  const store=new Store(':memory:','private')
  try{
    const run=store.create('Alte Angaben für die Kalenderserie','lifepilot',randomUUID(),'ui')
    store.next()
    store.finish(run.id,old,null,metrics)
    const earlier=store.present(store.run(run.id))
    const oldApproval=String(earlier.approvals.find(entry=>entry.action==='adopt')?.id)
    store.db.prepare('UPDATE runs SET reference_day=? WHERE id=?').run('2026-11-01',run.id)
    store.followup(run.id,dictation,randomUUID(),0,'ui',false)
    const next=store.next()
    assert.ok(next)
    assert.equal(next.payload.day,next.payload.messages.at(-1)?.referenceDay)
    assert.notEqual(next.payload.day,'2026-11-01')
    const result=seriesFromChat(next.payload)
    assert.ok(result)
    store.finish(run.id,result,null,metrics)
    assert.throws(()=>store.decide(run.id,oldApproval,'approve','ui'),{status:404})
    assert.equal(store.workspace.schedule().length,0)
    assert.equal(store.present(store.run(run.id)).seriesChange?.definition.endDate,'2026-12-20')
  }finally{store.db.close()}
})

test('shared model context separates the last instruction from previous drafts without duplicating long text',()=>{
  const context=modelDialogue({...payload(dictation),messages:[{input:'Voriger Auftrag',referenceDay:day},...payload(dictation).messages]})
  assert.equal(context.latestUserMessage?.input,dictation)
  assert.equal(context.messages[0].input,'Voriger Auftrag')
  assert.equal(context.messages.at(-1)?.input,undefined)
  assert.equal(context.messages.at(-1)?.earlierAssistantDraft,old)
})

test('an explicit itinerary correction replaces contradictory old free text',()=>{
  const trip={intent:'draft',destination:'Teneriffa',departure:'Baden-Baden',start:'2026-12-10',end:'2026-12-17',
    brief:'Abflug am 10. Dezember. Zwei Tage im Süden.',detail:null} as TripChatPlan
  const change={...trip,start:'2026-12-12',brief:'Abflug ist jetzt am 12. Dezember.'} as TripChatPlan
  const next=mergeTripIntake(trip,change,'Abflug am 12. statt am 10. Dezember.')
  assert.equal(next.start,'2026-12-12')
  assert.ok(!next.brief?.includes('10. Dezember'))
  assert.equal(next.departure,'Baden-Baden')
})
