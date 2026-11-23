import type { GroceryCategory } from './grocery-types.ts'

export const groceryCatalog = [
  'Gurke','Salatgurke','Paprika','Rote Paprika','Chili','Frühlingszwiebeln','Lauchzwiebeln','Paprikapulver','Karotte','Knoblauch','Frischer Ingwer','Ingwer','Tomaten',
  'Kartoffeln','Zwiebeln','Eisbergsalat','Spinat','Apfel','Äpfel','Bananen','Zitronen','Erdbeeren','Champignons','Brokkoli','Petersilie',
  'Hackfleisch','Hähnchen','Hähnchenfleisch','Hähnchenbrustfilet','Rinderhackfleisch','Lachs','Eier','Milch','Hafermilch','Quark','Joghurt','Butter',
  'Nudeln','Mie-Nudeln','Reis','Mehl','Linsen','Haferflocken','Pfeffer','Salz','Passierte Tomaten','Kichererbsen',
  'Honig','Marmelade','Müsli','Erdnussbutter','Rapsöl','Olivenöl','Sesamöl','Reisessig','Apfelessig','Sojasoße','Ketchup','Senf','Mayonnaise',
  'Tofu','Tempeh','Veganes Hack','Tortilla-Wraps','Toastbrot','Cornflakes','Mineralwasser','Kaffee','Tee','Orangensaft','Kopfsalat',
  'Zahnpasta','Zahnbürste','Zahnseide','Deodorant','Shampoo','Duschgel','Sonnencreme','Handseife','Kontaktlinsenlösung',
  'Spülmittel','Waschmittel','Allzweckreiniger','Müllbeutel','Toilettenpapier','Küchenrolle','Taschentücher','Gefrierbeutel','Backpapier','Alufolie',
  'Hundefutter','Katzenfutter','Katzenstreu','Tiefkühlpizza','Schokolade','Haferdrink',
]

export function grocerySearchKey(name:string) {
  return name.toLocaleLowerCase('de-DE').normalize('NFD').replace(/\p{M}/gu,'').replace(/ß/g,'ss')
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim()
}

const alternatives=new Map([
  ['chilis','Chili'],['thai chilis','Chili'],['thai chili','Chili'],['thaichilis','Chili'],['thaichili','Chili'],
  ['soja sosse','Sojasoße'],['soja sauce','Sojasoße'],['sojasauce','Sojasoße'],
  ['krapsel','Rapsöl'],['rapsoel','Rapsöl'],['haehnchen','Hähnchen'],['gefrierbeutel','Gefrierbeutel'],
])
const catalog=new Map(groceryCatalog.map(name=>[grocerySearchKey(name),name]))

function editDistance(a:string,b:string) {
  let prev=Array.from({length:b.length+1},(_,i)=>i), before=prev
  for (let i=1;i<=a.length;i++) {
    const next=[i]
    for (let j=1;j<=b.length;j++) {
      let distance=Math.min(prev[j]+1,next[j-1]+1,prev[j-1]+Number(a[i-1]!==b[j-1]))
      if (i>1 && j>1 && a[i-1]===b[j-2] && a[i-2]===b[j-1]) distance=Math.min(distance,before[j-2]+1)
      next.push(distance)
    }
    before=prev;prev=next
  }
  return prev[b.length]
}

export function grocerySuggestions(value:string,known:string[]=[]) {
  const key=grocerySearchKey(value)
  if (key.length<2) return []
  const exact=alternatives.get(key)??catalog.get(key)
  const options=new Map(catalog)
  for (const word of known) {
    const candidate=grocerySearchKey(word)
    if (!options.has(candidate)) options.set(candidate,canonicalGroceryName(word,false))
  }
  const matches=[...options].flatMap(([word,label])=>{
    if (word===key) return [{label,score:0}]
    if (word.startsWith(key)) return [{label,score:1}]
    if (word.includes(key)) return [{label,score:2}]
    if (key.length<4 || Math.abs(key.length-word.length)>2) return []
    const distance=editDistance(key,word)
    return distance<=(key.length>=8?2:1) ? [{label,score:distance+2}] : []
  }).sort((a,b)=>a.score-b.score || a.label.length-b.label.length)
  return [...new Set([...(exact?[exact]:[]),...matches.map(row=>row.label)])].slice(0,6)
}

export function knownGroceryName(value:string) {
  const key=grocerySearchKey(value)
  return alternatives.get(key)??catalog.get(key)
}

export function canonicalGroceryName(value:string,correctTypos=true) {
  const key=grocerySearchKey(value)
  const exact=knownGroceryName(value)
  if (exact) return exact
  if (correctTypos && key.length>=4 && !key.includes(' ')) {
    const close=[...catalog].filter(([word])=>Math.abs(word.length-key.length)<=1 &&
      !word.startsWith(key) && !key.startsWith(word) && editDistance(key,word)===1)
    if (close.length===1) return close[0][1]
  }
  return value.trim().replace(/^\p{Ll}/u,letter=>letter.toLocaleUpperCase('de-DE'))
}

const rules: [GroceryCategory,RegExp][] = [
  ['pets',/katzenstreu|tierfutter|hundefutter|katzenfutter|hundekeks/u],
  ['paper',/toilettenpapier|kuchenrolle|taschentuch|backpapier|alufolie|gefrierbeutel|mullbeutel/u],
  ['frozen',/tiefkuhl|tiefgefroren|gefrier|^tk\b|pizza|fertiggericht/u],
  ['home',/spulmittel|schwamm|waschmittel|reiniger|mullbeutel|kuchenrolle|toilettenpapier/u],
  ['dental',/zahnpasta|zahnburste|zahnseide|mundspulung/u],
  ['plant',/tofu|tempeh|veganes hack|seitan/u],
  ['care',/zahnpasta|zahnburste|duschgel|shampoo|taschentuch|deodorant|seife/u],
  ['drinks',/wasser|kaffee|^tee|saft|bier|haferdrink|hafermilch|getrank|cola/u],
  ['bakery',/brot|brotchen|toast|wraps?|baguette|croissant/u],
  ['meat',/hackfleisch|hahnchen|lachs|fisch|rind|schwein|wurst|speck|aufschnitt|thunfisch/u],
  ['dairy',/milch|joghurt|yogurt|quark|butter|kase|mozzarella|parmesan|^ei(?:er)?$|sahne|skyr|feta/u],
  ['breakfast',/honig|marmelad|konfitur|musli|porridge|aufstrich/u],
  ['oil',/essig|olivenol|rapsol|sonnenblumenol|sesamol|^speiseol/u],
  ['sauce',/sauce|sosse|ketchup|senf|mayonnaise|sojasos|tabasco/u],
  ['pantry',/passiert|tomatenmark|nudel|spaghetti|pasta|reis|mehl|olivenol|linsen|haferflock|gewurz|pfeffer|paprikapulver|^salz|zucker|essig|bohnen|kichererbs|pesto|couscous|bulgur/u],
  ['snacks',/nuss|nusse|schokolade|chips|riegel|keks|mandel|gummib/u],
  ['produce',/apfel|banane|tomat|zwiebel|knoblauch|salat|gurke|lauchzwiebel|paprika|zucchini|sellerie|kartoff|karotte|mohre|brokkoli|spinat|zitrone|avocado|birne|beere|orange|pilz|champignon|ingwer|petersilie|chili/u],
]

export function groceryCategory(name:string) {
  const key=grocerySearchKey(name)
  return rules.find(([,pattern])=>pattern.test(key))?.[0]??'other'
}
