import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {check,units} from '../evals/run.ts'
import {analyseMessage} from '../../../hub/runtime/message-analysis.ts'

const suite=JSON.parse(readFileSync(new URL('../evals/chat-cases.json',import.meta.url),'utf8'))
const base={tasks:[],questions:[],actions:[],advice:[],summary:null,correctedInput:null,skill:null,skillData:null,parts:[]}

test('The evaluation set covers every skill, combinations and dictation errors',()=>{
  assert.ok(suite.cases.length>=45)
  assert.equal(new Set(suite.cases.map((item:{id:string})=>item.id)).size,suite.cases.length)
  const wanted=suite.cases.flatMap((item:{expect:{units?:string[],anyOf?:string[][]}})=>[...item.expect.units??[],...(item.expect.anyOf??[]).flat()])
  for(const skill of ['aufgabe','termin','calendar_series','smart_planning','projects','grocery','finance','orders','applications','outfit','travel','inbox_refresh','antwort'])
    assert.ok(wanted.includes(skill),skill)
  assert.ok(suite.cases.filter((item:{id:string})=>item.id.startsWith('kombi')).length>=6)
})

test('Results are scored per unit, date, link and answer',()=>{
  const result={...base,parts:[
    {...base,tasks:[{title:'Präsentation in B2B Marketing and Sales halten',doneWhen:'',evidence:'x',kind:'task' as const,date:'2026-11-26',link:'aaaaaaaa-0000-4000-8000-000000000002'}]},
    {...base,skill:'grocery' as const,skillData:{groceryIntent:'shop_add',title:null,items:[],steps:[],totalCents:null,onHand:[]} as never}]}
  assert.deepEqual(units(result).sort(),['aufgabe','grocery'])
  assert.deepEqual(check(result,{units:['aufgabe','grocery'],dates:['2026-11-26'],link:'aaaaaaaa-0000-4000-8000-000000000002',groceryIntent:'shop_add'}),[])
  assert.deepEqual(check({...base,summary:'Am 9. Dezember um 10 Uhr.'},{units:['antwort'],answerIncludes:'9'}),[])
  assert.ok(check({...base},{units:['finance']}).length)
})

test('Every multi-topic case is pre-split into several sections',()=>{
  for(const item of suite.cases.filter((entry:{id:string})=>entry.id.startsWith('kombi-')&&!entry.id.includes('reise')))
    assert.ok(analyseMessage(item.input,suite.day).themen.length>=2,item.id)
})
