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
