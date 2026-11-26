import { identifiedColor } from './outfit-palette.ts'
import type { OutfitStyle, WardrobeCategory, WardrobeDraft } from './outfit-types.ts'

const garments: [RegExp, WardrobeCategory, string][] = [
  [/\b(?:[a-zäöü-]*mantel|coat|trenchcoat)\b/iu,'outer','Mantel'],
  [/\b(?:[a-zäöü-]*jacke|jacket|blazer|parka|windbreaker)\b/iu,'outer','Jacke'],
  [/\b(?:boots?|stiefel|stiefeletten)\b/iu,'shoes','Stiefel'],
  [/\b(?:schuh\w*|shoe\w*|sneaker\w*|loafers?)\b/iu,'shoes','Schuhe'],
  [/\bjeans?\b/iu,'bottom','Jeans'],
  [/\b(?:hosen?|bundfaltenhosen?|shorts|trousers|pants|slacks)\b/iu,'bottom','Hose'],
  [/\b(?:rock|skirt)\b/iu,'bottom','Rock'],
  [/\b(?:shirt|t[ -]?shirt|tee)\b/iu,'top','Shirt'],
  [/\b(?:hoodie|kapuzenpullover|sweatshirt)\b/iu,'top','Hoodie'],
  [/\b(?:pullover|sweater|jumper|strickpullover|cardigan)\b/iu,'top','Pullover'],
  [/\b(?:hemd|bluse|blouse)\b/iu,'top','Hemd'],
  [/\b(?:gürtel|belt|schal|scarf|armbanduhr|watch|mütze|cap|handbag|rucksack|backpack|tasche)\b/iu,'accessory','Accessoire'],
]
const garmentTypes: [RegExp,WardrobeCategory,string][] = [
  // Unterwäsche zuerst, damit „Boxershorts, Hüft-Shorts“ nicht als Shorts gilt.
  [/unterwäsche|unterhose|boxershorts|boxer\b|\b(?:briefs|trunks|underwear)\b/iu,'accessory','Unterwäsche'],
  [/\b(?:socken?|strümpfe|socks?|sneakersocken)\b/iu,'accessory','Socken'],
  [/langarmshirt|long[ -]?sleeve/iu,'top','Langarmshirt'],
  [/\b(?:trikot|jersey)\b|(?:heim|auswärts|auswaerts)trikot/iu,'top','T-Shirt'],
  [/\b(?:t[ -]?shirt|tee)\b/iu,'top','T-Shirt'],
  [/\b(?:pullover|sweater|strickpullover|jumper|cardigan)\b/iu,'top','Pullover & Strick'],
  [/\b(?:hemd|bluse|blouse)\b/iu,'top','Hemd & Bluse'],
  [/\b(?:hoodie|sweatshirt)\b/iu,'top','Hoodie & Sweatshirt'],
  [/\bjeans?\b/iu,'bottom','Jeans'],
  [/\bshorts\b/iu,'bottom','Shorts'],
  [/\b(?:hosen?|bundfaltenhosen?|trousers|pants|slacks)\b/iu,'bottom','Hose'],
  [/\b(?:rock|skirt)\b/iu,'bottom','Rock'],
  [/\b(?:sneakers?|trainers?)\b/iu,'shoes','Sneaker'],
  [/\bloafers?\b/iu,'shoes','Loafer'],
  [/\b(?:boots?|stiefel)\b/iu,'shoes','Stiefel'],
  [/\bblazer\b/iu,'outer','Blazer'],
  [/mantel|\bcoat\b/iu,'outer','Mantel'],
  [/jacke|\bjacket\b/iu,'outer','Jacke'],
]
export function outfitGarment(text:string) {
  const match=garmentTypes.find(([pattern])=>pattern.test(text))
  return match ? {category:match[1],garmentType:match[2]} : undefined
}

