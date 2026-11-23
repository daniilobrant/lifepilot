import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (!process.argv.includes('--codex')) throw new Error('Mit --codex wird der vorhandene Codex-Login für diese fiktiven Fälle verwendet.')
process.argv.push('--trinity-audit')
const { Store } = await import('../hub/runtime/store.ts')
const { runCodex } = await import('../hub/adapters/codex.ts')
const { dateInBerlin } = await import('../hub/runtime/values.ts')
const { berlinInstant } = await import('../agents/lifepilot/tools/validate.ts')
const base = Date.parse(dateInBerlin() + 'T00:00:00Z')
const day = (offset) => new Date(base + offset * 86400000).toISOString().slice(0, 10)
const dir = mkdtempSync(join(tmpdir(), 'lifepilot-alltag-check-'))
let store = new Store(join(dir, 'person-a.sqlite3'))
const permit = (run, action, channel) => {
  const approval = run.approvals.find(item => item.action === action && item.state === 'pending')
  assert.ok(approval)
  return store.decide(run.id, String(approval.id), 'approve', channel)
}
async function analyze(name, input, check) {
  const pending = store.create(input, 'lifepilot', randomUUID(), 'ui', true)
  const preview = store.previewModel(pending.id, String(pending.approvals[0].id))
  permit(pending, 'model', 'cli')
  const running = store.next()
  assert.equal(running?.id, pending.id)
  assert.deepEqual(running.payload, preview.payload)
  const reply = await runCodex(running.payload, new AbortController().signal)
  store.finish(pending.id, reply.result, reply.error, reply.metrics)
  const review = store.present(store.run(pending.id))
  console.log(JSON.stringify({ name, state: review.state, result: review.result, error: reply.error, metrics: reply.metrics }))
  assert.equal(review.state, 'review', reply.error ?? name)
  check(review.result, preview.payload, pending.id)
  return permit(review, 'adopt', 'ui')
}
function slots(run) {
  const ids = new Set(store.workspace.list().filter(task => task.run_id === run.id).map(task => task.id))
  return store.workspace.schedule().filter(slot => ids.has(slot.task_id))
}
try {
  const seminar = await analyze('Uni: Seminarreihe', `Trag das Seminar Datenethik ein: Start ${day(7)} um 10:00 bis 11:30 Uhr, insgesamt drei wöchentliche Termine.`, (result) => {
    assert.equal(result.tasks.length, 1)
    assert.deepEqual(result.tasks[0].blocks, [{ start: day(7) + 'T10:00', minutes: 90, weeks: 3 }])
  })
  assert.deepEqual(slots(seminar).map(slot => slot.at), [7, 14, 21].map(i => berlinInstant(day(i) + 'T10:00')))

  const volleyball = await analyze('Sport: Volleyball', `Trag mein Vollyballtraining am ${day(9)} von 18:00 bis 19:30 in Halle West ein.`, (result) => {
    assert.match(result.correctedInput, /Volleyball/i)
    assert.deepEqual(result.tasks[0].blocks, [{ start: day(9) + 'T18:00', minutes: 90, weeks: 1 }])
  })
  assert.equal(slots(volleyball).length, 1)

  const thesis = await analyze('Bachelorarbeit mit Terminkonflikt', `Lege eine Aufgabe an: Gliederung meiner Bachelorarbeit ausarbeiten und die Kapitel den Forschungsfragen zuordnen. Frist ${day(13)}. Plane zwei Schreibblöcke zu je 60 Minuten aus diesen Optionen: ${day(7)} um 10:00, ${day(8)} um 14:00, ${day(9)} um 18:00, ${day(10)} um 15:00. Achte auf meine bestätigten Termine.`, (result, payload) => {
    assert.equal(payload.context.filter(task => task.schedule.length > 0).length, 2)
    assert.equal(result.tasks[0].date, day(13))
    assert.deepEqual(result.tasks[0].blocks.map(block => block.start).sort(), [day(8) + 'T14:00', day(10) + 'T15:00'])
  })
  assert.equal(slots(thesis).length, 2)

  await analyze('Gym: Präferenz speichern', 'Merk dir: Fürs Gym bevorzuge ich dienstags 17 Uhr.', (result) => {
    assert.equal(result.actions[0]?.kind, 'remember')
    assert.match(result.actions[0].value, /dienstags 17 Uhr/)
    assert.equal(store.memory('lifepilot', 'Gym').length, 0)
  })
  const old = store.memory('lifepilot', 'Gym')[0]
  await analyze('Gym: Präferenz ändern', 'Korrigiere meine gespeicherte Gym-Präferenz: Fürs Gym bevorzuge ich donnerstags 16 Uhr.', (result) => {
    assert.equal(result.actions[0]?.kind, 'correct_memory')
    assert.equal(result.actions[0].target, old.id)
    assert.match(result.actions[0].value, /donnerstags 16 Uhr/)
  })
  store.db.close()
  store = new Store(join(dir, 'person-a.sqlite3'))
  assert.equal(store.memory('lifepilot', 'Gym')[0].replaces, old.id)
  await analyze('Gym: präzise Erinnerung nach Neustart', 'Wann gehe ich laut meiner gespeicherten Gym-Präferenz am liebsten trainieren?', (result, payload) => {
    assert.equal(payload.memory.length, 1)
    assert.match(payload.memory[0].content, /donnerstags 16 Uhr/)
    assert.match(result.summary, /donnerstag.*16/i)
    assert.deepEqual(result.actions, [])
    assert.deepEqual(result.tasks, [])
  })

  const friends = await analyze('Freunde: lokales Treffen', `Trag das ausgemachte Treffen mit Mira und Toni im Café Mosaik am ${day(11)} von 19:00 bis 20:30 lokal ein.`, (result) => {
    assert.equal(result.tasks[0]?.kind, 'appointment')
    assert.match(JSON.stringify(result.tasks[0]), /Mosaik/)
    assert.deepEqual(result.actions, [])
  })
  assert.equal(slots(friends).length, 1)
  store.db.close()
  store = new Store(join(dir, 'person-b.sqlite3'))
  const rehearsal = await analyze('Anderer Alltag: Chor und Schicht', `Trag die Chorprobe ${day(8)} von 19:30 bis 21:00 und meine Frühschicht ${day(9)} von 06:00 bis 14:00 als zwei getrennte lokale Termine ein.`, (result, payload) => {
    assert.deepEqual(payload.memory, [])
    assert.deepEqual(payload.context, [])
    assert.equal(result.tasks.length, 2)
  })
  assert.equal(slots(rehearsal).length, 2)

  for (let i = 1; i <= 26; i++) {
    store.workspace.add(null, { title: `Sprachkurs Übung ${i}`, detail: 'Übung nachbereiten.', date: day(14), kind: 'task' }, 'cli')
  }
  const membership = store.workspace.add(null, { title: 'Mitgliedsbeitrag für den Volleyballverein', detail: 'Jahresbeitrag zahlen.',
    date: day(30), kind: 'task' }, 'cli')
  store.addMemory('Der Volleyballverein trainiert in Halle West.', 'lifepilot', 'cli', null, null, true)
  await analyze('Kontext: Tippfehler bei vielen Aufgaben', `Verschiebe die Frist für den Mitgliedsbeitrag im Vollyballverein auf ${day(35)}.`, (result, payload) => {
    assert.equal(payload.context.length, 24)
    assert.ok(payload.context.some(item => item.id === membership.id))
    assert.ok(payload.memory.some(item => item.content.includes('Volleyballverein')))
    assert.match(result.correctedInput, /Volleyballverein/i)
    assert.deepEqual(result.actions.map(({ kind, target, value }) => [kind, target, value]), [['deadline', membership.id, day(35)]])
    assert.deepEqual(result.tasks, [])
  })
  assert.equal(store.workspace.get(membership.id).due_date, day(35))
} finally {
  store.db.close()
  rmSync(dir, { recursive: true, force: true })
}
