import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const root = new URL('../', import.meta.url)
const origin = 'http://127.0.0.1:45139'
const bearer = name => ({ Authorization: 'Bearer ' + readFileSync(new URL('user-data/trinity-audit/' + name, root), 'utf8') })
const owner = bearer('adapter-token')
const probe = bearer('probe-token')
const tag = 'Quarz' + randomUUID().slice(0, 8)
if (process.argv.length > 2) throw new Error('Das Trinity-Prüfprofil läuft ohne Modelloption.')
const memoryIds = []

async function api(path, { headers = owner, body, status = 200 } = {}) {
  const options = body === undefined ? { headers } : {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }
  const res = await fetch(origin + '/api' + path, { ...options, signal: AbortSignal.timeout(7000) })
  assert.equal(res.status, status, path)
  return { data: await res.json(), cookie: res.headers.get('set-cookie') }
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

} finally {
  for (const id of memoryIds) await api('/memory/' + id + '/erase', { body: { confirm: true } })
}
