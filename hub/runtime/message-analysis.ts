import {shiftDay} from './values.ts'
import {relativeDatesIn} from './relative-dates.ts'

/*
 * Lokale Vorzerlegung einer (oft diktierten) Nachricht: Abschnitte anhand von Signalwörtern, je Abschnitt
 * erkannte Themen und aufgelöste Datumsangaben. Pilot bekommt das als Hilfe und prüft es selbst.
 */

// Trenner zwischen Anliegen. Reihenfolge: lange Wendungen vor kurzen.
// Satzende nur nach einem kleingeschriebenen Wort: „B2Bar. Marketing“ oder „3.12. um“ trennen nicht.
const separators=/(?:(?<=\b\p{Ll}{3,}[.!?;])\s+|(?<=[!?;])\s+|\n+|\s*,?\s+(?=(?:und\s+)?(?:außerdem|ausserdem|zusätzlich|danach|anschließend|anschliessend|ach ja|ach und|noch was|und dann|dann noch|und noch|auch noch|nebenbei|übrigens|uebrigens|und bitte|bitte noch|und setz|und trag|und erinner|und merk|und plan|und such|und schau)\b))/giu

const topics:[string,RegExp][]=[
  ['vorrat_einkauf',/(?<![\p{L}\p{N}])(?:einkaufsliste|liste|einkaufen|einkauf|vorrat|kühlschrank|kaufen|besorgen|leer|aufgebraucht|kassenbon|milch|eier|brot|nudeln)(?![\p{L}\p{N}])/iu],
  ['kochen',/(?<![\p{L}\p{N}])(?:rezept\w*|kochen|koche|kochst|gericht|abendessen|mittagessen|portion\w*|zutaten)(?![\p{L}\p{N}])/iu],
  ['finanzen',/(?:\d+(?:[.,]\d{1,2})?\s*(?:€|euro)\b|(?<![\p{L}\p{N}])(?:ausgegeben|bezahlt|überwiesen|gutschrift|erstattung|budget|abo|abos|abonnement|kündigen|gehalt|einnahme\w*|ausgabe\w*|sparen)(?![\p{L}\p{N}]))/iu],
  ['termin',/(?<![\p{L}\p{N}])(?:termin\w*|um\s+\d{1,2}(?::\d{2})?|\d{1,2}(?::\d{2})?\s*uhr|treffen|meeting|arzt|zahnarzt|friseur|geburtstag|training|vorlesung|seminar|übung)(?![\p{L}\p{N}])/iu],
  ['serie',/(?<![\p{L}\p{N}])(?:jeden|jede|jeder|wöchentlich|täglich|monatlich|immer\s+(?:montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags)|montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags)(?![\p{L}\p{N}])/iu],
  ['aufgabe_frist',/(?<![\p{L}\p{N}])(?:abgabe|abgeben|einreichen|frist|deadline|muss\s+bis|bis\s+(?:zum|spätestens)|muss\s+ich|erledigen|präsentation|präsentieren|vorstellen|vortrag|hausarbeit|klausur|anmelden)(?![\p{L}\p{N}])/iu],
  ['projekt',/(?<![\p{L}\p{N}])(?:projekt\w*|meilenstein|schritt\w*|bachelorarbeit|masterarbeit|thesis)(?![\p{L}\p{N}])/iu],
  ['reise',/(?<![\p{L}\p{N}])(?:reise\w*|urlaub|flug|flüge|hotel|unterkunft|packliste|einpacken|packen|trip|städtetrip|wochenende\s+in)(?![\p{L}\p{N}])/iu],
  ['outfit',/(?<![\p{L}\p{N}])(?:outfit\w*|anziehen|anzieh\w*|look|kleidung|kleiderschrank|parfüm|parfum|duft|klamotten)(?![\p{L}\p{N}])/iu],
  ['bestellung',/(?<![\p{L}\p{N}])(?:bestellung\w*|bestellt|paket|lieferung|retoure|zurückschicken|zurücksenden|rücksendung|sendung)(?![\p{L}\p{N}])/iu],
  ['bewerbung',/(?<![\p{L}\p{N}])(?:bewerbung\w*|beworben|bewerben|vorstellungsgespräch|jobinterview|stelle|praktikum|werkstudent\w*|absage|zusage)(?![\p{L}\p{N}])/iu],
  ['freie_zeit',/(?<![\p{L}\p{N}])(?:freie\s+zeit|such\s+mir|finde\s+mir|zeit\s+(?:für|zum)|wann\s+habe\s+ich\s+(?:zeit|\w+\s+stunden))(?![\p{L}\p{N}])/iu],
  ['erinnerung',/(?<![\p{L}\p{N}])(?:erinner\w*|nicht vergessen|denk\s+dran|merk\s+dir)(?![\p{L}\p{N}])/iu],
  ['frage',/(?:\?\s*$|^\s*(?:was|wann|wie|wo|welche\w*|wieviel|wie viel|hab\s+ich|habe\s+ich|steht)(?![\p{L}\p{N}]))/iu],
]

