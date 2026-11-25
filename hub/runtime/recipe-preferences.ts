import {grocerySearchKey} from './grocery-catalog.ts'
import type {GroceryInput} from './grocery-types.ts'
import type {RecipePreference} from './grocery-types.ts'

const meat=/\b(?:fleisch|hack|hackfleisch|rind\w*|schwein\w*|hahnchen\w*|huhn\w*|pute\w*|lamm\w*|speck|schinken|salami|wurst|chorizo|geflugel|enten?brust)\b/u
const fish=/\b(?:fisch\w*|lachs|thunfisch|seelachs|kabeljau|forelle|garnelen?|krabben?|muscheln?|sardinen?)\b/u
const dairy=/\b(?:milch\w*|butter|kase|mozzarella|feta|parmesan|joghurt|sahne|quark|schmand|rahm|molke|mascarpone|ghee)\b/u
const eggs=/\b(?:ei|eier|eigelb|eiweiss|mayonnaise|eiernudeln)\b/u
const wheat=/\b(?:weizen\w*|mehl|dinkel\w*|roggen|gerste|brot|broetchen|brotchen|nudeln|pasta|spaghetti|penne|lasagne|couscous|bulgur|paniermehl|seitan)\b/u
const nuts=/\b(?:nuss\w*|nusse|haselnuss\w*|walnuss\w*|cashew\w*|mandel\w*|pistazie\w*|pekannuss\w*|macadamia\w*|paranuss\w*|marzipan)\b/u
const allergens=[
  {label:'Erdnüsse',name:/\berdnuss\w*\b/u,match:/\b(?:erdnuss\w*|satay)\b/u},
  {label:'Schalenfrüchte',name:/\b(?:nuss\w*|nusse|schalenfrucht\w*)\b/u,match:nuts},
  {label:'Milch',name:/\b(?:milch\w*|laktose|milcheiweiss|kuhmilch|milchprodukt\w*)\b/u,match:dairy},
  {label:'Eier',name:/\b(?:ei|eier|eiweiss)\b/u,match:eggs},
  {label:'Gluten / Weizen',name:/\b(?:gluten|weizen\w*|zoliakie)\b/u,match:wheat},
  {label:'Soja',name:/\bsoja\w*\b/u,match:/\b(?:soja\w*|tofu|tempeh|edamame|miso|tamari)\b/u},
  {label:'Sesam',name:/\bsesam\w*\b/u,match:/\b(?:sesam\w*|tahin\w*)\b/u},
  {label:'Fisch',name:/\bfisch\w*\b/u,match:fish},
  {label:'Schalentiere',name:/\b(?:krebstier\w*|schalentier\w*|garnele\w*|krabbe\w*)\b/u,match:/\b(?:garnelen?|krabben?|krebstier\w*|hummer|scampi)\b/u},
  {label:'Senf',name:/\bsenf\w*\b/u,match:/\bsenf\w*\b/u},
  {label:'Sellerie',name:/\bsellerie\w*\b/u,match:/\b(?:sellerie\w*|knollensellerie|stangensellerie)\b/u},
  {label:'Lupinen',name:/\blupin\w*\b/u,match:/\blupin\w*\b/u},
] as const
const mixed=/\b(?:pesto|fertig\w*|wurzmischung|bruhe\w*|bruhwurfel|fond|sosse|sauce|dressing|marinade|aufstrich|panade)\b/u

