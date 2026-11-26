import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Store} from '../../../hub/runtime/store.ts'
import {labelOverrides} from '../../../hub/runtime/refresh-inbox.ts'

test('geänderte Mail-Kategorien werden je Konto gespeichert und unbekannte Kategorien ignoriert',()=>{
  const store=new Store(':memory:','private')
  const save=store.db.prepare('INSERT INTO mail_label_overrides (account,message_id,label,changed_at) VALUES (?,?,?,?)')
  save.run('a@example.org','m1','travel','2026-11-26T10:00:00Z')
  save.run('a@example.org','m2','gibt-es-nicht','2026-11-26T10:00:00Z')
  save.run('b@example.org','m1','finance','2026-11-26T10:00:00Z')
  assert.deepEqual([...labelOverrides(store,'a@example.org')],[['m1','travel']])
  assert.deepEqual([...labelOverrides(store,'b@example.org')],[['m1','finance']])
})
