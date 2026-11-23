import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../../../hub/runtime/store.ts'
import type { GoogleConnector, MailContent } from '../../../hub/connectors/google.ts'
import { inboxPlans, readInboxFeed, refreshInbox } from '../../../hub/runtime/refresh-inbox.ts'
import { decideInbox, listInbox, readGmailPage, scanInbox } from '../../../hub/runtime/inbox.ts'
import { berlinInstant } from '../tools/validate.ts'
import { classifyMail, automaticLabelCategory } from '../tools/classify-mail.ts'

const mail = (id: string, subject: string, text: string): MailContent =>
  ({ id, subject, text, from: 'Fiktives Testkonto', at: null, truncated: false, dates: [] })

test('Unified refresh retries a partially failed label page, advances progress and does not duplicate proposals', async () => {
  const store = new Store(':memory:')
  const batches = [mail('1','Bestellbestätigung','Deine Bestellung.'), mail('2','Deine Retoure','Bitte die Rücksendung bis 30.11.2026 abgeben.')]
  const seen: (string | undefined)[] = []
  let fail = true
  const mock = {
    status: () => [{ service: 'gmail-sort', connected: true }],
    recentInbox: async (cursor: (account: string) => { pageToken: string } | undefined) => {
      const current = cursor('account')?.pageToken
      seen.push(current)
      return { account: 'account', mails: [batches[current ? 1 : 0]], next: current ? null : { pageToken: 'next', afterEpoch: 123 } }
    },
    sortInboxPage: async () => { if (fail) throw Error('Gmail vorübergehend nicht verfügbar.'); return 1 },
  } as unknown as GoogleConnector
  try {
    const first = await refreshInbox(store, mock, false)
    assert.equal(first.labelError, 'Gmail vorübergehend nicht verfügbar.')
    assert.equal(first.added, 1)
    assert.equal(readGmailPage(store, 'account'), undefined)
    fail = false
    const next = await refreshInbox(store, mock, false)
    assert.deepEqual(seen, [undefined, undefined, 'next'])
    assert.equal(next.labeled, 2)
    assert.equal(next.added, 1)
    assert.equal(listInbox(store).length, 2)
  } finally { store.db.close() }
})

test('Returned and dispatched items do not create a pending return task', () => {
  const store = new Store(':memory:')
  try {
    for (const [subject, state] of [['Deine Retoure ist angekommen','return-closed'], ['Deine Rücksendung ist unterwegs','return-in-transit']] as const) {
      const item = mail(subject, subject, 'Auftragsdetails.')
      assert.equal(classifyMail(item).shipment, state)
      assert.equal(scanInbox(store,[item]).added, 0)
    }
    const weak = mail('weak','Gutscheine der Woche','Kostenlose Lieferung.')
    assert.equal(automaticLabelCategory(weak),null)
  } finally { store.db.close() }
})

test('Refresh proposes a slot ahead of a mail deadline, respects busy times and adopts atomically', () => {
  const store = new Store(':memory:')
  try {
    const now = Date.parse('2090-10-14T06:00:00.000Z')
    scanInbox(store, [mail('return','Deine Retoure','Bitte die Rücksendung bis 16.10.2090 abgeben.')])
    const [item] = listInbox(store)
    const at = (time: string) => berlinInstant('2090-10-14T' + time)
    const [slot] = inboxPlans(store, [{ at: at('09:00'), endsAt: at('10:00') }], now)
    assert.equal(slot.at, at('10:00'))
    assert.equal(store.workspace.schedule().length,0)
    const saved = decideInbox(store,item.id,'accept','ui',slot)
    assert.equal(store.workspace.schedule()[0].id,saved.slotId)
    assert.equal(store.workspace.get(saved.taskId!).due_date,'2090-10-16')
    assert.throws(() => decideInbox(store,item.id,'accept','cli',slot),{status:409})
    assert.equal(store.workspace.schedule().length,1)
  } finally { store.db.close() }
})

test('Inbox feed excludes newsletters, suspected spam, job ads and weak orders, but keeps applications and orders', async () => {
  const rows = [
    mail('ad','Newsletter · Wochenangebote','Bitte bestätige.'),
    mail('junk','Sie haben gewonnen','Bitte Passwort eingeben.'),
    mail('jobs','Stellenanzeige','Sende eine Bewerbung.'),
    mail('weak','Gutscheine der Woche','Kostenlose Lieferung.'),
    mail('order','Versandbestätigung','Das Paket wurde verschickt.'),
    mail('job','Application update','We would like to invite you to an interview.'),
  ]
  const google = {recentInbox:async () => ({account:'same',mails:rows,next:null})} as unknown as GoogleConnector
  const feed = await readInboxFeed(google,false)
  assert.deepEqual(feed.messages.map(item => item.id),['job','order'])
  assert.ok(feed.messages.every(item => !Object.hasOwn(item,'text')))
})
