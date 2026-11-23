import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Store } from '../../../hub/runtime/store.ts'
import { hasPrivateChatRelease } from '../../../hub/runtime/chat-release.ts'
import type { Result } from '../tools/validate.ts'

const key = randomUUID
const metrics = { wallMs: 1, model: null, usage: null, cost: null }

test('Personal Q&A does not share other records and can continue after reading an answer', () => {
  const store = new Store(':memory:', 'private')
  try {
    store.addMemory('Volleyball ist mein privater Kontext.', 'lifepilot', 'cli', null, null)
    store.workspace.add(null, { title: 'Ausstehendes Volleyballtraining', detail: 'Kontext', date: null, kind: 'task' }, 'cli')
    const ask = 'Wie bereite ich das Volleyballtraining vor?'
    assert.throws(() => store.create(ask, 'lifepilot', key(), 'ui', true), { status: 400 })
    const sentKey = key()
    const run = store.create(ask, 'lifepilot', sentKey, 'ui')
    assert.equal(run.synthetic, 0)
    assert.equal(run.state, 'queued')
    assert.equal(run.approvals[0].state, 'approved')
    assert.equal(store.create(ask, 'lifepilot', sentKey, 'ui').id, run.id)
    assert.throws(() => store.decide(run.id, String(run.approvals[0].id), 'approve', 'cli'), { status: 409 })
    const payload = store.next()!.payload
    assert.deepEqual(payload.memory, [])
    assert.deepEqual(payload.context, [])
    assert.equal(payload.mode, 'personal')
    assert.deepEqual(payload.messages.map(item => item.input), [ask])
    store.finish(run.id, { tasks: [], questions: [], summary: 'Beginne mit einem kurzen Aufwärmen.' }, null, metrics)
    assert.equal(store.run(run.id).state, 'accepted')
    assert.ok(!store.present(store.run(run.id)).approvals.some(item => item.action === 'adopt'))
    const followup = store.followup(run.id, 'Und wie lange?', key(), 0, 'ui', false)
    assert.equal(followup.id, run.id)
    assert.equal(followup.turn, 1)
    assert.equal(followup.state, 'queued')
    const second = store.next()!.payload
    assert.deepEqual(second.messages.map(item => item.input), [ask, 'Und wie lange?'])
    assert.deepEqual(second.context, [])
    const blocked: Result = { tasks: [], questions: [], actions: [{
      kind: 'remember', target: null, value: 'Und wie lange?', reason: 'Probe', duration: null,
    }] }
    store.finish(run.id, blocked, null, metrics)
    assert.equal(store.run(run.id).state, 'failed')
    assert.equal(store.workspace.list().length, 1)
    assert.equal(store.memory('lifepilot', '').length, 1)
  } finally { store.db.close() }
})

test('The personal chat release rejects file changes, unsafe rights and the wrong version', () => {
  const root = mkdtempSync(join(tmpdir(), 'lifepilot-chat-release-'))
  const sha = (data: string) => createHash('sha256').update(data).digest('hex')
  const files = ['hub/runtime/server.ts', 'hub/runtime/store.ts', 'hub/adapters/codex.ts',
    'agents/lifepilot/skills/alltag/SKILL.md', 'package-lock.json']
  const marker = join(root, 'release.json')
  try {
    for (const name of [...files, 'dist/app.js']) {
      const file = join(root, name)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, name)
    }
    const manifest = files.map(file => sha(file) + '  ' + file).join('\n') + '\n'
    writeFileSync(join(root, 'SHA256SUMS'), manifest)
    assert.equal(hasPrivateChatRelease(root, marker, '0.8.0'), false)
    writeFileSync(marker, JSON.stringify({ approved: true, version: '0.8.0', manifest: sha(manifest), ui: sha('dist/app.js') }), { mode: 0o600 })
    assert.equal(hasPrivateChatRelease(root, marker, '0.8.0'), true)
    assert.equal(hasPrivateChatRelease(root, marker, '0.8.1'), false)
    chmodSync(marker, 0o644)
    assert.equal(hasPrivateChatRelease(root, marker, '0.8.0'), false)
    chmodSync(marker, 0o600)
    writeFileSync(join(root, 'dist/app.js'), 'changed')
    assert.equal(hasPrivateChatRelease(root, marker, '0.8.0'), false)
    writeFileSync(join(root, 'dist/app.js'), 'dist/app.js')
    writeFileSync(join(root, files[0]), 'changed')
    assert.equal(hasPrivateChatRelease(root, marker, '0.8.0'), false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('Private image text is held for exact consent and excluded from unrelated questions', () => {
  const store = new Store(':memory:', 'private')
  try {
    const source = { name:'Screenshot.png', text:'Kennung ist 5423.' }
    const run = store.create('Was steht da?', 'lifepilot', key(), 'ui', false, source, true)
    assert.equal(run.state, 'permission')
    assert.equal(store.next(), undefined)
    const approval = String(run.approvals[0].id)
    assert.deepEqual(store.previewModel(run.id, approval).payload.sourceNote, source)
    store.decide(run.id, approval, 'approve', 'ui')
    assert.deepEqual(store.next()?.payload.sourceNote, source)
    const clean = store.create('Hallo', 'lifepilot', key(), 'ui')
    assert.equal(clean.state, 'queued')
    assert.equal(clean.sourceName, null)
  } finally { store.db.close() }
})
