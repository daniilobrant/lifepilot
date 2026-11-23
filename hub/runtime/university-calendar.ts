import type {GoogleConnector,GoogleEvent} from '../connectors/google.ts'
import {cleanCourse} from '../../agents/lifepilot/tools/university-mail.ts'
import {berlinInstant} from '../../agents/lifepilot/tools/validate.ts'
import {dateInBerlin,shiftDay} from './values.ts'
import {type InboxProposal, listInbox} from './inbox.ts'
import {googleLifePilotCalendar} from './google-appointment.ts'
import {Problem} from './settings.ts'
import type {Store,Channel} from './store.ts'

type CalendarReader=Pick<GoogleConnector,'calendarRange'|'status'>
type CalendarWriter=CalendarReader&Pick<GoogleConnector,'changeAppointment'|'mailboxAddress'>
type Notice=NonNullable<InboxProposal['lectureCancellation']>
export type LectureTarget={
  title:string
  local?:{id:string,revision:number,slot:string|null,start:string|null,end:string|null}
  google?:{id:string,title:string,start:string,end:string,calendar:'primary'|'lifepilot'}
}
const named=(course:string,title:string)=>{
  const candidate=cleanCourse(title)
  if(course.length<3||!candidate)return false
  return course===candidate||(' '+course+' ').includes(' '+candidate+' ')||(' '+candidate+' ').includes(' '+course+' ')
}
const berlinTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})

function localLectures(store:Store,notice:Notice,start:string,end:string):LectureTarget[]{
  const rows=store.db.prepare(`SELECT t.id,t.title,t.revision,s.id AS slot,s.at,s.ends_at,linked.event_id,linked.title AS exported_title,
    linked.starts_at AS exported_start,linked.ends_at AS exported_end
    FROM tasks t LEFT JOIN schedule s ON s.task_id=t.id AND s.kind='slot' AND s.state!='dismissed' AND s.at>=? AND s.at<?
    LEFT JOIN google_appointment_sync linked ON linked.slot_id=s.id AND linked.removed=0
    WHERE t.status='open' AND t.kind='appointment' AND t.category='university'
    AND (s.id IS NOT NULL OR (t.due_date=? AND NOT EXISTS
      (SELECT 1 FROM schedule planned WHERE planned.task_id=t.id AND planned.kind='slot')))
    AND (linked.pending_op IS NULL)`).all(start,end,notice.date)
  return rows.filter(row=>named(notice.course,String(row.title))&&(
    !notice.time||typeof row.at==='string'&&berlinTime.format(new Date(row.at))===notice.time)).map(row=>({
    title:String(row.title),
    local:{id:String(row.id),revision:Number(row.revision),slot:row.slot as string|null,start:row.at as string|null,end:row.ends_at as string|null},
    ...(row.event_id&&{google:{id:String(row.event_id),title:String(row.exported_title),start:String(row.exported_start),end:String(row.exported_end),calendar:'lifepilot' as const}}),
  }))
}
export async function resolveLecture(store:Store,google:CalendarReader|undefined,notice:Notice){
  if(notice.approvedTarget)return {target:notice.approvedTarget}
  if(!notice.date||!notice.course)return {reason:'Datum oder Vorlesungsname ist in der Mail nicht eindeutig.'}
  if(notice.date<dateInBerlin())return {reason:'Der Termin liegt bereits in der Vergangenheit.'}
  const start=berlinInstant(notice.date+'T00:00'), end=berlinInstant(shiftDay(notice.date,1)+'T00:00')
  const candidates=localLectures(store,notice,start,end)
  const statuses=google?.status()??[]
  if(google&&statuses.some(entry=>entry.service==='calendar'&&entry.connected)){
    let events:GoogleEvent[]
    try{
      const data=await google.calendarRange(start,end)
      if(data.limited)return {reason:'Google hat weitere Termine auf dieser Tagesseite. Die Zuordnung ist offen.'}
      events=data.events
    }catch{
      return {reason:'Google Kalender konnte gerade nicht geprüft werden.'}
    }
    for(const entry of events){
      const eventDay=entry.allDay?entry.start:dateInBerlin(new Date(entry.start))
      if(eventDay!==notice.date||(entry.allDay&&entry.end!==shiftDay(notice.date,1))||!named(notice.course,entry.title)||notice.time&&
        (entry.allDay||berlinTime.format(new Date(entry.start))!==notice.time))continue
      candidates.push({title:entry.title,google:{id:entry.id,title:entry.title,start:entry.start,end:entry.end,calendar:'primary'}})
    }
  }
  if(candidates.length!==1)return {reason:candidates.length?'Mehrere passende Termine. Die Zuordnung ist offen.':'Kein passender Vorlesungstermin im Kalender gefunden.'}
  const [target]=candidates
  if(target.google?.calendar==='primary'&&!statuses.some(entry=>entry.service==='calendar-write'&&entry.connected))
    return {target,reason:'Für diesen Termin Google-Hauptkalender unter Einstellungen → Verbindungen freigeben.'}
  if(target.google?.calendar==='lifepilot'&&!statuses.some(entry=>entry.service==='calendar-test'&&entry.connected))
    return {target,reason:'Für diesen Termin den LifePilot-Google-Kalender erneut verbinden.'}
  return {target}
}

