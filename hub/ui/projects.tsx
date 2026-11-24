import {BulkApproval,type BatchResult} from './bulk-approval.tsx'
import {useEffect,useRef,useState,type FormEvent} from 'react'
import type {TaskRow} from '../runtime/workspace.ts'
import {DateInput,displayDay} from './presentation.tsx'
import {projectAreas,projectPriorities,timeframeNames,type Project,type ProjectChange,type ProjectDeadline,type ProjectPlan,
  type ProjectStep,type ProjectStepDraft,type ProjectArea,type ProjectSuggestion,type ProjectsOverview,type ProjectTiming,type ProjectWork} from '../runtime/project-types.ts'

type SavePlan=(plan:Partial<ProjectPlan>&Pick<ProjectPlan,'projectIntent'>,project?:Project,step?:string)=>Promise<boolean>
type DecideMail=(suggestion:ProjectSuggestion,approved:boolean)=>Promise<void>
type ApproveMails=(items:readonly (ProjectSuggestion&{title:string})[])=>Promise<BatchResult>
const modes={none:'Kein Datum',deadline:'Feste Deadline',checkpoint:'Ungefährer Checkpoint'} as const
const displayDate=(date:string)=>displayDay(date)
export const priorityText=(priority:Project['priority'])=>projectPriorities[priority]

function Priority({priority}:{priority:Project['priority']}){
  return <span className="project-badge" data-priority={priority}>{priorityText(priority)}</span>
}
function Timing({item}:{item:ProjectTiming}){
  if((!item.date&&!item.approxLabel)||item.scheduleMode==='none')return null
  const exact=item.date?displayDate(item.date):''
  const note=item.approxLabel&&item.approxLabel!=='Planungsdatum'?item.approxLabel:''
  return <span className="project-date">{[item.scheduleMode==='checkpoint'?'Checkpoint':'Deadline',exact,note].filter(Boolean).join(' · ')}</span>
}
type EditorStep=ProjectStepDraft&{id?:string,key:string}
type SaveEditor=(plan:ProjectPlanInput,steps:EditorStep[],project?:Project)=>Promise<boolean>
type ProjectPlanInput=Partial<ProjectPlan>&Pick<ProjectPlan,'projectIntent'>
type ProjectFocus={id?:string,step?:string,area:ProjectArea,token?:number}

function ProjectCard({item,open,save,archive,busy}:{item:Project,open:(step?:string)=>void,save:SavePlan,archive:()=>void,busy:boolean}){
  const done=item.steps.filter(step=>step.completed).length
  async function add(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    const form=event.currentTarget,title=String(new FormData(form).get('title')??'').trim()
    if(title&&await save({projectIntent:'add_step',title},item))form.reset()
  }
  return <article className="card project-card project-compact">
    <div className="project-card-title">
      <h3><button type="button" className="quiet" onClick={()=>open()}>{item.title}</button></h3>
      <Priority priority={item.priority}/>
      <span className="project-badge" data-timeframe={item.timeframe}>{timeframeNames[item.timeframe]}</span>
      <span className="project-progress">{done}/{item.steps.length}
        {item.steps.length?<progress value={done} max={item.steps.length} aria-label="Abgeschlossene Unterpunkte"/>:null}
      </span>
      <button type="button" onClick={()=>open()}>Öffnen</button>
    </div>
    <Timing item={item}/>
    {item.steps.length?<ul className="project-checklist compact-checklist">{item.steps.map(step=><li key={step.id} data-completed={step.completed}>
      <input type="checkbox" checked={step.completed} aria-label={step.title} disabled={busy}
        onChange={event=>void save({projectIntent:'update_step',completed:event.target.checked},item,step.id)}/>
      <button type="button" className="quiet" onClick={()=>open(step.id)}>{step.title}</button>
      <Timing item={step}/>
    </li>)}</ul>:null}
    <div className="project-compact-actions">
      <form onSubmit={add}><input aria-label="Schritt schnell hinzufügen" name="title" placeholder="+ Schritt schnell hinzufügen …" maxLength={120} disabled={busy} required/></form>
      <button type="button" className="quiet" disabled={busy} onClick={archive}>Abschließen</button>
    </div>
  </article>
}

