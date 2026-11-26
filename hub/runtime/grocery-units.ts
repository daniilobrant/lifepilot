import { grocerySearchKey } from './grocery-catalog.ts'

/** Mengeneinheiten für Vorrat und Einkaufsliste. Die Menge bleibt als Text „250 g“ gespeichert. */
export const groceryUnits = ['Stück', 'g', 'kg', 'ml', 'l'] as const
export type GroceryUnit = typeof groceryUnits[number]

// Typische Packungsgrößen im deutschen Handel. Reihenfolge: spezifisch vor allgemein.
const typical: [RegExp, number, GroceryUnit][] = [
  [/knoblauch/u, 1, 'Stück'], [/^eier?\b|\beier\b/u, 10, 'Stück'],
  [/schinken|salami|aufschnitt|mortadella|lachsschinken/u, 100, 'g'], [/speck|bacon/u, 150, 'g'],
  [/hackfleisch|hack\b/u, 500, 'g'], [/hahnchen|pute|schnitzel|rind|schwein|steak|filet|gulasch/u, 400, 'g'],
  [/lachs|fisch|garnele|shrimp/u, 250, 'g'], [/thunfisch/u, 150, 'g'],
  [/milch|hafermilch|haferdrink|sojadrink|mandeldrink/u, 1000, 'ml'], [/sahne|schmand/u, 200, 'g'], [/saure sahne|creme fraiche|crème fraîche/u, 200, 'g'],
  [/joghurt|skyr|quark/u, 500, 'g'], [/butter|margarine/u, 250, 'g'], [/kase|gouda|emmentaler|cheddar|parmesan/u, 200, 'g'],
  [/mozzarella|feta|halloumi/u, 125, 'g'],
  [/nudel|spaghetti|pasta|penne|fusilli/u, 500, 'g'], [/reis/u, 1000, 'g'], [/mehl|zucker/u, 1000, 'g'], [/haferflock|musli|cornflakes/u, 500, 'g'],
  [/linsen|kichererbs|bohnen/u, 400, 'g'], [/passiert|tomatenmark|gehackte tomaten/u, 400, 'g'],
  [/olivenol|rapsol|sonnenblumenol|sesamol|speiseol|\bol\b/u, 500, 'ml'], [/essig/u, 500, 'ml'],
  [/ketchup|mayonnaise|mayo|senf|bbq|sauce|sosse|sojasauce|sojasose/u, 250, 'ml'], [/honig|marmelade|nutella|erdnussbutter|aufstrich/u, 250, 'g'],
  [/wasser|saft|cola|limo|bier|wein/u, 1000, 'ml'], [/kaffee/u, 500, 'g'], [/tee/u, 50, 'g'],
  [/brot|toast/u, 500, 'g'], [/brotchen|bagel|wrap|tortilla/u, 4, 'Stück'],
  [/kartoffel/u, 1, 'kg'], [/zwiebeln$/u, 3, 'Stück'], [/tomaten$/u, 4, 'Stück'],
  [/petersilie|basilikum|koriander|schnittlauch|dill|minze|thai basilikum|krapao/u, 30, 'g'],
  [/tomate|zwiebel|paprika|gurke|apfel|banane|zitrone|limette|orange|kartoffel|karotte|mohre|zucchini|aubergine|avocado|chili/u, 1, 'Stück'],
  [/salat|brokkoli|blumenkohl|kohl/u, 1, 'Stück'], [/champignon|pilz|spinat|beeren|erdbeer/u, 250, 'g'],
  [/salz|pfeffer|paprikapulver|gewurz|curry|zimt|oregano/u, 50, 'g'],
  [/tofu|tempeh/u, 200, 'g'], [/schokolade/u, 100, 'g'], [/chips/u, 175, 'g'],
  [/zahnpasta|shampoo|duschgel|spulmittel|waschmittel|reiniger/u, 500, 'ml'],
  [/toilettenpapier|kuchenrolle|taschentuch|mullbeutel|gefrierbeutel|backpapier|alufolie/u, 1, 'Stück'],
]
export function groceryDefaults(name: string): { amount: number, unit: GroceryUnit } {
  const key = grocerySearchKey(name)
  const found = typical.find(([pattern]) => pattern.test(key))
  return found ? { amount: found[1], unit: found[2] } : { amount: 1, unit: 'Stück' }
}
export function defaultUnit(name: string): GroceryUnit { return groceryDefaults(name).unit }

