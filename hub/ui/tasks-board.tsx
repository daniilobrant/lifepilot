import {useEffect,useRef,useState,type FormEvent} from 'react'
import {DateInput,displayDay} from './presentation.tsx'
import {projectAreas,projectPriorities,priorityRank,type ProjectArea,type ProjectPriority} from '../runtime/project-types.ts'
import {areaCategory,taskPriorities,sourceLabels,type BoardItem,type BoardSourcePatch} from '../runtime/tasks-board-types.ts'
import {shiftDay} from '../runtime/values.ts'

type Api=<T>(path:string,payload?:object)=>Promise<T>
type Mutate=(path:string,payload:object)=>Promise<unknown>

function ChoiceFields({area,priority,mode}:{area:ProjectArea,priority:ProjectPriority,mode:'all'|'area'|'priority'}){
  return <>
    {mode!=='priority'?<label>Bereich<select name="area" defaultValue={area}>
      {Object.entries(projectAreas).map(([key,label])=><option key={key} value={key}>{label}</option>)}
    </select></label>:null}
    {mode!=='area'?<label>Priorität<select name="priority" defaultValue={priority}>
      {Object.entries(projectPriorities).map(([key,label])=><option key={key} value={key}>{label}</option>)}
    </select></label>:null}
  </>
}

function QuickEntry({area,busy,create,close}:{area:ProjectArea,busy:boolean,create:Mutate,close:()=>void}){
  const [kind,setKind]=useState<'task'|'deadline'>('task')
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    const form=new FormData(event.currentTarget)
    const priority=form.get('priority') as ProjectPriority
    if(await create('/tasks',{title:String(form.get('title')??'').trim(),date:form.get('date')||null,
      detail:form.get('notes')??'',kind:'task',category:areaCategory[area],priority:taskPriorities[priority],confirm:true}))close()
  }
  return <form className="board-quick" onSubmit={submit}>
    <label>Titel<input name="title" maxLength={120} required autoFocus/></label>
    <div className="board-form-options">
      <label>Art<select value={kind} onChange={event=>setKind(event.target.value as 'task'|'deadline')}>
        <option value="task">Aufgabe</option><option value="deadline">Frist</option>
      </select></label>
      <label>{kind==='deadline'?'Stichtag':'Datum (optional)'}<DateInput name="date" aria-label="Datum" required={kind==='deadline'}/></label>
      <label>Priorität<select name="priority" defaultValue="medium">
        {Object.entries(projectPriorities).map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>
    </div>
    <details><summary>Notizen</summary><label>Notizen<textarea name="notes" maxLength={360} rows={2}/></label></details>
    <div className="actions"><button type="submit" className="primary" disabled={busy}>Speichern</button>
      <button type="button" onClick={close}>Abbrechen</button></div>
  </form>
}

function BoardCard({item,today,busy,complete,open,source,options,schedule,remove}:{
  item:BoardItem,today:string,busy:boolean,complete:(checked:boolean)=>void,open:()=>void,source:()=>void,
  options:(field:'area'|'priority')=>void,schedule:()=>void,remove:()=>void
}){
  const menu=useRef<HTMLDetailsElement>(null)
  function action(handler:()=>void){if(menu.current)menu.current.open=false;handler()}
  return <li className="board-item" data-completed={item.completed}>
    <div className="board-item-title">
      <input type="checkbox" checked={item.completed} aria-label={item.title+(item.completed?' wieder öffnen':' abhaken')} disabled={busy}
        onChange={event=>complete(event.target.checked)}/>
      <button type="button" className="quiet board-title" onClick={open}>{item.title}</button>
      <details className="board-menu" ref={menu}>
        <summary aria-label={'Aktionen für '+item.title}>⋯</summary>
        <div>
          <button type="button" onClick={()=>action(open)}>Bearbeiten</button>
          <button type="button" onClick={()=>action(()=>options('area'))}>Bereich wechseln</button>
          <button type="button" onClick={()=>action(()=>options('priority'))}>Priorität ändern</button>
          <button type="button" disabled={item.completed} onClick={()=>action(schedule)}>Im Kalender einplanen</button>
          <button type="button" onClick={()=>action(remove)}>{item.source_type==='manual'?'Löschen':'Entfernen'}</button>
        </div>
      </details>
    </div>
    <div className="board-item-meta">
      {item.due_date?<time className="board-chip" dateTime={item.due_date}>Frist · {displayDay(item.due_date)}</time>:null}
      {!item.completed&&item.due_date&&item.due_date<today?<span className="board-chip board-soon">Überfällig</span>:null}
      {!item.completed&&item.due_date&&item.due_date>=today&&item.due_date<=shiftDay(today,2)?<span className="board-chip board-soon">Bald fällig</span>:null}
      <span className="project-badge" data-priority={item.priority}>{projectPriorities[item.priority]}</span>
      {sourceLabels[item.source_type]?<button type="button" className="quiet board-chip board-source" onClick={source}>
        {sourceLabels[item.source_type]}{item.source_label?' · '+item.source_label:''}
      </button>:null}
    </div>
  </li>
}

