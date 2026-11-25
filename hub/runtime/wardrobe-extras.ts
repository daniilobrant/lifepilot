import { randomUUID } from 'node:crypto'
import type { Store } from './store.ts'
import { Problem } from './settings.ts'
import { productAddress } from '../connectors/outfit-import.ts'
import { dateInBerlin } from './values.ts'
import { withScentGuide } from './scent-profile.ts'
import { wardrobeCategories, type WardrobeCategory, type OutfitDaypart } from './outfit-types.ts'
import { priceClasses, saleConditions, fragranceProfiles, fragranceOccasions, fragranceSeasons, fragranceTimes, type Fragrance, type FragranceDraft,
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
    .map(row=>{
      const {guide,...fragrance}=withScentGuide(JSON.parse(String(row.details)) as FragranceDraft)
      const {character,purpose,intensity,timing,seasonText}=guide
      return {...fragrance,guide:{character,purpose,intensity,timing,seasonText},id:String(row.id)}
    })
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
  const row=store.db.prepare('SELECT details FROM wardrobe_fragrances WHERE id=?').get(id)
  if (!row) throw new Problem(404,'Duft nicht gefunden.')
  const details=JSON.parse(String(row.details)) as FragranceDraft
  // Gespeicherte Tags gelten ab jetzt als bewusst gewählt und werden nicht mehr abgeleitet.
  const draft={...details,occasions:choices(occasions,fragranceOccasions),seasons:choices(seasons,fragranceSeasons),tagsConfirmed:true}
  store.db.prepare('UPDATE wardrobe_fragrances SET details=? WHERE id=?').run(JSON.stringify(draft),id)
  return fragranceList(store).find(item=>item.id===id)!
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
    if (temperature!==undefined && temperature<=12 && (item.profile==='Warm & intensiv' || item.seasons.includes('Winter'))) {score+=4;reasons.push('kühlem Wetter')}
    // Sehr kräftige Düfte nicht tagsüber empfehlen.
    if (time==='Tagsüber' && /^Sehr kräftig/u.test(item.guide?.intensity??'')) score-=4
    return {item,score,reasons}
  }).sort((a,b)=>b.score-a.score)[0]
  if (!winner) return
  const {item,reasons}=winner
  const usage=item.guide
  const today=reasons.length ? 'Heute passend: '+reasons.join(', ')+'.' : ''
  return {id:item.id,name:item.name,brand:item.brand,...(item.pairing && {pairing:item.pairing}),...(usage && {usage}),
    reason:usage ? [usage.character+'. Ideal für '+usage.purpose+'.',today].filter(Boolean).join(' ') : today || item.description}
}

// Preisregeln für Second-Hand-Plattformen (Vinted, Kleinanzeigen): Anteil am Neupreis nach Zustand,
// angepasst an die Preisklasse. Gebrauchte Fast Fashion verliert stark an Wert, Premium und gefragte Sneaker weniger.
const conditionShare:Record<string,number>={'Neu mit Etikett':.6,'Neu ohne Etikett':.5,'Sehr gut':.4,'Gut':.3,'Mit Gebrauchsspuren':.18}
const classFactor:Record<string,number>={'Basic / Fast Fashion':.8,'Marke':1,'Premium / Designer':1.2,'Sneaker / Sammlerstück':1.35,'Vintage':1.1}
const fastFashion=/\b(?:h&m|zara|bershka|asos|primark|shein|pull ?& ?bear|topman|stradivarius|c&a|new yorker|reserved|uniqlo|weekday|mango|only|jack ?& ?jones)\b/iu
const premium=/\b(?:arc.?teryx|patagonia|ralph lauren|stone island|carhartt wip|acne|cos|arket|dr\.? martens|tommy hilfiger|hugo boss|calvin klein|the north face|moncler|canada goose|filling pieces|our legacy)\b/iu
const collectible=/\b(?:jordan|yeezy|dunk|new balance 99\d|asics gel|salomon xt)\b/iu
export function guessPriceClass(name:string,brand:string,category:string) {
  const text=brand+' '+name
  if (category==='shoes' && collectible.test(text)) return 'Sneaker / Sammlerstück'
  if (premium.test(text)) return 'Premium / Designer'
  if (fastFashion.test(text)) return 'Basic / Fast Fashion'
  return brand ? 'Marke' : 'Basic / Fast Fashion'
}
function roundPrice(value:number) {
  if (value<10) return Math.max(2,Math.round(value*2)/2)
  if (value<50) return Math.round(value)
  return Math.round(value/5)*5
}
export function estimateResale(category:string,condition:string,originalPrice:number|null,priceClass:string,quantity:number) {
  const fallback={top:30,bottom:45,outer:80,shoes:70,accessory:25}[category as WardrobeCategory]??30
  const base=originalPrice??fallback
  const share=conditionShare[condition] ?? 0.3
  const factor=classFactor[priceClass]??1
  // Mehrere gleiche Teile im Bündel erhalten einen kleinen Paketrabatt.
  const total=base*share*factor*quantity*(quantity>1 ? 0.9 : 1)
  const start=roundPrice(total)
  const note=(originalPrice?'':'Ohne Neupreis mit typischem Neupreis gerechnet. ')+
    `${Math.round(share*100)} % des Neupreises für „${condition||'Gut'}“, ${priceClass}`+(quantity>1?`, ${quantity} Teile mit 10 % Paketrabatt`:'')+'.'
  return {start,minimum:roundPrice(start*.8),maximum:roundPrice(start*1.2),note}
}

