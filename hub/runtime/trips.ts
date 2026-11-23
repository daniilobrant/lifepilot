import { personalProfile, type ProfileFields } from './personal-profile.ts'
import { fragranceList, recommendFragrance } from './wardrobe-extras.ts'
import { recommendArrival } from './trip-routes.ts'
import { createHash, randomUUID } from 'node:crypto'
import { Problem } from './settings.ts'
import type { Store } from './store.ts'
import { bounded, dateInBerlin, isDate } from './values.ts'
import { travelDays } from './trip-windows.ts'
import { bookingKinds, packingCategories, tipTopics, tripPeriods, type Trip, type TripActivity, type TripBooking,
  type TripDraft, type TripItem, type TripPack, type TripPlan, type TripPreview, type TripSummary, type TripTip } from './trip-types.ts'

type Row={id:string, revision:number, plan:string}
type ChatLink={run:string,turn:number}
type PendingTrip=TripPreview & {chat?:ChatLink}
const pending = new Map<string,PendingTrip>()
function getPending(id:string,store?:Store):PendingTrip|undefined {
  const row=store?.db.prepare('SELECT data FROM trip_previews WHERE id=? AND expires>?').get(id,new Date().toISOString())
  return row ? JSON.parse(String(row.data)) as PendingTrip : store ? undefined : pending.get(id)
}
function keepPending(preview:PendingTrip,store?:Store) {
  if (!store) {pending.set(preview.id,preview);return}
  store.db.prepare('INSERT OR REPLACE INTO trip_previews (id,data,expires) VALUES (?,?,?)')
    .run(preview.id,JSON.stringify(preview),preview.expires)
}
export function readTripPreview(store:Store,id:string) {
  const saved=getPending(id,store)
  if (!saved) throw new Problem(410,'Der Reiseentwurf ist abgelaufen.')
  const {chat:_chat,...preview}=saved
  return {...preview,plan:packingDefaults(store,preview.plan,id),generating:generating.has(id)}
}
function chatDraft(store:Store, link:ChatLink) {
  const view=store.present(store.run(link.run))
  const data=view.result?.skillData
  if (view.turn!==link.turn || !['review','accepted'].includes(view.state) || view.result?.skill!=='travel' ||
      view.result.questions.length || !data || !('intent' in data) || data.intent!=='draft') {
    throw new Problem(409,'Diese Chat-Nachricht enthält keine aktuelle Reisevorschau.')
  }
  return {...data,people:data.people??1,interests:data.detail??'',brief:data.brief??undefined,stay:data.stay??undefined,stayAddress:data.stayAddress??undefined,
    exclusions:data.exclusions??undefined,tempo:data.tempo??undefined,transport:data.transport??undefined,luggage:data.luggage??undefined}
}
export function chatTripPreview(store:Store,link:ChatLink) {
  const draft=chatDraft(store,link)
  const hex=createHash('sha256').update('travel:'+link.run+':'+link.turn).digest('hex').slice(0,32)
  const id=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-')
  if (store.db.prepare('SELECT 1 FROM trips WHERE id=?').get(id)) return {saved:trip(store,id)}
  const existing=getPending(id,store)
  if (existing) return {preview:readTripPreview(store,id)}
  return {preview:previewTrip(draft,link,id,store)}
}

