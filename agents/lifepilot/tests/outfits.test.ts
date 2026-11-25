import { outfitFields, productWardrobeFields } from '../../../hub/runtime/outfit-fields.ts'
import { colorRelation, identifiedColor, paletteDescription, paletteFit } from '../../../hub/runtime/outfit-palette.ts'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Store } from '../../../hub/runtime/store.ts'
import { OutfitStudio, outfitOverview, saveWardrobe, saveStyle, attachOutfitPhoto, outfitPhoto, removeOutfitData, saveLookPhoto, lookPhoto, removeLookPhoto } from '../../../hub/runtime/outfits.ts'
import { completeProductMetadata, photoMime, productAddress, productImageResults, productMetadata, publicIPv4, productSearchLinks } from '../../../hub/connectors/outfit-import.ts'
import { verifyOutput } from '../tools/validate.ts'

const query = { mode:'inspiration', occasion:'', style:'Schlicht', required:[], variant:0 }
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')

test('Wardrobe product details prefer the website and preserve descriptive attributes', () => {
  const title='BASIC SLIM-FIT T-SHIRT aus Baumwolle - Weiß'
  const details=productWardrobeFields(title,'Jersey aus 100 % Baumwolle','Zara T-Shirt schwarz',{},'Grau #D9DDE1')
  assert.equal(details.color,'Weiß')
  assert.equal(details.fit,'Slim Fit')
  assert.equal(details.material,'100 % Baumwolle')
  assert.equal(details.brand,'Zara')
  assert.equal(details.garmentType,'T-Shirt')
  assert.equal(productWardrobeFields(title,'','',{color:'#D9DDE1'}).color,'Weiß')
  assert.equal(productWardrobeFields(title,'','',{color:'Deep Indigo'}).color,'Deep Indigo')
  assert.equal(productWardrobeFields('T-Shirt','','',{},'Grau #D9DDE1').color,'Grau')
  const description='Farbe: Weiß. Hauptmaterial: 100 % Baumwolle'
  const product=completeProductMetadata('<script type="application/ld+json">'+JSON.stringify({
    '@type':'Product',name:'BASIC SLIM-FIT T-SHIRT',description,brand:{name:'Muster'},
  })+'</script>',new URL('https://shop.example/shirt'))
  assert.equal(product.draft.color,'Weiß')
  assert.equal(product.draft.material,'100 % Baumwolle')
  assert.equal(product.draft.brand,'Muster')
})

test('Outfit studio starts empty outside the example profile and pins only owned IDs', () => {
  const store = new Store(':memory:')
  const studio = new OutfitStudio()
  try {
    assert.equal(outfitOverview(store).wardrobe.length,0)
    assert.throws(()=>studio.generate(store,query),{status:409})
    assert.throws(()=>studio.generate(store,{...query,style:'anything'}),{status:400})
    assert.throws(()=>studio.generate(store,{...query,mode:'occasion'}),{status:400})
    const given = outfitOverview(store,true).wardrobe
    const pinned = given[0].id
    const owned = new Set(given.map(item=>item.id))
    assert.throws(()=>studio.generate(store,{...query,mode:'anchor',required:[randomUUID()]}),{status:409})
    const result = studio.generate(store,{...query,mode:'anchor',required:[pinned]})
    assert.ok(result.look.itemIds.includes(pinned))
    assert.ok(result.look.itemIds.every(id=>owned.has(id)))
    assert.match(result.look.prompt,/Roter Rundhals-Pullover/u)
    assert.notDeepEqual(studio.generate(store,{...query,variant:1}).look.itemIds,studio.generate(store,query).look.itemIds)
    assert.throws(()=>studio.save(store,randomUUID()),{status:409})
    studio.save(store,result.proposal)
    studio.save(store,result.proposal)
    assert.equal(outfitOverview(store).looks.length,1)
    assert.throws(()=>removeOutfitData(store,'item',pinned),{status:409})
    removeOutfitData(store,'look',result.proposal)
    for (const id of owned) removeOutfitData(store,'item',id)
    assert.equal(outfitOverview(store,true).wardrobe.length,0)
    assert.throws(()=>studio.save(store,result.proposal),{status:409})
  } finally { store.db.close() }
})

