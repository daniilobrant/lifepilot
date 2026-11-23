import {randomUUID} from 'node:crypto'
import {Problem} from './settings.ts'
import type {Store} from './store.ts'
import {bounded,dateInBerlin,isDate,mondayOf,shiftDay} from './values.ts'
import {projectAreas,projectPriorities,priorityRank,type Project,type ProjectChange,type ProjectData,type ProjectDeadline,
  type ProjectPlan,type ProjectStep,type ProjectStepDetails,type ProjectSuggestion,type ProjectsOverview,type ProjectTiming} from './project-types.ts'

type ProjectRow={id:string,revision:number,data:string,updated_at:string}
function projectData(row:ProjectRow):ProjectData{
  const data=JSON.parse(row.data) as ProjectData & {status:string}
  if((data.status as string)==='completed'){
    data.status='archived'
    data.archived_at=row.updated_at
  }
  return data
}
const emptyTiming:ProjectTiming={scheduleMode:'none',date:null,approxLabel:null}
const blankPlan:Omit<ProjectPlan,'projectIntent'>={project:null,step:null,title:null,area:null,description:null,priority:null,scheduleMode:null,
  date:null,approxLabel:null,completed:null,position:null,steps:[]}
export const projectPlan=(projectIntent:ProjectPlan['projectIntent'],fields:Partial<typeof blankPlan>={}):ProjectPlan=>({projectIntent,...blankPlan,...fields})
export const projectKey=(value:string)=>value.toLocaleLowerCase('de-DE').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
const noDate='9999-12-31'
const now=()=>new Date().toISOString()
const text=(value:unknown,max:number)=>{
  if(!bounded(value,max))throw new Problem(400,'Prüfe den Titel.')
  return value.trim()
}
const optional=(value:unknown,max:number)=>{
  if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value))
    throw new Problem(400,'Ein Projektfeld ist zu lang oder ungültig.')
  return value.trim()
}
function approximateDate(label:string,today:string){
  const week=/\bKW\s*(\d{1,2})(?:[ /.–-]+(20\d\d))?\b/iu.exec(label)
  const day=/\b(\d{1,2})\.(\d{1,2})\.(?:(20\d\d)(?!\d))?/u.exec(label)
  const current=Number(today.slice(0,4))
  if(week){
    const number=Number(week[1])
    if(number<1||number>53)return null
    const toDate=(year:number)=>{
      const first=mondayOf(year+'-01-04')
      if(number===53&&shiftDay(first,52*7)>=mondayOf((year+1)+'-01-04'))return null
      return shiftDay(first,(number-1)*7+(/anfang/iu.test(label)?0:6))
    }
    const candidate=toDate(Number(week[2]??current))
    return !week[2]&&candidate&&candidate<shiftDay(today,-45)?toDate(current+1):candidate
  }
  if(day){
    const build=(year:number)=>year+'-'+day[2].padStart(2,'0')+'-'+day[1].padStart(2,'0')
    const candidate=build(Number(day[3]??current))
    const result=!day[3]&&candidate<shiftDay(today,-45)?build(current+1):candidate
    return isDate(result)?result:null
  }
  return null
}
export function projectTiming(value:Pick<ProjectPlan,'scheduleMode'|'date'|'approxLabel'>,previous=emptyTiming):ProjectTiming{
  const mode=value.scheduleMode??(value.date?(previous.scheduleMode==='none'?'deadline':previous.scheduleMode):previous.scheduleMode)
  if(mode==='none')return {...emptyTiming}
  if(mode!=='deadline'&&mode!=='checkpoint')throw new Problem(400,'Wähle eine Deadline oder einen Checkpoint.')
  const approxLabel=mode==='checkpoint'?(optional(value.approxLabel??previous.approxLabel??'',100)||null):null
  const inferred=approxLabel&&value.approxLabel!==previous.approxLabel?approximateDate(approxLabel,dateInBerlin()):null
  const date=value.date??inferred??previous.date??(approxLabel?approximateDate(approxLabel,dateInBerlin()):null)
  if(date!==null&&!isDate(date)||!date&&(mode==='deadline'||!approxLabel))
    throw new Problem(400,mode==='deadline'?'Wähle ein festes Zieldatum.':'Gib ein Datum oder einen ungefähren Checkpoint an.')
  return {scheduleMode:mode,date,approxLabel}
}
function validPriority(value:unknown){
  if(typeof value!=='string'||!Object.hasOwn(projectPriorities,value))throw new Problem(400,'Wähle Hoch, Mittel oder Niedrig.')
  return value as ProjectData['priority']
}
function validArea(value:unknown){
  if(typeof value!=='string'||!Object.hasOwn(projectAreas,value))throw new Problem(400,'Gehört das Projekt zu Uni, Privat oder Arbeit?')
  return value as ProjectData['area']
}
function stepDetails(value:ProjectStepDetails,timing:ProjectTiming,previous?:ProjectStepDetails):ProjectStepDetails{
  const phase=value.phase===undefined?previous?.phase??null:optional(value.phase??'',80)||null
  const notes=value.notes===undefined?previous?.notes??null:optional(value.notes??'',600)||null
  const startDate=value.startDate===undefined?previous?.startDate??null:value.startDate
  if(startDate&&(!isDate(startDate)||timing.date&&startDate>timing.date))
    throw new Problem(400,'Der Start des Unterpunkts muss am oder vor dem Zieldatum liegen.')
  return {phase,notes,startDate}
}
function newStep(value:ProjectPlan['steps'][number]):ProjectStep{
  const timing=projectTiming(value)
  return {id:randomUUID(),title:text(value.title,120),priority:value.priority&&value.priority!=='inherit'?validPriority(value.priority):null,
    completed:value.completed===true,completedAt:value.completed===true?now():null,...timing,...stepDetails(value,timing)}
}

