import { randomUUID } from 'node:crypto'
import { Problem } from './settings.ts'
import type { Store } from './store.ts'
import { bounded, dateInBerlin, isDate, shiftDay } from './values.ts'
import { canonicalCategory, financeCategories, financeKinds, money, monthlyCents, type FinanceChange, type FinanceChat, type FinanceDraft, type FinanceEntry, type FinanceOverview, type FinanceSettings } from './finance-types.ts'

type Row={id:string, month:string, until_month:string|null, revision:number, data:string}
const emptySettings = {location:'', buffer:null, target:null, variablePlan:null, savingsPlan:null, savingsFrom:null, revision:0} satisfies FinanceSettings
const maxCents = 100_000_000

export function financeMonth(value:unknown, fallback=dateInBerlin().slice(0,7)):string {
  const month=value ?? fallback
  if(typeof month!=='string' || !/^(?:19[0-9]{2}|20[0-9]{2}|21[0-9]{2})-(?:0[1-9]|1[0-2])$/u.test(month)) {
    throw new Problem(400,'Wähle einen gültigen Monat.')
  }
  return month
}
export function shiftFinanceMonth(month:string, offset:number) {
  const date=new Date(month+'-01T00:00:00Z')
  date.setUTCMonth(date.getUTCMonth()+offset)
  return date.toISOString().slice(0,7)
}
function values(value:unknown) {
  if(!value || typeof value!=='object' || Array.isArray(value)) throw new Problem(400,'Ungültige Finanzangaben.')
  return value as Record<string,unknown>
}
function integer(value:unknown, minimum:number, maximum:number, optional=false):number|null {
  if (value==null && optional) return null
  if (typeof value!=='number' || !Number.isSafeInteger(value) || value<minimum || value>maximum) throw new Problem(400,'Prüfe Betrag, Abbuchungstag oder Frist.')
  return value
}
function optionalText(value:unknown,max:number) {
  if(value==null || value==='') return ''
  if(!bounded(value,max)) throw new Problem(400,'Ein Finanzfeld ist ungültig oder zu lang.')
  return value.trim()
}
export function financeDraft(value:unknown):FinanceDraft {
  const input=values(value)
  if(typeof input.kind!=='string' || !Object.hasOwn(financeKinds,input.kind) || !bounded(input.title,120)) throw new Problem(400,'Gib Titel und Art des Eintrags an.')
  if(input.cycle!=null && input.cycle!=='monthly' && input.cycle!=='yearly') throw new Problem(400,'Wähle monatlich oder jährlich.')
  const kind=input.kind as FinanceDraft['kind']
  const date=input.date ?? null
  const dated=kind==='expense'||kind==='income'&&date!==null
  const cycle=!dated && input.cycle==='yearly'?'yearly':'monthly'
  const renewal=kind==='subscription'?input.renewal ?? null:null
  if(dated && (typeof date!=='string' || !isDate(date)) || renewal!==null && !isDate(renewal)) throw new Problem(400,'Gib ein gültiges Datum ein.')
  const category=canonicalCategory(optionalText(input.category,80))
  return {
    kind, title:input.title.trim(), cents:integer(input.cents,1,maxCents)!, cycle,
    category:kind==='expense' && !financeCategories.includes(category)?'Sonstiges':category,
    date:dated?date as string:null, dueDay:kind==='fixed'?integer(input.dueDay,1,31,true):null,
    noticeDays:kind==='subscription'?integer(input.noticeDays,0,730,true):null, renewal:renewal as string|null,
    local:kind==='subscription' && input.local===true,...(kind==='expense' && input.refund===true && {refund:true}),note:optionalText(input.note,480),
    ...(typeof input.sourceKey==='string'&&/^[a-f0-9]{64}$/u.test(input.sourceKey)&&{sourceKey:input.sourceKey}),
  }
}
function decode(row:Row):FinanceEntry {
  const data=JSON.parse(row.data) as FinanceDraft
  return {...data,category:canonicalCategory(data.category??''),id:row.id,month:row.month,until:row.until_month,revision:row.revision}
}
function rows(store:Store, month:string) {
  return (store.db.prepare("SELECT * FROM finance_entries WHERE month<=? AND (until_month IS NULL OR ?<until_month) AND (json_extract(data,'$.date') IS NULL OR month=?) ORDER BY month DESC,rowid DESC")
    .all(month,month,month) as Row[]).map(decode)
}
function one(store:Store,id:string,revision:number) {
  const row=store.db.prepare('SELECT * FROM finance_entries WHERE id=? AND revision=?').get(id,revision) as Row|undefined
  if(!row) throw new Problem(409,'Der Finanzeintrag wurde inzwischen geändert. Lade die Übersicht neu.')
  return decode(row)
}
export function saveFinance(store:Store,value:unknown,month:string,existing?:{id:string,revision:number}):FinanceEntry {
  const draft=financeDraft(value)
  const effective=financeMonth(draft.date?.slice(0,7) ?? month)
  const previous=existing?one(store,existing.id,existing.revision):undefined
  if(previous && (previous.kind!==draft.kind || previous.month>month || previous.until && month>=previous.until)) throw new Problem(409,'Dieser Eintrag ist für den ausgewählten Monat nicht aktiv.')
  if(previous && (draft.date!==null || previous.month===effective)) {
    store.db.prepare('UPDATE finance_entries SET month=?, data=?, revision=revision+1 WHERE id=?').run(effective,JSON.stringify(draft),previous.id)
    return one(store,previous.id,previous.revision+1)
  }
  if(previous) store.db.prepare('UPDATE finance_entries SET until_month=?,revision=revision+1 WHERE id=?').run(effective,previous.id)
  if(Number(store.db.prepare('SELECT count(*) AS n FROM finance_entries').get()?.n)>=5000) throw new Problem(409,'Die Finanzliste hat ihre lokale Grenze erreicht.')
  const id=randomUUID()
  store.db.prepare('INSERT INTO finance_entries (id,kind,month,until_month,data) VALUES (?,?,?,?,?)')
    .run(id,draft.kind,effective,previous?.until ?? null,JSON.stringify(draft))
  return one(store,id,1)
}
export function deleteFinance(store:Store,id:string,revision:number,month:string) {
  const previous=one(store,id,revision)
  if(previous.month>month || previous.until && month>=previous.until) throw new Problem(409,'Dieser Eintrag ist in dem Monat nicht aktiv.')
  if(previous.date!==null || previous.month===month) store.db.prepare('DELETE FROM finance_entries WHERE id=?').run(id)
  else store.db.prepare('UPDATE finance_entries SET until_month=?,revision=revision+1 WHERE id=?').run(month,id)
  return {id}
}
export function financeSettings(store:Store):FinanceSettings {
  const row=store.db.prepare('SELECT data,revision FROM finance_settings WHERE singleton=1').get()
  return row?{...emptySettings,...JSON.parse(String(row.data)),revision:Number(row.revision)}:emptySettings
}
export function saveFinanceSettings(store:Store,value:unknown,revision:unknown) {
  if(financeSettings(store).revision!==revision) throw new Problem(409,'Die Budgeteinstellungen wurden inzwischen geändert.')
  const input=values(value), before=financeSettings(store)
  const savingsPlan=input.savingsPlan===undefined?before.savingsPlan:integer(input.savingsPlan,0,maxCents,true)
  const savingsFrom=savingsPlan===null||savingsPlan===0?null:savingsPlan===before.savingsPlan&&before.savingsFrom?before.savingsFrom:dateInBerlin().slice(0,7)
  const settings={ savingsPlan:savingsPlan||null,savingsFrom,location:optionalText(input.location,100),buffer:integer(input.buffer,0,maxCents,true),
    target:integer(input.target,0,maxCents,true),variablePlan:integer(input.variablePlan,0,maxCents,true) }
  store.db.prepare('INSERT INTO finance_settings VALUES (1,1,?) ON CONFLICT(singleton) DO UPDATE SET data=excluded.data,revision=finance_settings.revision+1')
    .run(JSON.stringify(settings))
  return financeSettings(store)
}

