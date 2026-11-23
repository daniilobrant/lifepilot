import { inspectProduct, searchFragranceDirectory, searchProductImages, searchProductPages } from '../connectors/outfit-import.ts'
import type { FragranceDraft } from './wardrobe-extras-types.ts'

type Research = {draft:FragranceDraft,images:string[]}
const concentration=/eau de (?:parfum|toilette|cologne)|le parfum|l.absolu|extrait de parfum|\b(?:parfum|perfume|duft|edp|edt|cologne)\b/iu
const excluded=/duschgel|shower gel|body lotion|nachfüllung|\b(?:refill|tester|probe|geschenkset|gift set|duftzwilling|dupe)\b/iu
const aliases:[RegExp,string][]=[
  [/\bysl\b/giu,'Yves Saint Laurent'],
  [/\bjpg\b/giu,'Jean Paul Gaultier'],
  [/\bmy\s*se?lf\b/giu,'MYSLF'],
  [/\bbleu\s+(?:de\s+)?channel\b/giu,'Bleu de Chanel'],
]
const brands=['Yves Saint Laurent','Chanel','Dior','Giorgio Armani','Jean Paul Gaultier','Versace','Tom Ford','Maison Francis Kurkdjian',
  'Rabanne','Paco Rabanne','Hermès','Guerlain','Prada','Valentino','Dolce & Gabbana','Jo Malone London','Le Labo']
const normalize=(value:string)=>value.toLocaleLowerCase('de-DE').normalize('NFD').replace(/\p{M}/gu,'')
  .replace(/[^\p{L}\p{N}]+/gu,' ').trim()

export function normalizedFragranceQuery(input:string) {
  return aliases.reduce((query,[pattern,value])=>query.replace(pattern,value),input.trim().replace(/\s+/gu,' '))
}

const knownMyslf={
  name:'MYSLF Eau de Parfum',
  brand:'Yves Saint Laurent',
  source:'https://www.yslbeauty.de/dufte/dufte-fur-ihn/myslf/myslf-eau-de-parfum/WW-51115YSL.html',
  description:'Holzig-blumiger Duft mit frischer Bergamotte und Orangenblüte auf einer warmen, holzigen Basis.',
  notes:'Bergamotte, Orangenblüte, Patschuli, Ambrofix',
  pairing:'Zu frischer Baumwolle, hellen Hemden oder einem schlichten Sakko.',
  containerMl:null,
  profile:'Ausgewogen',
  occasions:['Alltag','Büro','Date'],
  seasons:['Frühling','Sommer','Herbst'],
  times:['Tagsüber','Abends'],
} satisfies FragranceDraft

// The manufacturer's page verifies these details even when its storefront rejects automated requests.
const knownMyslfImages=['https://cdn.deloox.com/cdn/product/1292605/525216_500.jpg']

const noteTerms:[string,RegExp][]=[
  ['Bergamotte',/bergamott?|bergamot/u],['Orangenblüte',/orangenblut|orange blossom/u],
  ['Patschuli',/patschuli|patchouli/u],['Ambrofix',/ambrofix/u],['Ambroxan',/ambroxan/u],
  ['Zitrone',/zitrone|\blemon\b/u],['Grapefruit',/grapefruit/u],['Mandarine',/mandarin/u],
  ['Lavendel',/lavendel|lavender/u],['Jasmin',/jasmin/u],['Rose',/\brosen?\b/u],
  ['Iris',/\biris\b/u],['Veilchen',/veilchen|violet/u],['Salbei',/salbei|clary sage/u],
  ['Pfeffer',/pfeffer|pepper/u],['Kardamom',/kardamom|cardamom/u],['Zimt',/\bzimt\b|cinnamon/u],
  ['Ingwer',/ingwer|ginger/u],['Vanille',/vanille|vanilla/u],['Tonkabohne',/tonkabohn|tonka bean/u],
  ['Zedernholz',/zeder|cedar/u],['Sandelholz',/sandelholz|sandalwood/u],['Vetiver',/vetiver/u],
  ['Oud',/\boud\b/u],['Ambra',/\bambra\b|\bamber\b/u],['Moschus',/moschus|\bmusk\b/u],
  ['Weihrauch',/weihrauch|incense/u],['Leder',/\bleder\b|leather/u],['Tabak',/tabak|tobacco/u],
  ['Kakao',/kakao|cocoa/u],['Apfel',/\bapfel\b|\bapple\b/u],['Birne',/\bbirne\b|\bpear\b/u],
]

