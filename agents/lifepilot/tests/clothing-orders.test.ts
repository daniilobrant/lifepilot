import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseClothingMail } from '../../../hub/runtime/clothing-mail.ts'
import { bookOrderFinance, changeClothingOrder, clothingOrders, clothingPhotoTargets, scanClothingOrders, updateClothingTask } from '../../../hub/runtime/clothing-orders.ts'
import { Store } from '../../../hub/runtime/store.ts'
import { OutfitStudio, outfitOverview } from '../../../hub/runtime/outfits.ts'
import { dateInBerlin } from '../../../hub/runtime/values.ts'
import type { MailContent } from '../../../hub/connectors/google.ts'

const email=(id:string,subject:string,text:string,from='Beispielmode <shop@beispielmode.example>'):MailContent=>({
  id,subject,text,from,dates:[],truncated:false,at:new Date().toISOString(),
})
const ref='LP-39241'
const order=email('order','Deine Bestellbestätigung','Bestellnummer '+ref+'\nArtikel: Baumwoll-T-Shirt\nFarbe: Weiß\nGröße: M\nArtikel: Schwarze Hose\nGröße: 42\nArtikel: Roter Pullover\nGröße: L')
const received=email('arrived','Dein Paket wurde zugestellt','Bestellnummer '+ref)
const tracking='003404340012345678'
const delivery=email('carrier','Deine Sendung wurde zugestellt','Sendungsnummer: '+tracking,'Kurier <paket@kurier.example>')
const inquire=email('ship','Versandbestätigung','Bestellnummer '+ref+'\nSendungsnummer: '+tracking+'\nTeillieferung\nArtikel: Baumwoll-T-Shirt\nFarbe: Weiß\nGröße: M')

test('Clothing order values are taken from the mail with sanitized image and product URLs',()=>{
  const html='<script type="application/ld+json">'+JSON.stringify({
    '@type':'Order',orderNumber:ref,merchant:{name:'Beispielmode'},acceptedOffer:[
      {eligibleQuantity:{value:2},itemOffered:{name:'Baumwoll-T-Shirt',brand:{name:'Beispiel'},color:'Weiß',size:'M',
        image:'https://cdn.beispielmode.example/products/shirt.jpg?recipient=test',url:'https://beispielmode.example/products/shirt?color=white&utm_source=email'}},
      {itemOffered:{name:'Bluetooth-Box'}},
    ],
  })+'</script>'
  const value=parseClothingMail(order,html)!
  assert.equal(value.items.length,2)
  assert.equal(value.items[1].draft.isClothing,false)
  assert.equal(value.items[0].quantity,2)
  assert.equal(value.items[0].draft.size,'M')
  assert.equal(value.items[0].image,'https://cdn.beispielmode.example/products/shirt.jpg')
  assert.equal(value.items[0].draft.source,'https://beispielmode.example/products/shirt?color=white')
  assert.equal(parseClothingMail(email('promo','Newsletter · Bestellbestätigung',order.text),html),undefined)
  assert.equal(parseClothingMail(email('unknown','Versandbestätigung','2 x Baumwoll-T-Shirt')),undefined)
  assert.equal(parseClothingMail(email('other','Deine Bestellbestätigung','Bestellnummer '+ref+'\nArtikel: Bluetooth-Box'))?.items[0].draft.isClothing,false)
})

test('Out-of-order tracking marks only delivered items and deduplicates an order across repeated Gmail scans',()=>{
  const store=new Store(':memory:')
  try {
    scanClothingOrders(store,[delivery,inquire],'account-a')
    assert.equal(clothingOrders(store).length,0)
    scanClothingOrders(store,[order,order],'account-a')
    const [current]=clothingOrders(store)
    assert.equal(current.items.length,3)
    assert.equal(current.items[0].arrived,true)
    assert.equal(current.items[1].arrived,false)
    assert.equal(current.deliveredOn,null)
    assert.equal(outfitOverview(store).wardrobe.length,0)
    assert.throws(()=>new OutfitStudio().generate(store,{mode:'anchor',style:'Schlicht',required:[current.items[0].wardrobeId],variant:0}),{status:409})
    assert.throws(()=>changeClothingOrder(store,current.id,'return',current.items[1].id),{status:409})
    scanClothingOrders(store,[received,delivery,inquire,order],'account-a')
    const [arrived]=clothingOrders(store)
    assert.ok(arrived.items.every(item=>item.arrived))
    assert.equal(arrived.deliveredOn,dateInBerlin())
    assert.equal(clothingOrders(store).length,1)
  } finally {store.db.close()}
})

