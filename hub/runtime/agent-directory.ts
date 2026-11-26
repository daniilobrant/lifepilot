import type {Store} from './store.ts'
import {listProjects} from './projects.ts'
import {financeOverview} from './finance.ts'
import {applicationOverview} from './applications.ts'
import {trips} from './trips.ts'
import {groceryOverview} from './grocery.ts'
import {outfitOverview} from './outfits.ts'
import {clothingOrders} from './clothing-orders.ts'
import {dateInBerlin,shiftDay} from './values.ts'

/*
 * Verzeichnis für den Pilot-Chat: kurze Einträge (Name, Datum, ID) aus allen Bereichen, damit das Modell
 * Querverbindungen erkennt. Beträge, Mailinhalte und Notizen bleiben draußen. Zu Einträgen, die zur Nachricht
 * passen (auch bei Tipp- oder Diktatfehlern), kommen Details hinzu.
 */

const stopWords=new Set(['und','and','der','die','das','den','dem','des','ein','eine','einen','einem','in','im','am','an','auf','für','fur','mit','von','vom',
  'zu','zum','zur','bei','ich','mir','mich','mein','meine','meinen','meiner','muss','soll','habe','hat','ist','bin','bitte','noch','auch','dann','als','oder',
  'morgen','heute','übermorgen','woche','nächste','nächsten','vorlesung','termin','aufgabe','frist','abgabe','the','of','for','to'])
// Typische Diktatfehler und Abkürzungen.
const aliases:Record<string,string>={kai:'ki',ka:'ki',kih:'ki',ai:'ki',bwl:'betriebswirtschaft',vl:'vorlesung'}

export function directoryWords(text:string){
  return text.toLocaleLowerCase('de-DE').replace(/&/gu,' und ').replace(/ß/gu,'ss').normalize('NFD').replace(/[̀-ͯ]/gu,'')
    .split(/[^\p{L}\p{N}]+/u).map(word=>aliases[word]??word).filter(word=>word.length>1&&!stopWords.has(word))
}
function distance(a:string,b:string){
  if(Math.abs(a.length-b.length)>2)return 3
  let previous=Array.from({length:b.length+1},(_,index)=>index)
  for(let i=1;i<=a.length;i++){
    const row=[i]
    for(let j=1;j<=b.length;j++)row[j]=Math.min(previous[j]+1,row[j-1]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1))
    previous=row
  }
  return previous[b.length]
}
/** Zwei Wörter gelten als gleich bei Übereinstimmung, gemeinsamem Anfang (ab 3 Zeichen) oder kleinem Tippfehler. */
export function similarWord(a:string,b:string){
  if(a===b)return true
  const [short,long]=a.length<=b.length?[a,b]:[b,a]
  if(short.length>=3&&long.startsWith(short)&&long.length-short.length<=3)return true
  if(short.length>=4&&distance(a,b)<=1)return true
  return short.length>=7&&distance(a,b)<=2
}
/** Anteil der Titelwörter, die in der Nachricht vorkommen (0 bis 1). */
export function titleMatch(message:string|string[],title:string){
  const words=Array.isArray(message)?message:directoryWords(message)
  const own=[...new Set(directoryWords(title))]
  if(!own.length)return 0
  const found=own.filter(word=>words.some(other=>similarWord(word,other)))
  // Ein einzelnes, langes Wort („Bachelorarbeit“) ist eindeutig genug; sonst braucht es zwei Treffer.
  const enough=found.length>=Math.min(2,own.length)||found.some(word=>word.length>=8)
  return enough?Math.max(found.length/own.length,found.some(word=>word.length>=8)?0.5:0):0
}

const time=(at:string)=>new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}).format(new Date(at))
const weekday=(day:string)=>new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',weekday:'short'}).format(new Date(day+'T12:00:00Z'))
const safe=<T>(read:()=>T,fallback:T)=>{try{return read()}catch{return fallback}}

type Entry={area:string,id:string,title:string,line:string,detail?:unknown}

