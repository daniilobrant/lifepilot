import type { ScentChoice } from './wardrobe-extras-types.ts'
export const wardrobeCategories = { top: 'Oberteile', bottom: 'Hosen & Röcke', outer: 'Jacken & Mäntel', shoes: 'Schuhe', accessory: 'Accessoires' } as const
export const outfitSlots = {
  base: 'T-Shirts & Langarm',
  knit: 'Pullover & Strick',
  bottom: 'Hosen & Röcke',
  outer: 'Jacken & Mäntel',
  shoes: 'Schuhe',
  accessory: 'Accessoires',
} as const
export type OutfitSlot = keyof typeof outfitSlots
export const outfitSlotOrder: readonly OutfitSlot[] = ['base', 'knit', 'bottom', 'outer', 'shoes', 'accessory']
export const wardrobeTypes = {
  top:['T-Shirt','Langarmshirt','Pullover & Strick','Hemd & Bluse','Hoodie & Sweatshirt'],
  bottom:['Hose','Jeans','Shorts','Rock'],
  outer:['Jacke','Mantel','Blazer'],
  shoes:['Sneaker','Loafer','Stiefel','Sandalen'],
  accessory:['Tasche','Gürtel','Schal','Mütze','Socken','Unterwäsche'],
} as const
export const outfitStyles = ['Schlicht','Auffällig','Eleganz','Streetwear'] as const
export type WardrobeCategory = keyof typeof wardrobeCategories
export type OutfitStyle = typeof outfitStyles[number]
export type WardrobeDraft = { name: string, category: WardrobeCategory, color: string, material: string, fit: string,
  season: string, tags: string, source: string, brand?: string, retailer?:string, model?: string, size?:string, garmentType?:string }
export type WardrobeItem = WardrobeDraft & { id: string, hasPhoto: boolean, orderState?:'ordered'|'review', saleState?:'selling'|'sorted', photoOrigin?:'own'|'web'|'unknown' }
export const preferredCuts = ['Schmal', 'Gerade', 'Locker', 'Oversized', 'Tailliert'] as const
export const bodyShapes = ['Schmal', 'Mittlere Statur', 'Kräftig'] as const
export const bodyProportions = ['Schultern und Hüfte ähnlich breit', 'Schultern breiter als Hüfte',
  'Hüfte breiter als Schultern', 'Längere Beine', 'Längerer Oberkörper'] as const
export type StyleProfile = { height: string, shape: string, proportions: string, topSize: string, bottomSize: string,
  shoeSize: string, preferredCut: string, preferredStyle: OutfitStyle | '', preferences: string }
export const emptyStyle: StyleProfile = { height: '', shape: '', proportions: '', topSize: '', bottomSize: '', shoeSize: '',
  preferredCut: '', preferredStyle: '', preferences: '' }
export const emptyWardrobe: WardrobeDraft = { name: '', category: 'top', color: '', material: '', fit: '', season: '', tags: '', source: '', brand: '', model: '' }
export const outfitDayparts = ['Morgens','Mittags','Abends'] as const
export type OutfitDaypart = typeof outfitDayparts[number]
export type FragranceChatPlan = {fragrances:string[]}
export type OutfitChatPlan = { place: string | null, date: string | null, occasion: string | null,
  anchorStep?:'decision'|'name'|'ready', anchor?:string|null, daypart?:OutfitDaypart|null }
export type OutfitWeather = { place:string, date:string, min:number, max:number, current?:number, feels?:number, rain?:number, wind?:number, snow?:number }
export type OutfitQuery = { mode: 'occasion' | 'anchor' | 'inspiration', occasion: string, style: OutfitStyle, required: string[], variant: number, temperature?: number, place?: string, date?: string, time?:string, daypart?:OutfitDaypart, tripId?:string }
export type Outfit = { title: string, occasion: string, style: OutfitStyle, itemIds: string[], rationale: string, tips: string[], prompt: string, weather?: OutfitWeather, date?: string, fragrance?:ScentChoice }
export type OutfitOverview = { wardrobe: WardrobeItem[], profile: StyleProfile, profilePhoto: boolean, looks: (Outfit & {id: string, savedAt: string, photoIds: string[]})[] }
export type OutfitChoice = { look: Outfit, proposal: string }

export function resolveOutfitAnchor(name:string,wardrobe:WardrobeItem[]) {
  const tokens=(value:string)=>value.toLocaleLowerCase('de-DE').normalize('NFD').replace(/\p{M}/gu,'')
    .split(/[^\p{L}\p{N}]+/u).filter(word=>word&&!/^(?:ein(?:e|en|em|er|es)?|der|die|das|den|mit|mein(?:e|en|em|er|es)?)$/u.test(word))
    .map(word=>word.length>5?word.replace(/(?:en|em|er|es|e)$/u,''):word)
  const expected=tokens(name)
  if (!expected.length) return undefined
  const usable=wardrobe.filter(item=>!item.orderState&&!item.saleState)
  const exact=usable.filter(item=>tokens(item.name).join(' ')===expected.join(' '))
  if (exact.length===1) return exact[0]
  if (exact.length>1) return undefined
  const partial=usable.filter(item=>{
    const words=tokens([item.name,item.brand,item.color,item.garmentType].filter(Boolean).join(' '))
    return expected.every(word=>words.includes(word))
  })
  return partial.length===1?partial[0]:undefined
}

