import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

const root = new URL('../', import.meta.url)
const origin = 'http://127.0.0.1:45139'
const bearer = name => ({ Authorization: 'Bearer ' + readFileSync(new URL('user-data/trinity-audit/' + name, root), 'utf8') })
const owner = bearer('adapter-token')
const probe = bearer('probe-token')
const tag = 'Quarz' + randomUUID().slice(0, 8)
if (process.argv.slice(2).some(arg => arg !== '--local-model')) throw new Error('Das Prüfprofil unterstützt nur --local-model.')
const withModel = process.argv.includes('--local-model')
const taskIds = []
const memoryIds = []

async function api(path, { headers = owner, body, status = 200 } = {}) {
  const options = body === undefined ? { headers } : {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }
  const res = await fetch(origin + '/api' + path, { ...options, signal: AbortSignal.timeout(7000) })
  assert.equal(res.status, status, path)
  return { data: await res.json(), cookie: res.headers.get('set-cookie') }
}
async function task(title) {
  const { data } = await api('/tasks', { status: 201, body: { title, detail: 'Synthetische Prüfaufgabe.', date: '2090-11-23', kind: 'task', confirm: true } })
  taskIds.push(data.id)
  return data
}
async function permit(run, action) {
  const approval = run.approvals.find(item => item.action === action && item.state === 'pending')
  assert.ok(approval)
  return (await api('/runs/' + run.id + '/decision', { body: { approval: approval.id, decision: 'approve' } })).data
}
async function evaluate(name, pending) {
  await permit(pending, 'model')
  for (let i = 0; i < 95; i++) {
    const { data } = await api('/runs/' + pending.id)
    if (['review', 'failed'].includes(data.state)) {
      console.log(JSON.stringify({ case: name, id: data.id, turn: data.turn, state: data.state, result: data.result, metrics: data.metrics, error: data.error }))
      assert.equal(data.state, 'review', data.error ?? name)
      return data
    }
    await delay(1000)
  }
  throw new Error('Zeitlimit: ' + name)
}
async function submit(input) {
  return (await api('/runs', { status: 201, body: { input, key: randomUUID(), agent: 'lifepilot', synthetic: true } })).data
}
async function follow(run, input) {
  return (await api('/runs/' + run.id + '/followup', { status: 201,
    body: { input, key: randomUUID(), turn: run.turn, synthetic: true } })).data
}

try {
  for (const scope of ['owner', 'lifepilot', 'trinity-probe']) {
    const { data } = await api('/memory', { status: 201, body: { scope, content: tag + ' ' + scope, synthetic: true, confirm: true } })
    memoryIds.push(data.id)
  }
  const { data: offer } = await api('/ticket', { headers: probe, body: {} })
  const { cookie } = await api('/session', { headers: { Origin: origin }, body: { ticket: new URL(offer.url).hash.slice(1) } })
  const browser = { Cookie: cookie.split(';')[0], Origin: origin }
  for (const headers of [probe, browser]) {
    const { data } = await api('/memory?scope=trinity-probe&q=' + tag, { headers })
    assert.deepEqual(data.map(item => item.id), [memoryIds[2]])
    for (const scope of ['owner', 'lifepilot']) await api('/memory?scope=' + scope + '&q=' + tag, { headers, status: 403 })
    await api('/state', { headers, status: 403 })
    await api('/week', { headers, status: 403 })
    await api('/free-windows', { headers, status: 403 })
    await api('/memory', { headers, status: 403, body: { scope: 'trinity-probe', content: 'Probe', synthetic: true, confirm: true } })
    await api('/runs', { headers, status: 403, body: { input: tag, key: randomUUID(), agent: 'lifepilot', synthetic: true } })
  }
  const { data: ownerView } = await api('/memory?scope=lifepilot&q=' + tag)
  assert.deepEqual(ownerView.map(item => item.id), [memoryIds[1]])
  console.log(JSON.stringify({ case: 'memory-isolation', result: 'passed', transports: ['bearer', 'browser-origin-cookie'], allow: 'own synthetic memory', deny: ['owner memory','LifePilot memory','workspace','mutation','model'] }))

  if (withModel) {
    const [north, south] = await Promise.all([task(tag + ' Präsentation Nord'), task(tag + ' Präsentation Süd')])
    const ambiguous = await evaluate('similar-tasks', await submit('Verschiebe die ' + tag + ' Präsentation auf den 29. November 2090.'))
    assert.ok(ambiguous.result.questions.length && ambiguous.result.actions.length === 0 && ambiguous.result.tasks.length === 0)
    const chosen = await evaluate('resolve-task', await follow(ambiguous, 'Ich meine die Präsentation Süd.'))
    assert.equal(chosen.id, ambiguous.id)
    assert.deepEqual(chosen.result.actions.map(({ kind, target, value }) => [kind, target, value]), [['deadline', south.id, '2090-11-29']])
    const revised = await evaluate('correct-date', await follow(chosen, 'Doch auf den 30. November 2090.'))
    const obsolete = chosen.approvals.find(item => item.action === 'adopt')
    await api('/runs/' + chosen.id + '/decision', { status: 404, body: { approval: obsolete.id, decision: 'approve' } })
    assert.deepEqual(revised.result.actions.map(({ kind, target, value }) => [kind, target, value]), [['deadline', south.id, '2090-11-30']])
    await permit(revised, 'adopt')
    assert.equal((await api('/tasks/' + south.id)).data.task.due_date, '2090-11-30')
    assert.equal((await api('/tasks/' + north.id)).data.task.due_date, '2090-11-23')
    const weekday = await evaluate('ambiguous-weekday', await submit('Die ' + tag + ' Präsentation Nord soll nächsten Freitag fällig sein.'))
    assert.ok(weekday.result.questions.length && weekday.result.actions.length === 0 && weekday.result.tasks.length === 0)
  }
} finally {
  for (const id of taskIds) {
    const { data } = await api('/tasks/' + id)
    await api('/tasks/' + id + '/edit', { body: { patch: { status: 'archived' }, revision: data.task.revision, confirm: true } })
  }
  for (const id of memoryIds) await api('/memory/' + id + '/erase', { body: { confirm: true } })
}
