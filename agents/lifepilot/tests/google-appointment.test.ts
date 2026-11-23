import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Store } from '../../../hub/runtime/store.ts'
import { dateInBerlin, shiftDay } from '../../../hub/runtime/values.ts'
import { finishAppointmentChange, queueAppointmentChange, syncApprovedAppointment } from '../../../hub/runtime/google-appointment.ts'
import { verifyOutput, type Result } from '../tools/validate.ts'

const metrics = { wallMs: 1, model: null, usage: null, cost: null }
function example(day: string): Result {
  return { skill: 'appointment', tasks: [{ title: 'Bachelorarbeit', doneWhen: 'Besprechung', evidence: 'Bachelorarbeit',
    kind: 'appointment', date: day, blocks: [{ start: day+'T15:10', minutes: 35, weeks: 1 }] }], questions: [] }
}

test('Tool routing cannot hide a write, and a timed appointment requires a single complete block', () => {
  const result = example('2090-10-14')
  assert.throws(() => verifyOutput({ ...result, skill: 'inbox_refresh' }, 'Bachelorarbeit'), /Mail-Durchlauf/)
  assert.throws(() => verifyOutput({ ...result, tasks: [{ ...result.tasks[0], blocks: [] }] }, 'Bachelorarbeit'), /Uhrzeit/)
  assert.throws(() => verifyOutput({ ...result, questions: ['Wann beginnt der Termin?'] }, 'Bachelorarbeit'), /Rückfrage/)
  assert.equal(verifyOutput({ skill: 'appointment', tasks: [], questions: ['Wann beginnt der Termin?'] }, 'Bachelorarbeit').skill, 'appointment')
})

test('One approved appointment saves locally, survives Google failure and retries the same slot', async () => {
  const store = new Store(':memory:', 'private')
  try {
    const day = shiftDay(dateInBerlin(), 5)
    const run = store.create('Bachelorarbeit '+day+' um 15:10 Uhr, 35 Minuten', 'lifepilot', randomUUID(), 'ui')
    assert.equal(run.state, 'queued')
    assert.ok(store.next())
    store.finish(run.id, example(day), null, metrics)
    assert.equal(store.workspace.list().length,0)
    const adopt = store.present(store.run(run.id)).approvals.find(item => item.action === 'adopt')!
    const accepted = store.decide(run.id, String(adopt.id), 'approve', 'ui', true)
    assert.equal(accepted.googleSync,'pending')
    assert.equal(store.workspace.list().length,1)
    assert.equal(store.workspace.schedule().length,1)
    const [slot] = store.workspace.schedule()
    let count = 0
    const google = { syncAppointment: async (id: string, title: string, start: string, end: string) => {
      assert.equal(id,slot.id)
      assert.equal(title,'Bachelorarbeit')
      if (++count === 1) throw Error('Google nicht erreichbar')
      return { event:'confirmed-event', calendar:'fixture', title, start, end }
    } }
    await assert.rejects(() => syncApprovedAppointment(store,google,run.id), /Google nicht erreichbar/)
    assert.equal(store.present(store.run(run.id)).googleSync,'pending')
    assert.equal(await syncApprovedAppointment(store,google,run.id),'confirmed-event')
    assert.equal(await syncApprovedAppointment(store,google,run.id),'confirmed-event')
    assert.equal(count,2)
    assert.equal(store.present(store.run(run.id)).googleSync,'saved')
    store.db.prepare("INSERT INTO google_lifepilot_calendar VALUES (1,'fixture-calendar')").run()
    const old = store.workspace.schedule()[0]
    const start = new Date(Date.parse(old.at)+3600000).toISOString()
    const end = new Date(Date.parse(old.ends_at!)+3600000).toISOString()
    queueAppointmentChange(store,run.id,'cli',{title:'Bachelorarbeit verschoben',start,end,day})
    const remoteChanges: ('update' | 'remove')[] = []
    const remote = { changeAppointment: async (calendar: string,eventId: string,
      previous: {title:string,start:string,end:string}, next: {title:string,start:string,end:string} | null) => {
      assert.equal(calendar,'fixture-calendar')
      assert.equal(eventId,'confirmed-event')
      assert.equal(previous.title,next?'Bachelorarbeit':'Bachelorarbeit verschoben')
      remoteChanges.push(next?'update':'remove')
    } }
    assert.equal(store.present(store.run(run.id)).googleSync,'pending')
    assert.equal(store.workspace.schedule()[0].at,start)
    assert.equal(await finishAppointmentChange(store,remote,run.id),true)
    queueAppointmentChange(store,run.id,'ui',null)
    assert.equal(store.workspace.list().length,0)
    assert.equal(await finishAppointmentChange(store,remote,run.id),true)
    assert.deepEqual(remoteChanges,['update','remove'])
    assert.equal(await finishAppointmentChange(store,remote,run.id),false)
    assert.equal(store.present(store.run(run.id)).googleSync,'removed')
  } finally { store.db.close() }
})
