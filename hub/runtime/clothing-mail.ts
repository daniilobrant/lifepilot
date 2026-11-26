import { outfitFields, outfitGarment } from './outfit-fields.ts'
import { dateInBerlin, isDate } from './values.ts'
import type { WardrobeDraft } from './outfit-types.ts'

type Mail = {subject:string,from:string,text:string,at:string|null}
type Data = Record<string,unknown>
export type OrderProductDraft = WardrobeDraft & { isClothing?:boolean,cents?:number }
export type ClothingProduct = {draft:OrderProductDraft, sku:string, quantity:number, image:string}
export type ClothingMail = {reference:string,sender:string,merchant:string,kind:'order'|'shipping'|'delivery'|'return'|'refund'|'cancel',tracking:string,partial:boolean,items:ClothingProduct[],day:string,deadline:string|null,estimated?:string,shipped?:string,totalCents?:number,refundCents?:number}
const asRecord = (value:unknown):Data => value && typeof value==='object' && !Array.isArray(value) ? value as Data : {}
const string = (value:unknown,max=120) => typeof value==='string' ? value.replace(/[\x00-\x1f\x7f]+/gu,' ').trim().slice(0,max) : ''
const orderSubject = /bestellbestätigung|bestellung.{0,45}(?:bestätigt|eingegangen)|(?:danke|vielen dank).{0,45}(?:bestellung|einkauf)|order confirmation|thanks for your order/iu
const deliveredSubject = /(?:paket|bestellung|lieferung|sendung).{0,60}(?:zugestellt|ausgeliefert|geliefert|delivered|abgeholt|angekommen)|(?:zugestellt|ausgeliefert|delivered).{0,35}(?:paket|bestellung|lieferung|sendung|order|package)|(?:order|package|parcel).{0,65}delivered/iu
const shippingSubject=/versandbestätigung|(?:paket|bestellung|lieferung|sendung).{0,55}(?:versandt|versendet|verschickt|unterwegs)|shipping confirmation|(?:order|package).{0,45}shipped|shipped your order/iu
const trackingPattern=/(?:sendungsnummer|sendungs[- ]?nr\.?|tracking\s*(?:number|no\.?|id))\s*[:#]?\s*([a-z\d][a-z\d-]{9,49})/giu
const receivedReturn=/rücksendung abgegeben|retoure eingegangen|return received/iu
const returnSubject = /retoure|rücksendung|return label|return deadline/iu
const refundSubject=/rückerstattung.*(?:unterwegs|gesendet)|(?:wir haben|deine|ihre).*rückerstattung.*veranlasst|refund (?:sent|issued)/iu
const cancelledSubject=/(?:bestellung|order).{0,55}(?:storniert|cancelled|canceled)/iu
const referencePattern = /(?:bestell(?:nummer|[- ]?nr\.?|ung\s*#)|order\s*(?:number|no\.?|id|#))\s*[:#]?\s*([\p{L}\d][\p{L}\d-]{3,48})/giu
const taggedName = /^(?:(?:artikel(?:name)?|produkt|item|product)\s*:\s*|(?:[-•*]\s*)|(?:(\d{1,2})\s*[x×]\s*))(.*)$/iu
const currency = /\s+\d{1,6}[.,]\d{2}\s*(?:€|EUR|GBP|USD).*$/iu

export function cleanMailMarkup(input:string) {
  return input.replace(/&(?:amp|nbsp|quot|apos|lt|gt|#\d{1,7}|#x[0-9a-f]{1,6});/giu, entity=>{
    const values:Data={'&amp;':'&','&nbsp;':' ','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}
    const direct=values[entity.toLowerCase()]
    if (typeof direct==='string') return direct
    const code=entity.toLowerCase().startsWith('&#x') ? parseInt(entity.slice(3,-1),16) : Number(entity.slice(2,-1))
    return code>=32 && code<=0x10ffff ? String.fromCodePoint(code) : ''
  })
}
export function htmlMailText(html:string) {
  return cleanMailMarkup(html.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/giu,'')
    .replace(/<\/(?:tr|p|div|li|h[1-6])\s*>|<br\s*\/?>/giu,'\n').replace(/<[^>]*>/gu,' '))
    .split('\n').map(line=>line.replace(/\s+/gu,' ').trim()).filter(Boolean).join('\n')
}

function publicLink(raw:unknown,photo=false) {
  if (typeof raw!=='string' || raw.length>700) return ''
  try {
    const url=new URL(cleanMailMarkup(raw))
    if (url.protocol!=='https:' || url.username || url.password || url.port ||
        !/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/iu.test(url.hostname)) return ''
    if (/(?:unsubscribe|abmelden|tracking|click|openpixel|pixel|beacon|account|ruecksendung|return-label)(?:[\/.?_-]|$)/iu.test(url.pathname) ||
        /^(?:track|tracking|click|email|links)\./iu.test(url.hostname)) return ''
    for (const key of [...url.searchParams.keys()]) {
      if (photo || !/^(?:color|colour|variant|variationid|sku|size|colordisplaycode)$/iu.test(key)) url.searchParams.delete(key)
    }
    url.hash=''
    return url.href.length<=500 ? url.href : ''
  } catch { return '' }
}
function reference(value:unknown) {
  const match=string(value,60).replace(/^#/u,'')
  return /^(?=.{4,49}$)(?=.*\d)[\p{L}\d-]+$/u.test(match) ? match.toUpperCase() : ''
}
function date(value:unknown) {
  const raw=string(value,25)
  const de=/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/u.exec(raw)
  const next=de ? de[3]+'-'+de[2].padStart(2,'0')+'-'+de[1].padStart(2,'0') : raw.slice(0,10)
  return isDate(next) ? next : null
}
function explicitDeadline(text:string) {
  const matches=[...text.matchAll(/(?:rückgabe(?:frist)?|rücksendung|retoure|zurücksend(?:en|est)|return(?: deadline)?)[^\n]{0,80}?(?:bis(?: zum)?|spätestens am|by|:)\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})\b/giu)]
  return [...new Set(matches.map(match=>date(match[1])).filter((value):value is string=>Boolean(value)))].sort()[0] ?? null
}
function attributes(tag:string) {
  return new Map([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu)]
    .map(([,key,first,second])=>[key.toLowerCase(),cleanMailMarkup(first ?? second)]))
}
function selectedUrl(value:unknown) {
  const data=Array.isArray(value)?value[0]:value
  return typeof data==='string'?data:asRecord(data).url ?? asRecord(data).contentUrl
}
// Technik und Gerätezubehör gehören nicht in den Kleiderschrank, auch wenn „Tasche“ oder „Hülle“ im Namen steht.
const technical=/\b(?:laptop|notebook|macbook|ipad|iphone|tablet|smartphone|handy|usb|usb-c|ladegerät|ladekabel|kabel|adapter|hub|powerbank|kopfhörer|earbuds|tastatur|maus|monitor|festplatte|ssd|hdmi|bildschirm|displayschutz|schutzhülle|ladeger)\w*/iu

// Unterwäsche und Socken werden verfolgt, kommen aber nie in den Kleiderschrank.
export const isUnderwear=(type:string)=>type==='Socken'||type==='Unterwäsche'

function garment(name:string, details:Data={}, count=1, allowOther=false):ClothingProduct|undefined {
  const normalized=string(name)
  const detected=outfitGarment(normalized) ?? outfitFields(normalized,[],'')
  if ((!detected.category && !allowOther) || !normalized || /^(?:gesamtsumme|versand|gesamt|bestellnummer|zahlung|lieferung|bestellung|versicherung|mehr erfahren)\b/iu.test(normalized)) return
  const inferred=outfitFields(normalized,[],'',true)
  const brand=typeof details.brand==='object'?asRecord(details.brand).name:details.brand
  return {sku:string(details.sku ?? details.productID,70),quantity:Number.isInteger(count) ? Math.min(20,Math.max(1,count)) : 1,
    image:publicLink(selectedUrl(details.image),true),
    draft:{name:normalized,category:detected.category??'accessory',isClothing:Boolean(detected.category)&&!technical.test(normalized)&&!isUnderwear(detected.garmentType??''),...(typeof details.cents==='number' && details.cents>0 && {cents:details.cents}),garmentType:detected.garmentType ?? '',color:string(details.color ?? details.colour,100),
      size:string(asRecord(details.size).name ?? details.size,40),brand:string(brand,70)||inferred.brand,
      model:string(details.model,90),material:string(details.material,120)||inferred.material||'',fit:inferred.fit||'',
      season:inferred.season||'',tags:inferred.tags||'',source:publicLink(details.url)}}
}
function linkedRows(html:string) {
  const items:ClothingProduct[]=[]
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/giu)) {
    const row=match[1]
    if (row.includes('<tr')) continue
    const text=htmlMailText(row)
    for (const anchor of row.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/giu)) {
      const details=attributes(anchor[0].split('>',1)[0])
      const name=htmlMailText(anchor[1]).replace(currency,'')
      if (!name || name.length>140 || /ansehen|kaufen|verfolg|zurück|mehr|hier klicken/iu.test(name)) continue
      const product=garment(name,{url:details.get('href'),
        size:/\b(?:größe|size)\s*:?\s*([\p{L}\d/.-]{1,16})/iu.exec(text)?.[1],
        color:/\b(?:farbe|color)\s*:?\s*([\p{L}-]{2,22})/iu.exec(text)?.[1]},1)
      if (!product) continue
      for (const image of row.matchAll(/<img\b[^>]*>/giu)) {
        const attrs=attributes(image[0])
        const alt=attrs.get('alt') ?? ''
        if (alt.length>4 && (name.toLowerCase().includes(alt.toLowerCase()) || alt.toLowerCase().includes(name.toLowerCase()))) {
          product.image=publicLink(attrs.get('src'),true)
          if (product.image) break
        }
      }
      items.push(product)
      break
    }
    if (items.length>=30) break
  }
  return items
}

