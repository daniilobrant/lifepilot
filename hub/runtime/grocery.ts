import { canonicalGroceryName, groceryCategory, groceryKey } from './grocery-catalog.ts'
import { randomUUID } from 'node:crypto'
import { Problem } from './settings.ts'
import type { Store } from './store.ts'
import { dateInBerlin, isDate, shiftDay } from './values.ts'
import {covers, measured, stockedIngredients, scaleRecipeIngredients, validRecipeServings, legacyRecipeServings} from './recipe-portions.ts'
import { saveFinance } from './finance.ts'
import { groceryCategories, locations, stockStates, type GroceryInput, type StockItem, type ShoppingItem,
  type GroceryOverview, type GroceryPlan, type GroceryAnswer, type GroceryCategory, type SavedRecipe, type RecipeChoice } from './grocery-types.ts'

export { groceryKey } from './grocery-catalog.ts'
export { groceryCategory } from './grocery-catalog.ts'
function defaultLocation(category:GroceryCategory) {
  return category==='frozen'?'freezer':category==='home'||category==='paper'||category==='dental'||category==='care'||category==='pets'?'home':
    category==='dairy'||category==='meat'||category==='plant'||category==='produce'?'fridge':'pantry'
}
function text(value:unknown,length:number) {
  if(value==null) return ''
  if(typeof value!=='string'||value.length>length||/[\x00-\x1f\x7f]/u.test(value)) throw new Problem(400,'Prüfe Name, Menge und Notiz.')
  return value.trim()
}
export function normalizeGrocery(input:unknown): Omit<StockItem,'id'> {
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new Problem(400,'Ungültiger Artikel.')
  const row=input as Record<string,unknown>
  const name=canonicalGroceryName(text(row.name,90))
  if(!groceryKey(name)) throw new Problem(400,'Gib einen Artikelnamen ein.')
  const category = row.category==null ? groceryCategory(name) : groceryCategories.find(([id])=>id===row.category)?.[0]
  if(!category) throw new Problem(400,'Ungültige Kategorie.')
  const location=row.location??defaultLocation(category)
  const status=row.status??'stocked'
  const expiry=row.expiry||null
  if(typeof location!=='string'||!Object.hasOwn(locations,location)||typeof status!=='string'||!Object.hasOwn(stockStates,status)||
      expiry!==null&&!isDate(expiry)) throw new Problem(400,'Ungültiger Lagerort, Bestand oder Datum.')
  return {name,category,quantity:text(row.quantity,50),note:text(row.note,120),location:location as StockItem['location'],status:status as StockItem['status'],expiry:expiry as string|null}
}
export function refreshLegacyGroceryCatalog(store:Store) {
  for (const table of ['grocery_stock','grocery_shopping','grocery_recent']) {
    const identity=table==='grocery_recent'?'key':'id'
    const update=store.db.prepare(`UPDATE ${table} SET data=? WHERE ${identity}=?`)
    const hasKey=store.db.prepare(`SELECT 1 FROM ${table} WHERE key=?`)
    const rekey=store.db.prepare(`UPDATE ${table} SET key=? WHERE ${identity}=?`)
    for (const row of store.db.prepare(`SELECT ${identity} AS id,key,data FROM ${table}`).all()) {
      const current=JSON.parse(String(row.data))
      const name=canonicalGroceryName(current.name,false)
      const suggested=groceryCategory(name)
      const category=current.category==='other' || current.category==='pantry' && ['oil','sauce','breakfast'].includes(suggested) ||
        current.category==='home' && suggested==='paper' || current.category==='care' && suggested==='dental'
        ? suggested :current.category
      if (name!==current.name || category!==current.category) update.run(JSON.stringify({...current,name,category}),row.id)
      const canonical=groceryKey(name)
      if (name!==current.name && canonical!==row.key && !hasKey.get(canonical)) rekey.run(canonical,row.id)
    }
  }
}