export function tripRecord(value:unknown) {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Problem(400,'Ungültige Reisedaten.')
  return value as Record<string,unknown>
}
function field(value:unknown,max:number,required=false) {
  if (!required && (value===undefined || value===null || value==='')) return ''
  if (!bounded(value,max)) throw new Problem(400,'Prüfe die Reiseangaben und die Länge der Felder.')
  return value.trim()
}
function choice<T extends string>(value:unknown,allowed:readonly T[],label:string):T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Problem(400,'Ungültige Auswahl für '+label+'.')
  return value as T
}
function integer(value:unknown,min:number,max:number,label:string) {
  if (typeof value!=='number' || !Number.isInteger(value) || value<min || value>max) throw new Problem(400,'Ungültige Anzahl für '+label+'.')
  return value
}
function tripDraft(value:unknown):TripDraft {
  const v=tripRecord(value)
  if (!isDate(v.start) || !isDate(v.end) || v.start>v.end || Date.parse(v.end)-Date.parse(v.start)>30*86_400_000) {
    throw new Problem(400,'Gib An- und Abreise an. Der Planer unterstützt bis zu 31 Tage.')
  }
  return {destination:field(v.destination,100,true),departure:field(v.departure,100,true),start:v.start,end:v.end,
    people:integer(v.people??1,1,30,'Reisende'),interests:field(v.interests,220),exclusions:field(v.exclusions,220),
    tempo:choice(v.tempo??'balanced',['relaxed','balanced','active'],'Tempo'),
    transport:choice(v.transport??'open',['open','rail','flight','car','bus'],'Anreise'),
    luggage:choice(v.luggage??'open',['open','backpack','cabin','checked'],'Gepäck'),stay:field(v.stay,150),stayAddress:field(v.stayAddress,200),...(typeof v.brief==='string' && v.brief && {brief:field(v.brief,6000)})}
}

function item(text:string,detail='',origin:TripItem['origin']='template'):TripItem {
  return {id:randomUUID(),text,detail,done:false,origin}
}

function checklist(draft:TripDraft):TripPlan['checklist'] {
  const tasks=[
    ['entry','Einreise und Dokumente prüfen','Prüfe bei einer offiziellen Stelle, welche Dokumente für deine Staatsangehörigkeit und Route nötig sind.'],
    ['accommodation','Ankunft mit Unterkunft klären',draft.stay ? 'Prüfe Check-in und Adresse für '+draft.stay+'.' : 'Klär Adresse, Check-in und Zugang, sobald die Unterkunft feststeht.'],
    ['health','Reiseapotheke und Reisehinweise prüfen','Prüfe die offiziellen Hinweise für deine Route. Klär persönliche Fragen bei Bedarf fachlich.'],
    ['connectivity','Mobilfunktarif und Datenbedarf prüfen','Prüfe Roaming und Fair-Use in deinem Tarif. Vergleiche bei Bedarf eine SIM oder eSIM.'],
    ['banking','Zahlungsmittel und Gebühren prüfen','Prüfe Karten, mögliche Auslandsgebühren und ob du Bargeld in Landeswährung brauchst.'],
    ['insurance','Versicherungsschutz für Reise prüfen','Prüfe EHIC und private Reisekrankenversicherung getrennt sowie Geltungsbereich und Rücktransport.'],
  ]
  return tasks.map(([topic,text,detail])=>({...item(text,detail),topic,notNeeded:false,notNeededReason:''}))
}

function packing(draft:TripDraft,count:number):TripPack[] {
  const limit=draft.luggage==='backpack'?4:draft.luggage==='cabin'?7:10
  const clothing=Math.min(count,limit)
  const base:[string,TripPack['category'],number,string?][]=[
    ['Unterwäsche','Kleidung',clothing],['Socken','Kleidung',clothing],['Oberteile','Kleidung',Math.ceil(clothing/2)],
    ['Zahnpflege','Toilettenartikel',1],['Pflegeartikel','Hygiene',1],['Reisedokumente','Dokumente',1],
    ['Ladekabel','Technik',1],['Persönliche Reiseapotheke','Gesundheit',1],['Tagesrucksack','Zubehör',1],
  ]
  if (clothing<count) base[0][3]='Waschmöglichkeit einplanen'
  if (draft.transport==='flight') base.push(['Gepäckvorgaben prüfen','Dokumente',1,'Beim gebuchten Anbieter'])
  if (/wandern|hiking/iu.test(draft.interests) && !/wandern|hiking/iu.test(draft.exclusions)) {
    base.push(['Wandersocken','Kleidung',Math.min(clothing,3)],['Wanderschuhe','Zubehör',1])
  }
  return base.map(([name,category,quantity,note])=>({...item(name,note),category,quantity,essential:true}))
}

