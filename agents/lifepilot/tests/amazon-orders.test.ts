import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Store} from '../../../hub/runtime/store.ts'
import {parseClothingMail} from '../../../hub/runtime/clothing-mail.ts'
import {scanClothingOrders,clothingOrders,clothingPhotoTargets} from '../../../hub/runtime/clothing-orders.ts'
import {outfitOverview} from '../../../hub/runtime/outfits.ts'
import {outfitGarment} from '../../../hub/runtime/outfit-fields.ts'

const text='Vielen Dank für deine Bestellung!\nBestellnr.\n123-4567890-1234567\n* Beispiel USB-C Ladegerät 65W\n  Menge: 1\n  29.35 EUR\n* Beispiel Herren Boxershorts 3er Pack\n  Menge: 1\n  21.47 EUR\nSumme\n50.82 EUR'
const html='<img class="productImage" src="https://m.media-amazon.com/images/I/AAA111._SS90_.jpg" alt="Beispiel USB-C Ladegerät 65W">'+
  '<img class="productImage" src="https://m.media-amazon.com/images/I/BBB222._SS90_.jpg" alt="Beispiel Herren Boxershorts 3er Pack">'
const mail={id:'amazon',subject:'Bestellt: „Beispiel USB-C Ladegerät…“ und 1 weiterer Artikel',from:'Amazon.de <bestellbestaetigung@amazon.de>',
  text,at:'2026-11-18T10:00:00Z',dates:[],truncated:false}

test('Amazon orders track every item with its mail photo and only clothing reaches the wardrobe',()=>{
  const parsed=parseClothingMail(mail,html)!
  assert.equal(parsed.kind,'order')
  assert.equal(parsed.reference,'123-4567890-1234567')
  assert.equal(parsed.items.length,2)
  assert.match(parsed.items[0].image,/AAA111\._SL800_\.jpg$/u)
  assert.equal(parsed.items[0].draft.isClothing,false)
  const store=new Store(':memory:')
  try{
    scanClothingOrders(store,[{...mail,clothing:parsed}],'account')
    const order=clothingOrders(store).find(row=>row.merchant==='Amazon')!
    assert.equal(order.items.length,2)
    const charger=order.items.find(item=>item.draft.isClothing===false)!
    assert.equal(charger.wardrobeId,null)
    assert.ok(charger.canLoadPhoto)
    assert.ok(clothingPhotoTargets(store,order.id).some(target=>target.id===charger.id&&target.wardrobe===null))
    assert.ok(!outfitOverview(store).wardrobe.some(item=>/Ladegerät/u.test(item.name)))
  }finally{store.db.close()}
})

test('Amazon prices with one decimal, tech sleeves and items missing from an existing order are handled',()=>{
  const longName='Beispiel 13,3 Zoll Laptop Tasche Hülle für Notebook, wasserdichte Schutzhülle mit vielen weiteren Angaben '.repeat(2).trim()
  const full={...mail,id:'full',text:'Bestellnr.\n123-4567890-1234567\n* Beispiel Herren Boxershorts 3er Pack\n  Menge: 1\n  21.47 EUR\n* '+longName+'\n  Menge: 1\n  15.9 EUR\n* Beispiel Herren Boxershorts Trunks 3er Pack, Schwarz\n  Menge: 1\n  24.9 EUR\nSumme'}
  const parsed=parseClothingMail(full,'')!
  assert.equal(parsed.items.length,3)
  assert.equal(parsed.items.find(item=>/Laptop/u.test(item.draft.name))!.draft.isClothing,false)
  assert.equal(parsed.items.find(item=>/Trunks/u.test(item.draft.name))!.draft.cents,2490)
  // Unterwäsche wird verfolgt, kommt aber nicht in den Kleiderschrank.
  assert.ok(parsed.items.filter(item=>/Boxershorts/u.test(item.draft.name)).every(item=>item.draft.isClothing===false))
  const store=new Store(':memory:')
  try{
    const first=parseClothingMail({...mail,text:'Bestellnr.\n123-4567890-1234567\n* Beispiel Herren Boxershorts 3er Pack\n  Menge: 1\n  21.47 EUR\nSumme'},'')!
    scanClothingOrders(store,[{...mail,id:'one',clothing:first}],'account')
    scanClothingOrders(store,[{...full,clothing:parsed}],'account')
    const order=clothingOrders(store).find(row=>row.merchant==='Amazon')!
    assert.equal(order.items.length,3)
    assert.equal(Number(store.db.prepare('SELECT count(*) AS n FROM wardrobe_items').get()?.n),0)
  }finally{store.db.close()}
})