test('Outfit wardrobe, photo, fit profile and archived look survive a SQLite restart', () => {
  const directory = mkdtempSync(join(tmpdir(),'outfit-db-'))
  const database = join(directory,'wardrobe.sqlite')
  let store = new Store(database)
  try {
    const {id} = saveWardrobe(store,{name:'Blauer Mantel',category:'outer',material:'Wolle',season:'Winter'})
    attachOutfitPhoto(store,id,pixel,photoMime(pixel))
    attachOutfitPhoto(store,'profile',pixel,photoMime(pixel))
    saveStyle(store,{height:'181 cm',preferences:'Layering'})
    const studio = new OutfitStudio()
    const {look,proposal} = studio.generate(store,{...query,temperature:5},'Büro')
    assert.match(look.tips.join(' '),/181 cm/u)
    assert.match(look.tips.join(' '),/Layering/u)
    studio.save(store,proposal)
    store.db.close()
    store = new Store(database)
    const restored = outfitOverview(store)
    assert.equal(restored.wardrobe[0].id,id)
    assert.equal(restored.wardrobe[0].hasPhoto,true)
    assert.deepEqual(Buffer.from(outfitPhoto(store,id)!.photo),pixel)
    assert.equal(restored.profilePhoto,true)
    assert.equal(restored.profile.height,'181 cm')
    assert.deepEqual(restored.looks[0].itemIds,[id])
    removeOutfitData(store,'profile-photo','')
    assert.equal(outfitOverview(store).profilePhoto,false)
  } finally { store.db.close(); rmSync(directory,{recursive:true,force:true}) }
})

test('Product import accepts public HTTPS only, handles metadata and rejects active images', () => {
  for (const url of ['http://shop.example.com','https://127.0.0.1','https://2130706433','https://[::1]',
    'https://test:pass@shop.example.com','https://shop.home.arpa','https://shop.example.com:8443']) {
    assert.throws(()=>productAddress(url),{status:400})
  }
  for (const ip of ['127.1.1.1','0.0.0.0','172.31.0.5','100.100.100.200','169.254.169.254','10.1.1.1',
    '192.168.10.5','192.0.2.1','198.51.100.1','203.0.113.1','224.1.1.1','255.255.255.255','::ffff:127.0.0.1']) assert.equal(publicIPv4(ip),false)
  assert.equal(publicIPv4('8.8.8.8'),true)
  const base = productAddress('https://shop.example.com/p#details')
  assert.deepEqual(productMetadata('<meta content="Mantel &amp; Gürtel" property="og:title"><meta content="/a.png" name="og:image">',base),
    {name:'Mantel & Gürtel',image:'https://shop.example.com/a.png',source:'https://shop.example.com/p'})
  assert.equal(productMetadata('<meta name="og:image" content="https://127.0.0.1/a.png">',base).image,null)
  assert.throws(()=>photoMime(Buffer.from('<svg></svg>')),{status:415})
  assert.equal(photoMime(pixel),'image/png')
})

test('Outfit chat routing accepts a read intent and rejects task writes or structured planning data', () => {
  const route = {skill:'outfit',skillData:null,tasks:[],questions:[]}
  const input = 'Was ziehe ich heute fürs Büro an?'
  assert.equal(verifyOutput(route,input).skill,'outfit')
  assert.throws(()=>verifyOutput({...route,actions:[{kind:'remember'}]},input))
  assert.throws(()=>verifyOutput({...route,skillData:{date:'2026-11-21'}},input))
})

