import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { hasPrivateChatRelease, type ChatMode } from './chat-release.ts'

export const root = fileURLToPath(new URL('../../', import.meta.url))
export const audit = process.argv.includes('--trinity-audit')
export const nightbot = process.argv.includes('--nightbot')
export const acceptance = audit || process.argv.includes('--acceptance')
export const port = audit ? 45139 : acceptance ? 45138 : nightbot ? 45140 : 45137
export const host = `127.0.0.1:${port}`
export const origin = `http://${host}`
export const data = join(root, 'user-data', audit ? 'trinity-audit' : acceptance ? 'acceptance' : 'local')
export const database = join(data, 'memory.sqlite3')
export const secretPath = join(data, 'adapter-token')
export const probeSecretPath = join(data, 'probe-token')
export const fixtures = JSON.parse(readFileSync(new URL('../templates/acceptance.json', import.meta.url), 'utf8')) as { ui: string, cli: string, memory: string }
export const version = '1.0.13'
export const chatMode: ChatMode = acceptance ? 'synthetic' :
  hasPrivateChatRelease(root, join(data, 'private-chat-release.json'), version) ? 'private' : 'disabled'
export const cloudModel = chatMode === 'private'
export const schemaVersion = 38
export const MAX_INPUT = 6000
export const APPROVAL_MS = 30 * 60 * 1000
export const MODEL_MS = 90_000

export class Problem extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