const phrases=['Hallo','Auf Wiedersehen','Bitte','Danke','Entschuldigung','Wie viel kostet das?','Wo ist …?','Hilfe!']
const portuguese = [
  ['Olá','o-LA'],['Até logo','a-TE LO-gu'],['Por favor','pur fa-VOR'],['Obrigado / Obrigada','obri-GA-du / obri-GA-da'],
  ['Desculpe','desch-KUL-pe'],['Quanto custa?','KUAN-tu KUSCH-ta'],['Onde fica …?','ON-de FI-ka'],['Socorro!','su-KO-rru'],
]

function languageTip(draft:TripDraft):TripTip['content']['sections'][number]|undefined {
  const regions=draft.destination.split(',').map(part=>part.trim().toLowerCase())
  if (regions.includes('deutschland')||regions.includes('österreich')) {
    return {title:'Deutsch vor Ort',style:'phrases',items:phrases.map(title=>({title}))}
  }
  if (regions.includes('portugal')) {
    return {title:'Portugiesisch',style:'phrases',items:portuguese.map(([title,pronunciation],index)=>({
      title,translation:phrases[index],pronunciation,
    }))}
  }
}

function tips(draft:TripDraft):TripTip[] {
  const language=languageTip(draft)
  const sections: TripTip['content']['sections'][] = [
    [{title:'Vor Ort',style:'list',items:[{title:'Amtliche Reisehinweise vor Abfahrt prüfen'},{title:'Wertgegenstände getrennt aufbewahren'},{title:'Rückweg zur Unterkunft vorab klären'}]}],
    [{title:'Vor der Reise',style:'list',items:[{title:'Persönliche Reiseapotheke prüfen'},{title:'Offizielle Gesundheitshinweise zur Route prüfen'}]},
      {title:'Leitungswasser',style:'notice',items:[{title:'Nicht verifiziert'}]}],
    [{title:'Mach’s',style:'list',items:[{title:'Begrüße Mitarbeitende freundlich'},{title:'Beachte Regeln an religiösen Orten'},
      {title:'Frag vor Fotos von Personen'},{title:'Plane Rücksicht auf Anwohnende ein'}]},
      {title:'Vermeide',style:'list',items:[{title:'Blockiere keine engen Wege'},{title:'Betritt keine gesperrten Flächen'},
        {title:'Störe keine Zeremonien'},{title:'Unterstelle keine Trinkgeldregeln'}]},
      {title:'Trinkgeld',style:'notice',items:[{title:'Lokale Praxis und Servicegebühr prüfen'}]}],
    [{title:'Gerichte',style:'notice',items:[{title:'Lokale Gerichte und Ernährungsoptionen noch offen'}]}],
    [{title:'Unterwegs',style:'notice',items:[{title:'Öffentlichen Nahverkehr und Ticket-App prüfen'}]}],
    [{title:'Besuche',style:'notice',items:[{title:'Passende Orte und Öffnungszeiten noch offen'}]}],
    [{title:'Situationen prüfen',style:'cards',items:[{title:'Unerwartete Zahlungsaufforderung',detail:'Zahlungsweg und Anbieter über den offiziellen Kontakt prüfen.'}]}],
    language ? [language] : [{title:'Sprache vor Ort',style:'notice',items:[{title:'Sprache und Aussprache noch offen'}]}],
  ]
  return tipTopics.map((topic,index)=>({topic,text:sections[index][0].items[0].title,sourceIds:[],status:([0,1,6].includes(index) || index===7 && language)?'allgemein':'unvollständig',content:{sections:sections[index]}}))
}