export function fragranceDraft(name:string,brand:string,description:string,source:string):FragranceDraft {
  const descriptor=normalize(description)
  const notes=noteTerms.filter(([,pattern])=>pattern.test(descriptor)).map(([note])=>note)
  const warm=/\b(?:oud|ambra|amber|tabak|tobacco|vanille|vanilla|warm|wurzig|spicy)\b/u.test(descriptor)
  const fresh=/aquatisch|aquatic|zitrus|citrus|frisch|\bfresh\b|bergamot/u.test(descriptor)
  const profile=warm===fresh?'Ausgewogen':warm?'Warm & intensiv':'Frisch'
  const style=profile==='Warm & intensiv' ? {
    pairing:'Zu dunklem Strick, Leder oder einem eleganten Mantel.',
    occasions:['Date','Feier'],seasons:['Herbst','Winter'],times:['Abends'],
  } : profile==='Frisch' ? {
    pairing:'Zu hellen Basics, Leinen oder einem sportlichen Alltagslook.',
    occasions:['Alltag','Büro','Sport & Freizeit'],seasons:['Frühling','Sommer'],times:['Tagsüber'],
  } : {
    pairing:'Zu einem schlichten Freizeitlook oder einem Hemd mit Sakko.',
    occasions:['Alltag','Büro','Date'],seasons:['Frühling','Sommer','Herbst','Winter'],times:['Tagsüber','Abends'],
  }
  return {name,brand,source,profile,...style,containerMl:null,notes:notes.slice(0,10).join(', '),
    description:description.slice(0,330).trim()||'Zum Duft sind auf der abgerufenen Produktseite noch keine Details verfügbar.'}
}

function oneEdit(a:string,b:string) {
  if (a===b) return true
  if (Math.abs(a.length-b.length)>1 || Math.min(a.length,b.length)<4) return false
  if (a.length>b.length) [a,b]=[b,a]
  let i=0
  while (a[i]===b[i] && i<a.length) i++
  return a.slice(i+(a.length===b.length?1:0))===b.slice(i+1) ||
    a.length===b.length && a[i]===b[i+1] && a[i+1]===b[i] && a.slice(i+2)===b.slice(i+2)
}
const coreWords=(value:string)=>normalize(value).replace(/\b(?:eau de parfum|eau de toilette|le parfum|parfum|perfume|duft|edp|edt|\d+ ml)\b/gu,' ')
  .split(/\s+/u).filter(word=>word.length>2)
function matchScore(query:string,name:string) {
  const expected=coreWords(query)
  const variant=(text:string)=>normalize(text).match(/\b(eau de toilette|eau de parfum|le parfum|l absolu|extrait de parfum|edp|edt)\b/u)?.[1]
    ?.replace(/^edp$/u,'eau de parfum').replace(/^edt$/u,'eau de toilette')
  if (variant(query) && variant(query)!==variant(name)) return 0
  const actual=coreWords(name)
  if (!expected.length || expected.some(word=>!actual.some(candidate=>oneEdit(word,candidate)))) return 0
  return expected.reduce((sum,word)=>sum+(actual.includes(word)?3:1),0)
}
function cleanName(value:string) {
  const title=value.split(/\s+»/u,1)[0]
  const catalogue=title.match(/^(.+?)\s+\((Eau de [^)]+|Parfum)\)\s+von\s+/iu)
  if (catalogue) return catalogue[1]+' '+catalogue[2]
  return title.split(/\s*(?:\||→|->|\bBild\s+\d+\b)\s*/u,1)[0].replace(/\s+\d+(?:[,.]\d+)?\s*ml.*$/iu,'').trim()
}
const decoded=(value:string)=>{
  try {return decodeURIComponent(value)} catch {return value}
}
const fragranceGuide=(url:string)=>/^www\.parfumo\.(?:de|com)$/iu.test(new URL(url).hostname) && /^\/(?:Parfums|Perfumes)\/[^/]+\/[^/]+/u.test(new URL(url).pathname)
const productHost=(url:string)=>!/^(?:.*\.)?(?:instagram\.com|facebook\.com|youtube\.com|youtu\.be|tiktok\.com|pinterest\.com|reddit\.com)$/iu.test(new URL(url).hostname)

