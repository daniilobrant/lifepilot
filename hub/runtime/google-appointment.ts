import type { GoogleConnector } from '../connectors/google.ts'
import type { Store } from './store.ts'
import { Problem } from './settings.ts'

export function googleLifePilotCalendar(store: Store) {
  const value = store.db.prepare('SELECT calendar_id FROM google_lifepilot_calendar WHERE singleton=1').get()?.calendar_id
  return typeof value === 'string' ? value : undefined
}

export async function syncApprovedAppointment(store: Store, google: Pick<GoogleConnector, 'syncAppointment'>, run: string) {
  const pending = store.db.prepare(`SELECT export.*, tasks.title AS current_title, schedule.at, schedule.ends_at AS current_end, tasks.status, schedule.state
    FROM google_appointment_sync AS export JOIN schedule ON schedule.id=export.slot_id
    JOIN tasks ON tasks.id=schedule.task_id WHERE export.run_id=?`).get(run)
  if (!pending) throw new Problem(404, 'Für diesen Vorgang gibt es keine Google-Freigabe.')
  if (pending.event_id) return pending.event_id
  if (pending.current_title !== pending.title || pending.at !== pending.starts_at || pending.current_end !== pending.ends_at ||
      pending.status !== 'open' || pending.state !== 'pending' || Date.parse(String(pending.starts_at)) <= Date.now()) {
    throw new Problem(409, 'Der bestätigte Termin hat sich geändert. Prüfe einen neuen Vorschlag.')
  }
  const receipt = await google.syncAppointment(String(pending.slot_id), String(pending.title), String(pending.starts_at), String(pending.ends_at),
    () => googleLifePilotCalendar(store), calendar => {
      store.db.prepare('INSERT OR REPLACE INTO google_lifepilot_calendar VALUES (1,?)').run(calendar)
    })
  store.db.prepare('UPDATE google_appointment_sync SET event_id=? WHERE run_id=?').run(receipt.event, run)
  return receipt.event
}

export function queueAppointmentChange(store: Store, run: string, actor: 'ui' | 'cli',
  next: { title: string, start: string, end: string, day: string } | null) {
  store.transaction(() => {
    const row = store.db.prepare(`SELECT export.*, schedule.task_id, schedule.at, schedule.ends_at AS current_end,
      schedule.state FROM google_appointment_sync AS export JOIN schedule ON schedule.id=export.slot_id WHERE export.run_id=?`).get(run)
    if (!row?.event_id || row.pending_op || row.removed || row.state !== 'pending') {
      throw new Problem(409,'Der Google-Termin ist bereits entfernt, noch in Übertragung oder nicht verknüpft.')
    }
    const slot = String(row.slot_id)
    const task = store.workspace.get(String(row.task_id))
    if (task.title !== row.title || row.at !== row.starts_at || row.current_end !== row.ends_at) {
      throw new Problem(409,'Der lokale Termin wurde außerhalb dieses Vorgangs geändert.')
    }
    if (next) {
      if (next.start !== row.starts_at || next.end !== row.ends_at) {
        store.workspace.moveSlot(slot,task.id,String(row.starts_at),String(row.ends_at),next.start,next.end,actor)
      }
      store.workspace.update(task.id,store.workspace.get(task.id).revision,{ title: next.title, due_date: next.day },actor)
    } else {
      store.workspace.update(task.id,task.revision,{ status:'archived' },actor)
    }
    store.db.prepare(`UPDATE google_appointment_sync SET pending_op=?,old_title=title,old_start=starts_at,old_end=ends_at,
      title=?,starts_at=?,ends_at=? WHERE run_id=?`).run(next?'update':'remove',next?.title??row.title,next?.start??row.starts_at,next?.end??row.ends_at,run)
  })
}

export async function finishAppointmentChange(store: Store, google: Pick<GoogleConnector,'changeAppointment'>, run: string) {
  const row=store.db.prepare('SELECT * FROM google_appointment_sync WHERE run_id=? AND pending_op IS NOT NULL').get(run)
  if (!row) return false
  const calendar=googleLifePilotCalendar(store)
  if (!calendar || calendar==='pending') throw new Problem(409,'Der LifePilot-Kalender ist nicht verfügbar.')
  const previous={title:String(row.old_title),start:String(row.old_start),end:String(row.old_end)}
  const next=row.pending_op==='update'?{title:String(row.title),start:String(row.starts_at),end:String(row.ends_at)}:null
  await google.changeAppointment(calendar,String(row.event_id),previous,next)
  store.db.prepare(`UPDATE google_appointment_sync SET pending_op=NULL, old_title=NULL, old_start=NULL, old_end=NULL, removed=?
    WHERE run_id=? AND pending_op=?`).run(next?0:1,run,row.pending_op)
  return true
}
