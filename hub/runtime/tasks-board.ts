import type {Store} from './store.ts'
import type {TripPlan} from './trip-types.ts'
import type {ProjectArea,ProjectPriority} from './project-types.ts'
import {listProjects,projectDeadlines} from './projects.ts'
import {bounded,dateInBerlin,isDate,shiftDay,utcNow} from './values.ts'
import {Problem} from './settings.ts'
import {areaCategory,taskPriorities,type BoardItem,type BoardSourcePatch} from './tasks-board-types.ts'

const keyArea=(category:string|null):ProjectArea=>category==='university'?'uni':category==='work'?'arbeit':'privat'

function manualAndProjects(store:Store,today:string):BoardItem[]{
  const projects=listProjects(store,today)
  const projectMap=new Map(projects.map(project=>[project.id,project]))
  const orders=new Map(store.db.prepare('SELECT id,task_id,reference,merchant FROM clothing_orders WHERE task_id IS NOT NULL')
    .all().map(row=>[String(row.task_id),row]))
  const emails=new Map(store.db.prepare("SELECT id,task_id FROM inbox_proposals WHERE state='accepted' AND task_id IS NOT NULL")
    .all().map(row=>[String(row.task_id),row]))
  const skillByRun=new Map(store.db.prepare(`SELECT DISTINCT r.id,json_extract(r.result,'$.skill') AS skill
    FROM runs r JOIN tasks t ON t.run_id=r.id WHERE t.status!='archived'`).all().map(row=>[String(row.id),row.skill]))
  const rows:BoardItem[]=store.workspace.list().filter(task=>task.kind==='task').flatMap(task=>{
    const project=task.project_id?projectMap.get(task.project_id):undefined
    if(project?.status==='archived')return []
    const order=orders.get(task.id),email=emails.get(task.id)
    const skill=task.run_id?skillByRun.get(task.run_id):undefined
    const source_type=order?'order':project?'project':email?'email':skill==='grocery'?'inventory':skill==='outfit'?'outfit':task.run_id?'pilot':'manual'
    return [{source_ref:order?'order:'+String(order.id):'task:'+task.id,source_type,
      source_id:order?String(order.id):email?String(email.id):task.run_id??undefined,source_label:order?String(order.reference):project?.title,
      title:order?'Retoure · '+String(order.merchant):task.title,taskId:task.id,projectId:project?.id,revision:task.revision,
      area:task.category?keyArea(task.category):project?.area??'privat',kind:task.due_date?'deadline':'task',
      priority:task.priority==='normal'?'medium':task.priority,due_date:task.due_date,completed:task.status==='done',
      completed_at:task.completed_at,notes:task.detail}]
  })
  for(const project of projects.filter(item=>item.status==='active')){
    for(const entry of projectDeadlines(project,today)){
      const step=project.steps.find(item=>item.id===entry.id)
      rows.push({source_ref:'project:'+project.id+':'+entry.id,source_type:'project',title:entry.title,
        projectId:project.id,source_label:project.title,stepId:step?.id,revision:project.revision,area:project.area,kind:'deadline',
        priority:entry.priority,due_date:entry.date,completed:!!entry.completed,completed_at:step?.completedAt??null,notes:step?.notes??undefined})
    }
  }
  return rows
}

export function boardSources(store:Store):BoardItem[]{
  const entries:BoardItem[]=[]
  const add=(source_type:BoardItem['source_type'],source_id:string,title:string,due_date:string,area:ProjectArea,
    priority:ProjectPriority, options:Partial<BoardItem>={})=>{
    if(!isDate(due_date))return
    entries.push({source_type,source_id,title,due_date,originalDue:due_date,area,kind:'deadline',priority,
      source_ref:source_type+':'+source_id+':'+due_date,completed:false,completed_at:null,revision:0,...options})
  }
  for(const row of store.db.prepare(`SELECT id,reference,merchant,deadline FROM clothing_orders WHERE task_id IS NULL
    AND deadline IS NOT NULL AND cancelled_on IS NULL AND delivered_on IS NOT NULL`).all()){
    add('order',String(row.id),'Rückgabefrist · '+String(row.merchant),String(row.deadline),'privat','medium',
      {source_ref:'order:'+String(row.id),source_label:String(row.reference)})
  }
  for(const row of store.db.prepare(`SELECT id,data,month,until_month FROM finance_entries WHERE kind='subscription'`).all()){
    const data=JSON.parse(String(row.data))
    if(!isDate(data.renewal)||!Number.isSafeInteger(data.noticeDays))continue
    const due=shiftDay(data.renewal,-data.noticeDays)
    if(due.slice(0,7)<String(row.month)||(row.until_month&&due.slice(0,7)>String(row.until_month)))continue
    add('finance',String(row.id),'Kündigungsfrist · '+String(data.title),due,'privat','medium',{notes:'Verlängerung am '+data.renewal})
  }
  for(const row of store.db.prepare(`SELECT id,company,role,follow_up FROM applications
    WHERE follow_up IS NOT NULL AND status IN ('applied','reply','interview','offer')`).all()){
    add('application',String(row.id),'Nachfassen · '+String(row.company),String(row.follow_up),'arbeit','medium',{notes:String(row.role)})
  }
  for(const row of store.db.prepare('SELECT id,plan FROM trips').all()){
    const plan=JSON.parse(String(row.plan)) as TripPlan
    const {start,destination}=plan.draft
    if(!isDate(start))continue
    const essential=plan.checklist.filter(item=>!item.notNeeded)
    if(essential.length)add('travel',String(row.id),'Reisevorbereitung · '+destination,start,'privat','medium',
      {source_ref:'travel:'+String(row.id)+':prepare:'+start,completed:essential.every(item=>item.done)})
    if(plan.packing.length)add('travel',String(row.id),'Packliste prüfen · '+destination,start,'privat','medium',
      {source_ref:'travel:'+String(row.id)+':pack:'+start,completed:plan.packing.every(item=>item.done)})
  }
  return entries
}

