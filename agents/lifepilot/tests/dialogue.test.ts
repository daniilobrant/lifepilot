import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyOutput, type Result } from '../tools/validate.ts'

process.argv.push('--acceptance')
const { Store } = await import('../../../hub/runtime/store.ts')
const metrics = { wallMs: 1, model: null, usage: null, cost: null }
const input = 'Planne die Vorberitung meiner Mondlabor-Präsäntation.'
const answer = 'Am Montag um zehn uhr.'
const draft: Result = {
  tasks: [], questions: ['Wann ist die Präsentation?'], actions: [], advice: [], summary: null,
  correctedInput: 'Plane die Vorbereitung meiner Mondlabor-Präsentation.',
}

function acceptAnalysis(store: InstanceType<typeof Store>, run: ReturnType<InstanceType<typeof Store>['present']>) {
  assert.equal(store.next(), undefined)
  const permit = run.approvals.find(item => item.action === 'model')!
  store.decide(run.id, String(permit.id), 'approve', 'ui')
  const next = store.next()
  assert.equal(next?.id, run.id)
  return next!
}

function begin(store: InstanceType<typeof Store>) {
  const run = store.create(input, 'lifepilot', randomUUID(), 'ui', true)
  acceptAnalysis(store, run)
  store.finish(run.id, draft, null, metrics)
  return store.present(store.run(run.id))
}

