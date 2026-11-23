type TimedEntry = {at?:string, endsAt?:string}
type CalendarGroup<T> = {entries:T[], lanes:T[][]}

export function calendarLanes<T extends TimedEntry>(entries:T[]):CalendarGroup<T>[] {
  const groups:CalendarGroup<T>[]=[]
  const ordered=[...entries].sort((a,b)=>(a.at?Date.parse(a.at):0)-(b.at?Date.parse(b.at):0))
  let until=0
  let group:CalendarGroup<T>|undefined
  for(const entry of ordered){
    const from=entry.at?Date.parse(entry.at):0
    const to=entry.endsAt?Date.parse(entry.endsAt):from
    if(!group||!from||from>=until){
      group={entries:[entry],lanes:[[entry]]}
      groups.push(group)
      until=to
      continue
    }
    const lane=group.lanes.find(lane=>{
      const previous=lane.at(-1)!
      return Date.parse(previous.endsAt??previous.at!)<=from
    })
    if(lane)lane.push(entry)
    else group.lanes.push([entry])
    group.entries.push(entry)
    until=Math.max(until,to)
  }
  return groups
}
