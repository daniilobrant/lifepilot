import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Store } from '../../../hub/runtime/store.ts'
import { deleteFinance, financeOverview, saveFinance, saveFinanceSettings } from '../../../hub/runtime/finance.ts'
import type { FinanceChat } from '../../../hub/runtime/finance-types.ts'
import { verifyOutput } from '../tools/validate.ts'
import { dateInBerlin } from '../../../hub/runtime/values.ts'

test('Budget uses integer cents, monthly recurrence, effective edits and isolated expenses',()=>{
  const store=new Store(':memory:')
  try {
    saveFinance(store,{kind:'income',title:'Gehalt',cents:240000},'2026-10')
    const fixed=saveFinance(store,{kind:'fixed',title:'Miete',cents:80000},'2026-10')
    saveFinance(store,{kind:'subscription',title:'Abo',cycle:'yearly',cents:10000},'2026-10')
    saveFinance(store,{kind:'expense',title:'Einkauf',date:'2026-11-17',cents:4280},'2026-10')
    const changed=store.transaction(()=>saveFinance(store,{...fixed,cents:85000},'2026-12',fixed))
    assert.equal(financeOverview(store,'2026-11').totals.spending,85114)
    assert.equal(financeOverview(store,'2026-12').totals.spending,85834)
    assert.equal(financeOverview(store,'2026-11').investable,null)
    saveFinanceSettings(store,{buffer:30000,variablePlan:40000,target:15000},0)
    const overview=financeOverview(store,'2026-11','2026-11-22')
    assert.equal(overview.investable,89166)
    assert.equal(overview.perDay,Math.floor((240000-85114)/9))
    assert.throws(()=>saveFinance(store,{...fixed,cents:99000},'2026-12',fixed),{status:409})
    deleteFinance(store,changed.id,changed.revision,'2027-01')
    assert.equal(financeOverview(store,'2026-12').totals.fixed,85000)
    assert.equal(financeOverview(store,'2027-01').totals.fixed,0)
  } finally {store.db.close()}
})

test('Sparplan zählt wie Fixkosten, gilt ab dem Setzmonat und bleibt bei anderen Einstellungen erhalten',()=>{
  const store=new Store(':memory:')
  try {
    const current=dateInBerlin().slice(0,7)
    saveFinance(store,{kind:'income',title:'Gehalt',cents:240000},'2026-01')
    saveFinance(store,{kind:'fixed',title:'Miete',cents:80000},'2026-01')
    saveFinanceSettings(store,{savingsPlan:25000},0)
    const view=financeOverview(store,current)
    assert.equal(view.settings.savingsFrom,current)
    assert.equal(view.totals.savings,25000)
    assert.equal(view.totals.spending,105000)
    assert.equal(view.totals.room,135000)
    assert.equal(financeOverview(store,'2026-01').totals.savings,0)
    saveFinanceSettings(store,{buffer:10000},view.settings.revision)
    assert.equal(financeOverview(store,current).totals.savings,25000)
    const later=financeOverview(store,current).settings
    saveFinanceSettings(store,{savingsPlan:0},later.revision)
    assert.equal(financeOverview(store,current).totals.savings,0)
    assert.throws(()=>saveFinanceSettings(store,{savingsPlan:-5},financeOverview(store,current).settings.revision),{status:400})
  } finally {store.db.close()}
})

test('Finance chat requires intact confirmation and binds edits to the exact record revision',()=>{
  const store=new Store(':memory:','private')
  try {
    const day=dateInBerlin(), month=day.slice(0,7)
    const plan:FinanceChat={financeIntent:'add',kind:'expense',title:'Döner',month,cents:1450,date:day,cycle:null,target:null,category:'Essen & Trinken'}
    const run=store.create('Buche Döner für 14,50 €','lifepilot',randomUUID(),'cli')
    store.next()
    store.finish(run.id,{tasks:[],questions:[],skill:'finance',skillData:plan},null,{wallMs:0,model:null,usage:null,cost:null})
    const before=store.present(store.run(run.id))
    assert.equal(financeOverview(store,month).totals.variable,0)
    const next=store.reviseFinance(run.id,{...before.financeChange!.draft,cents:1470},'ui')
    assert.throws(()=>store.decide(run.id,String(before.approvals.at(-1)?.id),'approve','ui'))
    store.decide(run.id,String(next.approvals.at(-1)?.id),'approve','ui')
    assert.equal(financeOverview(store,month).totals.variable,1470)
    const edit=store.create('Ändere Döner auf 15 Euro','lifepilot',randomUUID(),'cli')
    store.next()
    store.finish(edit.id,{tasks:[],questions:[],skill:'finance',skillData:{...plan,financeIntent:'edit',target:'Döner',cents:1500}},null,{wallMs:0,model:null,usage:null,cost:null})
    const pending=store.present(store.run(edit.id))
    const entry=pending.financeChange!.entry!
    saveFinance(store,{...entry,cents:1600},month,entry)
    assert.throws(()=>store.decide(edit.id,String(pending.approvals.at(-1)?.id),'approve','ui'),{status:409})
    assert.equal(financeOverview(store,month).totals.variable,1600)
  } finally {store.db.close()}
})

test('An incomplete finance proposal stays a question and cannot create a draft',()=>{
  const question='Wie viel hat der Einkauf gekostet?'
  const result=verifyOutput({skill:'finance',tasks:[],actions:[],advice:[],questions:[question],summary:null,correctedInput:null,
    skillData:{financeIntent:'add',month:null,kind:'expense',title:'Einkauf',cents:null,category:null,date:null,cycle:null,target:null}},'Trag den Einkauf ein')
  assert.deepEqual(result.questions,[question])
  assert.equal(result.skillData,null)
})

test('Festes Einkommen bildet die Grundlage, variable Posten erst nach Zuordnung',()=>{
  const store=new Store(':memory:')
  try {
    saveFinance(store,{kind:'income',title:'Gehalt',cents:300000},'2026-10')
    saveFinance(store,{kind:'fixed',title:'Miete',cents:100000},'2026-10')
    saveFinance(store,{kind:'subscription',title:'Streaming',cents:1000},'2026-10')
    saveFinance(store,{kind:'income',title:'Rückzahlung Anna',date:'2026-11-05',cents:2500},'2026-11')
    saveFinance(store,{kind:'expense',title:'Kino',date:'2026-11-06',cents:1500},'2026-11')
    const {totals}=financeOverview(store,'2026-11')
    assert.equal(totals.base,300000)
    assert.equal(totals.room,199000)
    assert.equal(totals.variableIncome,2500)
    assert.equal(totals.balance,199000+2500-1500)
  } finally {store.db.close()}
})
