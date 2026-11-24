import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--checkout'), 'Nur --checkout ist als Option zulässig.')
const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)))
const sha = value => createHash('sha256').update(value).digest('hex')
const pathsAllowed = /^(?:(?:agents|bin|docs|hub|scripts)\/|(?:\.gitignore|ADAPTER\.md|AGENTS\.md|README\.md|package(?:-lock)?\.json|tsconfig\.json|versions\.json)$)/
const manifest = args[0] === '--checkout'
  ? execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(path => pathsAllowed.test(path))
    .map(path => sha(readFileSync(join(root, path))) + '  ' + path).join('\n') + '\n'
  : readFileSync(join(root, 'SHA256SUMS'), 'utf8')
const scratch = mkdtempSync(join(tmpdir(), 'lifepilot-restore-check-'))
const origin = 'http://127.0.0.1:45139'
const env = { ...process.env, PATH: dirname(process.execPath) + ':' + process.env.PATH }
const owner = () => ({ Authorization: 'Bearer ' + readFileSync(join(scratch, 'user-data/trinity-audit/adapter-token'), 'utf8') })
const invoke = (program, args) => execFileSync(program, args, {
  cwd: scratch, env, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'],
})
const cli = (...args) => JSON.parse(invoke(process.execPath, ['hub/adapters/cli.ts', '--trinity-audit', ...args]))
const cliText = (...args) => invoke(process.execPath, ['hub/adapters/cli.ts', '--trinity-audit', ...args]).trim()
const mark = name => console.log(JSON.stringify({ name, status: 'passed' }))
let running = false

async function api(path, { status = 200, body, headers = owner() } = {}) {
  const res = await fetch(origin + '/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(res.status, status, path)
  return { data: await res.json(), cookie: res.headers.get('set-cookie') }
}
function start() {
  assert.equal(cli('start').running, true)
  running = true
}
function stop() {
  assert.equal(cli('stop').running, false)
  running = false
}

try {
  const paths = new Set()
  for (const line of manifest.trimEnd().split('\n')) {
    const match = /^([a-f0-9]{64})  ([a-zA-Z0-9_.\/-]+)$/.exec(line)
    assert.ok(match, 'Ungültiges Prüfmanifest')
    const [, digest, relative] = match
    assert.ok(pathsAllowed.test(relative))
    assert.ok(relative.split('/').every(part => part && part !== '.' && part !== '..'))
    assert.ok(!paths.has(relative), 'Doppelte Datei im Prüfmanifest')
    paths.add(relative)
    const source = join(root, relative)
    assert.equal(realpathSync(source), source, relative)
    const info = lstatSync(source)
    assert.ok(info.isFile(), relative)
    const bytes = readFileSync(source)
    assert.equal(sha(bytes), digest, relative)
    const target = join(scratch, relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bytes, { flag: 'wx', mode: info.mode & 0o700 })
  }
  assert.ok(paths.has('scripts/trinity-restore-check.mjs'))
  symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir')
  invoke('npm', ['run', 'build'])
  const version = JSON.parse(readFileSync(join(scratch, 'package.json'), 'utf8')).version
  console.log(JSON.stringify({ version, manifest: sha(manifest), files: paths.size }))
  start()
  assert.equal(cli('status').version, version)
  invoke(process.execPath, ['scripts/trinity-check.mjs'])
  mark('memory-scopes-through-cli-token-and-browser-session')

  const memory = cli('memory-add', 'lifepilot', 'Fiktive Restaurierung: Quellenworkshop jeden Mittwoch.', '--confirm', '--synthetic')
  const ticket = new URL(cliText('url')).hash.slice(1)
  const session = await api('/session', { headers: { Origin: origin }, body: { ticket } })
  const browser = { Cookie: session.cookie.split(';')[0], Origin: origin }
  const payload = { input: 'Lege eine Aufgabe zum fiktiven Quellenworkshop an.', agent: 'lifepilot', synthetic: true, key: randomUUID() }
  const { data: run } = await api('/runs', { headers: browser, body: payload, status: 201 })
  const approval = run.approvals[0].id
  const path = '/runs/' + run.id
  assert.equal(cli('show', run.id).id, run.id)
  const preview = cli('preview', run.id, approval)
  assert.ok(preview.payload.memory.some(item => item.id === memory.id))
  assert.equal((await api(path + '/model-preview?approval=' + approval, { headers: browser })).data.approval, approval)
  mark('shared-run-and-memory-preview')

  stop()
  start()
  await api('/state', { headers: browser, status: 401 })
  assert.equal(cli('show', run.id).state, 'permission')
  assert.equal(cli('memory-search', 'Quellenworkshop')[0].id, memory.id)
  assert.equal(cli('preview', run.id, approval).approval, approval)
  mark('restart-keeps-memory-and-valid-approval-but-expels-browser-session')

  const backup = cli('backup', '--confirm')
  const backupPath = join(scratch, 'user-data/trinity-audit/backups', backup.name)
  const backupDigest = sha(readFileSync(backupPath))
  cli('memory-revoke', memory.id, '--confirm')
  await api(path + '/model-preview?approval=' + approval, { status: 409 })
  await api(path + '/decision', { status: 409, body: { approval, decision: 'approve' } })
  mark('revoked-memory-blocks-preview-and-approval')

  stop()
  assert.equal(cli('restore', backup.name, '--confirm').restored, backup.name)
  assert.equal(sha(readFileSync(backupPath)), backupDigest, 'Die Sicherungsdatei muss unverändert bleiben')
  start()
  assert.equal(cli('memory-search', 'Quellenworkshop')[0].id, memory.id)
  const restored = cli('show', run.id)
  assert.equal(restored.state, 'failed', 'Ein Backup darf eine frühere Freigabe nicht wieder gültig machen')
  assert.equal(restored.approvals[0].state, 'revoked')
  assert.equal(restored.approvals[0].decided_via, 'restore')
  await api(path + '/decision', { status: 409, body: { approval, decision: 'approve' } })
  const resumed = cli('followup', run.id, '0', 'Plane nur die Vorbereitung für den fiktiven Workshop.', '--synthetic')
  assert.equal(resumed.id, run.id)
  assert.equal(resumed.state, 'permission')
  assert.ok(resumed.approvals.some(item => item.action === 'model' && item.state === 'pending' && item.id !== approval))
  mark('restore-needs-fresh-approval-and-preserves-run-id')
} finally {
  if (running) stop()
  rmSync(scratch, { recursive: true, force: true })
}
