import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { berlinInstant } from '../../agents/lifepilot/tools/validate.ts'
import { dateInBerlin, isInstant, shiftDay, utcNow } from './values.ts'
import { Problem } from './settings.ts'
import { suggestCategory, type Category } from './categories.ts'
import { relevance, searchTerms } from './relevance.ts'
import { tripCalendarTitle } from './trip-types.ts'

export type Priority = 'low' | 'normal' | 'high'
export type Step = { title: string, done: boolean }
export type TaskRow = {
  id: string, run_id: string | null, title: string, detail: string, due_date: string | null,
  kind: 'task' | 'appointment', priority: Priority, status: 'open' | 'done' | 'archived',
  category: Category | null, steps: Step[], related_id: string | null, project_id: string | null, revision: number, updated_at: string, completed_at: string | null
}
export type TaskPatch = Partial<Pick<TaskRow, 'title' | 'detail' | 'due_date' | 'priority' | 'status' | 'steps' | 'related_id' | 'category' | 'project_id'>>
export type ScheduleRow = { id: string, task_id: string, kind: 'slot' | 'reminder', at: string, ends_at: string | null, state: 'pending' | 'ready' | 'dismissed' }
export type WeekEntry = { id: string, taskId: string, title: string, priority: Priority,
  kind: 'slot' | 'reminder' | 'deadline' | 'appointment' | 'travel', category: Category | null, day: string, at: string | null, endsAt: string | null }
export type Week = { start: string, end: string, entries: WeekEntry[] }
export type TaskContext = Pick<TaskRow, 'id' | 'title' | 'detail' | 'kind' | 'due_date' | 'priority' | 'revision' | 'related_id'> & {
  schedule: Pick<ScheduleRow, 'id' | 'kind' | 'at' | 'ends_at'>[]
}
type RawTask = Omit<TaskRow, 'steps'> & { steps: string }
const decode = ({ steps, ...task }: RawTask): TaskRow => ({ ...task, steps: JSON.parse(steps) as Step[] })

const appointmentStop=new Set(['und','and','vorlesung','übung','uebung','seminar','tutorium','praktikum','termin','in','der','die','das','im','am','zum','zur','für','fuer','mit','von','halten','vorstellen','präsentation','praesentation','projekt','abgabe'])
export function appointmentWords(text:string){
  return new Set(text.toLocaleLowerCase('de-DE').replace(/&/gu,' und ').split(/[^\p{L}\p{N}]+/u).filter(word=>word.length>1&&!appointmentStop.has(word)))
}

export class Workspace {
  readonly db: DatabaseSync
  constructor(db: DatabaseSync) { this.db = db }

  list() {
    return (this.db.prepare(`SELECT * FROM tasks WHERE status!='archived'
      ORDER BY status='done', due_date IS NULL, due_date, updated_at DESC`).all() as RawTask[]).map(decode)
  }

  get(id: string) {
    const task = this.db.prepare('SELECT * FROM tasks WHERE id=?').get(id) as RawTask | undefined
    if (!task) throw new Problem(404, 'Aufgabe nicht gefunden.')
    return decode(task)
  }

  context(query = ''): TaskContext[] {
    const from = utcNow()
    const upcoming = this.db.prepare(`SELECT * FROM schedule WHERE state!='dismissed'
      AND coalesce(ends_at, at)>? ORDER BY at LIMIT 160`).all(from) as ScheduleRow[]
    const withPlans = new Map<string, TaskContext['schedule']>()
    for (const { task_id, id, kind, at, ends_at } of upcoming) {
      const plans = withPlans.get(task_id) ?? []
      if (plans.length < 16) plans.push({ id, kind, at, ends_at })
      withPlans.set(task_id, plans)
    }
    const open = this.list().filter(task => task.status === 'open')
    const terms = searchTerms(query)
    const relevant = open.map(task => ({ task, score: 3 * relevance(terms, task.title) + relevance(terms, task.detail) }))
      .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map(({ task }) => task)
    const byId = new Map(open.map(task => [task.id, task]))
    const ordered = new Map(relevant.map(task => [task.id, task]))
    for (const id of withPlans.keys()) {
      const task = byId.get(id)
      if (task) ordered.set(id, task)
      if (ordered.size >= 20) break
    }
    for (const task of open) {
      if (ordered.size >= 24) break
      ordered.set(task.id, task)
    }
    return Array.from(ordered.values())
      .map(({ id, title, detail, due_date, kind, priority, revision, related_id }) =>
        ({ id, title, detail, due_date, kind, priority, revision, related_id, schedule: withPlans.get(id) ?? [] }))
  }