function planTrip(draft:TripDraft):TripPlan {
  const dates=travelDays(draft.start,draft.end)
  const days=dates.map((date,index)=>{
    const first=index===0,last=index===dates.length-1
    const title=first&&last?'Anreise und Rückfahrt':first?'Ankommen':last?'Abreise':'Zeit vor Ort'
    const ideas: (readonly [TripActivity['period'],string])[] = first && last ? [['Vormittag','Anreise mit Puffer'],['Abend','Rückfahrt einplanen']] :
      first ? [['Nachmittag','Ankunft und Weg zur Unterkunft einplanen']] : last ? [['Vormittag','Auschecken und Zeit für die Rückfahrt lassen']] :
        [['Vormittag',draft.interests ? 'Zeit für '+draft.interests+' einplanen' : 'Zeit für ein Ziel in der Umgebung einplanen'],
          ...(draft.tempo!=='relaxed'?[['Nachmittag','Pause und Zeit für einen weiteren Ort'] as const]:[]),
          ...(draft.tempo==='active'?[['Abend','Optionalen Abendblock freihalten'] as const]:[])]
    return {date,title,activities:ideas.map(([period,text])=>({id:randomUUID(),period,text}))}
  })
  return {format:1,draft,arrival:recommendArrival(draft),
    overview:(draft.destination+' vom '+draft.start+' bis '+draft.end+'.').slice(0,350),
    days,bookings:[],checklist:checklist(draft),extra:[],packing:packing(draft,dates.length),tips:tips(draft),sources:[],
    preparationSummary:'Prüfe Einreise, Unterkunft, Gesundheit, Mobilfunk, Zahlungsmittel und Versicherung.',
    packingWeather:'Keine bestätigte Reiseprognose. Prüfe vor Abfahrt das Wetter und passe Kleidung und Gepäck an.'}
}

function preparationForProfile(plan:TripPlan,fields:ProfileFields) {
  const regions=plan.draft.destination.toLocaleLowerCase('de-DE').split(/[,;/]/u).map(part=>part.trim())
  const euro=/^(?:belgien|bulgarien|deutschland|estland|finnland|frankreich|griechenland|irland|italien|kroatien|lettland|litauen|luxemburg|malta|niederlande|österreich|portugal|slowakei|slowenien|spanien|zypern|teneriffa|kanaren|mallorca|gran canaria|barcelona|madrid|lissabon|porto|madeira|paris|rom|amsterdam)$/u
  const euroTrip=regions.some(region=>euro.test(region))
  const euTrip=euroTrip||regions.some(region=>/^(?:dänemark|polen|rumänien|schweden|tschechien|ungarn)$/u.test(region))
  if (!euTrip) return plan.checklist
  const home=fields.location.toLocaleLowerCase('de-DE')
  const germanHome=/(?:^|[,\s])(?:deutschland|germany|esslingen(?: am neckar)?|stuttgart|berlin|hamburg|münchen|frankfurt(?: am main)?|köln|düsseldorf|leipzig|hannover|karlsruhe|baden-baden)(?=$|[,\s])/u.test(home)
  return plan.checklist.map(task=>{
    if (task.topic==='entry' && (fields.travelCitizenship==='eu'||!fields.travelCitizenship&&germanHome)) {
      const assumption=fields.travelCitizenship==='eu' ? 'Laut Profil EU-Staatsangehörigkeit.' :
        'Aus deinem Wohnort abgeleitet: deutsche Staatsangehörigkeit. Im Profil änderbar.'
      return {...task,detail:assumption+' Für EU-Staatsangehörige reicht bei der Einreise ein gültiger Personalausweis oder Reisepass. Die Hinweise gelten für dein Profil. Prüfe die Dokumente der Mitreisenden separat.'}
    }
    if (task.topic==='connectivity' && germanHome) return {...task,detail:'Bei einem deutschen Mobilfunktarif gilt grundsätzlich EU-Roaming. Prüfe dein Datenlimit und bei Schiffen oder Flügen die Netzverbindung.'}
    if (task.topic==='banking' && euroTrip && germanHome) return {...task,detail:'Am Ziel wird in Euro bezahlt. Prüfe die Akzeptanz deiner Karte sowie mögliche Automatengebühren.'}
    return task
  })
}

