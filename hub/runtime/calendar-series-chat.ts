import type {Result} from '../../agents/lifepilot/tools/validate.ts'
import type {ModelMessage,ModelPayload} from './model-payload.ts'
import {weekdayNames,type SeriesPlan} from './calendar-series-types.ts'
import {holidayRegion} from './calendar-series.ts'
import {isDate,shiftDay} from './values.ts'

const monthNames=['januar','februar','märz','april','mai','juni','juli','august','september','oktober','november','dezember']
const month=monthNames.join('|')
const dateToken=String.raw`(?:20\d\d-\d\d-\d\d|\d{1,2}\.\d{1,2}(?:\.(?:20\d\d|\d\d)\b)?\.?|(?:\d{1,2}\.\s*)?(?:${month})(?:\s+20\d\d)?|(?:letzte[nr]?\s+tag|ende|monatsende)\s+(?:(?:im|des)\s+)?(?:${month})(?:\s+20\d\d)?|heute|morgen|weihnachten|heiligabend|silvester)`
const spoken:Record<string,number>={null:0,eins:1,ein:1,zwei:2,drei:3,vier:4,fünf:5,sechs:6,sieben:7,acht:8,neun:9,zehn:10,elf:11,zwölf:12,
  dreizehn:13,vierzehn:14,fünfzehn:15,sechzehn:16,siebzehn:17,achtzehn:18,neunzehn:19,zwanzig:20,einundzwanzig:21,zweiundzwanzig:22,dreiundzwanzig:23}
const clock='(?:[01]?\\d|2[0-3])(?:[:.][0-5]\\d)?|'+Object.keys(spoken).sort((a,b)=>b.length-a.length).join('|')
const timeRange=new RegExp(String.raw`(?<![\w.:-])(?:\bvon\s+)?(${clock})\s*(?:uhr\s*)?(?:bis|[–—-])\s*(${clock})(?:\s*(uhr))?(?=\s|[,.!?;]|$)`,'giu')
const singleTime=new RegExp(String.raw`\bum\s+(${clock})(?:\s*uhr)?(?=\s|[,.!?;]|$)`,'iu')
const time=(value:string|undefined)=>{
  if(!value)return null
  const [hours,minutes='00']=value.toLowerCase().split(/[:.]/u)
  return String(spoken[hours]??Number(hours)).padStart(2,'0')+':'+minutes
}
export function dateInText(text:string,anchor:string,before=false){
  const boundary=(day:string)=>before?shiftDay(day,-1):day
  if(/^heute$/iu.test(text))return boundary(anchor)
  if(/^morgen$/iu.test(text))return boundary(shiftDay(anchor,1))
  if(/^20\d\d-\d\d-\d\d$/u.test(text))return isDate(text)?boundary(text):null
  const numeric=/^(\d{1,2})\.(\d{1,2})(?:\.(20\d\d|\d\d))?\.?$/u.exec(text)
  const named=new RegExp(String.raw`(?:(\d{1,2})\.\s*)?\b(${month})(?:\s+(20\d\d))?\b`,'iu').exec(text)
  const holiday=/^(weihnachten|heiligabend|silvester)$/iu.exec(text)?.[1]?.toLowerCase()
  const monthNumber=holiday?12:numeric?Number(numeric[2]):named?monthNames.indexOf(named[2].toLowerCase())+1:0
  if(monthNumber<1||monthNumber>12)return null
  const explicit=numeric?.[3]??named?.[3]
  const year=explicit?Number(explicit.length===2?'20'+explicit:explicit):Number(anchor.slice(0,4))
  const build=(y:number)=>{
    const day=holiday?(holiday==='silvester'?31:24):numeric?Number(numeric[1]):named?.[1]?Number(named[1]):
      /(?:letzte[nr]?\s+tag|ende|monatsende)/iu.test(text)?new Date(Date.UTC(y,monthNumber,0)).getUTCDate():1
    return [String(y),String(monthNumber).padStart(2,'0'),String(day).padStart(2,'0')].join('-')
  }
  const found=build(year)
  if(!isDate(found))return null
  const resolved=!explicit&&found<anchor?build(year+1):found
  return isDate(resolved)?boundary(resolved):null
}