test('Product metadata and labels prefill editable outfit fields', () => {
  const address = productAddress('https://shop.example.com/coat')
  const shop = '<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Blauer Mantel","material":"80 % Wolle","color":"Dunkelblau","description":"Regular Fit, für den Winter","image":{"contentUrl":"/images/coat.png"}}]}</script>'
  const result = completeProductMetadata(shop,address)
  assert.equal(result.image,'https://shop.example.com/images/coat.png')
  assert.deepEqual(result.draft,{category:'outer',name:'Blauer Mantel',garmentType:'Mantel',material:'80 % Wolle',color:'Dunkelblau',
    fit:'Regular Fit',season:'Winter',retailer:'shop.example.com',source:address.href})
  const withLabel = outfitFields('T-Shirt 100% Baumwolle Regular Fit',[],identifiedColor('#C83232'))
  assert.match(withLabel.color ?? '',/Rot/u)
  assert.equal(withLabel.material,'100 % Baumwolle')
  assert.equal(withLabel.fit,'Regular Fit')
  assert.equal(outfitFields('', ['t_shirt'], 'Schwarz').material,undefined)
})

test('Product links retain retailer and brand and resolve exact color, size and image', () => {
  const address=new URL('https://shop.example.com/pullover')
  const variants=[
    {color:'Blau',size:{name:'M'},sku:'blue-m',offers:{url:'?aid=blue-m&amp;'},image:'/blue.png'},
    {color:'Blau',size:{name:'L'},sku:'blue-l',url:'?sku=blue-l',image:'/blue.png'},
    {color:'Rot',size:'S',sku:'red-s',url:'?sku=red-s',image:'/red.png'},
    {color:'Rot',size:'L',sku:'red-l',url:'?sku=red-l'},
    {color:'Grün',size:'XL'},
  ]
  const page='<meta property="og:site_name" content="Beispiel-Shop"><meta property="og:image" content="/blue.png">'+
    '<script type="application/ld+json">'+JSON.stringify({
      '@type':'ProductGroup',name:'Merino-Pullover',brand:{name:'Beispielmarke'},hasVariant:variants,
    })+'</script>'
  const linked=completeProductMetadata(page,address,'',new URL('?sku=blue-m',address))
  assert.equal(linked.draft.brand,'Beispielmarke')
  assert.equal(linked.draft.retailer,'Beispiel-Shop')
  assert.equal(linked.draft.color,'Blau')
  assert.equal(linked.draft.size,'M')
  assert.deepEqual(linked.sizes,['M','L'])
  assert.deepEqual(linked.images,['https://shop.example.com/blue.png'])
  assert.equal(completeProductMetadata(page,address,'',new URL('?aid=blue-m&utm_source=share',address)).draft.size,'M')

  const general=completeProductMetadata(page,address)
  assert.deepEqual(general.colors,['Blau','Rot','Grün'])
  assert.equal(general.draft.color,undefined)
  assert.equal(general.draft.size,undefined)
  const red=completeProductMetadata(page,address,'Rot',new URL('?sku=blue-m',address))
  assert.equal(red.draft.color,'Rot')
  assert.equal(red.draft.size,undefined)
  assert.deepEqual(red.sizes,['S','L'])
  assert.deepEqual(red.images,['https://shop.example.com/red.png'])
  assert.deepEqual(completeProductMetadata(page,address,'Grün').images,[])
})

test('Outfit palette ranks adjacent colors and strong contrasts by requested style', () => {
  assert.equal(colorRelation('Rot','Grün'),'contrast')
  assert.equal(colorRelation('Weiss #C83232','Grün'),'neutral')
  assert.equal(colorRelation('Blau','Türkis'),'analog')
  assert.equal(colorRelation('Blau','Dunkelblau'),'tone')
  assert.equal(colorRelation('Rot','Grau'),'neutral')
  assert.ok(paletteFit('Rot','Grün','Auffällig') > paletteFit('Rot','Koralle','Auffällig'))
  assert.ok(paletteFit('Rot','Grün','Schlicht') < paletteFit('Rot','Koralle','Schlicht'))
  assert.match(paletteDescription(['Blau','Türkis']),/Farbkreis nah/u)
})