function packingDefaults(store:Store,plan:TripPlan,tripID:string):TripPlan {
  const fields=personalProfile(store).fields
  const days=travelDays(plan.draft.start,plan.draft.end).length
  const cabin=plan.draft.transport==='flight' && plan.draft.luggage!=='checked'
  const fragrances=fragranceList(store)
  const scent=recommendFragrance(fragrances,{date:plan.draft.start,occasion:plan.draft.interests,temperature:plan.packingTemperature,cabin})
  const fallback=cabin && !scent ? recommendFragrance(fragrances,{date:plan.draft.start,occasion:plan.draft.interests,
    temperature:plan.packingTemperature}) : undefined
  const perfume=scent ? [scent.brand,scent.name].filter(Boolean).join(' ')+' · '+scent.reason :
    fallback ? [fallback.brand,fallback.name].filter(Boolean).join(' ')+' wäre passend. Fürs Handgepäck einen Reiseflakon bis 100 ml verwenden.' :
    cabin ? 'Flakon mit höchstens 100 ml wählen. Größere Flakons ins Aufgabegepäck.' : 'Duft passend zur Reise auswählen.'
  const templates:{key:string,pattern:RegExp,label:string,category:TripPack['category'],count:number,detail:string,enabled:boolean}[]=[
    {key:'headphones',pattern:/kopfhörer|earbuds|airpods|headphones/iu,label:'Kopfhörer',category:'Technik',count:1,detail:'',enabled:true},
    {key:'perfume',pattern:/parfum|parfüm|duftflakon|eau de/iu,label:'Parfüm',category:'Toilettenartikel',count:1,detail:perfume,enabled:true},
    {key:'glasses',pattern:/^brille$|^sehbrille$/iu,label:'Brille',category:'Gesundheit',count:1,detail:'',enabled:fields.glasses==='yes'},
    {key:'contacts',pattern:/^kontaktlinsen$|^tageslinsen$/iu,label:'Kontaktlinsen',category:'Gesundheit',
      count:Math.max(1,Math.ceil(days*2/3)),detail:'Aufgerundet für zwei Drittel der Reisetage.',enabled:fields.contacts==='yes'},
  ]
  const packing=[...plan.packing]
  for (const entry of templates) {
    const hex=createHash('sha256').update(tripID+':'+entry.key).digest('hex')
    const key=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20,32)].join('-')
    const managed=packing.findIndex(row=>row.id===key)
    if (!entry.enabled) {if (managed>=0) packing.splice(managed,1);continue}
    const existing=managed>=0?managed:packing.findIndex(row=>entry.pattern.test(row.text))
    if (existing>=0 && packing[existing].origin==='manual') continue
    const row:TripPack={id:existing>=0?packing[existing].id:key,text:entry.label,detail:entry.detail,
      done:existing>=0?packing[existing].done:false,origin:'template',category:entry.category,
      quantity:existing>=0 && packing[existing].done?packing[existing].quantity:entry.count,essential:true}
    if (existing>=0) packing[existing]=row
    else packing.push(row)
  }
  return {...plan,packing,checklist:preparationForProfile(plan,fields)}
}

function decode(row:Row):Trip {
  const {budgetFacts:_legacy,draft:{budget:_budget,...draft},...plan}=JSON.parse(row.plan) as
    TripPlan & {budgetFacts?:unknown,draft:TripDraft & {budget?:unknown}}
  return {...plan,draft,arrival:recommendArrival(draft),id:row.id,revision:row.revision}
}
export function trip(store:Store,id:string) {
  const row=store.db.prepare('SELECT id,revision,plan FROM trips WHERE id=?').get(id) as Row|undefined
  if (!row) throw new Problem(404,'Reise nicht gefunden.')
  const sync=store.db.prepare('SELECT event_id FROM trip_google_events WHERE trip_id=?').get(id)
  const decoded=decode(row)
  return {...decoded,...packingDefaults(store,decoded,id),googleCalendar:sync ? sync.event_id ? 'saved' as const : 'pending' as const : undefined}
}
export function trips(store:Store,today=dateInBerlin()):TripSummary[] {
  return (store.db.prepare(`SELECT id,revision,plan FROM trips WHERE json_extract(plan,'$.draft.end')>=?
    ORDER BY json_extract(plan,'$.draft.start') ASC, updated DESC LIMIT 200`).all(today) as Row[])
    .map(decode).map(entry=>({id:entry.id,revision:entry.revision,destination:entry.draft.destination,start:entry.draft.start,end:entry.draft.end,
      status:entry.draft.start<=today ? 'ongoing' : 'upcoming',
      next:entry.checklist.find(item=>!item.done && !item.notNeeded)?.text ?? 'Vorbereitung erledigt'}))
}

