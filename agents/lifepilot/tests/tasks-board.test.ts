import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Store} from '../../../hub/runtime/store.ts'
import {applyProjectChange,listProjects,prepareProjectChange,prepareProjectEditor,projectPlan} from '../../../hub/runtime/projects.ts'
import {changeBoardSource,taskBoard} from '../../../hub/runtime/tasks-board.ts'
import {taskBoardFromChat} from '../../../hub/runtime/tasks-board-chat.ts'
import {projectFromChat} from '../../../hub/runtime/project-chat.ts'
import {saveFinance} from '../../../hub/runtime/finance.ts'
import {saveApplication} from '../../../hub/runtime/applications.ts'

const today='2026-11-23'
const metrics={wallMs:0,model:null,usage:null,cost:null}
test('board checklist keeps its source ID as it is edited, checked, archived and restored',()=>{
  const store=new Store(':memory:','private')
  try{
    const id=applyProjectChange(store,prepareProjectEditor(store,{projectIntent:'create',title:'Bachelorarbeit',area:'uni'},
      [{title:'Exposé',scheduleMode:'deadline',date:'2026-11-26'},{title:'Quellen',scheduleMode:'none'}]))
    const original=listProjects(store)[0],step=original.steps[0]
    const first=taskBoard(store,today)[0]
    assert.equal(first.source_ref,'project:'+id+':'+step.id)
    assert.equal(first.area,'uni')
    const reverse=[{id:original.steps[1].id,title:'Quellen'},{id:step.id,title:'Exposé überarbeiten',date:'2026-11-26',completed:true}]
    applyProjectChange(store,prepareProjectEditor(store,{projectIntent:'update'},reverse,{id,revision:original.revision}))
    assert.equal(taskBoard(store,today)[0].source_ref,first.source_ref)
    assert.equal(taskBoard(store,today)[0].completed,true)
    assert.equal(taskBoard(store,'2026-11-27').length,0)
    assert.throws(()=>prepareProjectChange(store,projectPlan('delete'),{id,revision:2}),{status:409})
    applyProjectChange(store,prepareProjectChange(store,projectPlan('complete'),{id,revision:2}))
    assert.equal(listProjects(store)[0].status,'archived')
    assert.ok(listProjects(store)[0].archived_at)
    assert.equal(taskBoard(store,today).length,0)
    const restore=projectFromChat(store,{day:today,timeZone:'Europe/Berlin',
      messages:[{input:'Stelle das Projekt „Bachelorarbeit“ wieder her.',referenceDay:today}],memory:[],context:[]})?.skillData
    assert.ok(restore&&'projectIntent' in restore)
    applyProjectChange(store,prepareProjectChange(store,restore))
    assert.equal(listProjects(store)[0].status,'active')
    assert.equal(taskBoard(store,today)[0].source_ref,first.source_ref)
  }finally{store.db.close()}
})

test('board bridges confirmed subscription and application dates without duplicate rows',()=>{
  const store=new Store(':memory:','private')
  try{
    saveFinance(store,{kind:'subscription',title:'Fitness',cents:1000,renewal:'2026-12-10',noticeDays:10},'2026-11')
    saveApplication(store,{company:'Beispielfirma',role:'Werkstudent',location:'Esslingen',status:'applied',follow_up:'2026-11-30'})
    const rows=taskBoard(store,today)
    assert.equal(rows.length,2)
    assert.equal(new Set(rows.map(item=>item.source_ref)).size,2)
    assert.ok(rows.some(item=>item.area==='privat'&&item.source_type==='finance'&&item.due_date==='2026-11-30'))
    const application=rows.find(item=>item.source_type==='application')!
    changeBoardSource(store,application.source_ref,0,{completed:true})
    assert.equal(taskBoard(store,today).find(item=>item.source_ref===application.source_ref)?.completed,true)
    assert.throws(()=>changeBoardSource(store,application.source_ref,0,{completed:false}),{status:409})
    assert.equal(taskBoard(store,'2026-12-01').length,1)
  }finally{store.db.close()}
})

test('Pilot proposes a board deadline and saves its scope and priority only after approval',()=>{
  const store=new Store(':memory:','private')
  try{
    const input='Erstelle unter Uni eine Frist für die B2B-Fallstudie am 3. Dezember mit hoher Priorität'
    const run=store.create(input,'lifepilot',randomUUID(),'ui')
    const next=store.next()!
    const draft=taskBoardFromChat(next.payload)
    assert.ok(draft)
    store.finish(run.id,draft,null,metrics)
    assert.equal(taskBoard(store,today).length,0)
    const review=store.present(store.run(run.id))
    store.decide(run.id,String(review.approvals.find(item=>item.action==='adopt')?.id),'approve','ui')
    const task=taskBoard(store,today)[0]
    assert.equal(task.area,'uni')
    assert.equal(task.priority,'high')
    assert.equal(task.kind,'deadline')
    assert.equal(task.due_date?.slice(5),'12-03')
  }finally{store.db.close()}
})
