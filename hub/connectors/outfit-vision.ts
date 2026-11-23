import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { Problem, root } from '../runtime/settings.ts'
import { identifiedColor } from '../runtime/outfit-palette.ts'
import { outfitFields } from '../runtime/outfit-fields.ts'
import { outfitUploadLimit, photoLimit, photoMime } from './outfit-import.ts'

const execute = promisify(execFile)
let active = 0

async function processPhoto(image: Buffer, fullPhoto: boolean) {
  if (image.length > outfitUploadLimit) throw new Problem(413,'Das Foto darf höchstens 16 MB groß sein.')
  const format = photoMime(image,true).split('/')[1]
  if (active >= 2) throw new Problem(429,'Die Bilderkennung ist beschäftigt. Versuche es gleich erneut.')
  active++
  let directory: string | undefined
  try {
    directory = await mkdtemp(join(tmpdir(),'lifepilot-outfit-vision-'))
    const path = join(directory,'outfit.'+format)
    await writeFile(path,image,{mode:0o600,flag:'wx'})
    const formatted = join(directory,fullPhoto?'look.jpg':'prepared.png')
    const { stdout } = await execute(join(root,'dist/outfit-vision'),[path,formatted,...(fullPhoto?['full']:[])],{maxBuffer:24_000,timeout:15_000})
    const photo = await readFile(formatted)
    if (photo.length > photoLimit || photoMime(photo) !== (fullPhoto?'image/jpeg':'image/png')) throw Error()
    return {photo,stdout}
  } catch {
    throw new Problem(422,'Das Foto konnte nicht verarbeitet werden. Versuche ein anderes Bild.')
  } finally {
    active--
    if (directory) await rm(directory,{force:true,recursive:true}).catch(()=>{})
  }
}

export async function prepareFullOutfitPhoto(image: Buffer) {
  return (await processPhoto(image,true)).photo
}

export async function analyzeOutfitPhoto(image: Buffer) {
  const {photo,stdout} = await processPhoto(image,false)
  const { lines, labels, color, feature, containsPerson, checkedPeople } = JSON.parse(stdout)
  if (!Array.isArray(lines) || !Array.isArray(labels)) throw new Problem(422,'Die Analyse lieferte kein lesbares Ergebnis.')
  const text = lines.filter(value=>typeof value==='string').join('\n').slice(0,3200)
  const draft = outfitFields(text, labels.filter(label=>typeof label === 'string').slice(0,20),
    typeof color === 'string' ? identifiedColor(color) : '')
  return {draft,photo,feature,recognizedText:text,personFree:checkedPeople===true && containsPerson===false}
}