function saleRow(store:Store,id:string) {
  return store.db.prepare(`SELECT w.*,sale.state,sale.condition,sale.flaws,sale.original_price,sale.asking_price_cents,sale.created,sale.sold,sale.price_class,sale.quantity FROM wardrobe_items w
    LEFT JOIN wardrobe_sales sale ON sale.wardrobe_id=w.id WHERE w.id=?`).get(id)
}
export function resaleList(store:Store):ResaleDraft[] {
  return store.db.prepare("SELECT wardrobe_id FROM wardrobe_sales WHERE state IN ('selling','sold') ORDER BY state!='selling',created DESC").all().map(row=>{
    const id=String(row.wardrobe_id), item=saleRow(store,id)!
    const condition=String(item.condition), flaws=String(item.flaws), originalPrice=item.original_price===null?null:Number(item.original_price)
    const category=String(item.category) as WardrobeCategory
    const name=String(item.name), brand=String(item.brand??'')
    const priceClass=item.price_class ? String(item.price_class) : guessPriceClass(name,brand,category)
    const quantity=Number(item.quantity??1)||1
    const estimate=estimateResale(category,condition,originalPrice,priceClass,quantity)
    const start=estimate.start
    const title=((brand && !name.toLowerCase().includes(brand.toLowerCase())?brand+' '+name:name)+(quantity>1?` (${quantity} Stück)`:'')).slice(0,120)
    const color=String(item.color??'').replace(/\s*#[0-9a-f]{6}\b/giu,'').trim()
    const lines=[
      `Ich verkaufe ${quantity>1?quantity+'× ':''}${brand && !name.toLowerCase().includes(brand.toLowerCase())?brand+' ':''}${name}${color?' in '+color:''}${item.size?', Größe '+item.size:''}.`,
      [item.material&&'Material: '+item.material,item.fit&&'Passform: '+item.fit,item.garment_type&&'Art: '+item.garment_type].filter(Boolean).join(' · '),
      condition ? `Zustand: ${condition}${flaws?'. Hinweis: '+flaws:'. Keine bekannten Mängel'}.` : '',
      'Versand oder Abholung möglich. Bei Fragen gerne melden.',
    ]
    const description=lines.filter(Boolean).join('\n')
    return {id,name,state:item.state as ResaleDraft['state'],condition,flaws,originalPrice,askingPriceCents:item.asking_price_cents===null?null:Number(item.asking_price_cents),created:String(item.created),sold:item.sold?String(item.sold):null,
      hasPhoto:Boolean(item.photo),hasOwnPhoto:Boolean(item.photo && item.photo_origin==='own'),listing:{title,description,minimum:estimate.minimum,maximum:estimate.maximum,start},
      priceClass,quantity,estimateNote:estimate.note}
  })
}
export function changeResale(store:Store,id:string,action:unknown,raw:unknown) {
  const item=saleRow(store,id)
  if (!item) throw new Problem(404,'Kleidungsstück nicht gefunden.')
  const order=store.db.prepare("SELECT 1 FROM clothing_order_items WHERE wardrobe_id=? AND decision!='kept'").get(id)
  if (order) throw new Problem(409,'Entscheide zuerst, ob du das bestellte Teil behältst.')
  if (action==='restore') {
    // Verkaufte Teile gehen nicht zurück in den Kleiderschrank.
    if (item.state==='sold') throw new Problem(409,'Das Teil ist verkauft. Du kannst es entfernen oder im Bereich Verkauft lassen.')
    store.db.prepare('DELETE FROM wardrobe_sales WHERE wardrobe_id=?').run(id)
  } else if (action==='delete') {
    if (item.state!=='sold') throw new Problem(409,'Nur verkaufte Teile lassen sich hier endgültig entfernen.')
    store.db.prepare('DELETE FROM wardrobe_items WHERE id=?').run(id)
    return resaleList(store)
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
    const priceClass=data.priceClass===undefined||data.priceClass===null||data.priceClass==='' ? null : priceClasses.find(entry=>entry===data.priceClass)
    if (priceClass===undefined) throw new Problem(400,'Wähle eine Preisklasse.')
    const quantity=data.quantity===undefined ? Number(item.quantity??1) : Number(data.quantity)
    if (!Number.isSafeInteger(quantity) || quantity<1 || quantity>20) throw new Problem(400,'Wähle 1 bis 20 Teile.')
    // „Verkaufspreis ermitteln“: Preis nach den Regeln berechnen und als Vorschlag speichern.
    const estimated=data.estimate===true ? Math.round(estimateResale(String(item.category),condition,price as number|null,
      priceClass ?? guessPriceClass(String(item.name),String(item.brand??''),String(item.category)),quantity).start*100) : undefined
    const askingPrice=estimated ?? (data.askingPriceCents===undefined ? item.asking_price_cents : data.askingPriceCents)
    if (askingPrice!==null && (typeof askingPrice!=='number' || !Number.isSafeInteger(askingPrice) || askingPrice<1 || askingPrice>10000000)) {
      throw new Problem(400,'Prüfe den Verkaufspreis.')
    }
    store.db.prepare(`INSERT INTO wardrobe_sales (wardrobe_id,state,condition,flaws,original_price,asking_price_cents,created,price_class,quantity) VALUES (?,'selling',?,?,?,?,?,?,?)
      ON CONFLICT(wardrobe_id) DO UPDATE SET state='selling',condition=excluded.condition,flaws=excluded.flaws,
        original_price=excluded.original_price,asking_price_cents=excluded.asking_price_cents,sold=NULL,price_class=excluded.price_class,quantity=excluded.quantity,
        created=CASE WHEN wardrobe_sales.state='sorted' THEN excluded.created ELSE wardrobe_sales.created END`).run(id,condition,text(data.flaws,350),price as number|null,askingPrice,dateInBerlin(),priceClass,quantity)
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
