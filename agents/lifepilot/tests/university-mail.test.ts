import {test} from 'node:test'
import assert from 'node:assert/strict'
import {classifyMail,inboxLabel} from '../tools/classify-mail.ts'
import {needsMailBody} from '../tools/mail-depth.ts'
import {hfuMail} from '../tools/university-mail.ts'
import type {GoogleConnector,MailContent} from '../../../hub/connectors/google.ts'
import {Store} from '../../../hub/runtime/store.ts'
import {dateInBerlin,shiftDay} from '../../../hub/runtime/values.ts'
import {berlinInstant} from '../tools/validate.ts'
import {inboxProposal,scanHfuCancellations,decideInbox} from '../../../hub/runtime/inbox.ts'
import {approveLectureCancellation,inboxWithLectureTargets,resolveLecture} from '../../../hub/runtime/university-calendar.ts'

const today=dateInBerlin(), day=shiftDay(today,3), nextWeek=shiftDay(day,7)
const early=berlinInstant(day+'T09:00'), end=berlinInstant(day+'T10:00')
const forward=(subject:string,body:string):MailContent=>({
  id:'example-mail',subject:'WG: '+subject,from:'Studierendenkonto <ST800012345@stud.hfu.de>',
  at:today+'T10:11:00Z',dates:[],truncated:false,
  text:'---------- Forwarded message ---------\nFrom: Studienbüro <studium@hfu.de>\nSubject: '+subject+'\n\n'+body,
})
const cancellation=forward('Ausfall der Vorlesung Statistik am '+day,'Die Vorlesung Statistik fällt am '+day+' um 09:00 Uhr aus.')
function slot(store:Store,day:string,at='09:00',until='10:00'){
  return store.workspace.add(null,{title:'Vorlesung Statistik',kind:'appointment',category:'university',date:day,detail:''},'test')
}
test('forwarding metadata gets a full read and original sender, replies and social information remain distinct',()=>{
  assert.equal(needsMailBody({...forward('Dinner', ''),mailingList:true}),true)
  assert.equal(needsMailBody({id:'forward',subject:'Neue Nachricht',from:'Lehrkraft <person@example.org>',text:'',originalRecipients:'st800012345@stud.hfu.de'}),true)
  const dinner=forward('Anmeldung zum Campus-Dinner','Bitte bestätigt eure Teilnahme zum Dinner.')
  assert.equal(classifyMail(dinner).important,false)
  assert.equal(classifyMail(dinner).university?.sender,'Studienbüro studium@hfu.de')
  assert.equal(inboxLabel(dinner),'university')
  const reply=forward('Re: Rückfrage zur Abgabe','Kannst du die Datei noch schicken?')
  assert.equal(classifyMail(reply).university?.reply,true)
  assert.equal(classifyMail(reply).reply,true)
  const information=forward('Re: Danke','Danke für deine Nachricht.')
  assert.equal(classifyMail(information).reply,false)
  assert.equal(classifyMail(information).university?.reply,true)
  assert.equal(classifyMail(forward('Unterlagen zur Vorlesung','Die Folien sind online.')).important,true)
})

test('quote, tentative cancellation and two possible dates do not nominate a date',()=>{
  assert.equal(hfuMail({...cancellation,subject:'Re: Statistik',text:'Danke.\n\n-----Original Message-----\nFrom: Lehrkraft <a@hfu.de>\nDie Vorlesung fällt aus.'})?.cancellation,undefined)
  assert.equal(hfuMail(forward('Vorlesung Statistik','Falls die Vorlesung morgen ausfällt, sag bitte Bescheid.'))?.cancellation,undefined)
  const mixed=forward('Ausfall Vorlesung Statistik','Vorlesung fällt am '+day+' aus. Ersatztermin: '+nextWeek)
  assert.equal(hfuMail(mixed)?.cancellation?.date,undefined)
})