test('Only declined items create one deadline task and either checklist marks the matching article returned',()=>{
  const store=new Store(':memory:')
  try {
    scanClothingOrders(store,[received,order],'account-a')
    const [{id,items}]=clothingOrders(store)
    const [shirt,trousers,pullover]=items
    assert.equal(changeClothingOrder(store,id,'kept',shirt.id).taskId,null)
    assert.deepEqual(outfitOverview(store).wardrobe.map(item=>item.id),[shirt.wardrobeId])
    const first=changeClothingOrder(store,id,'return',trousers.id)
    const taskId=first.taskId!
    assert.ok(taskId)
    assert.equal(outfitOverview(store).wardrobe.some(item=>item.id===trousers.wardrobeId),false)
    assert.equal(changeClothingOrder(store,id,'return',pullover.id).taskId,taskId)
    assert.equal(store.workspace.list().length,1)
    changeClothingOrder(store,id,'deadline',undefined,'2090-10-24')
    assert.equal(store.workspace.get(taskId).due_date,'2090-10-24')
    changeClothingOrder(store,id,'returned',trousers.id)
    const firstTask=store.workspace.get(taskId)
    assert.deepEqual(firstTask.steps.map(item=>item.done),[true,false])
    updateClothingTask(store,taskId,firstTask.revision,{steps:firstTask.steps.map(step=>({...step,done:true}))},'ui')
    assert.equal(store.workspace.get(taskId).status,'done')
    assert.deepEqual(clothingOrders(store)[0].items.map(item=>item.decision),['kept','returned','returned'])
    assert.equal(clothingPhotoTargets(store,id).length,0)
  } finally {store.db.close()}
})

test('Keeping every garment leaves no return task',()=>{
  const store=new Store(':memory:')
  try {
    scanClothingOrders(store,[order],'account-b')
    const [{id,items}]=clothingOrders(store)
    changeClothingOrder(store,id,'received')
    for (const item of items) changeClothingOrder(store,id,'kept',item.id)
    assert.equal(clothingOrders(store)[0].taskId,null)
    assert.equal(store.workspace.list().length,0)
    assert.ok(outfitOverview(store).wardrobe.every(item=>!item.orderState))
  } finally {store.db.close()}
})

test('A mixed order tracks non-clothing returns and books separate confirmed movements once',()=>{
  const store=new Store(':memory:')
  try {
    const mixed={...order,text:'Bestellnummer '+ref+'\nArtikel: Bluetooth-Box\nArtikel: Baumwoll-T-Shirt\nGröße: M'}
    scanClothingOrders(store,[mixed,received],'account-a')
    const [{id,items}]=clothingOrders(store)
    const [speaker,shirt]=items
    assert.equal(speaker.draft.isClothing,false)
    assert.equal(speaker.wardrobeId,null)
    assert.throws(()=>bookOrderFinance(store,id,'refund',dateInBerlin(),1500))
    assert.equal(changeClothingOrder(store,id,'kept',speaker.id).items[0].wardrobeId,null)
    assert.equal(changeClothingOrder(store,id,'kept',shirt.id).status,'closed')
    assert.deepEqual(outfitOverview(store).wardrobe.map(item=>item.id),[shirt.wardrobeId])
    assert.equal(changeClothingOrder(store,id,'return',speaker.id).status,'return')
    assert.equal(changeClothingOrder(store,id,'returned',speaker.id).status,'closed')
    assert.equal(bookOrderFinance(store,id,'purchase',dateInBerlin(),2500).totals.purchaseBooked,true)
    assert.equal(bookOrderFinance(store,id,'refund',dateInBerlin(),1500).totals.refundBooked,true)
    bookOrderFinance(store,id,'refund',dateInBerlin(),1500)
    assert.equal(store.db.prepare('SELECT count(*) AS total FROM order_finance_entries').get()?.total,2)
  } finally {store.db.close()}
})


test('Month filtering includes confirmed order decisions occurring after delivery',()=>{
  const store=new Store(':memory:')
  try {
    scanClothingOrders(store,[{...order,at:'2025-12-30T12:00:00Z'},{...received,at:'2026-01-02T12:00:00Z'}],'account-a')
    const [tracked]=clothingOrders(store,'2025-12')
    assert.equal(clothingOrders(store,'2026-01')[0].id,tracked.id)
    assert.deepEqual(clothingOrders(store,'2025-11'),[])
    const before=tracked.items[0].wardrobeId
    changeClothingOrder(store,tracked.id,'return',tracked.items[0].id)
    const kept=changeClothingOrder(store,tracked.id,'kept',tracked.items[0].id)
    assert.equal(kept.items[0].wardrobeId,before)
    assert.equal(clothingOrders(store,dateInBerlin().slice(0,7))[0].id,tracked.id)
    assert.equal(clothingOrders(store,'2025-11',tracked.id)[0].id,tracked.id)
  } finally {store.db.close()}
})

test('An order item with a verified product link can queue a photo without a known color',()=>{
  const store=new Store(':memory:')
  try {
    const source='https://beispielmode.example/products/shirt'
    const html='<script type="application/ld+json">'+JSON.stringify({
      '@type':'Order',orderNumber:ref,acceptedOffer:[
        {itemOffered:{name:'Baumwoll-T-Shirt',url:source}},
        {itemOffered:{name:'Schwarze Hose'}},
      ],
    })+'</script>'
    const parsed=parseClothingMail(order,html)!
    scanClothingOrders(store,[{...order,clothing:parsed}],'test-account')
    const [tracked]=clothingOrders(store)
    assert.equal(tracked.items[0].canLoadPhoto,true)
    assert.equal(tracked.items[1].canLoadPhoto,false)
    assert.deepEqual(clothingPhotoTargets(store,tracked.id).map(item=>item.source),[source])
  } finally {store.db.close()}
})