export function agentDirectory(store:Store,message:string,today=dateInBerlin()){
  const until=shiftDay(today,56)
  const entries:Entry[]=[]
  const tasks=store.workspace.list().filter(task=>task.status==='open')
  const slots=store.db.prepare(`SELECT task_id,at,ends_at FROM schedule WHERE kind='slot' AND state<>'dismissed'
    AND at>=? AND at<? ORDER BY at`).all(today+'T00:00:00Z',until+'T23:59:59Z') as {task_id:string,at:string,ends_at:string|null}[]
  for(const task of tasks){
    const own=slots.filter(slot=>slot.task_id===task.id).filter(slot=>dateInBerlin(new Date(slot.at))>=today)
    if(task.kind==='appointment'){
      if(!own.length&&(!task.due_date||task.due_date<today||task.due_date>until))continue
      const dates=own.map(slot=>dateInBerlin(new Date(slot.at)))
      const next=own.length?own.slice(0,4).map(slot=>{const day=dateInBerlin(new Date(slot.at));return weekday(day)+' '+day+' '+time(slot.at)+(slot.ends_at?'–'+time(slot.ends_at):'')}).join(', '):task.due_date
      entries.push({area:'termin',id:task.id,title:task.title,line:`${task.title} · ${next}${own.length>4?' · insgesamt '+own.length+' Termine':''}`,
        detail:{termine:own.slice(0,12).map(slot=>({datum:dateInBerlin(new Date(slot.at)),von:time(slot.at),bis:slot.ends_at?time(slot.ends_at):null})),
          kategorie:task.category,beschreibung:task.detail||null,ersterTag:dates[0]??task.due_date}})
    }else{
      entries.push({area:'aufgabe',id:task.id,title:task.title,line:`${task.title}${task.due_date?' · Frist '+task.due_date:''}${task.related_id?' · gehört zu '+task.related_id:''}`,
        detail:{frist:task.due_date,prioritaet:task.priority,kategorie:task.category,beschreibung:task.detail||null,teilaufgaben:task.steps.map(step=>step.title).slice(0,8)}})
    }
  }
  for(const project of safe(()=>listProjects(store,today),[])){
    if(project.status!=='active')continue
    const open=project.steps.filter(step=>!step.completed)
    const next=[...open].sort((a,b)=>(a.date??'9999').localeCompare(b.date??'9999'))[0]
    entries.push({area:'projekt',id:project.id,title:project.title,
      line:`${project.title}${project.date?' · Ziel '+project.date:''}${next?' · nächster Schritt: '+next.title+(next.date?' ('+next.date+')':''):''} · ${open.length} offen`,
      detail:{schritte:open.slice(0,12).map(step=>({id:step.id,titel:step.title,frist:step.date})),ziel:project.date}})
  }
  for(const entry of safe(()=>financeOverview(store,today.slice(0,7),today).entries,[])){
    if(entry.kind!=='subscription'&&entry.kind!=='fixed')continue
    entries.push({area:entry.kind==='subscription'?'abo':'fixkosten',id:entry.id,title:entry.title,line:`${entry.title} · ${entry.cycle==='yearly'?'jährlich':'monatlich'}`})
  }
  for(const order of safe(()=>clothingOrders(store),[])){
    if(order.status==='closed'||order.status==='cancelled')continue
    entries.push({area:'bestellung',id:order.id,title:order.merchant+' '+order.reference,
      line:`${order.merchant} · Bestellung ${order.reference} · ${order.status}${order.deadline?' · Rückgabe bis '+order.deadline:''}`,
      detail:{teile:order.items.slice(0,10).map(item=>({id:item.id,name:item.draft.name,entscheidung:item.decision,angekommen:item.arrived}))}})
  }
  for(const item of safe(()=>applicationOverview(store).items,[])){
    if(['rejected','withdrawn'].includes(item.status))continue
    entries.push({area:'bewerbung',id:item.id,title:item.company+' '+item.role,line:`${item.company} · ${item.role} · ${item.status}`})
  }
  for(const journey of safe(()=>trips(store,today),[]))
    entries.push({area:'reise',id:journey.id,title:journey.destination,line:`${journey.destination} · ${journey.start} bis ${journey.end}`})
  const grocery=safe(()=>groceryOverview(store),{stock:[],shopping:[],recent:[]})
  const wardrobe=safe(()=>outfitOverview(store).wardrobe.filter(item=>!item.orderState&&!item.saleState),[])
  const count=(values:string[])=>Object.entries(values.reduce<Record<string,number>>((sum,value)=>({...sum,[value]:(sum[value]??0)+1}),{})).map(([key,value])=>key+' '+value).join(', ')
  const words=directoryWords(message)
  const matches=entries.map(entry=>({entry,score:titleMatch(words,entry.title)})).filter(({score})=>score>=0.5)
    .sort((a,b)=>b.score-a.score).slice(0,8)
  const grouped=(area:string,limit:number)=>entries.filter(entry=>entry.area===area).slice(0,limit).map(entry=>entry.line+' ['+entry.id+']')
  return {
    hinweis:'Verzeichnis deiner Daten (nur Namen, Daten und IDs). Nutze es, um Bezüge zu erkennen und Namen aus Diktat oder Tippfehlern zu berichtigen.',
    heute:today,
    termine:grouped('termin',40),aufgaben:grouped('aufgabe',40),projekte:grouped('projekt',15),
    abos:grouped('abo',20),fixkosten:grouped('fixkosten',15),bestellungen:grouped('bestellung',10),bewerbungen:grouped('bewerbung',15),reisen:grouped('reise',6),
    vorrat:{kategorien:count(grocery.stock.map(item=>item.category)),knapp:grocery.stock.filter(item=>item.status!=='stocked').map(item=>item.name).slice(0,20),
      einkaufsliste:grocery.shopping.map(item=>item.name).slice(0,30)},
    kleiderschrank:count(wardrobe.map(item=>item.category)),
    treffer:matches.map(({entry,score})=>({bereich:entry.area,id:entry.id,titel:entry.title,passt:Math.round(score*100)/100,details:entry.detail??null})),
  }
}
export type AgentDirectory=ReturnType<typeof agentDirectory>