export function groceryOverview(store:Store):GroceryOverview {
  return {
    stock:store.db.prepare('SELECT id,data FROM grocery_stock ORDER BY key').all().map(row=>({...JSON.parse(String(row.data)),id:row.id})),
    shopping:store.db.prepare('SELECT id,data,checked FROM grocery_shopping ORDER BY rowid').all().map(row=>({...JSON.parse(String(row.data)),id:row.id,checked:Boolean(row.checked)})),
    recent:store.db.prepare('SELECT key,data FROM grocery_recent ORDER BY purchased_at DESC LIMIT 20').all().map(row=>({...JSON.parse(String(row.data)),id:row.key,checked:false})),
  }
}
function existing(store:Store, table:'grocery_stock'|'grocery_shopping',id:string) {
  if(!store.db.prepare('SELECT 1 FROM '+table+' WHERE id=?').get(id)) throw new Problem(404,'Artikel nicht gefunden.')
}
export function putGrocery(store:Store, place:'stock'|'shopping',input:unknown,id?:string) {
  const product=normalizeGrocery(input)
  const nameKey=groceryKey(product.name)
  const table=place==='stock'?'grocery_stock':'grocery_shopping'
  const duplicate=store.db.prepare('SELECT id FROM '+table+' WHERE key=?').get(nameKey)?.id
  if (!id && duplicate && place==='shopping') {
    const prior=store.db.prepare('SELECT data FROM grocery_shopping WHERE id=?').get(duplicate)
    const previous=JSON.parse(String(prior?.data))
    if (previous.quantity && !product.quantity) product.quantity=previous.quantity
    if (previous.note && !product.note) product.note=previous.note
  }
  if(id && duplicate && duplicate!==id) throw new Problem(409,'Diesen Artikel gibt es bereits.')
  const key=id??(duplicate as string|undefined)??randomUUID()
  const data=JSON.stringify(place==='stock'?product:{name:product.name,category:product.category,quantity:product.quantity,note:product.note,expiry:product.expiry})
  if(id||duplicate) {
    existing(store,table,key)
    store.db.prepare('UPDATE '+table+' SET key=?,data=? WHERE id=?').run(nameKey,data,key)
  } else {
    if(Number(store.db.prepare('SELECT count(*) AS n FROM '+table).get()?.n)>=500) throw new Problem(409,'In dieser Liste sind bereits 500 Artikel.')
    store.db.prepare('INSERT INTO '+table+' (id,key,data) VALUES (?,?,?)').run(key,nameKey,data)
  }
  return {id:key}
}
export function removeGrocery(store:Store,place:'stock'|'shopping',id:string) {
  const table=place==='stock'?'grocery_stock':'grocery_shopping'
  existing(store,table,id)
  store.db.prepare('DELETE FROM '+table+' WHERE id=?').run(id)
}
export function checkGrocery(store:Store,id:string,checked:boolean) {
  existing(store,'grocery_shopping',id)
  store.db.prepare('UPDATE grocery_shopping SET checked=? WHERE id=?').run(Number(checked),id)
}
function stockByName(store:Store,key:string) {
  const prior=store.db.prepare('SELECT data FROM grocery_stock WHERE key=?').get(key)
  return prior ? normalizeGrocery(JSON.parse(String(prior.data))) : null
}
function receive(store:Store,input:GroceryInput) {
  const item=normalizeGrocery(input),key=groceryKey(item.name)
  const saved=stockByName(store,key)
  putGrocery(store,'stock',{...item,...(saved?{location:saved.location,note:saved.note||item.note}:{}),status:'stocked'})
  store.db.prepare('DELETE FROM grocery_shopping WHERE key=?').run(key)
  store.db.prepare('INSERT INTO grocery_recent VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,purchased_at=excluded.purchased_at')
    .run(key,JSON.stringify({name:item.name,category:item.category,quantity:item.quantity,note:item.note}),new Date().toISOString())
}
function capHistory(store:Store) {
  store.db.exec('DELETE FROM grocery_recent WHERE key IN (SELECT key FROM grocery_recent ORDER BY purchased_at DESC LIMIT -1 OFFSET 100)')
}
export function checkout(store:Store, expected:string[]) {
  const items=groceryOverview(store).shopping.filter(item=>item.checked)
  if(!items.length||items.map(item=>item.id).sort().join()!==[...expected].sort().join()) throw new Problem(409,'Der Einkaufswagen hat sich geändert. Prüfe ihn erneut.')
  for(const item of items) receive(store,item)
  capHistory(store)
}
export function acceptGroceryRows(store:Store,kind:'stock'|'receipt',rows:GroceryInput[],receipt?:{title:string,cents:number,date?:string}) {
  for(const row of rows) {
    if(kind==='receipt') putGrocery(store,'shopping',row)
    else {
      const current=stockByName(store,groceryKey(row.name))
      putGrocery(store,'stock',{
        ...row,
        ...(current?{location:current.location, expiry:row.expiry??current.expiry, note:row.note||current.note,
          quantity:row.quantity||current.quantity,status:row.status??current.status}:{}),
      })
    }
  }
  if(receipt) {
    const day=receipt.date??dateInBerlin()
    saveFinance(store,{kind:'expense',title:receipt.title,cents:receipt.cents,category:'Lebensmittel & Einkauf',date:day},day.slice(0,7))
  }
}

