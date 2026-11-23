import type { Category } from './categories.ts'
import type { ProjectArea,ProjectPriority } from './project-types.ts'

export const areaCategory={uni:'university',privat:'leisure',arbeit:'work'} as const satisfies Record<ProjectArea,Category>
export const taskPriorities={high:'high',medium:'normal',low:'low'} as const
export const sourceLabels={manual:'',project:'Projekt',order:'Bestellung',finance:'Finanzen & Abos',application:'Bewerbungen',
  travel:'Urlaubsplaner',email:'Posteingang',pilot:'Pilot',inventory:'Vorrat & Einkauf',outfit:'Outfit-Assistent'} as const

export type BoardItem={
  source_ref:string,source_type:keyof typeof sourceLabels,source_id?:string,source_label?:string,
  taskId?:string,projectId?:string,stepId?:string,revision:number,sourceRevision?:number,
  title:string,area:ProjectArea,kind:'task'|'deadline',priority:ProjectPriority,
  due_date:string|null,completed:boolean,completed_at:string|null,notes?:string,
  originalDue?:string,
}
export type BoardSourcePatch={completed?:boolean,area?:ProjectArea,priority?:ProjectPriority,due_date?:string|null,title?:string,dismissed?:boolean}
