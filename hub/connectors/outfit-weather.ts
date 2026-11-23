import { Problem } from '../runtime/settings.ts'
import { dateInBerlin, isDate, shiftDay } from '../runtime/values.ts'
import type { OutfitWeather } from '../runtime/outfit-types.ts'

type Place = { name:string, admin1?:string, country?:string, latitude:number, longitude:number, timezone?:string, population?:number }
const groups = new Map<string,{ at:number, promise:Promise<OutfitWeather> }>()
let pending = 0
const normalize = (value:string) => value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim()

export function outfitLocation(value: unknown): value is string {
  return typeof value==='string' && value.trim().length>=2 && value.length<=80 &&
    /^[\p{L}\p{M}\d][\p{L}\p{M}\d .,'’()/\-]*$/u.test(value.trim())
}

function coordinate(raw: unknown, limit: number): raw is number {
  return typeof raw==='number' && Number.isFinite(raw) && Math.abs(raw)<=limit
}

function placeName(place: Place) {
  return [...new Set([place.name,place.admin1,place.country].filter(Boolean))].join(', ')
}

function choosePlace(raw: unknown, input: string): Place {
  const values = Array.isArray(raw) ? raw.slice(0,8) : []
  const [name,...qualifiers] = input.split(',').map(normalize).filter(Boolean)
  const usable = values.filter((place): place is Place=>Boolean(place && coordinate(place.latitude,90) && coordinate(place.longitude,180) &&
    typeof place.name==='string' && place.name.length<=100 &&
    [place.admin1,place.country,place.timezone].every(value=>value===undefined || typeof value==='string' && value.length<=100)))
  const matching = usable.filter(place=>qualifiers.every(term=>normalize([place.admin1,place.country].filter(Boolean).join(' ')).includes(term)))
  const exact = matching.filter(place=>normalize(place.name)===name)
  const candidates = (exact.length ? exact : matching).sort((a,b)=>(b.population || 0)-(a.population || 0))
  const [top,next] = candidates
  if (!top) throw new Problem(404,'Ort nicht gefunden. Gib einen Ort oder eine Postleitzahl mit Land ein.')
  const names = [...new Set(candidates.map(placeName))]
  if (next && names.length>1 && (top.population ?? 0)<Math.max(10000,(next.population ?? 0)*5)) {
    throw new Problem(409,'Welchen Ort meinst du? '+names.slice(0,3).join(' oder ')+'.')
  }
  return top
}

async function weatherJson(origin:string,path:string,params:Record<string,string>) {
  const url = new URL(path,origin)
  url.search = new URLSearchParams(params).toString()
  const response = await fetch(url,{signal:AbortSignal.timeout(4500),redirect:'error',headers:{Accept:'application/json'}})
  if (!response.ok || !response.headers.get('content-type')?.includes('json') || !response.body) throw Error()
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text='', size=0
  try {
    while (true) {
      const {value,done} = await reader.read()
      if (done) break
      size += value.byteLength
      if (size>96_000) throw Error()
      text += decoder.decode(value,{stream:true})
    }
  } finally { await reader.cancel().catch(()=>{}) }
  return JSON.parse(text+decoder.decode())
}

export function openMeteoLocations(name:string,count:number) {
  return weatherJson('https://geocoding-api.open-meteo.com','/v1/search',{name,count:String(count),language:'de'})
}

export async function fetchOutfitWeather(place: string,date: string): Promise<OutfitWeather> {
  const today=dateInBerlin()
  if (!isDate(date) || date<today || date>shiftDay(today,15)) throw new Problem(400,'Wähle ein Datum von heute bis 15 Tage im Voraus.')
  if (!outfitLocation(place)) throw new Problem(400,'Gib eine Stadt oder Postleitzahl ein.')
  const key=normalize(place)+':'+date
  const cached=groups.get(key)
  if (cached && Date.now()-cached.at<300_000) return cached.promise
  if (groups.size>=32) {
    const oldest=groups.keys().next()
    if (!oldest.done) groups.delete(oldest.value)
  }
  if (pending>=4) throw new Problem(429,'Der Wetterdienst ist beschäftigt. Versuche es gleich erneut.')
  pending++
  const promise=lookupWeather(place,date).catch(error=>{
    groups.delete(key)
    if (error instanceof Problem) throw error
    throw new Problem(503,'Wetterdaten sind gerade nicht erreichbar. Versuche es erneut oder entferne den Ort, um ohne Wetter zu planen.')
  }).finally(()=>{pending--})
  groups.set(key,{at:Date.now(),promise})
  return promise
}

async function lookupWeather(input:string,date:string):Promise<OutfitWeather> {
  const found=await openMeteoLocations(input.split(',')[0].trim(),8)
  const place=choosePlace(found?.results,input)
  const data=await weatherJson('https://api.open-meteo.com','/v1/forecast',{
    latitude:String(place.latitude),longitude:String(place.longitude),timezone:'auto',start_date:date,end_date:date,
    current:'temperature_2m,apparent_temperature', daily:'temperature_2m_min,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max,snowfall_sum',
  })
  const day=data?.daily
  const min=day?.temperature_2m_min?.[0],max=day?.temperature_2m_max?.[0]
  if (day?.time?.[0]!==date || !coordinate(min,95) || !coordinate(max,95) || min>max) throw Error()
  const wet=day.precipitation_probability_max?.[0], wind=day.wind_speed_10m_max?.[0], snow=day.snowfall_sum?.[0]
  const current=data.current?.time?.slice?.(0,10)===date ? data.current : undefined
  return {place:placeName(place),date,min,max,
    ...(coordinate(current?.temperature_2m,95) && {current:current.temperature_2m}),
    ...(coordinate(current?.apparent_temperature,95) && {feels:current.apparent_temperature}),
    ...(coordinate(wet,100) && wet>=0 && {rain:wet}),
    ...(coordinate(wind,300) && wind>=0 && {wind}),
    ...(coordinate(snow,500) && snow>=0 && {snow}),
  }
}