const meals: { title:string, items:[string,string][], steps:string[] }[] = [
  {title:'Tomatenpasta',items:[['Spaghetti','100 g'],['Passierte Tomaten','150 g'],['Zwiebel','½ Stück'],['Knoblauch','1 Zehe'],['Olivenöl','1 EL']],steps:['Spaghetti nach Packungsangabe kochen.','Zwiebel und Knoblauch in Olivenöl anschwitzen, Tomaten dazugeben und einkochen.','Pasta mit der Sauce mischen.']},
  {title:'Pasta Bolognese',items:[['Spaghetti','100 g'],['Hackfleisch','125 g'],['Passierte Tomaten','150 g'],['Zwiebel','½ Stück'],['Knoblauch','1 Zehe'],['Olivenöl','1 EL'],['Parmesan','15 g']],steps:['Zwiebel und Knoblauch fein schneiden und in Olivenöl anbraten.','Hackfleisch anbraten, Tomaten dazugeben und die Sauce köcheln.','Spaghetti kochen und mit Sauce und Parmesan servieren.']},
  {title:'Gemüseomelett',items:[['Eier','2 Stück'],['Paprika','½ Stück'],['Zwiebel','½ Stück'],['Olivenöl','1 TL']],steps:['Gemüse klein schneiden und in der Pfanne anschwitzen.','Eier verquirlen, darübergeben und stocken lassen.']},
  {title:'Kichererbsensalat',items:[['Kichererbsen','150 g'],['Gurke','½ Stück'],['Tomaten','1 Stück'],['Zitrone','½ Stück'],['Olivenöl','1 EL']],steps:['Abgetropfte Kichererbsen und geschnittenes Gemüse mischen.','Zitronensaft und Olivenöl als Dressing dazugeben.']},
  {title:'Bananen-Porridge',items:[['Haferflocken','50 g'],['Milch','200 ml'],['Banane','1 Stück']],steps:['Haferflocken mit Milch unter Rühren aufkochen.','Banane schneiden und zum Porridge geben.']},
  {title:'Kartoffel-Gemüse-Pfanne',items:[['Kartoffeln','250 g'],['Zucchini','½ Stück'],['Paprika','½ Stück'],['Zwiebel','½ Stück'],['Olivenöl','1 EL']],steps:['Kartoffeln würfeln und in Öl anbraten.','Geschnittenes Gemüse dazugeben und zusammen garen.']},
]
function unique(items:GroceryInput[]) {
  return [...new Map(items.map(item=>[groceryKey(item.name),item])).values()]
}
export function groceryAnswer(store:Store,plan:GroceryPlan,day=dateInBerlin()):GroceryAnswer {
  const {stock,shopping}=groceryOverview(store)
  const known=new Map(stock.map(item=>[groceryKey(item.name),item]))
  const candidate=(name:string)=>known.get(groceryKey(name))
  const available=(name:string)=>covers(candidate(name),{name},day)
  const empty={title:'',available:[],missing:[],steps:[],write:null,rows:[]} satisfies GroceryAnswer
  const proposed=unique(plan.items.map(row=>({name:row.name,quantity:row.quantity??'',status:row.status??undefined})))
  if(plan.groceryIntent==='stock_read') return {...empty,title:'Aktueller Vorrat',available:stock.filter(x=>available(x.name)).slice(0,40).map(x=>x.name+(x.status==='low'?' · knapp':''))}
  if(plan.groceryIntent==='list_read') return {...empty,title:'Noch zu kaufen',available:shopping.filter(x=>!x.checked).slice(0,40).map(x=>x.name)}
  if(plan.groceryIntent==='shop_remove') {
    const keys=new Set(proposed.map(item=>groceryKey(item.name)))
    const rows=shopping.filter(item=>keys.has(groceryKey(item.name)))
    return {...empty,title:'Von der Einkaufsliste entfernen',rows,write:rows.length?'remove':null}
  }
  if(plan.groceryIntent==='stock_add'||plan.groceryIntent==='receipt')return {...empty,title:plan.title??'Vorrat aktualisieren',
    rows:proposed,write:proposed.length?plan.groceryIntent==='receipt'?'receipt':'stock':null,
    ...(plan.totalCents!==null&&plan.groceryIntent==='receipt'?{totalCents:plan.totalCents}:{})}
  if(plan.groceryIntent==='ideas') return {...groceryIdeas(store,day,stock,plan.servings??1)[0],write:null}
  const requested=proposed
  const mentioned = new Map((plan.onHand ?? []).map(item=>[groceryKey(item.name),item]))
  const has = (item:GroceryInput) => {
    const supplied=mentioned.get(groceryKey(item.name))
    if (supplied) {
      const have=measured(supplied.quantity ?? ''), need=measured(item.quantity)
      if (!have || !need || have.kind!==need.kind || have.value>=need.value) return true
    }
    return covers(candidate(item.name),item,day)
  }
  const stockRows = unique((plan.onHand ?? []).filter(item=>item.save)
    .map(item=>({name:item.name,quantity:item.quantity??''})))
  const recipe=plan.groceryIntent==='recipe' && plan.steps.length>0
  const queued=new Set(shopping.map(item=>groceryKey(item.name)))
  const have=requested.filter(has).map(x=>x.name+(candidate(x.name)?.status==='low'?' · Menge prüfen':''))
  const missing=requested.filter(x=>!has(x))
  const rows=missing.filter(x=>!queued.has(groceryKey(x.name)))
  return {...empty,title:plan.title??'Einkaufsliste prüfen',available:have,missing,rows,write:recipe?'recipe':rows.length?'shop':null,steps:plan.steps,...(recipe?{ingredients:requested,stockRows,servings:plan.servings??legacyRecipeServings}:{})}
}
export function adoptGrocery(store:Store,answer:GroceryAnswer,day=dateInBerlin()) {
  if(answer.write==='stock'||answer.write==='receipt') {
    acceptGroceryRows(store,answer.write,answer.rows)
    return
  }
  if(answer.write==='remove') {
    for(const row of answer.rows) {
      if(row.id && store.db.prepare('SELECT 1 FROM grocery_shopping WHERE id=? AND key=?').get(row.id,groceryKey(row.name))) {
        removeGrocery(store,'shopping',row.id)
      }
    }
    return
  }
  if(answer.write==='recipe') {
    saveRecipe(store,answer)
    for (const item of answer.stockRows ?? []) {
      const existing=groceryOverview(store).stock.find(row=>groceryKey(row.name)===groceryKey(item.name))
      if (existing?.status==='stocked' && !item.quantity) continue
      putGrocery(store,'stock',existing ? {...existing,...item,quantity:item.quantity || existing.quantity,status:'stocked'} : item)
    }
  }
  if(answer.write!=='shop' && answer.write!=='recipe') throw new Problem(409,'Kein Einkaufsentwurf vorhanden.')
  const view=groceryOverview(store)
  for(const row of answer.rows) {
    const key=groceryKey(row.name)
    if(view.shopping.some(item=>groceryKey(item.name)===key)||
      view.stock.some(item=>groceryKey(item.name)===key&&covers(item,row,day))) continue
    putGrocery(store,'shopping',{...row,note:''})
  }
}

