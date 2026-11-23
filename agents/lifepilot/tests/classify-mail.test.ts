import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyMail } from '../tools/classify-mail.ts'
import { mailDemoFixtures } from '../../../hub/runtime/inbox.ts'

test('Spam-heavy evaluation inbox identifies seven categories, the important mails and an answer request', () => {
  const cases = [
    ['uni-abgabe', 'university', true, false],
    ['retoure', 'orders', true, false],
    ['info', 'volleyball', false, false],
    ['application-update', 'applications', true, true],
    ['list', 'newsletter', false, false],
    ['suspicious', 'spam', false, false],
    ['order', 'orders', false, false],
    ['job', 'jobs', false, false],
    ['work', 'work', true, true],
  ]
  assert.deepEqual(mailDemoFixtures.map(mail => {
    const { id, category, important, reply } = classifyMail(mail)
    return [id, category, important, reply]
  }), cases)
})

test('Uncertain topics stay open, old quoted questions do not count and a legitimate no-reply deadline can be important', () => {
  function check(subject: string, text: string, from = 'Person', mailingList = false) {
    return classifyMail({ id: 'mail', subject, text, from, mailingList })
  }
  assert.equal(check('Hallo', '> Kannst du die Zahlen prüfen?').reply, false)
  assert.equal(check('Hallo', 'Vielen Dank!').category, null)
  assert.equal(check('Rückfrage', 'Kannst du heute anrufen?').reply, true)
  assert.equal(check('Kurs · Abgabefrist', 'Frist ist am 30.11.2026.', 'no-reply@uni.example').important, true)
  assert.equal(check('Newsletter · Universität', 'Bitte bestätige die nächste Ausgabe.', 'Liste', true).important, false)
  assert.equal(check('Retoure', 'Zahlungsdaten eingeben und Passwort bestätigen.').category, 'spam')
  assert.equal(check('Bestellung', 'Wünscht du eine Rückmeldung?', 'no-reply@shop.example').reply, false)
})

test('Promotional subjects override incidental shipping terms while a return remains transactional', () => {
  const mail = { id: 'm', from: 'shop' }
  assert.equal(classifyMail({ ...mail, subject: 'Letzter Tag: Black Friday Deals', text: 'Kostenlose Lieferung.' }).category, 'newsletter')
  assert.equal(classifyMail({ ...mail, subject: 'Deine Retoure ist angekommen', text: 'Die Gutschrift folgt.' }).category, 'orders')
})
