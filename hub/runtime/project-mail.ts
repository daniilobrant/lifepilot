import {createHash,randomUUID} from 'node:crypto'
import type {MailContent} from '../connectors/google.ts'
import {classifyMail} from '../../agents/lifepilot/tools/classify-mail.ts'
import {dateInBerlin,isDate} from './values.ts'
import {applyProjectChange,listProjects,prepareProjectChange,projectKey,projectPlan} from './projects.ts'
import type {Project,ProjectChange,ProjectPlan,ProjectPriority,ProjectSuggestion} from './project-types.ts'
import {Problem} from './settings.ts'
import type {Store} from './store.ts'

const senderAddress=(value:string)=>/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/iu.exec(value)?.[0]?.toLowerCase()
const keyFor=(id:string)=>createHash('sha256').update(id).digest('hex')
const taskCue=/\b(?:bitte|überarbeite|einreichen|abgeben|nachreichen|korrigieren|vervollständigen|ergänzen|finalisieren|please|submit|revise)\b/iu
const updateCue=/feedback|rückmeldung|korrektur|projektupdate|zwischenstand|frist|deadline|checkpoint|terminänderung|abgabedatum|überarbeitet/iu
const urgent=/dringend|zeitnah|spätestens|letzte frist|urgent/iu
const completed=/\b(?:erledigt|bestätigt|freigegeben|abgenommen|fertiggestellt|completed|approved)\b/iu
const intersects=(value:string,fragment:string)=>(' '+value+' ').includes(' '+fragment+' ')
const normalize=(value:string,max:number)=>value.replace(/\s+/gu,' ').trim().slice(0,max)
type MailDraft=Omit<ProjectSuggestion,'id'|'projectId'|'projectTitle'>&{messageId:string,stepId?:string}

function dateOn(line:string,today:string){
  const found=/\b(20\d\d-\d\d-\d\d)\b|\b(\d{1,2})\.(\d{1,2})\.(?:(20\d\d|\d\d)(?!\d))?/u.exec(line)
  if(!found)return null
  const proposed=found[1]??[(found[4]?.length===2?'20'+found[4]:found[4])??today.slice(0,4),found[3]?.padStart(2,'0'),found[2]?.padStart(2,'0')].join('-')
  return isDate(proposed)?proposed:null
}

function projectFor(projects:Project[],subject:string,body:string,sender:string,account:string){
  const subjectKey=projectKey(subject), bodyKey=projectKey(body), address=senderAddress(sender)
  const scored=projects.map(project=>{
    const names=[project.title,...project.title.split(/[/|:]/u)].map(projectKey).filter(name=>name.length>=5)
    let weight=names.some(name=>intersects(subjectKey,name))?8:names.some(name=>intersects(bodyKey,name))?4:0
    if(!weight&&project.steps.some(step=>projectKey(step.title).length>=9&&intersects(subjectKey,projectKey(step.title))))weight=3
    if(!weight&&address&&project.links.some(link=>link.account===account&&senderAddress(link.sender)===address))weight=1
    return {project,weight}
  }).filter(row=>row.weight>0).sort((a,b)=>b.weight-a.weight)
  return scored[0]&&scored[0].weight!==(scored[1]?.weight??0)?scored[0].project:undefined
}

