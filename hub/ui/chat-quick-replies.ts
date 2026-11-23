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
  if(/\b(?:welches datum|an welchem tag|für welchen tag)\b/u.test(question)||
    /\bwann\b.{0,50}\bstattfinden\b/u.test(question)&&!/ferien|semester|urlaub|reise|serie/u.test(question)){
    return choices('Heute','Morgen','Übermorgen')
  }
}
