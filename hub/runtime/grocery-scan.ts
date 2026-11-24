import { analyzeCodexImage } from '../adapters/codex-image.ts'
import {knownGroceryName} from './grocery-catalog.ts'
import { receiptTotal } from './grocery-types.ts'
import { prepareFullOutfitPhoto } from '../connectors/outfit-vision.ts'
import { recognizeApplicationImage } from '../connectors/application-ocr.ts'
import { normalizeGrocery, groceryKey } from './grocery.ts'
import { isDate } from './values.ts'
import { Problem } from './settings.ts'

const nonProducts=/^(?:kassenbon|kartenzahlung|gesamt|zwischensumme|summe|mwst|rabatt|pfand|unbekannt|betrag|gegeben|ruckgeld|wechselgeld|bar(?:zahlung)?|datum|termin|visa|mastercard|ec[ -]?karte|filiale|beleg|bonnr|terminal|euro|ebene|artikel)\b/iu

function receiptRows(text:string) {
  return text.split('\n').flatMap(line=>{
    const item=/^(.*?)\s+(\d{1,5}[,.]\d{2})\s*(?:€|EUR)?\s*$/iu.exec(line.trim())
    const name=item?.[1].trim()
    if(!name||!/\p{L}/u.test(name)||nonProducts.test(name.normalize('NFD').replace(/\p{M}/gu,''))||name.length>90)return []
    return [normalizeGrocery({name})]
  }).slice(0,30)
}
export function markedExpiry(text:string) {
  const dates=new Set<string>()
  const pattern=/(?:\bMHD\b|mindestens\s+haltbar(?:\s+bis)?|zu\s+verbrauchen\s+bis|\bEXP(?:IRY)?\b)\s*[:.]?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/giu
  for(const match of text.matchAll(pattern)) {
    const year=match[3].length===2?'20'+match[3]:match[3]
    const date=year+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0')
    if(isDate(date))dates.add(date)
  }
  return dates.size===1?[...dates][0]:null
}

function receiptDate(text:string) {
  const pattern=/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/gu
  const days=[...new Set([...text.matchAll(pattern)].map(([,day,month,year])=>
    (year.length===2?'20'+year:year)+'-'+month.padStart(2,'0')+'-'+day.padStart(2,'0')).filter(isDate))]
  return days.length===1?days[0]:null
}

export function stockRowsFromLabelText(text:string) {
  const found=new Map<string,ReturnType<typeof normalizeGrocery>>()
  for (const line of text.split(/\r?\n/u).slice(0,120)) {
    const label=line.trim().replace(/\s+\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|stück)$/iu,'')
    const name=groceryKey(label)==='vollmilch'?'Milch':knownGroceryName(label)
    if (name) found.set(groceryKey(name),normalizeGrocery({name}))
  }
  return [...found.values()].slice(0,30)
}

export async function scanGroceries(input:Buffer, receipt:boolean,single=false,allowCodex=false) {
  const photo=await prepareFullOutfitPhoto(input)
  const ocr=await recognizeApplicationImage(photo).catch(()=>null)
  const text=ocr?.text??''
  const localRows=receipt?receiptRows(text):stockRowsFromLabelText(text)
  const suggested=allowCodex && (!receipt || !localRows.length) ? await analyzeCodexImage(photo,'jpeg',receipt?'receipt':'stock') : []
  if (!text && !suggested.length) {
    throw new Problem(422,'Kein lesbarer Artikel erkannt. Fotografiere Etikett oder Beleg näher oder trage die Artikel ein.')
  }
  const rows=[...new Map([...suggested.filter(name=>name.length<=90 && !nonProducts.test(name.normalize('NFD').replace(/\p{M}/gu,'')))
    .map(name=>normalizeGrocery({name})),...localRows].map(row=>[groceryKey(row.name),row])).values()].slice(0,30)
  const expiry=single?markedExpiry(text):null
  if(expiry&&rows.length===1)rows[0]={...rows[0],expiry}
  return {rows,date:receipt?receiptDate(text):null,text:receipt?text:'',
    totalCents:receipt?receiptTotal(text):null,expiry}
}
