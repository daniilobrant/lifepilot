import type { ScentChoice } from './wardrobe-extras-types.ts'
export const wardrobeCategories = { top: 'Oberteile', bottom: 'Hosen & Röcke', outer: 'Jacken & Mäntel', shoes: 'Schuhe', accessory: 'Accessoires' } as const
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