test('The same order from two senders of one shop is merged and keeps a single wardrobe piece',()=>{
  const store=new Store(':memory:')
  try{
    const event=(sender:string,merchant:string)=>({reference:'7915991',sender,merchant,kind:'order' as const,tracking:'',partial:false,day:'2026-11-11',deadline:null,
      items:[{sku:'',quantity:1,image:'',draft:{name:'Beispiel Wide Jeans',category:'bottom' as const,isClothing:true,color:'',material:'',fit:'',season:'',tags:'',source:''}}]})
    const base={subject:'Deine Bestellbestätigung',text:'',at:'2026-11-11T10:00:00Z',dates:[],truncated:false}
    scanClothingOrders(store,[{...base,id:'a',from:'Shop <noreply@weekday.com>',clothing:event('weekday.com','Weekday')}],'account')
    store.db.prepare('INSERT INTO clothing_orders (id,account,sender,reference,merchant,ordered_on) VALUES (?,?,?,?,?,?)').run('dup','account','mail2.weekday.com','7915991','mail2.weekday.com','2026-11-11')
    const wardrobe=store.db.prepare("INSERT INTO wardrobe_items (id,name,category,color,material,fit,season,tags,source) VALUES ('w2','Beispiel Wide Jeans','bottom','','','','','','') RETURNING id").get()
    store.db.prepare("INSERT INTO clothing_order_items (id,order_id,item_key,wardrobe_id,details,image_url) VALUES ('i2','dup','x#1',?,?,'')")
      .run(wardrobe!.id,JSON.stringify({name:'Beispiel Wide Jeans',category:'bottom'}))
    scanClothingOrders(store,[],'account')
    assert.equal(clothingOrders(store).filter(row=>row.reference==='7915991').length,1)
    assert.equal(Number(store.db.prepare("SELECT count(*) AS n FROM wardrobe_items WHERE name='Beispiel Wide Jeans'").get()?.n),1)
  }finally{store.db.close()}
})

test('Underwear and socks are recognised before shorts and never count as wardrobe pieces',()=>{
  for (const name of ['Beispiel Herren Boxershorts, Hüft-Shorts, Baumwoll-Unterhosen','Beispiel Trunks 3er Pack','Beispiel Sneakersocken 5er Pack'])
    assert.ok(['Unterwäsche','Socken'].includes(outfitGarment(name)!.garmentType),name)
  assert.equal(outfitGarment('Beispiel Cargo Shorts')!.garmentType,'Shorts')
})

test('An order confirmation without number and items (adidas) is still tracked as ordered',()=>{
  const parsed=parseClothingMail({subject:'Danke für deine Bestellung, Daniil',from:'adidas <adidas@de-info.adidas.com>',
    text:'Du erhältst alle Daten zur Sendungsverfolgung, sobald deine Bestellung unterwegs ist. Danke für deinen Einkauf bei adidas',at:'2026-11-26T00:09:18Z'},'')!
  assert.equal(parsed.kind,'order')
  assert.equal(parsed.merchant,'Adidas')
  assert.equal(parsed.items.length,1)
  assert.equal(parsed.items[0].draft.isClothing,false)
})
