import {mentionedDates} from './message-analysis.ts'
import {dateInBerlin,shiftDay} from './values.ts'
import type {TicketEvent} from './event-mail.ts'

/*
 * Erkennt persönliche Terminmails („heute Meeting um 15 Uhr auf Teams“): ein Terminwort, eine Uhrzeit und ein Tag.
 * Newsletter, Sammelmails und fehlende Tage oder Uhrzeiten ergeben keinen Vorschlag.
 */
const meetingWord=/(?<![\p{L}\p{N}])(?:meeting|besprechung|call|videocall|videokonferenz|telefonat|gespräch|termin|treffen|sprechstunde|teams|zoom|webex|google meet|präsentation|presentation|präsi|agenda|session|seminar|lecture|vorlesung|sitzung)(?![\p{L}\p{N}])/iu
const timeSpan=/(?<![\d:.])(?:um\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:uhr|h)(?![\p{L}])(?:\s*(?:bis|-|–)\s*(\d{1,2})(?::(\d{2}))?\s*(?:uhr|h)?)?|(?<![\d:.])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])(?:\s*(?:bis|-|–)\s*([01]?\d|2[0-3]):([0-5]\d))?/iu
const range=/(?<![\d:.])(\d{1,2})(?::(\d{2}))?\s*(?:bis|-|–)\s*(\d{1,2})(?::(\d{2}))?\s*uhr/iu
/** Englische Uhrzeiten („1 pm“, „1:00 p.m.“, „12 am“) in 24-Stunden-Schreibweise („13:00“, „00:00“). */
export function twentyFourHour(text:string){
  return text.replace(/(?<![\d:.])(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\b\.?/giu,(whole,hour:string,minute:string|undefined,half:string)=>{
    const value=Number(hour)
    if(value<1||value>12)return whole
    const converted=half.toLowerCase()==='p'?(value%12)+12:value%12
    return String(converted).padStart(2,'0')+':'+(minute??'00')
  })
}
const pad=(value:string|undefined)=>(value??'00').padStart(2,'0')

export function readMeetingMail(mail:{subject:string,text:string,from:string,at?:string|null,mailingList?:boolean},today?:string):TicketEvent|undefined {
  if(mail.mailingList||/no[-.]?reply|newsletter|noreply|notification|info@|news@/iu.test(mail.from))return
  const body=twentyFourHour(mail.text.split(/\r?\n/u).filter(line=>!line.trimStart().startsWith('>')).join('\n').slice(0,2500))
  const text=mail.subject+'\n'+body
  if(!meetingWord.test(text)||/abmelden|unsubscribe|angebot|gutschein|rabatt|webinar/iu.test(text))return
  const sent=mail.at&&Number.isFinite(Date.parse(mail.at))?dateInBerlin(new Date(mail.at)):today
  if(!sent)return
  // Kopfzeilen weitergeleiteter Mails („Gesendet: Donnerstag, …“) und Wochentage dort zählen nicht als Termintag.
  const dateText=text.split(/\r?\n/u).filter(line=>!/^\s*(?:von|gesendet|an|cc|betreff|from|sent|to|subject)\s*:/iu.test(line)).join('\n')
  const found=mentionedDates(dateText,sent)
  const english=/(?<![\p{L}])today(?![\p{L}])/iu.test(dateText)?sent:/(?<![\p{L}])tomorrow(?![\p{L}])/iu.test(dateText)?shiftDay(sent,1):undefined
  const explicit=Object.entries(found).filter(([label])=>/\d/u.test(label)).map(([,value])=>value)
  const relative=Object.entries(found).filter(([label])=>/^(?:heute|morgen|übermorgen)$/u.test(label)).map(([,value])=>value)
  const weekday=Object.entries(found).filter(([label])=>!/\d/u.test(label)&&!/^(?:heute|morgen|übermorgen)$/u.test(label)).map(([,value])=>value)
  const day=[...explicit,...relative,...(english?[english]:[]),...weekday].filter(value=>value>=sent)[0]
  const spanned=range.exec(body)
  const match=spanned??timeSpan.exec(body)??timeSpan.exec(twentyFourHour(mail.subject))
  if(!day||!match)return
  const hour=match[1]??match[5], minute=match[2]??match[6]
  const endHour=spanned?match[3]:(match[3]??match[7]), endMinute=spanned?match[4]:(match[4]??match[8])
  const start=pad(hour)+':'+pad(minute)
  if(Number(hour)>23||Number(minute??0)>59)return
  const end=endHour&&Number(endHour)<=23?pad(endHour)+':'+pad(endMinute):''
  const platform=/teams/iu.test(text)?'Teams':/zoom/iu.test(text)?'Zoom':/google meet/iu.test(text)?'Google Meet':/webex/iu.test(text)?'Webex':''
  const person=/<([^>]+)>/u.exec(mail.from)?.[1]??mail.from
  const name=mail.from.replace(/<[^>]*>/gu,'').replace(/["']/gu,'').trim()||person
  const kind=/präsentation|presentation|präsi/iu.test(text)?'Präsentation':/call|telefonat/iu.test(text)?'Call':/gespräch/iu.test(text)?'Gespräch':/besprechung/iu.test(text)?'Besprechung':'Meeting'
  // Weitergeleitete Stud.IP-Mails nennen den Kurs in eckigen Klammern: „[101-113: B2B-Sales Management (4 SWS)]“.
  const course=/\[\d{2,4}-\d{2,4}\s*:\s*([^\]]+?)(?:\s*\(\d[^)]*\))*(?:\s*\([^)]*\))*\s*\]/u.exec(text)?.[1]?.trim()
  const withPlatform=platform||(/zoom/iu.test(text)?'Zoom':'')
  const title=(course?course+' · '+kind:kind+' mit '+(name.includes('@')?name.split('@')[0]:name))+(withPlatform?' · '+withPlatform:'')
  .slice(0,100)
  return {title:title.slice(0,100),date:day,time:start,doors:'',end,venue:withPlatform,reference:'',cents:0,merchants:[]}
}
