import {dateInBerlin,isDate,shiftDay} from '../../../hub/runtime/values.ts'

const universityAddress=/\b[\w.%+-]+@(?:[\w-]+\.)*hfu\.de\b/iu
const forwarding=/^\s*(?:-{2,}\s*)?(?:weitergeleitete nachricht|forwarded message|begin forwarded message):?(?:\s*-{2,})?\s*$/imu
const courseWords=/\b(?:vorlesung|seminar|modul|übung|tutorium|klausur|prüfung|praktikum|lehrveranstaltung|lecture|class)\b/iu
const cancelled=/\bfällt\b[^.!?\n]{0,80}\baus\b|\bentfällt\b|\b(?:vorlesungs|veranstaltungs)ausfall\b|\bausfall(?:\s+(?:der|von))?\b|(?:findet|finde)[^.!?\n]{0,50}nicht statt|\b(?:is cancelled|is canceled|cancellation of)\b/iu
const social=/\b(?:dinner|stammtisch|afterwork|party|feier|sommerfest|weihnachtsfeier|infoveranstaltung|informationsveranstaltung|campusfest|networking|get-together|alumni|schnupperveranstaltung|karrieremesse|webinar)\b/iu
const explicitReply=/\b(?:bitte (?:antworten|antworte|antwortet|bestätigen|bestätige|bestätigt|melde[n]? (?:dich|sich)|meldet euch)|(?:bitte um|brauch(?:e|en))\s+(?:eine |deine |ihre )?rückmeldung|(?:kannst du|können sie|könnt ihr|passt dir|passt euch)[^\n?]{2,100}\?|please (?:reply|confirm|respond)\b)/iu
const academicAction=/\b(?:raumänderung|raumwechsel|verschoben|abgabe|abgabefrist|anmeldefrist|prüfungsanmeldung|prüfungstermin|prüfungsergebnis|pflichttermin|lehrveranstaltung|vorlesung|klausur|seminar|tutorium|übung|modul)\b/iu
const dateWords=['januar','februar','märz','april','mai','juni','juli','august','september','oktober','november','dezember']

type Mail={from:string,subject:string,text:string,at?:string|null,mailingList?:boolean,replyToMessage?:boolean,originalRecipients?:string,previewOnly?:boolean}
export const isHfuAddress=(value:string)=>universityAddress.test(value)
function address(value:string){
  return /[\w.%+-]+@[\w.-]+\.[a-z]{2,}/iu.exec(value)?.[0]
}
function linesOf(value:string){
  return value.split(/\r?\n/u).map(line=>line.trim())
}

export type HfuMail={sender:string,subject:string,reply:boolean,replyRequired:boolean,important:boolean,kind:'lecture'|'reply'|'notice'|'event'|'cancellation',
 cancellation?:{course:string,subject:string,date?:string,time?:string}}

