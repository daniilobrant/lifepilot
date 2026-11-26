import type { OutfitStyle } from './outfit-types.ts'

const names = ['Rot','Koralle','Orange','Bernstein','Gelb','Lindgrün','Grün','Türkis','Blau','Indigo','Violett','Pink']
const wheel = [0,15,28,44,58,87,121,168,216,248,283,318,360]
const named: [RegExp,number][] = [
  [/korall|coral|rotorange/iu,1], [/bernstein|senf|amber|goldgelb/iu,3], [/lindgrün|lime|gelbgrün/iu,5],
  [/türkis|teal|petrol|cyan|mint/iu,7], [/indigo|blauviolett/iu,9], [/pink|magenta|rosa|fuchsia/iu,11],
  [/rot|red|bordeaux|burgundy|weinrot/iu,0], [/orange|rost|terracotta/iu,2], [/gelb|yellow/iu,4],
  [/grün|green|oliv|olive/iu,6], [/blau|blue|navy/iu,8], [/lila|violett|purple|lavendel/iu,10],
]
// Marine, Ecru, Camel und Denim wirken wie Neutraltöne und lassen sich mit fast jeder Farbe kombinieren.
const neutralNames = /schwarz|wei(?:ß|ss)|grau|gr[ae]y|anthrazit|charcoal|beige|creme|cream|ecru|écru|elfenbein|ivory|off.white|sand|stone|taupe|camel|cognac|khaki|silber|silver|braun|brown|black|white|navy|marine|denim/iu
const patternNames = /mehrfarbig|bunt|multi.?colou?r|gemustert|muster|print|kariert|karo|gestreift|streifen|camouflage|tarn|batik|paisley/iu

function hexTone(hex: string) {
  const values = [1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)/255)
  const [red,green,blue] = values
  const max = Math.max(...values), min = Math.min(...values), range = max-min
  if (max < .18) return { name:'Schwarz' }
  if (range < .09) return { name:max > .89 ? 'Weiß' : 'Grau' }
  const hue = 60 * (max === red ? (green-blue)/range : max === green ? 2+(blue-red)/range : 4+(red-green)/range)
  const angle = (hue+360)%360
  if (angle >= 20 && angle <= 55 && range < .37) return {name:max>.67?'Beige':'Braun'}
  let index = 0
  for (let i=1;i<wheel.length;i++) if (Math.abs(wheel[i]-angle)<Math.abs(wheel[index]-angle)) index = i
  return { name:names[index%12], sector:index%12 }
}

export function identifiedColor(hex: string) {
  return /^#[0-9a-f]{6}$/iu.test(hex) ? hexTone(hex).name+' '+hex : ''
}

function tones(text: string) {
  return text.toLowerCase().split(/[,;/+&]|\s+(?:und|mit)\s+|(?<=\p{L})-(?=\p{L})/u).flatMap(part=>{
    const label=part.replace(/#[0-9a-f]{6}\b/giu,'')
    if (neutralNames.test(label)) return [-1]
    const match = named.find(([pattern])=>pattern.test(label))
    if (match) return [match[1]]
    const hex = part.match(/#[0-9a-f]{6}\b/iu)?.[0]
    return hex ? [hexTone(hex).sector ?? -1] : []
  })
}

export function colorRelation(left: string,right: string) {
  const a = tones(left).filter(tone=>tone>=0)
  const b = tones(right).filter(tone=>tone>=0)
  if (!a.length || !b.length) return tones(left).length && tones(right).length ? 'neutral' : 'unknown'
  const distances = a.flatMap(x=>b.map(y=>Math.min(Math.abs(x-y),12-Math.abs(x-y))))
  if (distances.includes(0)) return 'tone'
  if (distances.includes(6)) return 'contrast'
  return Math.min(...distances) <= 2 ? 'analog' : 'distant'
}

export function paletteFit(left: string,right: string,style: OutfitStyle) {
  const relation = colorRelation(left,right)
  if (relation==='unknown') return 0
  if (relation==='neutral') return 2
  if (relation==='analog' || relation==='tone') return style==='Auffällig' ? 3 : 5
  if (relation==='contrast') return style==='Auffällig' ? 7 : style==='Streetwear' ? 4 : -1
  return -3
}

export function paletteDescription(colors: string[]) {
  const pairs = colors.flatMap((first,index)=>colors.slice(index+1).map(second=>({first,second,relation:colorRelation(first,second)})))
  const matching = pairs.find(pair=>pair.relation==='contrast') ?? pairs.find(pair=>pair.relation==='analog') ?? pairs.find(pair=>pair.relation==='tone')
  if (matching) {
    const {first,second,relation} = matching
    const a=first.replace(/\s*#[0-9a-f]{6}\b/giu,'')
    const b=second.replace(/\s*#[0-9a-f]{6}\b/giu,'')
    if (relation==='contrast') return `${a} und ${b} setzen einen Komplementärkontrast.`
    if (relation==='analog') return `${a} und ${b} liegen im Farbkreis nah beieinander.`
    return `${a} und ${b} ergeben eine Ton-in-Ton-Kombination.`
  }
  const accent=colors.find(color=>tones(color).some(tone=>tone>=0))
  return accent ? `${accent.replace(/\s*#[0-9a-f]{6}\b/giu,'')} setzt den Farbakzent.` :
    colors.some(color=>tones(color).length) ? 'Neutrale Farben bilden die Basis.' : ''
}

/** Mehrfarbige oder gemusterte Teile, auch wenn das Muster nur im Namen steht („karierte Jacke“). */
export function isPatterned(color: string, name = '') {
  return patternNames.test(color+' '+name) || tones(color).filter(tone=>tone>=0).length>1
}

/**
 * Harmonie eines Kandidaten mit allen bereits gewählten Teilen. Neutraltöne verbinden, Ton-in-Ton und
 * Farbkreis-Nachbarn passen, Komplementärfarben nur im auffälligen Stil. Farbtöne, die weder benachbart
 * noch komplementär sind (etwa Blau und Weinrot), gelten als unruhig und werden stark abgewertet.
 */
export function paletteScore(candidate: {color:string,name?:string}, chosen: {color:string,name?:string}[], style: OutfitStyle) {
  let score = 0
  const patterned = isPatterned(candidate.color, candidate.name)
  for (const other of chosen) {
    const relation = colorRelation(candidate.color, other.color)
    if (relation==='neutral') score += 3
    else if (relation==='tone' || relation==='analog') score += 6
    else if (relation==='contrast') score += style==='Auffällig' ? 3 : style==='Streetwear' ? 0 : -8
    else if (relation==='distant') score -= 12
    if (patterned && isPatterned(other.color, other.name)) score -= 6
  }
  const accents = new Set([candidate,...chosen].flatMap(item=>tones(item.color).filter(tone=>tone>=0)))
  if (style!=='Auffällig' && accents.size>2) score -= 4
  return score
}

