// Lokale, wiederkehrende Sicherheitsprüfung: node scripts/security-check.mjs (oder npm run security:check).
// Läuft nur auf diesem Rechner, versendet nichts und legt keine Benachrichtigungen an. Fehlende Werkzeuge werden gemeldet, nicht still übersprungen.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const path = [process.env.PATH, join(homedir(), 'Library/Python/3.9/bin'), join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean).join(':')
const env = { ...process.env, PATH: path }
const results = []
const run = (command, args, options = {}) => spawnSync(command, args, { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024, ...options })
const has = command => run('which', [command]).status === 0
const record = (name, state, detail = '') => { results.push({ name, state, detail }); console.log(`${state === 'ok' ? '✓' : state === 'skip' ? '–' : '✗'} ${name}${detail ? ' · ' + detail : ''}`) }

// 1. Abhängigkeiten
{
  const audit = run('npm', ['audit', '--json'])
  try {
    const counts = JSON.parse(audit.stdout).metadata.vulnerabilities
    record('npm audit', counts.total === 0 ? 'ok' : 'fail', `${counts.total} Schwachstellen`)
  } catch { record('npm audit', 'fail', 'Ausgabe nicht lesbar') }
}

// 2. Semgrep (Quellcode, Geheimnisse)
if (has('semgrep')) {
  const semgrep = run('semgrep', ['scan', '--config', 'p/default', '--config', 'p/secrets', '--metrics=off', '--quiet', '--error', 'hub', 'agents', 'bin'])
  record('Semgrep (p/default, p/secrets)', semgrep.status === 0 ? 'ok' : 'fail', semgrep.status === 0 ? 'keine Funde' : 'Funde, siehe Ausgabe von semgrep scan')
} else record('Semgrep', 'skip', 'nicht installiert (pip install --user semgrep)')

// 3. Gitleaks (Arbeitsstand und Verlauf)
if (has('gitleaks')) {
  const leaks = run('gitleaks', ['detect', '--redact', '--no-banner'])
  record('Gitleaks (Verlauf)', leaks.status === 0 ? 'ok' : 'fail', leaks.status === 0 ? 'keine Funde' : 'Funde (Werte redigiert)')
} else record('Gitleaks', 'skip', 'nicht installiert')

// 4. Python-Werkzeuge nur bei Python-Code
const python = run('git', ['ls-files', '*.py']).stdout.trim()
if (python) {
  record('Bandit', has('bandit') && run('bandit', ['-q', '-r', '.']).status === 0 ? 'ok' : 'fail')
  record('pip-audit', has('pip-audit') && run('pip-audit').status === 0 ? 'ok' : 'fail')
} else record('Bandit und pip-audit', 'skip', 'kein Python-Code im Projekt')

// 4b. Muster für private Daten und Zugangsdaten in versionierten Dateien (Arbeitsstand)
{
  const patterns = [
    ['private E-Mail-Adresse', '[A-Za-z0-9._%+-]+@(gmail|googlemail|outlook|hotmail|icloud|gmx|web)\\.(com|de)'],
    ['Matrikelnummer', 'st[0-9]{8}@stud\\.'],
    ['privater Schlüssel', 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY'],
    ['GitHub-Token', 'gh[pousr]_[A-Za-z0-9]{30,}'],
    ['API-Schlüssel', '(sk-[A-Za-z0-9]{32,}|AIza[0-9A-Za-z_-]{30,}|GOCSPX-[A-Za-z0-9_-]{10,})'],
    ['IBAN', '\\bDE[0-9]{20}\\b'],
  ]
  let hits = 0
  for (const [label, pattern] of patterns) {
    const found = spawnSync('git', ['grep', '-IlE', pattern, '--', '.', ':!package-lock.json', ':!scripts/security-check.mjs'], { encoding: 'utf8' })
    if (found.stdout.trim()) { hits++; console.log(`  Fund (${label}) in: ${found.stdout.trim().split('\n').join(', ')}`) }
  }
  record('Private Daten und Geheimnisse im Arbeitsstand', hits === 0 ? 'ok' : 'fail', hits === 0 ? 'keine Funde' : hits + ' Muster getroffen')
  const authors = run('git', ['log', '--all', '--format=%ae%n%ce']).stdout.split('\n').filter(mail => mail && !/noreply\.github\.com$|^noreply@github\.com$/u.test(mail))
  record('Autoren- und Committer-E-Mail im Verlauf', authors.length === 0 ? 'ok' : 'fail', authors.length === 0 ? 'nur noreply-Adressen' : new Set(authors).size + ' private Adresse(n) in ' + authors.length + ' Einträgen')
}

// 5. Funktionstests
{
  const tests = run('npm', ['test'])
  const pass = /ℹ pass (\d+)/u.exec(tests.stdout)?.[1], fail = /ℹ fail (\d+)/u.exec(tests.stdout)?.[1]
  record('Funktionstests', tests.status === 0 ? 'ok' : 'fail', `${pass ?? '?'} bestanden, ${fail ?? '?'} fehlgeschlagen`)
}

const failed = results.filter(result => result.state === 'fail').length
console.log(`\n${failed ? failed + ' Prüfung(en) fehlgeschlagen' : 'Alle ausgeführten Prüfungen bestanden'}${results.some(result => result.state === 'skip') ? ' (übersprungene Prüfungen siehe oben)' : ''}`)
process.exit(failed ? 1 : 0)
