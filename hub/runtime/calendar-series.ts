import type {Store} from './store.ts'
import type {SeriesBlock,SeriesChange,SeriesDefinition,SeriesPlan} from './calendar-series-types.ts'
import {berlinInstant} from '../../agents/lifepilot/tools/validate.ts'
import {Problem} from './settings.ts'
import {dateInBerlin,isDate,shiftDay} from './values.ts'
import {personalProfile} from './personal-profile.ts'
import {publicHoliday,travelDays} from './trip-windows.ts'
import {tripStates,type TripState} from './trip-types.ts'

const key=(value:string)=>value.toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
export function holidayRegion(location:string):TripState|null{
  const value=key(location)
  if(/\b(?:esslingen|stuttgart|furtwangen|freiburg|karlsruhe|tubingen|heidelberg|mannheim|reutlingen|ulm|heilbronn)\b/u.test(value))return 'BW'
  const state=(Object.entries(tripStates) as [TripState,string][]).find(([_,name])=>(' '+value+' ').includes(' '+key(name)+' '))
  return state?.[0]??null
}
const reminderHorizon=90

function expand(definition:SeriesDefinition,start:string,end:string,cutoff:string){
  const blocks:SeriesBlock[]=[], skipped:SeriesChange['skipped']=[]
  for(const date of travelDays(start,end)){
    if(!definition.weekdays.includes(new Date(date).getUTCDay()))continue
    const name=definition.region&&publicHoliday(date,definition.region)
    if(name){skipped.push({date,name});continue}
    const at=berlinInstant(date+'T'+definition.startTime)
    if(at<=cutoff)continue
    const to=definition.endTime?berlinInstant(date+'T'+definition.endTime):null
    blocks.push({date,at,end:to})
  }
  return {blocks,skipped}
}

const titleKey=(title:string)=>key(title).replace(/\b(?:arbeitstage|arbeitszeit|arbeitszeiten|arbeit|job|zeichn(?:e|en)|kalender|serie|termine|termin)\b/gu,' ').trim().replace(/ +/gu,' ')||key(title)
function seriesRows(store:Store){
  return store.db.prepare(`SELECT t.id,t.title,t.revision,s.definition FROM calendar_series s
    JOIN tasks t ON t.id=s.task_id WHERE t.status='open' ORDER BY t.title`).all()
}

export function prepareSeries(store:Store,plan:SeriesPlan,day=dateInBerlin(),clock=new Date()):SeriesChange{
  if(plan.seriesIntent==='delete'){
    const rows=seriesRows(store)
    const target=plan.title?titleKey(plan.title):''
    const matching=target?rows.filter(row=>titleKey(String(row.title))===target):rows
    if(matching.length!==1){
      const available=rows.slice(0,5).map(row=>'„'+String(row.title)+'“').join(', ')
      throw new Problem(409,rows.length?'Welche Serie soll ich entfernen? '+available:'Ich finde keine gespeicherte Serie.')
    }
    const row=matching[0]
    const summary=store.db.prepare("SELECT count(*) AS n,min(at) AS start,max(at) AS end FROM schedule WHERE task_id=? AND state!='dismissed'").get(row.id)!
    const definition={...JSON.parse(String(row.definition)) as SeriesDefinition,title:String(row.title)}
    return {operation:'delete',definition,blocks:[],skipped:[],conflicts:[],
      existing:{task:String(row.id),revision:Number(row.revision),start:summary.start as string|null,end:summary.end as string|null,count:Number(summary.n)}}
  }
  const {title,seriesKind,startTime,endTime,category}=plan
  if(!title)throw new Problem(400,'Wie soll die Serie heißen?')
  if(!seriesKind)throw new Problem(400,'Soll ich Termine oder Erinnerungen anlegen?')
  if(!plan.weekdays.length)throw new Problem(400,'An welchen Wochentagen soll sich die Serie wiederholen?')
  if(!startTime||seriesKind==='appointment'&&!endTime)throw new Problem(400,seriesKind==='reminder'?'Um wie viel Uhr soll ich dich erinnern?':'Von wann bis wann dauert jeder Termin?')
  if(!category)throw new Problem(400,'Gehört die Serie zu Arbeit, Uni oder Freizeit?')
  const start=plan.startDate??day
  const stop=plan.endDate
  if(!stop&&seriesKind==='appointment')throw new Problem(400,'Bis zu welchem Datum soll ich die Termine eintragen?')
  if(!isDate(start)||stop&&(!isDate(stop)||stop<day||stop<start||Date.parse(stop)-Date.parse(start)>730*86400_000)||
    !stop&&start>shiftDay(day,730))throw new Problem(400,'Wähle einen gültigen Zeitraum mit Startdatum und optionalem Ende innerhalb von zwei Jahren.')
  if(seriesKind==='appointment'&&endTime!<=startTime)throw new Problem(400,'Das Ende eines Termins muss nach dem Beginn am selben Tag liegen.')
  const region=plan.excludeHolidays?plan.region??holidayRegion(personalProfile(store).fields.location):null
  if(plan.excludeHolidays&&!region)throw new Problem(400,'Welches Bundesland gilt für die Feiertage dieser Serie?')
  const first=start<day?day:start
  const definition:SeriesDefinition={title,kind:seriesKind,weekdays:[...new Set(plan.weekdays)].sort((a,b)=>a-b),startDate:start,
    endDate:stop,startTime,endTime:seriesKind==='appointment'?endTime:null,category,region}
  try{
    const generated=expand(definition,first,stop??shiftDay(first,reminderHorizon),clock.toISOString())
    if(!generated.blocks.length)throw new Problem(400,'In diesem Zeitraum gibt es keinen zukünftigen passenden Wochentag.')
    const conflict=store.db.prepare(`SELECT t.title FROM schedule s JOIN tasks t ON t.id=s.task_id
      WHERE s.kind='slot' AND s.state!='dismissed' AND t.status='open' AND s.at<? AND s.ends_at>? ORDER BY s.at LIMIT 1`)
    const conflicts=generated.blocks.flatMap(block=>{
      const entry=block.end?conflict.get(block.end,block.at):undefined
      return entry?[{date:block.date,title:String(entry.title)}]:[]
    })
    return {operation:'create',definition,...generated,conflicts}
  }catch(error){
    if(error instanceof Problem)throw error
    throw new Problem(400,'Prüfe die Uhrzeit. Eine Uhrzeit bei der Zeitumstellung kann ungültig oder mehrdeutig sein.')
  }
}