function ProjectOverlay({project,focus,close,save,saveEditor,archive,busy,error,gmail,tasks,openTask,addTask,work}:{
  project?:Project,focus:ProjectFocus,close:()=>void,save:SavePlan,saveEditor:SaveEditor,archive:(project:Project)=>void,busy:boolean,error?:string,
  gmail?:string,tasks:TaskRow[],openTask:(id:string)=>void,addTask:(id:string)=>void,work:(work:ProjectWork)=>void
}){
  const dialog=useRef<HTMLDialogElement>(null)
  const [title,setTitle]=useState(project?.title??'')
  const [description,setDescription]=useState(project?.description??'')
  const [area,setArea]=useState(project?.area??focus.area)
  const [priority,setPriority]=useState<Project['priority']>(project?.priority??'medium')
  const [date,setDate]=useState(project?.date??'')
  const [revision,setRevision]=useState(project?.revision)
  const [steps,setSteps]=useState<EditorStep[]>(()=>project?.steps.map(step=>({...step,key:step.id}))??[])
  const [drag,setDrag]=useState<number>()
  const [target,setTarget]=useState<number>()
  const [dirty,setDirty]=useState(false)
  const [moving,setMoving]=useState(false)
  const done=steps.filter(step=>step.completed).length
  useEffect(()=>{
    dialog.current?.showModal()
    if(focus.step){
      const input=document.getElementById('project-step-'+focus.step)
      input?.focus()
      input?.scrollIntoView?.({block:'center'})
    }
  },[focus.step])
  const changeStep=(key:string,patch:Partial<EditorStep>)=>{
    setDirty(true)
    setSteps(current=>current.map(step=>step.key===key?{...step,...patch}:step))
  }
  async function move(from:number,to:number){
    if(busy||moving||from===to||from<0||to<0||to>=steps.length)return
    const updated=[...steps]
    const [item]=updated.splice(from,1)
    updated.splice(to,0,item)
    const sameSet=project&&revision&&item.id&&steps.length===project.steps.length&&steps.every(step=>step.id&&project.steps.some(known=>known.id===step.id))
    if(sameSet&&project&&item.id&&revision){
      setMoving(true)
      try{
        if(!await save({projectIntent:'move_step',position:to+1},{...project,revision},item.id))return
        setRevision(revision+1)
      }finally{setMoving(false)}
    }else setDirty(true)
    setSteps(updated)
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    const mode=project?.scheduleMode==='checkpoint'&&date===(project.date??'')?'checkpoint':date?'deadline':'none'
    const plan={projectIntent:project?'update':'create',title,description,area,priority,date:date||null,scheduleMode:mode} as const
    if(await saveEditor(plan,steps,project?{...project,revision:revision??project.revision}:undefined))close()
  }
  function cancel(){
    if(!dirty||window.confirm('Ungespeicherte Eingaben verwerfen?'))close()
  }
  return <dialog ref={dialog} className="project-overlay card" aria-label={project?'Projekt bearbeiten':'Neues Projekt'}
    onCancel={event=>{event.preventDefault();cancel()}}>
    <form onSubmit={submit} onChange={()=>setDirty(true)}>
      <header className="project-overlay-header">
        <h2>{project?'Projekt bearbeiten':'Neues Projekt'}</h2>
        <span className="project-badge">{projectAreas[area]}</span><Priority priority={priority}/>
        <button type="button" className="quiet" aria-label="Schließen" onClick={cancel}>×</button>
      </header>
      <div className="project-overlay-content">
        {error?<p role="alert">{error}</p>:null}
        <div className="profile-grid">
          <label>Projekttitel<input value={title} onChange={event=>setTitle(event.target.value)} maxLength={120} required autoFocus={!focus.step}/></label>
          <label>Zieldatum<DateInput aria-label="Zieldatum" value={date} onChange={event=>setDate(event.target.value)}/></label>
        </div>
        <p className="project-overlay-progress">{project?timeframeNames[project.timeframe]+' · ':''}Fortschritt {done}/{steps.length}</p>
        <details>
          <summary>Erweiterte Details &amp; Optionen</summary>
          <label>Beschreibung<textarea value={description} onChange={event=>setDescription(event.target.value)} maxLength={1500} rows={3}/></label>
          <div className="profile-grid">
            <label>Bereich<select value={area} onChange={event=>setArea(event.target.value as ProjectArea)}>
              {Object.entries(projectAreas).map(([id,label])=><option key={id} value={id}>{label}</option>)}
            </select></label>
            <label>Projektpriorität<select value={priority} onChange={event=>setPriority(event.target.value as Project['priority'])}>
              {Object.entries(projectPriorities).map(([id,label])=><option key={id} value={id}>{label}</option>)}
            </select></label>
          </div>
          {project?.links.length?<ul className="project-linked-mails">{project.links.map(link=><li key={link.id}>
            <a href={'https://mail.google.com/mail/u/0/?authuser='+encodeURIComponent(gmail??'')+'#all/'+encodeURIComponent(link.id)} target="_blank" rel="noreferrer">{link.subject}</a>
            <small>{link.sender}</small>
          </li>)}</ul>:null}
          {project?<section className="project-related-tasks">
            <h4>Verknüpfte Aufgaben</h4>
            <ul>{tasks.map(task=><li key={task.id}>
              <button type="button" className="quiet" onClick={()=>{if(!dirty||window.confirm('Ungespeicherte Eingaben verwerfen?')){close();openTask(task.id)}}}>{task.title}</button>
              {task.due_date?<small>Frist · {displayDate(task.due_date)}</small>:null}
            </li>)}</ul>
            <button type="button" className="quiet" onClick={()=>{if(!dirty||window.confirm('Ungespeicherte Eingaben verwerfen?')){close();addTask(project.id)}}}>+ Aufgabe anlegen</button>
            <button type="button" className="quiet" onClick={()=>{if(!dirty||window.confirm('Ungespeicherte Eingaben verwerfen?')){close();work({title:project.title,date:project.date??undefined})}}}>Freie Zeit finden</button>
            <p className="muted">Endgültiges Löschen ist im Archiv verfügbar.</p>
          </section>:null}
        </details>
        <h3>Schritte &amp; Checkliste</h3>
        <ol className="project-overlay-steps">{steps.map((step,index)=><li key={step.key} data-drop={target===index&&drag!==index}
          onDragOver={event=>{if(drag!==undefined){event.preventDefault();setTarget(index)}}}
          onDrop={event=>{event.preventDefault();if(drag!==undefined)void move(drag,index);setDrag(undefined);setTarget(undefined)}}>
          <div className="project-overlay-step">
            <span className="project-drag-handle" draggable={!moving&&!busy} title="Schritt ziehen"
              onDragStart={event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',step.key);setDrag(index)}}
              onDragEnd={()=>{setDrag(undefined);setTarget(undefined)}} aria-hidden>⠿</span>
            <input type="checkbox" checked={!!step.completed} aria-label={(step.title||'Schritt '+(index+1))+' erledigt'}
              onChange={event=>changeStep(step.key,{completed:event.target.checked})}/>
            <input id={'project-step-'+step.key} aria-label={'Titel für Schritt '+(index+1)} value={step.title} maxLength={120} required
              onChange={event=>changeStep(step.key,{title:event.target.value})}/>
            <button type="button" className="quiet" aria-label={'Schritt '+(index+1)+' nach oben'} disabled={index===0||busy||moving} onClick={()=>void move(index,index-1)}>↑</button>
            <button type="button" className="quiet" aria-label={'Schritt '+(index+1)+' nach unten'} disabled={index===steps.length-1||busy||moving} onClick={()=>void move(index,index+1)}>↓</button>
          </div>
          <details open={focus.step!==undefined&&focus.step===step.id?true:undefined}>
            <summary>Details{step.date?' · '+displayDate(step.date):step.approxLabel?' · '+step.approxLabel:''}</summary>
            <div className="profile-grid">
              <label>Datumstyp<select value={step.scheduleMode??'none'} onChange={event=>changeStep(step.key,{scheduleMode:event.target.value as ProjectStepDraft['scheduleMode']})}>
                {Object.entries(modes).map(([id,label])=><option key={id} value={id}>{label}</option>)}
              </select></label>
              {step.scheduleMode&&step.scheduleMode!=='none'?<label>Zieldatum<DateInput value={step.date??''} required={step.scheduleMode==='deadline'}
                onChange={event=>changeStep(step.key,{date:event.target.value||null})}/></label>:null}
              {step.scheduleMode==='checkpoint'?<label>Ungefähre Angabe<input value={step.approxLabel??''} maxLength={100}
                onChange={event=>changeStep(step.key,{approxLabel:event.target.value})}/></label>:null}
              <label>Priorität<select value={step.priority??'inherit'} onChange={event=>changeStep(step.key,{priority:event.target.value as ProjectStepDraft['priority']})}>
                <option value="inherit">Vom Projekt übernehmen</option>
                {Object.entries(projectPriorities).map(([id,label])=><option key={id} value={id}>{label}</option>)}
              </select></label>
              <label>Phase<input value={step.phase??''} maxLength={80} onChange={event=>changeStep(step.key,{phase:event.target.value||null})}/></label>
              <label>Startdatum<DateInput value={step.startDate??''} onChange={event=>changeStep(step.key,{startDate:event.target.value||null})}/></label>
              <label>Notizen<textarea value={step.notes??''} maxLength={600} rows={2} onChange={event=>changeStep(step.key,{notes:event.target.value||null})}/></label>
            </div>
            <button type="button" className="quiet" onClick={()=>{setDirty(true);setSteps(current=>current.filter(item=>item.key!==step.key))}}>Schritt löschen</button>
          </details>
        </li>)}</ol>
        <button type="button" disabled={steps.length>=40} onClick={()=>{
          setDirty(true)
          const key=crypto.randomUUID()
          setSteps(current=>[...current,{key,title:'',date:null,approxLabel:null,priority:null,completed:false,scheduleMode:'none'}])
          requestAnimationFrame(()=>document.getElementById('project-step-'+key)?.focus())
        }}>+ Neuen Schritt hinzufügen</button>
      </div>
      <footer className="project-overlay-footer">
        {project?<button type="button" className="quiet" disabled={busy||moving}
          onClick={()=>{if(!dirty||window.confirm('Ungespeicherte Eingaben verwerfen und das Projekt archivieren?'))archive({...project,revision:revision??project.revision})}}>Projekt abschließen</button>:null}
        <button type="button" onClick={cancel}>Abbrechen</button>
        <button type="submit" className="primary" disabled={busy||moving}>Speichern</button>
      </footer>
    </form>
  </dialog>
}

export function ProjectMailSuggestions({suggestions,decide,approveAll,busy=false,compact=false}:{
  suggestions:ProjectSuggestion[],decide:DecideMail,approveAll:ApproveMails,busy?:boolean,compact?:boolean,
}){
  if(!suggestions.length)return null
  return <details className={compact?'project-mail disclosure':'card settings project-mail disclosure'}><summary>E-Mail-Updates für Projekte ({suggestions.length})</summary>
    {suggestions.map(item=><details key={item.id} className="project-mail-item">
      <summary>{item.subject} · {item.projectTitle}</summary>
      <p>{item.sender}</p><p>{item.summary}</p>
      <p>{item.plan?.projectIntent==='add_step'?'Unterpunkt hinzufügen':item.plan?.projectIntent==='update_step'?'Unterpunkt aktualisieren':
        item.plan?.projectIntent==='update'?'Projektfrist aktualisieren':'E-Mail verknüpfen'}
        {item.plan?.step||item.plan?.title?' · '+(item.plan.step??item.plan.title):''}
        {item.plan?.date?' · '+displayDate(item.plan.date):''} <Priority priority={item.priority}/></p>
      <div className="actions">
        <button type="button" disabled={busy} onClick={()=>void decide(item,true)}>Ja, übernehmen</button>
        <button type="button" disabled={busy} onClick={()=>void decide(item,false)}>Nein</button>
      </div>
    </details>)}
    <BulkApproval items={suggestions.map(item=>({...item,title:item.subject}))} disabled={busy} approve={approveAll}
      description="LifePilot übernimmt die angezeigten E-Mail-Updates in die zugeordneten Projekte."/>
  </details>
}

export function ProjectsPanel({overview,save,saveEditor,mail,approveMails,work,busy,error,selected,tasks,openTask,addTask}:{
  overview:ProjectsOverview,save:SavePlan,saveEditor:SaveEditor,mail:DecideMail,approveMails:ApproveMails,work:(work:ProjectWork)=>void,busy:boolean,error?:string,
  selected?:ProjectFocus,tasks:TaskRow[],openTask:(id:string)=>void,addTask:(id:string)=>void
}){
  const [focus,setFocus]=useState<ProjectFocus>()
  const [toast,setToast]=useState<Project>()
  const [deleteTarget,setDeleteTarget]=useState<Project>()
  useEffect(()=>{
    if(!toast)return
    const timeout=setTimeout(()=>setToast(undefined),10_000)
    return ()=>clearTimeout(timeout)
  },[toast])
  useEffect(()=>{if(selected?.id)setFocus(selected)},[selected])
  const active=overview.projects.filter(project=>project.status==='active')
  const archived=overview.projects.filter(project=>project.status==='archived')
    .sort((a,b)=>(b.archived_at??'').localeCompare(a.archived_at??''))
  const editing=focus?.id?active.find(project=>project.id===focus.id):undefined
  async function archive(project:Project){
    if(await save({projectIntent:'complete',completed:true},project)){
      setToast({...project,revision:project.revision+1})
      setFocus(undefined)
    }
  }
  async function restore(project:Project){
    if(await save({projectIntent:'complete',completed:false},project))setToast(undefined)
  }
  return <div className="projects-panel">
    <div className="editor-title projects-summary">
      <p>{active.length} aktive Projekte · {overview.weekCheckpoints} {overview.weekCheckpoints===1?'Checkpoint':'Checkpoints'} diese Woche</p>
      <button type="button" className="primary" onClick={()=>setFocus({area:'uni'})}>+ Neues Projekt</button>
    </div>
    <ProjectMailSuggestions suggestions={overview.suggestions} decide={mail} approveAll={approveMails} busy={busy}/>
    {(Object.keys(projectAreas) as ProjectArea[]).map(area=>{
      const rows=active.filter(project=>project.area===area)
      return <section key={area} className="project-area" aria-label={projectAreas[area]}>
        <div className="editor-title"><h2>{projectAreas[area]}</h2><button type="button" onClick={()=>setFocus({area})}>+ {projectAreas[area]}</button></div>
        {rows.length?rows.map(project=><ProjectCard key={project.id} item={project} save={save} busy={busy}
          open={step=>setFocus({id:project.id,area,step})} archive={()=>void archive(project)}/>):
          <p className="empty">Keine aktiven Projekte in diesem Bereich.</p>}
      </section>
    })}
    {archived.length?<details className="card settings project-archive">
      <summary>Archivierte Projekte ({archived.length})</summary>
      <ul>{archived.map(project=><li key={project.id}>
        <div><strong>{project.title}</strong><p>{projectAreas[project.area]} · {project.steps.filter(step=>step.completed).length}/{project.steps.length}
          {project.archived_at?' · Abgeschlossen am '+displayDate(project.archived_at.slice(0,10)):''}</p></div>
        <button type="button" disabled={busy} onClick={()=>void restore(project)}>Wiederherstellen</button>
        <button type="button" className="quiet" disabled={busy} onClick={()=>setDeleteTarget(project)}>Endgültig löschen</button>
      </li>)}</ul>
    </details>:null}
    {toast?<div className="project-toast" role="status"><span>„{toast.title}“ abgeschlossen und ins Archiv verschoben.</span>
      <button type="button" disabled={busy} onClick={()=>void restore(archived.find(item=>item.id===toast.id)??toast)}>Rückgängig</button>
      <button type="button" className="quiet" aria-label="Hinweis schließen" onClick={()=>setToast(undefined)}>×</button>
    </div>:null}
    {deleteTarget?<ProjectDeleteDialog project={deleteTarget} busy={busy} close={()=>setDeleteTarget(undefined)} remove={async()=>{
      if(await save({projectIntent:'delete'},deleteTarget)){setDeleteTarget(undefined);setToast(undefined)}
    }}/>:null}
    {focus&&(!focus.id||editing)?<ProjectOverlay key={(focus.id??'new')+':'+(focus.step??'')+':'+(focus.token??'')}
      project={editing} focus={focus} close={()=>setFocus(undefined)} save={save} saveEditor={saveEditor} archive={project=>void archive(project)}
      busy={busy} error={error} gmail={overview.gmail} tasks={tasks.filter(task=>task.project_id===editing?.id)}
      openTask={openTask} addTask={addTask} work={work}/>:null}
  </div>
}

function ProjectDeleteDialog({project,busy,close,remove}:{project:Project,busy:boolean,close:()=>void,remove:()=>Promise<void>}){
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{dialog.current?.showModal()},[])
  return <dialog ref={dialog} className="task-dialog card" aria-label="Projekt endgültig löschen" onCancel={event=>{event.preventDefault();close()}}>
    <h2>Projekt endgültig löschen</h2>
    <p>„{project.title}“ samt Checkliste und Mailzuordnungen endgültig löschen?</p>
    <div className="actions">
      <button type="button" autoFocus onClick={close}>Abbrechen</button>
      <button type="button" disabled={busy} onClick={()=>void remove()}>Endgültig löschen</button>
    </div>
  </dialog>
}

