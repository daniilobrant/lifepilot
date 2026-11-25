import type {Project} from '../runtime/project-types.ts'
import {DateInput} from './presentation.tsx'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { ScheduleRow, TaskRow, Step } from '../runtime/workspace.ts'
import { categoryLabels } from '../runtime/categories.ts'
import { dateInBerlin } from '../runtime/values.ts'

const day = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const time = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' })
export const shortDay = (value: string) => day.format(new Date(value))
export const displayTime = (value: string) => time.format(new Date(value))
export const priorityNames = { low: 'Niedrig', normal: 'Normal', high: 'Hoch' }
type Mutate = (path: string, payload: object) => Promise<unknown>
type Activity = { id: number, event: string, at: string }

export function TaskList({ tasks, onSelect, filterable = false }: {
  tasks: TaskRow[], onSelect: (id: string) => void, filterable?: boolean
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const today = dateInBerlin()
  const selected = tasks.filter(task => (status === 'all' || status === task.status ||
    (status === 'overdue' && task.status === 'open' && task.due_date && task.due_date < today)) &&
    (task.title + ' ' + task.detail).toLocaleLowerCase('de').includes(query.toLocaleLowerCase('de').trim()))
  return <>
    {filterable ? <div className="filters">
      <label>Aufgabe suchen<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label>Status<select value={status} onChange={event => setStatus(event.target.value)}>
        <option value="all">Alle</option><option value="open">Offen</option><option value="overdue">Überfällig</option><option value="done">Erledigt</option>
      </select></label>
    </div> : null}
    {selected.length ? selected.map(task => <button className="run-row card" key={task.id} onClick={() => onSelect(task.id)}>
      <span className="run-title">{task.title}</span>
      {task.status === 'done' ? <span className="status accepted">Erledigt</span> :
        task.due_date ? <time className={task.due_date < today ? 'error-text' : undefined} dateTime={task.due_date}>{shortDay(task.due_date)}{task.due_date < today ? ' · überfällig' : ''}</time> : null}
      {task.priority === 'high' && task.status !== 'done' ? <span className="status permission">Wichtig</span> : null}
      <span className="arrow" aria-hidden>›</span>
    </button>) : <p className="card empty">{filterable ? 'Keine passenden Aufgaben.' : 'Keine offenen Aufgaben.'}</p>}
  </>
}

function ProjectField({projects,current}:{projects:Project[],current?:string|null}){
  const options=projects.filter(project=>project.status==='active'||project.id===current)
  return <label>Projekt (optional)<select name="project" aria-label="Projekt (optional)" defaultValue={current??''}>
    <option value="">Ohne Projekt</option>
    {options.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}
  </select></label>
}

export function NewTask({ mutate, onAdded, disabled, expanded = false, initial, projects=[], projectId }: {
  mutate: Mutate, onAdded: (id: string) => void, disabled: boolean, expanded?: boolean, initial?: { title: string, date: string }, projects?:Project[], projectId?:string
}) {
  const [kind, setKind] = useState<'task' | 'appointment'>('task')
  const form = <form onSubmit={async event => {
      event.preventDefault()
      if (disabled) return
      const data = new FormData(event.currentTarget)
      const saved = await mutate('/tasks', {
        title: data.get('title'), detail: data.get('detail'), date: data.get('date') || null, kind, confirm: true,
        category: data.get('category') || undefined, project:kind==='task'?data.get('project')||null:null,
      }) as TaskRow | undefined
      if (saved) onAdded(saved.id)
    }}>
      <label>Titel<input name="title" defaultValue={initial?.title} maxLength={120} required /></label>
      <label>Beschreibung (optional)<input name="detail" maxLength={360} /></label>
      <div className="filters"><label>Art<select value={kind} onChange={event => setKind(event.target.value === 'appointment' ? 'appointment' : 'task')}>
        <option value="task">Aufgabe</option><option value="appointment">Termin</option></select></label>
        <label>{kind === 'appointment' ? 'Datum' : 'Frist (optional)'}<DateInput  name="date" defaultValue={initial?.date} required={kind === 'appointment'} /></label></div>
      <label>Kategorie<select name="category"><option value="">Automatisch zuordnen</option>
        {Object.entries(categoryLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
      </select></label>
      {kind==='task'&&projects.length?<ProjectField projects={projects} current={projectId}/>:null}
      <button className="primary" disabled={disabled}>{kind === 'appointment' ? 'Termin speichern' : 'Aufgabe speichern'}</button>
    </form>
  return expanded ? <section className="card settings" aria-label="Schnelleingabe"><h2>Aufgabe oder Termin</h2>{form}</section> :
    <details className="card settings disclosure calendar-tools"><summary>Aufgabe oder Termin erfassen</summary>{form}</details>
}

export function TaskEditor({ task, tasks, schedule, mutate, onClose, loadHistory, renderExport, projects=[],openSchedule=false }: {
  task: TaskRow, tasks: TaskRow[], schedule: ScheduleRow[], mutate: Mutate, onClose: () => void,
  projects?:Project[], openSchedule?:boolean, renderExport?: (slot: ScheduleRow) => ReactNode, loadHistory: (id: string) => Promise<{ history: Activity[] }>
}) {
  const [steps, setSteps] = useState<Step[]>(task.steps)
  const [history, setHistory] = useState<Activity[]>([])
  const [historyError, setHistoryError] = useState('')
  const [busy, setBusy] = useState(false)
  const [planKind, setPlanKind] = useState<'reminder' | 'slot'>(openSchedule?'slot':'reminder')
  const activeSchedule = schedule.filter(item => item.task_id === task.id)
  useEffect(() => {
    let live = true
    loadHistory(task.id).then(data => { if (live) setHistory(data.history) })
      .catch(() => { if (live) setHistoryError('Der Verlauf konnte nicht geladen werden.') })
    return () => { live = false }
  }, [task.id, task.revision, schedule.length])

  async function change(path: string, data: object) {
    if (busy) return
    setBusy(true)
    try { return await mutate(path, data) } finally { setBusy(false) }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await change('/tasks/' + task.id + '/edit', { revision: task.revision, confirm: true, patch: {
      title: data.get('title'), detail: data.get('detail'), due_date: data.get('date') || null,
      ...((data.has('project'))&&{project_id:data.get('project')||null}),
      priority: data.get('priority'), category: data.get('category') || null, related_id: data.get('related') || null, steps: steps.filter(step => step.title.trim()),
    } })
  }
  async function setStatus(status: 'open' | 'done' | 'archived') {
    if (status === 'archived' && !window.confirm('Diese Aufgabe aus der Liste entfernen? Ihr Verlauf bleibt erhalten.')) return
    if (await change('/tasks/' + task.id + '/edit', { revision: task.revision, confirm: true, patch: { status } })) {
      if (status === 'archived') onClose()
    }
  }
  return <article className="card settings workspace-editor">
    <div className="editor-title"><h2>{task.title}</h2><button type="button" onClick={onClose}>Schließen</button></div>
    <form onSubmit={save}>
      <div className="editor-grid">
      <label className="editor-wide">Titel<input name="title" defaultValue={task.title} maxLength={120} required /></label>
      <label>{task.kind === 'appointment' ? 'Datum' : 'Frist'}<DateInput  name="date" defaultValue={task.due_date ?? ''} required={task.kind === 'appointment'} /></label>
      </div>
      {task.kind==='task'&&projects.length?<ProjectField projects={projects} current={task.project_id}/>:null}
      <details className="task-options editor-section"><summary>Weitere Angaben</summary>
      <label>Beschreibung oder Ziel (optional)<textarea name="detail" defaultValue={task.detail} maxLength={360} /></label>
      <div className="filters">
        <label>Priorität<select name="priority" defaultValue={task.priority}>
          {Object.entries(priorityNames).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select></label>
      </div>
      <label>Kategorie<select name="category" defaultValue={task.category ?? ''}><option value="">Ohne Kategorie</option>
        {Object.entries(categoryLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
      </select></label>
      <label>Verknüpfte Aufgabe<select name="related" defaultValue={task.related_id ?? ''}>
        <option value="">Keine</option>{tasks.filter(item => item.id !== task.id).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
      <fieldset><legend>Teilaufgaben</legend>
        {steps.map((step, index) => <div className="step" key={index}>
          <input type="checkbox" checked={step.done} aria-label={`Teilaufgabe ${index + 1} erledigt`} onChange={event =>
            setSteps(rows => rows.map((row, i) => i === index ? { ...row, done: event.target.checked } : row))} />
          <input value={step.title} maxLength={120} aria-label={`Teilaufgabe ${index + 1}`} onChange={event =>
            setSteps(rows => rows.map((row, i) => i === index ? { ...row, title: event.target.value } : row))} />
          <button type="button" aria-label={`Teilaufgabe ${index + 1} entfernen`} onClick={() => setSteps(rows => rows.filter((_, i) => i !== index))}>×</button>
        </div>)}
        {steps.length < 12 ? <button type="button" onClick={() => setSteps(rows => [...rows, { title: '', done: false }])}>Teilaufgabe hinzufügen</button> : null}
      </fieldset>
      </details>
      <div className="actions editor-actions">
        <button className="primary" disabled={busy}>Speichern</button>
        <button type="button" disabled={busy} onClick={() => void setStatus(task.status === 'done' ? 'open' : 'done')}>{task.status === 'done' ? 'Wieder öffnen' : 'Erledigt'}</button>
        <button type="button" className="quiet" disabled={busy} onClick={() => void setStatus('archived')}>Archivieren</button>
      </div>
    </form>
    {task.status === 'open' ? <details className="editor-section" open={openSchedule||undefined}><summary>Zeitblöcke &amp; Erinnerungen{activeSchedule.length ? ' · ' + activeSchedule.length : ''}</summary>
      {activeSchedule.length ? <ul className="schedule-list">{activeSchedule.map(item => <li key={item.id}>
        <span className="schedule-kind">{item.kind === 'slot' ? 'Zeitblock' : 'Erinnerung'}</span><time>{displayTime(item.at)}</time>
        <button type="button" className="icon-button" aria-label="Entfernen" title="Entfernen" onClick={() => void change('/schedule/' + item.id + '/dismiss', { confirm: true })}>×</button>
      </li>)}</ul> : null}
      <form className="schedule-add" onSubmit={async event => {
        event.preventDefault()
        const form = event.currentTarget
        const data = new FormData(form)
        if (await change('/tasks/' + task.id + '/schedule', {
          kind: planKind, at: data.get('at'), minutes: planKind === 'slot' ? Number(data.get('minutes')) : undefined, confirm: true,
        })) form.reset()
      }}>
        <label>Art<select value={planKind} onChange={event => setPlanKind(event.target.value === 'slot' ? 'slot' : 'reminder')}>
          <option value="reminder">Erinnerung</option><option value="slot">Zeitblock</option>
        </select></label>
        <label>Zeitpunkt (Berlin)<input type="datetime-local" name="at" required /></label>
        {planKind === 'slot' ? <label>Dauer in Minuten<input type="number" name="minutes" defaultValue={60} min={5} max={480} required /></label> : null}
        <button disabled={busy}>Hinzufügen</button>
      </form>
    </details> : null}
    <details className="editor-section"><summary>Verlauf</summary>
      {historyError ? <p role="alert">{historyError}</p> : null}
      <ul>{history.map(item => <li key={item.id}>{item.event} · <time>{displayTime(item.at)}</time></li>)}</ul>
    </details>
  </article>
}
