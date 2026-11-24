import {groceryKey} from './grocery-catalog.ts'
import type {GroceryInput, StockItem} from './grocery-types.ts'
import {dateInBerlin} from './values.ts'

export const legacyRecipeServings=2
export const maxRecipeServings=24
export const validRecipeServings=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>=1&&value<=maxRecipeServings

const fractions:Record<string,number>={'½':1/2,'¼':1/4,'¾':3/4,'⅓':1/3,'⅔':2/3,'⅛':1/8}
const quantityStart=/^\s*(?:(\d+(?:[,.]\d+)?)(?:\s*([½¼¾⅓⅔⅛])|\s*\/\s*(\d+))?|([½¼¾⅓⅔⅛]))(.*)$/u
const portionsFormat=new Intl.NumberFormat('de-DE',{maximumFractionDigits:3,useGrouping:false})
function parseQuantity(quantity:string|undefined){
  const match=quantityStart.exec(quantity??'')
  if(!match||/^\s*(?:[–—-]|bis\b|\/)/iu.test(match[5]))return null
  const amount=(match[1]?Number(match[1].replace(',','.')):0)/(match[3]?Number(match[3]):1)+
    (fractions[match[2]||match[4]]??0)
  return Number.isFinite(amount)?{amount,unit:match[5].trim()}:null
}
export function scaleRecipeIngredients(items:GroceryInput[],base:number,servings:number){
  if(base===servings)return items
  return items.map(item=>{
    const quantity=parseQuantity(item.quantity)
    if(!quantity||quantity.amount<=0)return item
    const amount=portionsFormat.format(quantity.amount*servings/base)
    return {...item,quantity:[amount,quantity.unit].filter(Boolean).join(' ')}
  })
}

export function measured(quantity:string|undefined){
  const parsed=parseQuantity(quantity)
  if(!parsed)return null
  const unit=parsed.unit.toLocaleLowerCase('de-DE').replace(/\.$/u,'')
  switch(unit){
    case 'kg':return {kind:'weight',value:parsed.amount*1000}
    case 'g':return {kind:'weight',value:parsed.amount}
    case 'l':return {kind:'volume',value:parsed.amount*1000}
    case 'ml':return {kind:'volume',value:parsed.amount}
    case 'el':return {kind:'volume',value:parsed.amount*15}
    case 'tl':return {kind:'volume',value:parsed.amount*5}
    case '':case 'stück':case 'stk':case 'st':return {kind:'count',value:parsed.amount}
    case 'zehe':case 'zehen':return {kind:'zehe',value:parsed.amount}
    case 'dose':case 'dosen':return {kind:'dose',value:parsed.amount}
    case 'scheibe':case 'scheiben':return {kind:'scheibe',value:parsed.amount}
    case 'bund':case 'bünde':return {kind:'bund',value:parsed.amount}
    case 'prise':case 'prisen':return {kind:'prise',value:parsed.amount}
    case 'msp':case 'messerspitze':return {kind:'messerspitze',value:parsed.amount}
    default:return null
  }
}
export function covers(item:StockItem|undefined,request:GroceryInput,day:string) {
  if(!item||item.status==='empty'||item.expiry&&item.expiry<day)return false
  const need=measured(request.quantity),have=measured(item.quantity)
  return !need||!have||need.kind!==have.kind||have.value>=need.value
}
export function hasRecipeQuantity(quantity:string|undefined){
  return Boolean(quantity && (measured(quantity)?.value || /^(?:nach geschmack|optional)$/iu.test(quantity.trim())))
}

export type RecipeStockStatus = 'enough'|'short'|'missing'|'unknown'
export function recipeStockStatus(item:StockItem|undefined,request:GroceryInput,day:string):RecipeStockStatus {
  if(!covers(item,{name:request.name},day))return 'missing'
  const need=measured(request.quantity),have=measured(item?.quantity)
  if(!need||!have||need.kind!==have.kind)return 'unknown'
  return have.value+1e-9>=need.value?'enough':'short'
}

function recipeStockKey(name:string){
  const key=groceryKey(name.replace(/\s*\((?:rot|gelb|grün|parboiled|frisch)\)/giu,'')
    .replace(/^(?:kleine[nrms]?|große[nrms]?|frische[nrms]?|tiefgefrorene[nrms]?)\s+/iu,''))
  if(/^paprikaschote[n]?$/u.test(key))return 'paprika'
  if(/^hahnchenbrust(?:filet)?s?$/u.test(key))return 'hahnchen'
  if(/^(?:basmati|parboiled|jasmin) reis$/u.test(key))return 'reis'
  return key
}
export function ingredientStock(ingredients:GroceryInput[],stock:StockItem[],day=dateInBerlin()){
  const names=new Map(stock.map(item=>[groceryKey(item.name),item]))
  const alternatives=new Map(stock.map(item=>[recipeStockKey(item.name),item]))
  return ingredients.map(item=>recipeStockStatus(names.get(groceryKey(item.name))??alternatives.get(recipeStockKey(item.name)),item,day))
}
export function stockedIngredients(ingredients:GroceryInput[],stock:StockItem[],day=dateInBerlin()){
  return ingredientStock(ingredients,stock,day).map(status=>status==='enough')
}
