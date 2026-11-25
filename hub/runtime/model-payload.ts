import type { Result } from '../../agents/lifepilot/tools/validate.ts'
import type { TaskContext } from './workspace.ts'
import type { SourceNote } from './source-note.ts'

export type ModelMessage = { input: string, referenceDay: string | null, previousResult?: Result | null, outcome?: { state:string, details?:unknown } }
export type ModelPayload = {
  mode?: 'personal'
  day: string | null
  timeZone: 'Europe/Berlin'
  messages: ModelMessage[]
  memory: { id: string, content: string, source: string, tags?: string[] }[]
  context: TaskContext[]
  sourceNote?: SourceNote
  directory?: unknown
  analyse?: unknown
}
export const dialogueOrderInstruction='Dialogreihenfolge: latestUserMessage ist der aktuelle Auftrag. Bei Widerspruch gilt je Feld die jüngste ausdrückliche Nutzerangabe, auch wenn ein älterer Vorschlag oder schon erledigter Vorgang andere Werte enthält. Frühere Nutzerangaben ergänzen nur fehlende Informationen zum selben Auftrag. Ein neuer Auftrag übernimmt keine Werte aus einem anderen Thema. earlierAssistantDraft und earlierOutcome sind frühere Assistentenergebnisse und keine Nutzerwünsche. Nutze das lokale referenceDay der jeweiligen Nachricht für relative Daten. Sind neue Angaben widersprüchlich oder mehrdeutig, frage gezielt nach, bevor du einen Vorschlag machst.'

export function modelDialogue(payload:ModelPayload){
  const latest=payload.messages.at(-1)
  const {messages,...fields}=payload
  const history=messages.map(({input,referenceDay,previousResult,outcome},index)=>({
    turn:index+1,referenceDay,
    ...(index<messages.length-1&&{input}),
    ...(previousResult&&{earlierAssistantDraft:previousResult}),
    ...(outcome&&{earlierOutcome:outcome}),
  }))
  return {...fields,messages:history,latestUserMessage:latest?{turn:messages.length,input:latest.input,referenceDay:latest.referenceDay}:null}
}

export type ModelPreview = { approval: string, expiresAt: string, payload: ModelPayload }
export const MAX_MODEL_PAYLOAD_BYTES = 128_000
export const MAX_CHAT_INPUT = 200_000
export const MAX_CHAT_BODY_BYTES = MAX_CHAT_INPUT * 6 + 60_000
export const MAX_CHAT_APPROVAL_BYTES = MAX_CHAT_BODY_BYTES * 2 + 120_000

export const CHAT_WINDOW_MESSAGES = 24
export const CHAT_WINDOW_BYTES = 56_000

export function boundedDialogue(messages:ModelMessage[]):ModelMessage[] {
  const view:ModelMessage[] = []
  let bytes = 0
  for (const message of messages.slice(-CHAT_WINDOW_MESSAGES).reverse()) {
    const size = new TextEncoder().encode(JSON.stringify(message)).length
    if (view.length>=2 && bytes + size > CHAT_WINDOW_BYTES) break
    view.unshift(message)
    bytes += size
  }
  return view
}


export function splitLongInput(input:string,limit=52_000){
  const chunks:string[]=[]
  const encoder=new TextEncoder()
  let start=0,bytes=0,index=0,boundary=0
  for(const character of input){
    const size=encoder.encode(character).byteLength
    if(bytes+size>limit){
      const end=boundary>start+(index-start)*0.7?boundary:index
      chunks.push(input.slice(start,end))
      start=end;bytes=encoder.encode(input.slice(start,index)).byteLength
    }
    index+=character.length;bytes+=size
    if(/\s/u.test(character))boundary=index
  }
  if(index>start)chunks.push(input.slice(start))
  return chunks
}
