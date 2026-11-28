/** Ohne Node-Importe, damit die Oberfläche die Typen nutzen kann. */
export const depotCategories = ['ETF','Aktie','Krypto','Anleihe','Rohstoffe','Cash','Sonstiges'] as const
export type DepotCategory = typeof depotCategories[number]
export const depotSectors = ['Technologie','Finanzen','Gesundheit','Konsum','Industrie','Energie','Rohstoffe','Immobilien','Kommunikation','Versorger','Breit gestreut','Krypto','Cash','Sonstiges'] as const
export type DepotSector = typeof depotSectors[number]
/** Preise in Euro je Stück, Werte in Cent. Fehlende Angaben sind null. */
export type Holding = {
  id:string, name:string, isin:string, symbol:string, category:DepotCategory, sector:DepotSector,
  quantity:number|null, buyPrice:number|null, buyDate:string|null, price:number|null, priceAt:string|null, valueCents:number,
}
export type HoldingDraft = Omit<Holding,'id'|'valueCents'|'priceAt'> & {valueCents?:number}
export type DepotHistoryPoint = {id:string, date:string, totalCents:number, investedCents:number}
export type DepotHeadline = {position:string, headline:string, summary:string, source:string, url:string, published:string|null}
export type DepotOutlook = {title:string, reason:string}
export type DepotNews = {created:string, headlines:DepotHeadline[], outlook:DepotOutlook[]}
export type DepotState = {
  holdings:Holding[], history:DepotHistoryPoint[], recognition:boolean,
  news:DepotNews|null, newsJob:{running:boolean, error:string|null},
  job:{running:boolean, error:string|null, updatedAt:string|null, missing:number},
}
export type Candidate = {name:string, isin:string, symbol:string, category:DepotCategory, sector:DepotSector, price:number|null}
export const depotColors:Record<DepotCategory,string> = {ETF:'#53836a',Aktie:'#608fb0',Krypto:'#c19a4a',Anleihe:'#a476aa',Rohstoffe:'#ad794e',Cash:'#87959d',Sonstiges:'#bf6370'}
export const investedCents=(item:Pick<Holding,'quantity'|'buyPrice'>)=>item.quantity!==null&&item.buyPrice!==null?Math.round(item.quantity*item.buyPrice*100):null
