import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { openSync, closeSync, fstatSync } from 'node:fs'
import { join } from 'node:path'

export type ChatMode = 'disabled' | 'synthetic' | 'private'
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex')

/** A release applies only to the installed, hashed sources. A missing or unreadable file closes the gate. */
export function hasPrivateChatRelease(root: string, marker: string, version: string): boolean {
  try {
    const fd = openSync(marker, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    let approval
    try {
      const file = fstatSync(fd)
      if (!file.isFile() || (file.mode & 0o077) !== 0 || file.size > 2000 ||
        (process.getuid && file.uid !== process.getuid())) return false
      approval = JSON.parse(readFileSync(fd, 'utf8'))
    } finally { closeSync(fd) }
    const manifest = readFileSync(join(root, 'SHA256SUMS'))
    if (approval?.version !== version || approval?.approved !== true || approval?.manifest !== sha(manifest)) return false
    const base = realpathSync(root)
    const app = join(base, 'dist/app.js')
    const bundle = lstatSync(app)
    if (!bundle.isFile() || bundle.size > 5_000_000 || realpathSync(app) !== app ||
        approval?.ui !== sha(readFileSync(app))) return false
    const paths = new Set<string>()
    for (const line of manifest.toString('utf8').trimEnd().split('\n')) {
      const match = /^([a-f0-9]{64})  ([a-zA-Z0-9_./-]+)$/.exec(line)
      if (!match) return false
      const [, digest, name] = match
      if (paths.has(name) || name.split('/').some(part => !part || part === '.' || part === '..')) return false
      paths.add(name)
      const path = join(base, name)
      const stat = lstatSync(path)
      if (!stat.isFile() || stat.size > 5_000_000 || realpathSync(path) !== path || sha(readFileSync(path)) !== digest) return false
    }
    return ['hub/runtime/server.ts', 'hub/runtime/store.ts', 'hub/adapters/codex.ts',
      'agents/lifepilot/skills/alltag/SKILL.md', 'package-lock.json'].every(path => paths.has(path))
  } catch { return false }
}

/** The verifier and public key are provisioned outside the release by an administrator. */
export function hasVerifiedPrivateRelease(root: string) {
  const trust = '/Library/Application Support/LifePilot'
  const verifier = join(trust, 'verify-release')
  const key = join(trust, 'release-public.pem')
  try {
    for (const [path, directory] of [[trust, true], [verifier, false], [key, false]] as const) {
      const file = lstatSync(path)
      if (realpathSync(path) !== path || file.uid !== 0 || (file.mode & 0o022) !== 0 ||
          !(directory ? file.isDirectory() : file.isFile())) return false
    }
    return spawnSync(verifier, [root, key, '--require-admin-owned'], { stdio: 'ignore', timeout: 60_000, env: { PATH: '/usr/bin:/bin' } }).status === 0
  } catch { return false }
}