export function financeOverview(store:Store,month:string,today=dateInBerlin()):FinanceOverview {
  const plan=financeSettings(store)
  const calc=(key:string,entries:FinanceEntry[])=>{
    const sum=(kind:FinanceDraft['kind'])=>entries.filter(entry=>entry.kind===kind).reduce((total,entry)=>total+monthlyCents(entry),0)
    const income=sum('income'), fixed=sum('fixed'), subscriptions=sum('subscription'), variable=sum('expense')
    const base=entries.filter(entry=>entry.kind==='income'&&!entry.date).reduce((total,entry)=>total+monthlyCents(entry),0)
    const savings=plan.savingsPlan&&plan.savingsFrom&&key>=plan.savingsFrom?plan.savingsPlan:0
    const spending=fixed+subscriptions+variable+savings
    return {month:key,hasEntries:entries.length>0,income,fixed,subscriptions,variable,savings,spending,balance:income-spending,
      base,variableIncome:income-base,room:base-fixed-subscriptions-savings}
  }
  const entries=rows(store,month), settings=plan, totals=calc(month,entries)
  const history=Array.from({length:5},(_,i)=>shiftFinanceMonth(month,i-5)).map(key=>calc(key,rows(store,key))).concat(totals)
  const days=month===today.slice(0,7)?Number(shiftDay(shiftFinanceMonth(month,1)+'-01',-1).slice(-2))-Number(today.slice(-2))+1:null
  const plannedVariable=settings.variablePlan===null?null:Math.max(settings.variablePlan,totals.variable)
  const investable=plannedVariable===null||settings.buffer===null||!totals.income?null:
    Math.max(0,totals.income-totals.fixed-totals.subscriptions-totals.savings-plannedVariable-settings.buffer)
  return {entries,settings,totals,history,plannedVariable,investable,perDay:days?Math.floor(Math.max(0,totals.balance)/days):null}
}
export function financeChatResult(store:Store,plan:FinanceChat,day:string) {
  const month=financeMonth(plan.month,day.slice(0,7))
  const view=financeOverview(store,month,day)
  if(plan.financeIntent==='budget') {
    const {income,spending,balance}=view.totals
    return income || spending ? month+' · Einnahmen '+money(income)+' · Ausgaben '+money(spending)+' · Restbudget '+money(balance)+'.' :
      'Für '+month+' sind noch keine Einnahmen oder Ausgaben eingetragen.'
  }
  if(plan.financeIntent==='investment') {
    if(view.investable===null) return 'Hinterlege Einnahmen, geplante variable Monatsausgaben und deinen Puffer unter Budgetplanung. Dann kann ich den Spielraum ausrechnen.'
    const target=view.settings.target
    return 'Rechnerischer Spielraum für '+month+': '+money(view.investable)+' im Monat nach geplanten Kosten und Puffer.'+
      (target===null?'': ' Sparziel: '+money(target)+(target>view.investable?' · Lücke '+money(target-view.investable):' · im Rahmen des Plans')+'.')
  }
  const subscriptions=view.entries.filter(item=>item.kind==='subscription')
  if(!subscriptions.length) return 'Für '+month+' sind keine aktiven Abos hinterlegt.'
  const annual=subscriptions.reduce((sum,item)=>sum+item.cents*(item.cycle==='monthly'?12:1),0)
  return subscriptions.length+' aktive Abos · '+money(annual)+' pro Jahr. Öffne Finanzen & Abos für Kündigungsfristen und den Vergleich mit Alternativen.'
}
export function prepareFinanceChange(store:Store,plan:FinanceChat,reference:string):FinanceChange {
  const month=financeMonth(plan.month,reference.slice(0,7))
  const matches=plan.financeIntent==='edit'?rows(store,month).filter(entry=>entry.title.toLocaleLowerCase('de-DE')===plan.target?.trim().toLocaleLowerCase('de-DE')):[]
  if(plan.financeIntent==='edit' && matches.length!==1) throw new Problem(409,'Nenne den genauen Namen eines eindeutigen Finanzeintrags.')
  const entry=matches[0]
  const kind=entry?.kind ?? plan.kind
  const draft=financeDraft({
    ...entry,kind,title:plan.title??entry?.title,cents:plan.cents??entry?.cents,
    date:kind==='expense'?plan.date??entry?.date??reference:entry?.date??null,
    category:plan.category??entry?.category,cycle:plan.cycle??entry?.cycle,
  })
  return {draft,month:!entry && kind==='expense' && draft.date?financeMonth(draft.date.slice(0,7)):month,...(entry?{entry}:{})}
}

export function sameRecurringFinance(store:Store,change:FinanceChange) {
  if(change.entry||change.draft.date!==null) return false
  return rows(store,change.month).some(entry=>entry.kind===change.draft.kind &&
    entry.cents===change.draft.cents && entry.cycle===change.draft.cycle &&
    entry.title.toLocaleLowerCase('de-DE')===change.draft.title.toLocaleLowerCase('de-DE'))
}
