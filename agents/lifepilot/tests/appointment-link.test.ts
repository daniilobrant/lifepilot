import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Store} from '../../../hub/runtime/store.ts'
import {appointmentWords} from '../../../hub/runtime/workspace.ts'

test('A deadline naming a lecture on the same day is linked to it and reminded at its start',()=>{
  assert.ok(appointmentWords('KI & Data Science Vorlesung').has('data'))
  const store=new Store(':memory:')
  try{
    const ws=store.workspace
    const day='2099-11-26'
    const b2b=ws.add(null,{title:'B2B Marketing and Sales Vorlesung',detail:'',date:day,kind:'appointment'},'test')
    const ki=ws.add(null,{title:'KI & Data Science Vorlesung',detail:'',date:day,kind:'appointment'},'test')
    ws.addSchedule(b2b.id,'slot','2099-11-26T11:15:00.000Z','2099-11-26T14:30:00.000Z','test')
    ws.addSchedule(ki.id,'slot','2099-11-26T08:45:00.000Z','2099-11-26T12:00:00.000Z','test',true)
    const talk=ws.add(null,{title:'Präsentation in B2Bar. Marketing und Sales halten',detail:'',date:day,kind:'task'},'test')
    assert.equal(talk.related_id,b2b.id)
    const pilot=ws.add(null,{title:'Projekt „Live Pilot“ in KI und Data Science vorstellen',detail:'',date:day,kind:'task'},'test')
    assert.equal(pilot.related_id,ki.id)
    const other=ws.add(null,{title:'Wäsche waschen',detail:'',date:day,kind:'task'},'test')
    assert.equal(other.related_id,null)
  }finally{store.db.close()}
})

test('A deadline with a timed reminder on its day appears once in the calendar week',()=>{
  const store=new Store(':memory:')
  try{
    const ws=store.workspace
    const lecture=ws.add(null,{title:'Statistik Übung',detail:'',date:'2099-11-26',kind:'appointment'},'test')
    ws.addSchedule(lecture.id,'slot','2099-11-26T13:00:00.000Z','2099-11-26T14:30:00.000Z','test')
    const talk=ws.add(null,{title:'Referat in Statistik halten',detail:'',date:'2099-11-26',kind:'task',link:lecture.id},'test')
    const week=ws.week('2099-11-23','2099-11-23T00:00:00.000Z','2099-11-30T00:00:00.000Z')
    assert.equal(week.entries.filter(entry=>entry.taskId===talk.id).length,1)
    assert.equal(week.entries.find(entry=>entry.taskId===talk.id)!.kind,'reminder')
  }finally{store.db.close()}
})
