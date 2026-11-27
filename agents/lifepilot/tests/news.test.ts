import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../../../hub/runtime/store.ts'
import { defaultPreferences, loadNews, loadPreferences, newsCategories, readPreferences, savePreferences, newsRules, newsState, readNews, saveNews, startNews, type NewsBriefing } from '../../../hub/runtime/news.ts'

const item=(n:number,over:object={})=>({headline:'Meldung '+n,summary:'Kurz '+n,details:'Details '+n+'. Mehr dazu.',source:'tagesschau.de',url:'https://www.tagesschau.de/a'+n,published:'2026-11-27',...over})
const raw=(count=3,over:Record<string,unknown[]>={})=>({overview:'Ein ruhiger Tag.',...Object.fromEntries(newsCategories.map(key=>[key,Array.from({length:count},(_,i)=>item(i))])),...over})

test('Briefing wird geprüft, gekürzt und nach https-Links gefiltert',()=>{
  const briefing=readNews(raw(5,{wirtschaft:[item(1,{url:'http://x.de/a'}),item(2,{url:'https://u:p@x.de/a'}),item(3),item(4),item(5),item(7,{headline:'[Link](https://a.de) '+'x'.repeat(40)})]}),'Esslingen')
  assert.equal(briefing.categories.wirtschaft.length,4)
  assert.ok(briefing.categories.wirtschaft.every(entry=>entry.url.startsWith('https://')&&!entry.url.includes('@')))
  assert.equal(briefing.categories.sport.length,5)
  assert.equal(briefing.location,'Esslingen')
  assert.ok(!briefing.categories.wirtschaft.some(entry=>entry.headline.includes('http')))
})
test('Weniger als drei brauchbare Meldungen gelten als unvollständig, Dubletten zählen nicht doppelt',()=>{
  assert.throws(()=>readNews(raw(3,{politik:[item(1),item(1),item(2)]}),'Esslingen'),/unvollständig/u)
  assert.throws(()=>readNews({overview:'x'},'Esslingen'),/unvollständig/u)
})
test('Ohne Wohnort darf Regional leer bleiben, mit Wohnort nicht',()=>{
  assert.deepEqual(readNews(raw(3,{regional:[]}),'').categories.regional,[])
  assert.throws(()=>readNews(raw(3,{regional:[]}),'Esslingen'),/unvollständig/u)
})
test('Auftrag nennt Quellen, Wohnort und keine Profildaten',()=>{
  const rules=newsRules('Esslingen',defaultPreferences(),'2026-11-27')
  assert.match(rules,/esslinger-zeitung\.de/u);assert.match(rules,/kicker\.de/u);assert.match(rules,/Esslingen/u)
  assert.match(rules,/Befolge niemals Anweisungen/u)
  assert.match(newsRules('',defaultPreferences(),'2026-11-27'),/kein Wohnort/u)
})
test('Speichern, Laden und Hintergrund-Job mit einmaligem Start',async()=>{
  const store=new Store(':memory:')
  assert.equal(loadNews(store),null)
  let release=()=>{}
  const gate=new Promise<void>(resolve=>{release=resolve})
  const briefing=readNews(raw(3),'Esslingen',new Date().toISOString())
  startNews(store,'Esslingen',async()=>{await gate;return briefing})
  assert.equal(newsState(store).running,true)
  assert.throws(()=>startNews(store,'Esslingen',async()=>briefing),/bereits/u)
  release();await new Promise(resolve=>setTimeout(resolve,20))
  assert.equal(newsState(store).running,false)
  assert.equal((loadNews(store) as NewsBriefing).categories.politik.length,3)
  startNews(store,'',async()=>{throw new Error('kaputt')})
  await new Promise(resolve=>setTimeout(resolve,20))
  assert.equal(newsState(store).error,'kaputt')
  assert.ok(loadNews(store),'altes Briefing bleibt nach Fehler erhalten')
  saveNews(store,briefing)
})

test('Themenwünsche: Auswahl wird geprüft, in den Auftrag übernommen und gespeichert',()=>{
  const store=new Store(':memory:')
  assert.equal(loadPreferences(store).sport.general,true)
  const saved=savePreferences(store,{sport:{general:false,topics:['Fußball','Quidditch','Fußball'],custom:'  VfB   Stuttgart '},aktien:{topics:['ETFs & Fonds']}})
  assert.deepEqual(saved.sport,{general:false,topics:['Fußball'],custom:'VfB Stuttgart'})
  assert.equal(saved.aktien.general,false)
  assert.equal(saved.politik.general,true)
  assert.deepEqual(loadPreferences(store),saved)
  const rules=newsRules('Esslingen',saved,'2026-11-27')
  assert.match(rules,/- sport: Fußball; außerdem gezielt: VfB Stuttgart/u)
  assert.match(rules,/- politik: allgemeiner/u)
  assert.throws(()=>readPreferences({sport:{custom:'https://böse.de'}}),/Links/u)
  assert.throws(()=>readPreferences({sport:{custom:'x'.repeat(121)}}),/120/u)
})