export function recipeRequest(input:string) {
  return /\b(?:koch\w*|rezepte?\w*|gericht\w*|essen)\b/iu.test(input) &&
    /\b(?:vorrat\w*|kuhlschrank|zutaten\s+da|aus\s+mein\w*\s+zutaten|was\s+kann\s+ich\s+kochen)\b/u.test(grocerySearchKey(input))
}
export function localRecipePreference(input:string):RecipePreference {
  const clean=grocerySearchKey(input)
  const allergy=/\b(?:allergisch|allergie\w*|unvertraglich\w*|unvertraglichkeit\w*|zoliakie|vertrage\s+kein\w*)\b/u.test(clean)
  const exclusion=input.match(/(?:allergisch\s+(?:gegen|auf)|allergie\s+gegen|unverträglichkeit\s+(?:gegen|bei)|vertrage\s+kein(?:e[nrms]?)?|ohne|kein(?:e[nrms]?))\s+([^.!?;\n]+)/giu)??[]
  const excluded=exclusion.flatMap(value=>value.replace(/^(?:allergisch\s+(?:gegen|auf)|allergie\s+gegen|unverträglichkeit\s+(?:gegen|bei)|vertrage\s+kein(?:e[nrms]?)?|ohne|kein(?:e[nrms]?))\s+/iu,'')
    .split(/\s*(?:,|\bund\b|\bsowie\b|\baber\b|\bsonst\b|\bdann\b)\s*/iu)
    .map(term=>term.replace(/\s+(?:bitte|empfehle|schlag|ich|mach|für|mit)\b.*$/iu,'').trim()).filter(Boolean)).slice(0,12)
  if(/\bzoliakie\b/u.test(clean))excluded.push('Gluten')
  const mode=/\bvegan\w*\b/u.test(clean)?'vegan':/\b(?:vegetarisch\w*|ohne fleisch|fleischlos)\b/u.test(clean)?'vegetarian':
    /\bmit (?:fleisch|hack\w*|hahnchen\w*|huhn\w*|rind\w*|schwein\w*|pute\w*|lamm\w*)\b/u.test(clean)?'meat':
    /\bmit (?:fisch|lachs|thunfisch)\b/u.test(clean)?'fish':undefined
  const include=input.match(/\bmit\s+(Hähnchen|Huhn|Rind(?:fleisch)?|Schwein(?:efleisch)?|Pute|Lamm(?:fleisch)?|Hackfleisch|Lachs|Thunfisch|Tofu|Reis|Nudeln|Kartoffeln)\b/iu)?.[1]
  const side=input.match(/(?:als\s+Beilage\s+(?:gerne\s+)?(Kartoffeln|Reis|Nudeln|Salat)|(?:^|\s)(Kartoffeln|Reis|Nudeln|Salat)\s+als\s+Beilage)/iu)
  const word=side?.[1]??side?.[2]
  const extras=clean.match(/\bals zutat (\p{L}+(?: \p{L}+){0,3})$/u)?.[1]??
    clean.match(/\bmit (\p{L}+)(?: (?:verwenden|rein|dabei|dazu|drin))?$/u)?.[1]
  return {excluded,allergy,...(mode&&{mode}),...(word&&{side:word}),...(include&&{include:[include]}),
    ...(!include&&extras&&!mode&&{include:[extras]})}
}
function nameContains(ingredient:string, exclusion:string){
  const token=grocerySearchKey(exclusion).replace(/(?:en|e)$/u,'')
  if(token.length<2)return false
  if(token.includes(' '))return (' '+ingredient+' ').includes(' '+token+' ')
  return ingredient.split(' ').some(word=>token.length>3?word.includes(token):word===token)
}
export function matchesRecipe(ingredients:GroceryInput[],preference:RecipePreference,title='',steps:readonly string[]=[]){
  const names=ingredients.map(item=>grocerySearchKey(item.name))
  const corpus=[...names,grocerySearchKey(title),...steps.map(grocerySearchKey)]
  if(preference.allergy&&(preference.excluded.length===0||names.some(name=>mixed.test(name))))return false
  if(preference.excluded.some(raw=>{
    const term=grocerySearchKey(raw)
    const group=allergens.find(group=>group.name.test(term))
    const pattern=group?.match??(term==='fleisch'?meat:undefined)
    return corpus.some(name=>pattern?pattern.test(name)||nameContains(name,raw):nameContains(name,raw))
  }))return false
  if(preference.mode==='meat'&&!names.some(name=>meat.test(name)))return false
  if(preference.mode==='fish'&&!names.some(name=>fish.test(name)))return false
  if((preference.mode==='vegetarian'||preference.mode==='vegan')&&names.some(name=>meat.test(name)||fish.test(name)))return false
  if(preference.mode==='vegan'&&names.some(name=>dairy.test(name)||eggs.test(name)||/\bhonig\b/u.test(name)))return false
  return (preference.include??[]).every(term=>names.some(name=>nameContains(name,term)))
}
