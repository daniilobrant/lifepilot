import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Store} from '../../../hub/runtime/store.ts'
import {projectFromChat} from '../../../hub/runtime/project-chat.ts'
import {applyProjectChange,listProjects,manualProjectPlan,prepareProjectChange,projectPlan} from '../../../hub/runtime/projects.ts'
import {briefingClock,calendarWeek,visibleOnStart} from '../../../hub/ui/home-briefing.ts'
import {verifyOutput} from '../tools/validate.ts'

test('dictated bachelor thesis dialogue builds one runnable project proposal, with interview phases and approximate dates',()=>{
  const store=new Store(':memory:','private')
  try{
    const inputs=['Lege mir ein Projekt an Bachelorarbeit mit Fristen Anmeldung Anfang Dezember Abgabe, Ende Februar und Teilschritte.',
      'KI Integration im Supply Chain Management. Einen Prozess eingrenzen und qualitative Experten-Interviews durchführen.',
      'lege Projekt abchelorarbeit an mit thema ki Integration in supply chain']
    const dialogue={day:'2026-11-23',timeZone:'Europe/Berlin' as const,messages:inputs.map(input=>({input,referenceDay:'2026-11-23'})),memory:[],context:[]}
    const result=projectFromChat(store,dialogue)
    assert.ok(result)
    const plan=verifyOutput(result,inputs).skillData
    assert.ok(plan&&'projectIntent' in plan)
    assert.equal(plan.date,'2027-02-28')
    assert.ok(plan.steps.some(item=>item.phase==='Interviews'))
    assert.ok(plan.steps.every(item=>!item.completed))
    assert.equal(projectFromChat(store,{...dialogue,messages:[{input:'Lege einen Termin für meine Bachelorarbeit an.',referenceDay:dialogue.day}]}),undefined)
    assert.equal(listProjects(store).length,0)
    const run=store.create(inputs.at(-1)!,'lifepilot',randomUUID(),'ui')
    assert.equal(store.next()?.id,run.id)
    store.finish(run.id,result,null,{wallMs:0,model:null,usage:null,cost:null})
    const review=store.present(store.run(run.id))
    assert.equal(review.state,'review')
    assert.ok(review.projectChange?.data.steps.some(item=>item.startDate))
    assert.equal(listProjects(store).length,0)
    store.decide(run.id,String(review.approvals.find(item=>item.action==='adopt')!.id),'approve','ui')
    assert.equal(listProjects(store)[0].title,'Bachelorarbeit')
  }finally{store.db.close()}
})

test('bulk checklist supports phases and notes, with reversible task assignment and preserved dated completions',()=>{
  const store=new Store(':memory:')
  try{
    const change=prepareProjectChange(store,manualProjectPlan({projectIntent:'create',title:'Projekt',area:'uni',
      steps:[{title:'Recherche',phase:'Start',notes:'Erste Quellen',startDate:'2026-11-23',date:'2026-12-01',completed:true}]}))
    const projectId=applyProjectChange(store,change)
    assert.equal(listProjects(store)[0].steps[0].notes,'Erste Quellen')
    const task=store.workspace.add(null,{kind:'task',title:'Extratermin',date:'2026-11-27',detail:'',projectId},'ui')
    assert.equal(task.project_id,projectId)
    assert.equal(store.workspace.update(task.id,task.revision,{project_id:null},'ui').project_id,null)
    assert.throws(()=>store.workspace.add(null,{kind:'task',title:'Falscher Bezug',date:null,detail:'',projectId:randomUUID()},'ui'),{status:400})
    const linked=store.workspace.add(null,{kind:'task',title:'Zweite Aufgabe',date:'2026-11-27',detail:'',projectId},'ui')
    applyProjectChange(store,prepareProjectChange(store,projectPlan('complete'),{id:projectId,revision:1}))
    applyProjectChange(store,prepareProjectChange(store,projectPlan('delete'),{id:projectId,revision:2}))
    assert.equal(store.workspace.get(linked.id).project_id,null)
    const checked={...task,status:'done' as const,completed_at:'2026-11-23T09:00:00Z'}
    assert.equal(visibleOnStart(checked,'2026-11-27'),true)
    assert.equal(visibleOnStart(checked,'2026-11-28'),false)
    assert.equal(visibleOnStart({...checked,due_date:null},'2026-11-24'),false)
  }finally{store.db.close()}
})

test('briefing switches at Berlin-local 11:31, 17:31 and 18:00 with ISO week numbering',()=>{
  const at=(time:string)=>briefingClock(new Date('2026-11-23T'+time+'Z'))
  assert.equal(at('10:30').greeting,'Guten Morgen')
  assert.equal(at('10:31').greeting,'Guten Mittag')
  assert.equal(at('16:30').greeting,'Guten Mittag')
  assert.equal(at('16:31').greeting,'Guten Abend')
  assert.equal(at('16:59').evening,false)
  assert.equal(at('17:00').evening,true)
  assert.equal(calendarWeek('2027-01-03'),53)
  assert.equal(calendarWeek('2027-01-04'),1)
})
