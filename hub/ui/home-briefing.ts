import {dateInBerlin,mondayOf} from '../runtime/values.ts'
import type {TaskRow} from '../runtime/workspace.ts'

const clock=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})

export function briefingClock(now:Date){
  const minute=clock.format(now)
  const morning=minute>='05:00'&&minute<='11:30'
  return {greeting:morning?'Guten Morgen':minute>'11:30'&&minute<='17:30'?'Guten Mittag':'Guten Abend',
    morning,evening:minute>='18:00'}
}

export function visibleOnStart(task:TaskRow,today:string){
  return task.kind==='task'&&(task.status==='open'||task.status==='done'&&
    (task.due_date?task.due_date>=today:!!task.completed_at&&dateInBerlin(new Date(task.completed_at))===today))
}

export function calendarWeek(day:string){
  const monday=new Date(mondayOf(day)+'T12:00Z')
  monday.setUTCDate(monday.getUTCDate()+3)
  return Math.ceil(((monday.valueOf()-Date.UTC(monday.getUTCFullYear(),0,1,12))/86_400_000+1)/7)
}