export function scanProjectMails(store:Store,mails:MailContent[],account:string,today=dateInBerlin()){
  if(!mails.length)return 0
  const projects=listProjects(store,today).filter(project=>project.status==='active')
  if(!projects.length)return 0
  const put=store.db.prepare('INSERT OR IGNORE INTO project_email_suggestions(id,account,message_key,project_id,data) VALUES (?,?,?,?,?)')
  let added=0
  for(const mail of mails){
    if(mail.previewOnly)continue
    const info=classifyMail(mail)
    if(info.category==='spam'||info.category==='newsletter'||info.category==='jobs'||info.university?.kind==='event')continue
    const subject=info.subject
    const applicableLines=mail.text.split(/\r?\n/u).map(line=>line.trim()).filter(line=>line&&!line.startsWith('>')).slice(0,100)
    const body=applicableLines.join('\n')
    const line=applicableLines.find(line=>/\b(?:frist|deadline|checkpoint|abgabe|bis|spätestens)\b/iu.test(line)&&dateOn(line,today))
    const relevant=updateCue.test(subject+' '+body)||taskCue.test(body)
    if(!relevant)continue
    const sender=info.university?.sender??mail.from
    const project=projectFor(projects,subject+' '+mail.from,body,sender,account)
    if(!project||project.links.some(entry=>entry.account===account&&entry.id===mail.id))continue
    const mentioned=[...project.steps].filter(step=>projectKey(step.title).length>=4&&intersects(projectKey(subject+' '+(line??'')+' '+body.slice(0,1200)),projectKey(step.title)))
    const step=mentioned.length===1?mentioned[0]:undefined
    const date=deadlineDate(line,subject,today)
    const priority:ProjectPriority=urgent.test(subject+' '+(line??'').slice(0,100))||date&&date<=today?'high':project.priority
    const title=normalize(subject.replace(/^(?:(?:re|aw|wg|fw):\s*)+/iu,''),120)
    const scheduleMode=date?/checkpoint|meilenstein/iu.test(subject+' '+line)?'checkpoint':'deadline':null
    let plan:ProjectPlan|null=null
    if(date&&step){
      plan=projectPlan('update_step',{step:step.title,date,scheduleMode,priority})
    }else if(date&&/\b(?:neue[rn]?|verschoben|verlegt|verlängert|aktualisiert)\b/iu.test(subject+' '+line)&&/frist|deadline|abgabe/iu.test(subject+' '+line)){
      plan=projectPlan('update',{date,scheduleMode})
    }else if(step&&!step.completed&&completed.test(subject)&&(intersects(projectKey(subject),projectKey(step.title)))){
      plan=projectPlan('update_step',{step:step.title,completed:true})
    }else if(title&&taskCue.test(body)){
      plan=projectPlan('add_step',{title,date,scheduleMode,priority})
    }
    const summary=normalize(line??applicableLines.find(value=>taskCue.test(value))??subject,300)
    const draft:MailDraft={messageId:mail.id,subject:normalize(subject,180),sender:normalize(sender,180),
      summary,priority,plan,...(step&&plan?.projectIntent==='update_step'&&{stepId:step.id})}
    added+=Number(put.run(randomUUID(),account,keyFor(mail.id),project.id,JSON.stringify(draft)).changes)
  }
  return added
}

function deadlineDate(line:string|undefined,subject:string,today:string){
  return line?dateOn(line,today):/frist|deadline|abgabe|checkpoint/iu.test(subject)?dateOn(subject,today):null
}
export function decideProjectMail(store:Store,id:string,account:string,revision:number,approved:boolean){
  return store.transaction(()=>{
    const row=store.db.prepare("SELECT project_id,data FROM project_email_suggestions WHERE id=? AND account=? AND status='pending'").get(id,account)
    if(!row)throw new Problem(409,'Dieser Terminvorschlag ist nicht mehr offen.')
    if(approved){
      const mail=JSON.parse(String(row.data)) as MailDraft
      const plan=mail.plan??projectPlan('update')
      const change=prepareProjectChange(store,plan,{id:String(row.project_id),revision,...(mail.stepId&&{stepId:mail.stepId})})
      const {data}=change
      if(data.status!=='active')throw new Problem(409,'Das Projekt ist bereits abgeschlossen.')
      const link={id:mail.messageId,subject:mail.subject,sender:mail.sender,account}
      if(!data.links.some(entry=>entry.account===account&&entry.id===link.id))data.links=[...data.links,link].slice(-100)
      applyProjectChange(store,change as ProjectChange)
    }
    store.db.prepare('UPDATE project_email_suggestions SET status=? WHERE id=?').run(approved?'accepted':'denied',id)
  })
}
