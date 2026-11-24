import {financeOverview} from '../../../hub/runtime/finance.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Store } from '../../../hub/runtime/store.ts'
import { checkout, checkGrocery, groceryAnswer, groceryCategory, groceryOverview, putGrocery, acceptGroceryRows, listRecipes } from '../../../hub/runtime/grocery.ts'
import { receiptTotal } from '../../../hub/runtime/grocery-types.ts'
import type { GroceryPlan } from '../../../hub/runtime/grocery-types.ts'
import { dateInBerlin, shiftDay } from '../../../hub/runtime/values.ts'

test('Checkout moves only the displayed cart, updates recent items and rejects a repeated request',()=>{
  const store=new Store(':memory:')
  try {
    const {id}=putGrocery(store,'shopping',{name:'Äpfel',quantity:'500 g'})
    const other=putGrocery(store,'shopping',{name:'Hafermilch'}).id
    assert.equal(groceryCategory('Hafermilch'),'drinks')
    checkGrocery(store,id,true)
    assert.throws(()=>store.transaction(()=>checkout(store,[id,other])),{status:409})
    store.transaction(()=>checkout(store,[id]))
    const view=groceryOverview(store)
    assert.equal(view.stock[0].name,'Äpfel')
    assert.equal(view.stock[0].quantity,'500 g')
    assert.equal(view.recent[0].name,'Äpfel')
    assert.equal(view.shopping[0].id,other)
    assert.throws(()=>store.transaction(()=>checkout(store,[id])),{status:409})
  } finally {store.db.close()}
})

test('Recipes check live stock and pending adoption only adds ingredients still missing',()=>{
  const store=new Store(':memory:','private')
  try {
    putGrocery(store,'stock',{name:'Zwiebeln',status:'low'})
    putGrocery(store,'stock',{name:'Milch',expiry:shiftDay(dateInBerlin(),-1)})
    const items=['Zwiebel','Milch','Eier'].map(name=>({name,quantity:null,status:null}))
    const plan:GroceryPlan={groceryIntent:'recipe',title:'Omelett',items,steps:['Alles vorbereiten.'],totalCents:null}
    const answer=groceryAnswer(store,plan)
    assert.deepEqual(answer.available,['Zwiebel · Menge prüfen'])
    assert.deepEqual(answer.missing.map(item=>item.name),['Milch','Eier'])
    putGrocery(store,'stock',{name:'Passierte Tomaten',quantity:'200 g'})
    const measured=groceryAnswer(store,{...plan,items:[{name:'Passierte Tomaten',quantity:'0,4 kg',status:null}]})
    assert.equal(measured.missing[0].name,'Passierte Tomaten')
    const run=store.create('Was fehlt für ein Omelett?','lifepilot',randomUUID(),'cli')
    store.next()
    store.finish(run.id,{tasks:[],questions:[],skill:'grocery',skillData:plan},null,{wallMs:0,model:null,usage:null,cost:null})
    const proposed=store.present(store.run(run.id))
    assert.equal(groceryOverview(store).shopping.length,0)
    putGrocery(store,'stock',{name:'Ei'})
    store.decide(run.id,String(proposed.approvals.at(-1)?.id),'approve','ui')
    assert.deepEqual(groceryOverview(store).shopping.map(item=>item.name),['Milch'])
  } finally {store.db.close()}
})

test('Receipt requires one clear total and receipt checkout rolls back if finance validation fails',()=>{
  assert.equal(receiptTotal('MILCH 1,20\nGesamt\n14,50 EUR\nKARTE 14,50'),1450)
  assert.equal(receiptTotal('Summe 14,50\nGesamt 16,50'),null)
  const store=new Store(':memory:')
  try {
    const expires=shiftDay(dateInBerlin(),3)
    putGrocery(store,'stock',{name:'Milch',quantity:'500 ml',expiry:expires,note:'Angebrochen'})
    store.transaction(()=>acceptGroceryRows(store,'stock',[{name:'Milch',status:'low'}]))
    const milk=groceryOverview(store).stock[0]
    assert.equal(milk.quantity,'500 ml')
    assert.equal(milk.expiry,expires)
    assert.equal(milk.status,'low')
    assert.throws(()=>store.transaction(()=>acceptGroceryRows(store,'receipt',[{name:'Gurke'}],{title:'',cents:100})))
    assert.equal(groceryOverview(store).stock.length,1)
    assert.equal(groceryOverview(store).shopping.length,0)
    store.transaction(()=>acceptGroceryRows(store,'receipt',[{name:'Thai-Chilis'}],{title:'Gesamtrechnung Einkauf',cents:100,date:'2026-10-12'}))
    assert.deepEqual(groceryOverview(store).shopping.map(item=>item.name),['Chili'])
    assert.equal(groceryOverview(store).stock.length,1)
    assert.deepEqual(financeOverview(store,'2026-10').entries.map(item=>[item.title,item.date,item.cents]),
      [['Gesamtrechnung Einkauf','2026-10-12',100]])
  } finally {store.db.close()}
})