export function projectDeadlines(project:Pick<Project,'id'|'title'|'priority'|'status'|'steps'|'date'|'scheduleMode'|'approxLabel'|'deadlineCompleted'>,through?:string):ProjectDeadline[]{
  if(project.status!=='active'&&!through)return []
  const make=(item:ProjectTiming,id:string,title:string,priority:Project['priority'],completed=false):ProjectDeadline[]=>
    item.date&&item.scheduleMode!=='none'&&(!completed||!!through&&item.date>=through)?
    [{id,projectId:project.id,title,projectTitle:project.title,date:item.date,priority,mode:item.scheduleMode,label:item.approxLabel,completed}]:[]
  const finished=project.status==='archived'
  return [...make(project,project.id,project.title,project.priority,finished||project.deadlineCompleted),
    ...project.steps.flatMap(step=>make(step,step.id,step.title,step.priority??project.priority,step.completed||finished))]
}
export function timeframe(project:ProjectData,today:string):Project['timeframe']{
  if(project.status==='archived')return 'on_track'
  const open=project.steps.filter(step=>!step.completed)
  const dates=[project.deadlineCompleted?null:project.date,...open.map(step=>step.date)].filter(isDate)
  const high=open.filter(step=>(step.priority??project.priority)==='high').length
  if(dates.some(date=>date<today)||project.date&&project.date<=shiftDay(today,5)&&(high>=2||open.length>=4))return 'at_risk'
  return dates.some(date=>date<=shiftDay(today,3))?'checkpoint_soon':'on_track'
}
export function listProjects(store:Store,today=dateInBerlin()){
  return (store.db.prepare('SELECT id,data,revision,updated_at FROM projects ORDER BY created_at').all() as ProjectRow[]).map(row=>{
    const data=projectData(row)
    return {...data,id:row.id,revision:row.revision,timeframe:timeframe(data,today)}
  }).sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]||
    (projectDeadlines(a).map(item=>item.date).sort()[0]??noDate).localeCompare(projectDeadlines(b).map(item=>item.date).sort()[0]??noDate)||
    a.title.localeCompare(b.title,'de'))
}
export function rowProject(store:Store,id:string):Project{
  const row=store.db.prepare('SELECT * FROM projects WHERE id=?').get(id) as ProjectRow|undefined
  if(!row)throw new Problem(404,'Das Projekt ist nicht mehr verfügbar.')
  const data=projectData(row)
  return {...data,id,revision:row.revision,timeframe:timeframe(data,dateInBerlin())}
}
export function projectOverview(store:Store,account?:string,today=dateInBerlin()):ProjectsOverview{
  const projects=listProjects(store,today).map(project=>({...project,links:project.links.filter(mail=>mail.account===account)}))
  const deadlines=projects.flatMap(project=>projectDeadlines(project,today)).sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]||a.date.localeCompare(b.date))
  const suggestions=(account?store.db.prepare(`SELECT s.id,s.data,p.id projectId,p.data projectData FROM project_email_suggestions s
    JOIN projects p ON p.id=s.project_id WHERE s.account=? AND s.status='pending' AND json_extract(p.data,'$.status')='active'
    ORDER BY s.rowid DESC LIMIT 50`).all(account):[]).map(row=>({...JSON.parse(String(row.data)),id:String(row.id),projectId:String(row.projectId),
      projectTitle:JSON.parse(String(row.projectData)).title} as ProjectSuggestion))
  const monday=mondayOf(today), sunday=shiftDay(monday,6)
  const weekCheckpoints=deadlines.filter(item=>item.mode==='checkpoint'&&!item.completed&&item.date>=monday&&item.date<=sunday).length
  return {projects,deadlines,suggestions,weekCheckpoints}
}
function findProject(store:Store,reference:string|null,id?:string,includeArchive=false){
  if(id)return rowProject(store,id)
  const key=projectKey(reference??'')
  const rows=listProjects(store).filter(project=>project.status==='active'||includeArchive)
  const exact=key?rows.filter(project=>projectKey(project.title)===key):rows
  const hits=exact.length||key.length<5?exact:rows.filter(project=>(' '+projectKey(project.title)+' ').includes(' '+key+' '))
  if(hits.length!==1){
    const choices=(hits.length?hits:rows).slice(0,6).map(project=>'„'+project.title+'“').join(', ')
    throw new Problem(409,choices?'Welches Projekt meinst du? '+choices:'Es ist kein passendes Projekt vorhanden.')
  }
  return hits[0]
}

