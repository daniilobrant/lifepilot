import {test} from 'node:test'
import assert from 'node:assert/strict'
import {resolveRelativeDate,relativeDatesIn} from '../../../hub/runtime/relative-dates.ts'
import {seriesFromChat} from '../../../hub/runtime/calendar-series-chat.ts'
import {analyseMessage} from '../../../hub/runtime/message-analysis.ts'

const today='2026-11-26' // Donnerstag
const one=(phrase:string)=>{const span=resolveRelativeDate(phrase,today);assert.ok(span,phrase);return span}

test('Wochentage und Wochen',()=>{
  assert.equal(one('nächsten Dienstag').start,'2026-12-01')
  assert.equal(one('am nächsten Donnerstag').start,'2026-12-03')
  assert.equal(one('nächste Woche Mittwoch').start,'2026-12-02')
  assert.equal(one('diesen Freitag').start,'2026-11-27')
  assert.equal(one('in zwei Wochen').start,'2026-12-10')
  assert.equal(one('in 3 Tagen').start,'2026-11-29')
  assert.deepEqual(one('nächste Woche'),{start:'2026-11-30',end:'2026-12-06'})
  assert.equal(one('Ende der Woche').start,'2026-11-27')
  assert.deepEqual(one('nächstes Wochenende'),{start:'2026-12-05',end:'2026-12-06'})
})

test('Monate und Jahre',()=>{
  assert.deepEqual(one('nächsten Monat'),{start:'2026-12-01',end:'2026-12-31'})
  assert.equal(one('Anfang nächsten Monats').start,'2026-12-01')
  assert.equal(one('Monatsanfang').start,'2026-12-01'.slice(0,0)+one('Monatsanfang').start)
  assert.equal(one('Ende des Monats').start,'2026-11-30')
  assert.equal(one('Monatsende').start,'2026-11-30')
  assert.equal(one('Ende nächsten Monats').start,'2026-12-31')
  assert.equal(one('Mitte des Monats').start,'2026-11-15')
  assert.equal(one('Ende des Jahres').start,'2026-12-31')
  assert.equal(one('Jahresende').start,'2026-12-31')
  assert.equal(one('Anfang nächsten Jahres').start,'2027-01-01')
  assert.equal(one('Neujahr').start,'2027-01-01')
})

test('Vorzerlegung gibt die Auflösung an das Modell',()=>{
  const dates=analyseMessage('Training nächsten Dienstag um 18 Uhr und Abgabe bis Ende des Monats',today).daten
  assert.equal(dates['nächsten dienstag'],'2026-12-01')
  assert.equal(dates['ende des monats'],'2026-11-30')
  assert.deepEqual(relativeDatesIn('bis nächsten Monat',today),{'nächsten monat':'2026-12-01 bis 2026-12-31'})
})

const payload=(input:string)=>({day:today,timeZone:'Europe/Berlin' as const,messages:[{input,referenceDay:today,previousResult:null}],memory:[],context:[]})
const plan=(input:string)=>{const reply=seriesFromChat(payload(input));assert.ok(reply,input);return reply}

test('Serien erkennen Anfang und Ende in der ersten Nachricht',()=>{
  const reply=plan('Trag jeden Dienstag von 18 bis 19 Uhr den Termin „Training“ ein, ab nächstem Montag bis Anfang nächsten Monats')
  assert.deepEqual(reply.questions,[])
  const data=reply.skillData
  assert.ok(data&&'seriesIntent' in data)
  assert.equal(data.startDate,'2026-11-30')
  assert.equal(data.endDate,'2026-12-01')
  const month=plan('Trag jeden Mittwoch von 10 bis 11 Uhr den Termin „Yoga“ ein, ab morgen bis Ende des Monats').skillData
  assert.ok(month&&'seriesIntent' in month)
  assert.equal(month.endDate,'2026-11-30')
  const next=plan('Trag jeden Mittwoch von 10 bis 11 Uhr den Termin „Yoga“ ein, nächsten Monat').skillData
  assert.ok(next&&'seriesIntent' in next)
  assert.equal(next.startDate,'2026-12-01')
})