const envelope=(plan?:SeriesPlan,question?:string,summary?:string):Result=>({skill:'calendar_series',skillData:plan??null,
  tasks:[],actions:[],questions:question?[question]:[],...(summary&&{summary})})
const empty:SeriesPlan={seriesIntent:'create',title:null,seriesKind:null,weekdays:[],startDate:null,endDate:null,
  startTime:null,endTime:null,category:null,excludeHolidays:false,region:null}
const recurring=/\b(?:wiederkehrend\w*|immer|jede[nrs]?|wöchentlich|serie[n]?|serientermine?)\b/iu
const coming=/\b(?:kommend(?:e[nrsm]?)?|nächst(?:e[nrsm]?)?|ab\s+(?:jetzt|sofort|heute))\b/iu
const topic=/\b(?:termin\w*|kalender|vorlesung\w*|seminar\w*|erinnerung\w*|erinnere|reminder|arbeit\w*|werkstudent\w*|schicht|dienst)\b/iu
const workPattern=/\b(?:arbeite|arbeit|arbeitszeit(?:en)?|arbeitstage|werkstudent\w*|schicht|dienst)\b/iu
const titlePattern=/[„"]([^“"\n]{2,100})[“"]/u
const namedLecture=/\b(?:für|zu)\s+(?:(?:meine[nr]?|die|der|das)\s+)?([^,;!?\n]{2,100}?\b(?:vorlesung\w*|seminar))(?=\s|[,.;!?]|$)/iu
const novel=/\b(?:ganz neue|neue serie|neue vorlesung|weiterer termin)\b/iu

function findTitle(input:string){
  const found=titlePattern.exec(input)?.[1]??namedLecture.exec(input)?.[1]
  if(!found)return null
  return /\bki\s*(?:&|und)\s*data\s+sci(?:en[ct]|en[c]?e|ene[c]?|en[cs]e)\w*\s+vorlesung\w*/iu.test(found)?
    'KI & Data Science Vorlesung':found.trim()
}
const titleKey=(title:string)=>title.toLowerCase().replace(/&/gu,' und ').replace(/[^\p{L}\p{N}]+/gu,' ').trim()

function previousSeries(messages:ModelMessage[]){
  for(const entry of messages.toReversed()){
    const result=entry.previousResult
    const details=entry.outcome?.details
    const plan=result?.skillData??(details&&typeof details==='object'&&'plan' in details?details.plan:null)
    if(plan&&typeof plan==='object'&&'seriesIntent' in plan)return plan as SeriesPlan
    if(result?.skill&&result.skill!=='calendar_series')return
  }
}

function detailsFrom(input:string,day:string){
  const times=[...input.matchAll(timeRange)].filter(match=>match[3]||/^von\s/iu.test(match[0])||match[1].includes(':')||match[2].includes(':')).at(-1)
  const single=singleTime.exec(input)
  const text=times?input.replace(times[0],' '):input
  const bound=(prefix:string)=>[...text.matchAll(new RegExp(String.raw`${prefix}\s*(${dateToken})(?![\p{L}\d:-]|\.\d)`,'giu'))].filter(match=>!/\bstatt\s*$/iu.test(text.slice(0,match.index))).at(-1)
  const from=bound(String.raw`\b(?:ab|vom|von)\s+(?:(?:dem|den)\s+)?`)
  const stop=bound(String.raw`\b(?:bis(?:\s+(?:zum|einschließlich|spätestens))?|vor)\s+`)
  const before=!!stop&&/^vor\b/iu.test(stop[0])
  const bare=new RegExp(String.raw`^\s*(${dateToken})\s*[.!]?\s*$`,'iu').exec(text)
  const until=stop??bare
  const begin=from?dateInText(from[1],day):coming.test(text)?day:null
  const end=until?dateInText(until[1],begin??day,before):null
  return {begin,end,mentionedStart:!!from||coming.test(text),mentionedEnd:!!until||/\b(?:bis|vor)\s+\S/iu.test(text),
    startTime:time(times?.[1]??single?.[1]),endTime:time(times?.[2]),
    weekdays:weekdayNames.flatMap((name,index)=>new RegExp('\\b'+name+'s?\\b','iu').test(text)?[index]:[])}
}

export function seriesFromChat(payload:ModelPayload):Result|undefined{
  const {messages}=payload
  const day=messages.at(-1)?.referenceDay??payload.day
  if(!day||payload.sourceNote)return
  const current=messages.at(-1)?.input.trim()??''
  const recentQuestions=messages.at(-1)?.previousResult?.questions??[]
  const title=findTitle(current)
  const past=previousSeries(messages)
  const freshWithoutName=!title&&/\b(?:füge|erstelle|lege)\b.{0,30}\b(?:serie|serientermine?)\b/iu.test(current)&&!/(?:diese|dieselbe|vorige|vorherige)\s+serie/iu.test(current)
  const same=!!past&&(!title||!past.title||titleKey(title)===titleKey(past.title))&&!novel.test(current)&&!freshWithoutName
  const prior=same&&past?.seriesIntent==='create'?past:undefined
  if(/\b(?:lösche[n]?|entferne[n]?|storniere[n]?|streiche[n]?)\b/iu.test(current)){
    if(past||recurring.test(current)||/arbeitszeit|arbeitstage|werkstudent/iu.test(current))
      return envelope({...empty,seriesIntent:'delete',title:title??(/\bwerkstudent(?:en)?\b/iu.test(current)?'Werkstudent':past?.title??null)})
    return
  }
  const newest=detailsFrom(current,day)
  const seriesTopic=recurring.test(current)&&topic.test(current)||coming.test(current)&&newest.weekdays.length>0&&topic.test(current)
  const directlyRelated=topic.test(current)||recurring.test(current)||/^(?:doch\s+)?(?:nein\b|an\s+allen\b|ab\b|bis\b|vor\b|am\b|nur\b|jeden\b|die\s+kommenden\b|die\s+nächsten\b|(?:20)?\d{1,2}[.:])/iu.test(current)
  const correction=!!prior&&directlyRelated&&(newest.mentionedStart||newest.mentionedEnd||newest.weekdays.length>0||!!newest.startTime)
  if(!seriesTopic&&!correction&&!recentQuestions.length)return
  if(!seriesTopic&&recentQuestions.some(item=>/ferien|pause|unterbrechung|aussetzen/iu.test(item)))return
  if(!seriesTopic&&!prior&& !messages.slice(0,-1).some(entry=>recurring.test(entry.input)&&topic.test(entry.input)))return
  const historical=same||!past&&recentQuestions.length?messages.slice(0,-1).reverse().filter(entry=>{
    const pastTitle=findTitle(entry.input)
    return !pastTitle||!(title??prior?.title)||titleKey(pastTitle)===titleKey((title??prior?.title)!)
  }).map(entry=>detailsFrom(entry.input,entry.referenceDay??day)):[]
  const priorWeekdays=historical.find(item=>item.weekdays.length)?.weekdays??prior?.weekdays??[]
  const weekdays=newest.weekdays.length?newest.weekdays:priorWeekdays
  if(!weekdays.length)return
  const work=workPattern.test(current)
  const reminder=/\b(?:erinnerung\w*|erinnere|reminder)\b/iu.test(current)
  const appointment=/\b(?:vorlesung\w*|seminar\w*|termine?)\b/iu.test(current)
  const seriesKind=reminder?'reminder':appointment||work?'appointment':prior?.seriesKind??'appointment'
  const startTime=newest.startTime??historical.find(item=>item.startTime)?.startTime??prior?.startTime??null
  const endTime=newest.endTime??historical.find(item=>item.endTime)?.endTime??prior?.endTime??null
  const resolvedTitle=title??prior?.title??(work?/werkstudent/iu.test(current)?'Werkstudent · Arbeit':'Arbeit':null)
  if(!resolvedTitle)return
  const latestStart=historical.find(item=>item.mentionedStart)
  const latestEnd=historical.find(item=>item.mentionedEnd)
  const oldStart=latestStart?latestStart.begin:prior?.startDate??null
  const oldEnd=latestEnd?latestEnd.end:prior?.endDate??null
  let startDate=newest.mentionedStart?newest.begin:oldStart
  const endDate=newest.mentionedEnd?newest.end:oldEnd
  const region=holidayRegion(current)??prior?.region??null
  const category=work?'work':/\b(?:uni|vorlesung\w*|seminar)\b/iu.test(current)?'university':prior?.category??'leisure'
  if(endDate&&startDate&&startDate>endDate&&!newest.mentionedStart&&(newest.mentionedEnd||latestEnd))startDate=day
  const plan={...empty,title:resolvedTitle,seriesKind,weekdays,startDate,endDate,startTime,endTime,category,
    excludeHolidays:/auch an feiertagen|feiertage mit/iu.test(current)?false:work||/feiertag/iu.test(current)||!!prior?.excludeHolidays,region} satisfies SeriesPlan
  if(newest.mentionedEnd&&!endDate)return envelope(plan,'Welches gültige Enddatum soll ich für die Serie verwenden?')
  if(newest.mentionedStart&&!newest.begin||endDate&&((startDate&&startDate>endDate)||endDate<day))
    return envelope(plan,'Welcher Start- und Endtermin gilt für diese Serie?')
  if(!startTime||seriesKind==='appointment'&&!endTime)return envelope(plan,'Von wann bis wann soll jeder Termin dauern? Bitte nenne die Uhrzeit.')
  if(seriesKind==='appointment'&&!endDate)return envelope(plan,'Bis zu welchem Datum soll ich die Termine eintragen?')
  const corrected=!!prior&&((newest.mentionedEnd&&endDate!==prior.endDate)||(newest.mentionedStart&&startDate!==prior.startDate))
  return envelope(plan,undefined,corrected?'Ich verwende den Zeitraum aus deiner neueren Angabe.':'')
}

export function honorSeriesPeriod(result:Result,payload:ModelPayload):Result{
  const plan=result.skillData
  if(result.skill!=='calendar_series'||!plan||!('seriesIntent' in plan)||plan.seriesIntent!=='create'||result.questions.length||payload.sourceNote)return result
  const latest=payload.messages.at(-1)
  const day=latest?.referenceDay??payload.day
  if(!day||!latest)return result
  const {begin,end,mentionedStart,mentionedEnd}=detailsFrom(latest.input,day)
  if(!mentionedStart&&!mentionedEnd)return result
  if(mentionedStart&&!begin||mentionedEnd&&!end)return envelope(plan,'Welches konkrete Start- und Enddatum soll ich für die Serie verwenden?')
  const endDate=mentionedEnd?end:plan.endDate
  let startDate=mentionedStart?begin:plan.startDate
  if(endDate&&startDate&&startDate>endDate&&!mentionedStart&&mentionedEnd)startDate=day
  if(endDate&&(endDate<day||startDate&&startDate>endDate))return envelope(plan,'Welcher Start- und Endtermin gilt für diese Serie?')
  if(startDate===plan.startDate&&endDate===plan.endDate)return result
  return {...result,skillData:{...plan,startDate,endDate},summary:'Ich verwende den Zeitraum aus deiner neueren Angabe.'}
}
