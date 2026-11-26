import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { expandBlock, type Result, verifyOutput } from '../tools/validate.ts'
import { dateInBerlin } from '../../../hub/runtime/values.ts'

process.argv.push('--acceptance')
const { Store } = await import('../../../hub/runtime/store.ts')
const metrics = { wallMs: 1, model: null, usage: null, cost: null }
const day = (offset: number) => new Date(Date.parse(dateInBerlin() + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10)

function draft(store: InstanceType<typeof Store>, input: string, result: Result) {
  const waiting = store.create(input, 'lifepilot', randomUUID(), 'ui', true)
  store.decide(waiting.id, String(waiting.approvals[0].id), 'approve', 'cli')
  assert.equal(store.next()?.id, waiting.id)
  store.finish(waiting.id, verifyOutput(result, input, waiting.context, false, waiting.memory.map(item => item.id)), null, metrics)
  const review = store.present(store.run(waiting.id))
  const approval = String(review.approvals.find(item => item.action === 'adopt')!.id)
  return { id: review.id, adopt: () => store.decide(review.id, approval, 'approve', 'ui') }
}

test('Weekly blocks retain Berlin wall time across DST and reject an ambiguous occurrence', () => {
  assert.deepEqual(expandBlock({ start: '2030-03-24T10:00', minutes: 90, weeks: 2 }).map(item => item.at),
    ['2030-03-24T09:00:00.000Z', '2030-03-31T08:00:00.000Z'])
  assert.throws(() => expandBlock({ start: '2030-10-20T02:30', minutes: 90, weeks: 2 }), /Zeitumstellung/)
})

test('Conflict in a later occurrence holds the entire new course for a second confirmation', () => {
  const store = new Store(':memory:')
  try {
    const original = store.workspace.add(null, { title: 'Konferenz', detail: 'Vortrag', kind: 'appointment', date: day(10) }, 'cli')
    const [busy] = expandBlock({ start: day(10) + 'T11:00', minutes: 60, weeks: 1 })
    store.workspace.addSchedule(original.id, 'slot', busy.at, busy.endsAt, 'cli')
    const input = 'Plane das Seminar wöchentlich.'
    const review = draft(store, input, { tasks: [{ title: 'Seminar', kind: 'appointment', evidence: input, doneWhen: 'Seminar besucht.',
      date: day(3), blocks: [{ start: day(3) + 'T10:30', minutes: 90, weeks: 2 }] }], questions: [] })
    const first=review.adopt()
    assert.ok('calendarConfirmation' in first&&first.calendarConfirmation)
    assert.equal(first.calendarConfirmation.conflicts[0].title,'Konferenz')
    assert.deepEqual(store.workspace.list().map(task => task.id), [original.id])
    assert.deepEqual(store.workspace.schedule().map(slot => slot.task_id), [original.id])
    assert.equal(store.run(review.id).state, 'review')
  } finally { store.db.close() }
})

test('Confirmed correction replaces just the visible memory and revokes other approvals using it', () => {
  const store = new Store(':memory:')
  try {
    const preference = 'Fürs Gym bevorzuge ich früh.'
    draft(store, preference, { tasks: [], questions: [], actions: [{ kind: 'remember', target: null, value: preference,
      reason: 'Explizite Bitte', duration: null, tags: ['Gym', 'Fitnessstudio'] }] }).adopt()
    const [old] = store.memory('lifepilot', 'Fitnessstudio')
    assert.ok(old)
    const waiting = store.create('Plane Gym.', 'lifepilot', randomUUID(), 'cli', true)
    const text = 'Fürs Gym bevorzuge ich abends.'
    const result: Result = { tasks: [], questions: [], actions: [{ kind: 'correct_memory', target: old.id, value: text,
      reason: 'Explizite Korrektur', duration: null, tags: ['Fitnessstudio'] }] }
    assert.throws(() => verifyOutput(result, text), /unbestätigte Erinnerung/)
    const revision = draft(store, text, result)
    assert.equal(store.memory('lifepilot', 'Gym')[0].content, preference)
    revision.adopt()
    assert.equal(store.run(waiting.id).state, 'cancelled')
    assert.throws(() => store.decide(waiting.id, String(waiting.approvals[0].id), 'approve', 'cli'), { status: 409 })
    assert.equal(store.run(revision.id).state, 'accepted')
    const [replacement] = store.memory('lifepilot', 'Fitnesstudio Fitnessstudio')
    assert.equal(replacement.replaces, old.id)
    assert.equal(replacement.content, text)
    store.forget(replacement.id, true)
    assert.equal(store.db.prepare('SELECT tags FROM memory WHERE id=?').get(replacement.id)?.tags, '[]')
  } finally { store.db.close() }
})

test('A week keeps completed deadlines and reflects links without duplicating dated appointments', () => {
  const store = new Store(':memory:')
  try {
    const date = day(10)
    const intro = store.workspace.add(null, { title: 'Vorstellung Entwurf', date, kind: 'appointment', detail: 'Gespräch' }, 'ui')
    const draft = store.workspace.add(null, { title: 'Entwurf abschließen', date, kind: 'task', detail: 'Datei bereit' }, 'ui')
    const [block] = expandBlock({ start: date + 'T14:00', minutes: 45, weeks: 1 })
    const slot = store.workspace.addSchedule(intro.id, 'slot', block.at, block.endsAt, 'ui')
    const [notice] = expandBlock({ start: date + 'T08:00', minutes: null, weeks: 1 })
    const reminder = store.workspace.addSchedule(draft.id, 'reminder', notice.at, null, 'ui')
    const from = expandBlock({ start: date + 'T00:00', minutes: null, weeks: 1 })[0].at
    const to = expandBlock({ start: day(17) + 'T00:00', minutes: null, weeks: 1 })[0].at
    const week = store.workspace.week(date, from, to)
    assert.deepEqual(week.entries.map(item => [item.id, item.kind]), [[reminder.id, 'reminder'], [slot.id, 'slot']])
    store.workspace.dismiss(slot.id, 'ui')
    assert.deepEqual(store.workspace.week(date, from, to).entries.find(item => item.taskId === intro.id)?.kind, 'appointment')
    const done = store.workspace.update(draft.id, draft.revision, { status: 'done' }, 'ui')
    assert.ok(done.completed_at)
    assert.equal(store.workspace.update(done.id,done.revision,{detail:'Überarbeitet'},'ui').completed_at,done.completed_at)
    assert.deepEqual(store.workspace.week(date, from, to).entries.map(item => item.taskId), [draft.id,intro.id])
  } finally { store.db.close() }
})

test('A common typo finds a confirmed preference and a far-dated task without taking other memory scopes', () => {
  const store = new Store(':memory:')
  try {
    for (let i = 0; i < 30; i++) {
      store.workspace.add(null, { title: 'Lektüre ' + i, detail: 'Seiten lesen', date: day(7), kind: 'task' }, 'cli')
    }
    const task = store.workspace.add(null, { title: 'Beitrag Volleyballverein', detail: 'Jahresgebühr begleichen',
      date: day(28), kind: 'task' }, 'cli')
    store.addMemory('Der Volleyballverein trainiert mittwochs.', 'lifepilot', 'cli', null, null, true)
    store.addMemory('Volleyballverein: nur für mich.', 'owner', 'cli', null, null, true)
    const run = store.create('Vollyballverein: Wann ist die Aufgabe fällig?', 'lifepilot', randomUUID(), 'ui', true)
    assert.equal(run.context.length, 24)
    assert.equal(run.context[0].id, task.id)
    assert.ok(run.memory.some(entry => entry.content.includes('mittwochs')))
    assert.ok(run.memory.every(entry => entry.scope === 'lifepilot' && !entry.content.includes('nur für mich')))
    assert.deepEqual(store.memory('lifepilot', 'Gemüse schneiden', 'lifepilot'), [])
  } finally { store.db.close() }
})
