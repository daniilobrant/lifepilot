import {projectPlan} from './projects.ts'
import type {ProjectStepDraft} from './project-types.ts'
import {shiftDay} from './values.ts'

const thesisWord=/\b(?:bachelorarbeit|abchelorarbeit|bacherlorarbeit|bachelor arbeit)\b/iu
const createProject=/\b(?:leg(?:e)?|erstell(?:e)?|anlegen|aufsetzen|plane|aufbau(?:en)?)\b/iu

export function thesisProject(messages:string[],day:string){
  const current=messages.at(-1)??''
  if(!day||!thesisWord.test(current)||!createProject.test(current)||
    !/\bprojekt\b|(?:bachelorarbeit|abchelorarbeit)\s+(?:anlegen|aufsetzen|an\b)/iu.test(current))return
  const context=messages.join('\n')
  const supply=/supply[ -]?chain|lieferkett/iu.test(context)
  const ai=/\bKI\b|künstlich/iu.test(context)
  const interview=/interview/iu.test(context)
  const dates=/anfang\s+dezember/iu.test(context)&&/ende\s+februar/iu.test(context)
  if(!supply&&!interview&&!dates)return
  if(!dates&&/\b(?:anmeldung|abgabe|abgabefrist|deadline)\b.{0,30}(?:\d|januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)/iu.test(context))return
  const december=Number(day.slice(0,4))+Number(day.slice(5,7)==='12'&&day.slice(8,10)>'10')
  const februaryEnd=new Date(Date.UTC(december+1,2,0)).toISOString().slice(0,10)
  const registration=december+'-12-07'
  const step=(title:string,phase:string,from?:string,to?:string,label?:string):ProjectStepDraft=>({
    title,phase,startDate:dates&&from&&(!to||from<=to)?from:null,priority:null,scheduleMode:dates&&to?'checkpoint':null,
    date:dates&&to?to:null,approxLabel:dates&&to?(label??'Planungsdatum'):null,completed:null,
  })
  const relative=(days:number)=>shiftDay(februaryEnd,days)
  const steps=[
    step('Thema und Anforderungen sammeln','Thema & Anmeldung',day,registration),
    step(supply?'Einen Supply-Chain-Prozess auswählen und abgrenzen':'Thema und Untersuchungsrahmen eingrenzen','Thema & Anmeldung',day,registration),
    step('Forschungsfrage formulieren und mit der Betreuung abstimmen','Thema & Anmeldung',day,registration),
    step('Bachelorarbeit anmelden','Thema & Anmeldung',december+'-12-01',registration,'Anfang Dezember · ungefähr'),
    step('Literatur recherchieren und theoretischen Rahmen aufbauen','Grundlagen & Methodik',registration,relative(-62)),
    step('Forschungsdesign und Auswahlkriterien festlegen','Grundlagen & Methodik',registration,relative(-56)),
    ...(interview?[
      step('Interviewleitfaden erstellen und im Pretest prüfen','Interviews',relative(-62),relative(-51)),
      step('Expertinnen und Experten anfragen und Termine abstimmen','Interviews',relative(-56),relative(-43)),
      step('Einwilligungen einholen und Leitfadeninterviews führen','Interviews',relative(-49),relative(-31)),
      step('Interviews transkribieren und anonymisieren','Auswertung',relative(-42),relative(-27)),
      step('Kategorien entwickeln, Material codieren und Ergebnisse prüfen','Auswertung',relative(-34),relative(-19)),
    ]:[step('Datenerhebung durchführen und Material auswerten','Auswertung',relative(-49),relative(-19))]),
    step('Ergebnisse, Diskussion und Fazit schreiben','Schreiben & Abgabe',relative(-27),relative(-10)),
    step('Feedback einarbeiten und Quellen sowie Formalia prüfen','Schreiben & Abgabe',relative(-14),relative(-3)),
    step('Finale Fassung und Upload der Bachelorarbeit vorbereiten','Schreiben & Abgabe',relative(-5),relative(-1)),
  ]
  const topic=supply&&ai?'KI-Integration im Supply Chain Management. Der konkrete Prozess wird noch eingegrenzt.':'Bachelorarbeit mit abgestimmter Forschungsfrage und strukturiertem Arbeitsplan.'
  return projectPlan('create',{title:'Bachelorarbeit',area:'uni',description:topic+(interview?' Geplant sind qualitative, leitfadengestützte Experteninterviews.':''),priority:'high',
    scheduleMode:dates?'checkpoint':'none',date:dates?februaryEnd:null,approxLabel:dates?'Abgabe Ende Februar · genaue Frist klären':null,steps})
}