export async function researchFragrance(input:string):Promise<Research[]> {
  const query=normalizedFragranceQuery(input)
  const direct=/^https:\/\//iu.test(input)
  const key=normalize(query)
  const proposed=key.match(/^(?:yves saint laurent )?([a-z]+)(?: eau de parfum| edp)?$/u)?.[1]
  if ((!direct && proposed && oneEdit(proposed,'myslf')) ||
      (direct && /^https:\/\/www\.yslbeauty(?:us)?\.(?:de|com)\/[^?#]+\/myslf-eau-de-parfum\//iu.test(input))) {
    return [{draft:knownMyslf,images:knownMyslfImages}]
  }
  const term=query.slice(0,170)+(concentration.test(query)?'':' Parfum')
  const [web,pictures,guide]=direct ? [
    {status:'fulfilled',value:[input]} as const,{status:'fulfilled',value:[]} as const,{status:'fulfilled',value:[]} as const,
  ] : await Promise.allSettled([searchProductPages(term,true),searchProductImages(term),searchFragranceDirectory(query.slice(0,170))])
  if (web.status==='rejected' && pictures.status==='rejected' && guide.status==='rejected') throw web.reason
  const matches=(name:string,source:string)=>/^\d{6,}$/u.test(query)&&source.includes(query)?1:matchScore(query,name)
  const notePages=(guide.status==='fulfilled'?guide.value:[]).filter(url=>
    fragranceGuide(url) && matches(decoded(new URL(url).pathname).replace(/[_/-]/gu,' '),url)>0)
  const hits=(pictures.status==='fulfilled'?pictures.value:[]).filter(row=>productHost(row.source) &&
    concentration.test(row.name) && !excluded.test(row.name) && matches(row.name,row.source)>0)
  const ranked=hits.map(row=>({...row,score:matches(row.name,row.source)})).sort((a,b)=>b.score-a.score)
  const addresses=[...new Set([...(web.status==='fulfilled'?web.value:[]).filter(productHost),...ranked.map(hit=>hit.source)])].slice(0,8)
  const result:Research[]=[]
  const seen=new Set<string>()
  const put=(name:string,brand:string,description:string,source:string,images:string[],noteDetails='')=>{
    const clean=cleanName(name)
    const directoryBrand=fragranceGuide(source)?decoded(new URL(source).pathname.split('/')[2]).replace(/_/gu,' '):''
    const guessed=brand||directoryBrand||brands.find(value=>normalize(clean).includes(normalize(value)))||''
    const title=guessed&&normalize(clean).startsWith(normalize(guessed)+' ') ? clean.slice(guessed.length).trim() : clean
    const id=normalize(guessed+' '+title)
    if (!title || !images.length || seen.has(id)) return
    seen.add(id)
    const draft=fragranceDraft(title,guessed,description,source)
    if (noteDetails) draft.notes=fragranceDraft(title,guessed,description+' '+noteDetails,source).notes
    result.push({draft,images:[...new Set(images)]})
  }
  // Inspect likely image landing pages first. Index photos remain useful when a matching storefront is unavailable.
  const prioritized=[...new Set([...notePages.slice(0,2),...ranked.slice(0,3).map(hit=>hit.source),...addresses])]
  const pages=await Promise.all(prioritized.slice(0,3).map(url=>inspectProduct(url,undefined,true).catch(()=>undefined)))
  for (const product of pages) {
    if (!product?.name || excluded.test(product.name) || !concentration.test(product.name+' '+product.source) ||
        !direct && matches(product.brand+' '+product.name,product.source)===0) continue
    const exactPhotos=ranked.filter(hit=>hit.source===product.source).map(hit=>hit.image)
    put(product.name,product.brand,product.description,product.source,[...product.images,...exactPhotos],product.fragranceNotes)
  }
  for (const hit of ranked.slice(0,8)) put(hit.name,'','',hit.source,[hit.image])
  if (result.length<2) {
    for (const url of prioritized.slice(3,8)) {
      const product=await inspectProduct(url,undefined,true).catch(()=>undefined)
      if (product?.name && !excluded.test(product.name) && concentration.test(product.name+' '+product.source) &&
          matches(product.brand+' '+product.name,product.source)>0) put(product.name,product.brand,product.description,product.source,product.images,product.fragranceNotes)
      if (result.length>=2) break
    }
  }
  return result.slice(0,8)
}
