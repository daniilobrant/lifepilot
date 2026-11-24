import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../../../hub/runtime/store.ts'
import { attachOutfitPhoto, OutfitStudio, outfitOverview, saveWardrobe } from '../../../hub/runtime/outfits.ts'
import { addTravelWardrobeItem, changeResale, fragranceList, recommendFragrance, saveFragrance, updateFragranceTags, saveTravelWardrobe, travelWardrobe } from '../../../hub/runtime/wardrobe-extras.ts'
import { previewTrip, saveTrip, changeTrip, trip, removeSavedTrip } from '../../../hub/runtime/trips.ts'
import { savePersonalProfile } from '../../../hub/runtime/personal-profile.ts'
import { canonicalGroceryName,grocerySuggestions } from '../../../hub/runtime/grocery-catalog.ts'
import { groceryCategory, groceryOverview, putGrocery, refreshLegacyGroceryCatalog } from '../../../hub/runtime/grocery.ts'
import type { FragranceDraft } from '../../../hub/runtime/wardrobe-extras-types.ts'

const draft={destination:'Teststadt',departure:'Musterstadt',start:'2090-06-03',end:'2090-06-10',people:1,transport:'flight',luggage:'cabin'}
const fresh:FragranceDraft={name:'Zitrus',brand:'Probe',description:'Frischer Zitrusduft.',notes:'Bergamotte',containerMl:75,
  source:'https://shop.example.com/parfum',profile:'Frisch',occasions:['Büro','Alltag'],seasons:['Sommer'],times:['Tagsüber']}
const warm={...fresh,name:'Gewürz',containerMl:150,profile:'Warm & intensiv' as const,occasions:['Feier'],seasons:['Winter'],times:['Abends']}
const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')

test('Resale summarizes observed attributes, differentiates photo provenance and shows sorted articles and hides sold ones',()=>{
  const store=new Store(':memory:')
  try {
    const {id}=saveWardrobe(store,{name:'Hose',category:'bottom',size:'42',brand:'Test',color:'Braun'})
    attachOutfitPhoto(store,id,photo,'image/png','web')
    let sale=store.transaction(()=>changeResale(store,id,'selling',{condition:'Gut',flaws:'Kleine Naht ausgebessert',originalPrice:60}))[0]
    assert.equal(sale.hasOwnPhoto,false)
    assert.match(sale.listing.description,/Größe: 42/)
    assert.equal(sale.listing.start,21)
    assert.equal(outfitOverview(store).wardrobe[0].saleState,'selling')
    attachOutfitPhoto(store,id,photo,'image/png','own')
    sale=store.transaction(()=>changeResale(store,id,'selling',{condition:'Gut',flaws:'',originalPrice:null}))[0]
    assert.equal(sale.hasOwnPhoto,true)
    assert.equal(store.transaction(()=>changeResale(store,id,'sold',null))[0].state,'sold')
    assert.equal(outfitOverview(store).wardrobe.length,0)
    store.transaction(()=>changeResale(store,id,'restore',null))
    assert.equal(outfitOverview(store).wardrobe.length,1)
    assert.equal(store.transaction(()=>changeResale(store,id,'sorted',null))[0].state,'sorted')
    assert.equal(outfitOverview(store).wardrobe[0].saleState,'sorted')
    assert.throws(()=>new OutfitStudio().generate(store,{style:'Schlicht',mode:'anchor',required:[id],variant:0}),{status:409})
    assert.equal(changeResale(store,id,'start',null)[0].state,'selling')
  } finally {store.db.close()}
})

test('Travel outfit generation uses the saved trip-specific wardrobe and never falls back to the full wardrobe',()=>{
  const store=new Store(':memory:')
  try {
    const top=saveWardrobe(store,{name:'Hemd',category:'top'}).id
    const trousers=saveWardrobe(store,{name:'Hose',category:'bottom'}).id
    const saved=saveTrip(store,previewTrip(draft,undefined,undefined,store).id)
    const studio=new OutfitStudio()
    const query={mode:'inspiration',style:'Schlicht',required:[],variant:0,tripId:saved.id}
    assert.throws(()=>studio.generate(store,query),{status:409})
    store.transaction(()=>saveTravelWardrobe(store,saved.id,[top]))
    assert.deepEqual(studio.generate(store,query).look.itemIds,[top])
    assert.throws(()=>studio.generate(store,{...query,mode:'anchor',required:[trousers]}),{status:409})
    store.transaction(()=>changeResale(store,top,'selling',{condition:'Gut',flaws:'',originalPrice:null}))
    assert.deepEqual(travelWardrobe(store,saved.id),[])
    removeSavedTrip(store,saved.id)
    assert.throws(()=>travelWardrobe(store,saved.id),{status:404})
  } finally {store.db.close()}
})