const fabrics: [RegExp,string][] = [
  [/baumwolle|cotton/iu,'Baumwolle'], [/lammwolle|lambswool/iu,'Lammwolle'], [/merino(?:wolle)?/iu,'Merinowolle'],
  [/\b(?:wolle|wool)\b/iu,'Wolle'], [/kaschmir|cashmere/iu,'Kaschmir'], [/leinen|linen/iu,'Leinen'],
  [/seide|\bsilk\b/iu,'Seide'], [/\b(?:leder|leather|glattleder)\b/iu,'Leder'], [/denim/iu,'Denim'],
  [/polyester/iu,'Polyester'], [/viskose|viscose|rayon/iu,'Viskose'], [/elastan|spandex/iu,'Elastan'],
  [/polyamid|nylon/iu,'Polyamid'], [/acryl|acrylic/iu,'Acryl'],
]
const styleTerms: [OutfitStyle,RegExp][] = [
  ['Schlicht', /minimal|basic|klassisch|classic|uni(?:farben)?\b/iu],
  ['Auffällig', /farbenfroh|bunt|statement|grafik|graphic|muster|print/iu],
  ['Eleganz', /elegan|business|büro|smart.casual|anzug|blazer|bundfalte|loafer|satin|hemd/iu],
  ['Streetwear', /streetwear|sneaker|hoodie|cargo|denim|baggy|oversized|graphic/iu],
]
export function guessedStyleTags(text: string) {
  return styleTerms.filter(([,pattern])=>pattern.test(text)).map(([style])=>style)
}

const martens = /(?:\b(?:dr|doc)\.?\s*martens\b|\bair\s*wair\b)/iu
const martensModels: [RegExp,string,string][] = [
  [/\b1460\b/u,'1460','Schnürstiefel'], [/\b1461\b/u,'1461','Halbschuhe'], [/\b2976\b/u,'2976','Chelsea-Boots'],
  [/\b8065\b/u,'8065','Mary Janes'], [/\bjadon(?:\s+(?:iii|max))?\b/iu,'Jadon','Plateau-Boots'],
  [/\badrian\b/iu,'Adrian','Loafer'],
]

