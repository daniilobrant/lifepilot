export const saleConditions = ['Neu mit Etikett','Neu ohne Etikett','Sehr gut','Gut','Mit Gebrauchsspuren'] as const
export const fragranceProfiles = ['Frisch','Ausgewogen','Warm & intensiv'] as const
export const fragranceOccasions = ['Alltag','Büro','Sport & Freizeit','Date','Feier'] as const
export const fragranceSeasons = ['Frühling','Sommer','Herbst','Winter'] as const
export const fragranceTimes = ['Tagsüber','Abends'] as const

export type FragranceDraft = {
  name:string, brand:string, description:string, notes:string, pairing?:string, containerMl:number|null, source:string,
  profile:typeof fragranceProfiles[number], occasions:string[], seasons:string[], times:string[],
}
export type Fragrance = FragranceDraft & {id:string}
export type ScentChoice = {id:string,name:string,brand:string,reason:string,pairing?:string}
export type ResaleDraft = {
  id:string,name:string,state:'selling'|'sold'|'sorted',condition:string,flaws:string,originalPrice:number|null,
  created:string,sold:string|null,hasPhoto:boolean, hasOwnPhoto:boolean,listing:{title:string,description:string,minimum:number,maximum:number,start:number},
}