test('Weather for the selected date ranks suitable pieces from the wardrobe', () => {
  const store = new Store(':memory:')
  try {
    const wool = saveWardrobe(store,{name:'Wollmantel',category:'outer',material:'Wolle',season:'Winter'})
    const rain = saveWardrobe(store,{name:'Regenjacke',category:'outer',tags:'winddicht,wasserdicht'})
    const studio = new OutfitStudio()
    const date='2026-11-22'
    const wet=studio.generate(store,{...query,date},'',{place:'Stuttgart',date,min:4,max:9,rain:90,wind:42}).look
    assert.ok(wet.itemIds.includes(rain.id))
    assert.ok(wet.tips.some(tip=>tip.includes('Niederschlag')))
    assert.equal(wet.weather?.date,date)
    const dry=studio.generate(store,{...query,date},'',{place:'Stuttgart',date,min:3,max:9,rain:0,wind:5}).look
    assert.ok(dry.itemIds.includes(wool.id))
  } finally {store.db.close()}
})

test('Outfit chat transfer requires a user-provided place and a valid date', () => {
  const request = {skill:'outfit',skillData:{place:'Stuttgart',date:'2026-11-22',occasion:'Spaziergang'},tasks:[],questions:[]}
  assert.deepEqual(verifyOutput(request,'Spaziergang in Stuttgart morgen').skillData, request.skillData)
  assert.throws(()=>verifyOutput(request,'Spaziergang morgen'),/ungültig/u)
  assert.throws(()=>verifyOutput({...request,skillData:{...request.skillData,date:'2026-11-31'}},'Stuttgart'),/ungültig/u)
  assert.throws(()=>verifyOutput({...request,skill:'deadline_guardian'},'Stuttgart'),/ungültig/u)
})

test('Outfit preferences default the style and rank explicit sizes and cuts, without losing legacy profile text', () => {
  const store = new Store(':memory:')
  try {
    store.db.prepare('INSERT INTO outfit_profile(singleton,details) VALUES (1,?)').run(
      JSON.stringify({height:'181 cm',shape:'Gespeicherte Statur',preferences:'Layering'}))
    assert.equal(outfitOverview(store).profile.shape,'Gespeicherte Statur')
    assert.equal(outfitOverview(store).profile.preferredCut,'')
    const profile={...outfitOverview(store).profile,topSize:'M',preferredStyle:'Streetwear',preferredCut:'Locker',proportions:'Längerer Oberkörper'}
    saveStyle(store,profile)
    assert.throws(()=>saveStyle(store,{...profile,preferredCut:'unknown'}),{status:400})
    const large=saveWardrobe(store,{name:'Weites Shirt',category:'top',fit:'Locker',tags:'Größe L, Streetwear'})
    const fitting=saveWardrobe(store,{name:'Gerades Shirt',category:'top',fit:'Relaxed',tags:'Größe M'})
    const studio=new OutfitStudio()
    const {look}=studio.generate(store,{...query,style:undefined})
    assert.equal(look.style,'Streetwear')
    assert.deepEqual(look.itemIds,[fitting.id])
    assert.match(look.tips.join(' '),/höheren Bund/u)
    assert.match(look.tips.join(' '),/bevorzugter Schnitt/u)
    assert.match(look.tips.join(' '),/Oberteil M/u)
    assert.notEqual(fitting.id,large.id)
    assert.equal(studio.generate(store,query).look.style,'Schlicht')
  } finally {store.db.close()}
})

test('Look photos are linked to one outfit and cascade on removal', () => {
  const store=new Store(':memory:')
  try {
    const first=store.transaction(()=>saveLookPhoto(store,pixel,undefined,'Training'))
    const second=store.transaction(()=>saveLookPhoto(store,pixel,first.look))
    const other=store.transaction(()=>saveLookPhoto(store,pixel,undefined,'Büro'))
    assert.deepEqual(new Set(outfitOverview(store).looks.find(look=>look.id===first.look)?.photoIds),new Set([first.id,second.id]))
    assert.deepEqual(Buffer.from(lookPhoto(store,first.id)!),pixel)
    const replacement=Buffer.from('different image bytes')
    assert.equal(saveLookPhoto(store,replacement,first.look,undefined,first.id).id,first.id)
    assert.deepEqual(Buffer.from(lookPhoto(store,first.id)!),replacement)
    assert.throws(()=>saveLookPhoto(store,pixel,other.look,undefined,first.id),{status:404})
    removeLookPhoto(store,second.id)
    assert.equal(lookPhoto(store,second.id),undefined)
    removeOutfitData(store,'look',first.look)
    assert.equal(lookPhoto(store,first.id),undefined)
    assert.ok(lookPhoto(store,other.id))
    assert.throws(()=>store.transaction(()=>saveLookPhoto(store,pixel,first.look)),{status:404})
  } finally {store.db.close()}
})

