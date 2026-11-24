import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runCodex } from '../../../hub/adapters/codex.ts'
import { parseImageGarment, parseImageNames } from '../../../hub/adapters/codex-image.ts'
import { MAX_CHAT_INPUT, type ModelPayload } from '../../../hub/runtime/model-payload.ts'

const payload: ModelPayload = {
  day: '2026-11-20', timeZone: 'Europe/Berlin',
  messages: [{ input: 'Synthetische Testnotiz', referenceDay: '2026-11-20' }], memory: [], context: [],
}

test('Oversized transport payload is rejected before invoking Codex', async () => {
  const oversized = { ...payload, messages: [{ ...payload.messages[0], input: 'ä'.repeat(MAX_CHAT_INPUT+1) }] }
  const result = await runCodex({ ...oversized, mode: 'personal' }, new AbortController().signal)
  assert.equal(result.result, null)
  assert.match(result.error ?? '', /Analysekontext ist zu groß/)
})

test('Aborted transport is rejected before invoking Codex', async () => {
  const result = await runCodex({ ...payload, mode: 'personal' }, AbortSignal.abort())
  assert.equal(result.result, null)
  assert.match(result.error ?? '', /abgebrochen/)
})

test('Codex rejects synthetic payloads before processing the prompt', async () => {
  const result = await runCodex(payload, new AbortController().signal)
  assert.equal(result.result, null)
  assert.equal(result.metrics.model, null)
  assert.match(result.error ?? '', /synthetische Aufträge gesperrt/)
})

test('Codex image proposals only keep bounded names and permitted garment fields', () => {
  assert.deepEqual(parseImageNames({items:[' Milch ', 'Milch', 5, '\u0000Test', 'x'.repeat(121)]}), ['Milch'])
  assert.deepEqual(parseImageGarment({name:' Bluse ', category:'top', brand:'', ignored:'text'}), {name:'Bluse',category:'top'})
  assert.deepEqual(parseImageGarment({name:'x'.repeat(121), category:'unknown'}), {})
})
