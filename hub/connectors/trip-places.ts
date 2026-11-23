import {openMeteoLocations} from './outfit-weather.ts'
import {Problem} from '../runtime/settings.ts'

export type TripPlace={name:string,country:string,region:string,kind:'city'|'island'}
const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').trim().toLocaleLowerCase('de-DE')

const islands = [
  ['Teneriffa','Spanien','Kanarische Inseln','Tenerife'],
  ['Kreta','Griechenland','Kreta','Crete','Kriti'],
  ['Mallorca','Spanien','Balearen','Majorca'],
  ['Madeira','Portugal','Madeira'],
  ['Gran Canaria','Spanien','Kanarische Inseln'],
  ['Sizilien','Italien','Sizilien','Sicily','Sicilia'],
  ['Bali','Indonesien','Bali'],
]
const cache=new Map<string,{until:number,result:Promise<TripPlace[]>}>()
let pending=0

function placesFromResponse(raw:unknown):TripPlace[] {
  if (!raw || typeof raw!=='object' || !('results' in raw) || !Array.isArray(raw.results)) return []
  return raw.results.slice(0,20).flatMap(value=>{
    if (!value || typeof value!=='object') return []
    const {name,country,admin1,feature_code}=value
    if (typeof name!=='string'||typeof country!=='string'||!name.trim()||!country.trim()||name.length+country.length>98) return []
    const island=feature_code==='ISL'||feature_code==='ISLS'
    if (!island && feature_code && (typeof feature_code!=='string'||!feature_code.startsWith('PPL'))) return []
    return [{name,country,region:typeof admin1==='string'&&admin1.length<=90?admin1:'',kind:island?'island':'city'}]
  })
}

export async function searchTripPlaces(query:string,citiesOnly:boolean) {
  const clean=query.trim()
  if (clean.length<2) return []
  if (clean.length>100 || /[\p{Cc}]/u.test(clean)) throw new Problem(400,'Prüfe den Ortsnamen.')
  const [name,qualifier]=normalize(clean).split(',').map(part=>part.trim())
  const local:TripPlace[]=citiesOnly?[]:islands.flatMap(([label,country,region,...aliases])=>
    [label,...aliases].some(alias=>normalize(alias).startsWith(name)) &&
    (!qualifier||[country,region].some(value=>normalize(value).includes(qualifier)))?
      [{name:label,country,region,kind:'island'}]:[])
  const key=normalize(clean)
  let entry=cache.get(key)
  if (!entry || entry.until<Date.now()) {
    if (pending>=6) {
      if (local.length) return local
      throw new Problem(429,'Die Ortssuche ist gerade ausgelastet.')
    }
    if (cache.size>=100) {
      const oldest=cache.keys().next()
      if (!oldest.done) cache.delete(oldest.value)
    }
    pending++
    const result=openMeteoLocations(clean,20).then(placesFromResponse).catch(reason=>{
      if (cache.get(key)?.result===result) cache.delete(key)
      throw reason
    }).finally(()=>{pending--})
    entry={until:Date.now()+300_000,result}
    cache.set(key,entry)
  }
  let remote:TripPlace[]
  try { remote=await entry.result }
  catch {
    if (local.length) return local
    throw new Problem(503,'Die Ortssuche ist gerade nicht erreichbar. Du kannst den Ort eingeben.')
  }
  const found=new Map<string,TripPlace>()
  for (const place of [...local,...remote]) {
    if (citiesOnly && place.kind!=='city') continue
    const id=normalize([place.name,place.country,place.region].join(','))
    if (!found.has(id)) found.set(id,place)
  }
  return [...found.values()].slice(0,8)
}
