import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Store} from '../../../hub/runtime/store.ts'
import {parseClothingMail} from '../../../hub/runtime/clothing-mail.ts'
import {scanClothingOrders,clothingOrders,clothingPhotoTargets} from '../../../hub/runtime/clothing-orders.ts'
import {outfitOverview} from '../../../hub/runtime/outfits.ts'

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
