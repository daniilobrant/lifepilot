import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { berlinInstant, verifyOutput, type Result } from '../tools/validate.ts'

process.argv.push('--acceptance')
const { Store } = await import('../../../hub/runtime/store.ts')
const { dateInBerlin } = await import('../../../hub/runtime/values.ts')
const metrics = { wallMs: 1, model: null, usage: null, cost: null }
const input = 'Die Mondprobe ist bis Freitag bereit. Merke, dass ich mittwochs wenig Zeit habe.'
const empty = { tasks: [], questions: [], actions: [], advice: [], summary: null }
const proposal: Result = {
  ...empty, tasks: [{ title: 'Mondprobe', doneWhen: 'Probe liegt bereit.', evidence: 'Die Mondprobe ist bis Freitag bereit.',
    kind: 'task', date: '2026-11-20', steps: ['Probe sammeln', 'Probe prüfen'] }],
}

function withStore(run: (store: InstanceType<typeof Store>) => void) {
  const store = new Store(':memory:')
  try { run(store) } finally { store.db.close() }
}

function queued(store: InstanceType<typeof Store>, source = input) {
  const run = store.create(source, 'lifepilot', randomUUID(), 'ui', true)
  const permission = String(run.approvals[0].id)
  store.decide(run.id, permission, 'approve', 'cli')
  assert.equal(store.next()?.id, run.id)
  return run
}
function offer(store: InstanceType<typeof Store>, result: Result, source = input) {
  const run = queued(store, source)
  store.finish(run.id, verifyOutput(result, source, run.context), null, metrics)
  assert.equal(store.run(run.id).state, 'review')
  return store.present(store.run(run.id))
}
function adopt(store: InstanceType<typeof Store>, run: ReturnType<typeof offer>) {
  return store.decide(run.id, String(run.approvals[1].id), 'approve', 'ui')
}
function add(store: InstanceType<typeof Store>, title = 'Mondprobe') {
  return store.transaction(() => store.workspace.add(null, { title, detail: 'Überprüft.', kind: 'task', date: '2026-11-20' }, 'cli'))
}

test('Life Inbox accepts new synthetic text and creates a real task only after adoption', () => withStore(store => {
  assert.throws(() => store.create(input, 'lifepilot', randomUUID(), 'ui'), { status: 403 })
  const run = offer(store, proposal)
  assert.equal(store.workspace.list().length, 0)
  adopt(store, run)
  const [task] = store.workspace.list()
  assert.equal(task.run_id, run.id)
  assert.equal(task.due_date, '2026-11-20')
  assert.deepEqual(task.steps.map(step => step.title), proposal.tasks[0].steps)
  assert.throws(() => adopt(store, run), { status: 409 })
  assert.equal(store.workspace.list().length, 1)
}))

test('Mission Manager records revisioned edits, relationships, completion and archival', () => withStore(store => {
  const task = add(store)
  const related = add(store, 'Zubehör')
  const edited = store.transaction(() => store.workspace.update(task.id, task.revision, {
    title: 'Mondprobe prüfen', priority: 'high', due_date: null, related_id: related.id,
    steps: [{ title: 'Probe prüfen', done: true }],
  }, 'ui'))
  assert.equal(edited.related_id, related.id)
  assert.equal(edited.steps[0].done, true)
  assert.equal(edited.priority, 'high')
  assert.throws(() => store.workspace.update(task.id, task.revision, { status: 'done' }, 'cli'), { status: 409 })
  const done = store.workspace.update(task.id, edited.revision, { status: 'done' }, 'ui')
  assert.equal(done.status, 'done')
  store.workspace.update(task.id, done.revision, { status: 'archived' }, 'ui')
  assert.ok(!store.workspace.list().some(item => item.id === task.id))
  assert.equal(store.workspace.history(task.id).length, 4)
}))

test('Deadline Guardian applies a revision-bound proposal and refuses stale approval', () => withStore(store => {
  const task = add(store)
  const result: Result = { ...empty, actions: [{ kind: 'deadline', target: task.id, value: '2026-11-23', duration: null, reason: 'Neue Frist.' }] }
  const first = offer(store, result)
  store.workspace.update(task.id, task.revision, { priority: 'high' }, 'cli')
  assert.throws(() => adopt(store, first), { status: 409 })
  assert.equal(store.workspace.get(task.id).due_date, '2026-11-20')
  adopt(store, offer(store, result))
  assert.equal(store.workspace.get(task.id).due_date, '2026-11-23')
}))

test('Priority Engine and Daily Briefing cite only known tasks and are read-only unless changed explicitly', () => withStore(store => {
  const task = add(store)
  const result = { ...empty, advice: [{ target: task.id, reason: 'Die Frist rückt näher.' }], summary: 'Eine dringende Aufgabe.' }
  const run = queued(store)
  store.finish(run.id,verifyOutput(result,input,run.context),null,metrics)
  assert.equal(store.run(run.id).state,'accepted')
  assert.ok(!store.present(store.run(run.id)).approvals.some(item=>item.action==='adopt'))
  assert.equal(store.workspace.get(task.id).priority, 'normal')
  assert.equal(store.workspace.get(task.id).revision, 1)
  assert.throws(() => verifyOutput({ ...result, advice: [{ target: randomUUID(), reason: 'Unbekannt.' }] }, input, store.workspace.context()))
}))

