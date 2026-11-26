import {shiftDay} from './values.ts'

/*
 * Löst relative deutsche Datumsangaben auf („nächsten Dienstag“, „Ende des Jahres“, „Anfang nächsten Monats“, „in zwei Wochen“).
 * Eine Angabe kann ein Tag oder ein Zeitraum sein: als Beginn gilt start, als Ende (bis …) gilt end.
 * Wird vom Serien-Handler und von der Vorzerlegung für das Modell gemeinsam genutzt.
 */
export type DateSpan={start:string,end:string}

const weekdayNames=['sonntag','montag','dienstag','mittwoch','donnerstag','freitag','samstag']
const weekday='montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag'
const number='\\d{1,2}|einem|einer|ein|zwei|drei|vier|fünf|sechs|sieben|acht|zehn'
const spokenNumber:Record<string,number>={ein:1,einem:1,einer:1,zwei:2,drei:3,vier:4,fünf:5,sechs:6,sieben:7,acht:8,zehn:10}
const next='(?:nächste[nrsm]?|kommende[nrsm]?)'
const this_='(?:diese[nrsm]?|laufende[nrsm]?)'

/** Regex-Quellen aller Wendungen (nur Konstanten). Reihenfolge: lange vor kurzen. */
export const relativePhrases=[
  String.raw`(?:am\s+)?${next}\s+woche\s+(?:${weekday})`,
  String.raw`(?:am\s+)?(?:${next}|${this_}|übernächste[nrsm]?)\s+(?:${weekday})`,
  String.raw`in\s+(?:${number})\s+(?:tag(?:en)?|woche[n]?|monat(?:en)?)`,
  String.raw`(?:ende|anfang|mitte)\s+(?:der\s+)?(?:${next}|${this_})\s+woche`,
  String.raw`${next}\s+woche|${this_}\s+woche|ende\s+der\s+woche|(?:${next}|${this_})\s+wochenende|wochenende`,
  String.raw`(?:(?:ende|anfang|mitte)\s+(?:des\s+)?(?:${next}|${this_})\s+monats?|(?:ende|anfang|mitte)\s+(?:des\s+)?monats)|monats(?:ende|anfang)|${next}\s+monat|${this_}\s+monat`,
  String.raw`(?:das\s+)?(?:ende|anfang)\s+(?:des\s+|dieses\s+|nächsten\s+)jahres|jahres(?:ende|anfang)|neujahr|${next}s?\s+jahr|dieses\s+jahr`,
]

const pattern=new RegExp('(?<![\\p{L}\\p{N}])(?:'+relativePhrases.join('|')+')(?![\\p{L}\\p{N}])','iu') // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
const globalPattern=new RegExp(pattern.source,'giu') // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp

const dayOfWeek=(day:string)=>new Date(day+'T12:00:00Z').getUTCDay()
const mondayOf=(day:string)=>shiftDay(day,-((dayOfWeek(day)+6)%7))
const lastOfMonth=(year:number,month:number)=>new Date(Date.UTC(year,month,0)).getUTCDate()
const pad=(value:number)=>String(value).padStart(2,'0')
const monthSpan=(year:number,month:number):DateSpan=>({start:`${year}-${pad(month)}-01`,end:`${year}-${pad(month)}-${pad(lastOfMonth(year,month))}`})
function addMonths(day:string,count:number){
  const total=Number(day.slice(0,4))*12+Number(day.slice(5,7))-1+count
  return {year:Math.floor(total/12),month:total%12+1}
}
const same=(day:string):DateSpan=>({start:day,end:day})

/** Gibt true zurück, wenn der Text genau eine solche Wendung ist. */
export function isRelativeDate(text:string){
  const match=pattern.exec(text.trim())
  return Boolean(match&&match[0].length===text.trim().length)
}
export const relativeDateSource=pattern.source