function plainItems(text:string) {
  const lines=text.split(/\r?\n/u).map(line=>line.trim()).filter(line=>line && !line.startsWith('>')).slice(0,140)
  const items:ClothingProduct[]=[]
  for (let i=0;i<lines.length;i++) {
    const line=lines[i]
    const tagged=taggedName.exec(line)
    const next=lines.slice(i+1,i+5)
    if (!tagged && (line===line.toLowerCase() || !currency.test(line) &&
      !/^(?:größe|size|farbe|color|artikelnummer|sku|menge|quantity)(?:\s*:\s*|\s+(?=\d))/iu.test(next[0] ?? ''))) continue
    const name=(tagged?.[2] ?? line).replace(currency,'').split(/\s+[|·]\s+/u,1)[0].trim()
    if (!name || name.length>120 || /[.!?]$/u.test(name) || /\b(?:entdecken|shoppen|zurückschicken|zurücksenden|zahlung|erstattung|erstatten|datenschutz|empfehlung)\b/iu.test(name)) continue
    const fields:Data={}
    const tails=[...(line.includes(' · ') || line.includes(' | ') ? line.split(/\s+[|·]\s+/u).slice(1) : []),...next]
    let quantity=Number(tagged?.[1]??1)
    for (const tail of tails) {
      const field=/^(größe|size|farbe|color|marke|brand|menge|quantity|artikelnummer|sku|produktlink)(?:\s*:\s*|\s+(?=\d))(.+)$/iu.exec(tail)
      if (!field) break
      const key=field[1].toLowerCase()
      if (['menge','quantity'].includes(key)) quantity=Number(field[2])
      else fields[({größe:'size',farbe:'color',marke:'brand',artikelnummer:'sku',produktlink:'url'} as Record<string,string>)[key]??key]=field[2]
    }
    const product=garment(name,fields,quantity,Boolean(tagged && /^(?:artikel(?:name)?|produkt|item|product)\s*:/iu.test(line)))
    if (product) items.push(product)
    if (items.length>=30) break
  }
  return items
}

