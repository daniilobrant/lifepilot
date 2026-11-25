import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completeQuantity, defaultUnit, groceryUnits, metricQuantity, parseQuantity } from '../../../hub/runtime/grocery-units.ts'
import { groceryCategory } from '../../../hub/runtime/grocery-catalog.ts'
import { quickReplyFor } from '../../../hub/ui/chat-quick-replies.ts'

test('Pantry items get units, realistic quantities and fitting categories',()=>{
  assert.equal(completeQuantity('Schinken','2'),'200 g')
  assert.equal(completeQuantity('Milch',''),'1000 ml')
  assert.equal(completeQuantity('Kartoffeln',''),'1 kg')
  assert.equal(completeQuantity('Tomaten','2'),'2 Stück')
  assert.equal(completeQuantity('Hähnchenbrustfilet','250 g'),'250 g')
  assert.equal(completeQuantity('Basilikum','1 Handvoll Blätter'),'25 g')
  assert.equal(defaultUnit('Olivenöl'),'ml')
  assert.deepEqual(parseQuantity('1,5 kg'),{amount:'1,5',unit:'kg',rest:''})
  assert.equal(groceryCategory('Schinken'),'meat')
  assert.equal(groceryCategory('Thai-Basilikum'),'herbs')
  assert.equal(groceryCategory('Kidneybohnen'),'canned')
  assert.equal(groceryCategory('Backpulver'),'baking')
})

test('Only five units exist and household measures become grams or millilitres',()=>{
  assert.deepEqual([...groceryUnits],['Stück','g','kg','ml','l'])
  assert.equal(metricQuantity('Olivenöl','2 EL'),'30 ml')
  assert.equal(metricQuantity('Salz','1 TL'),'5 g')
  assert.equal(metricQuantity('Passierte Tomaten','1 Dose'),'400 g')
  assert.equal(metricQuantity('Knoblauch','2 Zehen'),'2 Stück')
  assert.equal(metricQuantity('Petersilie','1 Bund'),'30 g')
  assert.equal(metricQuantity('Gouda','3 Scheiben'),'60 g')
  assert.equal(metricQuantity('Milch','1 Flasche'),'1 l')
})

test('Clarifying questions offer two choices plus none, or yes and no',()=>{
  assert.deepEqual(quickReplyFor(['Meinst du Thai-Basilikum oder normales Basilikum?']),{kind:'choices',choices:['Thai-Basilikum','Normales Basilikum','Keins von beiden']})
  assert.deepEqual(quickReplyFor(['Meinst du mit „Raps“ Rapsöl oder etwas anderes?']),{kind:'choices',choices:['Rapsöl','Etwas anderes']})
  assert.deepEqual(quickReplyFor(['Soll ich Schinken auf die Einkaufsliste setzen?']),{kind:'choices',choices:['Ja','Nein']})
})