export function previewTrip(raw:unknown,chat?:ChatLink,id:string=randomUUID(),store?:Store) {
  const now=Date.now()
  for (const [id,entry] of pending) if (Date.parse(entry.expires)<=now) pending.delete(id)
  if (pending.size>=40) pending.delete(pending.keys().next().value!)
  if (store) store.db.exec("DELETE FROM trip_previews WHERE expires<=strftime('%Y-%m-%dT%H:%M:%fZ','now'); DELETE FROM trip_previews WHERE id IN (SELECT id FROM trip_previews ORDER BY expires DESC LIMIT -1 OFFSET 39)")
  const draft=tripDraft(raw)
  if (draft.transport==='flight' && draft.luggage==='open') throw new Problem(400,'Reist du mit Rucksack, Handgepäck oder Koffer?')
  const preview:TripPreview={id,plan:planTrip(draft),expires:new Date(now+(store ? 7*24*60 : 20)*60_000).toISOString()}
  keepPending({...preview,chat},store)
  return store ? {...preview,plan:packingDefaults(store,preview.plan,id)} : preview
}

const generating=new Map<string,Promise<TripPreview>>()

export async function generateTripPreview(store:Store,id:string,generate:(plan:TripPlan)=>Promise<TripPlan>) {
  const current=getPending(id,store) ?? pending.get(id)
  if (!current || Date.parse(current.expires)<=Date.now()) throw new Problem(410,'Die Reisevorschau ist abgelaufen. Erstelle sie erneut.')
  if (current.chat) chatDraft(store,current.chat)
  const {chat:_chat,...preview}=current
  if (current.plan.guide==='generated') return {...preview,plan:packingDefaults(store,preview.plan,id)}
  const previous=generating.get(id)
  if (previous) return previous
  if (generating.size>=2) throw new Problem(429,'Der Urlaubsplaner ist gerade beschäftigt. Versuche es gleich erneut.')
  const job=generate(current.plan).then(plan=>{
    if (!(getPending(id,store) ?? pending.get(id)) || Date.parse(current.expires)<=Date.now()) throw new Problem(410,'Dieser Entwurf ist nicht mehr aktuell.')
    if (current.chat) chatDraft(store,current.chat)
    keepPending({...current,plan},getPending(id,store)?store:undefined)
    return {...preview,plan:packingDefaults(store,plan,id)}
  }).finally(()=>{generating.delete(id)})
  generating.set(id,job)
  return job
}

export function saveTrip(store:Store,id:string) {
  const existing=store.db.prepare('SELECT 1 FROM trips WHERE id=?').get(id)
  if (existing) return trip(store,id)
  const current=getPending(id,store) ?? pending.get(id)
  if (!current || Date.parse(current.expires)<=Date.now()) throw new Problem(410,'Die Reisevorschau ist abgelaufen. Erstelle sie erneut.')
  if (current.chat) chatDraft(store,current.chat)
  if (Number(store.db.prepare('SELECT count(*) AS count FROM trips').get()?.count)>=200) throw new Problem(409,'Das Reiseinventar ist voll.')
  store.db.prepare('INSERT INTO trips (id,revision,plan,updated) VALUES (?,1,?,?)').run(id,JSON.stringify(current.plan),new Date().toISOString())
  pending.delete(id)
  store.db.prepare('DELETE FROM trip_previews WHERE id=?').run(id)
  return trip(store,id)
}

