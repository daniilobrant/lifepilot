import type { TripDraft } from './trip-types.ts'

type ArrivalMode = Exclude<TripDraft['transport'],'open'>
export type TripArrival = { mode:ArrivalMode|null, reason:string, departureAirport?:string, arrivalAirport?:string }
export const mapProviders = { google:'Google Maps', apple:'Apple Karten' } as const
export type MapProvider = keyof typeof mapProviders

type City = [aliases:string,lat:number,lon:number,airport:string]
const cities:City[] = [
  ['stuttgart|esslingen am neckar',48.78,9.18,'Flughafen Stuttgart (STR)'],
  ['frankfurt|frankfurt am main',50.11,8.68,'Flughafen Frankfurt am Main (FRA)'],
  ['munchen|munich',48.14,11.58,'Flughafen München (MUC)'],
  ['berlin|potsdam',52.52,13.41,'Flughafen Berlin Brandenburg (BER)'],
  ['hamburg',53.55,10.00,'Flughafen Hamburg (HAM)'],
  ['koln|cologne|bonn',50.94,6.96,'Flughafen Köln/Bonn (CGN)'],
  ['dusseldorf',51.23,6.78,'Flughafen Düsseldorf (DUS)'],
  ['nurnberg|nuremberg',49.45,11.08,'Flughafen Nürnberg (NUE)'],
  ['leipzig|halle|halle saale',51.34,12.37,'Flughafen Leipzig/Halle (LEJ)'],
  ['hannover|hanover',52.38,9.74,'Flughafen Hannover (HAJ)'],
  ['karlsruhe|baden-baden',49.00,8.40,'Flughafen Karlsruhe/Baden-Baden (FKB)'],
  ['wien|vienna',48.21,16.37,'Flughafen Wien-Schwechat (VIE)'],
  ['zurich|zuerich',47.38,8.54,'Flughafen Zürich (ZRH)'],
  ['basel|mulhouse',47.56,7.59,'EuroAirport Basel-Mulhouse (BSL)'],
  ['amsterdam',52.37,4.90,'Amsterdam Airport Schiphol (AMS)'],
  ['brussel|bruxelles|brussels',50.85,4.35,'Brussels Airport (BRU)'],
  ['paris',48.86,2.35,'Paris Charles de Gaulle (CDG)'],
  ['lissabon|lisboa|lisbon',38.72,-9.14,'Flughafen Lissabon (LIS)'],
  ['porto',41.16,-8.63,'Flughafen Porto (OPO)'],
  ['barcelona',41.39,2.17,'Barcelona-El Prat (BCN)'],
  ['madrid',40.42,-3.70,'Madrid-Barajas (MAD)'],
  ['rom|roma|rome',41.90,12.50,'Rom-Fiumicino (FCO)'],
  ['mailand|milano|milan',45.46,9.19,'Mailand-Malpensa (MXP)'],
  ['prag|praha|prague',50.08,14.44,'Flughafen Prag (PRG)'],
  ['kopenhagen|kobenhavn|copenhagen',55.68,12.57,'Flughafen Kopenhagen (CPH)'],
  ['athen|athina|athens',37.98,23.73,'Flughafen Athen (ATH)'],
  ['london',51.51,-0.13,'London Heathrow (LHR)'],
]
function findCity(text:string) {
  const name=text.split(',')[0].normalize('NFKD').replace(/\p{M}/gu,'').trim().toLowerCase()
  return cities.find(([aliases])=>aliases.split('|').includes(name))
}
function distance(a:City,b:City) {
  const rad=Math.PI/180
  const p=Math.sin((b[1]-a[1])*rad/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin((b[2]-a[2])*rad/2)**2
  return 12742*Math.asin(Math.min(1,Math.sqrt(p)))
}
export function recommendArrival(draft:Pick<TripDraft,'departure'|'destination'|'transport'>):TripArrival {
  const from=findCity(draft.departure),to=findCity(draft.destination)
  const long=from && to && distance(from,to)>650
  const mode=draft.transport!=='open' ? draft.transport : from&&to ? long?'flight':'rail' : null
  const reason=mode===null?'Bahn und Fernbus prüfen. Für längere Strecken lohnt der Vergleich mit einem Flug.'
    : mode==='flight'?'Flugoptionen und Transfers an beiden Enden vergleichen.'
    : mode==='rail' ? long ? 'Für die gewünschte Bahnreise Verbindung und Umstiege prüfen. Ein Flug ist eine mögliche Alternative.'
      : 'Eine Bahnverbindung zwischen den Städten prüfen. Sie kann den Flughafentransfer sparen.'
    : mode==='bus'?'Fernbusverbindungen und Weg zur Haltestelle prüfen.':'Fahrtroute, Pausen und Parken am Ziel einplanen.'
  return {mode,reason,...(from && {departureAirport:from[3]}),...(to && {arrivalAirport:to[3]})}
}

export function mapRoute(provider:MapProvider,destination:string,origin?:string,mode?:ArrivalMode) {
  const url=provider==='google' ? new URL('https://www.google.com/maps/dir/') : new URL('https://maps.apple.com/directions')
  const travel=mode==='rail'||mode==='bus'?'transit':mode==='car'?'driving':undefined
  if (provider==='google') {
    url.searchParams.set('api','1')
    if (origin) url.searchParams.set('origin',origin)
    if (travel) url.searchParams.set('travelmode',travel)
  } else {
    if (origin) url.searchParams.set('source',origin)
    if (travel) url.searchParams.set('mode',travel)
  }
  url.searchParams.set('destination',destination)
  return url.href
}
