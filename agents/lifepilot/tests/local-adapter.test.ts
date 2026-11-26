import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { adapterToken } from '../../../hub/runtime/local-adapter.ts'

test('Adapter keys have a private regular file and keep their identity across starts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lifepilot-key-test-'))
  try {
    const path = join(directory, 'key')
    const key = adapterToken(path, true)
    assert.match(key, /^[A-Za-z0-9_-]{43}$/u)
    assert.equal(adapterToken(path, true), key)
    symlinkSync(path, join(directory, 'link'))
    assert.throws(() => adapterToken(join(directory, 'link')))
    chmodSync(path, 0o644)
    assert.throws(() => adapterToken(path))
    chmodSync(path, 0o600)
    writeFileSync(path, '')
    assert.throws(() => adapterToken(path, true))
  } finally { rmSync(directory, { recursive:true, force:true }) }
})
