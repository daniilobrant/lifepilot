import { berlinInstant } from '../../agents/lifepilot/tools/validate.ts'
import { Problem } from './settings.ts'
import { isDate, shiftDay } from './values.ts'
import type { Workspace } from './workspace.ts'

export type FreeQuery = { date: string, days: number, start: string, end: string, minutes: number }
export type FreeWindow = { at: string, endsAt: string, day: string }
export type BusySpan = { at: string, endsAt: string }
export type FreePlan = { query: FreeQuery, windows: FreeWindow[], datesWithUntimedAppointments: string[] }

const quarterHour = 15 * 60_000
const localClock = /^(?:[01]\d|2[0-3]):[0-5]\d$/

export function validateFreeQuery(query: FreeQuery) {
  if (!isDate(query.date) || query.date < '2000-01-03' || query.date > '9998-12-31' ||
      !Number.isInteger(query.days) || query.days < 1 || query.days > 7 ||
      !localClock.test(query.start) || !localClock.test(query.end) || query.start >= query.end ||
      !Number.isInteger(query.minutes) || query.minutes < 15 || query.minutes > 480) {
    throw new Problem(400, 'Wähle ein gültiges Startdatum, 1 bis 7 Tage, einen Zeitrahmen und 15 bis 480 Minuten.')
  }
  return query
}

export function availability(workspace: Workspace, query: FreeQuery, now = Date.now(), extraBusy: BusySpan[] = []): FreePlan {
  validateFreeQuery(query)
  const windows: FreeWindow[] = []
  const datesWithUntimedAppointments: string[] = []
  const duration = query.minutes * 60_000

  for (let offset = 0; offset < query.days; offset++) {
    const day = shiftDay(query.date, offset)
    let start, end
    try {
      start = berlinInstant(day + 'T' + query.start)
      end = berlinInstant(day + 'T' + query.end)
    } catch {
      throw new Problem(400, 'Der Zeitrahmen ist an einem Tag wegen der Zeitumstellung mehrdeutig oder ungültig.')
    }
    const cutoff = Date.parse(end)
    const first = Math.max(Date.parse(start), Math.ceil((now + 1) / quarterHour) * quarterHour)
    if (first >= cutoff) continue
    const fromDay = berlinInstant(day + 'T00:00')
    const toDay = berlinInstant(shiftDay(day, 1) + 'T00:00')
    if (workspace.hasUntimedAppointment(day, fromDay, toDay)) datesWithUntimedAppointments.push(day)
    const firstInstant = new Date(first).toISOString()
    const busy = [...workspace.busySpans(firstInstant, end),
      ...extraBusy.filter(item => item.at < end && item.endsAt > firstInstant)]
      .sort((a, b) => a.at.localeCompare(b.at))

    let cursor = first
    function offer(before: number) {
      const finish = cursor + duration
      if (finish <= before && windows.length < 28) {
        windows.push({ day, at: new Date(cursor).toISOString(), endsAt: new Date(finish).toISOString() })
      }
    }
    for (const block of busy) {
      offer(Date.parse(block.at))
      cursor = Math.max(cursor, Date.parse(block.endsAt))
    }
    offer(cutoff)
  }
  return { query, windows, datesWithUntimedAppointments }
}
