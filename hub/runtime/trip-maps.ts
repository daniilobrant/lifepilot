/*
 * Google-My-Maps-Export für Reisen: Orte aus dem Reiseplan sammeln, kategorisieren und als CSV, ZIP (eine CSV je Kategorie) oder KML ausgeben.
 * Reine Funktionen ohne Datenbank, damit Oberfläche und Tests dieselbe Logik nutzen. Es werden keine Koordinaten erfunden:
 * My Maps ermittelt die Position selbst aus der Spalte „Adresse“.
 */
import type { TripPlan } from './trip-types.ts'

export const mapCategories = [
  { id:'sights', emoji:'👁️', label:'Sehenswürdigkeiten', standard:true },
  { id:'restaurants', emoji:'🍴', label:'Restaurants', standard:true },
  { id:'cafes', emoji:'☕', label:'Cafés', standard:true },
  { id:'bars', emoji:'🍸', label:'Bars', standard:true },
  { id:'stay', emoji:'🏠', label:'Unterkunft', standard:true },
  { id:'clubs', emoji:'💃', label:'Clubs', standard:true },
  { id:'beaches', emoji:'🏖️', label:'Strände', standard:false },
  { id:'nature', emoji:'🌿', label:'Natur', standard:false },
  { id:'shopping', emoji:'🛍️', label:'Shopping', standard:false },
  { id:'activities', emoji:'🎭', label:'Aktivitäten', standard:false },
  { id:'other', emoji:'📍', label:'Sonstiges', standard:false },
] as const
export type MapCategoryId = typeof mapCategories[number]['id']
export const categoryTitle=(id:string)=>{
  const found=mapCategories.find(entry=>entry.id===id)
  return found ? found.emoji+' '+found.label : '📍 '+id
}
export type MapPlace = { key:string, name:string, address:string, category:string, description:string, day:string, source:'plan'|'tip'|'stay'|'manual', guess:boolean }
export type MapState = { overrides:Record<string,{category?:string,selected?:boolean,hidden?:boolean}>, manual:{id:string,name:string,address:string,category:string}[],
  mapName?:string, includeStay:boolean, stayAddress:boolean, format:'csv'|'zip'|'kml' }
export const emptyMapState=():MapState=>({overrides:{},manual:[],includeStay:false,stayAddress:false,format:'csv'})

const rules:[MapCategoryId,RegExp][] = [
  ['clubs',/(?<![\p{L}])(?:club|disco\w*|nachtclub|techno)(?![\p{L}])/iu],
  ['bars',/(?<![\p{L}])(?:bar|bars|cocktail\w*|pub|weinbar|rooftop|sundowner|speakeasy|biergarten)(?![\p{L}])/iu],
  ['cafes',/(?<![\p{L}])(?:caf[eé]s?|kaffee\w*|coffee|fr[uü]hst[uü]ck\w*|brunch|b[aä]ckerei|konditorei|caf[eé]teria)(?![\p{L}])/iu],
  ['restaurants',/(?<![\p{L}])(?:restaurants?|trattoria|osteria|tapas\w*|bistro|pizzeria|ramen|sushi|imbiss|brasserie|taverne|mittagessen|abendessen|dinner|lunch|essen)(?![\p{L}])/iu],
  ['beaches',/(?<![\p{L}])(?:strand|str[aä]nde|beach|playa|bucht|lagune)(?![\p{L}])/iu],
  ['nature',/(?<![\p{L}])(?:nationalpark|naturpark|wanderung|wanderweg|wasserfall|see|berg|gipfel|schlucht|botanisch\w*|garten|park|wald|vulkan|d[uü]ne)(?![\p{L}])/iu],
  ['shopping',/(?<![\p{L}])(?:markt|m[aä]rkte|shopping|einkaufs\w*|mall|boutique|souvenir\w*|flohmarkt|outlet)(?![\p{L}])/iu],
  ['activities',/(?<![\p{L}])(?:tour|kurs|workshop|kajak|tauchen|schnorcheln|konzert|show|musical|theater|ticket\w*|f[uü]hrung|bootsfahrt|fahrradverleih|spa|therme|freizeitpark|zoo|aquarium)(?![\p{L}])/iu],
  ['stay',/(?<![\p{L}])(?:hotel|hostel|apartment|unterkunft|pension|ferienwohnung|airbnb|resort)(?![\p{L}])/iu],
  ['sights',/(?<![\p{L}])(?:museum|kathedrale|basilika|kirche|dom|palast|schloss|burg|turm|platz|br[uü]cke|altstadt|viertel|tempel|moschee|ruine\w*|denkmal|aussichts\w*|mirador|galerie|sehensw[uü]rdigkeit\w*|stadtmauer|festung|hafen|promenade|park|mirador\w*|igreja|castelo|palacio|pal[aá]cio|torre|pra[cç]a|plaza|ponte|puente|museu|museo|mus[eé]e|jardim|jard[ií]n|convento|mosteiro|monasterio|aqueduto|bas[ií]lica|catedral|cattedrale|chiesa|piazza|ch[aâ]teau|[eé]glise|s[eé]|alcazar|alc[aá]zar|castillo)(?![\p{L}])/iu],
]
/** Eindeutige Treffer sind sicher; ohne Treffer wird als Sehenswürdigkeit geraten und zur Prüfung markiert. */
export function categorize(text:string):{category:MapCategoryId,guess:boolean} {
  for (const [category,pattern] of rules) if (pattern.test(text)) return {category,guess:false}
  return {category:'sights',guess:true}
}

