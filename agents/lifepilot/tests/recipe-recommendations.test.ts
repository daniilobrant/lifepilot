import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Store} from '../../../hub/runtime/store.ts'
import {putGrocery,groceryIdeas,groceryOverview,listRecipes} from '../../../hub/runtime/grocery.ts'
import {localRecipePreference,matchesRecipe} from '../../../hub/runtime/recipe-preferences.ts'
import {recipeFromPage} from '../../../hub/connectors/recipe-web.ts'

const pantry=[['Eier','10 Stück'],['Paprika','5 Stück'],['Zwiebel','5 Stück'],['Olivenöl','500 ml'],['Spaghetti','1 kg'],
  ['Passierte Tomaten','1 kg'],['Knoblauch','8 Zehen'],['Reis','1 kg'],['Kartoffeln','2 kg'],['Linsen','1 kg'],
  ['Hähnchen','1 kg'],['Hackfleisch','1 kg'],['Zucchini','4 Stück'],['Kichererbsen','1 kg'],['Karotten','1 kg']]

test('Full pantry offers different complete meals and scarce pantry lists missing amounts',()=>{
  const store=new Store(':memory:')
  try{
    const sparse=groceryIdeas(store)
    assert.ok(sparse.length>=2&&sparse.every(recipe=>recipe.missing.some(ingredient=>ingredient.quantity)))
    for(const [name,quantity] of pantry)putGrocery(store,'stock',{name,quantity})
    const full=groceryIdeas(store,undefined,undefined,2)
    assert.ok(full.length>=3&&full.every(recipe=>recipe.missing.length===0))
    assert.equal(new Set(full.map(recipe=>recipe.title)).size,full.length)
    const preference=localRecipePreference('Mit Fleisch und Kartoffeln als Beilage. Ich bin allergisch gegen Milch und Eier.')
    const selected=groceryIdeas(store,undefined,undefined,2,preference)
    assert.ok(selected.length>=2)
    assert.ok(selected.every(recipe=>recipe.title.includes('Kartoffeln als Beilage')&&recipe.ingredients?.some(item=>item.name==='Kartoffeln'&&item.quantity==='360 g')))
    assert.equal(matchesRecipe([{name:'Rindfleisch'},{name:'Butter'}],preference),false)
    assert.equal(matchesRecipe([{name:'Rindfleisch'},{name:'Pesto'}],preference),false)
  }finally{store.db.close()}
})

test('Choosing one suggestion scales only that recipe and retries retain its decision',()=>{
  const store=new Store(':memory:','private')
  try{
    const run=store.create('Empfiehl Rezepte aus meinem Vorrat','lifepilot',randomUUID(),'ui')
    store.next()
    store.finish(run.id,{skill:'grocery',skillData:{groceryIntent:'ideas',title:null,items:[],steps:[],totalCents:null},tasks:[],questions:[]},
      null,{wallMs:0,model:null,usage:null,cost:null})
    const options=store.present(store.run(run.id)).groceryChange?.options??[]
    assert.ok(options.length>=2)
    assert.throws(()=>store.decideRecipe(run.id,0,{save:true,shop:false,servings:3},'ui'),{status:409})
    assert.equal(store.decideRecipe(run.id,0,{save:true,shop:false,servings:3},'ui',1)?.option,1)
    assert.deepEqual(listRecipes(store).map(recipe=>[recipe.title,recipe.servings]),[[options[1].title,3]])
    assert.equal(groceryOverview(store).shopping.length,0)
    assert.equal(store.decideRecipe(run.id,0,{save:true,shop:true,servings:3},'ui',0)?.option,1)
  }finally{store.db.close()}
})

test('Online recipe source keeps original portions, ingredient data and grouped steps',()=>{
  const html='<script type="application/ld+json">'+JSON.stringify({'@type':'Recipe',name:'Musterpfanne',recipeYield:'4 Portionen',
    recipeIngredient:['300 g Hähnchen','1 Paprika','1 TL Salz','0.5 TL Salz','Pfeffer zum Abschmecken'],
    recipeInstructions:[{'@type':'HowToSection',itemListElement:[{'@type':'HowToStep',text:'Paprika schneiden.'}]}]})+'</script>'
  const recipe=recipeFromPage(html,new URL('https://www.einfachkochen.de/rezepte/musterpfanne?tracking=1'))
  assert.equal(recipe?.servings,4)
  assert.deepEqual(recipe?.ingredients.map(item=>item.quantity),['300 g','1 Stück','7,5 ml','nach Geschmack'])
  assert.deepEqual(recipe?.steps,['Paprika schneiden.'])
  assert.equal(recipe?.url,'https://www.einfachkochen.de/rezepte/musterpfanne')
})
