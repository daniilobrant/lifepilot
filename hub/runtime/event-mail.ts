import {isDate} from './values.ts'

const months=['januar','februar','märz','april','mai','juni','juli','august','september','oktober','november','dezember']
export const ticketSubject=/(?:tickets?\s+(?:für|zu|for)|ticket[- ]?(?:bestätigung|bestellung|confirmation)|veranstaltungsbestätigung|event booking confirmation)/iu
const cancelled=/storniert|abgesagt|cancelled|verschoben|rescheduled|\berinnerung\b|\breminder\b/iu
const time='([01]?\\d|2[0-3])[:.]([0-5]\\d)'
const timeFor=(line:string,label:string)=>{
  // Callers supply only fixed event labels.
  const match=new RegExp('(?:'+label+')\\s*:?\\s*'+time,'iu').exec(line) // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  return match && match[1].padStart(2,'0')+':'+match[2]
}
const amount=/(?:€\s*)?((?:\d{1,3}(?:[. ]\d{3})+|\d+)[,.]\d{2})\s*(?:€|EUR)/iu
const money=(value:string)=>Number(amount.exec(value)?.[1]?.replace(/\D/gu,'')||0)
export const eventIdentity=(value:string)=>value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replace(/[^a-z0-9]/gu,'')

export type TicketEvent={title:string,date:string,time:string,doors:string,end:string,venue:string,reference:string,cents:number,merchants:string[]}

export function readTicketEvent(mail:{subject:string,from:string,text:string}):TicketEvent|undefined{
  if(!ticketSubject.test(mail.subject)||cancelled.test(mail.subject))return
  const lines=mail.text.split(/\r?\n/u).map(line=>line.replace(/\s+/gu,' ').trim()).filter(line=>line&&!line.startsWith('>')).slice(0,100)
  const text=lines.join('\n')
  if(!/bestellung (?:wurde )?(?:erfolgreich|bestätigt)|tickets? sind (?:bereit|gebucht)|buchung (?:ist )?bestätigt|booking (?:has been )?confirmed|your tickets are ready|order (?:is )?confirmed/iu.test(text))return
  const candidates=lines.flatMap((line,index)=>{
    const start=timeFor(line,'beginn|start(?:s)?|showtime')||timeFor(lines[index+1]??'','beginn|start(?:s)?|showtime')
    if(!start)return []
    const numeric=/\b(20\d\d)-(\d\d)-(\d\d)\b/u.exec(line)
    const dotted=/\b(\d{1,2})\.(\d{1,2})\.(20\d\d)\b/u.exec(line)
    const written=/\b(\d{1,2})\.?\s+(\p{L}+)\s+(20\d\d)\b/iu.exec(line)
    const month=written?months.indexOf(written[2].toLowerCase())+1:0
    const date=numeric?.[0]??(dotted?dotted[3]+'-'+dotted[2].padStart(2,'0')+'-'+dotted[1].padStart(2,'0'):
      written&&month?written[3]+'-'+String(month).padStart(2,'0')+'-'+written[1].padStart(2,'0'):'')
    return isDate(date)?[{index,date,start}]:[]
  })
  if(candidates.length!==1)return
  const {index,date,start}=candidates[0]
  const timing=lines.slice(index,index+2).join(' ')
  const venueLine=lines.slice(index+1,index+5).find(line=>
    /^(?:ort|veranstaltungsort|location|venue)\s*:/iu.test(line)||/·.*\b\d{5}\b/u.test(line))
  const venue=venueLine?.replace(/^(?:ort|veranstaltungsort|location|venue)\s*:\s*/iu,'').slice(0,190)??''
  const event=mail.subject.replace(/.*?tickets?\s+(?:für|zu|for)\s+/iu,'').trim()
  const show=event!==mail.subject.trim()?event:(lines[index-1]??mail.subject)
  const venueName=venue.split(' · ')[0]
  const title=[show,venueName&&!eventIdentity(show).includes(eventIdentity(venueName))?venueName:''].filter(Boolean).join(' · ').slice(0,120)
  const reference=/\b(?:bestell[- ]?(?:nr\.?|nummer)|buchungs(?:nummer|code)|order (?:number|reference|id))\s*[:#]?\s*([a-z0-9][a-z0-9-]{3,39})\b/iu.exec(text)?.[1]?.toLowerCase()??''
  const totals=[...new Set(lines.flatMap((line,i)=>/^(?:gesamt(?:betrag|summe|preis)?|endbetrag|total(?: paid)?)(?:\s*[:：]|\s*$|\s+(?=[€\d]))/iu.test(line)?[money(line)||money(lines[i+1]??'')]:[]).filter(Boolean))]
  const organizer=/(?:vertragspartner[^\n]*?\sist\s|^(?:veranstalter|organizer)\s*:\s*)([^,\n.]{3,90})/imu.exec(text)?.[1]
  const intermediary=mail.from.match(/\bvia\s+([^"<@]{3,45})/iu)?.[1]
  const merchants=[...new Set([venueName,organizer,intermediary].filter(Boolean).map(value=>eventIdentity(value!)).filter(value=>value.length>=5))]
  return {title,date,time:start,doors:timeFor(timing,'einlass|doors')||'',end:timeFor(timing,'ende|ends?')||'',venue,reference,
    cents:totals.length===1?totals[0]:0,merchants}
}