export function isKnitwearTop(item: Pick<WardrobeDraft, 'name' | 'category' | 'garmentType' | 'material' | 'tags'>) {
  if (item.category !== 'top') return false
  if (item.garmentType === 'Pullover & Strick' || item.garmentType === 'Hoodie & Sweatshirt') return true
  if (item.garmentType === 'T-Shirt' || item.garmentType === 'Langarmshirt' || item.garmentType === 'Hemd & Bluse') {
    if (!/\b(?:pullover|strick\w*|cardigan|hoodie|sweatshirt)\b/iu.test(item.name)) return false
  }
  const text = [item.name, item.garmentType, item.tags, item.material].filter(Boolean).join(' ')
  return /\b(?:pullover|strick\w*|sweater|hoodie|sweatshirt|cardigan|rollkragen|turtleneck|lammwolle|merinowolle|kaschmir)\b/iu.test(text) &&
    !/\b(?:henley|t-?shirt|langarmshirt|hemd|bluse)\b/iu.test(item.name)
}

export function isLongOrHeavyBaseTop(item: Pick<WardrobeDraft, 'name' | 'garmentType' | 'tags'>) {
  if (item.garmentType === 'Langarmshirt') return true
  const text = [item.name, item.garmentType, item.tags].filter(Boolean).join(' ')
  return /\b(?:langarm\w*|long\s*sleeve|henley|schwer\w*|heavy\w*|oversize-langarm|rollkragen|flanell\w*)\b/iu.test(text)
}

export function outerWeight(item: Pick<WardrobeDraft, 'name' | 'garmentType' | 'material' | 'season' | 'tags'>): 'winter' | 'rain' | 'transition' {
  const text = [item.name, item.garmentType, item.material, item.season, item.tags].filter(Boolean).join(' ')
  if (/\b(?:winter\w*|stepp\w*|puffer\w*|daunen\w*|gefüttert\w*|wattiert\w*|wollmantel|wolle|lammwolle|kaschmir|parka|thermo|fleece|shearling)\b/iu.test(text)) return 'winter'
  if (/\b(?:regen\w*|wasserfest\w*|wasserdicht\w*|waterproof|hardshell|gore[ -]?tex)\b/iu.test(text)) return 'rain'
  return 'transition'
}

export function outfitSlot(item: Pick<WardrobeDraft, 'name' | 'category' | 'garmentType' | 'material' | 'tags'>): OutfitSlot {
  if (item.category === 'top') return isKnitwearTop(item) ? 'knit' : 'base'
  return item.category
}

/**
 * Wofür ein Teil gedacht ist, aus Typ, Material, Schnitt und Stil-Tags abgeleitet. Die Labels
 * erscheinen an jedem Teil im Look und helfen bei der Auswahl passend zum angegebenen Anlass.
 */
export function itemOccasion(item: Pick<WardrobeDraft, 'name' | 'category' | 'garmentType' | 'material' | 'tags'> & {fit?:string}): string {
  const text = [item.name, item.garmentType, item.material, item.tags, item.fit].filter(Boolean).join(' ').toLowerCase()
  if (/\b(?:sport\w*|training|fitness|funktions\w*|lauf\w*|jogger)\b/u.test(text)) return 'Sport · Freizeit'
  if (item.category === 'accessory') return /uhr|gürtel|leder/u.test(text) ? 'Büro · Dinner' : 'Alltag · Ergänzung'
  if (/\b(?:hemd|bluse|blazer|anzug|bundfalte\w*|chino|loafer|chelsea|oxford|derby|kaschmir|merino\w*|rollkragen|polokragen|wollmantel|mantel)\b|eleganz|business/u.test(text)) return 'Büro · Dinner'
  if (item.category === 'outer' && /\b(?:leder\w*|lederoptik)\b/u.test(text)) return 'Abends · Ausgehen'
  if (item.category === 'outer' && /\b(?:stepp\w*|puffer|daunen|gefüttert\w*|parka|wattiert\w*)\b/u.test(text)) return 'Kalte Tage · Alltag'
  if (/\b(?:sneakers?|jordan|asics|nike|hoodie|sweatshirt|oversize\w*|cargo|kastig\w*)\b|streetwear/u.test(text)) return 'Alltag · Streetwear'
  if (/\b(?:strick\w*|pullover|soufflé|souffle|cardigan)\b/u.test(text)) return 'Uni · Café'
  if (/\b(?:jeans|denim|henley|t-?shirt|langarm\w*)\b/u.test(text)) return 'Alltag · Uni'
  return item.category === 'shoes' ? 'Alltag' : 'Alltag · Uni'
}
