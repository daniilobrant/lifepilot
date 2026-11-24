import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../../../hub/runtime/store.ts'
import {ingredientStock} from '../../../hub/runtime/recipe-portions.ts'
import {groceryOverview} from '../../../hub/runtime/grocery.ts'
import { budgetCategory } from '../../../hub/runtime/finance-types.ts'
import { markedExpiry, stockRowsFromLabelText } from '../../../hub/runtime/grocery-scan.ts'
import { listRecipes, saveRecipe, checkRecipe, groceryIdeas, putGrocery, updateRecipePortions } from '../../../hub/runtime/grocery.ts'

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
    for(const [name,quantity] of [['Spaghetti','500 g'],['Passierte Tomaten','400 g'],['Zwiebeln','3 Stück'],['Knoblauch','5 Zehen'],['Olivenöl','200 ml']]){
      putGrocery(store,'stock',{name,quantity})
    }
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

test('Recipe portions retain the source quantities and compare only compatible measured stock',()=>{
  const store=new Store(':memory:')
  try{
    putGrocery(store,'stock',{name:'Eier',quantity:'3 Stück'})
    putGrocery(store,'stock',{name:'Knoblauch',quantity:'4 Zehen'})
    putGrocery(store,'stock',{name:'Milch',quantity:'1 L'})
    putGrocery(store,'stock',{name:'Olivenöl'})
    putGrocery(store,'stock',{name:'Mehl',quantity:'2 Dosen'})
    const {id}=saveRecipe(store,{title:'Musterrezept',servings:3,steps:['Mit 1 TL Olivenöl braten.'],
      ingredients:[{name:'Eier',quantity:'3 Stück'},{name:'Knoblauch',quantity:'2 Zehen'},
        {name:'Milch',quantity:'500 ml'},{name:'Olivenöl'},{name:'Mehl',quantity:'100 g'}]})
    assert.equal(listRecipes(store)[0].ingredients[3].quantity,'1 TL')
    assert.deepEqual(ingredientStock(listRecipes(store)[0].ingredients,groceryOverview(store).stock),
      ['enough','enough','enough','unknown','unknown'])
    updateRecipePortions(store,id,6)
    assert.deepEqual(listRecipes(store)[0].ingredients.map(item=>item.quantity),
      ['6 Stück','4 Zehen','1000 ml','2 TL','200 g'])
    assert.equal(listRecipes(store)[0].ingredientChecks[0],false)
    updateRecipePortions(store,id,1)
    updateRecipePortions(store,id,3)
    assert.equal(listRecipes(store)[0].ingredients[3].quantity,'1 TL')
    assert.equal(listRecipes(store)[0].baseServings,3)
    assert.equal(listRecipes(store)[0].servings,3)
  }finally{store.db.close()}
})