/** Der Ortsname entscheidet zuerst; erst ohne Treffer zählt der Beschreibungstext. Unterkunft kommt nur aus der Unterkunftsangabe selbst. */
function placeKind(name:string,text:string) {
  const byName=categorize(name)
  if (!byName.guess) return byName.category==='stay'?{category:'sights' as MapCategoryId,guess:true}:byName
  const byText=categorize(name+' '+text)
  return byText.category==='stay'?{category:'sights' as MapCategoryId,guess:true}:byText
}
const slug=(value:string)=>value.toLocaleLowerCase('de-DE').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
const hasLocation=(value:string)=>/\d/u.test(value)||value.includes(',')
const geocodable=(name:string,address:string,destination:string)=>{
  const base=address.trim()||name.trim()
  return hasLocation(base)||slug(base).includes(slug(destination.split(',')[0]))?base:base+', '+destination
}

/** Sammelt Orte aus Tagesplan, Sehenswürdigkeiten-Tipps, Buchungen und eigenen Einträgen und legt gespeicherte Änderungen darüber. */
export function collectPlaces(plan:TripPlan,state:MapState):MapPlace[] {
  const destination=plan.draft.destination
  const found=new Map<string,MapPlace>()
  const add=(place:Omit<MapPlace,'key'|'guess'>&{guess?:boolean})=>{
    const name=place.name.trim().slice(0,150)
    if (!name) return
    const key=slug(name)
    if (!key||found.has(key)) return
    const {guess,...rest}=place
    found.set(key,{...rest,name,key,guess:guess??false})
  }
  for (const day of plan.days) for (const activity of day.activities) {
    if (!activity.place?.trim()) continue
    const name=activity.place.includes(',') ? activity.place.split(',')[0] : activity.place
    const kind=placeKind(name,activity.text)
    add({name,address:geocodable(name,activity.place,destination),category:kind.category,guess:kind.guess,description:activity.text,day:day.date,source:'plan'})
  }
  for (const tip of plan.tips) if (tip.topic==='Sehenswürdigkeiten') for (const section of tip.content.sections) for (const item of section.items) {
    const kind=placeKind(item.title,item.detail??'')
    add({name:item.title,address:geocodable(item.title,'',destination),category:kind.category,guess:kind.guess,description:item.detail??'',day:'',source:'tip'})
  }
  for (const booking of plan.bookings) if (booking.status!=='cancelled'&&booking.kind==='activity'&&booking.location.trim()) {
    const kind=categorize(booking.name+' '+booking.location)
    add({name:booking.name,address:geocodable(booking.name,booking.location,destination),category:kind.category,guess:false,description:'Buchung '+booking.date,day:booking.date,source:'plan'})
  }
  const stays=plan.bookings.filter(entry=>entry.kind==='stay'&&entry.status!=='cancelled')
  const stayName=plan.draft.stay||stays[0]?.name||''
  if (stayName) {
    const full=plan.draft.stayAddress||stays[0]?.location||''
    // Ohne ausdrückliche Freigabe bleibt die genaue Adresse draußen: Es wird nur nach Name und Stadt gesucht.
    add({name:stayName,address:state.stayAddress&&full?geocodable(stayName,full,destination):stayName+', '+destination.split(',')[0],
      category:'stay',description:'Unterkunft',day:plan.draft.start,source:'stay'})
  }
  for (const manual of state.manual) add({name:manual.name,address:geocodable(manual.name,manual.address,destination),category:manual.category,description:'',day:'',source:'manual'})
  return [...found.values()].filter(place=>!state.overrides[place.key]?.hidden).map(place=>{
    const override=state.overrides[place.key]
    return override?.category ? {...place,category:override.category,guess:false} : place
  })
}
export const isSelected=(place:MapPlace,state:MapState)=>{
  if (place.category==='stay'&&!state.includeStay) return false
  return state.overrides[place.key]?.selected ?? true
}