export function taskBoard(store:Store,today=dateInBerlin()){
  const edits=new Map(store.db.prepare('SELECT * FROM board_source_state').all().map(row=>[row.source_ref,row]))
  const native=manualAndProjects(store,today).flatMap(item=>{
    const edit=edits.get(item.source_ref)
    if(edit&&JSON.parse(String(edit.data)).dismissed)return []
    return [{...item,sourceRevision:Number(edit?.revision??0)}]
  })
  const all=[...native,...boardSources(store).flatMap(source=>{
    const saved=edits.get(source.source_ref)
    if(!saved)return [source]
    const patch=JSON.parse(String(saved.data))
    if(patch.dismissed)return []
    const {dismissed:_dismissed,...values}=patch
    const item={...source,...values,revision:Number(saved.revision)} as BoardItem
    return [{...item,kind:item.due_date?'deadline' as const:'task' as const}]
  })]
  return [...new Map(all.map(item=>[item.source_ref,item])).values()]
    .filter(item=>!item.completed||(item.due_date?item.due_date>=today:!!item.completed_at&&dateInBerlin(new Date(item.completed_at))===today))
}

export function changeBoardSource(store:Store,ref:unknown,revision:unknown,value:unknown){
  if(typeof ref!=='string'||ref.length>160||!Number.isSafeInteger(revision)||!value||typeof value!=='object'||Array.isArray(value))
    throw new Problem(400,'Prüfe den Quelleneintrag.')
  const source=boardSources(store).some(item=>item.source_ref===ref)
  const linkedOrder=ref.startsWith('order:')&&store.db.prepare('SELECT 1 FROM clothing_orders WHERE id=? AND task_id IS NOT NULL').get(ref.slice(6))
  if(!source&&!linkedOrder)throw new Problem(404,'Die Frist ist nicht mehr verfügbar.')
  const row=store.db.prepare('SELECT revision,data FROM board_source_state WHERE source_ref=?').get(ref)
  if((row?.revision??0)!==revision)throw new Problem(409,'Lade den aktuellen Eintrag.')
  const patch=value as BoardSourcePatch
  if(!source&&Object.keys(patch).some(key=>key!=='dismissed'))throw new Problem(400,'Bearbeite die Retoure im Bestellbereich.')
  if(Object.keys(patch).some(key=>!['area','priority','due_date','title','completed','dismissed'].includes(key))||
    patch.area!==undefined&&!Object.hasOwn(areaCategory,patch.area)||patch.priority!==undefined&&!Object.hasOwn(taskPriorities,patch.priority)||
    patch.due_date!=null&&!isDate(patch.due_date)||patch.title!==undefined&&!bounded(patch.title,120)||
    [patch.completed,patch.dismissed].some(value=>value!==undefined&&typeof value!=='boolean'))
    throw new Problem(400,'Prüfe die Änderungen.')
  const data={...(row?JSON.parse(String(row.data)):{}),...patch,
    ...(patch.completed!==undefined&&{completed_at:patch.completed?utcNow():null})}
  store.db.prepare(`INSERT INTO board_source_state (source_ref,data) VALUES (?,?) ON CONFLICT(source_ref)
    DO UPDATE SET data=excluded.data,revision=board_source_state.revision+1`).run(ref,JSON.stringify(data))
}
