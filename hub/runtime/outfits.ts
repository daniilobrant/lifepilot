import {personalProfile} from './personal-profile.ts'
import { fragranceList, recommendFragrance, travelWardrobe } from './wardrobe-extras.ts'
import { paletteScore, paletteDescription, colorRelation } from './outfit-palette.ts'
import { guessedStyleTags } from './outfit-fields.ts'
import { randomUUID } from 'node:crypto'
import { dateInBerlin } from './values.ts'
import { Problem } from './settings.ts'
import type { Store } from './store.ts'
import { bodyProportions, emptyStyle, isLongOrHeavyBaseTop, itemOccasion, outerWeight, outfitDayparts, outfitSlot, outfitSlotOrder, outfitSlots, outfitStyles, preferredCuts, wardrobeCategories, type Outfit, type OutfitQuery, type OutfitOverview,
  type OutfitSlot, type OutfitWeather, type StyleProfile, type WardrobeCategory, type WardrobeDraft, type WardrobeItem } from './outfit-types.ts'

const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu
const maxPhotos = 256 * 1024 * 1024
const demo: WardrobeDraft[] = [
  ['Roter Rundhals-Pullover','top','Rot','100 % Lammwolle','Regular','Winter','Akzent, Schlicht'],
  ['Dunkelgraue Bundfaltenhose','bottom','Dunkelgrau','Wolle','Weit','Ganzjährig','Eleganz, Smart Casual'],
  ['Dunkelblauer Wollmantel','outer','Dunkelblau','Wolle','Regular','Winter','Eleganz'],
  ['Schwarze Chelsea-Boots','shoes','Schwarz','Glattleder','Regular','Ganzjährig','Eleganz, Schlicht'],
  ['Silberne Armbanduhr','accessory','Silber','Edelstahl','Regular','Ganzjährig','Schlicht, Eleganz'],
  ['Weißes Baumwollhemd','top','Weiß','Baumwolle','Regular','Ganzjährig','Büro, Eleganz'],
  ['Blaue Straight Jeans','bottom','Blau','Denim','Regular','Ganzjährig','Streetwear, Alltag'],
].map(([name,category,color,material,fit,season,tags]) => ({name,category:category as WardrobeCategory,color,material,fit,season,tags,source:''}))

function itemRows(store: Store): WardrobeItem[] {
  return store.db.prepare(`SELECT w.id,w.name,w.category,w.color,w.material,w.fit,w.season,w.tags,w.source,w.brand,w.retailer,w.model,w.size,
    w.garment_type AS garmentType,w.photo IS NOT NULL AS hasPhoto,w.photo_origin AS photoOrigin,sale.state AS saleState,
    CASE WHEN purchase.decision='pending' THEN CASE WHEN purchase.arrived=1 THEN 'review' ELSE 'ordered' END END AS orderState
    FROM wardrobe_items w LEFT JOIN clothing_order_items purchase ON purchase.wardrobe_id=w.id
    LEFT JOIN wardrobe_sales sale ON sale.wardrobe_id=w.id
    WHERE (purchase.decision IS NULL OR purchase.decision='kept') AND (sale.state IS NULL OR sale.state IN ('selling','sorted')) ORDER BY w.rowid`)
    .all().map(row => ({...row,hasPhoto:Boolean(row.hasPhoto),orderState:row.orderState??undefined,saleState:row.saleState??undefined}) as WardrobeItem)
}
function record(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Problem(400,'Ungültige Outfit-Eingabe.')
  return value as Record<string,unknown>
}
function field(raw: unknown, limit: number, required = false) {
  const value = raw ?? ''
  if (typeof value !== 'string' || value.length > limit || required && !value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Problem(400,'Bitte prüfe die Eingaben und Pflichtfelder.')
  }
  return value.trim()
}
export function outfitOverview(store: Store, examples = false): OutfitOverview {
  if (examples && !store.db.prepare('SELECT 1 FROM outfit_demo_seed WHERE singleton=1').get()) {
    store.transaction(() => {
      if (!store.db.prepare('SELECT 1 FROM wardrobe_items LIMIT 1').get()) for (const piece of demo) saveWardrobe(store,piece)
      store.db.exec('INSERT INTO outfit_demo_seed VALUES (1)')
    })
  }
  const profile = store.db.prepare('SELECT details,photo IS NOT NULL AS hasPhoto FROM outfit_profile WHERE singleton=1').get()
  const photos = new Map<string,string[]>()
  for (const row of store.db.prepare('SELECT id,look_id FROM outfit_look_photos ORDER BY added_at,id').all()) {
    const key = String(row.look_id)
    const list = photos.get(key) ?? []
    list.push(String(row.id))
    photos.set(key,list)
  }
  const looks = store.db.prepare('SELECT * FROM outfit_looks ORDER BY saved_at DESC LIMIT 200').all()
    .map(row => ({ ...JSON.parse(String(row.result)) as Outfit, id: String(row.id), savedAt: String(row.saved_at), photoIds: photos.get(String(row.id)) ?? [] }))
  return { wardrobe:itemRows(store), profile:{...emptyStyle,...(profile ? JSON.parse(String(profile.details)) : {})}, profilePhoto:Boolean(profile?.hasPhoto), looks }
}