test('Model numbers depend on recognized brand and ambiguity remains open', () => {
  const identified=outfitFields("Dr. Martens\n1460 Smooth Leather Boots",[],'Schwarz')
  assert.equal(identified.brand,'Dr. Martens')
  assert.equal(identified.model,'1460')
  assert.equal(identified.category,'shoes')
  assert.equal(outfitFields('Schwarze Boots 1460',[],'Schwarz').model,undefined)
  assert.equal(outfitFields('Dr. Martens 1460 1461',[],'Schwarz').model,undefined)
})

test('Product search recognizes public results and keeps the shop image candidates distinct',()=>{
  const results=productSearchLinks('<a class="enrichment-card-item" href="https://shop.example.com/one">Artikel</a>'+
    '<a class="enrichment-card-item" href="http://127.0.0.1/secret">Link</a>'+
    '<a href="https://brave.com/transparency/" target="_blank">Info</a>'+
    '<a class="enrichment-card-item" href="https://shop.example.com/one">Wiederholung</a>'+
    '<a class="enrichment-card-item" href="https://shop.example.com/two">Artikel</a>'+
    '<a class="enrichment-card-item" href="https://shop.example.com/three">Artikel</a>'+
    '<a class="snippet-url" href="https://second.example.com/coat">Mantel</a>')
  assert.deepEqual(results,['https://shop.example.com/one','https://shop.example.com/two','https://second.example.com/coat'])
  const product=completeProductMetadata('<script type="application/ld+json">'+JSON.stringify({
    '@type':'Product',name:'Weißes T-Shirt | Shop',image:['/model.jpg','/flat.jpg','/flat.jpg'],
  })+'</script>',productAddress(results[0]))
  assert.equal(product.draft.name,'Weißes T-Shirt')
  assert.equal(product.draft.category,'top')
  assert.equal(product.draft.garmentType,'T-Shirt')
  assert.deepEqual(product.images,['https://shop.example.com/model.jpg','https://shop.example.com/flat.jpg'])
})

test('Public image search keeps unique product images with a public source', ()=>{
  const row=(name:string,page:string,image:string)=>'{title:'+JSON.stringify(name)+',url:'+JSON.stringify(page)+
    ',is_source_local:false,thumbnail:{src:"https://img.example.com/proxy",width:120,original:'+JSON.stringify(image)+'}}'
  const source='https://shop.example.com/merino'
  const picture='https://img.example.com/sweater.jpg'
  const fixture=[row('Merino "hellblau"',source,picture),row('Wiederholung',source,picture),
    row('Unzulässige Quelle','http://localhost/photo', 'https://img.example.com/other.jpg')].join(',')
  assert.deepEqual(productImageResults(fixture),[{name:'Merino "hellblau"',source,image:picture}])
})

test('An outfit wish resolves one available wardrobe item and preserves ambiguity',async()=>{
  const {resolveOutfitAnchor,emptyWardrobe}=await import('../../../hub/runtime/outfit-types.ts')
  const item={...emptyWardrobe,id:'one',name:'Schwarzer Pullover',hasPhoto:false}
  const other={...item,id:'two',name:'Schwarzer Pullover aus Merinowolle'}
  assert.equal(resolveOutfitAnchor('meinen schwarzen Pullover',[item,other])?.id,'one')
  assert.equal(resolveOutfitAnchor('Pullover',[item,other]),undefined)
  assert.equal(resolveOutfitAnchor('Pullover',[{...item,saleState:'selling'}]),undefined)
})

