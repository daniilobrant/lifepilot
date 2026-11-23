import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availability } from '../../../hub/runtime/availability.ts'
import { Store } from '../../../hub/runtime/store.ts'
import { berlinInstant } from '../tools/validate.ts'
import { dateInBerlin, shiftDay } from '../../../hub/runtime/values.ts'

test('Free windows exclude overlaps, ignore reminders and report untimed appointments', () => {
  const store = new Store(':memory:')
  try {
    const day = shiftDay(dateInBerlin(), 10)
    const named = store.workspace.add(null, { title: 'Volleyball', kind: 'appointment', date: day, detail: 'Training' }, 'ui')
    const early = store.workspace.add(null, { title: 'Vorbereitung', kind: 'task', date: null, detail: 'Arbeitsblock' }, 'ui')
    store.workspace.add(null, { title: 'Kaffee mit Freunden', kind: 'appointment', date: day, detail: 'Uhrzeit noch offen' }, 'ui')
    const at = (time: string) => berlinInstant(day + 'T' + time)
    store.workspace.addSchedule(named.id, 'slot', at('11:00'), at('12:30'), 'ui')
    store.workspace.addSchedule(early.id, 'slot', at('08:30'), at('09:30'), 'ui')
    store.workspace.addSchedule(early.id, 'reminder', at('13:00'), null, 'ui')
    const plan = availability(store.workspace, { date: day, days: 1, start: '09:00', end: '14:00', minutes: 60 })
    assert.deepEqual(plan.windows.map(item => [item.at, item.endsAt]), [[at('09:30'), at('10:30')], [at('12:30'), at('13:30')]])
    assert.deepEqual(plan.datesWithUntimedAppointments, [day])
    const later = availability(store.workspace, { date: day, days: 1, start: '09:00', end: '14:00', minutes: 60 }, Date.parse(at('12:31')))
    assert.deepEqual(later.windows.map(item => item.at), [at('12:45')])
    assert.equal(store.workspace.schedule().length, 3)
  } finally { store.db.close() }
})

test('Free time rejects invalid and ambiguous times', () => {
  const store = new Store(':memory:')
  try {
    const query = { date: '2030-10-27', days: 1, start: '02:00', end: '04:00', minutes: 60 }
    assert.throws(() => availability(store.workspace, query, 0), { status: 400 })
    assert.throws(() => availability(store.workspace, { ...query, minutes: 14 }, 0), { status: 400 })
  } finally { store.db.close() }
})
