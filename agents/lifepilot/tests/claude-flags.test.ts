import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFlags } from '../../../hub/adapters/claude.ts'

test('CLI-Optionen mit Großbuchstaben werden erkannt (Websuche braucht --allowedTools)', () => {
  const flags = parseFlags('  --allowedTools, --allowed-tools <tools>  x\n  --tools <tools>\n  --json-schema <schema>\n  --max-turns <n>')
  for (const name of ['--allowedTools', '--tools', '--json-schema', '--max-turns']) assert.ok(flags.has(name), name)
})