test('Pilot keeps stated fragrance names in order and rejects an invented fragrance',()=>{
  const plan={skill:'outfit',skillData:{fragrances:['Dior Sauvage','Bleu de Chanel','dior sauvage']},
    tasks:[],questions:[]}
  const input='Füge Dior Sauvage und Bleu de Chanel hinzu.'
  assert.deepEqual(verifyOutput(structuredClone(plan),input).skillData,{fragrances:['Dior Sauvage','Bleu de Chanel']})
  assert.throws(()=>verifyOutput(structuredClone(plan),'Dior Sauvage'),/unbelegten Namen/)
})

test('Outfit chat asks for the choice and then the name, and accepts only a stated wish',()=>{
  const context=['Stell mir ein Outfit für heute Abend zum Club-Konzert zusammen.','Ja','Meine schwarze Hose.']
  const params={place:null,date:'2026-11-22',occasion:'Club-Konzert',daypart:'Abends'}
  const result=(anchorStep:string,anchor:string|null)=>({skill:'outfit',skillData:{...params,anchorStep,anchor},tasks:[],questions:[]})
  assert.deepEqual(verifyOutput(result('decision',null),context).questions,['Willst du ein bestimmtes Teil anziehen?'])
  assert.deepEqual(verifyOutput(result('name',null),context).questions,['Welches Teil möchtest du anziehen?'])
  assert.deepEqual(verifyOutput(result('ready','schwarze Hose'),context).questions,[])
  assert.throws(()=>verifyOutput(result('ready','roter Pulli'),context),/Wunschstück/)
})

test('An elegance motto drives styling unless an explicit style is selected',()=>{
  const store=new Store(':memory:')
  try {
    saveWardrobe(store,{name:'Weißes Hemd',category:'top'})
    const studio=new OutfitStudio()
    const occasion='Abendessen mit Freunden, Motto elegant'
    const base={mode:'occasion',occasion,required:[],variant:0}
    assert.equal(studio.generate(store,base).look.style,'Eleganz')
    assert.equal(studio.generate(store,{...base,style:'Schlicht'}).look.style,'Schlicht')
  } finally {store.db.close()}
})


test('Calendar context classifies the selected event and uses Berlin local time',async()=>{
  const {outfitCalendarContext}=await import('../../../hub/runtime/outfit-calendar.ts')
  const work=outfitCalendarContext('Teammeeting','2026-11-25T18:00:00Z','work')
  assert.equal(work.daypart,'Abends')
  assert.equal(work.time,'19:00')
  assert.match(outfitCalendarContext('Handballtraining').occasion,/Sport & Bewegung/u)
})

test('Outfit slots separate T-shirts and longsleeves from knitwear, enforce max one per slot, and adapt jackets to weather',async()=>{
  const {outfitSlot}=await import('../../../hub/runtime/outfit-types.ts')
  const store=new Store(':memory:')
  try {
    const henleyBlue=saveWardrobe(store,{name:'Topman Slim Fit Langarm-Ripp-Henley-T-Shirt in Marineblau',category:'top',garmentType:'T-Shirt'}).id
    const henleyBrown=saveWardrobe(store,{name:'Topman Slim Fit Langarm-Ripp-Henley-T-Shirt in Braun',category:'top',garmentType:'T-Shirt'}).id
    const pullover=saveWardrobe(store,{name:'100 % Merinowolle Pullover (Polokragen)',category:'top',garmentType:'Pullover & Strick',material:'100 % Merinowolle'}).id
    const jeans=saveWardrobe(store,{name:'Solar Mid Waist Loose Wide Unisex Jeans',category:'bottom',garmentType:'Jeans'}).id
    const lightJacket=saveWardrobe(store,{name:'Bershka karierte Jacke mit Reißverschluss in Schwarz',category:'outer',garmentType:'Jacke'}).id
    const pufferJacket=saveWardrobe(store,{name:'ASOS DESIGN Steppjacke mit Rippkragen in Schwarz',category:'outer',garmentType:'Jacke'}).id
    const items=outfitOverview(store).wardrobe
    assert.equal(outfitSlot(items.find(i=>i.id===henleyBlue)!),'base')
    assert.equal(outfitSlot(items.find(i=>i.id===pullover)!),'knit')

    const studio=new OutfitStudio()
    // Even if two items from the same slot are passed, at most 1 per slot is kept, and a longsleeve Henley does not get a Pullover layered on top
    const coldLook=studio.generate(store,{...query,mode:'anchor',required:[henleyBlue,henleyBrown],temperature:1}).look
    assert.ok(!coldLook.itemIds.includes(henleyBlue) || !coldLook.itemIds.includes(henleyBrown))
    assert.ok(!coldLook.itemIds.includes(pullover))
    assert.ok(coldLook.itemIds.includes(pufferJacket))

    // Mild transition weather (14 °C) prefers the transition jacket over the winter puffer jacket
    const mildLook=studio.generate(store,{...query,temperature:14}).look
    assert.ok(mildLook.itemIds.includes(lightJacket))

    // Fixed slot ordering: top (base/knit) -> bottom -> outer
    const slots=mildLook.itemIds.map(id=>outfitSlot(items.find(i=>i.id===id)!))
    assert.equal(slots[0]==='base' || slots[0]==='knit',true)
    assert.equal(slots[1],'bottom')
    assert.equal(slots[2],'outer')
  } finally {store.db.close()}
})

