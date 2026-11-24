import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runCodex } from '../../../hub/adapters/codex.ts'
import { runLocalModel } from '../../../hub/adapters/local-model.ts'
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

test('Travel intake instructions are sent as system guidance by the local chat adapter', async () => {
  let systemPrompt: string | undefined
  let userMessage: string | undefined
  await runLocalModel(payload, new AbortController().signal, async (_url, init) => {
    const { messages } = JSON.parse(String(init?.body))
    systemPrompt = messages.find((message: { role: string }) => message.role === 'system')?.content
    userMessage = messages.find((message: { role: string }) => message.role === 'user')?.content
    return new Response(null, { status: 503 })
  })
  assert.match(systemPrompt ?? '', /## Reiseaufträge im Chat/)
  assert.match(systemPrompt ?? '', /Unterstelle keine Arbeitstage oder Buchungen/)
  assert.doesNotMatch(systemPrompt ?? '', /Synthetische Testnotiz/)
  assert.match(userMessage ?? '', /Synthetische Testnotiz/)
})

test('Codex rejects synthetic payloads before processing the prompt', async () => {
  const result = await runCodex(payload, new AbortController().signal)
  assert.equal(result.result, null)
  assert.equal(result.metrics.model, null)
  assert.match(result.error ?? '', /synthetische Aufträge gesperrt/)
})
