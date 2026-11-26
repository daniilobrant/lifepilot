import { createHash, randomBytes } from 'node:crypto'
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import { data, host, port } from './settings.ts'

function socketPath(create: boolean) {
  const uid = process.getuid!()
  const key = createHash('sha256').update(realpathSync(data)).digest('hex').slice(0, 24)
  const directory = join('/tmp', `lifepilot-${uid}-${key}`)
  if (create) mkdirSync(directory, { recursive: true, mode: 0o700 })
  const stat = lstatSync(directory)
  if (!stat.isDirectory() || stat.uid !== uid || (stat.mode & 0o077)) throw Error('Unsicherer Adapterordner.')
  return join(directory, port + '.sock')
}

// Only called after this instance has acquired its exclusive loopback port.
export function prepareAdapterSocket() {
  const path = socketPath(true)
  const stale = lstatSync(path, { throwIfNoEntry: false })
  if (stale) {
    if (!stale.isSocket() || stale.uid !== process.getuid!()) throw Error('Ungültiger Adapterpfad.')
    unlinkSync(path)
  }
  return path
}

export function adapterToken(path: string, create = false) {
  if (create) {
    try { writeFileSync(path, randomBytes(32).toString('base64url'), { flag: 'wx', mode: 0o600 }) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.uid !== process.getuid!() || stat.nlink !== 1 || (stat.mode & 0o077) || stat.size !== 43) throw Error('Ungültige lokale Schlüsseldatei.')
    const value = readFileSync(fd, 'utf8')
    if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) throw Error('Ungültiger lokaler Schlüssel.')
    return value
  } finally { closeSync(fd) }
}

export function adapterRequest(path: string, headers: Record<string,string>, body: string | Buffer | undefined, timeout: number) {
  return new Promise<{status:number, text:string}>((resolve, reject) => {
    const req = request({ socketPath:socketPath(false), path:'/api'+path, method:body === undefined ? 'GET' : 'POST',
      headers:{ ...headers, Host:host }, signal:AbortSignal.timeout(timeout) }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('error', reject)
      res.on('end', () => resolve({ status:res.statusCode ?? 500, text:Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.end(body)
  })
}
