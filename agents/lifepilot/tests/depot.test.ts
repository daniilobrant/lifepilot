import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../../../hub/runtime/store.ts'
import { depotState, fetchPrices, imageFormat, importHoldings, listHoldings, readCandidates, readRecognized, removeHolding, saveHolding, startRefresh, depotJob, priceSource, recognizePrompt } from '../../../hub/runtime/depot.ts'
import { investedCents } from '../../../hub/runtime/depot-types.ts'

test('Erkannte Positionen aus dem Screenshot werden streng geprüft',()=>{
  const raw={positions:[
    {name:'MSCI World',isin:'IE00B4L5Y983',symbol:'',category:'ETF',sector:'Breit gestreut',quantity:'52,5',value:1050},
    {name:'Bitcoin',isin:'',symbol:'',category:'Krypto',sector:'Krypto',quantity:'',value:99.999},
    {name:'x'.repeat(81),isin:'',symbol:'',category:'ETF',sector:'Sonstiges',quantity:'',value:1},
    {name:'Falsche ISIN',isin:'123',symbol:'',category:'ETF',sector:'Sonstiges',quantity:'',value:1},
    {name:'Unbekannt',isin:'',symbol:'',category:'Wetten',sector:'Sonstiges',quantity:'',value:1},
    {name:'Negativ',isin:'',symbol:'',category:'ETF',sector:'Sonstiges',quantity:'',value:-5},
    {name:'Branche falsch',isin:'',symbol:'',category:'ETF',sector:'Erfunden',quantity:'',value:5},
  ]}
  const items=readRecognized(raw)
  assert.deepEqual(items.map(item=>[item.name,item.valueCents,item.quantity,item.price]),[['MSCI World',105000,52.5,20],['Bitcoin',10000,null,null]])
  assert.deepEqual(readRecognized('keine Liste'),[])
  assert.match(recognizePrompt,/Branche/u)
})

test('Positionen: Kaufdaten, Wert aus Kurs und Stückzahl, Verlauf pro Tag',()=>{
  const store=new Store(':memory:')
  try {
    const apple=saveHolding(store,{name:'Apple',isin:'US0378331005',category:'Aktie',sector:'Technologie',quantity:'6',buyPrice:'150,5',buyDate:'2026-01-10',price:200,symbol:'AAPL'})
    assert.equal(apple.valueCents,120000)
    assert.equal(investedCents(apple),90300)
    assert.throws(()=>saveHolding(store,{name:'X',category:'Aktie',sector:'Technologie',buyDate:'2999-01-01'}),{status:400})
    assert.throws(()=>saveHolding(store,{name:'X',category:'Aktie',sector:'Technologie',quantity:'abc'}),{status:400})
    assert.throws(()=>saveHolding(store,{name:'X',category:'Aktie',sector:'Technologie'},'gibt-es-nicht'),{status:404})
    const edited=saveHolding(store,{...apple,quantity:10,buyPrice:150.5,buyDate:'2026-01-10',price:210},apple.id)
    assert.equal(edited.valueCents,210000)
    assert.equal(listHoldings(store).length,1)
    saveHolding(store,{name:'Cash',category:'Cash',sector:'Cash',valueCents:5000})
    const state=depotState(store,true)
    assert.equal(state.holdings.length,2)
    assert.equal(state.history.length,1)
    assert.equal(state.history[0].totalCents,215000)
    assert.equal(state.history[0].investedCents,150500)
    removeHolding(store,apple.id)
    assert.equal(depotState(store,true).history[0].totalCents,5000)
    assert.throws(()=>removeHolding(store,'nope'),{status:404})
  } finally {store.db.close()}
})

