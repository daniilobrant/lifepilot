import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../../../hub/runtime/store.ts'
import { scanInbox, inboxFixtures, listInbox, decideInbox, inboxSuggestion } from '../../../hub/runtime/inbox.ts'

test('Inbox suggestions share decisions across entry points and survive restart without duplicating tasks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lifepilot-inbox-'))
  const database = join(directory, 'memory.sqlite3')
  let store = new Store(database)
  try {
    assert.deepEqual(scanInbox(store, inboxFixtures), { checked: 3, added: 2 })
    assert.equal(store.workspace.list().length, 0)
    const proposals = listInbox(store)
    const deadline = proposals.find(item => item.category === 'deadlines')!
    const retoure = proposals.find(item => item.category === 'returns')!
    assert.equal(deadline.due_date, '2026-11-30')
    assert.equal(retoure.due_date, '2026-12-04')
    decideInbox(store, deadline.id, 'accept', 'cli')
    decideInbox(store, retoure.id, 'deny', 'ui')
    store.db.close()
    store = new Store(database)
    assert.deepEqual(scanInbox(store, inboxFixtures), { checked: 3, added: 0 })
    assert.throws(() => decideInbox(store, deadline.id, 'accept', 'ui'), { status: 409 })
    assert.throws(() => decideInbox(store, retoure.id, 'accept', 'cli'), { status: 409 })
    assert.equal(store.workspace.list().length, 1)
    assert.equal(store.workspace.list()[0].due_date, deadline.due_date)
  } finally { store.db.close(); rmSync(directory, { recursive: true, force: true }) }
})

test('Uncertain dates stay unset and quoted instructions do not supply a deadline', () => {
  const mail = inboxFixtures[0]
  assert.equal(inboxSuggestion({ ...mail, text: 'Abgabe bis nächsten Freitag' })?.date, null)
  assert.equal(inboxSuggestion({ ...mail, text: '> Abgabe bis 31.12.2026\nAbgabe bitte prüfen.' })?.date, null)
  assert.equal(inboxSuggestion({ ...mail, text: 'Abgabe bis 30.11.2026 oder bis 04.12.2026' })?.date, null)
})

test('Page progress is persisted per mailbox and removed when the last page is processed', async () => {
  const { readGmailPage } = await import('../../../hub/runtime/inbox.ts')
  const store = new Store(':memory:')
  try {
    const next = { pageToken: 'next-page', afterEpoch: 123 }
    scanInbox(store, inboxFixtures, { account: 'mailbox-one', next })
    assert.deepEqual({ ...readGmailPage(store, 'mailbox-one') }, next)
    assert.equal(readGmailPage(store, 'mailbox-two'), undefined)
    scanInbox(store, [], { account: 'mailbox-one', next: null })
    assert.equal(readGmailPage(store, 'mailbox-one'), undefined)
  } finally { store.db.close() }
})