  add(run: string | null, task: { title: string, detail: string, date: string | null, kind: TaskRow['kind'], steps?: string[], category?: Category | null, projectId?:string|null, priority?:Priority }, actor: string) {
    const id = randomUUID()
    if(task.projectId)this.checkProject(task.projectId,task.kind)
    this.db.prepare(`INSERT INTO tasks (id,run_id,title,detail,due_date,kind,priority,status,steps,updated_at,category)
      VALUES (?,?,?,?,?,?,?,'open',?,?,?)`).run(
      id, run, task.title, task.detail, task.date, task.kind,task.priority??'normal',
      JSON.stringify((task.steps ?? []).map(title => ({ title, done: false }))), utcNow(),
      task.category === undefined ? suggestCategory(task.title, task.detail) : task.category,
    )
    if(task.projectId)this.db.prepare('UPDATE tasks SET project_id=? WHERE id=?').run(task.projectId,id)
    this.event(id, actor, 'Erstellt')
    if(task.kind==='task'&&task.date)this.linkAppointment(id,task.title+' '+task.detail,task.date,actor)
    return this.get(id)
  }

  /** Eine Abgabe, die eine Vorlesung oder einen Termin am selben Tag nennt, wird damit verknüpft und zur Startzeit erinnert. */
  private linkAppointment(id:string,text:string,date:string,actor:string){
    const candidates=this.db.prepare(`SELECT t.id,t.title,min(s.at) AS at FROM tasks t JOIN schedule s ON s.task_id=t.id
      WHERE t.kind='appointment' AND t.status='open' AND s.kind='slot' AND s.state<>'dismissed'
        AND date(s.at) BETWEEN date(?,'-1 day') AND ? GROUP BY t.id,s.at`).all(date,date) as {id:string,title:string,at:string}[]
    const sameDay=[...new Map(candidates.filter(item=>dateInBerlin(new Date(item.at))===date).map(item=>[item.id,item])).values()]
    const words=appointmentWords(text)
    const scored=sameDay.map(item=>{const own=appointmentWords(item.title);return {item,hits:[...own].filter(word=>words.has(word)).length,size:own.size}})
      .filter(entry=>entry.hits>=Math.min(2,entry.size)).sort((a,b)=>b.hits-a.hits)
    if(!scored.length||scored[1]?.hits===scored[0].hits)return
    const match=scored[0].item
    this.db.prepare('UPDATE tasks SET related_id=? WHERE id=?').run(match.id,id)
    this.event(id,actor,'Mit Termin verknüpft: '+match.title)
    if(match.at>utcNow())this.db.prepare("INSERT OR IGNORE INTO schedule VALUES (?,?,'reminder',?,NULL,'pending')").run(randomUUID(),id,match.at)
  }

  private checkProject(id:string,kind:TaskRow['kind']){
    if(kind!=='task'||!this.db.prepare("SELECT 1 FROM projects WHERE id=? AND json_extract(data,'$.status')='active'").get(id))
      throw new Problem(400,'Wähle ein aktives Projekt für diese Aufgabe.')
  }

  update(id: string, revision: number, patch: TaskPatch, actor: string) {
    const previous = this.get(id)
    if (previous.revision !== revision || previous.status === 'archived') {
      throw new Problem(409, 'Diese Aufgabe wurde inzwischen geändert. Prüfe den aktuellen Stand.')
    }
    const next = { ...previous, ...patch }
    if (next.kind === 'appointment' && !next.due_date) throw new Problem(400, 'Ein Termin benötigt ein Datum.')
    if (next.related_id && (next.related_id === id || this.get(next.related_id).status === 'archived')) {
      throw new Problem(400, 'Ungültige verknüpfte Aufgabe.')
    }
    if(next.project_id&&next.project_id!==previous.project_id)this.checkProject(next.project_id,next.kind)
    const changed = ['title','detail','due_date','priority','status','steps','related_id','category','project_id'].filter(key => {
      const field = key as keyof TaskPatch
      return JSON.stringify(previous[field]) !== JSON.stringify(next[field])
    })
    if (!changed.length) return previous
    const updatedAt = utcNow()
    this.db.prepare(`UPDATE tasks SET title=?,detail=?,due_date=?,priority=?,status=?,steps=?,related_id=?,category=?,project_id=?,
      revision=revision+1,updated_at=?,completed_at=? WHERE id=?`).run(
      next.title, next.detail, next.due_date, next.priority, next.status,
      JSON.stringify(next.steps), next.related_id, next.category, next.project_id, updatedAt,
      next.status === 'done' ? previous.completed_at ?? updatedAt : null, id,
    )
    if (next.status !== 'open') this.db.prepare("UPDATE schedule SET state='dismissed' WHERE task_id=? AND state!='dismissed'").run(id)
    const labels: Record<string, string> = { title: 'Titel', detail: 'Beschreibung', due_date: 'Frist', priority: 'Priorität', status: 'Status', steps: 'Teilaufgaben', related_id: 'Verknüpfung', category: 'Kategorie', project_id:'Projekt' }
    this.event(id, actor, changed.map(key => labels[key]).join(', ') + ' geändert')
    return this.get(id)
  }