function euroCents(input:string, knownCurrency=false) {
  const match=/(?:^|\s)(\d{1,5})(?:[,.](\d{2}))?\s*(€|EUR)?/iu.exec(input)
  if(!match || (!knownCurrency && !match[3])) return
  const cents=Number(match[1])*100+Number(match[2]??'0')
  return cents>0 && cents<10_000_000 ? cents : undefined
}

function amountAfter(lines:string[],label:RegExp) {
  const index=lines.findIndex(line=>label.test(line))
  if(index<0) return
  return euroCents(lines[index+1]??'')
}

/** Warenkorb-Blöcke mit Bild „Cart Image“ (z. B. adidas): Name, Preis, „Größe: L / Menge: 1“, „Farbe: …“. Doppelte Blöcke (Desktop und Mobil) zählen einmal. */
function cartItems(html:string,brand:string):ClothingProduct[] {
  const pieces=html.split(/(<img\b[^>]*\balt\s*=\s*["']Cart Image["'][^>]*>)/iu)
  const found=new Map<string,ClothingProduct>()
  for (let i=1;i<pieces.length;i+=2) {
    const src=/\bsrc\s*=\s*["']([^"']+)["']/iu.exec(pieces[i])?.[1]??''
    const block=htmlMailText(pieces[i+1].slice(0,2500)).split(/\r?\n/u).map(line=>line.trim()).filter(Boolean)
    const name=block[0]
    if (!name || /^(?:€|größe|farbe|menge)/iu.test(name)) continue
    const price=euroCents((block.find(line=>/^€\s*[\d.,]+$/u.test(line))??'').replace(/^€\s*/u,'')+' €')
    const detail=block.find(line=>/^größe\s*:/iu.test(line))??''
    const size=/^größe\s*:\s*([^/]+?)(?:\s*\/|$)/iu.exec(detail)?.[1]??''
    const quantity=Number(/menge\s*:\s*(\d{1,2})/iu.exec(detail)?.[1]??1)
    const color=/^farbe\s*:\s*(.+)$/iu.exec(block.find(line=>/^farbe\s*:/iu.test(line))??'')?.[1]??''
    const product=garment(name,{image:src,color,size,brand,...(price?{cents:price}:{})},quantity,true)
    const key=[name,size,color].join('|').toLowerCase()
    if (product && !found.has(key)) found.set(key,product)
  }
  return [...found.values()].slice(0,30)
}

function retailerItems(lines:string[],html:string,merchant:string) {
  const items:ClothingProduct[]=[]
  const images=merchant==='ASOS' ? [...html.matchAll(/<img\b[^>]*>/giu)].map(([tag])=>attributes(tag)):[]
  for(let i=0;i<lines.length-2;i++){
    const name=lines[i]
    if((merchant==='ASOS' && /^(?:zwischensumme|gesamtbetrag|summe rückerstattungsbetrag)$/iu.test(name)) || /^zahlungsübersicht:/iu.test(name)) break
    let product:ClothingProduct|undefined
    if(merchant==='ASOS'){
      const variant=/^(.+?)\s*\/\s*([^/]{1,28})\s*\/\s*Anzahl\s*(\d{1,2})$/iu.exec(lines[i+2])
      const cents=euroCents(lines[i+1])
      if(!variant || !cents) continue
      const candidates=images.filter(image=>image.get('alt')?.trim()===name &&
        /^https:\/\/images\.asos-media\.com\/products\//iu.test(image.get('src')??''))
      const image=candidates[0]?.get('src')
      product=garment(name,{color:variant[1].replace(/[,;]$/u,''),size:variant[2],cents,image},Number(variant[3]),true)
    }else{
      const sku=/^(\d{6,14}),\s*(.+)$/u.exec(name)
      const variant=/^(.+),\s*([\p{L}\d/.-]{1,14})$/u.exec(lines[i+1])
      const quantity=/^(\d{1,2})\s*x$/iu.exec(lines[i+3]??'')
      if(!sku || !variant || lines[i+2]!=='Preis:' || !quantity) continue
      const article=sku[1].slice(0,6)
      const colour=sku[1].length===14 ? sku[1].slice(6,8) : ''
      const url='https://www.uniqlo.com/de/de/products/E'+article+'-000/00'+(colour?'?colorDisplayCode='+colour:'')
      const image=colour?'https://image.uniqlo.com/UQ/ST3/AsianCommon/imagesgoods/'+article+'/item/goods_'+colour+'_'+article+'_3x4.jpg':''
      product=garment(sku[2],{sku:sku[1],color:variant[1],size:variant[2],brand:'UNIQLO',url,image,cents:euroCents(lines[i+4]??'')},Number(quantity[1]),true)
    }
    if(product) items.push(product)
    if(items.length>=30) break
  }
  return items
}

/** Amazon-Bestellmails: Artikel mit Menge und Preis aus dem Text, Produktbild aus dem zugehörigen <img alt>. */
function amazonItems(text:string,html:string):ClothingProduct[] {
  const images=[...html.matchAll(/<img\b[^>]*>/giu)].map(([tag])=>attributes(tag))
    .filter(image=>/^https:\/\/m\.media-amazon\.com\/images\/I\//iu.test(image.get('src')??''))
  const items:ClothingProduct[]=[]
  // Amazon schreibt Preise auch mit einer Nachkommastelle („24.9 EUR“) und sehr lange Artikelnamen.
  for (const match of text.matchAll(/^\s*\*\s+(.{3,600}?)\s*\n\s*Menge:\s*(\d{1,2})\s*\n\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*EUR/gimu)) {
    const name=match[1].trim()
    const picture=images.find(image=>{
      const alt=(image.get('alt')??'').trim()
      return alt && (alt===name || name.startsWith(alt.replace(/…$/u,'')) || alt.startsWith(name))
    })?.get('src')?.replace(/\._[A-Z]{2}\d+_\./u,'._SL800_.')
    const product=garment(name,{image:picture,cents:Math.round(Number(match[3].replace(',','.'))*100)},Number(match[2]),true)
    if (product) items.push(product)
  }
  return items.slice(0,30)
}

/** Absender werden auf die Shop-Domain zurückgeführt: mail2.weekday.com und weekday.com sind derselbe Shop. */
export function shopDomain(sender:string) {
  const parts=sender.toLowerCase().replace(/^.*@/u,'').split('.').filter(Boolean)
  const compound=/^(?:co|com|org|net|ac)\.[a-z]{2}$/u.test(parts.slice(-2).join('.'))
  return parts.slice(compound?-3:-2).join('.')
}
const shopName=(domain:string)=>{const base=domain.split('.')[0]??domain;return base.charAt(0).toUpperCase()+base.slice(1)}

export function parseClothingMail(mail:Mail, html=''):ClothingMail|undefined {
  const sender=/@([a-z0-9.-]+\.[a-z]{2,})>?\s*$/iu.exec(mail.from)?.[1].toLowerCase()
  if (!sender || /newsletter|rabatt|sonderangebot|black friday/iu.test(mail.subject) ||
      /passwort.{0,35}(?:eingeben|bestätigen)|zahlungsdaten.{0,35}(?:aktualisieren|eingeben)/iu.test(mail.text)) return
  const cleaned=htmlMailText(html)
  const text=(mail.text+'\n'+cleaned).slice(0,30_000)
  const lines=(cleaned.length>60?cleaned:mail.text).split(/\r?\n/u).map(line=>line.trim()).filter(Boolean)
  const asos=/(?:^|\.)asos\.com$/u.test(sender), uniqlo=/(?:^|\.)uniqlo\.(?:com|eu)$/u.test(sender)
  const amazon=/(?:^|\.)amazon\.(?:de|com|co\.uk|fr|it|es|nl)$/u.test(sender)
  const merchant=asos?'ASOS':uniqlo?'UNIQLO':amazon?'Amazon':''
  let kind:ClothingMail['kind']|undefined=cancelledSubject.test(mail.subject)?'cancel':refundSubject.test(mail.subject)?'refund':returnSubject.test(mail.subject)?'return':deliveredSubject.test(mail.subject)?'delivery':
    orderSubject.test(mail.subject)?'order':shippingSubject.test(mail.subject)?'shipping':undefined
  if(uniqlo && /rechnung von uniqlo/iu.test(mail.subject)) kind='order'
  if(amazon) kind=/^\s*bestellt\s*:/iu.test(mail.subject)?'order':/^\s*versendet\s*:/iu.test(mail.subject)?'shipping':
    /^\s*(?:zugestellt|geliefert)\s*:/iu.test(mail.subject)?'delivery':/storniert/iu.test(mail.subject)?'cancel':kind
  let code='', tracking=''
  if(amazon) code=reference(/\bBestellnr\.?\s*:?\s*(\d{3}-\d{7}-\d{7})/u.exec(mail.text+'\n'+cleaned)?.[1])
  else if(merchant){
    const header=lines.findIndex(line=>uniqlo ? /^übergeordnete bestellnummer\s*:/iu.test(line) : /^bestell[- ]?nr\.?\s*:/iu.test(line))
    if(header>=0) code=reference(lines[header].split(':')[1]?.trim()||lines[header+1])
  }
  let vendor=sender.replace(/^(?:www|mail|shop|orders|news)\./u,'')
  let structured:ClothingProduct[]=[]
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/giu)) {
    let parsed:unknown
    try {parsed=JSON.parse(match[1])} catch {continue}
    const root=asRecord(parsed)
    const entries=Array.isArray(parsed)?parsed:Array.isArray(root['@graph'])?root['@graph']:[parsed]
    for (const candidate of entries.slice(0,25).map(asRecord)) {
      const type=string(candidate['@type'],55).split('/').at(-1)
      if (type!=='Order' && type!=='ParcelDelivery') continue
      const order=type==='Order'?candidate:asRecord(candidate.partOfOrder)
      const found=reference(order.orderNumber)
      const trackingCode=reference(candidate.trackingNumber)
      if (!found && !trackingCode || code && found && code!==found) continue
      code=found
      tracking=trackingCode.length>=10 ? trackingCode : tracking
      vendor=string(asRecord(order.merchant).name,90)||vendor
      if (!kind && type==='Order' && /OrderProcessing|OrderPaymentDue|OrderInTransit|OrderDelivered/iu.test(string(order.orderStatus))) kind='order'
      if (!kind && type==='ParcelDelivery') {
        if (/Delivered|completed/iu.test(string(candidate.deliveryStatus ?? candidate.deliveryStatusCode))) kind='delivery'
        else if (tracking) kind='shipping'
      }
      const offers=Array.isArray(order.acceptedOffer)?order.acceptedOffer:[order.acceptedOffer]
      structured=offers.slice(0,30).flatMap(value=>{
        const offer=asRecord(value), item=asRecord(offer.itemOffered)
        const found=garment(string(item.name),{...item,url:item.url??offer.url,
          cents:offer.priceCurrency==='EUR' ? euroCents(String(offer.price),true) : undefined},
          Number(asRecord(offer.eligibleQuantity).value??offer.quantity??1),true)
        return found?[found]:[]
      })
      break
    }
    if (code) break
  }
  const numbers=new Set([...(mail.subject+'\n'+text).matchAll(referencePattern)].map(match=>reference(match[1])).filter(Boolean))
  if (!code && numbers.size===1) code=[...numbers][0]
  if (!code) { const at=lines.findIndex(line=>/^bestellnummer\s*:?$/iu.test(line)); if (at>=0) code=reference(lines[at+1]) }
  const identifiers=new Set([...(mail.subject+'\n'+text).matchAll(trackingPattern)]
    .map(match=>reference(match[1])).filter(value=>value.length>=10))
  if (!tracking && identifiers.size===1) tracking=[...identifiers][0]
  // Bestätigungen mancher Shops (z. B. adidas) nennen Nummer und Artikel nur als Bild: Die Bestellung wird trotzdem unter „Bestellt“ geführt.
  let fallback=false
  if (kind==='order' && !code && !merchant && mail.at && Number.isFinite(Date.parse(mail.at)) &&
      /^\s*(?:danke|vielen dank|bestellbestätigung|deine bestellbestätigung)/iu.test(mail.subject)) {code='MAIL-'+Date.parse(mail.at);fallback=true}
  if (!kind || !code && !(kind==='delivery' && tracking)) return
  const deadline=explicitDeadline(text)
  if (kind==='return' && !deadline && !receivedReturn.test(mail.subject)) return
  const htmlItems=structured.length?structured:linkedRows(html)
  const plain=plainItems(mail.text || text)
  const retailer=amazon ? amazonItems(mail.text||text,html) : merchant ? retailerItems(lines,html,merchant) : []
  const placeholder:ClothingProduct[]=fallback?[{sku:'',quantity:1,image:'',draft:{name:'Bestellung bei '+shopName(shopDomain(sender))+' (Artikel stehen in der Mail)',category:'accessory',isClothing:false,
    garmentType:'',color:'',size:'',brand:'',model:'',material:'',fit:'',season:'',tags:'',source:''}}]:[]
  const cart=!retailer.length&&!structured.length ? cartItems(html,shopName(shopDomain(sender))) : []
  const items=retailer.length ? retailer : cart.length ? cart : structured.length ? structured : htmlItems.length ? htmlItems.map(item=>{
    const fromText=plain.find(row=>row.draft.name.toLowerCase()===item.draft.name.toLowerCase())
    return {...item,quantity:fromText?.quantity??item.quantity,
      draft:{...item.draft,color:item.draft.color||fromText?.draft.color||'',size:item.draft.size||fromText?.draft.size||''}}
  }) : plain.length ? plain : placeholder
  if (kind==='order' && !items.length) return
  const totalCents=kind==='order' ? amountAfter(lines,/^(?:gesamtbetrag|gesamt:)$/iu) ??
    euroCents(/^(?:Gesamtbetrag|Gesamtsumme|Gesamt)\s*:\s*(.+)$/imu.exec(lines.join('\n'))?.[1]??'') : undefined
  const refundCents=kind==='refund' ? amountAfter(lines,/^summe rückerstattungsbetrag$/iu) : undefined
  const fieldDate=(pattern:RegExp)=>{
    const index=lines.findIndex(line=>pattern.test(line))
    if(index<0) return
    return date(lines[index+1])
  }
  const estimate=/^Voraussichtliches Lieferdatum:\s*(?:[\p{L}]+\s+)?(\d{1,2})\.\s+([\p{L}]+)\s+(\d{4})$/imu.exec(lines.join('\n'))
  const months=['januar','februar','märz','april','mai','juni','juli','august','september','oktober','november','dezember']
  const deliveryMonth=estimate ? months.indexOf(estimate[2].toLowerCase())+1 : 0
  const estimated=deliveryMonth && estimate ? date(estimate[3]+'-'+String(deliveryMonth).padStart(2,'0')+'-'+estimate[1].padStart(2,'0')) : undefined
  const short=['jan','feb','mär','apr','mai','jun','jul','aug','sep','okt','nov','dez']
  const shortEstimate=!estimated && kind==='order' ? (()=>{
    const at=lines.findIndex(line=>/^voraussichtliche lieferung\s*:?$/iu.test(line))
    const hit=at>=0 ? /(\d{1,2})\.?\s+([\p{L}]{3})/u.exec(lines[at+1]??'') : null
    const month=hit ? short.indexOf(hit[2].toLowerCase())+1 : 0
    if (!hit || !month || !mail.at) return undefined
    const base=dateInBerlin(new Date(mail.at))
    let candidate=base.slice(0,4)+'-'+String(month).padStart(2,'0')+'-'+hit[1].padStart(2,'0')
    if (candidate<base) candidate=String(Number(base.slice(0,4))+1)+candidate.slice(4)
    return date(candidate)
  })() : undefined
  const dated=uniqlo && kind==='order'?fieldDate(/^bestellung erhalten:/iu):undefined
  const shipped=uniqlo && kind==='order'?fieldDate(/^bestellung versandt:/iu):undefined
  const domain=shopDomain(sender)
  return {reference:code,sender:(asos?'asos.com':uniqlo?'uniqlo.com':amazon?'amazon.de':domain),merchant:merchant||(/\.[a-z]{2,}$/iu.test(vendor)?shopName(shopDomain(vendor)):vendor),kind,tracking,partial:/teillieferung|teil deiner bestellung|part of your order|split shipment|separat(?:e|en) paket/iu.test(text),
    items,...((estimated??shortEstimate) && {estimated:(estimated??shortEstimate)!}),...(totalCents && {totalCents}),...(refundCents && {refundCents}),...(shipped && {shipped}),day:dated ?? (mail.at && Number.isFinite(Date.parse(mail.at)) ? dateInBerlin(new Date(mail.at)) : dateInBerlin()),deadline}
}
