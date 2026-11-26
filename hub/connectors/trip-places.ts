import {openMeteoLocations} from './outfit-weather.ts'
import {Problem} from '../runtime/settings.ts'

export type TripPlace={name:string,country:string,region:string,kind:'city'|'island'}
export type TripAddress={name:string,detail:string,address:string}
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
  if (clean.length<3) return []
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

const addressCache=new Map<string,{until:number,result:Promise<TripAddress[]>}>()
let addressPending=0

async function fetchBoundedJson(url:URL) {
  const response=await fetch(url,{signal:AbortSignal.timeout(4500),redirect:'error',headers:{Accept:'application/json'}})
  if (!response.ok || !response.headers.get('content-type')?.includes('json') || !response.body) throw Error()
  const reader=response.body.getReader()
  const decoder=new TextDecoder()
  let text='',size=0
  try {
    while (true) {
      const {value,done}=await reader.read()
      if (done) break
      size+=value.byteLength
      if (size>96_000) throw Error()
      text+=decoder.decode(value,{stream:true})
    }
  } finally { await reader.cancel().catch(()=>{}) }
  return JSON.parse(text+decoder.decode())
}

function uniqueParts(parts:string[]) {
  const seen=new Set<string>()
  const out:string[]=[]
  for (const raw of parts) {
    const part=raw.trim()
    if (!part) continue
    const key=normalize(part)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(part)
  }
  return out
}

function addressesFromPhoton(raw:unknown):TripAddress[] {
  if (!raw || typeof raw!=='object' || !('features' in raw) || !Array.isArray(raw.features)) return []
  return raw.features.slice(0,16).flatMap(feature=>{
    if (!feature || typeof feature!=='object' || !('properties' in feature) || !feature.properties || typeof feature.properties!=='object') return []
    const props=feature.properties as Record<string,unknown>
    const str=(key:string)=>typeof props[key]==='string'?(props[key] as string).trim():''
    const rawName=str('name')
    const street=[str('street'),str('housenumber')].filter(Boolean).join(' ')
    const city=str('city')||str('locality')||str('district')||str('county')||str('state')
    const postcode=str('postcode')
    const country=str('country')
    const name=rawName||street||city
    if (!name || name.length>120) return []
    const cityLine=[postcode,city].filter(Boolean).join(' ')
    const address=uniqueParts([rawName,street,cityLine||city,country]).join(', ').slice(0,200)
    const detail=uniqueParts([street!==name?street:'',city!==name?city:'',country]).join(' · ').slice(0,140)
    if (!address) return []
    return [{name,detail,address}]
  })
}

async function queryRemoteAddresses(clean:string,destination:string):Promise<TripAddress[]> {
  const city=destination.split(',')[0].trim()
  const query=city&&!normalize(clean).includes(normalize(city)) ? `${clean}, ${destination}` : clean
  const url=new URL('https://photon.komoot.io/api/')
  url.search=new URLSearchParams({q:query,lang:'de',limit:'8'}).toString()
  return addressesFromPhoton(await fetchBoundedJson(url))
}

export async function searchTripAddresses(query:string,destination='') {
  const clean=query.trim()
  const cleanDest=destination.trim()
  if (clean.length<3) return []
  if (clean.length>160 || cleanDest.length>120 || /[\p{Cc}]/u.test(clean+cleanDest)) {
    throw new Problem(400,'Prüfe die eingegebene Adresse.')
  }
  const key=normalize(clean+'|'+cleanDest)
  let entry=addressCache.get(key)
  if (!entry || entry.until<Date.now()) {
    if (addressPending>=6) throw new Problem(429,'Die Adresssuche ist gerade ausgelastet.')
    if (addressCache.size>=100) {
      const oldest=addressCache.keys().next()
      if (!oldest.done) addressCache.delete(oldest.value)
    }
    addressPending++
    const result=queryRemoteAddresses(clean,cleanDest).catch(reason=>{
      if (addressCache.get(key)?.result===result) addressCache.delete(key)
      throw reason
    }).finally(()=>{addressPending--})
    entry={until:Date.now()+300_000,result}
    addressCache.set(key,entry)
  }
  let remote:TripAddress[]
  try { remote=await entry.result }
  catch {
    throw new Problem(503,'Die Adresssuche ist gerade nicht erreichbar. Du kannst die Adresse direkt eingeben.')
  }
  const found=new Map<string,TripAddress>()
  for (const item of remote) {
    const id=normalize(item.address)
    if (!found.has(id)) found.set(id,item)
  }
  return [...found.values()].slice(0,8)
}
