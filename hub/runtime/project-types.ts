export const projectAreas={uni:'Uni',privat:'Privat',arbeit:'Arbeit'} as const
export const projectPriorities={high:'Hoch',medium:'Mittel',low:'Niedrig'} as const
export const priorityRank={high:0,medium:1,low:2} as const
export const timeframeNames={on_track:'Im Zeitrahmen',checkpoint_soon:'Checkpoint naht',at_risk:'Zeitrahmen knapp'} as const
export type ProjectArea=keyof typeof projectAreas
export type ProjectPriority=keyof typeof projectPriorities
export type ScheduleMode='none'|'deadline'|'checkpoint'
export type ProjectTiming={scheduleMode:ScheduleMode,date:string|null,approxLabel:string|null}
export type ProjectStepDetails={phase?:string|null,startDate?:string|null,notes?:string|null}
export type ProjectStep=ProjectTiming&ProjectStepDetails&{id:string,title:string,priority:ProjectPriority|null,completed:boolean,completedAt?:string|null}
export type LinkedProjectMail={id:string,subject:string,sender:string,account:string}
export type ProjectData=ProjectTiming&{title:string,area:ProjectArea,description:string,priority:ProjectPriority,status:'active'|'archived',archived_at?:string|null,
  steps:ProjectStep[],links:LinkedProjectMail[],deadlineCompleted?:boolean}
export type Project=ProjectData&{id:string,revision:number,timeframe:keyof typeof timeframeNames}
export type ProjectDeadline={id:string,projectId:string,title:string,projectTitle:string,date:string,priority:ProjectPriority,mode:'deadline'|'checkpoint',label:string|null,completed?:boolean}
export type ProjectStepDraft=ProjectStepDetails&{title:string,priority:ProjectPriority|'inherit'|null,scheduleMode:ScheduleMode|null,date:string|null,approxLabel:string|null,completed:boolean|null}
export type ProjectPlan=ProjectStepDetails&{
  projectIntent:'create'|'update'|'add_step'|'update_step'|'move_step'|'complete'|'delete'|'check',
  project:string|null,step:string|null,title:string|null,area:ProjectArea|null,description:string|null,priority:ProjectPriority|'inherit'|null,
  scheduleMode:ScheduleMode|null,date:string|null,approxLabel:string|null,completed:boolean|null,position:number|null,steps:ProjectStepDraft[],deadlineCompleted?:boolean,
}
export type ProjectSuggestion={id:string,projectId:string,projectTitle:string,subject:string,sender:string,summary:string,priority:ProjectPriority,
  plan:ProjectPlan|null}
export type ProjectsOverview={projects:Project[],deadlines:ProjectDeadline[],suggestions:ProjectSuggestion[],weekCheckpoints:number,gmail?:string}
export type ProjectChange={operation:'create'|'update'|'delete',target?:{id:string,revision:number},data:ProjectData,summary:string,changes?:string[]}
export type ProjectWork={title:string,date?:string}
