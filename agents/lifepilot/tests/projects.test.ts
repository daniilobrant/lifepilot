import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Store} from '../../../hub/runtime/store.ts'
import {applyProjectChange,listProjects,prepareProjectChange,projectOverview,projectPlan,projectTiming,timeframe} from '../../../hub/runtime/projects.ts'
import {scanProjectMails,decideProjectMail} from '../../../hub/runtime/project-mail.ts'
import {projectFromChat} from '../../../hub/runtime/project-chat.ts'
import type {MailContent} from '../../../hub/connectors/google.ts'
import type {ProjectStepDraft} from '../../../hub/runtime/project-types.ts'

const step=(title:string,date:string|null,priority:ProjectStepDraft['priority']=null):ProjectStepDraft=>({
  title,date,priority,scheduleMode:date?'deadline':'none',approxLabel:null,completed:false
})
const create=(store:Store)=>applyProjectChange(store,prepareProjectChange(store,projectPlan('create',{
  title:'Bachelorarbeit / Exposé',area:'uni',priority:'high',date:'2026-12-15',scheduleMode:'deadline',
  steps:[step('Literaturverzeichnis','2026-11-30'),step('Gliederung','2026-11-29','low')]
})))

test('projects inherit three priority levels, distinguish checkpoints and sort deadlines',()=>{
  const store=new Store(':memory:','synthetic')
  try{
    const id=create(store)
    const overview=projectOverview(store,undefined,'2026-11-28')
    assert.deepEqual(overview.deadlines.map(row=>[row.title,row.priority]),[['Literaturverzeichnis','high'],['Bachelorarbeit / Exposé','high'],['Gliederung','low']])
    assert.equal(overview.projects[0].timeframe,'checkpoint_soon')
    assert.equal(timeframe(overview.projects[0],'2026-12-02'),'at_risk')
    const project=overview.projects[0]
    const patch=prepareProjectChange(store,projectPlan('update_step',{completed:true}),{id,revision:project.revision,stepId:project.steps[0].id})
    applyProjectChange(store,patch)
    assert.throws(()=>applyProjectChange(store,patch),{status:409})
    assert.equal(projectOverview(store,undefined,'2026-11-28').deadlines.filter(item=>item.projectId===id).length,3)
    assert.deepEqual(projectTiming({scheduleMode:'checkpoint',date:null,approxLabel:'ca. Ende KW 48 / 2026'}),
      {scheduleMode:'checkpoint',date:'2026-11-29',approxLabel:'ca. Ende KW 48 / 2026'})
  }finally{store.db.close()}
})

test('normal Pilot flow saves project changes only after the separate adoption',()=>{
  const store=new Store(':memory:','private')
  try{
    const metrics={wallMs:0,model:null,usage:null,cost:null}
    function propose(input:string){
      const run=store.create(input,'lifepilot',randomUUID(),'ui')
      const next=store.next()
      assert.equal(next?.id,run.id)
      assert.ok(next)
      const result=projectFromChat(store,next.payload)
      assert.ok(result)
      store.finish(next.id,result,null,metrics)
      return store.present(store.run(run.id))
    }
    const proposed=propose('Lege ein Uni-Projekt „Forschungsbericht“ an.')
    assert.ok(proposed.projectChange)
    assert.equal(listProjects(store).length,0)
    store.decide(proposed.id,String(proposed.approvals.find(entry=>entry.action==='adopt')?.id),'approve','ui')
    assert.equal(listProjects(store)[0].title,'Forschungsbericht')
    const edit=propose('Setze die Priorität von Forschungsbericht auf hoch.')
    assert.equal(listProjects(store)[0].priority,'medium')
    store.decide(edit.id,String(edit.approvals.find(entry=>entry.action==='adopt')?.id),'approve','ui')
    assert.equal(listProjects(store)[0].priority,'high')
  }finally{store.db.close()}
})

test('matching a project mail stays pending, is idempotent and can only be approved on the same account',()=>{
  const store=new Store(':memory:','synthetic')
  try{
    const id=create(store)
    const mail:MailContent={id:'mock_message',from:'Lehrkraft <person@example.org>',subject:'Feedback zur Gliederung für die Bachelorarbeit',
      text:'Bitte überarbeite die Gliederung bis 03.12.2026.',at:'2026-11-23T09:00:00Z',dates:[],truncated:false}
    assert.equal(scanProjectMails(store,[mail,mail],'owner','2026-11-23'),1)
    assert.equal(scanProjectMails(store,[{...mail,id:'newsletter',subject:'Newsletter: Bachelorarbeit'}],'owner'),0)
    assert.equal(projectOverview(store,'other').suggestions.length,0)
    const [proposal]=projectOverview(store,'owner').suggestions
    assert.equal(proposal.plan?.projectIntent,'update_step')
    assert.equal(proposal.plan?.date,'2026-12-03')
    assert.equal(listProjects(store)[0].steps[1].date,'2026-11-29')
    assert.throws(()=>decideProjectMail(store,proposal.id,'other',1,true),{status:409})
    decideProjectMail(store,proposal.id,'owner',1,true)
    assert.equal(listProjects(store)[0].id,id)
    assert.equal(listProjects(store)[0].steps[1].date,'2026-12-03')
    assert.equal(projectOverview(store,'owner').projects[0].links[0].id,mail.id)
    assert.equal(projectOverview(store,'other').projects[0].links.length,0)
    assert.equal(scanProjectMails(store,[mail],'owner'),0)
  }finally{store.db.close()}
})

test('step ordering and completing projects preserve data and show only current completed deadlines',()=>{
  const store=new Store(':memory:','synthetic')
  try{
    const id=create(store)
    const [before]=listProjects(store)
    applyProjectChange(store,prepareProjectChange(store,projectPlan('move_step',{position:1}),
      {id,revision:before.revision,stepId:before.steps[1].id}))
    assert.equal(listProjects(store)[0].steps[0].title,'Gliederung')
    applyProjectChange(store,prepareProjectChange(store,projectPlan('complete'),{id,revision:2}))
    assert.equal(projectOverview(store,undefined,'2026-12-20').deadlines.length,0)
    assert.equal(listProjects(store)[0].steps.length,2)
  }finally{store.db.close()}
})
