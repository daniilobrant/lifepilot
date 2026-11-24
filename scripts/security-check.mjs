import { spawnSync } from 'node:child_process'
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)))
const scratch = mkdtempSync(join(tmpdir(), 'lifepilot-security-'))
const source = join(scratch, 'source')
const gitleaks = process.env.LIFEPILOT_GITLEAKS || 'gitleaks'
const semgrep = process.env.LIFEPILOT_SEMGREP || 'semgrep'
const unscanned = new Set(['.git', '.runtime', 'dist', 'node_modules', 'user-data'])
let failed = false

function run(command, args, { capture = false, cwd = root } = {}) {
  const result = spawnSync(command, args, {
    cwd, stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 240_000,
  })
  if (result.error) {
    console.error(command + ': ' + (result.error.code || 'Start fehlgeschlagen'))
  }
  if (result.status !== 0) failed = true
  return result
}

function jsonOutput(label, result, summary) {
  try {
    summary(JSON.parse(result.stdout))
  } catch {
    failed = true
    console.error(label + ': kein auswertbarer JSON-Bericht')
  }
}

try {
  const files = run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { capture: true })
  if (files.status !== 0) throw new Error('Git-Dateiliste konnte nicht gelesen werden.')
  mkdirSync(source)
  for (const name of new Set(files.stdout.split('\0').filter(Boolean))) {
    const from = resolve(root, name)
    const fromRoot = relative(root, from)
    if (fromRoot.split(/[\\/]/u).some(part => part === '..' || unscanned.has(part))) continue
    if (!lstatSync(from, { throwIfNoEntry: false })?.isFile()) continue
    if (realpathSync(from) !== from) {
      failed = true
      console.error('Sicherheitscheck: Datei unter einem symbolischen Verzeichnispfad übersprungen.')
      continue
    }
    const to = join(source, fromRoot)
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
  }

  run(gitleaks, ['version'])
  run(gitleaks, ['git', '--redact=100', '--no-banner', '--log-opts=--all', '.'])
  run(gitleaks, ['dir', '--redact=100', '--no-banner', '.'], { cwd: source })

  console.log('Python: nicht anwendbar im aktuellen Repository (kein Python-Quellcode oder Python-Projektmanifest).')
  run(semgrep, ['--version'])
  jsonOutput('Semgrep', run(semgrep, ['scan', '--config', 'p/default', '--metrics=off',
    '--disable-version-check', '--error', '--strict', '--json', '.'], { cwd: source, capture: true }), report => {
    console.log('Semgrep: %d geprüfte Dateien, %d Befunde, %d Diagnosen.',
      report.paths?.scanned?.length ?? 0, report.results?.length ?? 0, report.errors?.length ?? 0)
    for (const item of report.results ?? []) {
      console.log(JSON.stringify({ file: item.path, line: item.start?.line, rule: item.check_id }))
    }
    for (const item of report.errors ?? []) {
      console.log(JSON.stringify({ file: item.path, code: item.code, level: item.level, type: item.type?.[0] }))
    }
  })

  run('npm', ['--version'])
  jsonOutput('npm audit', run('npm', ['audit', '--package-lock-only', '--json',
    '--registry=https://registry.npmjs.org'], { cwd: source, capture: true }), report => {
    if (!report.metadata?.vulnerabilities) throw new Error('Advisory-Dienst lieferte keinen Auditbericht.')
    console.log('npm audit:', JSON.stringify(report.metadata.vulnerabilities))
    for (const [name, finding] of Object.entries(report.vulnerabilities ?? {})) {
      console.log(JSON.stringify({ name, severity: finding.severity }))
    }
  })
} finally {
  rmSync(scratch, { recursive: true, force: true })
  if (failed) process.exitCode = 1
}
