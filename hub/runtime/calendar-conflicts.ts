import {randomUUID} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'

export type CalendarWindow = {title:string, at:string, endsAt:string, exclude?:string}
export type CalendarConflict = {key:string, proposed:string, title:string, at:string, endsAt:string, source:'local'|'google'|'proposal'}
export type CalendarConfirmation = {token:string, conflicts:CalendarConflict[], incomplete:boolean}
export type ExternalConflicts = {windows:(CalendarWindow & {id:string})[], incomplete:boolean}

export class CalendarConfirmations {
  private readonly pending = new Map<string,{token:string, snapshot:string, expires:number}>()

  private readonly db:DatabaseSync

  constructor(db:DatabaseSync) {this.db=db}

  check(key:string, windows:CalendarWindow[], token:unknown, external?:ExternalConflicts):CalendarConfirmation|undefined {
    if(!windows.length)return
    const overlapping=this.db.prepare(`SELECT s.id,t.title,s.at,s.ends_at AS endsAt FROM schedule s
      JOIN tasks t ON t.id=s.task_id WHERE s.kind='slot' AND s.state!='dismissed' AND t.status='open'
      AND s.at<? AND s.ends_at>? ORDER BY s.at,s.id`)
    const conflicts=windows.flatMap((window,index)=>{
      const matches:CalendarConflict[]=[]
      function add(item:CalendarWindow,id:string,source:CalendarConflict['source']){
        matches.push({key:index+':'+source+':'+id,proposed:window.title,title:item.title,at:item.at,endsAt:item.endsAt,source})
      }
      for(const row of overlapping.all(window.endsAt,window.at) as (CalendarWindow & {id:string})[]){
        if(row.id!==window.exclude)add(row,row.id,'local')
      }
      for(const item of external?.windows??[]){
        if(item.at<window.endsAt&&item.endsAt>window.at)add(item,item.id,'google')
      }
      for(let earlier=0;earlier<index;earlier++){
        const item=windows[earlier]
        if(item.at<window.endsAt&&item.endsAt>window.at)add(item,String(earlier),'proposal')
      }
      return matches.sort((a,b)=>a.at.localeCompare(b.at)||a.key.localeCompare(b.key))
    })
    const incomplete=external?.incomplete??false
    if(!conflicts.length&&!incomplete&&!token)return
    const snapshot=JSON.stringify({windows,conflicts,incomplete})
    const now=Date.now()
    for(const [id,pending] of this.pending)if(pending.expires<=now)this.pending.delete(id)
    const previous=this.pending.get(key)
    if(previous&&previous.token===token&&previous.snapshot===snapshot)return
    const next={token:randomUUID(),snapshot,expires:now+5*60_000}
    this.pending.set(key,next)
    return {token:next.token,conflicts,incomplete}
  }

  finish(key:string){this.pending.delete(key)}
}