export function outfitFields(text: string, labels: string[], color: string, attributes = false): Partial<WardrobeDraft> {
  const clean = text.replace(/\s+/gu,' ').trim()
  const brand = martens.test(clean) ? 'Dr. Martens' : clean.match(/\b(?:Nike|Adidas|Carhartt|Uniqlo|Zara|H&M|Patagonia|Asics|Converse|Vans|New Balance|Levi['’]s|Birkenstock)\b/iu)?.[0]
  const model = brand === 'Dr. Martens' ? martensModels.filter(([pattern])=>pattern.test(clean)) : []
  const exact = model.length === 1 ? model[0] : undefined
  const fromText = garments.find(([pattern])=>pattern.test(clean))
  const garment = fromText ??
    labels.map(label=>label.replace(/_/gu,' ')).flatMap(label=>garments.filter(([pattern])=>pattern.test(label)))[0]
  const labelName = fromText && text.split('\n').map(line=>line.trim()).find(line=>
    line.length >= 4 && line.length <= 95 && fromText[0].test(line) &&
    !/%|€|\b(?:regular|slim|oversized|material)\b/iu.test(line))
  const size = !attributes ? /(?:^|\n)\s*(?:(?:größe|size|taille|gr\.?)\s*[:.]?\s*((?:[2345]?XL|XXS|XS|S|M|L|\d{2})(?:\s*\/\s*\d{2})?)|((?:XXS|XS|S|M|L|XL|XXL|[345]XL)))\s*(?:$|\n)/imu.exec(text) : null
  const materials: string[] = []
  for (const [pattern,name] of fabrics) {
    const source = clean.match(new RegExp(`(?:(\\d{1,3}(?:[.,]\\d+)?\\s*%)\\s*)?(?:${pattern.source})`, 'iu'))
    if (source) materials.push(source[1] ? source[1].replace(/\s*%/u,' %') + ' ' + name : name)
  }
  const fit = clean.match(/\b(?:slim[ -]fit|regular[ -]fit|relaxed[ -]fit|straight[ -]fit|skinny[ -]fit|loose[ -]fit|oversized|skinny|wide[ -]leg|regular|slim|relaxed)\b/iu)?.[0]
  const seasons = clean.match(/\b(?:frühling|summer|sommer|autumn|herbst|winter|spring)\b/giu)
  const context = clean + ' ' + (garment?.[2] ?? '') + ' ' + labels.join(' ')
  const tags: string[] = guessedStyleTags(context)
  if (/sport|training|running|laufen/iu.test(context)) tags.push('Sport')
  if (/wandern|trekking|outdoor|regenjacke/iu.test(context)) tags.push('Outdoor')
  return {
    ...(garment && { category:garment[1], name:labelName || garment[2] }),
    ...(outfitGarment(labelName || clean || garment?.[2] || '') ?? {}),
    ...(size && {size:size[1]??size[2]}),
    ...(brand && {brand}),
    ...(exact && {category:'shoes',model:exact[1],name:'Dr. Martens '+exact[1]+' '+exact[2]}),
    ...(color && { color }),
    ...(materials.length && { material:[...new Set(materials)].join(', ').slice(0,120) }),
    ...(fit && { fit }),
    ...(attributes && seasons?.length && { season:[...new Set(seasons)].join(', ').slice(0,70) }),
    ...(tags.length && { tags:tags.join(', ') }),
  }
}

const productColors: [RegExp,string][] = [
  [/off[ -]?white|cremeweiß/iu,'Cremeweiß'], [/weiß|weiss|white/iu,'Weiß'],
  [/schwarz|black/iu,'Schwarz'], [/grau|grey|gray/iu,'Grau'], [/beige|creme|cream/iu,'Beige'],
  [/braun|brown/iu,'Braun'], [/weinrot|bordeaux|burgundy/iu,'Weinrot'], [/rot|red/iu,'Rot'],
  [/navy|dunkelblau|marineblau/iu,'Dunkelblau'], [/hellblau|light[ -]blue/iu,'Hellblau'], [/blau|blue/iu,'Blau'],
  [/oliv|olive/iu,'Olivgrün'], [/grün|green/iu,'Grün'], [/gelb|yellow/iu,'Gelb'], [/orange/iu,'Orange'],
  [/rosa|pink/iu,'Rosa'], [/lila|violett|purple/iu,'Violett'], [/türkis|teal/iu,'Türkis'],
]
const colorAliases=productColors.map(([part])=>part.source).join('|')
// The regex is composed exclusively from the static aliases above.
const productColorPattern=new RegExp(`(?<![\\p{L}\\p{N}])(?:${colorAliases})(?:en|em|er|es|e)?(?![\\p{L}\\p{N}])`,'giu') // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
export function textProductColor(raw:string) {
  const seen=new Set<string>()
  for(const match of raw.matchAll(productColorPattern)) {
    const color=productColors.find(([part])=>part.test(match[0]))
    if(color)seen.add(color[1])
  }
  return seen.size===1 ? [...seen][0] : ''
}
export function productColorName(raw:string) {
  const hex=raw.match(/#[0-9a-f]{6}\b/iu)?.[0]
  const clean=raw.replace(/#[0-9a-f]{3,8}\b/giu,'').trim()
  return textProductColor(clean)||clean||(hex?identifiedColor(hex).split(' #')[0]:'')
}
export function productWardrobeFields(title:string,description='',query='',metadata:Partial<WardrobeDraft>={},imageColor=''):Partial<WardrobeDraft> {
  const queryFields=outfitFields(query,[],'',true)
  const descriptionFields=outfitFields(description,[],'',true)
  const titleFields=outfitFields(title,[],'',true)
  const merged={...queryFields,...descriptionFields,...titleFields,...metadata}
  const garment=outfitGarment(title) ?? outfitGarment(description) ?? outfitGarment(query)
  const metadataColor=metadata.color??''
  const color=productColorName(metadataColor.replace(/#[0-9a-f]{3,8}\b/giu,''))||
    textProductColor(title)||textProductColor(description)||textProductColor(query)||
    productColorName(metadataColor)||productColorName(imageColor)
  const material=metadata.material || [descriptionFields.material,titleFields.material].find(value=>value?.includes('%')) || merged.material
  const fit=merged.fit?.toLowerCase().replace(/-/g,' ').replace(/\b\w/gu, letter=>letter.toUpperCase())
  return {...merged,...garment,...(title && {name:title.slice(0,120)}),...(material && {material}),...(fit && {fit}),...(color && {color})}
}
