import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const trial = 'http://127.0.0.1:45138'
const primary = 'http://127.0.0.1:45137'
const root = new URL('../../../', import.meta.url)
function bearer(instance) {
  const token = readFileSync(new URL('user-data/' + instance + '/adapter-token', root), 'utf8')
  return { Authorization: 'Bearer ' + token }
}
async function request(base, path, expected, headers = {}, payload) {
  const result = await fetch(base + '/api' + path, {
    headers: payload === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    method: payload === undefined ? 'GET' : 'POST',
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  assert.equal(result.status, expected, path)
  return result
}

test('Browser and CLI share tasks; writes, local planning and draft boundaries are enforced', async () => {
  const cli = bearer('acceptance')
  await request(trial, '/tasks', 401)
  await request(trial, '/tasks', 403, { Origin: 'https://example.invalid' })
  const offer = await request(trial, '/ticket', 200, cli, {})
  const ticket = new URL((await offer.json()).url).hash.slice(1)
  const session = await request(trial, '/session', 200, { Origin: trial }, { ticket })
  await request(trial, '/session', 401, { Origin: trial }, { ticket })
  const cookie = { Cookie: session.headers.get('set-cookie').split(';')[0] }
  const ui = { ...cookie, Origin: trial }
  const draft = { title: 'Synthetische Integrationsprobe ' + randomUUID(),
    detail: 'Diese Probe bleibt im Testprofil.', kind: 'task', date: '2090-01-29' }
  await request(trial, '/tasks', 403, cookie, { ...draft, confirm: true })
  await request(trial, '/tasks', 403, ui, draft)
  await request(primary, '/tasks', 403, bearer('local'), draft)
  const task = await (await request(trial, '/tasks', 201, ui, { ...draft, confirm: true })).json()
  try {
    const actual = await (await request(trial, '/tasks/' + task.id, 200, cli)).json()
    assert.equal(actual.task.title, task.title)
    await request(trial, '/tasks/' + task.id + '/edit', 400, cli, {
      patch: { priority: ['high'] }, revision: task.revision, confirm: true,
    })
    const changed = await (await request(trial, '/tasks/' + task.id + '/edit', 200, cli, {
      patch: { priority: 'high', steps: [{ title: 'Verlauf prüfen', done: true }] }, revision: task.revision, confirm: true,
    })).json()
    assert.equal(changed.priority, 'high')
    await request(trial, '/tasks/' + task.id + '/edit', 409, ui, {
      patch: { status: 'done' }, revision: task.revision, confirm: true,
    })
    const scheduled = await (await request(trial, '/tasks/' + task.id + '/schedule', 201, ui, {
      kind: 'reminder', at: '2090-01-28T09:00', confirm: true,
    })).json()
    const schedule = await (await request(trial, '/schedule', 200, cli)).json()
    assert.ok(schedule.some(item => item.id === scheduled.id && item.at === '2090-01-28T08:00:00.000Z'))
    await request(trial, '/week', 401)
    await request(trial, '/week?date=2090-02-30', 400, cli)
    const weekPath = '/week?date=2090-01-29'
    const cliWeek = await (await request(trial, weekPath, 200, cli)).json()
    assert.deepEqual(cliWeek, await (await request(trial, weekPath, 200, ui)).json())
    assert.deepEqual(cliWeek.entries.filter(item => item.taskId === task.id).map(item => item.kind), ['reminder', 'deadline'])
    assert.ok(!((await (await request(primary, weekPath, 200, bearer('local'))).json()).entries.some(item => item.taskId === task.id)))
    const freePath = '/free-windows?date=2090-01-28&days=1&start=08:30&end=10:00&minutes=60'
    await request(trial, freePath, 401)
    await request(trial, '/free-windows?date=2090-01-28&end=invalid', 400, cli)
    const cliFree = await (await request(trial, freePath, 200, cli)).json()
    assert.deepEqual(cliFree, await (await request(trial, freePath, 200, ui)).json())
    assert.equal(cliFree.windows[0]?.at, '2090-01-28T07:30:00.000Z')
    await request(trial, '/schedule/' + scheduled.id + '/dismiss', 403, ui, {})
    await request(trial, '/schedule/' + scheduled.id + '/dismiss', 200, ui, { confirm: true })
    await request(trial, '/tools/send', 403, ui, {})
    await request(trial, '/runs', 403, cli, { agent: 'lifepilot', key: randomUUID(), input: 'Unbestätigte Testprobe.' })
    await request(primary, '/runs', 423, bearer('local'), {
      agent: 'lifepilot', key: randomUUID(), input: 'Synthetische Testprobe.', synthetic: true,
    })
    await request(primary, '/runs/' + randomUUID() + '/decision', 423, bearer('local'), {
      approval: randomUUID(), decision: 'approve',
    })
  } finally {
    const { task: latest } = await (await request(trial, '/tasks/' + task.id, 200, cli)).json()
    await request(trial, '/tasks/' + task.id + '/edit', 200, cli, {
      patch: { status: 'archived' }, revision: latest.revision, confirm: true,
    })
  }
})

test('Model preview is owner-only, matches across browser and CLI, and expires on cancellation', async () => {
  const cli = bearer('acceptance')
  const offer = await request(trial, '/ticket', 200, cli, {})
  const ticket = new URL((await offer.json()).url).hash.slice(1)
  const session = await request(trial, '/session', 200, { Origin: trial }, { ticket })
  const ui = { Cookie: session.headers.get('set-cookie').split(';')[0], Origin: trial }
  const input = 'Synthetische Prüfung der Auftragsdaten.'
  const run = await (await request(trial, '/runs', 201, cli, { agent: 'lifepilot', input, synthetic: true, key: randomUUID() })).json()
  const prefix = '/runs/' + run.id
  const preview = prefix + '/model-preview?approval=' + run.approvals[0].id
  try {
    await request(trial, preview, 401)
    await request(trial, preview, 403, { ...ui, Origin: 'https://example.invalid' })
    await request(trial, prefix + '/model-preview?approval=' + randomUUID(), 409, cli)
    const [a, b] = await Promise.all([request(trial, preview, 200, cli), request(trial, preview, 200, ui)])
    const payload = await a.json()
    assert.deepEqual(payload, await b.json())
    assert.equal(payload.payload.messages[0].input, input)
  } finally {
    await request(trial, prefix + '/cancel', 200, cli, {})
  }
  await request(trial, preview, 409, cli)
})

test('Selected text sources stay separate and require a valid test profile and consent', async () => {
  const cli = bearer('acceptance')
  const note = { name: 'Seminarauszug.txt', text: 'Lesen Sie den Text zur Datenqualität.' }
  const requestBody = { agent: 'lifepilot', input: 'Lies die fiktive Quelle.', synthetic: true, key: randomUUID(), sourceNote: note }
  await request(primary, '/runs', 423, bearer('local'), requestBody)
  await request(trial, '/runs', 403, cli, { ...requestBody, synthetic: false })
  await request(trial, '/runs', 400, cli, { ...requestBody, sourceNote: { ...note, name: '../Seminarauszug.txt' } })
  const run = await (await request(trial, '/runs', 201, cli, requestBody)).json()
  const route = '/runs/' + run.id
  try {
    assert.equal(run.sourceName, note.name)
    assert.equal(JSON.stringify(run).includes(note.text), false)
    const approval = String(run.approvals[0].id)
    const preview = await (await request(trial, route + '/model-preview?approval=' + approval, 200, cli)).json()
    assert.deepEqual(preview.payload.sourceNote, note)
    await request(trial, '/runs', 409, cli, { ...requestBody, sourceNote: { ...note, text: 'Andere Quelle' } })
  } finally { await request(trial, route + '/cancel', 200, cli, {}) }
})

test('Google connection is owner-only and external reads require an explicit request in the main profile', async () => {
  const local = bearer('local')
  await request(primary, '/google/status', 401)
  await request(primary, '/google/status', 403, { ...local, Origin: 'https://example.invalid' })
  await request(trial, '/google/status', 403, bearer('acceptance'))
  const status = await (await request(primary, '/google/status', 200, local)).json()
  assert.deepEqual(status.map(item => item.service), ['calendar', 'gmail', 'gmail-content', 'calendar-test', 'gmail-sort'])
  assert.ok(status.every(item => Object.keys(item).sort().join(',') === 'configured,connected,service'))
  await request(primary, '/google/calendar', 403, local)
  await request(primary, '/google/calendar', 403, local, { days: 7 })
  await request(primary, '/google/gmail', 400, local, { limit: 11, confirm: true })
  await request(primary, '/google/connect', 403, local, { service: 'gmail' })
  await request(primary, '/google/configure', 400, local, { service: 'calendar', confirm: true, credentials: { web: {} } })
  const offer = await (await request(primary, '/ticket', 200, local, {})).json()
  const uiSession = await request(primary, '/session', 200, { Origin: primary }, { ticket: new URL(offer.url).hash.slice(1) })
  const cookie = { Cookie: uiSession.headers.get('set-cookie').split(';')[0] }
  const invalidConfig = { service: 'calendar', confirm: true, credentials: { web: {} } }
  await request(primary, '/google/configure', 403, cookie, invalidConfig)
  await request(primary, '/google/configure', 400, { ...cookie, Origin: primary }, invalidConfig)
  await request(primary, '/google/send', 403, local, { confirm: true })
  assert.equal((await fetch(primary + '/oauth/google/callback?state=unknown&code=fixture')).status, 400)
})