export function resolveRelativeDate(phrase:string,today:string):DateSpan|null{
  const text=phrase.toLocaleLowerCase('de-DE').replace(/\s+/gu,' ').trim()
  const year=Number(today.slice(0,4)),month=Number(today.slice(5,7))
  const modifier=/(?:übernächste)/u.test(text)?2:/(?:nächste|kommende)/u.test(text)?1:0
  const named=new RegExp('('+weekday+')','u').exec(text)?.[1] // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  if(named){
    const target=weekdayNames.indexOf(named)
    if(/(?:nächste|kommende)[nrsm]?\s+woche\s/u.test(text))return same(shiftDay(mondayOf(today),7+(target+6)%7))
    if(/übernächste/u.test(text))return same(shiftDay(shiftDay(today,(target-dayOfWeek(today)+7)%7||7),7))
    if(/diese|laufende/u.test(text))return same(shiftDay(mondayOf(today),(target+6)%7))
    return same(shiftDay(today,(target-dayOfWeek(today)+7)%7||7))
  }
  const relative=new RegExp('^in ('+number+') (tag|woche|monat)','u').exec(text) // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  if(relative){
    const count=spokenNumber[relative[1]]??Number(relative[1])
    if(relative[2]==='tag')return same(shiftDay(today,count))
    if(relative[2]==='woche')return same(shiftDay(today,7*count))
    const target=addMonths(today,count)
    return same(`${target.year}-${pad(target.month)}-${pad(Math.min(Number(today.slice(8,10)),lastOfMonth(target.year,target.month)))}`)
  }
  if(/jahr|neujahr/u.test(text)){
    if(/neujahr/u.test(text))return same(`${year+1}-01-01`)
    const target=/nächste/u.test(text)?year+1:year
    if(/anfang/u.test(text))return same(`${/dieses/u.test(text)?year:year+1}-01-01`)
    if(/ende/u.test(text))return same(`${/nächsten/u.test(text)?year+1:year}-12-31`)
    return {start:`${target}-01-01`,end:`${target}-12-31`}
  }
  if(/monat/u.test(text)){
    const target=addMonths(today,modifier)
    const span=monthSpan(target.year,target.month)
    if(/anfang|monatsanfang/u.test(text))return same(span.start)
    if(/ende|monatsende/u.test(text))return same(span.end)
    if(/mitte/u.test(text))return same(`${target.year}-${pad(target.month)}-15`)
    return span
  }
  if(/wochenende/u.test(text)){
    const saturday=shiftDay(mondayOf(today),5+(/nächste/u.test(text)?7:0))
    return {start:saturday<today?today:saturday,end:shiftDay(saturday,1)}
  }
  if(/woche/u.test(text)){
    const monday=shiftDay(mondayOf(today),/nächste|kommende/u.test(text)?7:0)
    const sunday=shiftDay(monday,6)
    if(/ende/u.test(text))return same(shiftDay(monday,4))
    if(/anfang/u.test(text))return same(monday)
    if(/mitte/u.test(text))return same(shiftDay(monday,2))
    return {start:monday<today?today:monday,end:sunday}
  }
  return null
}

/** Alle relativen Wendungen in einem Text mit ihrer Auflösung. */
export function relativeDatesIn(text:string,today:string){
  const found:Record<string,string>={}
  for(const match of text.matchAll(globalPattern)){
    const span=resolveRelativeDate(match[0],today)
    if(span)found[match[0].trim().toLocaleLowerCase('de-DE')]=span.start===span.end?span.start:`${span.start} bis ${span.end}`
  }
  return found
}

/** Erste Wendung, die einen Zeitraum (Woche, Monat, Jahr) beschreibt, z. B. „nächsten Monat“. */
export function findRelativeSpan(text:string,today:string){
  for(const match of text.matchAll(globalPattern)){
    const span=resolveRelativeDate(match[0],today)
    if(span&&span.start!==span.end)return span
  }
  return null
}
