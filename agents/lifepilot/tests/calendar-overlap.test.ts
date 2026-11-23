import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {berlinInstant} from '../tools/validate.ts'
import {Store} from '../../../hub/runtime/store.ts'
import {seriesFromChat} from '../../../hub/runtime/calendar-series-chat.ts'
import {dateInBerlin,shiftDay} from '../../../hub/runtime/values.ts'
import {calendarLanes} from '../../../hub/ui/calendar-lanes.ts'
import {quickReplyFor} from '../../../hub/ui/chat-quick-replies.ts'

test('quick replies offer two dates for Christmas break and durations only for appropriate questions',()=>{
  assert.deepEqual(quickReplyFor(['Von welchem Datum bis zu welchem Datum dauern die Weihnachtsferien deiner Hochschule?']),{kind:'date-range'})
  assert.deepEqual(quickReplyFor(['Wann beginnen und enden die Weihnachtsferien?']),{kind:'date-range'})
  for(const question of ['Wie viel kostet es?','Wie lange dauert der Urlaub?','Bis zu welchem Datum soll ich die Termine eintragen?',
    'Von wann bis wann dauert jeder Termin?','Um wie viel Personen geht es?']){
    assert.equal(quickReplyFor([question]),undefined,question)
  }
  assert.equal(quickReplyFor(['Wie viele Minuten soll der Block dauern?','An welchem Tag?']),undefined)
  assert.deepEqual(quickReplyFor(['Wie lange soll der Zeitblock dauern?']),{kind:'choices',choices:['30 Minuten','60 Minuten','90 Minuten']})
  assert.deepEqual(quickReplyFor(['Willst du ein bestimmtes Teil anziehen?']),{kind:'choices',choices:['Ja','Nein']})
})

test('daily calendar groups overlapping appointments into separate lanes and permits adjacent ones in a lane',()=>{
  const entry=(id:string,from:string,to:string)=>({id,at:'2027-01-14T'+from+':00Z',endsAt:'2027-01-14T'+to+':00Z'})
  const entries=[entry('B2B','12:15','14:00'),entry('KI','09:45','13:00'),entry('Arbeitsgruppe','13:00','13:30'),entry('Sport','18:00','19:30')]
  const groups=calendarLanes(entries)
  assert.deepEqual(groups.map(group=>group.lanes.map(lane=>lane.map(item=>item.id))),[[['KI','Arbeitsgruppe'],['B2B']],[['Sport']]])
})

test('series approval names new conflicts before writing and asks again when the calendar changes',()=>{
  const store=new Store(':memory:','private')
  try{
    const today=dateInBerlin(), start=shiftDay(today,7), end=shiftDay(start,8)
    const weekday=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][new Date(start).getUTCDay()]
    function draft(title:string,from:string,until:string){
      const input=`Plane die Serie „${title}“ als Vorlesung immer ${weekday} von ${from} bis ${until} Uhr bis ${end}, ab ${start}.`
      const run=store.create(input,'lifepilot',randomUUID(),'ui')
      const next=store.next()
      assert.equal(next?.id,run.id)
      assert.ok(next)
      const parsed=seriesFromChat(next.payload)
      assert.ok(parsed)
      store.finish(next.id,parsed,null,{wallMs:0,model:null,usage:null,cost:null})
      const proposed=store.present(store.run(run.id))
      assert.equal(proposed.state,'review')
      assert.equal(proposed.seriesChange?.blocks.length,2)
      const approval=proposed.approvals.find(item=>item.state==='pending')!
      return {id:run.id,approval:String(approval.id)}
    }
    const ki=draft('KI & Data Science Vorlesung','09:45','13:00')
    const b2b=draft('B2B Marketing and Sales','12:15','14:00')
    assert.equal(store.decide(b2b.id,b2b.approval,'approve','ui').state,'accepted')
    const first=store.decide(ki.id,ki.approval,'approve','ui')
    assert.ok('calendarConfirmation' in first&&first.calendarConfirmation)
    assert.equal(first.state,'review')
    assert.deepEqual(first.calendarConfirmation.conflicts.map(item=>item.title),['B2B Marketing and Sales','B2B Marketing and Sales'])
    assert.equal(store.workspace.schedule().length,2)
    const other=store.workspace.add(null,{kind:'appointment',title:'Sprechstunde',detail:'',date:start},'ui')
    store.workspace.addSchedule(other.id,'slot',berlinInstant(start+'T11:00'),berlinInstant(start+'T11:30'),'ui')
    const again=store.decide(ki.id,ki.approval,'approve','ui',false,first.calendarConfirmation.token)
    assert.ok('calendarConfirmation' in again&&again.calendarConfirmation)
    assert.equal(again.calendarConfirmation.conflicts.length,3)
    assert.ok(again.calendarConfirmation.conflicts.some(item=>item.title==='Sprechstunde'))
    assert.equal(store.workspace.schedule().length,3)
    const result=store.decide(ki.id,ki.approval,'approve','ui',false,again.calendarConfirmation.token)
    assert.equal(result.state,'accepted')
    assert.equal(store.workspace.schedule().length,5)
    assert.throws(()=>store.decide(ki.id,ki.approval,'approve','ui',false,again.calendarConfirmation.token),{status:409})
    assert.equal(store.workspace.schedule().length,5)
  }finally{store.db.close()}
})

test('calendar confirmations handle adjacent intervals and name a Google clash without two writes',()=>{
  const store=new Store(':memory:','private')
  try{
    const at='2027-01-14T08:45:00.000Z', endsAt='2027-01-14T12:00:00.000Z'
    const windows=[{title:'KI',at,endsAt}]
    const later={id:'google',title:'B2B',at:endsAt,endsAt:'2027-01-14T13:00:00.000Z'}
    assert.equal(store.calendarConfirmations.check('first',windows,null,{windows:[later],incomplete:false}),undefined)
    const external={windows:[{...later,at:'2027-01-14T11:15:00.000Z'}],incomplete:false}
    const confirmation=store.calendarConfirmations.check('first',windows,null,external)!
    assert.equal(confirmation.conflicts[0].title,'B2B')
    assert.equal(confirmation.conflicts[0].source,'google')
    assert.equal(store.calendarConfirmations.check('first',windows,confirmation.token,external),undefined)
  }finally{store.db.close()}
})
