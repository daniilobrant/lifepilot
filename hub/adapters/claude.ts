import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { data, MODEL_MS } from '../runtime/settings.ts'
import { MAX_MODEL_PAYLOAD_BYTES } from '../runtime/model-payload.ts'
import type { ModelMetrics } from '../runtime/store.ts'

/*
 * Claude Code CLI als Modell für LifePilot. Gleiche Schnittstelle wie runStructuredCodex: Prompt, JSON-Schema,
 * optional ein Bild. Claude bekommt keine Werkzeuge (keine Shell, keine Dateien, kein Web, keine MCP-Server),
 * läuft in einem leeren Temp-Ordner und liefert nur Text, den LifePilot als JSON prüft.
 */

const execute = promisify(execFile)
const providerFile = join(data, 'model-provider')
export type ModelProvider = 'codex' | 'claude'
export function modelProvider(): ModelProvider {
  try { return readFileSync(providerFile, 'utf8').trim() === 'claude' ? 'claude' : 'codex' } catch { return 'codex' }
}
export function setModelProvider(value: unknown): ModelProvider {
  if (value !== 'codex' && value !== 'claude') throw new Error('Unbekannter Modellanbieter.')
  writeFileSync(providerFile, value, { mode: 0o600 })
  return value
}

const candidates = () => [join(homedir(), '.local/bin/claude'), join(homedir(), '.claude/local/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude']
async function claudeBinary() {
  for (const path of candidates()) {
    if (!existsSync(path)) continue
    const info = await stat(path)
    // Nur eine Datei des eigenen Kontos oder von root, die niemand sonst ändern darf.
    if (info.isFile() && (info.uid === process.getuid!() || info.uid === 0) && (info.mode & 0o022) === 0) return path
  }
  return null
}
export async function claudeAvailable() { return Boolean(await claudeBinary()) }

let flags: Set<string> | undefined
async function supported(binary: string) {
  if (flags) return flags
  try {
    const { stdout } = await execute(binary, ['--help'], { timeout: 15000, maxBuffer: 256 * 1024, env: { HOME: process.env.HOME, PATH: '/usr/bin:/bin' } })
    flags = new Set(stdout.match(/--[a-z][a-z-]+/gu) ?? [])
  } catch { flags = new Set() }
  return flags
}

/** Holt das JSON-Objekt aus einer Textantwort (auch mit ```json-Zaun oder kurzem Vorspann). */
export function jsonFromText(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/u.exec(text)?.[1]
  const body = (fenced ?? text).trim()
  try { return JSON.parse(body) } catch { /* weiter unten */ }
  const start = body.indexOf('{'), end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new SyntaxError('Keine JSON-Antwort.')
  return JSON.parse(body.slice(start, end + 1))
}

const MAX_OUTPUT = 512_000

export async function runStructuredClaude<T>(prompt: string, contract: object, signal: AbortSignal, validate: (value: unknown) => T, image?: { photo: Buffer, format: 'png' | 'jpeg' }) {
  const started = performance.now()
  const metrics: ModelMetrics = { wallMs: 0, model: null, usage: null, cost: null }
  if (signal.aborted) return { result: null, error: 'Vorgang abgebrochen.', metrics }
  const directory = await mkdtemp(join(tmpdir(), 'lifepilot-claude-'))
  let abortReason = ''
  try {
    if (Buffer.byteLength(prompt) > MAX_MODEL_PAYLOAD_BYTES) throw new Error('Der Analysekontext ist zu groß.')
    if (image && image.photo.length > 4 * 1024 * 1024) throw new Error('Das aufbereitete Bild ist zu groß.')
    const binary = await claudeBinary()
    if (!binary) throw new Error('Die Claude Code CLI ist nicht installiert oder nicht angemeldet. Installiere sie oder stelle in den Einstellungen auf Codex um.')
    const known = await supported(binary)
    const schema = JSON.stringify(contract)
    const instruction = prompt + '\n\nAntworte ausschließlich mit einem JSON-Objekt, das genau diesem JSON-Schema entspricht, ohne Erklärung davor oder danach:\n' + schema
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']
    if (known.has('--json-schema')) args.push('--json-schema', schema)
    if (known.has('--tools')) args.push('--tools', '')
    else if (known.has('--disallowedTools')) args.push('--disallowedTools', 'Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,NotebookEdit,Task,TodoWrite')
    if (known.has('--strict-mcp-config')) args.push('--strict-mcp-config')
    if (known.has('--max-turns')) args.push('--max-turns', '2')
    if (known.has('--no-session-persistence')) args.push('--no-session-persistence')
    const content: object[] = [{ type: 'text', text: instruction }]
    if (image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/' + image.format, data: image.photo.toString('base64') } })
    const message = JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n'
    const command = spawn(binary, args, {
      cwd: directory, env: { HOME: process.env.HOME, PATH: '/usr/bin:/bin', TMPDIR: directory, DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1' },
      detached: true, stdio: ['pipe', 'pipe', 'pipe'],
    })
    function stop(reason: string) {
      abortReason ||= reason
      if (command.pid) { try { process.kill(-command.pid, 'SIGKILL') } catch { /* schon beendet */ } }
    }
    const abort = () => stop('Vorgang abgebrochen.')
    const timer = setTimeout(() => stop('Das Zeitbudget für Claude wurde überschritten.'), MODEL_MS)
    signal.addEventListener('abort', abort, { once: true })
    let bytes = 0, pending = '', final: Record<string, unknown> | undefined, text = ''
    let code: number | null
    try {
      command.stdout.setEncoding('utf8')
      command.stdout.on('data', (chunk: string) => {
        bytes += Buffer.byteLength(chunk)
        if (bytes > MAX_OUTPUT) return stop('Das Ausgabebudget für Claude wurde überschritten.')
        pending += chunk
        const lines = pending.split('\n')
        pending = lines.pop() ?? ''
        for (const line of lines) {
          try {
            const event = JSON.parse(line) as Record<string, any>
            if (event.type === 'assistant') {
              for (const block of event.message?.content ?? []) {
                if (block.type === 'text' && typeof block.text === 'string') text += block.text
                if (block.type === 'tool_use') stop('Claude wollte ein Werkzeug verwenden, das für LifePilot gesperrt ist.')
              }
              if (typeof event.message?.model === 'string' && /^[\w.-]{1,80}$/u.test(event.message.model)) metrics.model = event.message.model
            }
            if (event.type === 'result') final = event
          } catch { /* Diagnosezeilen ohne JSON */ }
        }
      })
      command.stderr.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > MAX_OUTPUT) stop('Das Ausgabebudget für Claude wurde überschritten.') })
      command.stdin.on('error', () => {})
      command.stdin.end(message)
      code = await new Promise<number | null>((resolve, reject) => { command.once('error', reject); command.once('close', resolve) })
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
    }
    if (abortReason) throw new Error(abortReason)
    if (final?.usage && typeof final.usage === 'object') {
      metrics.usage = Object.fromEntries(Object.entries(final.usage as Record<string, unknown>).filter(([key, value]) =>
        ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'].includes(key) && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)) as ModelMetrics['usage']
    }
    if (code !== 0 || !final || final.is_error === true) {
      const detail = typeof final?.result === 'string' && /login|auth|anmeld|credit|limit/iu.test(final.result) ? ' Prüfe Anmeldung oder Nutzungslimit der Claude Code CLI.' : ''
      throw new Error('Claude konnte den Auftrag nicht abschließen.' + detail)
    }
    const structured = final.structured_output
    const value = structured && typeof structured === 'object' ? structured : jsonFromText(typeof final.result === 'string' && final.result ? final.result : text)
    return { result: validate(value), error: null, metrics }
  } catch (cause) {
    const message = cause instanceof Error && !('code' in cause) && !(cause instanceof SyntaxError)
      ? cause.message : 'Claude war nicht erreichbar oder hat kein lesbares Ergebnis geliefert.'
    return { result: null, error: message, metrics }
  } finally {
    metrics.wallMs = Math.round(performance.now() - started)
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}