export function saveWardrobe(store: Store, value: unknown, id?: string) {
  const row = record(value)
  if (typeof row.category !== 'string' || !Object.hasOwn(wardrobeCategories,row.category)) throw new Problem(400,'Wähle die Kategorie.')
  const source = field(row.source,500)
  if (source) {
    try {
      const url = new URL(source)
      if (url.protocol !== 'https:' || url.username || url.password) throw Error()
    } catch { throw new Problem(400,'Gib eine gültige HTTPS-Adresse ein.') }
  }
  const args = [field(row.name,120,true),row.category,field(row.color,100),field(row.material,120),field(row.fit,70),field(row.season,70),field(row.tags,180),source]
  const brand = field(row.brand,70)
  const retailer = field(row.retailer,100)
  const model = field(row.model,90)
  const size = field(row.size,40), garmentType = field(row.garmentType,45)
  if (id) {
    if (!store.db.prepare(`UPDATE wardrobe_items SET name=?,category=?,color=?,material=?,fit=?,season=?,tags=?,source=?,brand=coalesce(?,brand),retailer=coalesce(?,retailer),model=coalesce(?,model),size=coalesce(?,size),garment_type=coalesce(?,garment_type) WHERE id=?`)
      .run(...args,row.brand===undefined?null:brand,row.retailer===undefined?null:retailer,row.model===undefined?null:model,row.size===undefined?null:size,row.garmentType===undefined?null:garmentType,id).changes) throw new Problem(404,'Kleidungsstück nicht gefunden.')
    return {id}
  }
  if (Number(store.db.prepare('SELECT COUNT(*) AS count FROM wardrobe_items').get()?.count) >= 300) throw new Problem(409,'Der Schrank enthält bereits 300 Teile.')
  const key = randomUUID()
  store.db.prepare('INSERT INTO wardrobe_items (name,category,color,material,fit,season,tags,source,brand,retailer,model,size,garment_type,id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...args,brand,retailer,model,size,garmentType,key)
  return {id:key}
}

export function saveStyle(store: Store, value: unknown) {
  const row = record(value)
  const data = Object.fromEntries(Object.keys(emptyStyle).map(key => [key,field(row[key],key === 'preferences' ? 350 : 100)])) as StyleProfile
  if ((data.preferredCut && !preferredCuts.some(cut=>cut===data.preferredCut)) ||
      (data.preferredStyle && !outfitStyles.includes(data.preferredStyle)) ||
      (data.proportions && !bodyProportions.some(option=>option===data.proportions))) {
    throw new Problem(400,'Wähle einen gültigen Schnitt, Stil oder Proportionshinweis.')
  }
  store.db.prepare(`INSERT INTO outfit_profile (singleton,details) VALUES (1,?)
    ON CONFLICT(singleton) DO UPDATE SET details=excluded.details`).run(JSON.stringify(data))
  return data
}

function checkPhotoSpace(store: Store, bytes: number) {
  const size = Number(store.db.prepare(`SELECT
    (SELECT coalesce(sum(length(photo)),0) FROM wardrobe_items) +
    (SELECT coalesce(sum(length(photo)),0) FROM outfit_profile) +
    (SELECT coalesce(sum(length(photo)),0) FROM outfit_look_photos) AS total`).get()?.total)
  if (size + bytes > maxPhotos) throw new Problem(409,'Der lokale Fotospeicher ist voll.')
}

export function attachOutfitPhoto(store: Store, item: string, image: Uint8Array, mime: string, origin:'own'|'web'|'unknown'='unknown') {
  if (item !== 'profile' && !idPattern.test(item)) throw new Problem(400,'Ungültiges Fotoziel.')
  const prior = outfitPhoto(store,item)?.photo.length ?? 0
  checkPhotoSpace(store,image.byteLength-prior)
  if (item === 'profile') {
    store.db.prepare(`INSERT INTO outfit_profile (singleton,details,photo,mime) VALUES (1,?,?,?)
      ON CONFLICT(singleton) DO UPDATE SET photo=excluded.photo,mime=excluded.mime`).run(JSON.stringify(emptyStyle),image,mime)
  } else if (!store.db.prepare('UPDATE wardrobe_items SET photo=?,mime=?,photo_origin=? WHERE id=?').run(image,mime,origin,item).changes) {
    throw new Problem(404,'Kleidungsstück nicht gefunden.')
  }
  return { saved:true }
}

export function outfitPhoto(store: Store,item: string) {
  if (item !== 'profile' && !idPattern.test(item)) return undefined
  return (item === 'profile'
    ? store.db.prepare('SELECT photo,mime FROM outfit_profile WHERE singleton=1 AND photo IS NOT NULL').get()
    : store.db.prepare('SELECT photo,mime FROM wardrobe_items WHERE id=? AND photo IS NOT NULL').get(item)) as
    { photo: Uint8Array, mime: string } | undefined
}

export function saveLookPhoto(store: Store, photo: Uint8Array, lookId?: string, name?: string, replace?:string) {
  checkPhotoSpace(store,photo.byteLength)
  const look = lookId ?? randomUUID()
  const at = new Date().toISOString()
  if (replace) {
    const changed=store.db.prepare('UPDATE outfit_look_photos SET photo=? WHERE id=? AND look_id=?').run(photo,replace,look)
    if (!changed.changes) throw new Problem(404,'Foto nicht gefunden.')
    return {id:replace,look}
  }
  if (lookId) {
    if (!store.db.prepare('SELECT 1 FROM outfit_looks WHERE id=?').get(lookId)) throw new Problem(404,'Look nicht gefunden.')
    const count = Number(store.db.prepare('SELECT count(*) AS n FROM outfit_look_photos WHERE look_id=?').get(lookId)?.n)
    if (count >= 6) throw new Problem(409,'Pro Look sind sechs Tragefotos möglich.')
  } else {
    if (Number(store.db.prepare('SELECT count(*) AS n FROM outfit_looks').get()?.n) >= 200) throw new Problem(409,'Das Lookbook enthält bereits 200 Looks.')
    const outfit: Outfit = {title:field(name,120)||'Mein Look vom '+dateInBerlin().split('-').reverse().join('.'),
      date:dateInBerlin(),occasion:'',style:'Schlicht',itemIds:[],rationale:'',tips:[],prompt:''}
    store.db.prepare('INSERT INTO outfit_looks VALUES (?,?,?)').run(look,JSON.stringify(outfit),at)
  }
  const id = randomUUID()
  store.db.prepare('INSERT INTO outfit_look_photos VALUES (?,?,?,?)').run(id,look,photo,at)
  return {id,look}
}
export function assignLookPieces(store:Store,look:string,items:string[]) {
  const row=store.db.prepare('SELECT result FROM outfit_looks WHERE id=?').get(look)
  if (!row) throw new Problem(404,'Look nicht gefunden.')
  const owned=new Set(itemRows(store).filter(item=>!item.orderState && !item.saleState).map(item=>item.id))
  if (items.length>16 || items.length!==new Set(items).size || items.some(id=>!owned.has(id))) {
    throw new Problem(400,'Wähle vorhandene Kleidungsstücke aus.')
  }
  const outfit=JSON.parse(String(row.result)) as Outfit
  store.db.prepare('UPDATE outfit_looks SET result=? WHERE id=?').run(JSON.stringify({...outfit,itemIds:items}),look)
  return {id:look,itemIds:items}
}
export function lookPhoto(store: Store,id: string) {
  return store.db.prepare('SELECT photo FROM outfit_look_photos WHERE id=?').get(id)?.photo as Uint8Array|undefined
}
export function removeLookPhoto(store: Store,id: string) {
  if (!store.db.prepare('DELETE FROM outfit_look_photos WHERE id=?').run(id).changes) throw new Problem(404,'Foto nicht gefunden.')
  return {removed:true}
}

export function removeOutfitData(store: Store, target: 'item' | 'look' | 'profile-photo', key: string) {
  if (target === 'profile-photo') {
    store.db.exec('UPDATE outfit_profile SET photo=NULL,mime=NULL WHERE singleton=1')
  } else if (target === 'look') {
    if (!store.db.prepare('DELETE FROM outfit_looks WHERE id=?').run(key).changes) throw new Problem(404,'Look nicht gefunden.')
  } else {
    if (store.db.prepare("SELECT 1 FROM clothing_order_items WHERE wardrobe_id=? AND decision='pending'").get(key)) {
      throw new Problem(409,'Entscheide bei der Bestellung, ob du das Teil behältst.')
    }
    if (store.db.prepare("SELECT 1 FROM outfit_looks, json_each(outfit_looks.result,'$.itemIds') WHERE json_each.value=? LIMIT 1").get(key)) {
      throw new Problem(409,'Das Stück gehört zu einem gespeicherten Look. Lösche zuerst den Look.')
    }
    if (!store.db.prepare('DELETE FROM wardrobe_items WHERE id=?').run(key).changes) throw new Problem(404,'Kleidungsstück nicht gefunden.')
  }
  return { removed:true }
}

const proposalTtl = 20 * 60_000
const cutPatterns: Record<string, RegExp> = {
  Schmal: /schmal|slim|skinny|tapered/iu,
  Gerade: /gerade|straight|regular/iu,
  Locker: /locker|weit|relaxed|loose|wide/iu,
  Oversized: /oversize|boxy/iu,
  Tailliert: /tailliert|fitted|tailored/iu,
}

const proportionTips: Record<string,string> = {
  'Schultern und Hüfte ähnlich breit': 'Wenn du mehr Kontur möchtest, kannst du die Taille mit einer klaren Bundlinie betonen.',
  'Schultern breiter als Hüfte': 'Für eine ausgeglichene Silhouette kannst du unten mit etwas mehr Weite arbeiten.',
  'Hüfte breiter als Schultern': 'Für eine ausgeglichene Silhouette kannst du oben mit Struktur oder einer zusätzlichen Schicht arbeiten.',
  'Längere Beine': 'Wenn du den Oberkörper optisch strecken möchtest, probiere ein etwas längeres Oberteil.',
  'Längerer Oberkörper': 'Wenn du die Beinlinie betonen möchtest, probiere einen höheren Bund.',
}

function sizeScore(item: WardrobeItem, profile: StyleProfile) {
  const size = item.category==='top' || item.category==='outer' ? profile.topSize :
    item.category==='bottom' ? profile.bottomSize : item.category==='shoes' ? profile.shoeSize : ''
  if (!size) return 0
  const normalize = (value:string) => value.toUpperCase().replace(/\s+/gu,'').replace(',','.')
  const selected = normalize(size)
  const tags = item.name+' · '+item.tags
  const measured = item.size || (/\b(?:Größe|Size)\s*[:=]?\s*(EU\s*\d{2}(?:[.,]5)?|W\s*\d{2}|[345]?X{0,2}[SML]|\d{2}(?:[.,]5)?)(?![\p{L}\p{N}])/iu.exec(tags)?.[1]
    ?? /\b(EU\s*\d{2}(?:[.,]5)?|W\s*\d{2})(?![\p{L}\p{N}])/iu.exec(tags)?.[1])
  if (!measured) return 0
  const expected = normalize(measured)
  const comparable = (value:string) => /^\d/u.test(value) ? 'EU' : /^(EU|W)\d/u.exec(value)?.[1] ?? 'letter'
  if (comparable(selected) !== comparable(expected)) return 0
  return selected.replace(/^EU/u,'') === expected.replace(/^EU/u,'') ? 7 : -5
}

function lookTitle(occasion:string,temperature:number|undefined,wet:boolean,daypart:string|undefined,seed:number) {
  if (occasion) {
    const short=occasion.length>42?occasion.slice(0,42).replace(/\s+\S*$/u,'')+' …':occasion
    return 'Dein Look für '+short
  }
  const pick=(options:string[])=>options[Math.abs(seed)%options.length]
  if (wet) return pick(['Gut gerüstet für Regen','Dein Look für nasses Wetter'])
  if (daypart==='Abends') return pick(['Dein Abendlook','Bereit für den Abend'])
  if (temperature!==undefined&&temperature<=3) return pick(['Warm durch den Frost','Dein Look für frostige Tage'])
  if (temperature!==undefined&&temperature<=12) return pick(['Warm geschichtet','Dein Look für kühle Tage'])
  if (temperature!==undefined&&temperature>=24) return pick(['Leicht durch den Tag','Dein Sommerlook'])
  return pick(['Dein Outfit für heute','Dein Look des Tages'])
}

export class OutfitStudio {
  private proposals = new Map<string,{ look:Outfit, at:number }>()
  generate(store:Store, value:unknown, calendarOccasion = '', weather?: OutfitWeather) {
    const input=record(value)
    if (!['occasion','anchor','inspiration'].includes(String(input.mode)) ||
        (input.style !== undefined && !outfitStyles.includes(input.style as OutfitQuery['style'])) ||
        !Array.isArray(input.required) || input.required.length>8 || input.required.some(key => typeof key!=='string' || !idPattern.test(key)) ||
        typeof input.variant!=='number' || !Number.isSafeInteger(input.variant) || input.variant<0 || input.variant>10000 ||
        (input.temperature!==undefined && (typeof input.temperature!=='number' || !Number.isFinite(input.temperature) || input.temperature < -40 || input.temperature>50))) {
      throw new Problem(400,'Wähle einen gültigen Styling-Modus und Stil.')
    }
    const overview=outfitOverview(store)
    const {profile}=overview
    if (input.daypart!==undefined && !outfitDayparts.includes(input.daypart as OutfitQuery['daypart'] & string)) {
      throw new Problem(400,'Wähle eine gültige Tageszeit.')
    }
    if (input.time!==undefined && (typeof input.time!=='string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(input.time))) {
      throw new Problem(400,'Wähle eine gültige Uhrzeit.')
    }
    if (input.tripId!==undefined && (typeof input.tripId!=='string' || !idPattern.test(input.tripId))) throw new Problem(400,'Wähle eine Reise.')
    const packed=typeof input.tripId==='string' ? new Set(travelWardrobe(store,input.tripId)) : undefined
    const wardrobe=overview.wardrobe.filter(item=>!item.orderState && !item.saleState && (!packed || packed.has(item.id)))
    if (packed && !wardrobe.length) throw new Problem(409,'Wähle zuerst Kleidung für diese Reise aus.')
    const preferredStyle = outfitStyles.find(style=>style===profile.preferredStyle)
    const occasionText=field(input.occasion,110)
    const requestedStyle=/\bstreetwear\b/iu.test(occasionText) ? 'Streetwear' :
      /\b(?:elegant\w*|eleganz|black tie|blacktie|cocktail)\b/iu.test(occasionText) ? 'Eleganz' :
      /\bauffällig\w*\b/iu.test(occasionText) ? 'Auffällig' : undefined
    const query={...input,style:input.style ?? requestedStyle ?? preferredStyle ?? 'Schlicht',occasion:occasionText} as OutfitQuery
    if (query.mode==='anchor' && !query.required.length) throw new Problem(400,'Wähle mindestens ein Pflichtteil.')
    if (query.mode==='occasion' && !query.occasion) throw new Problem(400,'Gib einen Anlass ein.')
    const pinned=[...new Set(query.required)].map(id=>wardrobe.find(item=>item.id===id))
    if (pinned.some(item=>!item)) throw new Problem(409,'Ein Pflichtteil ist nicht mehr im Kleiderschrank.')
    const chosenBySlot = new Map<OutfitSlot, WardrobeItem>()
    for (const item of pinned as WardrobeItem[]) {
      chosenBySlot.set(outfitSlot(item), item)
    }
    const chosen=[...chosenBySlot.values()]
    const statedOccasion=query.occasion || calendarOccasion
    const occasion=statedOccasion || (chosen.length ? 'Rund um ' + chosen[0].name : 'Freie Inspiration')
    const occasionKind=/büro|business|arbeit|meeting|präsentation/iu.test(statedOccasion)?'Büro':
      /dinner|restaurant|date|abend|theater|oper/iu.test(statedOccasion)?'Dinner':/sport|training|fitness|wander/iu.test(statedOccasion)?'Sport':
      /feier|party|club|geburtstag|ausgehen|bar\b/iu.test(statedOccasion)?'Ausgehen':/uni|vorlesung|hochschule/iu.test(statedOccasion)?'Uni':/vorstellungsgespräch|interview|hochzeit|beerdigung|konferenz|gala/iu.test(statedOccasion)?'Büro':undefined
    const formal=/büro|business|eleganz|feier|date|abend/iu.test(occasion+' '+query.style)
    const comparable=(value:string)=>value.toLocaleLowerCase('de-DE').split(/[^\p{L}\p{N}]+/u).filter(part=>part.length>=3)
    const personal=personalProfile(store).fields
    const preference=[profile.preferences,personal.preferences,personal.interests].filter(Boolean).join(' · ').split(/[,.!;·]+/u)
    const preferred = preference.filter(clause=>!/\b(?:kein\w*|keine\w*|ohne|nicht|meide)\b/iu.test(clause)).flatMap(comparable)
    const avoided = preference.filter(clause=>/\b(?:kein\w*|keine\w*|ohne|nicht|meide)\b/iu.test(clause))
      .flatMap(clause=>comparable(clause).filter(word=>!/^kein|^ohne$|^nicht$|^meide$/u.test(word)))
    const date=typeof input.date==='string' ? input.date : undefined
    const temperature=weather ? Math.min(weather.feels ?? weather.current ?? (weather.min+weather.max)/2,weather.min+5) : query.temperature
    const wet=Boolean(weather && ((weather.rain ?? 0)>=45 || (weather.snow ?? 0)>0))
    const windy=(weather?.wind ?? 0)>=32
    const cut = Object.hasOwn(cutPatterns,profile.preferredCut) ? cutPatterns[profile.preferredCut] : undefined
    const proportionTip = Object.hasOwn(proportionTips,profile.proportions) ? proportionTips[profile.proportions] : undefined
    let variation = query.variant
    // Farben, die der Nutzer im Text nennt („in Blau“, „schwarzer Look“), werden bevorzugt.
    const colorWords=comparable(occasionText).filter(word=>/^(?:schwarz|wei[sß]|grau|blau|navy|rot|bordeaux|gr[uü]n|oliv|beige|braun|camel|gelb|rosa|pink|lila|orange)/u.test(word)).map(word=>word.replace(/e[rsnm]?$/u,''))
    // Vorausschau: Ein Oberteil wird danach bewertet, ob zu ihm überhaupt passende Hosen, Jacken und Schuhe vorhanden sind.
    const lookahead = (item: WardrobeItem, category: WardrobeCategory) => category==='accessory' ? 0 : (['top','bottom','outer','shoes'] as WardrobeCategory[])
      .filter(other=>other!==category&&!chosen.some(picked=>picked.category===other)).reduce((sum,other)=>{
        const candidates=wardrobe.filter(entry=>entry.category===other)
        if(!candidates.length)return sum
        return sum+Math.max(-12,Math.min(6,Math.max(...candidates.map(entry=>paletteScore(entry,[item,...chosen],query.style)))))
      },0)
    const rankItems = (items: WardrobeItem[], category: WardrobeCategory) => items.map(item => {
      const itemText=[item.name,item.brand,item.model,item.tags,item.fit,item.material].join(' ').toLowerCase()
      let score=sizeScore(item,profile)
      if(/sport|training|fitness/iu.test(occasion)&&/sport|training|sneaker|funktion|jersey/iu.test(itemText))score+=6
      if(itemText.includes(query.style.toLowerCase()) || guessedStyleTags(itemText).includes(query.style))score+=4
      if(formal&&/eleganz|wolle|boots|hemd|leder|smart/u.test(itemText))score+=2
      score+=paletteScore(item,chosen,query.style)+lookahead(item,category)
      if(colorWords.length&&colorWords.some(word=>item.color.toLowerCase().includes(word)))score+=6
      if(occasionKind&&itemOccasion(item).includes(occasionKind))score+=3
      if(item.material && chosen.some(other=>/wolle|wool/iu.test(other.material)) && /leder|leather/iu.test(item.material))score+=2
      if (cut && cut.test(item.fit || item.tags+' '+item.name)) score+=5
      score+=preferred.filter(word=>itemText.includes(word)).length
      score-=avoided.filter(word=>itemText.includes(word)).length*5
      if(temperature!==undefined && (temperature<12 && /winter|wolle|fleece|thermo/u.test((itemText+item.season).toLowerCase()) ||
        temperature>23 && /sommer|leinen/u.test((itemText+item.season).toLowerCase())))score+=3
      if (category==='outer' && temperature!==undefined && !wet) {
        const weight = outerWeight(item)
        if (temperature<=8) score += weight==='winter' ? 12 : weight==='transition' ? -6 : 2
        else if (temperature<=18) score += weight==='transition' ? 10 : weight==='winter' ? -5 : 3
      }
      if (wet && (category==='outer'||category==='shoes')) {
        if (/wasserfest|wasserdicht|waterproof|regen|hardshell|gore.tex/u.test(itemText)) score+=8
        if (/wildleder|suede|sandale|canvas/u.test(itemText)) score-=5
      }
      if (windy && category==='outer' && /winddicht|windproof|windbreaker|hardshell/u.test(itemText)) score+=5
      return {item,score}
    }).sort((a,b)=>b.score-a.score)

    function pick(items:WardrobeItem[],category:WardrobeCategory) {
      const ranked=rankItems(items,category)
      if (!ranked.length) return
      // Varianten kommen nur aus Teilen, die fast so gut passen wie das beste. Unruhige Farbpaare fallen so heraus.
      const close=ranked.filter(entry=>entry.score>=ranked[0].score-10)
      const choices=Math.min(close.length,4)
      const item=close[variation % choices].item
      chosen.push(item)
      variation=Math.floor(variation / choices)
      return item
    }
    const base=wardrobe.filter(item=>outfitSlot(item)==='base')
    const knit=wardrobe.filter(item=>outfitSlot(item)==='knit')
    const lightBase=base.filter(item=>!isLongOrHeavyBaseTop(item))
    let selectedBase=chosen.find(item=>outfitSlot(item)==='base')
    let selectedKnit=chosen.find(item=>outfitSlot(item)==='knit')
    if (!selectedBase&&!selectedKnit) {
      if (temperature!==undefined&&temperature<=10) {
        selectedKnit=pick(knit,'top')
        if (!selectedKnit) selectedBase=pick(base,'top')
      } else {
        const preferLight=temperature!==undefined&&temperature>=24&&lightBase.length
        selectedBase=pick(preferLight?lightBase:base,'top')
        if (!selectedBase) selectedKnit=pick(knit,'top')
      }
    }
    if (temperature!==undefined&&temperature<=10&&selectedBase&&!selectedKnit&&!isLongOrHeavyBaseTop(selectedBase)) selectedKnit=pick(knit,'top')
    // Unter jedem Strick liegt ein T-Shirt oder Langarmshirt. Bei Kälte bevorzugt ein Langarmshirt.
    if (selectedKnit&&!selectedBase) {
      const cold=temperature!==undefined&&temperature<=12
      const longBase=base.filter(isLongOrHeavyBaseTop)
      selectedBase=pick(cold&&longBase.length?longBase:!cold&&lightBase.length?lightBase:base,'top')
    }

    for (const category of (['bottom','outer','shoes','accessory'] as const)) {
      if(chosen.some(item=>item.category===category)) continue
      if(category==='outer' && ((temperature!==undefined&&temperature>20 || temperature===undefined&&!formal&&query.style==='Schlicht') && !wet && !windy)) continue
      let candidates = wardrobe.filter(item=>item.category===category)
      if (category==='outer') {
        const winter=temperature!==undefined&&temperature<=8
        const hasWeatherProtection=(item:WardrobeItem)=>{
          const text=[item.name,item.tags,item.material,item.garmentType].join(' ').toLowerCase()
          return wet
            ? /wasserfest|wasserdicht|waterproof|regen|hardshell|gore.tex/u.test(text)
            : /winddicht|windproof|windbreaker|hardshell/u.test(text)
        }
        const protectedPieces=wet||windy ? candidates.filter(hasWeatherProtection) : []
        const pool=protectedPieces.length ? protectedPieces : candidates
        const weight=winter?'winter':temperature!==undefined?'transition':undefined
        const matching=weight ? pool.filter(item=>outerWeight(item)===weight) : []
        candidates=matching.length ? matching : pool
      }
      pick(candidates,category)
    }
    chosen.sort((a,b)=>outfitSlotOrder.indexOf(outfitSlot(a))-outfitSlotOrder.indexOf(outfitSlot(b)))
    if(!chosen.length)throw new Problem(409,'Füge zuerst ein Kleidungsstück zum Kleiderschrank hinzu.')
    const core=(['top','bottom','shoes'] as const).filter(cat=>!chosen.some(item=>item.category===cat))
    const contrast=chosen.some((item,index)=>chosen.slice(index+1).some(other=>colorRelation(item.color,other.color)==='contrast'))
    const materials=[...new Set(chosen.map(item=>item.material).filter(Boolean))]
    const tips=[
      ...(weather && temperature!==undefined && temperature<12 ? ['Für die kühlere Tageszeit lohnt sich eine zusätzliche Schicht.'] : []),
      ...(wet ? ['Niederschlag möglich. Bevorzuge eine wasserfeste Außenschicht und geschlossene Schuhe.'] : []),
      ...(windy ? ['Bei Wind hilft eine winddichte Außenschicht.'] : []),
      ...(contrast ? ['Lass eine der Kontrastfarben als Akzent wirken und gib der anderen mehr Fläche.'] : []),
      ...(chosen.some(item=>item.fit&&/weit|oversized/iu.test(item.fit)) ? ['Bei weitem Schnitt die Taille mit dem vorhandenen Oberteil klar definieren.'] : []),
      ...(chosen.some(item=>item.category==='outer') && chosen.some(item=>item.category==='top') ?
        ['Trage die vorhandene Außenschicht offen, wenn das Oberteil sichtbar bleiben soll.'] : []),
      ...(proportionTip ? [proportionTip] : []),
      ...(cut && chosen.some(item=>cut.test(item.fit || item.tags+' '+item.name)) ? [`Dein bevorzugter Schnitt „${profile.preferredCut}“ ist im Look vertreten.`] : []),
      ...(profile.preferences ? [`Passform-Hinweis aus deinem Profil: ${profile.preferences}`] : []),
      ...(profile.height ? [`Saum und Beinlänge für ${profile.height} prüfen.`] : []),
      ...(profile.topSize||profile.bottomSize||profile.shoeSize ? [`Größen zum Anprobieren: ${[profile.topSize&&'Oberteil '+profile.topSize,profile.bottomSize&&'Hose '+profile.bottomSize,profile.shoeSize&&'Schuhe '+profile.shoeSize].filter(Boolean).join(' · ')}.`] : []),
      ...(core.length ? [`Für ${core.map(cat=>wardrobeCategories[cat]).join(', ')} ist kein passendes Teil hinterlegt.`] : []),
    ]
    const title=lookTitle(statedOccasion,temperature,wet,query.daypart ?? (input.time ? (Number(String(input.time).slice(0,2))>=18?'Abends':undefined) : undefined),query.variant)
    // Kurz halten: nur die Farbidee. Größen- und Passformhinweise stehen in den Styling-Tipps.
    const rationale=paletteDescription(chosen.map(item=>item.color).filter(Boolean)) || (materials.length>1?`Materialmix aus ${materials.join(', ')}.`:'')
    const prompt=`Editorial wardrobe lookbook, charcoal studio backdrop, full outfit and detail panels. Anlass: ${occasion}. Stil: ${query.style}. Exakt diese Stücke und keine weiteren: ${chosen.map(item=>[item.name,item.brand,item.model,item.color,item.material,item.fit].filter(Boolean).join(' / ')).join('; ')}.`
    const fragrance=recommendFragrance(fragranceList(store),{occasion,date,time:query.time,daypart:query.daypart,temperature})
    const look:Outfit={title,occasion:statedOccasion,style:query.style,itemIds:chosen.map(item=>item.id),rationale,tips,prompt,...(fragrance && {fragrance}), ...(date && {date}), ...(weather && {weather})}
    for(const [key,value] of this.proposals) if(Date.now()-value.at>proposalTtl)this.proposals.delete(key)
    if(this.proposals.size>=80) this.proposals.delete(this.proposals.keys().next().value!)
    const proposal=randomUUID()
    this.proposals.set(proposal,{look,at:Date.now()})
    return {look,proposal}
  }

  save(store:Store,key:string) {
    const value=this.proposals.get(key)
    if(!value||Date.now()-value.at>proposalTtl) throw new Problem(409,'Der Vorschlag ist abgelaufen. Erstelle einen neuen Look.')
    const current=new Set(itemRows(store).map(item=>item.id))
    if(value.look.itemIds.some(item=>!current.has(item)))throw new Problem(409,'Der Kleiderschrank wurde geändert.')
    if (!store.db.prepare('SELECT 1 FROM outfit_looks WHERE id=?').get(key) &&
        Number(store.db.prepare('SELECT count(*) AS count FROM outfit_looks').get()?.count) >= 200) {
      throw new Problem(409,'Das Lookbook enthält bereits 200 Looks. Entferne einen Look, um Platz zu schaffen.')
    }
    store.db.prepare('INSERT OR IGNORE INTO outfit_looks VALUES (?,?,?)').run(key,JSON.stringify(value.look),new Date().toISOString())
    return {id:key}
  }
}