test('approval removes only the matching occurrence, preserves future dates and rejects stale snapshots',async()=>{
  const store=new Store(':memory:','synthetic')
  try{
    const task=slot(store,day)
    const first=store.workspace.addSchedule(task.id,'slot',early,end,'test')
    const after=store.workspace.addSchedule(task.id,'slot',berlinInstant(nextWeek+'T09:00'),berlinInstant(nextWeek+'T10:00'),'test')
    assert.equal(scanHfuCancellations(store,[cancellation,{...cancellation,id:'copy'}],'fixture'),1)
    const [proposal]=await inboxWithLectureTargets(store,undefined)
    assert.equal(proposal.lectureCancellation?.target?.local?.slot,first.id)
    assert.equal(store.workspace.get(task.id).status,'open')
    assert.throws(()=>decideInbox(store,proposal.id,'accept','ui'),{status:409})
    await assert.rejects(approveLectureCancellation(store,undefined,proposal,{},'ui'),{status:409})
    await approveLectureCancellation(store,undefined,proposal,proposal.lectureCancellation?.target,'ui')
    assert.equal(store.db.prepare('SELECT state FROM schedule WHERE id=?').get(first.id)?.state,'dismissed')
    assert.equal(store.db.prepare('SELECT state FROM schedule WHERE id=?').get(after.id)?.state,'pending')
    assert.equal(store.workspace.get(task.id).due_date,nextWeek)
    assert.equal(inboxProposal(store,proposal.id)?.state,'accepted')
  }finally{store.db.close()}
})

test('matching requires a unique title, date and specified time',async()=>{
  const store=new Store(':memory:','synthetic')
  try{
    for(const [from,to] of [['09:00','10:00'],['11:00','12:00']]){
      const task=slot(store,day)
      store.workspace.addSchedule(task.id,'slot',berlinInstant(day+'T'+from),berlinInstant(day+'T'+to),'test')
    }
    const notice={course:'statistik',sender:'Studienbüro',date:day,time:null}
    assert.match((await resolveLecture(store,undefined,notice)).reason??'',/Mehrere passende/)
    assert.equal((await resolveLecture(store,undefined,{...notice,time:'09:00'})).target?.local?.start,early)
    assert.equal((await resolveLecture(store,undefined,{...notice,time:'08:00'})).target,undefined)
  }finally{store.db.close()}
})

test('Google deletion requires the new grant and retries against the single pinned occurrence',async()=>{
  const store=new Store(':memory:','synthetic')
  try{
    let canWrite=false, tries=0, visible=true
    const google:Pick<GoogleConnector,'calendarRange'|'status'|'changeAppointment'|'mailboxAddress'>={
      status:()=>[{service:'calendar',configured:true,connected:true},{service:'calendar-write',configured:true,connected:canWrite}],
      calendarRange:async()=>({events:visible?[{id:'one_occurrence',title:'Vorlesung Statistik',start:early,end,allDay:false}]:[],limited:false}),
      mailboxAddress:async()=>'account@example.org',
      changeAppointment:async(calendar,id,previous,next,service)=>{
        tries++
        assert.equal(calendar,'account@example.org')
        assert.equal(service,'calendar-write')
        assert.equal(id,'one_occurrence')
        assert.equal(next,null)
        assert.equal(previous.start,early)
        if(tries===1){
          visible=false
          throw Error('No response')
        }
      },
    }
    scanHfuCancellations(store,[cancellation],'fixture')
    const [waiting]=await inboxWithLectureTargets(store,google)
    assert.match(waiting.lectureCancellation?.reason??'',/Google-Hauptkalender/)
    await assert.rejects(approveLectureCancellation(store,google,waiting,waiting.lectureCancellation?.target,'ui'),{status:409})
    assert.equal(tries,0)
    canWrite=true
    const [ready]=await inboxWithLectureTargets(store,google)
    await assert.rejects(approveLectureCancellation(store,google,ready,ready.lectureCancellation?.target,'ui'),/No response/)
    const [retry]=await inboxWithLectureTargets(store,google)
    assert.ok(retry.lectureCancellation?.approvedTarget)
    assert.throws(()=>decideInbox(store,retry.id,'deny','ui'),{status:409})
    await approveLectureCancellation(store,google,retry,retry.lectureCancellation?.target,'ui')
    assert.equal(inboxProposal(store,retry.id)?.state,'accepted')
    assert.equal(tries,2)
  }finally{store.db.close()}
})
