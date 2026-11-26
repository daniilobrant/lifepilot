import {test} from 'node:test'
import assert from 'node:assert/strict'
import {seriesFromChat} from '../../../hub/runtime/calendar-series-chat.ts'
import {cleanChoices,type Result} from '../tools/validate.ts'
import type {ModelMessage,ModelPayload} from '../../../hub/runtime/model-payload.ts'

const day='2026-11-26'
const payload=(messages:ModelMessage[]):ModelPayload=>({day,timeZone:'Europe/Berlin',messages,memory:[],context:[]})
const turn=(input:string,previousResult?:Result|null):ModelMessage=>({input,referenceDay:day,previousResult:previousResult??null})

const first=seriesFromChat(payload([turn('Trag jeden Dienstag den Termin „Kaffee trinken“ ein, bis zum 15.12.')]))
assert.ok(first)

test('a series without times asks once with time bubbles',()=>{
  assert.equal(first.questions.length,1)
  assert.ok(first.choices?.length)
})

test('a bare time answers the start and the next question names it and offers end times',()=>{
  const second=seriesFromChat(payload([turn('Trag jeden Dienstag den Termin „Kaffee trinken“ ein, bis zum 15.12.'),turn('15 Uhr',first)]))
  assert.ok(second)
  assert.match(second.questions[0],/15:00/u)
  assert.deepEqual(second.choices,['Bis 16:00 Uhr','Bis 16:30 Uhr','Bis 17:00 Uhr'])
  const plan=second.skillData
  assert.ok(plan&&'seriesIntent' in plan&&plan.startTime==='15:00')
})

test('an end-time bubble completes the series without another question',()=>{
  const second=seriesFromChat(payload([turn('Trag jeden Dienstag den Termin „Kaffee trinken“ ein, bis zum 15.12.'),turn('15 Uhr',first)]))!
  const third=seriesFromChat(payload([turn('Trag jeden Dienstag den Termin „Kaffee trinken“ ein, bis zum 15.12.'),turn('15 Uhr',first),turn('Bis 16:30 Uhr',second)]))
  assert.ok(third)
  assert.deepEqual(third.questions,[])
  const plan=third.skillData
  assert.ok(plan&&'seriesIntent' in plan)
  assert.equal(plan.startTime,'15:00')
  assert.equal(plan.endTime,'16:30')
})

test('an unrelated message does not get swallowed by an open series question',()=>{
  for(const text of ['Ja, ein Gericht mit Fleisch, mit meinen Zutaten, die ich gerade habe.','Was kann ich heute kochen?','Welches Outfit passt zum Vorstellungsgespräch?','Ich brauche noch Milch und Eier'])
    assert.equal(seriesFromChat(payload([turn('Trag jeden Dienstag den Termin „Kaffee trinken“ ein, bis zum 15.12.'),turn(text,first)])),undefined,text)
})

test('choices are short plain text, at most four, and only with a question',()=>{
  assert.deepEqual(cleanChoices(['Ja','Nein'],['Passt das?']),['Ja','Nein'])
  assert.equal(cleanChoices(['Ja'],[]),undefined)
  assert.equal(cleanChoices(null,['x?']),undefined)
  assert.deepEqual(cleanChoices(['Montag','montag','**fett**','https://böse.example','Etwas anderes','a'.repeat(61),'Dienstag','Mittwoch','Donnerstag','Freitag'],['Welcher Tag?']),['Montag','Dienstag','Mittwoch','Donnerstag'])
})

test('a single appointment tomorrow after an old series question is not treated as a series',()=>{
  const reply=seriesFromChat(payload([turn('Trag jeden Dienstag den Termin „Kaffee trinken“ ein, bis zum 15.12.'),turn('15 Uhr',first),
    turn('Ich treffe mich morgen mit Unikollegen in Stuttgart um circa 20:20 Uhr bis 0:00 Uhr, lege den Termin ein.')]))
  assert.equal(reply,undefined)
})

test('"morgen bis Ende des Jahres" gives start and end of a series at once',()=>{
  const reply=seriesFromChat(payload([turn('Trag jeden Dienstag von 18 bis 19 Uhr den Termin „Training“ ein, morgen bis Ende des Jahres.')]))
  assert.ok(reply)
  assert.deepEqual(reply.questions,[])
  const plan=reply.skillData
  assert.ok(plan&&'seriesIntent' in plan)
  assert.equal(plan.startDate,'2026-11-27')
  assert.equal(plan.endDate,'2026-12-31')
})