export function hfuMail(mail:Mail):HfuMail|undefined{
  const headerHfu=isHfuAddress(mail.from)
  const recipientsHfu=isHfuAddress(mail.originalRecipients??'')
  const isForward=/^(?:wg|fw|fwd)\s*:/iu.test(mail.subject)
  const boundary=forwarding.exec(mail.text)
  const forwardedText=boundary?mail.text.slice(boundary.index+boundary[0].length):mail.text
  const lines=linesOf(forwardedText)
  const originalIndex=!boundary&&!isForward?-1:lines.slice(0,20).findIndex(line=>/^(?:von|from|absender)\s*:/iu.test(line)&&address(line))
  const original=originalIndex<0?'':lines[originalIndex].replace(/^(?:von|from|absender)\s*:\s*/iu,'')
  if(!headerHfu&&!recipientsHfu&&!(original&&isHfuAddress(original)))return
  const forwardedHeaders=lines.slice(Math.max(originalIndex,0),Math.max(originalIndex,0)+11)
  const subject=(originalIndex<0?'':forwardedHeaders.find(line=>/^(?:betreff|subject)\s*:/iu.test(line))?.replace(/^(?:betreff|subject)\s*:\s*/iu,''))||mail.subject
  const body=(originalIndex<0?lines:lines.slice(originalIndex+1)).slice(0,90)
    .filter(line=>!/^>|^(?:von|from|gesendet|sent|datum|date|an|to|cc|betreff|subject|reply-to)\s*:/iu.test(line))
    .join('\n').split(/\n(?:-+\s*(?:ursprüngliche|original|forwarded)|am .{3,110} schrieb|on .{3,110} wrote)/iu)[0]
    .slice(0,8500)
  const sender=(original||mail.from).replace(/[<>]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,160)
  const reply=mail.replyToMessage===true||/^(?:(?:wg|fw|fwd)\s*:\s*)*(?:re|aw|sv)\s*:/iu.test(subject)
  const event=social.test(subject)||!courseWords.test(subject)&&social.test(body.slice(0,400))
  const cancellationLines=body.split('\n').filter(line=>cancelled.test(line)).slice(0,4)
  const courseContext=courseWords.test(subject+'\n'+body.slice(0,1200))||/\b(?:vorlesungs|veranstaltungs)ausfall/iu.test(subject)
  const notice=subject+'\n'+cancellationLines.join('\n')
  const active=!mail.previewOnly&&(headerHfu||isHfuAddress(original))&&courseContext&&cancelled.test(notice)&&(!reply||cancellationLines.length>0)&&!event&&
    !/findet.{0,30}(?:wie geplant|doch|regulär).{0,15}statt|kein(?:en|e)? ausfall/iu.test(body.slice(0,1200))&&
    !/\b(?:nicht|kein(?:en|e)?)\s+(?:ausfall|abgesagt)|(?:falls|wenn|ob|eventuell|möglicherweise|vielleicht)[^\n.!?]{0,60}(?:ausfällt|entfällt|ausfall)|\b(?:fällt|entfällt)[^\n.!?]{0,40}\bnicht\b/iu.test(notice)
  const replyRequired=!mail.previewOnly&&explicitReply.test(body)&&(!event||reply)
  if(active){
    const courseLine=/^(?:modul|fach|kurs|vorlesung|lehrveranstaltung)\s*:\s*(.{2,110})$/imu.exec(body)?.[1]
    const namedBody=cancellationLines.map(line=>/\b(?:vorlesung|seminar|modul|lecture)\s+[„”"]?(.{3,90}?)[“”"]?\s+(?:am\b|fällt|entfällt|findet|is cancelled)/iu.exec(line)?.[1]).find(Boolean)
    const course=cleanCourse(courseLine||subject)||cleanCourse(namedBody??'')
    const forwardedDate=forwardedHeaders.find(line=>/^(?:datum|date|gesendet|sent)\s*:/iu.test(line))?.replace(/^[^:]+:\s*/u,'')
    const originalAt=originalIndex<0?mail.at:forwardedDate&&Number.isFinite(Date.parse(forwardedDate))?new Date(forwardedDate).toISOString():
      forwardedDate?noticeDates(forwardedDate,mail.at)[0]:undefined
    const dates=noticeDates([notice,...body.split('\n').slice(0,7)].join('\n'),originalAt)
    const times=[...new Set(Array.from(notice.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:uhr\b|(?=[–—-]))|\b(?:um|ab)\s+([01]?\d|2[0-3]):([0-5]\d)\b/giu),match=>
      (match[1]??match[3]).padStart(2,'0')+':'+(match[2]??match[4])))]
    return {sender,subject,reply,replyRequired,important:true,kind:'cancellation',
      cancellation:{course,subject,date:dates.length===1?dates[0]:undefined,time:times.length===1?times[0]:undefined}}
  }
  if(event)return {sender,subject,reply,replyRequired,important:replyRequired,kind:reply?'reply':'event'}
  const course=academicAction.test(subject+'\n'+body.slice(0,1000))
  const important=course||replyRequired
  return {sender,subject,reply,replyRequired,important,kind:course?'lecture':reply?'reply':'notice'}
}

export function cleanCourse(value:string){
  return value.normalize('NFKC').toLowerCase().replace(/\b\d{1,2}[.:]\d{2}(?:\.\d{2,4})?\.?\b|\b20\d\d-\d\d-\d\d\b/gu,' ')
    .replace(/\b(?:re|aw|fw|fwd|wg|ausfall|entfällt|entfallen|fällt|findet|statt|nicht|aus|abgesagt|cancelled|canceled|vorlesungs?|vorlesungsausfall|seminar|modul|übung|tutorium|lehrveranstaltung|veranstaltung|lecture|klasse|class|der|die|das|des|am|vom|für|von|um|uhr|heute|morgen|übermorgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|so|mo|di|mi|do|fr|sa|januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/giu,' ')
    .replace(/\b20\d\d\b|[^\p{L}\p{N}]+/gu,' ').trim().replace(/ +/gu,' ').slice(0,115)
}
function noticeDates(value:string,at?:string|null){
  const origin=at&&Number.isFinite(Date.parse(at))?dateInBerlin(new Date(at)):undefined
  const result=new Set<string>()
  const put=(d:string)=>{if(isDate(d))result.add(d)}
  const date=(day:string,month:string,year?:string)=>{
    if(!year&&!origin)return
    let y=year?(year.length===2?'20'+year:year):origin!.slice(0,4)
    if(!year&&origin!.slice(5,7)==='12'&&month.padStart(2,'0')==='01')y=String(Number(y)+1)
    put(y+'-'+month.padStart(2,'0')+'-'+day.padStart(2,'0'))
  }
  for(const match of value.matchAll(/\b20\d\d-\d\d-\d\d\b/gu))put(match[0])
  for(const match of value.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(?:(20\d\d|\d\d)(?!\d))?/gu))date(match[1],match[2],match[3])
  for(const match of value.matchAll(/\b(\d{1,2})\.\s*(\p{L}+)\s*(20\d\d)?/giu)){
    const month=dateWords.indexOf(match[2].toLowerCase())+1
    if(month)date(match[1],String(month),match[3])
  }
  if(!result.size&&origin){
    const relative=[...new Set(Array.from(value.split('\n').slice(0,4).join('\n').matchAll(/\b(übermorgen|morgen|heute)\b/giu),match=>match[1].toLowerCase()))]
    if(relative.length===1)put(shiftDay(origin,relative[0]==='heute'?0:relative[0]==='morgen'?1:2))
  }
  return [...result]
}