  history(id: string) {
    this.get(id)
    return this.db.prepare('SELECT id, actor, event, at FROM task_events WHERE task_id=? ORDER BY id DESC LIMIT 50').all(id)
  }

  private event(id: string, actor: string, event: string) {
    this.db.prepare('INSERT INTO task_events (task_id,actor,event,at) VALUES (?,?,?,?)').run(id, actor, event, utcNow())
  }

  schedule() {
    return this.db.prepare(`SELECT * FROM schedule WHERE state!='dismissed' AND (kind='reminder' OR ends_at>?)
      ORDER BY kind='reminder' AND state='ready', at LIMIT 200`).all(utcNow()) as ScheduleRow[]
  }

  private travelBlocks(start:string, end:string) {
    return this.db.prepare(`SELECT id, json_extract(plan,'$.draft.destination') AS destination,
      json_extract(plan,'$.draft.start') AS start, json_extract(plan,'$.draft.end') AS end
      FROM trips WHERE json_extract(plan,'$.draft.start')<=? AND json_extract(plan,'$.draft.end')>=?`)
      .all(end,start) as {id:string,destination:string,start:string,end:string}[]
  }

  busySpans(from: string, to: string) {
    const scheduled = this.db.prepare(`SELECT at, ends_at AS endsAt FROM schedule
      WHERE kind='slot' AND state!='dismissed' AND at<? AND ends_at>? ORDER BY at`).all(to, from) as { at: string, endsAt: string }[]
    const travel = this.travelBlocks(dateInBerlin(new Date(from)),dateInBerlin(new Date(to)))
      .map(trip=>({at:berlinInstant(trip.start+'T00:00'),endsAt:berlinInstant(shiftDay(trip.end,1)+'T00:00')}))
      .filter(block=>block.at<to && block.endsAt>from)
    return [...scheduled,...travel].sort((a,b)=>a.at.localeCompare(b.at))
  }

  hasUntimedAppointment(day: string, from: string, to: string) {
    return Boolean(this.db.prepare(`SELECT 1 FROM tasks AS task
      WHERE task.status='open' AND task.kind='appointment' AND task.due_date=? AND NOT EXISTS (
        SELECT 1 FROM schedule AS s WHERE s.task_id=task.id AND s.kind='slot'
        AND s.state!='dismissed' AND s.at>=? AND s.at<?) LIMIT 1`).get(day, from, to))
  }

  week(start: string, fromUtc: string, toUtc: string, days = 7): Week {
    const end = shiftDay(start, days - 1)
    const scheduled = this.db.prepare(`SELECT s.id, s.task_id AS taskId, t.title, t.priority, t.category, s.kind, s.at, s.ends_at AS endsAt
      FROM schedule AS s JOIN tasks AS t ON t.id=s.task_id
      WHERE s.state!='dismissed' AND t.status='open' AND s.at<? AND (
        (s.kind='slot' AND s.ends_at>?) OR (s.kind='reminder' AND s.at>=?))`).all(toUtc, fromUtc, fromUtc) as
      (Omit<WeekEntry, 'day' | 'at'> & { at: string })[]
    const entries: WeekEntry[] = scheduled.map(entry => ({ ...entry, day: entry.at < fromUtc ? start : dateInBerlin(new Date(entry.at)) }))
    const dated = this.db.prepare(`SELECT id, id AS taskId, title, priority, category, due_date AS day,
      CASE kind WHEN 'appointment' THEN 'appointment' ELSE 'deadline' END AS kind
      FROM tasks WHERE (status='open' OR (status='done' AND kind='task')) AND due_date BETWEEN ? AND ?`).all(start, end) as Omit<WeekEntry, 'at' | 'endsAt'>[]
    const timedAppointments = new Set(entries.filter(item => item.kind === 'slot').map(item => `${item.taskId}:${item.day}`))
    for (const entry of dated) {
      if (entry.kind === 'appointment' && timedAppointments.has(`${entry.taskId}:${entry.day}`)) continue
      entries.push({ ...entry, at: null, endsAt: null })
    }
    for (const trip of this.travelBlocks(start,end)) {
      for (let day=trip.start<start ? start : trip.start; day<=end && day<=trip.end; day=shiftDay(day,1)) {
        entries.push({id:trip.id+':'+day,taskId:trip.id,title:tripCalendarTitle(trip.destination),priority:'normal',
          kind:'travel',category:'leisure',day,at:null,endsAt:null})
      }
    }
    return { start, end, entries: entries.sort((a, b) => a.day.localeCompare(b.day) || (a.at ?? '').localeCompare(b.at ?? '') || a.title.localeCompare(b.title, 'de')) }
  }