test('Follow-up retains ID and original text, requires fresh approval and adopts only the latest proposal after restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lifepilot-dialogue-'))
  const db = join(dir, 'dialogue.sqlite3')
  try {
    const first = new Store(db)
    const review = begin(first)
    assert.ok(!review.approvals.some(item => item.action === 'adopt'))
    const key = randomUUID()
    assert.throws(() => first.followup(review.id, answer, key, 0, 'ui', false), { status: 403 })
    const waiting = first.followup(review.id, answer, key, 0, 'cli', true)
    assert.equal(waiting.id, review.id)
    assert.equal(waiting.input, input)
    assert.equal(waiting.turn, 1)
    assert.deepEqual(first.followup(review.id, answer, key, 0, 'cli', true), waiting)
    assert.equal(first.workspace.list().length, 0)
    first.db.close()

    const second = new Store(db)
    try {
      second.recover()
      const next = acceptAnalysis(second, second.present(second.run(review.id)))
      assert.deepEqual(next.payload.messages.map(message => message.input), [input, answer])
      assert.equal(next.payload.messages[1].previousResult?.questions[0], draft.questions[0])
      assert.ok(next.payload.messages[1].referenceDay)
      const result = verifyOutput({ ...draft, questions: [], correctedInput: 'Am Montag um zehn Uhr.',
        tasks: [{ title: 'Mondlabor-Präsentation vorbereiten', doneWhen: 'Folien sind bereit.',
          evidence: 'Mondlabor-Präsäntation', date: '2026-11-23', kind: 'task', steps: [], blocks: [] }],
      }, next.payload.messages.map(message => message.input), [], true)
      second.finish(review.id, result, null, metrics)
      const ready = second.present(second.run(review.id))
      second.decide(review.id, String(ready.approvals.find(item => item.action === 'adopt')!.id), 'approve', 'ui')
      assert.equal(second.workspace.list().length, 1)
      assert.equal(second.workspace.list()[0].run_id, review.id)
      assert.throws(() => second.followup(review.id, answer, randomUUID(), 1, 'ui', true), { status: 409 })
    } finally { second.db.close() }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('Concurrent follow-ups cannot replace an unseen revision and a prior memory-derived reply stays local', () => {
  const store = new Store(':memory:')
  try {
    store.addMemory('Mondlabor hat am Montag offen.', 'lifepilot', 'cli', null, null, true)
    const original = store.create('Planne das Mondlabor.', 'lifepilot', randomUUID(), 'ui', true)
    assert.equal(original.memory.length, 1)
    acceptAnalysis(store, original)
    store.finish(original.id, draft, null, metrics)
    const waiting = store.followup(original.id, answer, randomUUID(), 0, 'ui', true)
    const next = acceptAnalysis(store, waiting)
    assert.equal(next.payload.messages[1].previousResult, null)
    assert.equal(waiting.followups[0].previousResult?.questions[0], draft.questions[0])
    store.finish(original.id, draft, null, metrics)
    assert.throws(() => store.followup(original.id, 'Andere Antwort.', randomUUID(), 0, 'cli', true), { status: 409 })
  } finally { store.db.close() }
})

test('Evidence may come from earlier original turns, never from corrected text or across turn boundaries', () => {
  const result = { ...draft, tasks: [{ title: 'Vorbereitung', doneWhen: 'Bereit.',
    evidence: 'Präsentation', date: null, kind: 'task', steps: [], blocks: [] }] }
  assert.throws(() => verifyOutput(result, [input, answer], [], true), /Beleg/)
  assert.throws(() => verifyOutput({ ...result, tasks: [{ ...result.tasks[0], evidence: 'Präsäntation.Am' }] }, [input, answer]), /Beleg/)
  assert.doesNotThrow(() => verifyOutput({ ...result, tasks: [{ ...result.tasks[0], evidence: 'Mondlabor-Präsäntation' }] }, [input, answer]))
})

test('Analysis preview is bound to the live approval and matches the model-bound payload', () => {
  const store = new Store(':memory:')
  try {
    store.addMemory('Mondlabor-Testnotiz für LifePilot.', 'lifepilot', 'cli', null, null, true)
    store.addMemory('Mondlabor-Eigentümernotiz bleibt lokal.', 'owner', 'cli', null, null, true)
    const pending = store.create('Plane das Mondlabor.', 'lifepilot', randomUUID(), 'ui', true)
    const permit = String(pending.approvals[0].id)
    const preview = store.previewModel(pending.id, permit)
    assert.equal(preview.approval, permit)
    assert.deepEqual(preview.payload.messages.map(message => message.input), [pending.input])
    assert.equal(preview.payload.memory.length, 1)
    assert.equal(preview.payload.memory[0].content, 'Mondlabor-Testnotiz für LifePilot.')
    assert.throws(() => store.previewModel(pending.id, randomUUID()), { status: 409 })
    assert.deepEqual(acceptAnalysis(store, pending).payload, preview.payload)
    assert.throws(() => store.previewModel(pending.id, permit), { status: 409 })
    assert.equal(store.workspace.list().length, 0)
  } finally { store.db.close() }
})

test('Expired or version-obsolete analysis approvals cannot be previewed or executed', () => {
  const store = new Store(':memory:')
  try {
    const pending = store.create(input, 'lifepilot', randomUUID(), 'ui', true)
    const permit = String(pending.approvals[0].id)
    store.db.prepare("UPDATE approvals SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(permit)
    assert.throws(() => store.previewModel(pending.id, permit), { status: 409 })
    assert.throws(() => store.decide(pending.id, permit, 'approve', 'ui'), { status: 409 })
    const old = store.create(input, 'lifepilot', randomUUID(), 'ui', true)
    store.db.prepare("UPDATE runs SET version='0.3.1' WHERE id=?").run(old.id)
    store.recover()
    const recovered = store.present(store.run(old.id))
    assert.equal(recovered.state, 'failed')
    assert.equal(recovered.approvals[0].state, 'revoked')
    assert.equal(store.followup(old.id, answer, randomUUID(), 0, 'ui', true).state, 'permission')
  } finally { store.db.close() }
})

test('Direct synthetic sending starts analysis, keeps read-only replies visible and never skips write approval', () => {
  const store=new Store(':memory:','synthetic')
  try {
    const run=store.create('Fiktive Frage','lifepilot',randomUUID(),'ui',true,undefined,true)
    assert.equal(run.state,'queued')
    assert.equal(store.next()?.id,run.id)
    store.finish(run.id,{tasks:[],questions:[],summary:'Eine reine Antwort.'},null,metrics)
    assert.equal(store.run(run.id).state,'accepted')
    assert.ok(!store.present(store.run(run.id)).approvals.some(item=>item.action==='adopt'))
    const next=store.followup(run.id,'Fiktive Aufgabe anlegen',randomUUID(),0,'ui',true,true)
    assert.equal(next.state,'queued')
    store.next()
    store.finish(run.id,{tasks:[{title:'Fiktive Aufgabe',kind:'task',date:null,doneWhen:'Erledigt.',evidence:'Fiktive Aufgabe anlegen'}],
      questions:[]},null,metrics)
    assert.equal(store.run(run.id).state,'review')
    assert.ok(store.present(store.run(run.id)).approvals.some(item=>item.action==='adopt'&&item.state==='pending'))
    assert.equal(store.workspace.list().length,0)
    const source=store.create('Fiktive Textquelle','lifepilot',randomUUID(),'ui',true,{name:'Probe.txt',text:'Fiktive Datei.'},true)
    assert.equal(source.state,'permission')
  } finally {store.db.close()}
})
