import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Store} from '../../../hub/runtime/store.ts'
import {applicationOverview} from '../../../hub/runtime/applications.ts'
import type {Result} from '../tools/validate.ts'

const metrics={wallMs:1,model:null,usage:null,cost:null}
function propose(store:Store,input:string,result:Result){
  const run=store.create(input,'lifepilot',randomUUID(),'ui')
  store.next()
  store.finish(run.id,result,null,metrics)
  return store.present(store.run(run.id))
}
const base={tasks:[],questions:[],actions:[],advice:[],correctedInput:null,parts:[]}

test('An order item can be returned from the chat after approval',()=>{
  const store=new Store(':memory:','private')
  try{
    store.db.prepare(`INSERT INTO clothing_orders (id,account,sender,reference,merchant,ordered_on) VALUES ('o1','a','shop.example','777','Beispielshop','2026-11-10')`).run()
    store.db.prepare(`INSERT INTO clothing_order_items (id,order_id,item_key,details,arrived) VALUES ('i1','o1','jeans#1',?,1)`)
      .run(JSON.stringify({name:'Wide Jeans',category:'bottom',isClothing:false,color:'',material:'',fit:'',season:'',tags:'',source:''}))
    const run=propose(store,'Die Wide Jeans schicke ich zurück',{...base,skill:'orders',summary:null,
      skillData:{orderIntent:'decide',order:'o1',item:'i1',decision:'return'}})
    assert.equal(run.state,'review')
    assert.match(run.result!.summary!,/Wide Jeans: zur Rücksendung/u)
    store.decide(run.id,String(run.approvals.at(-1)!.id),'approve','ui')
    assert.equal(store.db.prepare("SELECT decision FROM clothing_order_items WHERE id='i1'").get()!.decision,'return')
  }finally{store.db.close()}
})

test('An application with an interview becomes an application and a calendar appointment',()=>{
  const store=new Store(':memory:','private')
  try{
    const run=propose(store,'Ich habe mich bei Beispiel GmbH als Werkstudent Data beworben, Gespräch am 3.12.2099 um 10 Uhr',{...base,skill:'applications',summary:null,
      skillData:{applicationIntent:'create',application:null,company:'Beispiel GmbH',role:'Werkstudent Data',status:'interview',appliedOn:null,interviewDate:'2099-12-03',interviewTime:'10:00',note:null}})
    assert.equal(run.state,'review')
    store.decide(run.id,String(run.approvals.at(-1)!.id),'approve','ui')
    const saved=applicationOverview(store).items.find(item=>item.company==='Beispiel GmbH')
    assert.equal(saved?.status,'interview')
    const appointment=store.workspace.list().find(task=>task.title==='Vorstellungsgespräch Beispiel GmbH')
    assert.equal(appointment?.due_date,'2099-12-03')
    assert.ok(store.db.prepare("SELECT 1 FROM schedule WHERE task_id=? AND kind='slot'").get(appointment!.id))
  }finally{store.db.close()}
})