  addSchedule(id: string, kind: 'slot' | 'reminder', at: string, endsAt: string | null, actor: string, allowOverlap = false) {
    if (this.get(id).status !== 'open') throw new Problem(409, 'Die Aufgabe ist geschlossen.')
    if (!isInstant(at) || at <= utcNow() || (kind === 'slot' && (!isInstant(endsAt) || endsAt <= at))) {
      throw new Problem(400, 'Wähle einen gültigen Zeitpunkt in der Zukunft.')
    }
    if (kind === 'slot' && endsAt && !allowOverlap) this.checkSlot(at, endsAt, null)
    const scheduleId = randomUUID()
    const saved = this.db.prepare("INSERT OR IGNORE INTO schedule VALUES (?,?,?,?,?,'pending')")
      .run(scheduleId, id, kind, at, endsAt)
    if (!saved.changes) throw new Problem(409, 'Dieser Zeitpunkt ist bereits gespeichert.')
    this.event(id, actor, kind === 'slot' ? 'Zeitblock geplant' : 'Erinnerung geplant')
    return { id: scheduleId }
  }

  private checkSlot(at: string, end: string, exclude: string | null) {
    if (this.db.prepare(`SELECT 1 FROM schedule s JOIN tasks t ON t.id=s.task_id WHERE s.kind='slot'
      AND s.state!='dismissed' AND t.status='open' AND s.at<? AND s.ends_at>? AND (? IS NULL OR s.id!=?)`).get(end, at, exclude, exclude)) {
      throw new Problem(409, 'Der Zeitblock überschneidet sich mit der lokalen Planung.')
    }
  }

  moveSlot(id: string, taskId: string, expectedAt: string, expectedEnd: string, at: string, end: string, actor: string, allowOverlap = false) {
    if (!isInstant(at) || !isInstant(end) || end <= at || at <= utcNow()) throw new Problem(400, 'Ungültiger neuer Termin.')
    if (this.get(taskId).status !== 'open') throw new Problem(409, 'Die Aufgabe ist geschlossen.')
    const slot = this.db.prepare("SELECT at,ends_at FROM schedule WHERE id=? AND task_id=? AND kind='slot' AND state='pending'")
      .get(id, taskId)
    if (!slot || slot.at !== expectedAt || slot.ends_at !== expectedEnd) throw new Problem(409, 'Der Zeitblock wurde inzwischen geändert.')
    if (!allowOverlap) this.checkSlot(at, end, id)
    if (this.db.prepare("SELECT 1 FROM schedule WHERE id!=? AND task_id=? AND kind='slot' AND at=?").get(id, taskId, at)) {
      throw new Problem(409, 'Dieser Zeitpunkt ist bereits gespeichert.')
    }
    this.db.prepare('UPDATE schedule SET at=?, ends_at=? WHERE id=?').run(at, end, id)
    this.event(taskId, actor, 'Zeitblock verschoben')
  }

  dismiss(id: string, actor: string) {
    const row = this.db.prepare("SELECT task_id,kind FROM schedule WHERE id=? AND state!='dismissed'").get(id)
    if (!row) throw new Problem(404, 'Zeitpunkt nicht gefunden.')
    this.db.prepare("UPDATE schedule SET state='dismissed' WHERE id=?").run(id)
    this.event(String(row.task_id), actor, row.kind === 'slot' ? 'Zeitblock entfernt' : 'Erinnerung ausgeblendet')
  }

  tick(at = utcNow()) {
    return this.db.prepare("UPDATE schedule SET state='ready' WHERE kind='reminder' AND state='pending' AND at<=?").run(at).changes
  }
}
