import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Store} from '../../../hub/runtime/store.ts'
import {agentDirectory,similarWord,titleMatch} from '../../../hub/runtime/agent-directory.ts'

test('Dictation and typing errors still find the meant entry',()=>{
  assert.ok(similarWord('b2b','b2bar'))
  assert.ok(similarWord('praesentation','prasentation'))
  assert.ok(titleMatch('morgen in meiner Kai und Data Science Vorlesung','KI & Data Science Vorlesung')>=0.5)
  assert.ok(titleMatch('in der B2Bar. Marketing und Sales Vorlesung','B2B Marketing and Sales Vorlesung')>=0.5)
  assert.ok(titleMatch('Literatur für die Bachelorarbeit','Bachelorarbeit · Testdurchgang')>=0.5)
  assert.equal(titleMatch('Wäsche waschen','KI & Data Science Vorlesung'),0)
})

test('The directory lists every area compactly and adds details only for matching entries',()=>{
  const store=new Store(':memory:','private')
  try{
    const ws=store.workspace
    const lecture=ws.add(null,{title:'KI & Data Science Vorlesung',detail:'',date:'2099-11-26',kind:'appointment'},'test')
    ws.addSchedule(lecture.id,'slot','2099-11-26T08:45:00.000Z','2099-11-26T12:00:00.000Z','test')
    ws.add(null,{title:'Steuererklärung abgeben',detail:'',date:'2099-12-01',kind:'task'},'test')
    const directory=agentDirectory(store,'Ich muss in Kai und Data Science das Projekt vorstellen','2099-11-25')
    assert.ok(directory.termine.some(line=>line.includes('KI & Data Science Vorlesung')&&line.includes('09:45')))
    assert.ok(directory.aufgaben.some(line=>line.includes('Steuererklärung')))
    assert.deepEqual(directory.treffer.map(item=>item.id),[lecture.id])
    assert.ok(Buffer.byteLength(JSON.stringify(directory))<20000)
    assert.ok(!JSON.stringify(directory).includes('cents'))
  }finally{store.db.close()}
})

test('A new task with link belongs to that appointment and is reminded at its start',()=>{
  const store=new Store(':memory:','private')
  try{
    const ws=store.workspace
    const lecture=ws.add(null,{title:'Statistik Übung',detail:'',date:'2099-11-26',kind:'appointment'},'test')
    ws.addSchedule(lecture.id,'slot','2099-11-26T13:00:00.000Z','2099-11-26T14:30:00.000Z','test')
    const task=ws.add(null,{title:'Blatt 5 abgeben',detail:'',date:'2099-11-26',kind:'task',link:lecture.id},'test')
    assert.equal(task.related_id,lecture.id)
    assert.ok(store.db.prepare("SELECT 1 FROM schedule WHERE task_id=? AND kind='reminder' AND at='2099-11-26T13:00:00.000Z'").get(task.id))
  }finally{store.db.close()}
})
