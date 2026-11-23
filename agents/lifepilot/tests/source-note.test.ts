import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sourceNote } from '../../../hub/runtime/source-note.ts'
import { verifyOutput } from '../tools/validate.ts'

test('Text sources restrict names, size and text encoding', () => {
  assert.equal(sourceNote({ name: 'Seminar.md', text: '# Ein Kurs\nLeseliste' })?.name, 'Seminar.md')
  for (const note of [
    { name: '../Plan.txt', text: 'Wort' },
    { name: 'Plan.zip', text: 'Wort' },
    { name: 'Plan.txt', text: 'Ö'.repeat(4001) },
    { name: 'Plan.txt', text: 'Text\u0000' },
    { name: 'Plan.txt', text: 'Ersatzzeichen \ufffd' },
  ]) assert.throws(() => sourceNote(note))
})

test('A selected note is bound to a single preview and can support tasks but not memory mutations', async () => {
  process.argv.push('--acceptance')
  const { fixtures } = await import('../../../hub/runtime/settings.ts')
  const { Store } = await import('../../../hub/runtime/store.ts')
  const store = new Store(':memory:')
  try {
    const content = 'Die Diskussion zur Datenqualität vorbereiten.'
    const source = { name: 'Seminar-Notiz.md', text: content }
    const key = randomUUID()
    const input = 'Extrahiere die nächste Aufgabe aus der Textquelle.'
    assert.throws(() => store.create(fixtures.ui, 'lifepilot', key, 'cli', false, source), { status: 403 })
    const run = store.create(input, 'lifepilot', key, 'cli', true, source)
    assert.throws(() => store.create(input, 'lifepilot', key, 'cli', true, { ...source, text: 'Andere Quelle' }), { status: 409 })
    const approval = String(run.approvals[0].id)
    const preview = store.previewModel(run.id, approval)
    assert.deepEqual(preview.payload.sourceNote, source)
    assert.equal(run.sourceName, source.name)
    assert.equal(JSON.stringify(run).includes(content), false)
    assert.equal(store.next(), undefined)
    store.decide(run.id, approval, 'approve', 'ui')
    assert.deepEqual(store.next()?.payload, preview.payload)
    const candidate = { tasks: [{ title: 'Diskussion vorbereiten', doneWhen: 'Notizen bereit.',
      evidence: content, kind: 'task', date: null }], questions: [] }
    assert.throws(() => verifyOutput(candidate, input), /Beleg/)
    const result = verifyOutput(candidate, input, [], false, [], content)
    assert.throws(() => verifyOutput({ tasks: [], questions: [], actions: [{ kind: 'remember', target: null, duration: null,
      value: content, reason: 'Textquelle' }] }, input, [], false, [], content), /unbestätigte Erinnerung/)
    const preference = 'Fürs Gym bevorzuge ich donnerstags 16 Uhr.'
    const memory = (tags: string[]) => ({ tasks: [], questions: [], actions: [{ kind: 'remember', target: null, duration: null,
      value: preference, reason: 'Ausdrückliche Bitte', tags }] })
    assert.throws(() => verifyOutput(memory(['Datenqualität']), preference, [], false, [], content), /Suchwörter/)
    assert.doesNotThrow(() => verifyOutput(memory(['Gym']), preference, [], false, [], content))
    store.finish(run.id, result, null, { wallMs: 1, model: null, usage: null, cost: null })
    const review = store.present(store.run(run.id))
    store.decide(run.id, String(review.approvals.find(item => item.action === 'adopt')!.id), 'approve', 'ui')
    assert.equal(store.workspace.list()[0].run_id, run.id)
  } finally { store.db.close() }
})
