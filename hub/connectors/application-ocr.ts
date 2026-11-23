import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { IncomingMessage } from 'node:http'
import { promisify } from 'node:util'
import { Problem, root } from '../runtime/settings.ts'
import { MAX_SOURCE_BYTES } from '../runtime/source-note.ts'
import { extractApplicationFields } from '../runtime/applications.ts'

const execute = promisify(execFile)
const maximum = 5 * 1024 * 1024

export async function uploadApplicationImage(req: IncomingMessage) {
  return recognizeApplicationImage(await readDocument(req))
}

export async function uploadChatDocument(req: IncomingMessage) {
  const text = await recognizeDocument(await readDocument(req), true)
  if (!text.trim()) throw new Problem(422, 'Die Datei enthält keinen lesbaren Text.')
  return {text}
}

async function readDocument(req: IncomingMessage) {
  const size = Number(req.headers['content-length'])
  if (Number.isFinite(size) && size > maximum) throw new Problem(413, 'Ein Bild darf höchstens 5 MB groß sein.')
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.from(chunk)
    length += bytes.length
    if (length > maximum) throw new Problem(413, 'Ein Bild darf höchstens 5 MB groß sein.')
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}

export async function recognizeApplicationImage(image: Buffer) {
  const text = await recognizeDocument(image)
  return { fields:extractApplicationFields(text), text }
}

async function recognizeDocument(image: Buffer, allowPDF = false) {
  const pdf = allowPDF && image.subarray(0,5).toString('ascii') === '%PDF-'
  const png = image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  const jpeg = image.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
  if (image.length > maximum || (!png && !jpeg && !pdf)) throw new Problem(400, allowPDF ?
    'Wähle ein PDF, PNG oder JPEG bis 5 MB.' : 'Wähle ein PNG- oder JPEG-Bild bis 5 MB.')
  const directory = await mkdtemp(join(tmpdir(), 'lifepilot-ocr-'))
  try {
    const file = join(directory, pdf ? 'document.pdf' : png ? 'document.png' : 'document.jpg')
    await writeFile(file, image, { mode: 0o600, flag: 'wx' })
    const { stdout } = await execute(join(root, 'dist/application-ocr'), [file], { maxBuffer: 64_000, timeout: 15_000 })
    const lines: unknown = JSON.parse(stdout)
    if (!Array.isArray(lines) || lines.some(line => typeof line !== 'string')) throw Error()
    const text = lines.join('\n').slice(0, 4500)
    let size = 0
    let end = 0
    for (const character of text) {
      size += Buffer.byteLength(character, 'utf8')
      if (size > MAX_SOURCE_BYTES) break
      end += character.length
    }
    return text.slice(0,end)
  } catch {
    throw new Problem(422, pdf ? 'Das PDF konnte nicht gelesen werden. Verwende ein ungeschütztes Text-PDF.' :
      'Das Bild konnte nicht gelesen werden. Prüfe das Bild und ob die macOS-Texterkennung installiert ist.')
  } finally { await rm(directory, { recursive: true, force: true }).catch(() => {}) }
}