export function prepareProjectChange(store:Store,plan:ProjectPlan,identity?:{id:string,revision:number,stepId?:string}):ProjectChange{
  if(plan.projectIntent==='create'){
    if(plan.steps.length>40)throw new Problem(400,'Ein Projekt kann bis zu 40 Unterpunkte haben.')
    const data:ProjectData={title:text(plan.title,120),area:validArea(plan.area),description:optional(plan.description??'',1500),
      priority:validPriority(plan.priority??'medium'),status:'active',steps:plan.steps.map(newStep),links:[],...projectTiming(plan)}
    return {operation:'create',data,summary:'Projekt „'+data.title+'“ anlegen'}
  }
  const byStep=!identity&&!plan.project&&plan.step&&['update_step','move_step'].includes(plan.projectIntent)?
    listProjects(store).filter(project=>project.status==='active'&&project.steps.some(step=>projectKey(step.title)===projectKey(plan.step!))):[]
  const project=byStep.length===1?byStep[0]:findProject(store,plan.project,identity?.id,plan.projectIntent==='complete'&&plan.completed===false)
  const {id,revision,timeframe:_timeframe,...data}=project
  if(identity&&revision!==identity.revision)throw new Problem(409,'Das Projekt wurde inzwischen bearbeitet. Lade es erneut.')
  if(plan.projectIntent==='delete'&&data.status!=='archived')throw new Problem(409,'Archiviere das Projekt zuerst.')
  if(plan.projectIntent==='delete')return {operation:'delete',target:{id,revision},data,summary:'Projekt „'+data.title+'“ samt Checkliste löschen'}
  let summary='Projekt „'+data.title+'“ bearbeiten'
  if(plan.projectIntent==='update'){
    if(plan.title!==null)data.title=text(plan.title,120)
    if(plan.area!==null)data.area=validArea(plan.area)
    if(plan.description!==null)data.description=optional(plan.description,1500)
    if(plan.priority!==null)data.priority=validPriority(plan.priority)
    Object.assign(data,projectTiming(plan,data))
    if(plan.deadlineCompleted!==undefined)data.deadlineCompleted=plan.deadlineCompleted
  }else if(plan.projectIntent==='complete'){
    data.status=plan.completed===false?'active':'archived'
    data.archived_at=data.status==='archived'?data.archived_at??now():null
    summary='Projekt „'+data.title+'“ '+(data.status==='archived'?'abschließen und archivieren':'wiederherstellen')
  }else if(plan.projectIntent==='add_step'){
    const steps=plan.steps.length?plan.steps:[{...plan,title:text(plan.title,120)}]
    if(data.steps.length+steps.length>40)throw new Problem(400,'Ein Projekt kann bis zu 40 Unterpunkte haben.')
    data.steps=[...data.steps,...steps.map(newStep)]
    summary=(steps.length===1?'Unterpunkt „'+steps[0].title+'“':steps.length+' Unterpunkte')+' hinzufügen'
  }else if(plan.projectIntent==='update_step'||plan.projectIntent==='move_step'){
    const hits=data.steps.filter(step=>identity?.stepId?step.id===identity.stepId:projectKey(step.title)===projectKey(plan.step??''))
    if(hits.length!==1)throw new Problem(409,'Welchen Unterpunkt in „'+data.title+'“ meinst du? '+data.steps.slice(0,8).map(step=>step.title).join(', '))
    const [step]=hits
    if(plan.projectIntent==='move_step'){
      if(!Number.isInteger(plan.position)||plan.position!<1||plan.position!>data.steps.length)throw new Problem(400,'Welche Position soll der Unterpunkt bekommen?')
      data.steps=data.steps.filter(entry=>entry.id!==step.id)
      data.steps.splice(plan.position!-1,0,step)
      summary='„'+step.title+'“ an Position '+plan.position+' verschieben'
    }else{
      const timing=projectTiming(plan,step)
      const changed={...step,...timing,...stepDetails(plan,timing,step),title:plan.title===null?step.title:text(plan.title,120),
        priority:plan.priority===null?step.priority:plan.priority==='inherit'?null:validPriority(plan.priority),
        completed:plan.completed??step.completed,completedAt:plan.completed===true?step.completedAt??now():plan.completed===false?null:step.completedAt}
      data.steps=data.steps.map(entry=>entry.id===step.id?changed:entry)
      summary='Unterpunkt „'+step.title+'“ '+(plan.completed===true?'abhaken':plan.completed===false?'wieder öffnen':'bearbeiten')
    }
  }else throw new Problem(400,'Unbekannte Projektänderung.')
  const changes:string[]=[]
  if(project.title!==data.title)changes.push('Titel · '+data.title)
  if(project.area!==data.area)changes.push('Bereich · '+projectAreas[data.area])
  if(project.priority!==data.priority)changes.push('Priorität · '+projectPriorities[data.priority])
  if(data.deadlineCompleted!==project.deadlineCompleted)changes.push(data.deadlineCompleted?'Projektfrist abhaken':'Projektfrist wieder öffnen')
  if(project.date!==data.date||project.scheduleMode!==data.scheduleMode||project.approxLabel!==data.approxLabel)
    changes.push(data.scheduleMode==='none'?'Projektdatum entfernen':(data.scheduleMode==='checkpoint'?'Checkpoint':'Deadline')+' · '+(data.approxLabel??data.date??''))
  if(data.status!==project.status)changes.push(data.status==='archived'?'Ins Archiv verschieben':'Aus Archiv wiederherstellen')
  const previous=new Map(project.steps.map(step=>[step.id,step]))
  for(const step of data.steps){
    if(JSON.stringify(step)===JSON.stringify(previous.get(step.id)))continue
    changes.push([step.title,step.completed?'Erledigt':'Offen',projectPriorities[step.priority??data.priority],
      step.scheduleMode==='none'?'':(step.scheduleMode==='checkpoint'?'Checkpoint':'Deadline')+' '+(step.approxLabel??step.date??'')].filter(Boolean).join(' · '))
  }
  return {operation:'update',target:{id,revision},data,summary,changes}
}
export function applyProjectChange(store:Store,change:ProjectChange){
  if(change.operation==='create'){
    const id=randomUUID(), timestamp=now()
    store.db.prepare('INSERT INTO projects(id,data,created_at,updated_at) VALUES (?,?,?,?)').run(id,JSON.stringify(change.data),timestamp,timestamp)
    return id
  }
  if(!change.target)throw new Problem(409,'Der Projektbezug fehlt.')
  const {id,revision}=change.target
  const result=change.operation==='delete'?store.db.prepare('DELETE FROM projects WHERE id=? AND revision=?').run(id,revision):
    store.db.prepare('UPDATE projects SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?')
      .run(JSON.stringify(change.data),now(),id,revision)
  if(result.changes!==1)throw new Problem(409,'Das Projekt wurde zwischenzeitlich geändert. Lass den Vorschlag aktualisieren.')
  return id
}
export function checkProject(store:Store,title:string|null,today=dateInBerlin()){
  const project=findProject(store,title)
  const first=projectDeadlines(project).filter(entry=>entry.id!==project.id).sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]||a.date.localeCompare(b.date))[0]
  const urgent=project.timeframe==='at_risk'
  return {project,work:urgent?{title:first?.title??project.steps.find(step=>!step.completed)?.title??project.title,date:today}:undefined}
}