const countries:Record<string,string> = {deutschland:'DE',spanien:'ES',italien:'IT',frankreich:'FR',portugal:'PT',griechenland:'GR',kroatien:'HR','türkei':'TR',tuerkei:'TR',
  'österreich':'AT',oesterreich:'AT',schweiz:'CH',niederlande:'NL',belgien:'BE',luxemburg:'LU',england:'GB',schottland:'GB',irland:'IE',
  'vereinigtes königreich':'GB',grossbritannien:'GB','großbritannien':'GB',norwegen:'NO',schweden:'SE',finnland:'FI','dänemark':'DK',daenemark:'DK',island:'IS',
  polen:'PL',tschechien:'CZ',ungarn:'HU',slowenien:'SI',slowakei:'SK',rumänien:'RO',bulgarien:'BG',serbien:'RS',montenegro:'ME',albanien:'AL',malta:'MT',
  zypern:'CY',estland:'EE',lettland:'LV',litauen:'LT',usa:'US',kanada:'CA',mexiko:'MX',brasilien:'BR',argentinien:'AR',chile:'CL',peru:'PE',kolumbien:'CO',
  japan:'JP',china:'CN',thailand:'TH',vietnam:'VN',indonesien:'ID',malaysia:'MY',singapur:'SG',philippinen:'PH',indien:'IN',sri:'LK',nepal:'NP',
  marokko:'MA','ägypten':'EG',aegypten:'EG',tunesien:'TN',südafrika:'ZA',kenia:'KE',tansania:'TZ',australien:'AU',neuseeland:'NZ',dubai:'AE',
  'vereinigte arabische emirate':'AE',jordanien:'JO',israel:'IL',georgien:'GE',armenien:'AM',kuba:'CU',
}
const cities:Record<string,string> = {barcelona:'ES',madrid:'ES',valencia:'ES',sevilla:'ES',malaga:'ES','málaga':'ES',mallorca:'ES',ibiza:'ES',teneriffa:'ES',
  rom:'IT',mailand:'IT',venedig:'IT',florenz:'IT',neapel:'IT',bologna:'IT',turin:'IT',sizilien:'IT',paris:'FR',nizza:'FR',lyon:'FR',marseille:'FR',
  lissabon:'PT',porto:'PT',faro:'PT',athen:'GR',santorini:'GR',kreta:'GR',split:'HR',dubrovnik:'HR',zagreb:'HR',istanbul:'TR',antalya:'TR',
  wien:'AT',salzburg:'AT',innsbruck:'AT',zürich:'CH',zuerich:'CH',genf:'CH',amsterdam:'NL',rotterdam:'NL',brüssel:'BE',bruessel:'BE',london:'GB',edinburgh:'GB',
  dublin:'IE',oslo:'NO',stockholm:'SE',kopenhagen:'DK',helsinki:'FI',reykjavik:'IS',warschau:'PL',krakau:'PL',prag:'CZ',budapest:'HU',
  berlin:'DE',hamburg:'DE',münchen:'DE',muenchen:'DE',köln:'DE',koeln:'DE',stuttgart:'DE',frankfurt:'DE',leipzig:'DE',dresden:'DE',
  'new york':'US','los angeles':'US',miami:'US','san francisco':'US',tokio:'JP',tokyo:'JP',kyoto:'JP',osaka:'JP',bangkok:'TH',phuket:'TH',bali:'ID',
  hanoi:'VN',singapur:'SG',lima:'PE',marrakesch:'MA',kairo:'EG',kapstadt:'ZA',sydney:'AU',melbourne:'AU',tiflis:'GE',
}
const flagOf=(iso:string)=>String.fromCodePoint(...[...iso].map(letter=>0x1F1E6+letter.charCodeAt(0)-65))
/** Landesflagge aus einer festen Tabelle bekannter Länder und Städte. Unbekannte Ziele bekommen keine Flagge. */
export function destinationFlag(destination:string):string|undefined {
  const parts=destination.split(',').map(part=>slug(part)).filter(Boolean)
  for (const part of [...parts].reverse()) if (countries[part]) return flagOf(countries[part])
  for (const part of parts) if (cities[part]) return flagOf(cities[part])
  const first=parts[0]?.split(' ')[0]
  if (first&&(countries[first]||cities[first])) return flagOf((countries[first]??cities[first]))
}
const monthFormat=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric',timeZone:'UTC'})
export function defaultMapName(plan:TripPlan) {
  const city=plan.draft.destination.split(',')[0].trim()
  const flag=destinationFlag(plan.draft.destination)??'🌍'
  const when=/^\d{4}-\d{2}-\d{2}$/u.test(plan.draft.start)?' – '+monthFormat.format(new Date(plan.draft.start.slice(0,7)+'-01T00:00:00Z')):''
  return city+' '+flag+when
}

