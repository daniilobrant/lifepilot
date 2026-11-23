import type {Result} from '../../agents/lifepilot/tools/validate.ts'
import type {ModelPayload} from './model-payload.ts'
import {dateInText} from './calendar-series-chat.ts'
import {weekdayNames} from './calendar-series-types.ts'
import {shiftDay} from './values.ts'
import {areaCategory,taskPriorities} from './tasks-board-types.ts'
import type {ProjectArea,ProjectPriority} from './project-types.ts'

function requestedDate(value:string,day:string){
  const prefix=/^(?:kommenden?|nächsten?)\s+/iu.exec(value)
  const cleaned=value.replace(/^(?:kommenden?|nächsten?)\s+/iu,'').trim()
  const weekday=weekdayNames.findIndex(name=>name.toLowerCase()===cleaned.toLowerCase())
  if(weekday>=0){
    const difference=(weekday-new Date(day+'T12:00Z').getUTCDay()+7)%7
    return shiftDay(day,difference||(prefix?7:0))
  }
  return dateInText(cleaned,day)
}

export function taskBoardFromChat(payload:ModelPayload):Result|undefined{
  const latest=payload.messages.at(-1),input=latest?.input.trim()
  const day=latest?.referenceDay??payload.day
  if(!day||!input||payload.sourceNote)return
  const create=/^(?:bitte\s+)?(?:erstelle|lege|trage)\s+(?:mir\s+)?(?:unter|im bereich)\s+(uni|privat|arbeit)\s+(?:eine?\s+)?(aufgabe|frist)\s+(?:für\s+)?(.*)$/iu.exec(input)
  if(create&&input.length<=400){
    const [,area,kind,details]=create
    const boundary=/\s+(?:am|bis zum|bis|auf)\s+(.+?)(?=\s+mit\s+|\s+an$|[!?]$|$)/iu.exec(details)
    const title=(boundary?details.slice(0,boundary.index):details.split(/\s+mit\s+|\s+an[.!]?$/iu)[0]).trim().replace(/^[„"«]|[“"»]$/gu,'')
    const date=boundary?requestedDate(boundary[1].trim().replace(/[.!?]$/u,''),day):null
    if(!title||title.length>120)return
    if((kind.toLowerCase()==='frist'||boundary)&&!date)
      return {tasks:[],questions:['Bis zu welchem Datum soll „'+title+'“ fällig sein?']}
    const level=/\bmit\s+(hoher|hohe|mittlerer|mittlere|niedriger|niedrige)\s+priorität\b/iu.exec(details)?.[1]?.toLowerCase()
    const priority:ProjectPriority=level?.startsWith('ho')?'high':level?.startsWith('niedrig')?'low':'medium'
    return {tasks:[{title,kind:'task',date,evidence:input,doneWhen:title,
      priority:taskPriorities[priority],category:areaCategory[area.toLowerCase() as ProjectArea]}],questions:[]}
  }
  const task=payload.context.filter(entry=>entry.kind==='task'&&input.toLowerCase().includes(entry.title.toLowerCase()))
  if(task.length!==1)return
  const [target]=task
  const after=input.slice(input.toLowerCase().indexOf(target.title.toLowerCase())+target.title.length)
  const move=/\b(?:verschiebe|verlege|setz(?:e)?)\b/iu.test(input)
  const to=move?/\b(?:auf|bis zum|bis)\s+(.+?)\s*[!?]?$/iu.exec(after)?.[1]:undefined
  if(to&&!/\buhr\b/iu.test(to)){
    const date=requestedDate(to.trim().replace(/\.$/u,''),day)
    return date?{tasks:[],questions:[],actions:[{kind:'deadline',target:target.id,value:date,duration:null,reason:'Neues Fälligkeitsdatum'}]}:
      {tasks:[],questions:['Auf welches Datum soll „'+target.title+'“ verschoben werden?']}
  }
}
