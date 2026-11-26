import {test} from 'node:test'
import assert from 'node:assert/strict'
import {analyseMessage,mentionedDates} from '../../../hub/runtime/message-analysis.ts'

test('Long dictated messages are split at signal words without breaking abbreviations or dates',()=>{
  const mixed=analyseMessage('Trag am Freitag um 18 Uhr Kino mit Lena ein außerdem setz Popcorn und Milch auf die Einkaufsliste und dann noch was hab ich diesen Monat für Essen ausgegeben?','2026-11-25')
  assert.equal(mixed.abschnitte.length,3)
  assert.deepEqual(mixed.abschnitte.map(item=>item.themen[0]),['termin','vorrat_einkauf','finanzen'])
  assert.equal(mixed.abschnitte[0].daten['am freitag'],'2026-11-27')
  assert.equal(mixed.mehrereAnliegen,true)
  const lecture=analyseMessage('Morgen in meiner B2Bar. Marketing und Sales Vorlesung muss ich eine Präsentation halten. Baue das als Abgabe ein','2026-11-25')
  assert.ok(lecture.abschnitte[0].text.includes('Marketing und Sales'))
  assert.equal(lecture.daten.morgen,'2026-11-26')
  const interview=analyseMessage('Ich hab mich bei Beispiel GmbH beworben, Vorstellungsgespräch am 3.12. um 10 Uhr, ach ja und schlag mir ein Outfit dafür vor','2026-11-25')
  assert.equal(interview.abschnitte.length,2)
  assert.ok(interview.abschnitte[0].themen.includes('bewerbung'))
  assert.ok(interview.abschnitte[1].themen.includes('outfit'))
})

test('Relative and written dates resolve to calendar days',()=>{
  assert.deepEqual(mentionedDates('heute und übermorgen','2026-11-25'),{heute:'2026-11-25','übermorgen':'2026-11-27'})
  assert.equal(mentionedDates('am 3. Januar','2026-11-25')['3. januar'],'2027-01-03')
  assert.equal(mentionedDates('am Mittwoch','2026-11-25')['am mittwoch'],'2026-12-02')
})

test('Topic words with umlauts are recognised',()=>{
  assert.ok(analyseMessage('Morgen ist Übung, danach überwiesen 20 €','2026-11-25').themen.includes('finanzen'))
  assert.ok(analyseMessage('die Übung um 10 Uhr','2026-11-25').abschnitte[0].themen.includes('termin'))
})
