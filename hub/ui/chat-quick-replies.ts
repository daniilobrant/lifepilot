export type QuickReply = {kind:'date-range'} | {kind:'choices', choices:string[]}

export function quickReplyFor(questions:string[]):QuickReply|undefined {
  if(questions.length!==1)return
  const question=questions[0].toLocaleLowerCase('de')
  const choices=(...choices:string[]):QuickReply=>({kind:'choices',choices})
  const range=/von\s+(?:welchem datum|wann|welchem tag)\s+bis\s+(?:zu\s+welchem datum|wann|zu\s+welchem tag)|\b(?:welcher|welchen|welchem) zeitraum\b|\bstartdatum.{0,30}enddatum\b/iu
  if(range.test(question)||/(?:ferien|urlaub|semesterpause|vorlesungsfreie zeit)\b/u.test(question)&&/\b(?:von wann|wann .{0,40}(?:bis|enden|endet))\b/u.test(question)) {
    if(/welchem (?:datum|tag)|zeitraum|startdatum|ferien|semesterpause|vorlesungsfreie zeit|urlaub|reise/u.test(question))return {kind:'date-range'}
    return
  }
  if(question.trim()==='willst du ein bestimmtes teil anziehen?')return choices('Ja','Nein')
  if(/arbeit.{0,12}uni.{0,12}freizeit/u.test(question))return choices('Arbeit','Uni','Freizeit')
  if(/\b(?:wann|zu welcher uhrzeit)\b.{0,35}\bbis\b|\b(?:start|beginn).{0,20}(?:end|schluss)/u.test(question))return
  if(/\bum (?:wie viel|wieviel|welche) uhr(?:zeit)?\b|\bzu welcher uhrzeit\b/u.test(question)) {
    return choices('Um 09:00 Uhr','Um 14:00 Uhr','Um 17:00 Uhr')
  }
  if(/\b(?:wie viele|wieviel) minuten\b/u.test(question) ||
    /\bwie lange\b.{0,35}\b(?:zeitblock|termin|besprechung|meeting|lerneinheit|gespräch|block)\b/u.test(question)&&!/(?:ferien|reise|serie|wiederhol|urlaub|semester)/u.test(question)){
    return choices('30 Minuten','60 Minuten','90 Minuten')
  }
  if(/\bbis (?:wann|zu welchem (?:tag|datum))\b/u.test(question))return
  // „Meinst du mit „Raps“ Rapsöl oder Rapssamen?“ → beide Möglichkeiten plus „Keins von beiden“.
  const original=questions[0].trim()
  const either=/(?:^|[,:]\s*|\s)(?:meinst du|meinten sie|ist|sind|soll(?:st)? (?:es|ich)|möchtest du|willst du|nimmst du|brauchst du)\b[^?]*?\b([\p{L}\d][\p{L}\d\s'’-]{0,40}?)\s+oder\s+([\p{L}\d][\p{L}\d\s'’-]{0,40}?)\s*\?\s*$/iu.exec(original)
  if(either) {
    const tidy=(value:string)=>value.trim().replace(/^(?:mit\s+[„"»][^“"«]+[“"«]\s*|eher\s+|lieber\s+|ein(?:e|en)?\s+)/iu,'').replace(/^\p{Ll}/u,letter=>letter.toLocaleUpperCase('de'))
    const first=tidy(either[1].split(/\s+/u).slice(-3).join(' ')), second=tidy(either[2])
    if(first && second && first.length<=40) {
      return /^etwas anderes|^was anderes|^anderes/iu.test(second) ? choices(first,'Etwas anderes') : choices(first,second,'Keins von beiden')
    }
  }
  if(/^(?:soll ich|sollen wir|möchtest du|willst du|darf ich|kann ich|ist das|sind das|passt das|hast du|stimmt das|einverstanden)\b/iu.test(original))return choices('Ja','Nein')
  if(/\b(?:welches datum|an welchem tag|für welchen tag)\b/u.test(question)||
    /\bwann\b.{0,50}\bstattfinden\b/u.test(question)&&!/ferien|semester|urlaub|reise|serie/u.test(question)){
    return choices('Heute','Morgen','Übermorgen')
  }
}