test('Screenshot-Import aktualisiert bekannte Positionen und behält den Kaufkurs',()=>{
  const store=new Store(':memory:')
  try {
    saveHolding(store,{name:'iShares Core MSCI World',isin:'IE00B4L5Y983',category:'ETF',sector:'Breit gestreut',quantity:50,buyPrice:90,buyDate:'2025-05-05',price:110})
    const incoming=readRecognized({positions:[
      {name:'iShares Core MSCI World',isin:'IE00B4L5Y983',symbol:'',category:'ETF',sector:'Breit gestreut',quantity:'52,3',value:6000},
      {name:'Apple',isin:'',symbol:'',category:'Aktie',sector:'Technologie',quantity:'6',value:1300},
    ]})
    importHoldings(store,incoming,false)
    const holdings=listHoldings(store)
    assert.equal(holdings.length,2)
    const etf=holdings.find(item=>item.name.startsWith('iShares'))!
    assert.equal(etf.buyPrice,90)
    assert.equal(etf.buyDate,'2025-05-05')
    assert.equal(etf.quantity,52.3)
    assert.equal(etf.valueCents,600000)
    importHoldings(store,incoming.slice(1),true)
    assert.deepEqual(listHoldings(store).map(item=>item.name),['Apple'])
    assert.throws(()=>importHoldings(store,[],false),{status:400})
    assert.throws(()=>importHoldings(store,[{name:'',category:'ETF'}],false),{status:400})
  } finally {store.db.close()}
})

test('Suchtreffer und Kursabfrage: nur gültige Werte, Ausreißer werden verworfen, Quelle ist fest',async()=>{
  assert.equal(priceSource,'finanzen.net')
  const candidates=readCandidates({results:[
    {name:'NVIDIA Corp.',isin:'US67066G1040',symbol:'NVDA',category:'Aktie',sector:'Technologie',price:137.2},
    {name:'Ohne Kurs',isin:'',symbol:'',category:'Krypto',sector:'Krypto',price:0},
    {name:'Kaputt',isin:'',symbol:'',category:'Nix',sector:'Krypto',price:1},
  ]})
  assert.deepEqual(candidates.map(item=>[item.name,item.price]),[['NVIDIA Corp.',137.2],['Ohne Kurs',null]])
  const base={isin:'',symbol:'',sector:'Sonstiges' as const,quantity:1,buyPrice:null,buyDate:null,priceAt:null,valueCents:0}
  let prompt=''
  const run=(async(text:string)=>{prompt=text;return {result:{prices:[{index:1,price:210},{index:2,price:5000},{index:3,price:0}]},error:null,metrics:{}}}) as never
  const found=await fetchPrices([{...base,id:'a',name:'Apple',category:'Aktie',price:200},{...base,id:'b',name:'Alt',category:'Aktie',price:100},{...base,id:'c',name:'Neu',category:'ETF',price:null}],AbortSignal.timeout(1000),run)
  assert.deepEqual([...found],[['a',210]])
  assert.match(prompt,/finanzen\.net/u)
  assert.doesNotMatch(prompt,/Stückzahl|Stück:|buy/iu)
})

test('Aktualisieren schreibt Kurse und den Tagesverlauf, Fehler bleiben sichtbar',async()=>{
  const store=new Store(':memory:')
  try {
    const item=saveHolding(store,{name:'Apple',category:'Aktie',sector:'Technologie',quantity:2,buyPrice:100,price:150})
    assert.throws(()=>startRefresh(new Store(':memory:'),async()=>new Map()),{status:409})
    startRefresh(store,async()=>new Map([[item.id,175]]))
    assert.equal(depotJob().running,true)
    assert.throws(()=>startRefresh(store,async()=>new Map()),{status:409})
    for(let i=0;i<50&&depotJob().running;i++) await new Promise(resolve=>setTimeout(resolve,10))
    assert.equal(depotJob().error,null)
    assert.equal(listHoldings(store)[0].valueCents,35000)
    assert.equal(depotState(store,true).history[0].totalCents,35000)
    startRefresh(store,async()=>{throw new Error('Quelle nicht erreichbar')})
    for(let i=0;i<50&&depotJob().running;i++) await new Promise(resolve=>setTimeout(resolve,10))
    assert.equal(depotJob().error,'Quelle nicht erreichbar')
    assert.equal(listHoldings(store)[0].valueCents,35000)
  } finally {store.db.close()}
})

test('Nur PNG und JPEG werden als Screenshot angenommen',()=>{
  assert.equal(imageFormat(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0])),'png')
  assert.equal(imageFormat(Buffer.from([0xff,0xd8,0xff,0xe0])),'jpeg')
  assert.equal(imageFormat(Buffer.from('<svg></svg>')),null)
})