export function ProjectDeadlineRow({item,open,toggle,busy}:{item:ProjectDeadline,open:(id:string)=>void,
  toggle:(value:boolean)=>Promise<void>,busy:boolean}){
  return <li className={'project-deadline-row'+(item.completed?' done':'')}>
    <input type="checkbox" checked={!!item.completed} disabled={busy} aria-label={item.title+(item.completed?' wieder öffnen':' abhaken')}
      onChange={event=>void toggle(event.target.checked)}/>
    <button type="button" className="quiet" onClick={()=>open(item.projectId)}>{item.title}
      {item.title!==item.projectTitle?<small>{item.projectTitle}</small>:null}</button>
    <time dateTime={item.date}>{item.mode==='checkpoint'?'Checkpoint · ':'Frist · '}{displayDate(item.date)}{item.label&&item.label!=='Planungsdatum'?<small>{item.label}</small>:null}</time>
  </li>
}

export function ProjectProposal({change}:{change:ProjectChange}){
  const {data}=change
  return <section className="task" aria-label="Projektvorschlag">
    <strong>{change.summary}</strong>
    <p>{[data.title,projectAreas[data.area],priorityText(data.priority)].join(' · ')}</p>
    {data.description?<p>{data.description}</p>:null}
    {change.changes?.length?<ul>{change.changes.map((item,index)=><li key={index}>{item}</li>)}</ul>:null}
    <Timing item={data}/>
    {data.steps.length?<details open={change.operation==='create'}><summary>Checkliste ({data.steps.length})</summary>
      <ul>{data.steps.map(step=><li key={step.id}>
        {step.completed?'✓ ':''}{step.title} · {priorityText(step.priority??data.priority)} <Timing item={step}/>
      </li>)}</ul>
    </details>:null}
  </section>
}
