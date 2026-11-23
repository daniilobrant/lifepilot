import type {TripChatPlan,TripDraft} from './trip-types.ts'
import {bounded, isDate} from './values.ts'

const value=(text:string|null|undefined,limit:number)=>text?.replace(/[\x00-\x1f\x7f]+|\s+/gu,' ').trim().slice(0,limit).trimEnd()||null
export function normalizeTripIntake(plan:TripChatPlan){
  const detail=value(plan.detail,220)
  const brief=value(plan.brief || ((plan.detail?.length??0)>220 || /[\r\n]/u.test(plan.detail??'') ? plan.detail : null),6000)
  return {...plan,
    destination:value(plan.destination,100),departure:value(plan.departure,100),
    detail,...(brief||plan.brief!==undefined?{brief}:{}),
    ...(plan.stay!==undefined&&{stay:value(plan.stay,150)}),
    ...(plan.stayAddress!==undefined&&{stayAddress:value(plan.stayAddress,200)}),
    ...(plan.exclusions!==undefined&&{exclusions:value(plan.exclusions,220)}),
    people:Number.isInteger(plan.people)&&plan.people!>=1&&plan.people!<=30?plan.people:null,
    start:isDate(plan.start)?plan.start:null,end:isDate(plan.end)?plan.end:null,
  }
}
export function tripIntakeQuestions(plan:TripChatPlan){
  const questions:string[]=[]
  if(!bounded(plan.destination,100))questions.push('Wohin möchtest du reisen?')
  if(!bounded(plan.departure,100))questions.push('Von welchem Ort möchtest du abreisen?')
  if(!plan.start&&!plan.end)questions.push('Wann beginnt und endet die Reise?')
  else if(!plan.start)questions.push('Wann beginnt die Reise?')
  else if(!plan.end)questions.push('Wann endet die Reise?')
  else if(plan.start>plan.end || Date.parse(plan.end)-Date.parse(plan.start)>30*86_400_000)
    questions.push('Welchen Zeitraum soll ich übernehmen? Ein Reiseplan umfasst bis zu 31 Tage.')
  if(plan.transport==='flight'&&(!plan.luggage||plan.luggage==='open'))questions.push('Fliegst du mit Rucksack, Handgepäck oder Koffer?')
  return questions.slice(0,2)
}
export function tripIntakeExtras(plan?:TripChatPlan,previous?:TripDraft){
  const brief=previous?.brief??plan?.brief
  return brief?{brief}:{}
}

export function mergeTripIntake(previous:TripChatPlan,answer:TripChatPlan,latestInput=''):TripChatPlan {
  if(previous.intent!=='draft'||answer.intent!=='draft' || previous.destination && answer.destination &&
    previous.destination.toLocaleLowerCase('de-DE')!==answer.destination.toLocaleLowerCase('de-DE'))return answer
  const data=Object.fromEntries(Object.entries(answer).filter(([,value])=>value!==null&&value!==undefined))
  const priorBrief=previous.brief??previous.detail
  const nextBrief=answer.brief??answer.detail
  const updatedFields=['start','end','stay','stayAddress','transport','exclusions'] as const
  const conflicts=updatedFields.some(field=>answer[field]!=null&&previous[field]!=null&&answer[field]!==previous[field])
  const correction=/\b(?:statt|sondern|korrektur|nicht mehr)\b/iu.test(latestInput)
  const brief=conflicts||correction?nextBrief:priorBrief&&nextBrief&&!nextBrief.includes(priorBrief)&&!priorBrief.includes(nextBrief)?
    nextBrief+' · '+priorBrief:nextBrief&&(!priorBrief||nextBrief.length>=priorBrief.length)?nextBrief:priorBrief
  return normalizeTripIntake({...previous,...data,brief,
    luggage:answer.transport&&previous.transport!==answer.transport?answer.luggage:answer.luggage??previous.luggage})
}
