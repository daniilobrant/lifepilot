import type { TripArrival } from './trip-routes.ts'

export const packingCategories = ['Kleidung','Toilettenartikel','Hygiene','Dokumente','Technik','Gesundheit','Zubehör'] as const
export const tripPeriods = ['Vormittag','Nachmittag','Abend'] as const
export const tipTopics = ['Sicherheit','Gesundheit','Kultur','Lokales Essen','Apps & Transport','Sehenswürdigkeiten','Häufige Betrugsmaschen','Nützliche Sätze'] as const
export const bookingKinds = { stay:'Unterkunft', transport:'Anreise', activity:'Aktivität' } as const
export const tripStates = { BW:'Baden-Württemberg',BY:'Bayern',BE:'Berlin',BB:'Brandenburg',HB:'Bremen',HH:'Hamburg',HE:'Hessen',
  MV:'Mecklenburg-Vorpommern',NI:'Niedersachsen',NW:'Nordrhein-Westfalen',RP:'Rheinland-Pfalz',SL:'Saarland',SN:'Sachsen',
  ST:'Sachsen-Anhalt',SH:'Schleswig-Holstein',TH:'Thüringen' } as const
export type TripState = keyof typeof tripStates
export type TripChatPlan = {
  intent:'draft'|'windows'|'open'|'change'|'booking', destination:string|null, departure:string|null,
  start:string|null, end:string|null, people:number|null, maxLeave:number|null, detail:string|null,
  transport:TripDraft['transport']|null, luggage:TripDraft['luggage']|null,
  brief?:string|null,stay?:string|null,stayAddress?:string|null,exclusions?:string|null,tempo?:TripDraft['tempo']|null,
}
export type TripDraft = {
  destination:string, departure:string, start:string, end:string, people:number, interests:string, exclusions:string,
  tempo:'relaxed'|'balanced'|'active', transport:'open'|'rail'|'flight'|'car'|'bus', luggage:'open'|'backpack'|'cabin'|'checked',
  stay:string, stayAddress?:string, brief?:string,
}
export type TripBooking = { id:string, kind:keyof typeof bookingKinds, name:string, date:string, until?:string, time:string,
  location:string, origin?:string, reference:string, timezone:string, status:'confirmed'|'pending'|'cancelled' }
export type TripActivity = { id:string, text:string, period:typeof tripPeriods[number], place?:string, booking?:string }
export type TripDay = { date:string, title:string, activities:TripActivity[] }
export type TripItem = { id:string, text:string, detail:string, done:boolean, origin:'template'|'manual' }
export type TripPack = TripItem & { category:typeof packingCategories[number], quantity:number, essential:boolean }
export type TripTip = { topic:typeof tipTopics[number], status:'unvollständig'|'allgemein'|'generiert',
  text:string, sourceIds:string[], content:{ sections:{ title:string, style:'list'|'notice'|'cards'|'phrases',
    items:{title:string,detail?:string,translation?:string,pronunciation?:string}[] }[] } }
export type TripPlan = { format:1, guide?:'generated', draft:TripDraft, overview:string, days:TripDay[], unplacedDays?:TripDay[], bookings:TripBooking[],
  checklist:(TripItem & {topic:string,notNeeded:boolean,notNeededReason:string})[], extra:TripItem[], packing:TripPack[],
  arrival:TripArrival, tips:TripTip[], packingWeather:string, packingTemperature?:number, preparationSummary:string, sources:[] }
export type Trip = TripPlan & {googleCalendar?:'saved'|'pending', id:string, revision:number }
export type TripSummary = { id:string, revision:number, destination:string, start:string, end:string, next:string, status:'ongoing'|'upcoming' }
export type TravelWindow = { start:string,end:string,days:number,leave:string[],free:string[],
  holidays:{date:string,name:string}[],conflicts:string[],stayMatch?:'fits'|'partial'|'outside',freeReasons:{date:string,reason:string}[] }
export type TravelWindows = { state:TripState|null, status:'known'|'unknown', options:TravelWindow[], reason?:string, stayName?:string }
export type TripPreview = {generating?:boolean, id:string, plan:TripPlan, expires:string }

export type TripChangeOffer = { id:string, destination:string, activity:string, from:string, to:string }
export type TripChangeResult = { offer:TripChangeOffer } | { choices:TripSummary[] } | { message:string }

export function tripCalendarTitle(destination:string) {
  const name=destination.split(',',1)[0].trim()
  return /\burlaub$/iu.test(name) ? name : name+' Urlaub'
}

export function bookingOutsideTrip(entry:TripBooking,draft:TripDraft) {
  return entry.status!=='cancelled' && (entry.date<draft.start || (entry.until??entry.date)>draft.end)
}
