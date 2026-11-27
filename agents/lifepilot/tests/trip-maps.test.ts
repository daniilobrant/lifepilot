import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Store } from '../../../hub/runtime/store.ts'
import { loadMapState, saveMapState } from '../../../hub/runtime/trip-maps-store.ts'
import { buildExport, categorize, collectPlaces, defaultMapName, destinationFlag, emptyMapState, isSelected, kml, safeCell, zip } from '../../../hub/runtime/trip-maps.ts'
import type { TripPlan } from '../../../hub/runtime/trip-types.ts'

const plan={format:1,draft:{destination:'Barcelona, Spanien',departure:'Stuttgart',start:'2026-11-10',end:'2026-11-15',people:2,interests:'',exclusions:'',tempo:'balanced',transport:'open',luggage:'open',
  stay:'Hotel Arts',stayAddress:'Carrer de la Marina 19-21, Barcelona'},overview:'',
  days:[{date:'2026-11-10',title:'Ankunft',activities:[
    {id:'a',text:'Sagrada Família besuchen',period:'Vormittag',place:'Sagrada Família, Carrer de Mallorca 401'},
    {id:'b',text:'Tapas zum Abendessen',period:'Abend',place:'Bar Cañete'},
    {id:'c',text:'Frühstück im Café',period:'Vormittag',place:'Federal Café'},
    {id:'d',text:'Ausruhen',period:'Nachmittag'}]}],
  bookings:[],checklist:[],extra:[],packing:[],arrival:{},tips:[],packingWeather:'',preparationSummary:'',sources:[]} as unknown as TripPlan

test('Orte werden deterministisch kategorisiert, Unsicheres wird markiert',()=>{
  assert.equal(categorize('Tapas Restaurant').category,'restaurants')
  assert.equal(categorize('Federal Café').category,'cafes')
  assert.equal(categorize('Techno Club').category,'clubs')
  assert.equal(categorize('Strand Barceloneta').category,'beaches')
  assert.deepEqual(categorize('Casa Milà'),{category:'sights',guess:true})
})
test('Sammeln: nur Tagespunkte mit Ort, Unterkunft nur mit Freigabe, keine Dubletten',()=>{
  const state=emptyMapState()
  const places=collectPlaces(plan,state)
  assert.deepEqual(places.map(place=>place.name),['Sagrada Família','Bar Cañete','Federal Café','Hotel Arts'])
  const stay=places.find(place=>place.category==='stay')!
  assert.ok(!stay.address.includes('Marina'))
  assert.ok(!isSelected(stay,state))
  assert.ok(isSelected(stay,{...state,includeStay:true}))
  assert.ok(collectPlaces(plan,{...state,stayAddress:true}).find(place=>place.category==='stay')!.address.includes('Marina'))
  assert.equal(collectPlaces(plan,{...state,manual:[{id:'1',name:'bar cañete',address:'',category:'bars'}]}).length,4)
})
test('Flagge, Kartenname',()=>{
  assert.equal(destinationFlag('Barcelona, Spanien'),'🇪🇸')
  assert.equal(destinationFlag('Lissabon'),'🇵🇹')
  assert.equal(destinationFlag('Irgendwo Unbekanntes'),undefined)
  assert.equal(defaultMapName(plan),'Barcelona 🇪🇸 – November 2026')
})
test('CSV mit BOM, Emoji-Kategorien und Schutz vor Formeln',()=>{
  assert.equal(safeCell('=HYPERLINK("x")'),"'=HYPERLINK(\"x\")")
  const places=collectPlaces(plan,emptyMapState())
  const file=buildExport('Barcelona 🇪🇸',places,'csv')
  assert.deepEqual([...file.bytes.slice(0,3)],[0xEF,0xBB,0xBF])
  const text=new TextDecoder().decode(file.bytes)
  assert.ok(text.startsWith('Name,Adresse,Kategorie,Beschreibung,Tag\r\n'))
  assert.ok(!text.split('\r\n')[0].includes('"'))
  assert.ok(text.includes('👁️ Sehenswürdigkeiten')&&text.includes('☕ Cafés'))
  assert.ok(!text.includes('👀'))
  assert.equal(file.name,'Barcelona 🇪🇸.csv')
})
test('KML escaped XML, ZIP enthält je Kategorie eine Datei und besteht die Strukturprüfung',()=>{
  const places=collectPlaces(plan,emptyMapState()).map(place=>({...place,name:place.name+' & <Co>'}))
  const text=kml('Karte',places)
  assert.ok(text.includes('&amp; &lt;Co&gt;')&&text.includes('<Folder>'))
  const file=buildExport('Barcelona',places,'zip')
  const bytes=file.bytes
  assert.deepEqual([...bytes.slice(0,4)],[0x50,0x4b,3,4])
  assert.equal(new DataView(bytes.buffer,bytes.byteOffset).getUint16(bytes.length-12,true),4)
  assert.equal(zip([]).length,22)
})
test('Kartenzustand wird pro Reise gespeichert und validiert',()=>{
  const store=new Store(':memory:')
  try {
    const id=randomUUID()
    store.db.prepare('INSERT INTO trips (id,revision,plan,updated) VALUES (?,?,?,?)').run(id,1,'{}','2026-11-01')
    assert.deepEqual(loadMapState(store,id),emptyMapState())
    const saved=saveMapState(store,id,{overrides:{x:{category:'nonsense',selected:false}},manual:[{name:'Mirador',category:'sights'}],includeStay:true,format:'kml',junk:1})
    assert.equal(saved.overrides.x.category,'other')
    assert.equal(loadMapState(store,id).format,'kml')
    assert.throws(()=>saveMapState(store,randomUUID(),{}),{status:404})
  } finally {store.db.close()}
})

test('Outfit-Vorschlag nur ab einem Tag vor der Reise bis zum Reiseende',async()=>{
  const {outfitWindow}=await import('../../../hub/runtime/trip-types.ts')
  const trip={draft:{start:'2026-11-10',end:'2026-11-15'}}
  assert.equal(outfitWindow(trip,'2026-11-08'),false)
  assert.equal(outfitWindow(trip,'2026-11-09'),true)
  assert.equal(outfitWindow(trip,'2026-11-12'),true)
  assert.equal(outfitWindow(trip,'2026-11-15'),true)
  assert.equal(outfitWindow(trip,'2026-11-16'),false)
})
