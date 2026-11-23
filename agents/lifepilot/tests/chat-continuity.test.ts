import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Store } from '../../../hub/runtime/store.ts'
import { boundedDialogue } from '../../../hub/runtime/model-payload.ts'
import { financeOverview, saveFinance } from '../../../hub/runtime/finance.ts'
import { dateInBerlin } from '../../../hub/runtime/values.ts'
import type { FinanceChat } from '../../../hub/runtime/finance-types.ts'
import type { Result } from '../tools/validate.ts'

const metrics={wallMs:0,model:null,usage:null,cost:null}
const finance=(title:string,kind:FinanceChat['kind'],cents:number):FinanceChat=>({
  financeIntent:'add',month:null,kind,title,cents,category:null,date:null,cycle:'monthly',target:null,
})

test('One approved multi-finance draft saves distinct positions and lets Pilot continue without repeating them',()=>{
  const store=new Store(':memory:','private')
  try {
    const month=dateInBerlin().slice(0,7)
    saveFinance(store,{kind:'income',title:'Gehalt',cents:240000},month)
    const input='Gehalt 2400 Euro und Fixkosten Miete 700, Versicherung 125 und gestern 12 Euro im Supermarkt.'
    const run=store.create(input,'lifepilot',randomUUID(),'ui')
    store.next()
    store.finish(run.id,{tasks:[],questions:[],skill:'finance',skillData:{financeBatch:[
      finance('Gehalt','income',240000),finance('Miete','fixed',70000),finance('Versicherung','fixed',12500),finance('Supermarkt','expense',1200),
    ]}},null,metrics)
    const proposal=store.present(store.run(run.id))
    assert.equal(proposal.financeChanges.length,3)
    const revised=store.reviseFinance(run.id,{...proposal.financeChanges[1].draft,cents:12600},'ui',1)
    assert.throws(()=>store.decide(run.id,proposal.approvals.at(-1)!.id as string,'approve','ui'))
    store.decide(run.id,revised.approvals.at(-1)!.id as string,'approve','ui')
    assert.deepEqual(financeOverview(store,month).totals.fixed,82600)
    assert.equal(financeOverview(store,month).totals.income,240000)
    assert.equal(financeOverview(store,month).totals.variable,1200)
    const next=store.create('Wie viel geht davon monatlich für Fixkosten weg?','lifepilot',randomUUID(),'ui',false,undefined,false,run.id)
    const payload=store.next()?.payload
    assert.equal(next.previous_run,run.id)
    assert.equal(payload?.messages[0].input,input)
    assert.equal(payload?.messages[0].outcome?.state,'accepted')
    assert.ok(!JSON.stringify(payload).includes('12600'))
    assert.equal(financeOverview(store,month).entries.length,4)
  } finally {store.db.close()}
})

test('Mixed skills remain individually confirmable and conversations remain open after a day',()=>{
  const store=new Store(':memory:','private')
  try {
    const input='Setz Petersilie auf die Liste und leg eine Aufgabe fürs Uni-Seminar an.'
    const run=store.create(input,'lifepilot',randomUUID(),'ui')
    store.next()
    const parts:Result[]=[
      {tasks:[],questions:[],skill:'grocery',skillData:{groceryIntent:'shop_add',title:null,items:[{name:'Petersilie',quantity:null,status:null}],steps:[],totalCents:null}},
      {tasks:[{title:'Seminar vorbereiten',doneWhen:'Material ist gesammelt.',evidence:'Aufgabe fürs Uni-Seminar',kind:'task',date:null,category:'university'}],questions:[]},
    ]
    store.finish(run.id,{tasks:[],questions:[],parts},null,metrics)
    const children=store.list().filter(child=>child.parent_run===run.id)
    assert.equal(children.length,2)
    for(const child of children)store.decide(child.id,child.approvals.at(-1)!.id as string,'approve','ui')
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM tasks').get()?.n,1)
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM grocery_shopping').get()?.n,1)
    store.db.prepare('UPDATE runs SET updated_at=? WHERE id=?').run(new Date(Date.now()-24*60*60_000).toISOString(),run.id)
    assert.equal(store.create('Wie war es?','lifepilot',randomUUID(),'ui',false,undefined,false,run.id).previous_run,run.id)
    assert.equal(boundedDialogue(Array.from({length:70},(_,i)=>({input:'Nachricht '+i,referenceDay:null}))).length,24)
  } finally {store.db.close()}
})
