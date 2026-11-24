import { randomUUID } from 'node:crypto'
import type { Store } from './store.ts'
import { Problem } from './settings.ts'
import { productAddress } from '../connectors/outfit-import.ts'
import { dateInBerlin } from './values.ts'
import { wardrobeCategories, type WardrobeCategory, type OutfitDaypart } from './outfit-types.ts'
import { saleConditions, fragranceProfiles, fragranceOccasions, fragranceSeasons, fragranceTimes, type Fragrance, type FragranceDraft,
  type ResaleDraft, type ScentChoice } from './wardrobe-extras-types.ts'

type Fields=Record<string,unknown>
const record=(value:unknown):Fields=>{
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Problem(400,'Prüfe deine Angaben.')
  return value as Fields
}
function text(value:unknown,max:number,required=false) {
  const clean=typeof value==='string'?value.trim():''
  if (clean.length>max || required&&!clean || /[\x00-\x1f\x7f]/u.test(clean)) throw new Problem(400,'Prüfe deine Angaben.')
  return clean
}
function choices(value:unknown,available:readonly string[]) {
  if (!Array.isArray(value) || value.length>available.length || value.some(entry=>typeof entry!=='string'||!available.includes(entry))) {
    throw new Problem(400,'Wähle die passenden Eigenschaften.')
  }
  return [...new Set(value)] as string[]
}

export function fragranceList(store:Store):Fragrance[] {
  return store.db.prepare('SELECT id,details FROM wardrobe_fragrances ORDER BY rowid DESC').all()
    .map(row=>({...JSON.parse(String(row.details)),id:String(row.id)}))
}
export function normalizeFragrance(value:unknown):FragranceDraft {
  const input=record(value)
  const amount=input.containerMl
  if (amount!==null && (typeof amount!=='number'|| !Number.isInteger(amount) || amount<1 || amount>2000)) {
    throw new Problem(400,'Gib die Größe des Flakons in Millilitern ein.')
  }
  const profile=fragranceProfiles.find(entry=>entry===input.profile)
  if (!profile) throw new Problem(400,'Wähle den Duftcharakter.')
  const source=productAddress(input.source).href
  const pairing=text(input.pairing,220)
  return {name:text(input.name,120,true),brand:text(input.brand,75),description:text(input.description,330,true),
    notes:text(input.notes,180),...(pairing && {pairing}),containerMl:amount,source,profile,occasions:choices(input.occasions,fragranceOccasions),
    seasons:choices(input.seasons,fragranceSeasons),times:choices(input.times,fragranceTimes)}
}
export function saveFragrance(store:Store,value:unknown,photo:Uint8Array,mime:string) {
  const draft=normalizeFragrance(value)
  if (Number(store.db.prepare('SELECT count(*) AS n FROM wardrobe_fragrances').get()?.n)>=60) throw new Problem(409,'Die Duftsammlung ist voll.')
  if (fragranceList(store).some(item=>item.name.toLowerCase()===draft.name.toLowerCase() &&
    item.brand.toLowerCase()===draft.brand.toLowerCase() && item.containerMl===draft.containerMl)) {
    throw new Problem(409,'Dieser Duft ist in dieser Flakongröße bereits gespeichert.')
  }
  const id=randomUUID()
  store.db.prepare('INSERT INTO wardrobe_fragrances VALUES (?,?,?,?)').run(id,JSON.stringify(draft),photo,mime)
  return {id,...draft}
}
export function updateFragranceTags(store:Store,id:string,occasions:unknown,seasons:unknown) {
  const item=fragranceList(store).find(row=>row.id===id)
  if (!item) throw new Problem(404,'Duft nicht gefunden.')
  const {id:_,...details}=item
  const draft={...details,occasions:choices(occasions,fragranceOccasions),seasons:choices(seasons,fragranceSeasons)}
  store.db.prepare('UPDATE wardrobe_fragrances SET details=? WHERE id=?').run(JSON.stringify(draft),id)
  return {...draft,id}
}

export function fragrancePhoto(store:Store,id:string) {
  return store.db.prepare('SELECT photo,mime FROM wardrobe_fragrances WHERE id=?').get(id) as {photo:Uint8Array,mime:string}|undefined
}

