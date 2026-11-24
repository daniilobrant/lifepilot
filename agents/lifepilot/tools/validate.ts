import {hasRecipeQuantity,validRecipeServings} from '../../../hub/runtime/recipe-portions.ts'
import type {ProjectPlan} from '../../../hub/runtime/project-types.ts'
import type {SeriesPlan} from '../../../hub/runtime/calendar-series-types.ts'
import {normalizeTripIntake,tripIntakeQuestions} from '../../../hub/runtime/trip-intake.ts'
import type { GroceryPlan } from '../../../hub/runtime/grocery-types.ts'
import type { FinanceBatch, FinanceChat } from '../../../hub/runtime/finance-types.ts'
import type { Category } from '../../../hub/runtime/categories.ts'
import type { TripChatPlan } from '../../../hub/runtime/trip-types.ts'
import { readFileSync } from 'node:fs'
import { Ajv } from 'ajv'
import type { FragranceChatPlan, OutfitChatPlan } from '../../../hub/runtime/outfit-types.ts'
import type { FreeQuery } from '../../../hub/runtime/availability.ts'
import type { Priority, TaskContext } from '../../../hub/runtime/workspace.ts'
import { bounded, isDate } from '../../../hub/runtime/values.ts'

export type Block = { start: string, minutes: number | null, weeks: number }
export type Task = { title: string, doneWhen: string, evidence: string, kind: 'task' | 'appointment', date: string | null, category?: Category | null, priority?:Priority, steps?: string[], blocks?: Block[] }
export type Proposal = {
  kind: 'deadline' | 'priority' | 'complete' | 'plan' | 'reschedule' | 'reminder' | 'remember' | 'correct_memory' | 'rename' | 'description' | 'category' | 'archive',
  target: string | null, value: string, duration: number | null, reason: string, tags?: string[]
}
export type Advice = { target: string, reason: string }
export type Result = { skill?: 'inbox_refresh' | 'appointment' | 'deadline_guardian' | 'smart_planning' | 'applications' | 'outfit' | 'travel' | 'finance' | 'grocery' | 'orders' | 'calendar_series' | 'projects' | null, skillData?: FreeQuery | OutfitChatPlan | FragranceChatPlan | TripChatPlan | FinanceChat | FinanceBatch | GroceryPlan | SeriesPlan | ProjectPlan | null, parts?: Result[], tasks: Task[], questions: string[], actions?: Proposal[], advice?: Advice[], summary?: string | null, correctedInput?: string | null }
export const schemaFile = new URL('../output.schema.json', import.meta.url)
const ajv = new Ajv({ allErrors: false, allowUnionTypes: true })
const currentSchema = JSON.parse(readFileSync(schemaFile, 'utf8'))
const legacySchema = structuredClone(currentSchema)
legacySchema.required = ['tasks', 'questions']
legacySchema.properties.actions.items.required = ['kind', 'target', 'value', 'duration', 'reason']
legacySchema.properties.tasks.items.required = ['title', 'doneWhen', 'evidence', 'kind', 'date']
const stepDetails=['phase','startDate','notes']
for(const schema of [legacySchema,legacySchema.properties.parts.items]){
  for(const plan of schema.properties.skillData.anyOf.filter((entry:{properties?:Record<string,unknown>})=>entry.properties?.projectIntent)){
    for(const entry of [plan,plan.properties.steps.items])entry.required=entry.required.filter((field:string)=>!stepDetails.includes(field))
  }
}
const strict = ajv.compile<Result>(currentSchema)
const legacy = ajv.compile<Result>(legacySchema)
const localTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

// Find the single UTC instant matching the Berlin wall clock. A daylight-saving gap or fold requires clarification.
export function berlinInstant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !isDate(value.slice(0, 10))) throw new Error('Ungültige lokale Zeit.')
  const point = Date.parse(value + ':00Z')
  if (!Number.isFinite(point)) throw new Error('Ungültige lokale Zeit.')
  const candidates = [point - 3600000, point - 7200000].map(timestamp => new Date(timestamp))
    .filter(instant => localTime.format(instant).replace(' ', 'T') === value)
  if (candidates.length !== 1) throw new Error('Die Ortszeit ist wegen der Zeitumstellung ungültig oder mehrdeutig.')
  return candidates[0].toISOString()
}

