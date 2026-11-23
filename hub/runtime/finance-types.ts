export const financeKinds = {income:'Einnahme', fixed:'Fixkosten', subscription:'Abo', expense:'Ausgabe'} as const
export type FinanceKind = keyof typeof financeKinds
export const expenseCategories = ['Lebensmittel & Einkauf','Essen & Trinken','Freizeit & Kultur','Transport & Mobilität','Shopping & Alltag','Sonstiges'] as const
export const budgetCategories = ['Wohnen & Haushalt','Lebensmittel','Mobilität','Freizeit & Abos','Versicherung & Verwaltung',
  'Gesundheit & Pflege','Bildung & Arbeit','Sonstiges'] as const
export type BudgetCategory = typeof budgetCategories[number]
export const financeCategories = [...new Set<string>([...budgetCategories,...expenseCategories])]

export function budgetCategory(entry: Pick<FinanceDraft,'title'|'category'|'kind'>):BudgetCategory {
  const match=budgetCategories.find(category=>category===entry.category)
  if(match && match!=='Sonstiges')return match
  const label=(entry.title+' '+entry.category).toLocaleLowerCase('de-DE').normalize('NFD').replace(/\p{M}/gu,'')
  if(/versicherung|rundfunk|steuer|finanzamt|behorde|amtlich|gebuhr|passgebuhr|verwaltung/u.test(label))return 'Versicherung & Verwaltung'
  if(/kontaktlins|apotheke|gesundheit|medikament|zahnarzt|arzt|pflege|therapie|brille/u.test(label))return 'Gesundheit & Pflege'
  if(/miete|wohnung|strom|heiz|nebenkosten|haushalt|internet|wasserabschlag/u.test(label))return 'Wohnen & Haushalt'
  if(/zug|bus|bahn|tanken|tank|tankstell|mobilitat|fahrkarte|park|auto/u.test(label))return 'Mobilität'
  if(/semester|hochschule|studium|bildung|arbeitsmaterial|kurs|fortbildung/u.test(label))return 'Bildung & Arbeit'
  if(/lebensmittel|supermarkt|essen|restaurant|kaffee|d[oö]ner|b[aä]cker|gastro/u.test(label))return 'Lebensmittel'
  if(entry.kind==='subscription'||/fitness|gym|volleyball|freizeit|kino|konzert|sport|streaming|reise/u.test(label))return 'Freizeit & Abos'
  return 'Sonstiges'
}
export type FinanceDraft = {
  kind: FinanceKind, title: string, cents: number, cycle: 'monthly'|'yearly',
  category: string, date: string|null, dueDay: number|null, noticeDays: number|null, renewal: string|null,
  local: boolean, note: string, refund?:boolean, sourceKey?:string,
}
export type FinanceEntry = FinanceDraft & {id:string, month:string, until:string|null, revision:number}
export type FinanceSettings = {location:string, buffer:number|null, target:number|null, variablePlan:number|null, revision:number}
export type FinanceTotals = {hasEntries?:boolean, month:string, income:number, fixed:number, subscriptions:number, variable:number, spending:number, balance:number}
export type FinanceOverview = {
  entries:FinanceEntry[], settings:FinanceSettings, totals:FinanceTotals, history:FinanceTotals[],
  perDay:number|null, investable:number|null, plannedVariable:number|null,
}
export type FinanceChat = {
  financeIntent:'budget'|'investment'|'subscriptions'|'add'|'edit',
  month:string|null, kind:FinanceKind|null, title:string|null, cents:number|null,
  category:string|null, date:string|null, cycle:'monthly'|'yearly'|null, target:string|null,
}
export type FinanceBatch = {financeBatch:FinanceChat[]}
export type FinanceChange = {draft:FinanceDraft, month:string, entry?:FinanceEntry}
const euro=new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'})
export const money = (cents:number) => euro.format(cents/100)
export const monthlyCents=(entry:FinanceDraft)=>entry.refund?-entry.cents:entry.cycle==='yearly'?(entry.kind==='income'?Math.floor:Math.ceil)(entry.cents/12):entry.cents
