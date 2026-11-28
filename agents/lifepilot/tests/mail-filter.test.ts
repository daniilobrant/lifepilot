import test from 'node:test'
import assert from 'node:assert/strict'
import { isPersonMail } from '../../../hub/ui/mail-filter.ts'

test('Wichtige Nachrichten zeigen nur echte Personen', () => {
  assert.equal(isPersonMail({ label: 'personal', from: 'Max Mustermann <max.mustermann@mail.example>' }), true)
  assert.equal(isPersonMail({ label: 'university', from: 'Prof. Weber <weber@hs-beispiel.de>' }), true)
  assert.equal(isPersonMail({ label: 'finance', from: 'PayPal <service@paypal.de>' }), false)
  assert.equal(isPersonMail({ label: 'personal', from: 'PayPal <service@paypal.de>' }), false)
  assert.equal(isPersonMail({ label: 'personal', from: 'Shop <no-reply@shop.example>' }), false)
  assert.equal(isPersonMail({ label: 'orders', from: 'Anna <anna@mail.example>' }), false)
  assert.equal(isPersonMail({ label: 'work', from: 'Chef <chef@firma.de>', shipment: 'order' }), false)
})