export function recommendFragrance(fragrances:Fragrance[],context:{occasion?:string,date?:string,time?:string,daypart?:OutfitDaypart,temperature?:number,cabin?:boolean}):ScentChoice|undefined {
  const month=Number((context.date??dateInBerlin()).slice(5,7))
  const season=fragranceSeasons[month>=3&&month<=5?0:month>=6&&month<=8?1:month>=9&&month<=11?2:3]
  const occasion=context.occasion??''
  const hour=Number(context.time?.slice(0,2))
  const daypart=context.daypart ?? (Number.isFinite(hour) ? hour>=18?'Abends':hour<11?'Morgens':'Mittags' :
    /abend|date|party|feier/iu.test(occasion)?'Abends':undefined)
  const time=daypart==='Abends'?'Abends':'Tagsüber'
  const purpose=/büro|business|arbeit|uni/iu.test(occasion)?'Büro':/date|restaurant/iu.test(occasion)?'Date':
    /feier|party|hochzeit|\bclub\b|konzert/iu.test(occasion)?'Feier':/sport|wandern|strand|freizeit/iu.test(occasion)?'Sport & Freizeit':'Alltag'
  const temperature=context.temperature
  const suitable=fragrances.filter(item=>!context.cabin || item.containerMl!==null && item.containerMl<=100)
  const winner=suitable.map(item=>{
    const reasons:string[]=[]
    let score=0
    if (item.occasions.includes(purpose)) {score+=5;reasons.push(purpose)}
    if (item.seasons.includes(season)) {score+=3;reasons.push(season)}
    if (item.times.includes(time)) {score+=2;reasons.push(daypart?.toLocaleLowerCase('de-DE')??'tagsüber')}
    if (daypart==='Morgens' && item.profile==='Frisch') score+=1
    if (temperature!==undefined && temperature>=22) {
      if (item.profile==='Frisch') {score+=6;reasons.push('warmem Wetter')}
      if (item.profile==='Warm & intensiv') score-=3
    }
    if (temperature!==undefined && temperature<=12 && item.profile==='Warm & intensiv') {score+=4;reasons.push('kühlem Wetter')}
    return {item,score,reasons}
  }).sort((a,b)=>b.score-a.score)[0]
  if (!winner) return
  const {item,reasons}=winner
  return {id:item.id,name:item.name,brand:item.brand,...(item.pairing && {pairing:item.pairing}),reason:reasons.length ? 'Passt zu '+reasons.join(' · ')+'.' : item.description}
}