function BoardEdit({item,mode,close,save,busy}:{item:BoardItem,mode:'all'|'area'|'priority',close:()=>void,save:(patch:BoardSourcePatch)=>Promise<boolean>,busy:boolean}){
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{dialog.current?.showModal()},[])
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    const data=new FormData(event.currentTarget)
    const result:BoardSourcePatch={}
    if(data.has('title'))result.title=String(data.get('title')).trim()
    if(data.has('date'))result.due_date=String(data.get('date')??'')||null
    if(data.has('area'))result.area=data.get('area') as ProjectArea
    if(data.has('priority'))result.priority=data.get('priority') as ProjectPriority
    if(await save(result))close()
  }
  return <dialog ref={dialog} className="task-dialog card" aria-label="Board-Eintrag bearbeiten" onCancel={event=>{event.preventDefault();close()}}>
    <h2>{item.title}</h2>
    <form onSubmit={submit}>
      {mode==='all'?<>
        <label>Titel<input name="title" defaultValue={item.title} maxLength={120} required/></label>
        <label>Stichtag<DateInput name="date" defaultValue={item.due_date??''}/></label>
        {item.originalDue?<p className="muted">Stichtag an der Quelle · {displayDay(item.originalDue)}</p>:null}
      </>:null}
      <ChoiceFields area={item.area} priority={item.priority} mode={mode}/>
      <div className="actions"><button type="button" onClick={close}>Abbrechen</button><button type="submit" className="primary" disabled={busy}>Speichern</button></div>
    </form>
  </dialog>
}

