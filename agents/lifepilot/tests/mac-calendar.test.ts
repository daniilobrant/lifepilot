import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../../../hub/runtime/store.ts'
import { MacCalendar } from '../../../hub/connectors/mac-calendar.ts'
import { availability } from '../../../hub/runtime/availability.ts'
import { dateInBerlin, shiftDay } from '../../../hub/runtime/values.ts'
import { berlinInstant } from '../tools/validate.ts'

test('Calendar preview binds the event and writes just once after confirmation', async () => {
  const store = new Store(':memory:')
  const target = { id: 'target', name: 'Kalender-Test', account: 'Testkonto' }
  const writes: object[] = []
  const calendar = new MacCalendar(async request => {
    if ('operation' in request && request.operation === 'list') return { ok: true, calendars: [target] }
    writes.push(request)
    return { ok: true, eventId: 'event-1' }
  })
  try {
    const day = shiftDay(dateInBerlin(), 5)
    const task = store.workspace.add(null, { title: 'LifePilot Testtermin', kind: 'appointment', date: day, detail: '' }, 'cli')
    const start = berlinInstant(day + 'T09:00')
    const end = berlinInstant(day + 'T09:30')
    const slot = store.workspace.addSchedule(task.id, 'slot', start, end, 'ui')
    assert.throws(() => calendar.preview(store, slot.id, target.id), { status: 409 })
    assert.deepEqual(await calendar.calendars(), [target])
    const proposal = calendar.preview(store, slot.id, target.id)
    assert.deepEqual(proposal.target, target)
    assert.equal(writes.length, 0)
    assert.equal((await calendar.approve(store, proposal.approval))?.state, 'saved')
    assert.deepEqual(writes, [{ operation: 'create', calendarId: target.id, calendarName: target.name,
      account: target.account, start, end, title: task.title }])
    await assert.rejects(() => calendar.approve(store, proposal.approval), { status: 409 })
    assert.throws(() => calendar.preview(store, slot.id), { status: 409 })
    assert.deepEqual({ ...calendar.preferred(store) }, target)
    assert.equal(writes.length, 1)
  } finally { store.db.close() }
})

test('Calendar occupancy excludes conflicts and fails closed on revoked access', async () => {
  const store = new Store(':memory:')
  const date = shiftDay(dateInBerlin(), 5)
  const at = (time: string) => berlinInstant(date + 'T' + time)
  let access = true
  const connector = new MacCalendar(async () => access ?
    { ok: true, busy: [{ at: at('10:00'), endsAt: at('11:00') }] } : { error: 'permission' })
  try {
    const busy = await connector.occupied(at('09:00'), at('13:00'))
    const result = availability(store.workspace, { date, days: 1, start: '09:00', end: '13:00', minutes: 60 }, 0, busy)
    assert.deepEqual(result.windows.map(window => window.at), [at('09:00'), at('11:00')])
    access = false
    await assert.rejects(() => connector.occupied(at('09:00'), at('13:00')), { status: 403 })
  } finally { store.db.close() }
})