function saleRow(store:Store,id:string) {
  return store.db.prepare(`SELECT w.*,sale.state,sale.condition,sale.flaws,sale.original_price,sale.asking_price_cents,sale.created,sale.sold FROM wardrobe_items w
    LEFT JOIN wardrobe_sales sale ON sale.wardrobe_id=w.id WHERE w.id=?`).get(id)
}
export function resaleList(store:Store):ResaleDraft[] {
  return store.db.prepare("SELECT wardrobe_id FROM wardrobe_sales WHERE state IN ('selling','sold') ORDER BY state!='selling',created DESC").all().map(row=>{
    const id=String(row.wardrobe_id), item=saleRow(store,id)!
    const condition=String(item.condition), flaws=String(item.flaws), originalPrice=item.original_price===null?null:Number(item.original_price)
    const category=String(item.category) as WardrobeCategory
    const base=originalPrice??({top:35,bottom:50,outer:75,shoes:65,accessory:28}[category]??35)
    const factor=({ 'Neu mit Etikett':.67,'Neu ohne Etikett':.57,'Sehr gut':.47,'Gut':.35,'Mit Gebrauchsspuren':.22 } as Record<string,number>)[condition]??.35
    const start=Math.max(2,Math.round(base*factor))
    const name=String(item.name), brand=String(item.brand??'')
    const title=(brand && !name.toLowerCase().includes(brand.toLowerCase())?brand+' '+name:name).slice(0,120)
    const description=[wardrobeCategories[category],item.color&&'Farbe: '+item.color,item.size&&'Größe: '+item.size,
      item.material&&'Material: '+item.material,item.fit&&'Passform: '+item.fit,condition&&'Zustand: '+condition,
      flaws&&'Gebrauchsspuren/Mängel: '+flaws].filter(Boolean).join('\n')
    return {id,name,state:item.state as ResaleDraft['state'],condition,flaws,originalPrice,askingPriceCents:item.asking_price_cents===null?null:Number(item.asking_price_cents),created:String(item.created),sold:item.sold?String(item.sold):null,
      hasPhoto:Boolean(item.photo),hasOwnPhoto:Boolean(item.photo && item.photo_origin==='own'),listing:{title,description,minimum:Math.max(1,Math.floor(start*.75)),maximum:Math.ceil(start*1.25),start}}
  })
}
export function changeResale(store:Store,id:string,action:unknown,raw:unknown) {
  const item=saleRow(store,id)
  if (!item) throw new Problem(404,'Kleidungsstück nicht gefunden.')
  const order=store.db.prepare("SELECT 1 FROM clothing_order_items WHERE wardrobe_id=? AND decision!='kept'").get(id)
  if (order) throw new Problem(409,'Entscheide zuerst, ob du das bestellte Teil behältst.')
  if (action==='restore') {
    store.db.prepare('DELETE FROM wardrobe_sales WHERE wardrobe_id=?').run(id)
  } else if (action==='sold') {
    if (!store.db.prepare("UPDATE wardrobe_sales SET state='sold',sold=coalesce(sold,?) WHERE wardrobe_id=? AND state IN ('selling','sold')").run(dateInBerlin(),id).changes) {
      throw new Problem(409,'Lege zuerst einen Verkaufsentwurf an.')
    }
  } else if (action==='sorted') {
    store.db.prepare(`INSERT INTO wardrobe_sales (wardrobe_id,state,created) VALUES (?,'sorted',?)
      ON CONFLICT(wardrobe_id) DO UPDATE SET state='sorted',sold=NULL`).run(id,dateInBerlin())
  } else if (action==='start') {
    store.db.prepare(`INSERT INTO wardrobe_sales (wardrobe_id,state,created) VALUES (?,'selling',?)
      ON CONFLICT(wardrobe_id) DO UPDATE SET state='selling',sold=NULL,created=CASE WHEN wardrobe_sales.state='sorted' THEN excluded.created ELSE wardrobe_sales.created END WHERE state!='sold'`).run(id,dateInBerlin())
  } else if (action==='selling') {
    const data=record(raw), condition=saleConditions.find(entry=>entry===data.condition)
    if (!condition) throw new Problem(400,'Wähle den Zustand.')
    const price=data.originalPrice
    if (price!==null && (!Number.isSafeInteger(price) || Number(price)<1 || Number(price)>100000)) throw new Problem(400,'Prüfe den Neupreis.')
    const askingPrice=data.askingPriceCents===undefined ? item.asking_price_cents : data.askingPriceCents
    if (askingPrice!==null && (typeof askingPrice!=='number' || !Number.isSafeInteger(askingPrice) || askingPrice<1 || askingPrice>10000000)) {
      throw new Problem(400,'Prüfe den Verkaufspreis.')
    }
    store.db.prepare(`INSERT INTO wardrobe_sales (wardrobe_id,state,condition,flaws,original_price,asking_price_cents,created) VALUES (?,'selling',?,?,?,?,?)
      ON CONFLICT(wardrobe_id) DO UPDATE SET state='selling',condition=excluded.condition,flaws=excluded.flaws,
        original_price=excluded.original_price,asking_price_cents=excluded.asking_price_cents,sold=NULL,
        created=CASE WHEN wardrobe_sales.state='sorted' THEN excluded.created ELSE wardrobe_sales.created END`).run(id,condition,text(data.flaws,350),price as number|null,askingPrice,dateInBerlin())
  } else throw new Problem(400,'Wähle die gewünschte Aktion.')
  if (action==='sold' || action==='sorted' || action==='selling' || action==='start') store.db.prepare('DELETE FROM wardrobe_travel WHERE wardrobe_id=?').run(id)
  return resaleList(store)
}
export function travelWardrobe(store:Store,trip:string) {
  if (!store.db.prepare('SELECT 1 FROM trips WHERE id=?').get(trip)) throw new Problem(404,'Reise nicht gefunden.')
  return store.db.prepare('SELECT wardrobe_id FROM wardrobe_travel WHERE trip_id=?').all(trip).map(row=>String(row.wardrobe_id))
}
export function addTravelWardrobeItem(store:Store,trip:string,item:string) {
  return saveTravelWardrobe(store,trip,[...travelWardrobe(store,trip),item])
}

export function saveTravelWardrobe(store:Store,trip:string,items:string[]) {
  travelWardrobe(store,trip)
  const ids=[...new Set(items)]
  if (ids.length>80) throw new Problem(400,'Du kannst bis zu 80 Kleidungsstücke einpacken.')
  const selectable=store.db.prepare(`SELECT w.id FROM wardrobe_items w
    LEFT JOIN wardrobe_sales s ON s.wardrobe_id=w.id LEFT JOIN clothing_order_items o ON o.wardrobe_id=w.id
    WHERE w.id=? AND s.state IS NULL AND (o.decision IS NULL OR o.decision='kept')`)
  if (ids.some(id=>!selectable.get(id))) throw new Problem(409,'Ein Teil ist für die Reise nicht verfügbar.')
  store.db.prepare('DELETE FROM wardrobe_travel WHERE trip_id=?').run(trip)
  const add=store.db.prepare('INSERT INTO wardrobe_travel VALUES (?,?)')
  for (const id of ids) add.run(trip,id)
  return ids
}
