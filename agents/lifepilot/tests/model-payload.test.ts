import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runCodex } from '../../../hub/adapters/codex.ts'
import { MAX_CHAT_INPUT, type ModelPayload } from '../../../hub/runtime/model-payload.ts'

const payload: ModelPayload = {
  day: '2026-11-20', timeZone: 'Europe/Berlin',
  messages: [{ input: 'Synthetische Testnotiz', referenceDay: '2026-11-20' }], memory: [], context: [],
}

test('Oversized transport payload is rejected before invoking Codex', async () => {
  const oversized = { ...payload, messages: [{ ...payload.messages[0], input: 'ä'.repeat(MAX_CHAT_INPUT+1) }] }
  const result = await runCodex(oversized, new AbortController().signal)
  assert.equal(result.result, null)
  assert.match(result.error ?? '', /Analysekontext ist zu groß/)
})

test('Aborted transport is rejected before invoking Codex', async () => {
  const result = await runCodex(payload, AbortSignal.abort())
  assert.equal(result.result, null)
  assert.match(result.error ?? '', /abgebrochen/)
})
