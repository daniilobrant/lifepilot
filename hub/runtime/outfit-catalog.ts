import { readFileSync } from 'node:fs'
import type { WardrobeDraft } from './outfit-types.ts'

// The small catalog contains fingerprints of public manufacturer photos, plus the source pages.
const references = (JSON.parse(readFileSync(new URL('../templates/outfit-product-references.json',import.meta.url),'utf8')) as
  (Partial<WardrobeDraft> & {fingerprints:string[]})[]).map(({fingerprints,...draft})=>({
    draft,fingerprints:fingerprints.map(value=>Buffer.from(value,'base64')),
  }))

function distance(a: Buffer, b: Buffer) {
  let total=0
  for (let i=0;i<a.length;i++) {
    let diff=a[i]^b[i]
    while(diff) { diff &= diff-1; total++ }
  }
  return total
}

export function matchProductPhoto(fingerprint: unknown) {
  if (typeof fingerprint!=='string' || fingerprint.length!==88) return
  const candidate=Buffer.from(fingerprint,'base64')
  if (candidate.length!==64) return
  const matches=references.map(ref=>({draft:ref.draft,score:Math.min(...ref.fingerprints.map(item=>distance(candidate,item)))}))
    .sort((a,b)=>a.score-b.score)
  if (matches[0].score<=14 && matches[1].score-matches[0].score>=16) return matches[0].draft
}
