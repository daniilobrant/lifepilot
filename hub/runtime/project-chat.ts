import type {Store} from './store.ts'
import type {ModelPayload} from './model-payload.ts'
import type {Result} from '../../agents/lifepilot/tools/validate.ts'
import {listProjects,projectKey,projectPlan} from './projects.ts'
import {thesisProject} from './thesis-project.ts'
import type {ProjectPlan} from './project-types.ts'

export function projectFromChat(store:Store,payload:ModelPayload):Result|undefined{
  const input=payload.messages.at(-1)?.input.trim()??''
  if(!input||payload.sourceNote)return
  const phrase=' '+projectKey(input)+' '
  const includes=(label:string)=>phrase.includes(' '+projectKey(label)+' ')
  const restore=/\b(?:wiederherstellen|wiederher|reaktiviere|wieder öffnen|wieder her)\b/iu.test(input)
  const projects=listProjects(store).filter(project=>project.status===(restore?'archived':'active'))
  const exact=projects.filter(project=>includes(project.title))
  const targets=exact.length?exact:projects.filter(project=>project.title.split(/[/|:]/u)
    .some(part=>projectKey(part).length>=5&&includes(part)))
  const steps=projects.flatMap(project=>project.steps.filter(step=>includes(step.title)).map(step=>({project,step})))
  const target=targets.length===1?targets[0]:undefined
  const eligible=steps.filter(entry=>!target||entry.project.id===target.id)
  const hit=eligible.length===1?eligible[0]:undefined
  const priority=/\b(?:priorität|prio)\b/iu.test(input)?/\b(?:hoch|hohe[rn]?)\b/iu.test(input)?'high':
      /\b(?:niedrig|niedrige[rn]?)\b/iu.test(input)?'low':/\bmittel\b/iu.test(input)?'medium':null:null
  const thesis=thesisProject(payload.messages.map(message=>message.input),payload.day??'')
  if(thesis&&payload.day)return {skill:'projects',skillData:thesis,tasks:[],actions:[],questions:[]}
  let plan:ProjectPlan|undefined
  const create=/^(?:lege|erstelle)\s+(?:ein\s+)?(?:(uni|privat|arbeit)[- ]projekt|projekt)\s+[„"]([^“"]+)[“"](?:\s+im bereich\s+(uni|privat|arbeit))?(?:\s+an)?[.!]?$/iu.exec(input)
  const area=(create?.[1]??create?.[3])?.toLowerCase() as ProjectPlan['area']
  if(create&&area&&create[2].length<=120)plan=projectPlan('create',{title:create[2],area})
  const position=/\b(?:an (?:die )?position|auf platz)\s+(\d{1,2})\b/iu.exec(input)?.[1]
  const add=/\b(?:schritt|unterpunkt)\s+[„"]([^“"]{2,120})[“"]/iu.exec(input)?.[1]
  if(target&&restore)plan=projectPlan('complete',{project:target.title,completed:false})
  else if(target&&/abschließ|abschliess|archivier|ins archiv/iu.test(input))plan=projectPlan('complete',{project:target.title,completed:true})
  else if(hit&&position)plan=projectPlan('move_step',{project:hit.project.title,step:hit.step.title,position:Number(position)})
  else if(target&&add&&/hinzu|ergänze|anlegen/iu.test(input))plan=projectPlan('add_step',{project:target.title,title:add})
  const wantsPriority=priority&&/setz|mach|änder|priorisiere|stufe|gib/iu.test(input)
  if(!plan&&wantsPriority&&hit)plan=projectPlan('update_step',{project:hit.project.title,step:hit.step.title,priority})
  else if(!plan&&wantsPriority&&target&&!eligible.length)plan=projectPlan('update',{project:target.title,priority})
  else if(!plan&&hit&&/abhaken|hake|als erledigt|erledigt markieren/iu.test(input))plan=projectPlan('update_step',{project:hit.project.title,step:hit.step.title,completed:true})
  else if(!plan&&target&&/zeitrahmen|im zeitplan|noch im plan|checkpoint.{0,15}prüf/iu.test(input))plan=projectPlan('check',{project:target.title})
  if(plan)return {skill:'projects',skillData:plan,tasks:[],actions:[],questions:[]}
}
