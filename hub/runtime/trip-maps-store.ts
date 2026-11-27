import type { Store } from './store.ts'
import { Problem } from './settings.ts'
import { parseMapState, type MapState } from './trip-maps.ts'

export function loadMapState(store:Store,tripId:string):MapState {
  if (!store.db.prepare('SELECT 1 FROM trips WHERE id=?').get(tripId)) throw new Problem(404,'Reise nicht gefunden.')
  const row=store.db.prepare('SELECT data FROM trip_maps WHERE trip_id=?').get(tripId)
  return parseMapState(row ? JSON.parse(String(row.data)) : undefined)
}
export function saveMapState(store:Store,tripId:string,value:unknown):MapState {
  if (!store.db.prepare('SELECT 1 FROM trips WHERE id=?').get(tripId)) throw new Problem(404,'Reise nicht gefunden.')
  const state=parseMapState(value)
  store.db.prepare('INSERT INTO trip_maps (trip_id,data,changed_at) VALUES (?,?,?) ON CONFLICT(trip_id) DO UPDATE SET data=excluded.data,changed_at=excluded.changed_at')
    .run(tripId,JSON.stringify(state),new Date().toISOString())
  return state
}