test('One confirmed recipe saves the recipe, requested stock and missing ingredients only',()=>{
  const store=new Store(':memory:','private')
  try {
    const run=store.create('Karotte und Knoblauch sind zu Hause. Trag die Karotte ein und plane die Nudeln.',
      'lifepilot',randomUUID(),'ui')
    store.next()
    const plan:GroceryPlan={groceryIntent:'recipe',title:'Mie-Nudeln',totalCents:null,steps:['Alles in der Pfanne braten.'],
      items:[{name:'Karotte',quantity:'1 Stück',status:null},{name:'Knoblauch',quantity:'2 Zehen',status:null},
        {name:'Mie-Nudeln',quantity:'200 g',status:null}],
      onHand:[{name:'Möhren',quantity:'1 Stück',save:true},{name:'Knoblauch',quantity:'2 Zehen',save:false}]}
    store.finish(run.id,{tasks:[],questions:[],skill:'grocery',skillData:plan},null,{wallMs:0,model:null,usage:null,cost:null})
    const proposal=store.present(store.run(run.id))
    assert.deepEqual(proposal.groceryChange?.available,['Karotte','Knoblauch'])
    assert.equal(listRecipes(store).length,0)
    assert.equal(groceryOverview(store).stock.length,0)
    const approval=proposal.approvals.at(-1)!.id as string
    store.decide(run.id,approval,'approve','ui')
    assert.equal(listRecipes(store)[0].title,'Mie-Nudeln')
    assert.deepEqual(groceryOverview(store).stock.map(row=>row.name),['Möhren'])
    assert.deepEqual(groceryOverview(store).shopping.map(row=>[row.name,row.quantity,row.note]),[['Mie-Nudeln','200 g','']])
    assert.throws(()=>store.decide(run.id,approval,'approve','ui'),{status:409})
    assert.equal(listRecipes(store).length,1)
  } finally {store.db.close()}
})

test('Recipe choices are independent, scale ingredients and preserve the decision on retry',()=>{
  const store=new Store(':memory:','private')
  try{
    putGrocery(store,'stock',{name:'Eier',quantity:'4 Stück'})
    const plan:GroceryPlan={groceryIntent:'recipe',title:'Muster-Omelett',servings:2,totalCents:null,
      items:[{name:'Eier',quantity:'4 Stück',status:null},{name:'Olivenöl',quantity:'1½ EL',status:null}],
      steps:['Eier verquirlen und braten.']}
    function propose(){
      const run=store.create('Muster-Omelett für zwei Portionen','lifepilot',randomUUID(),'ui')
      store.next()
      store.finish(run.id,{tasks:[],questions:[],skill:'grocery',skillData:plan},null,{wallMs:0,model:null,usage:null,cost:null})
      return run.id
    }
    const saveOnly=propose()
    assert.equal(store.decideRecipe(saveOnly,0,{save:true,shop:false,servings:1},'ui')?.save,true)
    assert.deepEqual(listRecipes(store).map(recipe=>[recipe.servings,recipe.ingredientChecks,recipe.ingredients[1].quantity]),
      [[1,[true,false],'0,75 EL']])
    assert.equal(groceryOverview(store).shopping.length,0)
    const shopOnly=propose()
    assert.equal(store.decideRecipe(shopOnly,0,{save:false,shop:true,servings:3},'ui')?.added,2)
    assert.equal(listRecipes(store).length,1)
    assert.equal(store.decideRecipe(shopOnly,0,{save:true,shop:true,servings:3},'ui')?.save,false)
    const cancel=propose()
    store.decideRecipe(cancel,0,{save:false,shop:false,servings:2,cancelled:true},'ui')
    assert.equal(store.present(store.run(cancel)).groceryChange?.recipeDecision?.cancelled,true)
    assert.equal(groceryOverview(store).shopping.length,2)
  }finally{store.db.close()}
})
