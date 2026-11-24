import {matchesRecipe} from '../runtime/recipe-preferences.ts'
import {publicRecipeHtml,searchProductPages} from './outfit-import.ts'
import {groceryKey,grocerySearchKey} from '../runtime/grocery-catalog.ts'
import type {GroceryInput,RecipePreference,RecipeSource,StockItem} from '../runtime/grocery-types.ts'
import {hasRecipeQuantity,measured,validRecipeServings} from '../runtime/recipe-portions.ts'

const sites=new Set(['www.rewe.de','www.einfachkochen.de','www.lecker.de','www.chefkoch.de','www.essen-und-trinken.de','eatsmarter.de'])
const publicFoodTerms=['Hähnchen','Rind','Hackfleisch','Lachs','Kartoffeln','Reis','Nudeln','Paprika','Tomaten','Zucchini','Kichererbsen',
  'Linsen','Tofu','Eier','Haferflocken','Brokkoli','Karotten','Champignons','Gurke','Bohnen','Spinat']
const collections=['https://www.einfachkochen.de/rezepte','https://www.rewe.de/rezeptsammlung/gemuesepfannen/']

function isRecipePage(url:URL){
  return url.protocol==='https:'&&sites.has(url.hostname)&&(/^\/(?:rezepte|rezept)\/.+/iu.test(url.pathname)||url.hostname==='www.lecker.de'&&/\/[^/]+-\d+\.html$/iu.test(url.pathname))
}
function clean(value:unknown){
  if(typeof value!=='string')return ''
  return value.replace(/<[^>]*>/gu,' ').replace(/&(?:amp|nbsp|quot|apos|#39);/gu,entity=>
    ({'&amp;':'&','&nbsp;':' ','&quot;':'"','&apos;':"'",'&#39;':"'"})[entity]??' ')
    .replace(/[\s\u0000-\u001f\u007f]+/gu,' ').trim()
}
const ingredientLine=/^((?:\d+(?:[,.]\d+)?(?:\s*[½¼¾⅓⅔⅛]|\s*\/\s*\d+)?|[½¼¾⅓⅔⅛]))\s*(?:(kg|g|ml|l|el|tl|stück|stk\.?|zehen?|scheiben?|dosen?|prisen?|bund|msp\.?)\s+)?(.+)$/iu
function ingredient(value:unknown){
  const line=clean(value).replace(/^\d+(?:[,.]\d+)?\s*[-–]\s*(?=\d)/u,'')
    .replace(/^(\S+)\s+(?:große|kleine)\s+(?=prise)/iu,'$1 ')
    .replace(/^(\S+)(?=(?:tl|el|ml|kg)\b)/iu,'$1 ')
  if(!line)return
  const parsed=ingredientLine.exec(line)
  if(parsed){
    const descriptor=parsed[3].trim().slice(0,90)
    const garlic=/^knoblauchzehe[n]?$/iu.test(descriptor)
    const quantity=parsed[1]+' '+(parsed[2]??(garlic?'Zehen':'Stück'))
    const name=garlic?'Knoblauch':descriptor
    if(hasRecipeQuantity(quantity)&&/^\p{L}/u.test(name))return {name,quantity}
  }
  if(/^(?:salz(?: und pfeffer)?|pfeffer|muskat(?:nuss)?)(?:\s*\(nach geschmack\)|\s+(?:nach geschmack|zum abschmecken))?$/iu.test(line))
    return {name:line.split(/\s*\(|\s+(?:nach|zum)\s/iu,1)[0],quantity:'nach Geschmack'}
}
function combineIngredients(items:GroceryInput[]){
  const byName=new Map<string,GroceryInput>()
  for(const item of items){
    const key=groceryKey(item.name.replace(/^(?:kleine[nrms]?|große[nrms]?)\s+/iu,''))
    const current=byName.get(key)
    if(!current){byName.set(key,item);continue}
    const a=measured(current.quantity),b=measured(item.quantity)
    if(!b)continue
    if(!a){byName.set(key,item);continue}
    if(a.kind!==b.kind)return
    if(a.kind==='weight'||a.kind==='volume'){
      const quantity=(a.value+b.value).toLocaleString('de-DE',{useGrouping:false})+' '+(a.kind==='weight'?'g':'ml')
      byName.set(key,{...current,quantity})
    }else{
      const unit=current.quantity?.split(/\s+/u).slice(1).join(' ')
      if(!unit)return
      byName.set(key,{...current,quantity:(a.value+b.value).toLocaleString('de-DE',{useGrouping:false})+' '+unit})
    }
  }
  return [...byName.values()]
}
function instructions(value:unknown,depth=0):string[]{
  if(depth>4)return []
  if(typeof value==='string')return [clean(value)]
  if(Array.isArray(value))return value.slice(0,24).flatMap(entry=>instructions(entry,depth+1))
  if(value&&typeof value==='object')return instructions(Reflect.get(value,'text')??Reflect.get(value,'itemListElement'),depth+1)
  return []
}
export function recipeFromPage(html:string,url:URL):RecipeSource|undefined{
  if(!isRecipePage(url))return
  for(const [,body] of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/giu)){
    let json
    try{json=JSON.parse(body)}catch{continue}
    const nodes=(Array.isArray(json)?json:[json]).slice(0,40).flatMap(entry=>Array.isArray(entry?.['@graph'])?entry['@graph'].slice(0,60):[entry])
    const data=nodes.find(entry=>entry&&[entry['@type']].flat().includes('Recipe'))
    if(!data)continue
    const portions=(Array.isArray(data.recipeYield)?data.recipeYield:[data.recipeYield]).map((value:unknown)=>
      /^(\d+)(?:\s+(?:portion(?:en)?|person(?:en)?|servings?))?$/iu.exec(clean(String(value)))?.[1]).filter(Boolean)
    const servings=Number(portions[0])
    const title=clean(data.name).slice(0,120)
    if(!validRecipeServings(servings)||!title||!Array.isArray(data.recipeIngredient)||data.recipeIngredient.length<2||data.recipeIngredient.length>30)continue
    const parsed=(data.recipeIngredient as unknown[]).map(ingredient)
    if(parsed.some(item=>!item))continue
    const ingredients=combineIngredients(parsed.filter((item):item is NonNullable<typeof item>=>Boolean(item)))
    if(!ingredients||ingredients.length<2)continue
    const steps=instructions(data.recipeInstructions).filter(Boolean).slice(0,12)
    if(!steps.length||steps.some(step=>step.length>280))continue
    url.search=''
    url.hash=''
    return {title,ingredients,steps,servings,url:url.href}
  }
}

function recipeLinks(html:string,base:string){
  return [...new Set(Array.from(html.matchAll(/href=["'](\/rezepte\/[a-z\d][a-z\d-]+\/?)(?:\?[^"']*)?["']/giu),match=>
    new URL(match[1],base).href))]
}
export async function researchPantryRecipes(stock:StockItem[],preference:RecipePreference,signal:AbortSignal){
  if(signal.aborted||preference.allergy&&!preference.excluded.length)return []
  const stockNames=stock.filter(item=>item.status!=='empty').map(item=>grocerySearchKey(item.name))
  const requested=(preference.include??[]).map(grocerySearchKey)
  const allowed=(names:string[])=>publicFoodTerms.filter(term=>names.includes(grocerySearchKey(term)))
  const terms=[...new Set([...allowed(requested),...allowed(stockNames)])].slice(0,4)
  const mode={meat:'mit Fleisch',fish:'mit Fisch',vegetarian:'vegetarisch',vegan:'vegan'}[preference.mode??'vegetarian']
  const normalize=(value:string)=>grocerySearchKey(value).replace(/ae/gu,'a').replace(/oe/gu,'o').replace(/ue/gu,'u')
  const scores=(url:string)=>terms.reduce((score,item)=>score+Number(normalize(url).includes(normalize(item))),0)
  const query=['site:einfachkochen.de/rezepte','Rezept',...terms.slice(0,2),
    preference.mode&&!preference.include?.length?mode:''].filter(Boolean).join(' ')
  const [search,...lists]=await Promise.all([
    searchProductPages(query,true).catch(()=>[]),
    ...collections.map(address=>publicRecipeHtml(address).then(result=>recipeLinks(result.html,address)).catch(()=>[])),
  ])
  if(signal.aborted)return []
  const index=lists.flat()
  const candidates=[...new Set([...search,...index.sort((a,b)=>scores(b)-scores(a))])].filter(address=>{
    try{return isRecipePage(new URL(address))}catch{return false}
  }).slice(0,9)
  const found:RecipeSource[]=[]
  for(let offset=0;offset<candidates.length&&!signal.aborted;offset+=3){
    const group=await Promise.all(candidates.slice(offset,offset+3).map(address=>
      publicRecipeHtml(address).then(({html,url})=>recipeFromPage(html,url)).catch(()=>undefined)))
    found.push(...group.filter((row):row is RecipeSource=>Boolean(row&&matchesRecipe(row.ingredients,preference,row.title,row.steps))))
    if(found.length>=5)break
  }
  return found
}