// ---------- Ausgabe ----------
const BOM='﻿'
/** Zellen, die mit =, +, -, @ oder Steuerzeichen beginnen, würden Tabellenprogramme als Formel lesen. */
export const safeCell=(value:string)=>/^[=+\-@\t\r]/u.test(value)?"'"+value:value
const csvCell=(value:string)=>'"'+safeCell(value.replace(/\r?\n/gu,' ')).replace(/"/gu,'""')+'"'
const header=['Name','Adresse','Kategorie','Beschreibung','Tag']
function csvRows(places:MapPlace[]) {
  return [header,...places.map(place=>[place.name,place.address,categoryTitle(place.category),place.description,place.day])].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n'
}
export type ExportFile = { name:string, mime:string, bytes:Uint8Array }
const encoder=new TextEncoder()
const fileSafe=(value:string)=>value.replace(/[\\/:*?"<>|\u0000-\u001f]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,80)||'Reisekarte'
const groupByCategory=(places:MapPlace[])=>{
  const groups=new Map<string,MapPlace[]>()
  for (const place of places) groups.set(place.category,[...(groups.get(place.category)??[]),place])
  return [...groups.entries()].sort((a,b)=>{
    const order=(id:string)=>{const index=mapCategories.findIndex(entry=>entry.id===id);return index<0?99:index}
    return order(a[0])-order(b[0])||a[0].localeCompare(b[0])
  })
}
export const exportWarnings=(places:MapPlace[])=>{
  const warnings:string[]=[]
  if (groupByCategory(places).length>10) warnings.push('My Maps erlaubt höchstens 10 Ebenen je Karte. Für die ZIP-Variante bitte Kategorien zusammenlegen.')
  return warnings
}

const xml=(value:string)=>value.replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char] as string)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu,'')
export function kml(name:string,places:MapPlace[]) {
  const folders=groupByCategory(places).map(([category,list])=>`  <Folder>\n    <name>${xml(categoryTitle(category))}</name>\n${list.map(place=>
    `    <Placemark>\n      <name>${xml(place.name)}</name>\n      <address>${xml(place.address)}</address>\n      <description>${xml(place.description)}</description>\n    </Placemark>`).join('\n')}\n  </Folder>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n  <name>${xml(name)}</name>\n${folders}\n</Document>\n</kml>\n`
}

const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;table[n]=c>>>0}return table})()
const crc32=(bytes:Uint8Array)=>{let c=0xFFFFFFFF;for(const byte of bytes)c=crcTable[(c^byte)&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
/** ZIP ohne Kompression (Methode „stored“), UTF-8-Dateinamen. Reicht für kleine CSV-Dateien und braucht keine Bibliothek. */
export function zip(files:{name:string,bytes:Uint8Array}[]):Uint8Array {
  const parts:Uint8Array[]=[], central:Uint8Array[]=[]
  let offset=0
  const u16=(value:number)=>[value&255,(value>>>8)&255], u32=(value:number)=>[value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255]
  for (const file of files) {
    const name=encoder.encode(file.name), crc=crc32(file.bytes)
    const local=Uint8Array.from([0x50,0x4b,3,4,...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(file.bytes.length),...u32(file.bytes.length),...u16(name.length),...u16(0)])
    parts.push(local,name,file.bytes)
    central.push(Uint8Array.from([0x50,0x4b,1,2,...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(file.bytes.length),...u32(file.bytes.length),
      ...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]),name)
    offset+=local.length+name.length+file.bytes.length
  }
  const size=central.reduce((sum,part)=>sum+part.length,0)
  const end=Uint8Array.from([0x50,0x4b,5,6,...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(size),...u32(offset),...u16(0)])
  const all=[...parts,...central,end]
  const out=new Uint8Array(all.reduce((sum,part)=>sum+part.length,0))
  let at=0
  for (const part of all) { out.set(part,at); at+=part.length }
  return out
}

export function buildExport(mapName:string,places:MapPlace[],format:MapState['format']):ExportFile {
  const base=fileSafe(mapName)
  if (format==='kml') return {name:base+'.kml',mime:'application/vnd.google-earth.kml+xml',bytes:encoder.encode(kml(mapName,places))}
  if (format==='zip') {
    const files=groupByCategory(places).map(([category,list])=>({name:fileSafe(categoryTitle(category))+'.csv',bytes:encoder.encode(BOM+csvRows(list))}))
    return {name:base+'.zip',mime:'application/zip',bytes:zip(files)}
  }
  return {name:base+'.csv',mime:'text/csv;charset=utf-8',bytes:encoder.encode(BOM+csvRows(places))}
}

export function parseMapState(value:unknown):MapState {
  const empty=emptyMapState()
  if (!value||typeof value!=='object'||Array.isArray(value)) return empty
  const input=value as Record<string,unknown>
  const text=(raw:unknown,max:number)=>typeof raw==='string'?raw.replace(/\p{Cc}/gu,' ').trim().slice(0,max):''
  const category=(raw:unknown)=>{const id=text(raw,40);return mapCategories.some(entry=>entry.id===id)?id:'other'}
  const overrides:MapState['overrides']={}
  if (input.overrides&&typeof input.overrides==='object') for (const [key,raw] of Object.entries(input.overrides as Record<string,unknown>).slice(0,400)) {
    if (!raw||typeof raw!=='object') continue
    const entry=raw as Record<string,unknown>
    overrides[text(key,160)]={...(typeof entry.category==='string'&&{category:category(entry.category)}),
      ...(typeof entry.selected==='boolean'&&{selected:entry.selected}),...(entry.hidden===true&&{hidden:true})}
  }
  const manual=Array.isArray(input.manual)?input.manual.slice(0,100).flatMap(raw=>{
    if (!raw||typeof raw!=='object') return []
    const entry=raw as Record<string,unknown>
    const name=text(entry.name,150)
    return name?[{id:text(entry.id,40)||String(Math.random()).slice(2),name,address:text(entry.address,240),category:category(entry.category)}]:[]
  }):[]
  const name=text(input.mapName,120)
  return {overrides,manual,...(name&&{mapName:name}),includeStay:input.includeStay===true,stayAddress:input.stayAddress===true,
    format:input.format==='zip'||input.format==='kml'?input.format:'csv'}
}