const weekdays=['sonntag','montag','dienstag','mittwoch','donnerstag','freitag','samstag']
const months=['januar','februar','märz','april','mai','juni','juli','august','september','oktober','november','dezember']

/** Löst relative und ausgeschriebene Datumsangaben im Text auf (Berliner Kalendertag). */
export function mentionedDates(text:string,today:string){
  const found=new Map<string,string>()
  const lower=text.toLocaleLowerCase('de-DE')
  const weekdayOf=(day:string)=>new Date(day+'T12:00:00Z').getUTCDay()
  if(/\bheute\b/u.test(lower))found.set('heute',today)
  if(/(?<!\p{L})übermorgen(?!\p{L})/u.test(lower))found.set('übermorgen',shiftDay(today,2))
  else if(/(?<!\p{L})morgen(?!\p{L})/u.test(lower))found.set('morgen',shiftDay(today,1))
  Object.entries(relativeDatesIn(lower,today)).forEach(([phrase,day])=>found.set(phrase,day))
  for(const match of lower.matchAll(/(?<!woche\s)\b(nächste[nrs]?\s+|kommende[nrs]?\s+|diese[nrs]?\s+|am\s+)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/gu)){
    const target=weekdays.indexOf(match[2])
    let offset=(target-weekdayOf(today)+7)%7
    if(offset===0)offset=7
    found.set(match[0].trim(),shiftDay(today,offset))
  }
  if(/\bnächste\s+woche\b/u.test(lower))found.set('nächste Woche',shiftDay(today,(8-weekdayOf(today))%7||7))
  for(const match of lower.matchAll(/\b(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(20\d\d))?/gu)){
    const year=match[3]??today.slice(0,4)
    let day=`${year}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`
    if(!match[3]&&day<today)day=`${Number(year)+1}${day.slice(4)}`
    if(/^\d{4}-\d{2}-\d{2}$/u.test(day))found.set(match[0].trim(),day)
  }
  for(const match of lower.matchAll(/\b(\d{1,2})\.?\s+(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/gu)){
    const month=String(months.indexOf(match[2])+1).padStart(2,'0')
    let day=`${today.slice(0,4)}-${month}-${match[1].padStart(2,'0')}`
    if(day<today)day=`${Number(today.slice(0,4))+1}${day.slice(4)}`
    found.set(match[0].trim(),day)
  }
  return Object.fromEntries(found)
}

export function analyseMessage(text:string,today:string){
  const clean=text.replace(/\s+/gu,' ').trim()
  const raw=clean.split(separators).map(piece=>piece?.trim()).filter((piece):piece is string=>Boolean(piece))
  // Reine Füllwörter („und“, „dann“) gehören zum folgenden Abschnitt.
  const pieces:string[]=[]
  let carry=''
  for(const piece of raw){
    if(/^(?:(?:und|dann|noch|auch|ach|ja|bitte|so|also)[\s,]*)+$/iu.test(piece)){carry+=piece+' ';continue}
    pieces.push((carry+piece).trim());carry=''
  }
  if(carry.trim())pieces.push(carry.trim())
  const segments=pieces.map(piece=>({
    text:piece.slice(0,400),
    themen:topics.filter(([,pattern])=>pattern.test(piece)).map(([name])=>name),
    daten:mentionedDates(piece,today),
  }))
  const themen=[...new Set(segments.flatMap(segment=>segment.themen).filter(name=>name!=='frage'))]
  return {
    hinweis:'Lokale Vorzerlegung deiner Nachricht. Prüfe sie: Abschnitte können zusammengehören (z. B. eine Abgabe und ihre Vorlesung), Themen sind nur Signalwörter.',
    abschnitte:segments.slice(0,12),
    themen,
    mehrereAnliegen:segments.filter(segment=>segment.themen.some(name=>name!=='frage')).length>1&&themen.length>1,
    daten:mentionedDates(clean,today),
  }
}
export type MessageAnalysis=ReturnType<typeof analyseMessage>