function booking(raw:unknown,draft:TripDraft):TripBooking {
  const b=tripRecord(raw)
  if (!isDate(b.date) || b.date<draft.start || b.date>draft.end) throw new Problem(400,'Das Buchungsdatum muss in der Reise liegen.')
  const until=field(b.until,10)
  if (until && (b.kind!=='stay' || !isDate(until) || until<b.date || until>draft.end)) throw new Problem(400,'Das Check-out-Datum muss in dieser Reise liegen.')
  const time=field(b.time,5)
  if (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(time)) throw new Problem(400,'Ungültige Uhrzeit der Buchung.')
  const timezone=field(b.timezone,70)
  if (timezone) {
    try { new Intl.DateTimeFormat('de-DE',{timeZone:timezone}) } catch { throw new Problem(400,'Gib eine gültige Zeitzone wie Europe/Lisbon ein.') }
  }
  return {id:randomUUID(),timezone,...(until && {until}),kind:choice(b.kind,Object.keys(bookingKinds) as TripBooking['kind'][],'Buchungsart'),date:b.date,time,
    name:field(b.name,120,true),location:field(b.location,200),origin:field(b.origin,200),reference:field(b.reference,100),
    status:choice(b.status??'confirmed',['confirmed','pending','cancelled'],'Buchungsstatus')}
}

export function tripDateChange(current:Trip,start:unknown,end:unknown) {
  const draft=tripDraft({...current.draft,start,end})
  const dates=travelDays(draft.start,draft.end)
  const template=planTrip(draft)
  const previous=[...current.days,...(current.unplacedDays??[])]
  const days=dates.map((date,index)=>previous[index]
    ? {...previous[index],date}
    : template.days[index])
  const unplacedDays=previous.slice(dates.length)
  return {draft,days,unplacedDays,overview:template.overview,
    packingTemperature:undefined,packingWeather:template.packingWeather}
}