export function expandBlock(block: Block) {
  if (!Number.isInteger(block.weeks) || block.weeks < 1 || block.weeks > 16 ||
      (block.minutes !== null && (!Number.isInteger(block.minutes) || block.minutes < 5 || block.minutes > 480))) {
    throw new Error('Ungültige Serie oder Dauer.')
  }
  const first = berlinInstant(block.start)
  const day = Date.parse(block.start.slice(0, 10) + 'T00:00Z')
  return Array.from({ length: block.weeks }, (_, index) => {
    const at = index === 0 ? first : berlinInstant(new Date(day + index * 7 * 86400000).toISOString().slice(0, 10) + block.start.slice(10))
    return { at, endsAt: block.minutes === null ? null : new Date(Date.parse(at) + block.minutes * 60000).toISOString() }
  })
}

function validFinance(plan:FinanceChat) {
  return !([plan.title,plan.category,plan.target].some(value=>value!==null && !bounded(value,120)) ||
    plan.month!==null && !/^(?:19[0-9]{2}|20[0-9]{2}|21[0-9]{2})-(?:0[1-9]|1[0-2])$/u.test(plan.month) ||
    plan.date!==null && !isDate(plan.date) || plan.cents!==null && (!Number.isSafeInteger(plan.cents) || plan.cents<1 || plan.cents>100_000_000) ||
    plan.financeIntent==='add' && (!plan.title || !plan.kind || !plan.cents) ||
    plan.financeIntent==='edit' && (!plan.target || [plan.title,plan.cents,plan.date,plan.category,plan.cycle].every(value=>value===null)))
}

export const projectPlanFormatError='Ungültiger Projektvorschlag.'
export const outfitPlanFormatError='Der Outfit-Vorschlag enthält die falschen Planungsfelder.'