test('Adding one wardrobe item preserves the selected trip and existing packing choices',()=>{
  const store=new Store(':memory:')
  try {
    const top=saveWardrobe(store,{name:'Hemd',category:'top'}).id
    const trousers=saveWardrobe(store,{name:'Hose',category:'bottom'}).id
    const spare=saveWardrobe(store,{name:'Pullover',category:'top'}).id
    const first=saveTrip(store,previewTrip(draft,undefined,undefined,store).id)
    const second=saveTrip(store,previewTrip({...draft,destination:'Zweite Teststadt'},undefined,undefined,store).id)
    store.transaction(()=>saveTravelWardrobe(store,first.id,[top]))
    const expected=[top,trousers].sort()
    assert.deepEqual(store.transaction(()=>addTravelWardrobeItem(store,first.id,trousers)).sort(),expected)
    assert.deepEqual(store.transaction(()=>addTravelWardrobeItem(store,first.id,trousers)).sort(),expected)
    assert.deepEqual(travelWardrobe(store,second.id),[])
    assert.ok(outfitOverview(store).wardrobe.some(item=>item.id===trousers))
    store.transaction(()=>changeResale(store,spare,'sorted',null))
    assert.throws(()=>store.transaction(()=>addTravelWardrobeItem(store,first.id,spare)),{status:409})
    assert.deepEqual(travelWardrobe(store,first.id).sort(),expected)
  } finally {store.db.close()}
})

test('Fragrance choice follows occasions, time, weather and the verified full size of hand-luggage containers',()=>{
  const store=new Store(':memory:')
  try {
    saveFragrance(store,fresh,photo,'image/png')
    saveFragrance(store,warm,photo,'image/png')
    const fragrances=fragranceList(store)
    assert.equal(recommendFragrance(fragrances,{date:'2090-06-01',occasion:'Büro',temperature:25,time:'09:00'})?.name,'Zitrus')
    assert.equal(recommendFragrance(fragrances,{date:'2090-01-01',occasion:'Feier',temperature:4,time:'21:00'})?.name,'Gewürz')
    assert.equal(recommendFragrance(fragrances,{date:'2090-01-01',occasion:'Feier',temperature:4,cabin:true})?.name,'Zitrus')
    assert.equal(recommendFragrance(fragrances.filter(row=>row.containerMl===150),{cabin:true}),undefined)
    assert.equal(recommendFragrance([{...fragrances[0],containerMl:null}],{cabin:true}),undefined)
    assert.ok(recommendFragrance([{...fragrances[0],containerMl:100}],{cabin:true}))
    const updated=updateFragranceTags(store,fragrances[0].id,['Alltag','Date'],['Frühling','Sommer'])
    assert.deepEqual(fragranceList(store)[0],updated)
    assert.throws(()=>updateFragranceTags(store,updated.id,['invalid'],[]),{status:400})
  } finally {store.db.close()}
})

test('Profile and packing defaults apply to saved trips while preserving checks and adjusted quantities',()=>{
  const store=new Store(':memory:')
  try {
    savePersonalProfile(store,{glasses:'yes',contacts:'yes'},0)
    saveFragrance(store,warm,photo,'image/png')
    const saved=saveTrip(store,previewTrip(draft,undefined,undefined,store).id)
    assert.equal(saved.packing.filter(item=>item.text==='Kopfhörer').length,1)
    assert.equal(saved.packing.find(item=>item.text==='Kontaktlinsen')?.quantity,6)
    assert.ok(saved.packing.some(item=>item.text==='Brille'))
    assert.match(saved.packing.find(item=>item.text==='Parfüm')?.detail??'',/Reiseflakon/)
    saveFragrance(store,fresh,photo,'image/png')
    const lenses=saved.packing.find(item=>item.text==='Kontaktlinsen')!
    const updated=changeTrip(store,saved.id,saved.revision,{kind:'quantity',item:lenses.id,quantity:8})
    assert.equal(updated.packing.find(item=>item.id===lenses.id)?.quantity,8)
    const checked=changeTrip(store,updated.id,updated.revision,{kind:'toggle',item:lenses.id,done:true})
    assert.equal(trip(store,checked.id).packing.find(item=>item.id===lenses.id)?.done,true)
    assert.match(trip(store,checked.id).packing.find(item=>item.text==='Parfüm')?.detail??'',/Zitrus/)
  } finally {store.db.close()}
})

