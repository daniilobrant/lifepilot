import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../../../hub/runtime/store.ts'
import { personalProfile, savePersonalProfile } from '../../../hub/runtime/personal-profile.ts'
import { explicitCategory, suggestCategory } from '../../../hub/runtime/categories.ts'

test('Profile updates are bound to a revision and remain outside model payloads', () => {
  const store = new Store(':memory:', 'private')
  try {
    assert.equal(personalProfile(store).revision,0)
    const saved=savePersonalProfile(store,{name:' Testname ',height:'175',birthday:'2001-02-01',interests:'Volleyball'},0)
    assert.equal(saved.fields.name,'Testname')
    assert.equal(saved.revision,1)
    assert.throws(()=>savePersonalProfile(store,{name:'Veraltet'},0),{status:409})
    assert.throws(()=>savePersonalProfile(store,{birthday:'2100-01-01'},1),{status:400})
    assert.throws(()=>savePersonalProfile(store,{height:'1'},1),{status:400})
    const run=store.create('Hallo','lifepilot','profile-example','ui')
    assert.equal(run.state,'queued')
    assert.ok(!JSON.stringify(store.next()?.payload).includes('Testname'))
  } finally {store.db.close()}
})

test('Clear contexts identify work, university and leisure while mixed contexts remain open', () => {
  assert.equal(suggestCategory('Kundentermin','Budget sprechen'), 'work')
  assert.equal(suggestCategory('Seminar','Folien vorbereiten'), 'university')
  assert.equal(suggestCategory('Volleyball','Training'), 'leisure')
  assert.equal(suggestCategory('B2B-Projekt','Sprechpart überarbeiten'), null)
  assert.equal(suggestCategory('Job und Uni','Besprechen'), null)
  assert.equal(explicitCategory('Kategorie: Freizeit'), 'leisure')
})