export async function inboxWithLectureTargets(store:Store,google:CalendarReader|undefined){
  const proposals=listInbox(store)
  return Promise.all(proposals.map(async(row,index)=>{
    if(!row.lectureCancellation||row.state!=='pending'||index>=20)return row
    return {...row,lectureCancellation:{...row.lectureCancellation,...await resolveLecture(store,google,row.lectureCancellation)}}
  }))
}

function validateLocal(store:Store,target:LectureTarget){
  if(!target.local)return
  const {id,revision,slot,start,end}=target.local
  const task=store.workspace.get(id)
  const current=slot?store.db.prepare("SELECT at,ends_at,state FROM schedule WHERE id=? AND task_id=?").get(slot,id):undefined
  if(task.status!=='open'||task.revision!==revision||task.title!==target.title||
    slot&&(!current||current.state==='dismissed'||current.at!==start||current.ends_at!==end))
    throw new Problem(409,'Der Kalendertermin hat sich geändert. Prüfe den Vorschlag erneut.')
  return task
}

const approving=new Set<string>()
export async function approveLectureCancellation(store:Store,google:CalendarWriter|undefined,proposal:InboxProposal,expected:unknown,actor:Channel){
  if(!proposal.lectureCancellation)return false
  if(proposal.state==='accepted')return true
  if(proposal.state!=='pending'||approving.has(proposal.id))throw new Problem(409,'Dieser Vorschlag wird bereits bearbeitet.')
  approving.add(proposal.id)
  try {
    const notice=proposal.lectureCancellation
    const resolution=await resolveLecture(store,google,notice)
    const target=resolution.target
    if(!target||resolution.reason||JSON.stringify(target)!==JSON.stringify(expected))
      throw new Problem(409,resolution.reason??'Der Kalendertermin wurde geändert. Lade die Vorschläge neu.')
    validateLocal(store,target)
    if(target.google){
      const remote=target.google
      const primary=remote.calendar==='primary'
      const calendar=primary?await google?.mailboxAddress():googleLifePilotCalendar(store)
      if(!google||!calendar||calendar==='pending')throw new Problem(409,'Verbinde zuerst das passende Google-Konto.')
      store.transaction(()=>{
        const row=store.db.prepare('SELECT state FROM inbox_proposals WHERE id=?').get(proposal.id)
        if(row?.state!=='pending')throw new Problem(409,'Der Vorschlag ist nicht mehr offen.')
        validateLocal(store,target)
        const {target:_target,reason:_reason,...record}=notice
        store.db.prepare('UPDATE inbox_proposals SET evidence=? WHERE id=?')
          .run(JSON.stringify({lectureCancellation:{...record,approvedTarget:target}}),proposal.id)
      })
      await google.changeAppointment(calendar,remote.id,remote,null,primary?'calendar-write':'calendar-test')
    }
    store.transaction(()=>{
      const current=store.db.prepare("SELECT state FROM inbox_proposals WHERE id=?").get(proposal.id)
      if(current?.state!=='pending')throw new Problem(409,'Der Vorschlag ist nicht mehr offen.')
      const task=validateLocal(store,target)
      if(task&&target.local){
        const {slot}=target.local
        const hasOther=slot&&store.db.prepare("SELECT 1 FROM schedule WHERE task_id=? AND kind='slot' AND state!='dismissed' AND id<>?").get(task.id,slot)
        if(hasOther&&slot){
          store.workspace.dismiss(slot,actor)
          const next=store.db.prepare("SELECT at FROM schedule WHERE task_id=? AND kind='slot' AND state!='dismissed' ORDER BY at LIMIT 1").get(task.id)
          if(next&& task.due_date===notice.date)store.workspace.update(task.id,task.revision,{due_date:dateInBerlin(new Date(String(next.at)))},actor)
        }else store.workspace.update(task.id,task.revision,{status:'archived'},actor)
        if(slot&&target.google)store.db.prepare('UPDATE google_appointment_sync SET removed=1 WHERE slot_id=? AND event_id=?').run(slot,target.google.id)
      }
      store.db.prepare("UPDATE inbox_proposals SET state='accepted',task_id=?,decided_at=?,decided_via=? WHERE id=? AND state='pending'")
        .run(task?.id??null,new Date().toISOString(),actor,proposal.id)
    })
    return true
  }finally{approving.delete(proposal.id)}
}
