import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { Problem, root } from '../runtime/settings.ts'

const execute = promisify(execFile)
export const maxDictationBytes = 8 * 1024 * 1024
let active = false

export async function transcribeDictation(audio:Buffer) {
  if (audio.length<12 || audio.toString('ascii',4,8)!=='ftyp') throw new Problem(415,'Die lokale Spracherkennung benötigt eine MP4-Audioaufnahme.')
  if (active) throw new Problem(429,'Eine Aufnahme wird bereits ausgewertet.')
  active=true
  let directory:string|undefined
  try {
    directory=await mkdtemp(join(tmpdir(),'lifepilot-dictation-'))
    const path=join(directory,'recording.m4a')
    await writeFile(path,audio,{mode:0o600,flag:'wx'})
    const {stdout}=await execute(join(root,'dist/local-dictation'),[path],{maxBuffer:24_000,timeout:80_000})
    return {text:stdout.trim().slice(0,6000)}
  } catch {
    throw new Problem(422,'Die Aufnahme konnte auf diesem Mac nicht transkribiert werden.')
  } finally {
    active=false
    if (directory) await rm(directory,{force:true,recursive:true}).catch(()=>{})
  }
}