export function changeTrip(store:Store,id:string,revision:number,raw:unknown,recordDecision?:()=>void) {
  return store.transaction(()=>{
    const current=trip(store,id)
    if (current.revision!==revision) throw new Problem(409,'Die Reise wurde seitdem geändert. Lade sie erneut.')
    const {id:_id,revision:_revision,googleCalendar:_googleCalendar,...plan}=current
    const stored=String(store.db.prepare('SELECT plan FROM trips WHERE id=?').get(id)?.plan)
    const originalChecklist=(JSON.parse(stored) as TripPlan).checklist
    plan.checklist=plan.checklist.map(row=>({...row,detail:originalChecklist.find(original=>original.id===row.id)?.detail??row.detail}))
    const patch=tripRecord(raw)
    if (patch.kind==='dates') {
      Object.assign(plan,tripDateChange(current,patch.start,patch.end))
    } else if (patch.kind==='packing-weather') {
      if (typeof patch.temperature!=='number' || !Number.isFinite(patch.temperature) || patch.temperature< -50 || patch.temperature>60) {
        throw new Problem(400,'Ungültige Wetterdaten.')
      }
      plan.packingTemperature=patch.temperature
    } else if (patch.kind==='toggle'||patch.kind==='quantity') {
      const row=[...plan.checklist,...plan.packing,...plan.extra].find(entry=>entry.id===patch.item)
      if (!row) throw new Problem(404,'Eintrag nicht gefunden.')
      if (patch.kind==='toggle') {
        if (typeof patch.done!=='boolean') throw new Problem(400,'Ungültiger Status.')
        row.done=patch.done
      } else {
        if (!('quantity' in row)) throw new Problem(400,'Nur Packeinträge haben eine Menge.')
        row.quantity=integer(patch.quantity,1,99,'Packstück')
        row.origin='manual'
      }
    } else if (patch.kind==='booking') {
      const next=booking(patch.booking,plan.draft)
      const same=plan.bookings.find(old=>old.kind===next.kind &&
        (next.reference && old.reference===next.reference || old.name.toLowerCase()===next.name.toLowerCase()&&old.date===next.date&&old.time===next.time))
      if (same) throw new Problem(409,'Diese Buchung ist bereits zugeordnet. Ändere ihren Status im Eintrag.')
      if (plan.bookings.length>=100) throw new Problem(409,'Die Reise enthält bereits 100 Buchungen.')
      plan.bookings.push(next)
    } else if (patch.kind==='booking-status') {
      const existing=plan.bookings.find(entry=>entry.id===patch.item)
      if (!existing) throw new Problem(404,'Buchung nicht gefunden.')
      existing.status=choice(patch.status,['confirmed','pending','cancelled'],'Buchungsstatus')
    } else if (patch.kind==='activity') {
      const day=plan.days.find(entry=>entry.date===patch.date)
      if (!day) throw new Problem(404,'Reisetag nicht gefunden.')
      if (day.activities.length>=20) throw new Problem(409,'Der Tag ist bereits voll.')
      day.activities.push({id:randomUUID(),text:field(patch.text,150,true),period:choice(patch.period,tripPeriods,'Zeitblock'),place:field(patch.place,200)})
    } else if (patch.kind==='move') {
      const from=plan.days.find(entry=>entry.activities.some(activity=>activity.id===patch.item))
      const target=plan.days.find(entry=>entry.date===patch.date)
      if (!from || !target) throw new Problem(404,'Aktivität oder Reisetag nicht gefunden.')
      const activity=from.activities.find(entry=>entry.id===patch.item)!
      if (target!==from && target.activities.length>=20) throw new Problem(409,'Der Zieltag ist bereits voll.')
      if (activity.booking) throw new Problem(409,'Eine feste Buchung braucht eine eigene Änderung.')
      from.activities=from.activities.filter(entry=>entry.id!==activity.id)
      target.activities.push({...activity,period:choice(patch.period,tripPeriods,'Zeitblock')})
    } else if (patch.kind==='task' || patch.kind==='pack') {
      if (plan.extra.length+plan.packing.length>=150) throw new Problem(409,'Die Liste ist bereits voll.')
      const entry=item(field(patch.text,120,true),field(patch.detail,200),'manual')
      if (patch.kind==='task') plan.extra.push(entry)
      else plan.packing.push({...entry,category:choice(patch.category,packingCategories,'Packkategorie'),
        quantity:integer(patch.quantity,1,99,'Packstück'),essential:false})
    } else if (patch.kind==='activity-place') {
      const row=plan.days.flatMap(day=>day.activities).find(entry=>entry.id===patch.item)
      if (!row) throw new Problem(404,'Tagespunkt nicht gefunden.')
      row.place=field(patch.place,200)
    } else if (patch.kind==='stay') {
      plan.draft.stay=field(patch.text,150)
      plan.draft.stayAddress=field(patch.address,200)
    }
    else throw new Problem(400,'Unbekannte Reiseänderung.')
    const now=new Date().toISOString()
    store.db.prepare('INSERT INTO trip_revisions VALUES (?,?,?,?)').run(id,revision,stored,now)
    store.db.prepare('UPDATE trips SET plan=?,revision=revision+1,updated=? WHERE id=?').run(JSON.stringify(plan),now,id)
    recordDecision?.()
    return trip(store,id)
  })
}


export function removeSavedTrip(store:Store,id:string) {
  return store.transaction(()=>{
    store.db.prepare('DELETE FROM trip_google_events WHERE trip_id=?').run(id)
    store.db.prepare('DELETE FROM wardrobe_travel WHERE trip_id=?').run(id)
    store.db.prepare('DELETE FROM trip_revisions WHERE trip_id=?').run(id)
    store.db.prepare('DELETE FROM trips WHERE id=?').run(id)
    return {removed:true}
  })
}
