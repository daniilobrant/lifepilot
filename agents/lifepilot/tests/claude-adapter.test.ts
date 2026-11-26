import {test} from 'node:test'
import assert from 'node:assert/strict'
import {jsonFromText} from '../../../hub/adapters/claude.ts'

test('Claude answers are read as JSON with or without a code fence',()=>{
  assert.deepEqual(jsonFromText('{"tasks":[]}'),{tasks:[]})
  assert.deepEqual(jsonFromText('Hier ist das Ergebnis:\n```json\n{"summary":"ok"}\n```'),{summary:'ok'})
  assert.deepEqual(jsonFromText('Kurz: {"questions":["Welche?"]} Ende'),{questions:['Welche?']})
  assert.throws(()=>jsonFromText('keine Antwort'))
})