export function groceryIdeas(store:Store,day=dateInBerlin(),stock=groceryOverview(store).stock,servings=1) {
  const available=new Map(stock.map(item=>[groceryKey(item.name),item]))
  const soon=shiftDay(day,2)
  const ranked=meals.map(meal=>{
    const ingredients=scaleRecipeIngredients(meal.items.map(([name,quantity])=>({name,quantity})),1,servings)
    const present=ingredients.map(ingredient=>{
      const item=available.get(groceryKey(ingredient.name))
      return covers(item,ingredient,day)?item:undefined
    }).filter(Boolean)
    return {meal,ingredients,missing:meal.items.length-present.length,priority:present.filter(item=>item?.status==='low'||item?.expiry&&item.expiry<=soon).length}
  }).sort((a,b)=>a.missing-b.missing||b.priority-a.priority)
  return ranked.slice(0,3).map(({meal,ingredients})=>groceryAnswer(store,{
    groceryIntent:'recipe',title:meal.title,items:ingredients.map(({name,quantity})=>({name,quantity:quantity??null,status:null})),
    steps:meal.steps,totalCents:null,servings,
  },day))
}

function recipeFields(value:unknown) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Problem(400,'Ungültiges Rezept.')
  const {title,ingredients,steps,servings}=value as Record<string,unknown>
  if(!Array.isArray(ingredients)||ingredients.length<1||ingredients.length>30||!Array.isArray(steps)||steps.length<1||steps.length>12) {
    throw new Problem(400,'Das Rezept braucht Zutaten und Zubereitungsschritte.')
  }
  if(servings!==undefined&&!validRecipeServings(servings))throw new Problem(400,'Wähle zwischen 1 und 24 Portionen.')
  const name=text(title,120)
  const instructions=steps.map(step=>text(step,280))
  if(!name||instructions.some(step=>!step)) throw new Problem(400,'Rezeptname und Schritte sind erforderlich.')
  return {title:name,ingredients:ingredients.map(item=>{
    const {name,quantity}=normalizeGrocery(item)
    return {name,quantity}
  }),steps:instructions,servings:validRecipeServings(servings)?servings:legacyRecipeServings}
}
export function listRecipes(store:Store):SavedRecipe[] {
  return store.db.prepare('SELECT id,data,created_at FROM grocery_recipes ORDER BY created_at DESC,rowid DESC LIMIT 200').all()
    .map(row=>({...JSON.parse(String(row.data)),id:row.id,savedAt:row.created_at}))
}
export function saveRecipe(store:Store,value:unknown) {
  const data=recipeFields(value)
  const past=listRecipes(store)
  const repeated=past.find(recipe=>recipe.title===data.title &&
    JSON.stringify([recipe.ingredients,recipe.steps,recipe.servings??legacyRecipeServings])===JSON.stringify([data.ingredients,data.steps,data.servings]))
  if(repeated)return {id:repeated.id}
  if(past.length>=200)throw new Problem(409,'Hier sind bereits 200 Rezepte gespeichert.')
  const id=randomUUID()
  store.db.prepare('INSERT INTO grocery_recipes VALUES (?,?,?)').run(id,JSON.stringify({...data,
    ingredientChecks:stockedIngredients(data.ingredients,groceryOverview(store).stock),ingredientOverrides:data.ingredients.map(()=>null),stepChecks:data.steps.map(()=>false)}),new Date().toISOString())
  return {id}
}
export function applyRecipeChoice(store:Store,answer:GroceryAnswer,choice:RecipeChoice) {
  if(!choice.save&&!choice.shop)return {...choice,added:0}
  const recipe=recipeFields(answer)
  const ingredients=scaleRecipeIngredients(recipe.ingredients,recipe.servings,choice.servings)
  const view=groceryOverview(store)
  const checks=stockedIngredients(ingredients,view.stock)
  const queued=new Set(view.shopping.map(item=>groceryKey(item.name)))
  const missing=ingredients.filter((item,index)=>!checks[index]&&!queued.has(groceryKey(item.name)))
  if(choice.save)saveRecipe(store,{...recipe,ingredients,servings:choice.servings})
  if(choice.shop&&missing.length)adoptGrocery(store,{...answer,write:'shop',rows:missing})
  return {...choice,added:choice.shop?missing.length:0}
}
export function checkRecipe(store:Store,id:string,part:'ingredients'|'steps',index:number,checked:boolean) {
  const row=store.db.prepare('SELECT data FROM grocery_recipes WHERE id=?').get(id)
  if(!row)throw new Problem(404,'Rezept nicht gefunden.')
  const recipe=JSON.parse(String(row.data)) as SavedRecipe
  const values=part==='ingredients'?recipe.ingredientChecks:recipe.stepChecks
  if(!Number.isSafeInteger(index)||index<0||index>=values.length)throw new Problem(400,'Ungültiger Checklisteneintrag.')
  values[index]=checked
  if(part==='ingredients'){
    const overrides=recipe.ingredientOverrides??recipe.ingredients.map((_,i)=>i!==index&&recipe.ingredientChecks[i]?true:null)
    overrides[index]=checked
    recipe.ingredientOverrides=overrides
  }
  store.db.prepare('UPDATE grocery_recipes SET data=? WHERE id=?').run(JSON.stringify(recipe),id)
  return {ok:true}
}
export function removeRecipe(store:Store,id:string) {
  if(!store.db.prepare('DELETE FROM grocery_recipes WHERE id=?').run(id).changes)throw new Problem(404,'Rezept nicht gefunden.')
  return {ok:true}
}
