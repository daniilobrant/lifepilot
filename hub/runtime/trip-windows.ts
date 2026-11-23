import { berlinInstant } from '../../agents/lifepilot/tools/validate.ts'
import { Problem } from './settings.ts'
import { isDate, shiftDay } from './values.ts'
import type { Store } from './store.ts'
import { tripStates, type TripBooking, type TripState, type TravelWindow, type TravelWindows } from './trip-types.ts'

export function travelDays(start:string,end:string) {
  const count=(Date.parse(end)-Date.parse(start))/86_400_000+1
  return Array.from({length:count},(_,index)=>shiftDay(start,index))
}

function easter(year:number) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30
  const i=Math.floor(c/4), k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451)
  const n=h+l-7*m+114
  return new Date(Date.UTC(year,Math.floor(n/31)-1,n%31+1)).toISOString().slice(0,10)
}

export function publicHoliday(day:string,state:TripState) {
  const year=Number(day.slice(0,4))
  const fixed:Record<string,[string,string?]> = {
    '01-01':['Neujahr'], '05-01':['Tag der Arbeit'], '10-03':['Tag der Deutschen Einheit'],
    '12-25':['Erster Weihnachtsfeiertag'], '12-26':['Zweiter Weihnachtsfeiertag'],
    '01-06':['Heilige Drei Könige','BW BY ST'], '03-08':['Internationaler Frauentag','BE MV'],
    '08-15':['Mariä Himmelfahrt','SL'], '09-20':['Weltkindertag','TH'],
    '10-31':['Reformationstag','BB HB HH MV NI SN ST SH TH'], '11-01':['Allerheiligen','BW BY NW RP SL'],
  }
  const exact=fixed[day.slice(5)]
  if (exact && (!exact[1] || exact[1].split(' ').includes(state))) return exact[0]
  const spring=easter(year)
  for (const [offset,name] of [[-2,'Karfreitag'],[1,'Ostermontag'],[39,'Christi Himmelfahrt'],[50,'Pfingstmontag']] as const) {
    if (day===shiftDay(spring,offset)) return name
  }
  if (day===shiftDay(spring,60) && ['BW','BY','HE','NW','RP','SL'].includes(state)) return 'Fronleichnam'
  if (state==='SN' && day.slice(5)>='11-16' && day.slice(5)<='11-22' && new Date(day).getUTCDay()===3) return 'Buß- und Bettag'
  if (state==='BB' && day===spring) return 'Ostersonntag'
  if (state==='BB' && day===shiftDay(spring,49)) return 'Pfingstsonntag'
}

export function travelWindows(store:Store,input:Record<string,unknown>,stay?:TripBooking):TravelWindows {
  const {start,end,weekdays,state,maxLeave,approved,shiftWork,includeCalendar}=input
  if (!isDate(start) || !isDate(end) || start>end || Date.parse(end)-Date.parse(start)>92*86_400_000 ||
    typeof maxLeave!=='number' || !Number.isInteger(maxLeave) || maxLeave<0 || maxLeave>14) throw new Problem(400,'Wähle einen Suchzeitraum bis 93 Tage und 0 bis 14 Urlaubstage.')
  if (state!==null && state!==undefined && (typeof state!=='string' || !Object.hasOwn(tripStates,state))) throw new Problem(400,'Ungültiges Bundesland.')
  if (state && (start<'2026-01-01'||end>'2040-12-31')) throw new Problem(400,'Die Feiertagsregeln gelten für 2026 bis 2040.')
  const region=(state || null) as TripState|null
  if (weekdays===null || weekdays===undefined) return {state:region,status:'unknown',options:[],reason:'Welche Wochentage arbeitest du normalerweise?'}
  if (!Array.isArray(weekdays) || weekdays.length>7 || weekdays.some(day=>!Number.isInteger(day)||day<0||day>6)) throw new Problem(400,'Wähle bestätigte Arbeitstage.')
  const range={start,end}
  function dates(value:unknown) {
    if (value===undefined) return []
    if (!Array.isArray(value)||value.length>93||value.some(day=>!isDate(day)||day<range.start||day>range.end)) throw new Problem(400,'Ungültige Urlaubs- oder Schichttage.')
    return value as string[]
  }
  const leaveGranted=dates(approved), shifts=dates(shiftWork)
  const calendar=includeCalendar===true
  const entries=travelDays(start,end).map(day=>{
    const from=berlinInstant(day+'T00:00'),to=berlinInstant(shiftDay(day,1)+'T00:00')
    const special=region ? publicHoliday(day,region) : undefined
    return { day, special, reason:leaveGranted.includes(day)?'Genehmigter Urlaub':special??'Arbeitsfrei laut Woche', working:!leaveGranted.includes(day) && (shifts.includes(day) || !special && weekdays.includes(new Date(day).getUTCDay())),
      conflict:calendar && (store.workspace.hasUntimedAppointment(day,from,to) || store.workspace.busySpans(from,to).length>0) }
  })
  const results:TravelWindow[]=[]
  for (let begin=0;begin<entries.length;begin++) for (let count=2;count<=16 && begin+count<=entries.length;count++) {
    const sequence=entries.slice(begin,begin+count)
    const leave=sequence.filter(entry=>entry.working).map(entry=>entry.day)
    if (leave.length>maxLeave || leave.length===count) continue
    const first=sequence[0].day,last=sequence.at(-1)!.day
    const stayMatch=stay?.until ? stay.date<=first && last<=stay.until ? 'fits' : first<=stay.until && last>=stay.date ? 'partial' : 'outside' : undefined
    results.push({start:first,end:last,days:count,leave, ...(stayMatch && {stayMatch}),
      free:sequence.filter(entry=>!entry.working).map(entry=>entry.day),
      holidays:sequence.flatMap(entry=>entry.special?[{date:entry.day,name:entry.special}]:[]),
      freeReasons:sequence.filter(entry=>!entry.working).map(entry=>({date:entry.day,reason:entry.reason})),
      conflicts:sequence.filter(entry=>entry.conflict).map(entry=>entry.day)})
  }
  const matchRank={fits:0,partial:1,outside:2}
  results.sort((a,b)=>a.conflicts.length-b.conflicts.length ||
    (a.stayMatch ? matchRank[a.stayMatch] : 0)-(b.stayMatch ? matchRank[b.stayMatch] : 0) || (b.days-b.leave.length)-(a.days-a.leave.length) ||
    b.days-a.days || a.leave.length-b.leave.length || a.start.localeCompare(b.start))
  const options:TravelWindow[]=[]
  for (const candidate of results) {
    if (options.every(other=>other.end<candidate.start||other.start>candidate.end)) options.push(candidate)
    if (options.length===3) break
  }
  return {state:region,status:'known',options,...(stay && {stayName:stay.name})}
}