export function manualProjectPlan(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Problem(400,'Projektangaben fehlen.')
  const fields=value as Record<string,unknown>
  const operation=fields.projectIntent
  if(typeof operation!=='string'||!['create','update','add_step','update_step','move_step','complete','delete'].includes(operation)||
    Object.keys(fields).some(field=>!['projectIntent','phase','notes','startDate','deadlineCompleted'].includes(field)&&!Object.hasOwn(blankPlan,field)))
    throw new Problem(400,'Ungültige Projektaktion.')
  for(const field of ['title','step','project','description','area','priority','scheduleMode','date','approxLabel','phase','notes','startDate']){
    if(fields[field]!=null&&typeof fields[field]!=='string')throw new Problem(400,'Ungültiges Projektfeld.')
  }
  if(fields.deadlineCompleted!==undefined&&typeof fields.deadlineCompleted!=='boolean'||fields.completed!=null&&typeof fields.completed!=='boolean'||fields.position!=null&&!Number.isSafeInteger(fields.position)||
    fields.steps!==undefined&&(!Array.isArray(fields.steps)||fields.steps.length>40||
      fields.steps.length>0&&operation!=='create'&&operation!=='add_step'))
    throw new Problem(400,'Ungültige Projektaktion.')
  for(const step of (fields.steps??[]) as unknown[]){
    if(!step||typeof step!=='object'||Array.isArray(step)||Object.entries(step).some(([key,value])=>
      key==='completed'?value!=null&&typeof value!=='boolean':
      !['title','priority','scheduleMode','date','approxLabel','phase','startDate','notes'].includes(key)||value!=null&&typeof value!=='string'))
      throw new Problem(400,'Ungültiger Unterpunkt.')
  }
  return projectPlan(operation as ProjectPlan['projectIntent'],fields as Partial<typeof blankPlan>)
}