export function TasksBoard({api,mutate,today,busy,openTask,openProject,openSource,changeProject,planSlot,updateKey}:{
  api:Api,mutate:Mutate,today:string,busy:boolean,openTask:(id:string,schedule?:boolean)=>void,openProject:(id:string,step?:string)=>void,
  openSource:(item:BoardItem)=>void,changeProject:(item:BoardItem,patch:BoardSourcePatch)=>Promise<boolean>,
  planSlot:(item:BoardItem)=>void,updateKey:string
}){
  const [entries,setEntries]=useState<BoardItem[]>()
  const [area,setArea]=useState<ProjectArea>()
  const [filter,setFilter]=useState<'all'|'deadlines'|'high'|'done'>('all')
  const [query,setQuery]=useState('')
  const [refresh,setRefresh]=useState(0)
  const [edit,setEdit]=useState<{ref:string,mode:'all'|'area'|'priority'}>()
  const [error,setError]=useState('')
  useEffect(()=>{
    let current=true
    const load=()=>void api<BoardItem[]>('/tasks-board').then(items=>{if(current){setEntries(items);setError('')}},reason=>{if(current)setError(reason.message)})
    load()
    const timer=setInterval(()=>{if(!document.hidden)load()},20_000)
    return ()=>{current=false;clearInterval(timer)}
  },[api,refresh,today,updateKey])
  const mutation:Mutate=async(path,payload)=>{
    const value=await mutate(path,payload)
    if(value)setRefresh(count=>count+1)
    return value
  }
  async function change(item:BoardItem,patch:BoardSourcePatch){
    if(item.taskId&&!(item.source_type==='order'&&patch.dismissed)){
      const changed=await mutation('/tasks/'+item.taskId+'/edit',{revision:item.revision,confirm:true,patch:{
        ...(patch.completed!==undefined&&{status:patch.completed?'done':'open'}),
        ...(patch.dismissed&&{status:'archived'}),
        ...(patch.title!==undefined&&{title:patch.title}),
        ...(patch.due_date!==undefined&&{due_date:patch.due_date}),
        ...(patch.area&&{category:areaCategory[patch.area]}),
        ...(patch.priority&&{priority:taskPriorities[patch.priority]}),
      }})
      return !!changed
    }
    if(item.projectId&&!(item.source_type==='order'&&patch.dismissed)){
      const saved=await changeProject(item,patch)
      if(saved)setRefresh(count=>count+1)
      return saved
    }
    return !!await mutation('/tasks-board',{source:item.source_ref,revision:item.sourceRevision??item.revision,patch,confirm:true})
  }
  const filters={all:'Alle',deadlines:'Nur Fristen',high:'Hohe Priorität',done:'Erledigte anzeigen'} as const
  const openCount=entries?.filter(item=>!item.completed).length??0
  const soon=entries?.filter(item=>!item.completed&&item.due_date&&item.due_date>=today&&item.due_date<=shiftDay(today,2)).length??0
  const matching=(entries??[]).filter(item=>{
    if(query&&!([item.title,item.source_label,item.notes].filter(Boolean).join(' ').toLocaleLowerCase('de').includes(query.toLocaleLowerCase('de').trim())))return false
    return filter==='all'||filter==='deadlines'&&item.kind==='deadline'||filter==='high'&&item.priority==='high'||filter==='done'&&item.completed
  })
  const editing=edit&&entries?.find(item=>item.source_ref===edit.ref)
  function open(item:BoardItem){
    if(item.taskId)openTask(item.taskId)
    else if(item.projectId)openProject(item.projectId,item.stepId)
    else setEdit({ref:item.source_ref,mode:'all'})
  }
  function showSource(item:BoardItem){
    if(item.source_type==='project'&&item.projectId)openProject(item.projectId,item.stepId)
    else openSource(item)
  }
  function remove(item:BoardItem){
    if(item.projectId&&!item.taskId){openProject(item.projectId,item.stepId);return}
    if(window.confirm('„'+item.title+'“ aus Aufgaben & Fristen entfernen?'))void change(item,{dismissed:true})
  }
  return <>
    <div className="editor-title board-header"><p>{openCount} offen · {soon} bald fällig</p>
      <button type="button" className="primary" onClick={()=>setArea(current=>current??'privat')}>+ Aufgabe / Frist</button>
    </div>
    <div className="board-filters">
      {Object.entries(filters).map(([key,label])=><button type="button" key={key} aria-pressed={filter===key}
        className={filter===key?'primary':undefined} onClick={()=>setFilter(key as keyof typeof filters)}>{label}{key==='all'?' ('+(entries?.length??0)+')':''}</button>)}
      <input type="search" aria-label="Aufgaben und Fristen durchsuchen" placeholder="Aufgaben durchsuchen …" value={query} onChange={event=>setQuery(event.target.value)}/>
    </div>
    {error?<p role="alert">{error}</p>:!entries?<p role="status">Aufgaben und Fristen werden geladen …</p>:null}
    <div className="tasks-board">{(Object.keys(projectAreas) as ProjectArea[]).map(column=>{
      const rows=matching.filter(item=>item.area===column)
      return <section className="card board-column" key={column} aria-label={projectAreas[column]}>
        <div className="board-column-heading"><h2>{projectAreas[column]} <small>{rows.length}</small></h2>
          <button type="button" aria-expanded={area===column} onClick={()=>setArea(current=>current===column?undefined:column)}>+ Hinzufügen</button>
        </div>
        {area===column?<QuickEntry key={column} create={mutation} area={column} busy={busy} close={()=>setArea(undefined)}/>:null}
        {(['deadline','task'] as const).map(kind=>{
          const cards=rows.filter(item=>item.kind===kind).sort((a,b)=>Number(a.completed)-Number(b.completed)||
            (kind==='deadline'?(a.due_date??'').localeCompare(b.due_date??''):0)||
            priorityRank[a.priority]-priorityRank[b.priority]||a.title.localeCompare(b.title,'de'))
          return <section className="board-section" key={kind}>
            <h3>{kind==='deadline'?'Fristen & Abgaben':'Aufgaben'}</h3>
            {cards.length?<ul>{cards.map(item=><BoardCard key={item.source_ref} item={item} today={today} busy={busy}
              complete={value=>void change(item,{completed:value})} open={()=>open(item)} source={()=>showSource(item)}
              options={mode=>{if(mode==='area'&&item.projectId&&!item.taskId)openProject(item.projectId,item.stepId)
                else setEdit({ref:item.source_ref,mode})}}
              schedule={()=>item.taskId?openTask(item.taskId,true):planSlot(item)} remove={()=>remove(item)}/>)}</ul>:
              <p className="empty">{kind==='deadline'?'Keine Fristen.':'Keine Aufgaben.'}</p>}
          </section>
        })}
      </section>
    })}</div>
    {editing&&edit?<BoardEdit key={editing.source_ref} item={editing} mode={edit.mode} busy={busy}
      close={()=>setEdit(undefined)} save={patch=>change(editing,patch)}/>:null}
  </>
}