test('Personal Memory stores only the approved quoted preference and omits unapproved entries', () => withStore(store => {
  const quote = 'mittwochs wenig Zeit'
  const result: Result = { ...empty, actions: [{ kind: 'remember', target: null, value: quote, reason: 'Ausdrücklich gewünscht.', duration: null }] }
  const run = offer(store, result)
  assert.equal(store.memory('lifepilot', 'mittwochs', 'lifepilot').length, 0)
  adopt(store, run)
  assert.equal(store.memory('lifepilot', 'mittwochs', 'lifepilot')[0].content, quote)
  assert.throws(() => verifyOutput({ ...empty, actions: [{ ...result.actions![0], value: 'Sonntags Terminstress' }] }, input))
}))

test('Smart Planning checks Berlin time and never applies part of an overlapping proposal', () => withStore(store => {
  const task = add(store)
  const at = berlinInstant('2090-01-15T10:00')
  const ends = berlinInstant('2090-01-15T11:00')
  assert.equal(at.slice(11, 16), '09:00')
  store.workspace.addSchedule(task.id, 'slot', at, ends, 'cli')
  const result: Result = { ...proposal, actions: [{ kind: 'plan', target: task.id, value: '2090-01-15T10:30', duration: 30, reason: 'Vorbereitung.' }] }
  const first=adopt(store,offer(store,result))
  assert.ok('calendarConfirmation' in first&&first.calendarConfirmation)
  assert.equal(first.calendarConfirmation.conflicts[0].title,task.title)
  assert.equal(store.workspace.list().length, 1)
  assert.equal(store.workspace.schedule().length, 1)
  assert.throws(() => berlinInstant('2026-03-29T02:30'), /mehrdeutig|ungültig/)
  assert.throws(() => berlinInstant('2026-10-25T02:30'), /mehrdeutig|ungültig/)
  assert.equal(dateInBerlin(new Date('2026-11-19T23:15:00Z')), '2026-11-20')
}))

test('Reminder survives reboot, becomes ready exactly once and can be dismissed', () => {
  const folder = mkdtempSync(join(tmpdir(), 'lifepilot-reminder-'))
  const db = join(folder, 'workspace.sqlite3')
  try {
    const first = new Store(db)
    const task = add(first)
    const at = berlinInstant('2090-01-15T10:00')
    const reminder = first.workspace.addSchedule(task.id, 'reminder', at, null, 'cli')
    first.db.close()
    const second = new Store(db)
    try {
      assert.equal(second.workspace.get(task.id).title, task.title)
      assert.equal(second.workspace.schedule()[0].state, 'pending')
      assert.equal(second.workspace.tick(at), 1)
      assert.equal(second.workspace.tick(at), 0)
      assert.equal(second.workspace.schedule()[0].state, 'ready')
      second.workspace.dismiss(reminder.id, 'ui')
      assert.equal(second.workspace.schedule().length, 0)
    } finally { second.db.close() }
  } finally { rmSync(folder, { recursive: true, force: true }) }
})

test('Editing a proposal stamps a new approval and leaves the previous revision auditable', () => withStore(store => {
  const run = offer(store, proposal)
  const changed = { ...proposal, tasks: [{ ...proposal.tasks[0], title: 'Mondlabor vorbereiten' }] }
  const revision = store.revise(run.id, changed, 'ui')
  assert.notEqual(revision.approvals[1].id, run.approvals[1].id)
  assert.throws(() => adopt(store, run), { status: 404 })
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM proposal_history WHERE run_id=?').get(run.id)?.n, 1)
  adopt(store, revision)
  assert.equal(store.workspace.list()[0].title, 'Mondlabor vorbereiten')
}))

test('Smart Planning can move an existing slot without duplicating it', () => withStore(store => {
  const task = add(store)
  const at = berlinInstant('2090-01-15T10:00')
  const end = berlinInstant('2090-01-15T11:00')
  const slot = store.workspace.addSchedule(task.id, 'slot', at, end, 'cli')
  const result: Result = { ...empty, actions: [{ kind: 'reschedule', target: slot.id, value: '2090-01-15T12:00', duration: null, reason: 'Andere Verfügbarkeit.' }] }
  adopt(store, offer(store, result))
  assert.equal(store.workspace.schedule().length, 1)
  assert.equal(store.workspace.schedule()[0].id, slot.id)
  assert.equal(store.workspace.schedule()[0].at, berlinInstant('2090-01-15T12:00'))
  assert.equal(store.workspace.schedule()[0].ends_at, berlinInstant('2090-01-15T13:00'))
}))

test('Calendar categories are inferred, editable and shared by month and week ranges', () => {
  const store = new Store(':memory:')
  try {
    const day = '2090-10-14'
    const task = store.workspace.add(null, { title: 'Bachelorarbeit besprechen', detail: '', date: day, kind: 'appointment' }, 'ui')
    assert.equal(task.category, 'university')
    assert.equal(store.workspace.update(task.id, task.revision, { category: 'work' }, 'cli').category, 'work')
    const month = store.workspace.week('2090-10-01', '2090-10-01T00:00:00.000Z', '2090-11-01T00:00:00.000Z', 31)
    assert.equal(month.entries.find(item => item.taskId === task.id)?.category, 'work')
    const leisure = store.workspace.add(null, { title: 'Volleyball', detail: '', date: day, kind: 'appointment' }, 'ui')
    assert.equal(leisure.category, 'leisure')
  } finally { store.db.close() }
})
