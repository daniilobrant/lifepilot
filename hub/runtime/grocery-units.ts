import { grocerySearchKey } from './grocery-catalog.ts'

/** Mengeneinheiten für Vorrat und Einkaufsliste. Die Menge bleibt als Text „250 g“ gespeichert. */
export const groceryUnits = ['Stück', 'g', 'kg', 'ml', 'l', 'Packung', 'Dose', 'Flasche', 'Bund', 'Zehen', 'EL', 'TL'] as const
export type GroceryUnit = typeof groceryUnits[number]

// Typische Packungsgrößen im deutschen Handel. Reihenfolge: spezifisch vor allgemein.
const typical: [RegExp, number, GroceryUnit][] = [
  [/knoblauch/u, 4, 'Zehen'], [/^eier?\b|\beier\b/u, 10, 'Stück'],
  [/schinken|salami|aufschnitt|mortadella|lachsschinken/u, 100, 'g'], [/speck|bacon/u, 150, 'g'],
  [/hackfleisch|hack\b/u, 500, 'g'], [/hahnchen|pute|schnitzel|rind|schwein|steak|filet|gulasch/u, 400, 'g'],
  [/lachs|fisch|garnele|shrimp/u, 250, 'g'], [/thunfisch/u, 1, 'Dose'],
  [/milch|hafermilch|haferdrink|sojadrink|mandeldrink/u, 1000, 'ml'], [/sahne|schmand/u, 200, 'g'], [/saure sahne|creme fraiche|crème fraîche/u, 200, 'g'],
  [/joghurt|skyr|quark/u, 500, 'g'], [/butter|margarine/u, 250, 'g'], [/kase|gouda|emmentaler|cheddar|parmesan/u, 200, 'g'],
  [/mozzarella|feta|halloumi/u, 125, 'g'],
  [/nudel|spaghetti|pasta|penne|fusilli/u, 500, 'g'], [/reis/u, 1000, 'g'], [/mehl|zucker/u, 1000, 'g'], [/haferflock|musli|cornflakes/u, 500, 'g'],
  [/linsen|kichererbs|bohnen/u, 1, 'Dose'], [/passiert|tomatenmark|gehackte tomaten/u, 1, 'Dose'],
  [/olivenol|rapsol|sonnenblumenol|sesamol|speiseol|\bol\b/u, 500, 'ml'], [/essig/u, 500, 'ml'],
  [/ketchup|mayonnaise|mayo|senf|bbq|sauce|sosse|sojasauce|sojasose/u, 250, 'ml'], [/honig|marmelade|nutella|erdnussbutter|aufstrich/u, 250, 'g'],
  [/wasser|saft|cola|limo|bier|wein/u, 1000, 'ml'], [/kaffee/u, 500, 'g'], [/tee/u, 1, 'Packung'],
  [/brot|toast/u, 1, 'Packung'], [/brotchen|bagel|wrap|tortilla/u, 4, 'Stück'],
  [/kartoffel/u, 1, 'kg'], [/zwiebeln$/u, 3, 'Stück'], [/tomaten$/u, 4, 'Stück'],
  [/petersilie|basilikum|koriander|schnittlauch|dill|minze|thai basilikum|krapao/u, 1, 'Bund'],
  [/tomate|zwiebel|paprika|gurke|apfel|banane|zitrone|limette|orange|kartoffel|karotte|mohre|zucchini|aubergine|avocado|chili/u, 1, 'Stück'],
  [/salat|brokkoli|blumenkohl|kohl/u, 1, 'Stück'], [/champignon|pilz|spinat|beeren|erdbeer/u, 250, 'g'],
  [/salz|pfeffer|paprikapulver|gewurz|curry|zimt|oregano/u, 1, 'Packung'],
  [/tofu|tempeh/u, 200, 'g'], [/schokolade/u, 100, 'g'], [/chips/u, 175, 'g'],
  [/zahnpasta|shampoo|duschgel|spulmittel|waschmittel|reiniger/u, 1, 'Flasche'],
  [/toilettenpapier|kuchenrolle|taschentuch|mullbeutel|gefrierbeutel|backpapier|alufolie/u, 1, 'Packung'],
]
export function groceryDefaults(name: string): { amount: number, unit: GroceryUnit } {
  const key = grocerySearchKey(name)
  const found = typical.find(([pattern]) => pattern.test(key))
  return found ? { amount: found[1], unit: found[2] } : { amount: 1, unit: 'Stück' }
}
export function defaultUnit(name: string): GroceryUnit { return groceryDefaults(name).unit }

/** „250 g“, „2“, „1½ EL“ → Zahl und Einheit; ohne erkennbare Einheit bleibt die Einheit leer. */
export function parseQuantity(raw: string): { amount: string, unit: GroceryUnit | '' , rest: string } {
  const text = raw.trim()
  const match = /^(\d+(?:[.,]\d+)?|\d*½|¼|¾)\s*(stück|stk\.?|g|gramm|kg|ml|l|liter|packung(?:en)?|pck\.?|dosen?|flaschen?|bund|zehen?|el|tl)?\b\.?\s*(.*)$/iu.exec(text)
  if (!match) return { amount: '', unit: '', rest: text }
  const word = (match[2] ?? '').toLocaleLowerCase('de-DE')
  const unit: GroceryUnit | '' = !word ? '' : /^st/u.test(word) ? 'Stück' : /^gramm$|^g$/u.test(word) ? 'g' : word === 'kg' ? 'kg' : word === 'ml' ? 'ml' :
    /^l$|^liter$/u.test(word) ? 'l' : /^p/u.test(word) ? 'Packung' : /^dose/u.test(word) ? 'Dose' : /^flasche/u.test(word) ? 'Flasche' :
    word === 'bund' ? 'Bund' : /^zehe/u.test(word) ? 'Zehen' : word === 'el' ? 'EL' : 'TL'
  return { amount: match[1], unit, rest: match[3] }
}
export function formatQuantity(amount: string, unit: string) {
  const value = amount.trim()
  return value ? (unit ? value + ' ' + unit : value) : ''
}

/** Füllt eine fehlende oder einheitenlose Menge mit einer realistischen Angabe (für bestehende Vorräte). */
export function completeQuantity(name: string, raw: string) {
  const { amount: typicalAmount, unit } = groceryDefaults(name)
  const parsed = parseQuantity(raw)
  if (!raw.trim()) return formatQuantity(String(typicalAmount), unit)
  if (parsed.unit || parsed.rest) return raw.trim()
  const count = Number(parsed.amount.replace(',', '.'))
  if (!Number.isFinite(count) || count <= 0) return raw.trim()
  // Eine bloße Zahl bei Gewichts- oder Volumenware meint Packungen: 2 × 100 g Schinken = 200 g.
  if ((unit === 'g' || unit === 'ml') && count <= 20) return formatQuantity(String(Math.round(count * typicalAmount)), unit)
  return formatQuantity(parsed.amount, unit)
}
