import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../../../hub/runtime/store.ts'
import { budgetCategory } from '../../../hub/runtime/finance-types.ts'
import { markedExpiry, stockRowsFromLabelText } from '../../../hub/runtime/grocery-scan.ts'
import { listRecipes, saveRecipe, checkRecipe, groceryIdeas, putGrocery } from '../../../hub/runtime/grocery.ts'

test('Budget categories include recurring bills, fitness and health with explicit classification',()=>{
  assert.equal(budgetCategory({title:'Kfz-Versicherung',category:'',kind:'fixed'}),'Versicherung & Verwaltung')
  assert.equal(budgetCategory({title:'Kontaktlinsen',category:'',kind:'fixed'}),'Gesundheit & Pflege')
  assert.equal(budgetCategory({title:'Fitnessstudio',category:'',kind:'subscription'}),'Freizeit & Abos')
  assert.equal(budgetCategory({title:'Apothekenbedarf',category:'Bildung & Arbeit',kind:'fixed'}),'Bildung & Arbeit')
})

test('A product expiry must be attributed to an explicit, unique and valid printed label',()=>{
  assert.equal(markedExpiry('Vollmilch\nMHD: 14.02.2027\nLot 18.01.2027'),'2027-02-14')
  assert.equal(markedExpiry('verpackt am 21.02.2027'),null)
  assert.equal(markedExpiry('MHD 14.02.2027\nEXP 16.02.27'),null)
  assert.equal(markedExpiry('MHD 31.02.2027'),null)
})

test('Recipe suggestions prefer complete dishes and saved checks survive repeat saves',()=>{
  const store=new Store(':memory:')
  try {
    for(const name of ['Spaghetti','Passierte Tomaten','Zwiebeln','Knoblauch','Olivenöl'])putGrocery(store,'stock',{name})
    const idea=groceryIdeas(store)[0]
    assert.equal(idea.title,'Tomatenpasta')
    assert.deepEqual(idea.missing,[])
    const first=store.transaction(()=>saveRecipe(store,idea))
    store.transaction(()=>checkRecipe(store,first.id,'ingredients',1,true))
    store.transaction(()=>checkRecipe(store,first.id,'steps',0,true))
    assert.equal(store.transaction(()=>saveRecipe(store,idea)).id,first.id)
    assert.equal(listRecipes(store).length,1)
    assert.equal(listRecipes(store)[0].ingredientChecks[1],true)
    assert.equal(listRecipes(store)[0].stepChecks[0],true)
    assert.throws(()=>checkRecipe(store,first.id,'steps',999,true),{status:400})
  } finally {store.db.close()}
})

test('Stock OCR accepts known labels, quantities and aliases without guessing from package copy',()=>{
  const text='MILCH 1 L\nVollmilch\nThai-Chilis\nMHD 14.02.2027\nMit ausgewähltem Salz verfeinert'
  assert.deepEqual(stockRowsFromLabelText(text).map(row=>[row.name,row.category]),[
    ['Milch','dairy'],['Chili','produce'],
  ])
})
