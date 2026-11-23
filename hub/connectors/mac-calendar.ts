import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants, existsSync } from 'node:fs'
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { Problem } from '../runtime/settings.ts'
import type { Store } from '../runtime/store.ts'
import type { ScheduleRow } from '../runtime/workspace.ts'
import type { BusySpan } from '../runtime/availability.ts'
import { isInstant } from '../runtime/values.ts'

const execute = promisify(execFile)
const ttl = 5 * 60_000
export type CalendarTarget = { id: string, name: string, account: string }
export type CalendarProposal = {
  approval: string, expiresAt: number, slot: string, target: CalendarTarget,
  title: string, start: string, end: string,
}
type CalendarReceipt = { calendar_name: string, account: string, state: 'pending' | 'saved' | 'uncertain' }
type Bridge = (request: object) => Promise<Record<string, unknown>>
const isText = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\x00-\x1f\x7f]/.test(value)
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export function macCalendarBridge(bundle: string): Bridge {
  return async request => {
    if (!existsSync(join(bundle, 'Contents', 'MacOS', 'LifePilotCalendar'))) {
      throw new Problem(503, 'Die Kalenderhilfe von LifePilot ist nicht installiert.')
    }
    const dir = await mkdtemp(join(tmpdir(), 'lifepilot-calendar-'))
    try {
      const file = join(dir, 'request.json')
      await writeFile(file, JSON.stringify(request), { flag: 'wx', mode: 0o600 })
      await execute('/usr/bin/open', ['-n', '-W', '-a', bundle, '--args', file], { timeout: 55_000, maxBuffer: 4096 })
      const response = await open(join(dir, 'result.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        const stat = await response.stat()
        if (!stat.isFile() || stat.size < 2 || stat.size > 200_000) throw Error()
        return record(JSON.parse(await response.readFile('utf8')))
      } finally { await response.close() }
    } catch { throw new Problem(502, 'Die Kalenderhilfe hat keine bestätigte Antwort geliefert. Prüfe den Zielkalender.') }
    finally { await rm(dir, { recursive: true, force: true }).catch(() => {}) }
  }
}

export class MacCalendar {
  private readonly invoke: Bridge
  private readonly choices = new Map<string, CalendarTarget>()
  private readonly approvals = new Map<string, CalendarProposal & { revision: number }>()
  private checkedAt = 0

  constructor(invoke: Bridge) { this.invoke = invoke }

  async calendars() {
    this.choices.clear()
    this.approvals.clear()
    this.checkedAt = 0
    const reply = await this.invoke({ operation: 'list' })
    if (reply.error === 'permission') throw new Problem(403, 'Erlaube „LifePilot Kalender“ den Kalenderzugriff in den macOS-Datenschutzeinstellungen.')
    if (reply.ok !== true || !Array.isArray(reply.calendars)) throw new Problem(502, 'Die Kalenderliste konnte nicht geladen werden.')
    for (const raw of reply.calendars.slice(0, 150)) {
      const item = record(raw)
      if (isText(item.id, 256) && isText(item.name, 200) && isText(item.account, 200)) {
        this.choices.set(item.id, { id: item.id, name: item.name, account: item.account })
      }
    }
    this.checkedAt = Date.now()
    return [...this.choices.values()]
  }

  receipt(store: Store, slot: string) {
    return store.db.prepare('SELECT calendar_name,account,state FROM calendar_exports WHERE slot_id=?').get(slot) as CalendarReceipt | undefined
  }

  preferred(store: Store) {
    return store.db.prepare('SELECT id,name,account FROM calendar_target WHERE singleton=1').get() as CalendarTarget | undefined
  }

  async occupied(start: string, end: string): Promise<BusySpan[]> {
    const reply = await this.invoke({ operation: 'busy', start, end })
    if (reply.error === 'permission') throw new Problem(403, 'Lade zuerst die Mac-Kalenderliste, um den Zugriff zu erlauben.')
    if (reply.error === 'range') throw new Problem(400, 'Zu viele Termine. Verkürze den Suchzeitraum.')
    if (reply.ok !== true || !Array.isArray(reply.busy) || reply.busy.length > 2000) {
      throw new Problem(502, 'Belegte Kalenderzeiten konnten nicht geprüft werden.')
    }
    return reply.busy.map(raw => {
      const { at, endsAt } = record(raw)
      if (!isInstant(at) || !isInstant(endsAt) || at >= endsAt) throw new Problem(502, 'Der Mac-Kalender lieferte eine ungültige Zeit.')
      return { at, endsAt }
    })
  }

  private snapshot(store: Store, id: string, target: CalendarTarget) {
    const slot = store.db.prepare("SELECT * FROM schedule WHERE id=? AND kind='slot' AND state='pending'").get(id) as ScheduleRow | undefined
    if (!slot?.ends_at || Date.parse(slot.at) <= Date.now()) throw new Problem(409, 'Wähle einen noch bevorstehenden Zeitblock.')
    const task = store.workspace.get(slot.task_id)
    if (task.status !== 'open') throw new Problem(409, 'Die Aufgabe ist nicht mehr offen.')
    return { slot: id, title: task.title, start: slot.at, end: slot.ends_at, target, revision: task.revision }
  }

  preview(store: Store, slot: string, calendarId?: string): CalendarProposal {
    const target = calendarId === undefined ? this.preferred(store) :
      Date.now() - this.checkedAt <= ttl ? this.choices.get(calendarId) : undefined
    if (!target) throw new Problem(409, 'Lade zuerst die aktuelle Kalenderliste und wähle den Zielkalender.')
    if (this.receipt(store, slot)) throw new Problem(409, 'Für diesen Zeitblock gibt es bereits einen Export. Prüfe den Zielkalender.')
    for (const [id, proposal] of this.approvals) {
      if (proposal.expiresAt <= Date.now() || proposal.slot === slot) this.approvals.delete(id)
    }
    if (this.approvals.size >= 100) throw new Problem(429, 'Zu viele offene Terminfreigaben.')
    const quote = { ...this.snapshot(store, slot, target), approval: randomUUID(), expiresAt: Date.now() + ttl }
    this.approvals.set(quote.approval, quote)
    const { revision: _revision, ...proposal } = quote
    return proposal
  }

  async approve(store: Store, id: string) {
    const quote = this.approvals.get(id)
    this.approvals.delete(id)
    if (!quote || quote.expiresAt <= Date.now()) throw new Problem(409, 'Diese Terminfreigabe ist nicht mehr gültig.')
    store.transaction(() => {
      const current = this.snapshot(store, quote.slot, quote.target)
      if (current.revision !== quote.revision || current.start !== quote.start || current.end !== quote.end || current.title !== quote.title) {
        throw new Problem(409, 'Der Zeitblock wurde geändert. Prüfe einen neuen Vorschlag.')
      }
      const result = store.db.prepare("INSERT OR IGNORE INTO calendar_exports VALUES (?,?,?,'pending',NULL,?)")
        .run(quote.slot, quote.target.name, quote.target.account, new Date().toISOString())
      if (result.changes !== 1) throw new Problem(409, 'Dieser Zeitblock wurde bereits übergeben. Prüfe den Zielkalender.')
    })
    let result: Record<string, unknown>
    try {
      result = await this.invoke({ operation: 'create', calendarId: quote.target.id, calendarName: quote.target.name,
        account: quote.target.account, title: quote.title, start: quote.start, end: quote.end })
    } catch {
      store.db.prepare("UPDATE calendar_exports SET state='uncertain' WHERE slot_id=?").run(quote.slot)
      throw new Problem(502, 'Speicherung unklar. Prüfe zuerst den Zielkalender. LifePilot wiederholt den Auftrag nicht automatisch.')
    }
    if (result.error === 'permission' || result.error === 'targetChanged' || result.error === 'invalid') {
      store.db.prepare('DELETE FROM calendar_exports WHERE slot_id=?').run(quote.slot)
      throw new Problem(409, 'Der Kalender oder Termin ist nicht mehr verfügbar. Lade die Kalenderliste erneut.')
    }
    if (result.ok !== true || !isText(result.eventId, 512)) {
      store.db.prepare("UPDATE calendar_exports SET state='uncertain' WHERE slot_id=?").run(quote.slot)
      throw new Problem(502, 'Speicherung unklar. Prüfe zuerst den Zielkalender. LifePilot wiederholt den Auftrag nicht automatisch.')
    }
    store.transaction(() => {
      store.db.prepare("UPDATE calendar_exports SET state='saved', event_id=? WHERE slot_id=?").run(result.eventId as string, quote.slot)
      store.db.prepare('INSERT OR REPLACE INTO calendar_target VALUES (1,?,?,?)').run(quote.target.id, quote.target.name, quote.target.account)
    })
    return this.receipt(store, quote.slot)
  }
}
