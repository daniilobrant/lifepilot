import type { Category } from './categories.ts'
import type { TripState } from './trip-types.ts'

export const weekdayNames=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'] as const
export type SeriesPlan={
  seriesIntent:'create'|'delete', title:string|null, seriesKind:'appointment'|'reminder'|null,
  weekdays:number[], startDate:string|null, endDate:string|null, startTime:string|null, endTime:string|null,
  category:Category|null, excludeHolidays:boolean, region:TripState|null,
}
export type SeriesDefinition={
  title:string, kind:'appointment'|'reminder', weekdays:number[], startDate:string, endDate:string|null,
  startTime:string, endTime:string|null, category:Category, region:TripState|null,
}
export type SeriesBlock={date:string,at:string,end:string|null}
export type SeriesChange={
  operation:'create'|'delete', definition:SeriesDefinition,
  blocks:SeriesBlock[], skipped:{date:string,name:string}[], conflicts:{date:string,title:string}[],
  existing?:{task:string,revision:number,start:string|null,end:string|null,count:number},
}