test('Cold looks always layer a shirt under knitwear and skip clashing colours when a calm option exists',async()=>{
  const {outfitSlot,itemOccasion}=await import('../../../hub/runtime/outfit-types.ts')
  const {paletteScore,isPatterned,colorRelation}=await import('../../../hub/runtime/outfit-palette.ts')
  const store=new Store(':memory:')
  try {
    const knit=saveWardrobe(store,{name:'Baumwolle Pullover (soft, Rundhals)',category:'top',garmentType:'Pullover & Strick',color:'Blau'}).id
    const henley=saveWardrobe(store,{name:'Slim Fit Langarm-Henley-T-Shirt',category:'top',garmentType:'T-Shirt',color:'Marineblau'}).id
    saveWardrobe(store,{name:'Wide Jeans',category:'bottom',garmentType:'Jeans',color:'Grau'})
    const red=saveWardrobe(store,{name:'Jacke (kurz, gefüttert)',category:'outer',garmentType:'Jacke',color:'Weinrot'}).id
    const black=saveWardrobe(store,{name:'Steppjacke mit Rippkragen',category:'outer',garmentType:'Jacke',color:'Schwarz'}).id
    saveWardrobe(store,{name:'Sneakers Retro',category:'shoes',garmentType:'Sneaker',color:'Grau',tags:'Streetwear'})
    const studio=new OutfitStudio()
    for (const variant of [0,1,2,3,4,5]) {
      const look=studio.generate(store,{...query,style:'Auffällig',mode:'anchor',required:[knit],temperature:2,variant}).look
      assert.ok(look.itemIds.includes(henley),'Langarmshirt unter dem Pullover')
      assert.ok(look.itemIds.includes(black)&&!look.itemIds.includes(red),'keine Weinrot-Jacke zum blauen Pullover')
      assert.doesNotMatch(look.title,/Auffällig|Rund um/u)
      const slots=look.itemIds.map(id=>outfitSlot(outfitOverview(store).wardrobe.find(item=>item.id===id)!))
      assert.deepEqual(slots.slice(0,2),['base','knit'])
    }
    assert.equal(colorRelation('Marineblau','Weinrot'),'neutral')
    assert.ok(isPatterned('Schwarz','Bershka karierte Jacke'))
    assert.ok(paletteScore({color:'Weinrot'},[{color:'Blau'}],'Schlicht')<paletteScore({color:'Schwarz'},[{color:'Blau'}],'Schlicht'))
    assert.equal(itemOccasion({name:'Steppjacke',category:'outer',garmentType:'Jacke',material:'',tags:''}),'Kalte Tage · Alltag')
    assert.equal(itemOccasion({name:'Loafer ADRIAN',category:'shoes',garmentType:'Loafer',material:'',tags:''}),'Büro · Dinner')
    const titled=studio.generate(store,{...query,mode:'occasion',occasion:'Abendessen mit Freunden',variant:0}).look
    assert.equal(titled.title,'Dein Look für Abendessen mit Freunden')
  } finally {store.db.close()}
})