export function prepareProjectEditor(store:Store,value:unknown,rawSteps:unknown,identity?:{id:string,revision:number}){
  if(!Array.isArray(rawSteps)||rawSteps.length>40)throw new Problem(400,'Prüfe die Checkliste.')
  const base=manualProjectPlan(value)
  if(base.projectIntent!==(identity?'update':'create'))throw new Problem(400,'Ungültige Projektaktion.')
  const current=identity?rowProject(store,identity.id):undefined
  if(current&&current.status!=='active')throw new Problem(409,'Stelle das Projekt vor dem Bearbeiten wieder her.')
  const known=new Map(current?.steps.map(step=>[step.id,step]))
  const used=new Set<string>()
  const steps=rawSteps.map(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Problem(400,'Ungültiger Unterpunkt.')
    const {id,...fields}=value as Record<string,unknown>
    const [draft]=manualProjectPlan({projectIntent:'add_step',steps:[fields]}).steps
    if(id===null||id===undefined)return newStep(draft)
    const previous=typeof id==='string'?known.get(id):undefined
    if(!previous||used.has(previous.id))throw new Problem(409,'Ein Unterpunkt ist nicht mehr aktuell.')
    used.add(previous.id)
    const step=newStep(draft)
    return {...step,id:previous.id,completedAt:step.completed?previous.completedAt??now():null}
  })
  const change=prepareProjectChange(store,base,identity)
  change.data.steps=steps
  return change
}