export function verifyOutput(candidate: unknown, input: string | readonly string[], context: TaskContext[] = [], requireCurrent = false,
  memoryIds: readonly string[] = [], sourceText?: string): Result {
  if (!(requireCurrent ? strict : legacy)(candidate)) throw new Error('Die Modellausgabe hat ein ungültiges Format.')
  if (candidate.tasks.length > 12 || candidate.questions.length > 8 ||
      (candidate.actions?.length ?? 0) > 12 || (candidate.advice?.length ?? 0) > 8) {
    throw new Error('Die Modellausgabe hat zu viele Vorschläge.')
  }
  if (candidate.parts?.length) {
    if (candidate.parts.length>6 || candidate.skill || candidate.skillData || candidate.tasks.length || candidate.actions?.length ||
        candidate.advice?.length || candidate.questions.length) throw new Error('Mehrere Aufträge benötigen getrennte Entwürfe.')
    candidate.parts=candidate.parts.map(part=>verifyOutput(part,input,context,requireCurrent,memoryIds,sourceText))
  }
  const texts = typeof input === 'string' ? [input] : input
  const hasEvidence = (evidence: string) => texts.some(message => message.includes(evidence))
  const spokenKey=(value:string)=>value.toLocaleLowerCase('de-DE').normalize('NFD').replace(/\p{M}/gu,'')
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim()
  const mentions=(name:string,source:readonly string[]=texts)=>Boolean(spokenKey(name)) &&
    source.some(text=>(' '+spokenKey(text)+' ').includes(' '+spokenKey(name)+' '))
  if (candidate.correctedInput != null && !bounded(candidate.correctedInput.replace(/\r?\n/g, ' '), 6000)) {
    if(candidate.skill==='travel')candidate.correctedInput=null
    else throw new Error('Ungültige Textkorrektur.')
  }
  let totalBlocks = 0
  for (const task of candidate.tasks) {
    if (!bounded(task.title, 120) || !bounded(task.doneWhen, 360) ||
        !bounded(task.evidence, 400) || (!hasEvidence(task.evidence) && !sourceText?.includes(task.evidence)) ||
      (task.date !== null && !isDate(task.date)) || (task.kind === 'appointment' && task.date === null) ||
      (task.steps && (task.steps.length > 12 || task.steps.some(step => !bounded(step, 120))))) {
      throw new Error('Ein Vorschlag hat einen ungültigen oder fehlenden Beleg.')
    }
    if ((task.blocks?.length ?? 0) > 8) throw new Error('Zu viele Zeitblöcke für eine Aufgabe.')
    for (const block of task.blocks ?? []) totalBlocks += expandBlock(block).length
  }
  if (['inbox_refresh','orders'].includes(candidate.skill ?? '') && (candidate.tasks.length || candidate.actions?.length || candidate.questions.length)) {
    throw new Error('Ein Mail-Durchlauf muss separat vorgeschlagen werden.')
  }
  if (['deadline_guardian','smart_planning','applications','outfit','travel','finance','grocery'].includes(candidate.skill ?? '') &&
      (candidate.tasks.length || candidate.actions?.length)) throw new Error('Diesen Skill separat vorschlagen.')
  if ((candidate.skill === 'finance' || candidate.skill === 'grocery') && candidate.questions.length) {
    candidate.skillData = null
    candidate.summary = null
  }
  const plan = candidate.skillData
  if (candidate.skill==='outfit' && plan && !('place' in plan) && !('fragrances' in plan)) throw new Error(outfitPlanFormatError)
  if(plan&&'projectIntent' in plan){
    const validExtra=(entry:ProjectPlan|ProjectPlan['steps'][number])=>
      (entry.phase==null||bounded(entry.phase,80))&&(entry.notes==null||entry.notes.length<=600)&&
      (entry.startDate==null||isDate(entry.startDate)&&(!entry.date||entry.startDate<=entry.date))
    if(candidate.skill!=='projects'||candidate.tasks.length||candidate.actions?.length||
      [plan.title,plan.step,plan.project].some(value=>value!==null&&!bounded(value,120))||
      plan.description!==null&&plan.description.length>1500||plan.approxLabel!==null&&plan.approxLabel.length>100||
      plan.date!==null&&!isDate(plan.date)||plan.position!==null&&(plan.position<1||plan.position>40)||
      !validExtra(plan)||plan.steps.length>40||plan.steps.some(step=>!validExtra(step)||!bounded(step.title,120)||step.date!==null&&!isDate(step.date)||
        step.approxLabel!==null&&step.approxLabel.length>100))
      throw new Error(projectPlanFormatError)
  }else if(candidate.skill==='projects'){
    if(candidate.tasks.length||candidate.actions?.length||!candidate.questions.length)throw new Error('Der Projektentwurf braucht Angaben oder eine Rückfrage.')
  }else if(plan&&'seriesIntent' in plan){
    if(candidate.skill!=='calendar_series'||candidate.tasks.length||candidate.actions?.length||
      plan.title!==null&&!bounded(plan.title,120)||plan.weekdays.length>7||plan.weekdays.some(day=>!Number.isInteger(day)||day<0||day>6)||
      [plan.startDate,plan.endDate].some(date=>date!==null&&!isDate(date))||
      [plan.startTime,plan.endTime].some(time=>time!==null&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(time)))
      throw new Error('Ungültiger Serienvorschlag.')
  }else if(candidate.skill==='calendar_series'){
    if(candidate.tasks.length||candidate.actions?.length||!candidate.questions.length)throw new Error('Eine Kalenderserie benötigt Angaben oder eine Rückfrage.')
  }else if (plan && 'financeBatch' in plan) {
    if (candidate.skill!=='finance' || !plan.financeBatch.length || plan.financeBatch.length>12 ||
        !plan.financeBatch.every(validFinance)) throw new Error('Ungültige Finanzliste.')
  } else if (plan && 'financeIntent' in plan) {
    if (candidate.skill!=='finance' || !validFinance(plan)) throw new Error('Ungültige Finanzangaben.')
  } else if (candidate.skill === 'finance' && !plan) {
    candidate.summary = null
    if (!candidate.questions.length) candidate.questions = ['Soll ich dein Monatsbudget, deinen Investitionsspielraum oder deine Abos prüfen?']
  } else if (candidate.skill === 'grocery' && !plan) {
    candidate.summary=null
    if (!candidate.questions.length) candidate.questions=['Möchtest du in den Vorrat schauen, etwas einkaufen oder ein Gericht planen?']
  } else if (plan && 'groceryIntent' in plan) {
    if(requireCurrent&&plan.groceryIntent==='recipe'&&(!validRecipeServings(plan.servings)||!plan.steps.length||
      plan.items.some(item=>!hasRecipeQuantity(item.quantity??undefined)))) {
      throw new Error('Das Rezept benötigt die Portionszahl, Zubereitungsschritte und messbare Mengen pro Zutat. Verwende nur für Gewürze nach Geschmack oder optionale Zutaten einen entsprechenden Hinweis.')
    }
    if(plan.preferences&&[...plan.preferences.excluded,...(plan.preferences.include??[])].some(term=>!bounded(term,70)))
      throw new Error('Zutatenbedingungen brauchen kurze, eindeutige Namen.')
    if (candidate.skill!=='grocery' || plan.items.length>30 || plan.steps.length>12 ||
        plan.title!==null&&!bounded(plan.title,120) ||
        plan.items.some(item=>!bounded(item.name,90)||item.quantity!==null&&!bounded(item.quantity,50)) ||
        (plan.onHand??[]).length>20 || (plan.onHand??[]).some(item=>!bounded(item.name,90)||item.quantity!==null&&!bounded(item.quantity,50)) ||
        plan.steps.some(step=>!bounded(step,280)) || plan.groceryIntent==='receipt'&&!sourceText ||
        plan.totalCents!==null && (plan.groceryIntent!=='receipt'||!Number.isSafeInteger(plan.totalCents)||plan.totalCents<1||plan.totalCents>1000000) ||
        ['shop_add','shop_remove','stock_add','receipt','recipe'].includes(plan.groceryIntent) && !plan.items.length) {
      throw new Error('Ungültiger Vorrats-, Einkaufs- oder Rezeptvorschlag.')
    }
  } else if (plan && 'fragrances' in plan) {
    if (candidate.skill!=='outfit' || plan.fragrances.length<1 || plan.fragrances.length>12 ||
        plan.fragrances.some(name=>!bounded(name,120)||!mentions(name,[...texts,...(sourceText?[sourceText]:[])]))) {
      throw new Error('Die Duftliste enthält einen ungültigen oder unbelegten Namen.')
    }
    const seen=new Set<string>()
    candidate.skillData={fragrances:plan.fragrances.map(name=>name.trim()).filter(name=>{
      const key=spokenKey(name)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })}
  } else if (plan && 'place' in plan) {
    if (candidate.skill !== 'outfit' || plan.date !== null && !isDate(plan.date) ||
      plan.place !== null && (!bounded(plan.place,80) ||
        !texts.some(text=>text.toLocaleLowerCase('de-DE').includes(plan.place!.toLocaleLowerCase('de-DE')))) ||
      plan.occasion !== null && !bounded(plan.occasion,110) ||
      plan.anchor!=null && (!bounded(plan.anchor,120)||!mentions(plan.anchor)||plan.anchorStep!=='ready')) {
      throw new Error('Ort, Datum, Anlass oder Wunschstück für das Outfit sind ungültig.')
    }
    if (plan.anchorStep==='decision' || plan.anchorStep==='name') {
      candidate.summary=null
      candidate.questions=[plan.anchorStep==='decision'?'Willst du ein bestimmtes Teil anziehen?':'Welches Teil möchtest du anziehen?']
    }
  } else if (plan && 'intent' in plan) {
    if(candidate.skill!=='travel')throw new Error('Ungültige Reiseangaben.')
    if(plan.intent==='draft'){
      const cleaned=normalizeTripIntake(plan)
      candidate.skillData=cleaned
      const required=tripIntakeQuestions(cleaned)
      // Structural questions are regenerated from the merged travel plan.
      if(required.length)candidate.questions=required
      else if(cleaned.start && cleaned.end && cleaned.destination && cleaned.departure)
        candidate.questions=candidate.questions.filter(question=>/widerspr|zwei verschiedene|beide zeit|der beiden|welch[^?]*davon/iu.test(question)).slice(0,2)
    }else if ([plan.destination,plan.departure].some(value=>value!==null && !bounded(value,100)) ||
      plan.detail!==null && !bounded(plan.detail,150) || [plan.start,plan.end].some(value=>value!==null && !isDate(value)) ||
      plan.intent!=='change' && plan.start && plan.end && plan.start>plan.end ||
      plan.people!==null && (plan.people<1 || plan.people>30) ||
      plan.maxLeave!==null && (plan.maxLeave<0 || plan.maxLeave>14)) throw new Error('Ungültige Reiseangaben.')
  } else if (plan && (candidate.skill !== 'smart_planning' || candidate.questions.length ||
      !isDate(plan.date) || plan.days < 1 || plan.days > 7 || plan.minutes < 15 || plan.minutes > 480 ||
      ![plan.start,plan.end].every(value=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) || plan.start >= plan.end)) {
    throw new Error('Ungültiger Planungszeitraum.')
  }
  if (candidate.skill === 'smart_planning' && !candidate.skillData && !candidate.questions.length) throw new Error('Planung benötigt einen Zeitraum oder eine Rückfrage.')
  if (candidate.skill === 'appointment' && (candidate.actions?.length || candidate.questions.length && candidate.tasks.length ||
      !candidate.questions.length && (!candidate.tasks.length || candidate.tasks.some(task => task.kind !== 'appointment' ||
        task.blocks?.length !== 1 || task.blocks[0].minutes === null || task.blocks[0].weeks !== 1 || task.blocks[0].start.slice(0, 10) !== task.date)))) {
    throw new Error('Ein Termin benötigt Datum, Uhrzeit und Dauer oder eine Rückfrage.')
  }
  if (totalBlocks > 32) throw new Error('Der Vorschlag enthält zu viele Terminwiederholungen.')
  if (candidate.questions.some(question => !bounded(question, 280)) ||
      (candidate.summary != null && !bounded(candidate.summary, 420))) throw new Error('Ungültiger Antworttext.')
  const ids = new Set(context.map(task => task.id))
  const slotIds = new Set(context.flatMap(task => task.schedule.filter(item => item.kind === 'slot').map(item => item.id)))
  for (const action of candidate.actions ?? []) {
    if (!bounded(action.reason, 280) || !bounded(action.value, 800) ||
        (action.kind === 'remember' ? action.target !== null || !hasEvidence(action.value) :
          action.kind === 'correct_memory' ? !action.target || !memoryIds.includes(action.target) || !hasEvidence(action.value) :
          !action.target || !(action.kind === 'reschedule' ? slotIds : ids).has(action.target))) {
      throw new Error('Ein Vorschlag verweist auf eine unbekannte Aufgabe oder unbestätigte Erinnerung.')
    }
    if (action.tags?.some(tag => !bounded(tag, 40)) || (action.tags?.length ?? 0) > 6 ||
        (action.kind !== 'remember' && action.kind !== 'correct_memory' && action.tags?.length)) throw new Error('Ungültige Memory-Schlagwörter.')
    if (sourceText !== undefined && action.tags?.some(tag => !action.value.toLocaleLowerCase('de-DE').includes(tag.toLocaleLowerCase('de-DE')))) {
      throw new Error('Suchwörter für Erinnerungen müssen bei einer Textquelle in der bestätigten Aussage vorkommen.')
    }
    if(action.kind==='rename'&&!bounded(action.value,120)||action.kind==='description'&&!bounded(action.value,360)||
      action.kind==='category'&&!['work','university','leisure'].includes(action.value)||action.kind==='archive'&&action.value!=='archived')
      throw new Error('Ungültige Änderung der Aufgabe.')
    if (action.kind === 'deadline' && !isDate(action.value)) throw new Error('Ungültige Frist.')
    if (action.kind === 'priority' && !['low', 'normal', 'high'].includes(action.value)) throw new Error('Ungültige Priorität.')
    if (action.kind === 'complete' && action.value !== 'done') throw new Error('Ungültiger Abschluss.')
    if (action.kind === 'plan' || action.kind === 'reschedule' || action.kind === 'reminder') berlinInstant(action.value)
    if (action.kind === 'plan' ? !action.duration || action.duration < 5 || action.duration > 480 : action.duration !== null) {
      throw new Error('Ungültige Dauer.')
    }
  }
  if (candidate.advice?.some(item => !ids.has(item.target) || !bounded(item.reason, 280))) {
    throw new Error('Die Empfehlung verweist auf eine unbekannte Aufgabe.')
  }
  return candidate
}