test('Grocery suggestions fix capitalization and familiar typos while the migration keeps existing quantities',()=>{
  const store=new Store(':memory:')
  try {
    assert.equal(grocerySuggestions('gur')[0],'Gurke')
    assert.equal(canonicalGroceryName('gurke'),'Gurke')
    assert.equal(canonicalGroceryName('gukre'),'Gurke')
    assert.equal(canonicalGroceryName('krapsel'),'Rapsöl')
    assert.equal(groceryCategory('Frischer Ingwer'),'produce')
    assert.equal(groceryCategory('Honig'),'breakfast')
    assert.equal(groceryCategory('Rapsöl'),'oil')
    assert.equal(groceryCategory('Sojasoße'),'sauce')
    assert.equal(groceryCategory('Zahnpasta'),'dental')
    for (const [id,name] of [['one','gurke'],['two','Sojasauce']]) {
      store.db.prepare('INSERT INTO grocery_shopping (id,key,data) VALUES (?,?,?)')
        .run(id,name.toLowerCase(),JSON.stringify({name,category:'other',quantity:'2 Stück',note:''}))
    }
    refreshLegacyGroceryCatalog(store)
    putGrocery(store,'shopping',{name:'gukre'})
    assert.deepEqual(groceryOverview(store).shopping.map(item=>[item.name,item.category,item.quantity]),[
      ['Gurke','produce','2 Stück'],['Sojasoße','sauce','2 Stück'],
    ])
  } finally {store.db.close()}
})

test('EU travel preparation uses the German home assumption and accepts a profile override',()=>{
  const store=new Store(':memory:')
  try {
    let profile=savePersonalProfile(store,{location:'Esslingen am Neckar'},0)
    const preview=previewTrip({...draft,destination:'Teneriffa'},undefined,undefined,store)
    const saved=saveTrip(store,preview.id)
    assert.match(saved.checklist.find(item=>item.topic==='entry')?.detail??'',/Wohnort abgeleitet.*Personalausweis/)
    assert.match(saved.checklist.find(item=>item.topic==='connectivity')?.detail??'',/EU-Roaming/)
    assert.match(saved.checklist.find(item=>item.topic==='banking')?.detail??'',/in Euro/)
    changeTrip(store,saved.id,saved.revision,{kind:'toggle',item:saved.checklist[0].id,done:true})
    profile=savePersonalProfile(store,{...profile.fields,travelCitizenship:'other'},profile.revision)
    const current=trip(store,saved.id)
    assert.doesNotMatch(current.checklist.find(item=>item.topic==='entry')?.detail??'',/Wohnort abgeleitet/)
    assert.equal(current.checklist[0].done,true)
  } finally {store.db.close()}
})

test('A selected daypart affects the fragrance ranking and preserves legacy input',()=>{
  const scents=[{...warm,id:'warm'},{...fresh,id:'fresh'}]
  const date='2027-01-03'
  assert.equal(recommendFragrance(scents,{date,daypart:'Abends'})?.id,'warm')
  assert.equal(recommendFragrance(scents,{date,daypart:'Morgens',time:'19:00'})?.id,'fresh')
  assert.equal(recommendFragrance(scents,{date,time:'19:00'})?.id,'warm')
})

test('Fragrance research corrects the MYSLF spelling and attaches researched notes and styling',async()=>{
  const {normalizedFragranceQuery,researchFragrance}=await import('../../../hub/runtime/fragrance-research.ts')
  assert.equal(normalizedFragranceQuery('ysl my self'),'Yves Saint Laurent MYSLF')
  const [result]=await researchFragrance('ysl my self')
  assert.equal(result.draft.name,'MYSLF Eau de Parfum')
  assert.equal(result.draft.brand,'Yves Saint Laurent')
  assert.match(result.draft.notes,/Orangenblüte/)
  assert.match(result.draft.pairing??'',/Sakko/)
  assert.equal(result.draft.containerMl,null)
  assert.ok(result.images[0]?.startsWith('https://'))
})

test('Fragrance metadata reads notes from the product section and ignores reviews',async()=>{
  const {completeProductMetadata}=await import('../../../hub/connectors/outfit-import.ts')
  const {fragranceDraft}=await import('../../../hub/runtime/fragrance-research.ts')
  const url=new URL('https://www.parfumo.de/Parfums/Testmarke/Testduft')
  const html='<meta name="description" content="Ein frischer Duft mit Bergamotte."><h2>Duftnoten</h2>'+
    '<span>Orangenblüte</span><h2>Meinungen</h2><p>Ich liebe Parfum mit Tabak</p>'
  const product=completeProductMetadata(html,url)
  const draft=fragranceDraft('Testduft','Testmarke',product.description+' '+product.fragranceNotes,url.href)
  assert.deepEqual(draft.notes.split(', '),['Bergamotte','Orangenblüte'])
  assert.equal(draft.profile,'Frisch')
  assert.equal(draft.containerMl,null)
})
