import { randomUUID } from 'node:crypto'
import { Problem } from './settings.ts'
import type { Store } from './store.ts'
import { changeTrip, trip, trips } from './trips.ts'
import type { TripActivity, TripChangeOffer, TripChangeResult } from './trip-types.ts'

type Pending = { offer:TripChangeOffer, run:string, turn:number, tripId:string, revision:number, item:string, period:TripActivity['period'], expires:number }
const pending=new Map<string,Pending>()
const normalize=(value:string)=>value.trim().toLocaleLowerCase('de-DE')

function currentRequest(store:Store,run:string,turn:number) {
  const view=store.present(store.run(run))
  const plan=view.result?.skillData
  if (view.turn!==turn || !['review','accepted'].includes(view.state) || view.result?.skill!=='travel' ||
      view.result.questions.length || !plan || !('intent' in plan) || plan.intent!=='change') {
    throw new Problem(409,'Diese Änderung gehört nicht mehr zur aktuellen Chat-Nachricht.')
  }
  return plan
}
function decision(store:Store,run:string,turn:number) {
  return store.db.prepare('SELECT approved FROM trip_chat_decisions WHERE run_id=? AND turn=?').get(run,turn)
}

export function previewTripChange(store:Store,run:string,turn:number,selection?:string):TripChangeResult {
  const plan=currentRequest(store,run,turn)
  const previous=decision(store,run,turn)
  if (previous) return {message:previous.approved?'Tagespunkt verschoben.':'Die Reise bleibt wie geplant.'}
  const destination=plan.destination ? normalize(plan.destination) : ''
  const active=trips(store)
  const candidates=destination ? active.filter(row=>normalize(row.destination)===destination ||
    normalize(row.destination.split(',')[0])===destination) : active
  const match=selection ? candidates.find(row=>row.id===selection) : candidates.length===1 ? candidates[0] : undefined
  if (!match) return candidates.length ? {choices:candidates} : {message:'Dazu finde ich keine laufende oder anstehende Reise.'}
  const saved=trip(store,match.id)
  if (!plan.start || !saved.days.some(day=>day.date===plan.start)) return {message:'Auf welchen Tag innerhalb dieser Reise soll der Tagespunkt?'}
  const name=plan.detail ? normalize(plan.detail) : ''
  const found=saved.days.flatMap(day=>day.activities.filter(entry=>name && normalize(entry.text)===name)
    .map(entry=>({entry,date:day.date})))
  if (found.length!==1) return {message:'Wie heißt der Tagespunkt genau?'}
  if (found[0].date===plan.start) return {message:'Der Tagespunkt steht bereits an diesem Tag.'}
  const now=Date.now()
  for (const [id,entry] of pending) {
    if (entry.expires<=now) pending.delete(id)
    else if (entry.run===run&&entry.turn===turn&&entry.tripId===saved.id&&entry.revision===saved.revision) return {offer:entry.offer}
  }
  if (pending.size>=40) pending.delete(pending.keys().next().value!)
  const {entry,date}=found[0]
  const offer={id:randomUUID(),destination:saved.draft.destination,activity:entry.text,from:date,to:plan.start}
  pending.set(offer.id,{offer,run,turn,tripId:saved.id,revision:saved.revision,item:entry.id,period:entry.period,expires:now+10*60_000})
  return {offer}
}

export function decideTripChange(store:Store,key:string,approved:boolean) {
  const action=pending.get(key)
  if (!action || action.expires<=Date.now()) throw new Problem(410,'Die Bestätigung ist abgelaufen. Lass die Änderung neu vorschlagen.')
  currentRequest(store,action.run,action.turn)
  const previous=decision(store,action.run,action.turn)
  if (previous) return {message:previous.approved?'Tagespunkt verschoben.':'Die Reise bleibt wie geplant.'}
  const record=()=>store.db.prepare('INSERT INTO trip_chat_decisions VALUES (?,?,?)').run(action.run,action.turn,Number(approved))
  if (!approved) {
    record()
    return {message:'Die Reise bleibt wie geplant.'}
  }
  const updated=changeTrip(store,action.tripId,action.revision,{kind:'move',item:action.item,date:action.offer.to,period:action.period},record)
  return {message:'Tagespunkt verschoben.',tripId:updated.id}
}