// Haushaltsmaße und Gebinde, umgerechnet in Gramm oder Milliliter (Richtwerte deutscher Rezepte und Packungen).
const liquid=/milch|wasser|ol\b|öl|essig|sauce|soße|sosse|sahne|brühe|bruhe|saft|wein|sirup|drink/u
const measures:[RegExp,(key:string)=>[number,GroceryUnit]][]= [
  [/^(?:el|essl(?:ö|o)ffel)$/u,key=>liquid.test(key)?[15,'ml']:/mehl|zucker|salz|stärke|starke|kakao|pulver|gewurz|paprika/u.test(key)?[10,'g']:/butter|honig|senf|mark|creme|joghurt|quark/u.test(key)?[15,'g']:[10,'g']],
  [/^(?:tl|teel(?:ö|o)ffel)$/u,key=>liquid.test(key)?[5,'ml']:/salz|zucker/u.test(key)?[5,'g']:[3,'g']],
  [/^(?:prisen?|msp\.?|messerspitzen?)$/u,()=>[1,'g']],
  [/^(?:zehen?)$/u,()=>[1,'Stück']],
  [/^(?:scheiben?)$/u,key=>/kase|käse|gouda|emmentaler|cheddar|schinken|salami|wurst/u.test(key)?[20,'g']:/brot|toast/u.test(key)?[40,'g']:[1,'Stück']],
  [/^(?:bund|bunde|bünde)$/u,()=>[30,'g']],
  [/^(?:handvoll)$/u,()=>[25,'g']],
  [/^(?:dosen?)$/u,key=>/thunfisch|mais/u.test(key)?[150,'g']:/kokos/u.test(key)?[400,'ml']:[400,'g']],
  [/^(?:flaschen?)$/u,key=>/ol\b|öl|essig|sauce|soße|sosse|ketchup/u.test(key)?[500,'ml']:[1000,'ml']],
  [/^(?:becher)$/u,key=>/sahne/u.test(key)?[200,'g']:[500,'g']],
  [/^(?:gl(?:a|ä)s(?:er)?)$/u,()=>[350,'g']],
  [/^(?:packung(?:en)?|pck\.?|pkg\.?|beutel|päckchen|packchen|tüten?|tuten?)$/u,key=>{const d=groceryDefaults(key);return d.unit==='Stück'?[1,'Stück']:[d.amount,d.unit]}],
]
const numberPart=/^(\d+(?:[.,]\d+)?(?:\s*[½¼¾])?|[½¼¾]|\d+\s*\/\s*\d+)\s*/u
const toNumber=(text:string)=>{
  const fraction:Record<string,number>={'½':.5,'¼':.25,'¾':.75}
  const slash=/^(\d+)\s*\/\s*(\d+)$/u.exec(text)
  if(slash)return Number(slash[1])/Number(slash[2])
  const whole=/^(\d+(?:[.,]\d+)?)?\s*([½¼¾])?$/u.exec(text.trim())
  return whole?Number((whole[1]??'0').replace(',','.'))+(fraction[whole[2]??'']??0):Number.NaN
}
const tidy=(value:number)=>String(Math.round(value*100)/100).replace('.',',')

/** „250 g“, „2“, „1,5 kg“ → Zahl und eine der fünf Einheiten; ohne erkennbare Einheit bleibt sie leer. */
export function parseQuantity(raw: string): { amount: string, unit: GroceryUnit | '' , rest: string } {
  const text = raw.trim()
  const match = /^(\d+(?:[.,]\d+)?|\d*½|¼|¾)\s*(stück|stk\.?|g|gramm|kg|kilogramm|ml|milliliter|l|liter)?\b\.?\s*(.*)$/iu.exec(text)
  if (!match) return { amount: '', unit: '', rest: text }
  const word = (match[2] ?? '').toLocaleLowerCase('de-DE')
  const unit: GroceryUnit | '' = !word ? '' : /^st/u.test(word) ? 'Stück' : /^(?:g|gramm)$/u.test(word) ? 'g' : /^k/u.test(word) ? 'kg' :
    /^(?:ml|milliliter)$/u.test(word) ? 'ml' : 'l'
  return { amount: match[1], unit, rest: match[3] }
}

/** Wandelt jede Mengenangabe in Stück, g, kg, ml oder l um: „2 EL Olivenöl“ → „30 ml“, „1 Dose Tomaten“ → „400 g“. */
export function metricQuantity(name: string, raw: string) {
  const text=raw.trim()
  if(!text)return ''
  const head=numberPart.exec(text)
  if(!head){
    const word=text.toLocaleLowerCase('de-DE').replace(/^(?:ein|eine|einen)\s+/u,'')
    const rule=measures.find(([pattern])=>pattern.test(word))
    return rule?formatQuantity(tidy(rule[1](grocerySearchKey(name))[0]),rule[1](grocerySearchKey(name))[1]):text
  }
  const amount=toNumber(head[1])
  const after=text.slice(head[0].length).trim()
  const word=(after.split(/\s+/u)[0]??'').toLocaleLowerCase('de-DE').replace(/\.$/u,'')
  const parsed=parseQuantity(text)
  if(parsed.unit)return formatQuantity(parsed.amount,parsed.unit)
  if(!Number.isFinite(amount))return text
  if(!word)return text
  const rule=measures.find(([pattern])=>pattern.test(word))
  if(!rule)return text
  const [size,unit]=rule[1](grocerySearchKey(name))
  const total=amount*size
  return unit==='g'&&total>=1000&&total%100===0?formatQuantity(tidy(total/1000),'kg'):unit==='ml'&&total>=1000&&total%100===0?formatQuantity(tidy(total/1000),'l'):formatQuantity(tidy(total),unit)
}
export function formatQuantity(amount: string, unit: string) {
  const value = amount.trim()
  return value ? (unit ? value + ' ' + unit : value) : ''
}

/** Füllt eine fehlende oder einheitenlose Menge mit einer realistischen Angabe (für bestehende Vorräte). */
export function completeQuantity(name: string, raw: string) {
  const { amount: typicalAmount, unit } = groceryDefaults(name)
  raw = metricQuantity(name, raw)
  const parsed = parseQuantity(raw)
  if (!raw.trim()) return formatQuantity(String(typicalAmount), unit)
  if (parsed.unit || parsed.rest) return raw.trim()
  const count = Number(parsed.amount.replace(',', '.'))
  if (!Number.isFinite(count) || count <= 0) return raw.trim()
  // Eine bloße Zahl bei Gewichts- oder Volumenware meint Packungen: 2 × 100 g Schinken = 200 g.
  if ((unit === 'g' || unit === 'ml') && count <= 20) return formatQuantity(String(Math.round(count * typicalAmount)), unit)
  return formatQuantity(parsed.amount, unit)
}