export function adoptSeries(store:Store,run:string,change:SeriesChange,actor:string,allowOverlap=false){
  if(change.operation==='delete'&&change.existing){
    const target=store.workspace.get(change.existing.task)
    if(target.revision!==change.existing.revision||target.status!=='open'||!store.db.prepare('SELECT 1 FROM calendar_series WHERE task_id=?').get(target.id))
      throw new Problem(409,'Die Serie wurde inzwischen geändert. Fordere einen neuen Löschvorschlag an.')
    const check=store.db.prepare("SELECT count(*) AS n,min(at) AS start,max(at) AS end FROM schedule WHERE task_id=? AND state!='dismissed'").get(target.id)
    if(check?.n!==change.existing.count||check.start!==change.existing.start||check.end!==change.existing.end)
      throw new Problem(409,'Termine dieser Serie wurden seit der Vorschau geändert.')
    store.workspace.update(target.id,target.revision,{status:'archived'},actor)
    return
  }
  const {definition,blocks}=change
  if(seriesRows(store).some(row=>String(row.definition)===JSON.stringify(definition)))
    throw new Problem(409,'Diese Serie ist bereits gespeichert.')
  const task=store.workspace.add(run,{title:definition.title,date:blocks[0].date,kind:definition.kind==='appointment'?'appointment':'task',
    detail:definition.kind==='appointment'?'Wiederkehrender Termin':'Wiederkehrende Erinnerung',category:definition.category},actor)
  store.db.prepare('INSERT INTO calendar_series VALUES (?,?)').run(task.id,JSON.stringify(definition))
  for(const block of blocks)store.workspace.addSchedule(task.id,block.end?'slot':'reminder',block.at,block.end,actor,allowOverlap)
}

export function extendReminders(store:Store,clock=new Date()){
  const today=dateInBerlin(clock), through=shiftDay(today,reminderHorizon)
  const rows=store.db.prepare(`SELECT t.id,s.definition FROM calendar_series s JOIN tasks t ON t.id=s.task_id
    WHERE t.status='open' AND json_extract(s.definition,'$.kind')='reminder' AND json_extract(s.definition,'$.endDate') IS NULL`).all()
  if(!rows.length)return
  store.transaction(()=>{
    const exists=store.db.prepare("SELECT 1 FROM schedule WHERE task_id=? AND kind='reminder' AND at=?")
    for(const row of rows){
      const definition=JSON.parse(String(row.definition)) as SeriesDefinition
      const first=definition.startDate>today?definition.startDate:today
      if(first>through)continue
      const {blocks}=expand(definition,first,through,clock.toISOString())
      for(const block of blocks)if(!exists.get(row.id,block.at))
        store.workspace.addSchedule(String(row.id),'reminder',block.at,null,'Kalenderserie')
    }
  })
}
