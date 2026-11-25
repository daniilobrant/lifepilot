import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Resolver } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'
import type { IncomingMessage } from 'node:http'
import { outfitGarment, productWardrobeFields, textProductColor } from '../runtime/outfit-fields.ts'
import { Problem } from '../runtime/settings.ts'

const execute = promisify(execFile)

export const photoLimit = 4 * 1024 * 1024
export const outfitUploadLimit = 16 * 1024 * 1024

export function photoMime(bytes: Buffer, allowHeic = false) {
  if (bytes.length > 12 && bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) return 'image/png'
  if (bytes.length > 12 && bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex'))) return 'image/jpeg'
  if (bytes.length > 16 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return 'image/webp'
  if (allowHeic && bytes.length >= 24 && bytes.toString('ascii',4,8) === 'ftyp') {
    const header = bytes.subarray(8,Math.min(bytes.readUInt32BE(0),64,bytes.length))
    if (header.length >= 4 && /(?:heic|heix|hevc|hevx)/u.test(header.toString('ascii'))) return 'image/heic'
  }
  throw new Problem(415, 'Wähle ein PNG-, JPEG- oder WebP-Bild.')
}

export async function uploadOutfitPhoto(req: IncomingMessage, limit = photoLimit) {
  if (Number(req.headers['content-length'] || 0) > limit) throw new Problem(413,'Das Foto ist zu groß.')
  let size = 0
  const parts: Buffer[] = []
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size > limit) throw new Problem(413,'Das Foto ist zu groß.')
    parts.push(chunk)
  }
  return Buffer.concat(parts)
}

export function productAddress(raw: unknown, maxLength=1500) {
  if (typeof raw !== 'string' || raw.length > maxLength) throw new Problem(400,'Gib eine öffentliche HTTPS-Produktadresse ein.')
  const invalid = () => new Problem(400,'Gib eine öffentliche HTTPS-Produktadresse ein.')
  let url: URL
  try { url = new URL(raw) } catch { throw invalid() }
  const host = url.hostname
  if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(host) ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/iu.test(host) ||
      /\.(?:localhost|local|internal|test|invalid|example|onion|lan|home|arpa)$/iu.test(host)) throw invalid()
  url.hash = ''
  return url
}

export function publicIPv4(value: string) {
  if (isIP(value) !== 4) return false
  const [a,b,c] = value.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    a === 100 && b >= 64 && b < 128 || a === 169 && b === 254 ||
    a === 172 && b >= 16 && b < 32 || a === 192 && (b === 168 || b === 0 && c <= 2 || b === 88 && c === 99) ||
    a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113)
}

async function download(url: URL, max: number, allowed: RegExp, signal: AbortSignal, partial: boolean): Promise<Buffer | URL> {
  signal.throwIfAborted()
  const resolver = new Resolver({ timeout: 1500, tries: 1 })
  const results = await resolver.resolve4(url.hostname)
  if (!results.length || results.some(address => !publicIPv4(address))) throw new Error('Public address required')
  return new Promise<Buffer | URL>((resolve, reject) => {
    const req = request(url, {
      family: 4, agent: false, signal,
      lookup: (_host, _options, callback) => callback(null, results[0], 4),
      headers: { Accept: allowed.source.startsWith('^image') ? 'image/png,image/jpeg,image/webp' : 'text/html' },
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode ?? 0) && res.headers.location) {
        res.destroy()
        try { return resolve(productAddress(new URL(res.headers.location,url).href)) }
        catch (error) { return reject(error) }
      }
      if (res.statusCode !== 200 || !allowed.test(res.headers['content-type'] ?? '') || !partial && Number(res.headers['content-length']) > max) {
        res.destroy()
        return reject(new Error('Content unavailable'))
      }
      const parts: Buffer[] = []
      let size = 0
      res.on('data', (part: Buffer) => {
        if (size + part.length > max) {
          if (partial) {
            parts.push(part.subarray(0,max-size))
            resolve(Buffer.concat(parts))
          } else reject(new Error('Content too large'))
          res.destroy()
        } else {
          parts.push(part)
          size += part.length
        }
      })
      res.on('error', reject)
      res.on('end', () => resolve(Buffer.concat(parts)))
    })
    req.on('error', reject)
    req.end()
  })
}

const entities: Record<string,string> = { amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ' }
function decode(value: string) {
  return value.replace(/&(#x[a-f0-9]+|#\d+|[a-z]+);/giu, (original, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? original
    const code = /^#x/iu.test(entity) ? parseInt(entity.slice(2),16) : Number(entity.slice(1))
    return code > 31 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
  })
}

function readProductMeta(html: string) {
  const meta = new Map<string,string>()
  for (const tag of html.matchAll(/<meta\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/giu)) {
    const attrs = new Map<string,string>()
    for (const [,key,double,single,bare] of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+))/gu)) {
      attrs.set(key.toLowerCase(),double ?? single ?? bare)
    }
    const key = attrs.get('property') ?? attrs.get('name')
    const content = attrs.get('content')
    if (key && content && !meta.has(key.toLowerCase())) meta.set(key.toLowerCase(), decode(content))
  }
  return meta
}

export function productMetadata(html:string,url:URL,meta=readProductMeta(html)) {
  const name = (meta.get('og:title') ?? decode(html.match(/<title\b[^>]*>([^<]*)<\/title\s*>/iu)?.[1] ?? ''))
    .replace(/[\s\u0000-\u001f\u007f]+/gu,' ').trim().slice(0,120)
  let image: string | null = null
  const raw = meta.get('og:image:secure_url') ?? meta.get('og:image')
  if (raw) {
    try { image = productAddress(new URL(raw,url).toString()).href } catch { /* Main form stays editable. */ }
  }
  return { name, image, source: url.href }
}

function structuredProduct(html: string): Record<string,unknown> | undefined {
  const products:Record<string,unknown>[]=[]
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/giu)) {
    try {
      const parsed = JSON.parse(match[1])
      for (const entry of Array.isArray(parsed) ? parsed.slice(0,40) : [parsed]) {
        const nodes = Array.isArray(entry?.['@graph']) ? entry['@graph'].slice(0,80) : [entry]
        for (const node of nodes) {
          if (node && [].concat(node['@type']).some(type=>type==='Product'||type==='ProductGroup')) products.push(node)
        }
      }
    } catch { /* Continue with metadata from the page. */ }
  }
  const first=products[0]
  if (!first) return
  const group = products.find(product=>Array.isArray(product.hasVariant) && product.hasVariant.length)
  if (!group || first!==group && !first.isVariantOf) return first
  const expand = (value:unknown) => {
    if (!value || typeof value!=='object' || !Reflect.has(value,'@id')) return value
    return products.find(product=>product!==group && product['@id']===Reflect.get(value,'@id')) ?? value
  }
  return {...group,hasVariant:(group.hasVariant as unknown[]).map(expand)}
}

function textField(value: unknown, maximum: number) {
  return typeof value === 'string' ? decode(value).replace(/<[^>]*>/gu,' ').replace(/[\s\x00-\x1f\x7f]+/gu,' ').trim().slice(0,maximum) : ''
}

function productSize(value: unknown) {
  return textField(value && typeof value==='object' ? Reflect.get(value,'name') ?? Reflect.get(value,'value') : value,40)
}

function productVariantAddress(value: unknown, base: URL) {
  try { return typeof value==='string' ? productAddress(new URL(decode(value),base).href).href : '' }
  catch { return '' }
}

/**
 * Uniqlo liefert als Seitenbild immer die Standardfarbe. Die Farbliste (displayCode + Name) und das
 * Bild je Farbe (eugoods_<Farbcode>_<Artikel>) stehen aber in der Seite. Die Farbe aus dem Link
 * (colorDisplayCode) oder die gewählte Farbe bestimmt das Bild.
 */
export function uniqloVariants(html:string,url:URL,selectedColor='') {
  if (!/(?:^|\.)uniqlo\.com$/iu.test(url.hostname)) return
  const item=/eugoods_\d{2}_(\d{6})/u.exec(html)?.[1]
  if (!item) return
  const base=new RegExp('(https://[^"\'\\s]+/)eugoods_\\d{2}_'+item,'u').exec(html)?.[1] ?? `https://image.uniqlo.com/UQ/ST3/eu/imagesgoods/${item}/item/`
  const pictured=new Set([...html.matchAll(new RegExp('eugoods_(\\d{2})_'+item,'gu'))].map(match=>match[1]))
  const colors:{code:string,name:string}[]=[]
  for (const [,code,raw] of html.matchAll(/"displayCode":"(\d{2})","name":"([^"]{2,30})"/gu)) {
    if (!pictured.has(code) || colors.some(color=>color.code===code)) continue
    const name=raw.toLocaleLowerCase('de-DE').replace(/(^|[\s-])\p{L}/gu,letter=>letter.toLocaleUpperCase('de-DE'))
    colors.push({code,name})
  }
  if (!colors.length) return
  const linked=url.searchParams.get('colorDisplayCode') ?? url.searchParams.get('colordisplaycode') ?? ''
  const chosen=colors.find(color=>color.name.localeCompare(selectedColor,'de',{sensitivity:'base'})===0) ??
    (selectedColor ? undefined : colors.find(color=>color.code===linked))
  const image=chosen ? base+`eugoods_${chosen.code}_${item}_3x4.jpg` : undefined
  return {colors:colors.map(color=>color.name),color:chosen?.name??'',image}
}

export function completeProductMetadata(html: string, url: URL, selectedColor = '', originalUrl = url) {
  const uniqlo=uniqloVariants(html,originalUrl,selectedColor)
  if (uniqlo) {
    const base=completeProductMetadataGeneric(html,url,'',originalUrl)
    const images=uniqlo.image ? [uniqlo.image] : []
    return {...base,colors:uniqlo.colors,image:images[0]??null,images,
      draft:{...base.draft,...(uniqlo.color ? {color:uniqlo.color} : {color:''})}}
  }
  return completeProductMetadataGeneric(html,url,selectedColor,originalUrl)
}

function completeProductMetadataGeneric(html: string, url: URL, selectedColor = '', originalUrl = url) {
  const meta=readProductMeta(html)
  const og = productMetadata(html,url,meta)
  const root = structuredProduct(html)
  const variants = (Array.isArray(root?.hasVariant) ? root.hasVariant.slice(0,350) : []).filter(
    (entry):entry is Record<string,unknown>=>Boolean(entry && typeof entry==='object' && !Array.isArray(entry)))
    .map(product=>{
      const offer=Array.isArray(product.offers) ? product.offers[0] : product.offers
      const offerUrl=offer && typeof offer==='object' ? Reflect.get(offer,'url') : undefined
      return {product,color:textField(product.color,100),size:productSize(product.size),
        address:productVariantAddress(product.url || offerUrl,url),sku:textField(product.sku,100)}
    })
  const unique = (values:string[]) => [...new Set(values.filter(Boolean))]
  const rootColor = textField(root?.color ?? meta.get('product:color'),100)
  const colors = unique([rootColor,...variants.map(variant=>variant.color)])
  const params = new Map([...originalUrl.searchParams].map(([key,value])=>[key.toLowerCase(),value.trim()]))
  const identified = variants.filter(variant=>Boolean(variant.sku && [params.get('sku'),params.get('variant')].includes(variant.sku)))
  const exact = identified.length ? identified : variants.filter(variant=>{
    if (!variant.address) return false
    const linked=new URL(variant.address)
    if (linked.origin+linked.pathname!==originalUrl.origin+originalUrl.pathname) return false
    if (!linked.search) return linked.href===originalUrl.href
    return [...linked.searchParams].every(([key,value])=>originalUrl.searchParams.getAll(key).includes(value))
  })
  const paramOption = (options:string[], keys:string[]) => {
    const value = keys.map(key=>params.get(key)).find(Boolean)
    return value ? options.find(option=>option.localeCompare(value,'de',{sensitivity:'accent'})===0) : undefined
  }
  const exactColors = unique(exact.map(variant=>variant.color))
  const linkedColor = paramOption(colors,['color','colour','farbe','colordisplaycode']) ||
    (exactColors.length===1 ? exactColors[0] : '') || rootColor
  const titleColor=textProductColor(textField(root?.name,120)||og.name)
  const matchingColors=colors.filter(value=>textProductColor(value)===titleColor && Boolean(titleColor))
  const color = selectedColor || linkedColor || (matchingColors.length===1 ? matchingColors[0] : '') || (colors.length===1 ? colors[0] : '')
  const byColor = variants.filter(variant=>!color || variant.color===color)
  const rootSize = !color || !rootColor || color===rootColor ? productSize(root?.size ?? meta.get('product:size')) : ''
  const sizes = unique([...byColor.map(variant=>variant.size),rootSize])
  const exactSizes = unique(exact.filter(variant=>!color || variant.color===color).map(variant=>variant.size))
  // A list of variants with one common page URL does not identify a size.
  const explicitSize = paramOption(sizes,['size','groesse','size_display','sizedisplaycode']) ||
    (exactSizes.length===1 && exact.length===1 ? exactSizes[0] : '') || rootSize
  const size = explicitSize || (sizes.length===1 ? sizes[0] : '')
  const product = (color ? byColor.find(variant=>variant.size===size) ?? byColor[0] : undefined)?.product ?? root
  const name = (textField(root?.name,120) || textField(product?.name,120) || og.name).split(/\s+\|\s+/u,1)[0].trim()
  const propertyLabel = (label: string) => {
    // The only label arguments are fixed product property names.
    const marker = new RegExp(`(?:^|>)\\s*${label}\\s*:`, 'iu').exec(html) // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
    if (!marker) return ''
    return textField(html.slice(marker.index+marker[0].length,marker.index+marker[0].length+260)
      .replace(/^[\s]*(?:<[^>]*>\s*)*/u,'').split('<',1)[0],100)
  }
  const reportedColor = color || propertyLabel('Farbe')
  const material = textField(product?.material ?? root?.material,120) || propertyLabel('Hauptmaterial')
  const fit = textField(product?.fit ?? root?.fit,70) || propertyLabel('Passform').slice(0,70)
  const images: string[] = []
  const variantsToShow = color ? byColor.map(variant=>variant.product.image) : []
  const pageImages = !color || color===linkedColor || colors.length===1 ? [root?.image,og.image] : []
  for (const entry of [...variantsToShow,...pageImages].flat().slice(0,80)) {
    const photo = typeof entry === 'object' && entry ? Reflect.get(entry,'contentUrl') ?? Reflect.get(entry,'url') : entry
    const address = productVariantAddress(photo,url)
    if (address && !images.includes(address)) images.push(address)
  }
  const description=textField(product?.description,1400)||textField(root?.description,1400)||textField(meta.get('description')??meta.get('og:description'),1400)
  const fragranceHeading=/<h[2-4]\b[^>]*>\s*(?:Duftnoten|Fragrance Notes)\s*<\/h[2-4]>/iu.exec(html)
  const fragranceNotes=fragranceHeading ? textField(html.slice(fragranceHeading.index+fragranceHeading[0].length,
    fragranceHeading.index+fragranceHeading[0].length+6000).split(/<h[2-4]\b/iu,1)[0],600) : ''
  const brandValue=product?.brand ?? root?.brand ?? meta.get('product:brand')
  const brand=textField(typeof brandValue==='object' && brandValue ? Reflect.get(brandValue,'name') : brandValue,70)
  const retailer=textField(meta.get('og:site_name'),100) || url.hostname.replace(/^www\./iu,'').slice(0,100)
  return { name, image:images[0] ?? null, images, colors, sizes, description, fragranceNotes, brand, structured:Boolean(root), source:og.source,
    draft: productWardrobeFields(name,description,'',{
      ...(reportedColor && {color:reportedColor}), ...(material && {material}), ...(fit && {fit}), ...(brand && {brand}),
      ...(size && {size}), retailer, source:og.source,
    }) }
}

async function downloadWithCurl(url:URL,max:number,allowed:RegExp,signal:AbortSignal):Promise<Buffer|URL> {
  const target:string[]=[]
  // The fixed search service can use its system-selected IPv6 or IPv4 edge.
  // Retailer and image URLs still require a validated, pinned public address.
  if (url.hostname!=='search.brave.com') {
    const resolver=new Resolver({timeout:1500,tries:1})
    const addresses=await resolver.resolve4(url.hostname)
    if (!addresses.length || addresses.some(ip=>!publicIPv4(ip))) throw new Error('Public address required')
    target.push('--resolve',url.hostname+':443:'+addresses[0])
  }
  const {stdout}=await execute('/usr/bin/curl',['--disable','--globoff','--silent','--show-error','--noproxy','*',
    '--proto','=https','--max-time','6','--max-filesize',String(max),...target,
    '--write-out','\n%{http_code}\t%{content_type}\t%{redirect_url}','--url',url.href],
    {encoding:'buffer',maxBuffer:max+4096,signal})
  const split=stdout.lastIndexOf(10)
  const [status,type,redirect]=stdout.toString('utf8',split+1).split('\t')
  if (['301','302','303','307','308'].includes(status) && redirect) return productAddress(redirect)
  if (status!=='200' || !allowed.test(type) || split<0 || split>max) throw new Error('Content unavailable')
  return stdout.subarray(0,split)
}

let remoteJobs = 0
async function boundedDownload(url: URL, max: number, type: RegExp, partial = false, useCurl=false) {
  if (remoteJobs >= 3) throw new Problem(429,'Der Produktimport ist beschäftigt. Versuche es gleich erneut.')
  remoteJobs++
  try {
    const signal = AbortSignal.timeout(6500)
    for (let redirects=0; redirects<=2; redirects++) {
      const result = await (useCurl ? downloadWithCurl(url,max,type,signal) : download(url,max,type,signal,partial))
      if (Buffer.isBuffer(result)) return { bytes:result, address:url }
      url = result
    }
    throw Error('Too many redirects')
  } finally { remoteJobs-- }
}

export async function publicRecipeHtml(address:string){
  const result=await boundedDownload(productAddress(address),3*1024*1024,/^text\/html\b/iu,false,true)
  return {html:result.bytes.toString('utf8'),url:result.address}
}

function linkedProduct(url:URL) {
  const parts=url.pathname.split('/').reverse()
  let name=''
  for (const part of parts) {
    let words:string
    try { words=decodeURIComponent(part).replace(/\.html?$/iu,'').replace(/[-_]+/gu,' ').trim() } catch { continue }
    if (words.includes(' ') && outfitGarment(words)) {
      name=words.slice(0,120).replace(/\b\p{L}/gu,letter=>letter.toLocaleUpperCase('de'))
      break
    }
  }
  const sku=/^\/(?:[^/]+\/)*p\/(\d{8})\/?$/u.exec(url.pathname)?.[1]
  const martens=Boolean(sku && /^(?:www\.)?drmartens\.com$/u.test(url.hostname))
  const images=martens ? [`https://cdn.media.amplience.net/i/drmartens/NX_${sku}.80?fmt=jpg&w=800`] : []
  const brand=martens?'Dr. Martens':''
  return { name, image:images[0]??null, images, colors:[], sizes:[], description:'', fragranceNotes:'', brand,
    structured:false, source:url.href, draft:productWardrobeFields(name,'','',{source:url.href,...(brand&&{brand})}) }
}

// Gesperrte Shopseiten (etwa Zara, Bershka): Produktbild über die Bildersuche, nur Treffer derselben Shop-Domain.
async function shopImageSearch(product:ReturnType<typeof linkedProduct>,url:URL) {
  if (!product.name) return product
  const shop=url.hostname.replace(/^www\./iu,'').split('.').slice(-2).join('.')
  const brand=shop.split('.')[0]
  try {
    // Seite und Bild müssen zum Shop gehören (etwa zara.com und static.zara.net), sonst droht ein fremdes Foto.
    const hits=(await searchProductImages(product.name+' '+brand)).filter(hit=>{
      const host=new URL(hit.source).hostname
      const imageHost=new URL(hit.image).hostname
      return (host===shop || host.endsWith('.'+shop)) && imageHost.split('.').includes(brand)
    })
    const images=hits.map(hit=>hit.image).filter(image=>!/transparent|placeholder|logo/iu.test(image)).slice(0,4)
    return images.length ? {...product,image:images[0],images,imageFromSearch:true} : product
  } catch { return product }
}

export async function inspectProduct(raw: unknown, color?:string,useCurl=false) {
  const url = productAddress(raw,8192)
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|gclid$|gbraid$|wbraid$|gad_|fbclid$|msclkid$|srsltid$)/iu.test(key)) url.searchParams.delete(key)
  }
  if (url.href.length > 500) throw new Problem(400,'Der Produktlink ist zu lang.')
  try {
    const result = await boundedDownload(url,3*1024*1024,/^text\/html\b/iu,true,useCurl)
    const metadata = completeProductMetadata(result.bytes.toString('utf8'),result.address,color,url)
    // Platzhalter wie ein transparentes Hintergrundbild sind kein Produktfoto.
    const placeholder=(image:string)=>/transparent|placeholder|blank|spacer|logo|default[-_]?image|no[-_]?image/iu.test(image)
    metadata.images=metadata.images.filter(image=>!placeholder(image))
    metadata.image=metadata.images[0] ?? null
    if (color && !metadata.colors.includes(color)) throw new Problem(400,'Diese Farbvariante konnte nicht bestätigt werden.')
    if (!metadata.structured && !metadata.colors.length && (!metadata.name || /access denied|just a moment|zugriff verweigert|captcha/iu.test(metadata.name) || !metadata.image)) {
      const linked=linkedProduct(url)
      return linked.image ? linked : shopImageSearch(metadata.name&&!/access denied|just a moment/iu.test(metadata.name)?{...linked,name:metadata.name}:linked,url)
    }
    return { ...metadata, source:url.href, draft:{...metadata.draft,source:url.href} }
  } catch (error) {
    if (error instanceof Problem) throw error
    const linked=linkedProduct(url)
    return linked.image ? linked : shopImageSearch(linked,url)
  }
}

export async function importProductPhoto(raw: unknown,useCurl=false) {
  const url = productAddress(raw)
  let bytes: Buffer
  try { bytes = (await boundedDownload(url,photoLimit,/^image\/(?:png|jpeg|webp)\b/iu,false,useCurl)).bytes }
  catch (error) { if (error instanceof Problem) throw error; throw new Problem(422,'Das Produktbild ist nicht abrufbar. Du kannst ein eigenes Foto hochladen.') }
  return bytes
}

export function productSearchLinks(html: string) {
  const links = new Set<string>()
  const perHost = new Map<string,number>()
  for (const match of html.matchAll(/<a\b[^>]*>/giu)) {
    const tag = match[0]
    const classes = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/iu.exec(tag)
    const css=(classes?.[1] ?? classes?.[2])?.split(/\s+/u) ?? []
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/iu.exec(tag)
    if (!href) continue
    try {
      const raw=decode(href[1] ?? href[2])
      const link = new URL(raw,'https://search.brave.com')
      const resultLink=css.includes('enrichment-card-item') || css.includes('snippet-url') ||
        /^https:\/\//iu.test(raw) && /\btarget=["']_(?:self|blank)["']/iu.test(tag)
      if (!resultLink || /(?:^|\.)(?:brave\.com|brave\.app)$/iu.test(link.hostname)) continue
      const address = productAddress(link.href)
      if (address.href.length>500 || address.pathname==='/' || links.has(address.href)) continue
      const host=address.hostname.replace(/^www\./u,'')
      const count=perHost.get(host) ?? 0
      if (count>=2) continue
      links.add(address.href)
      perHost.set(host,count+1)
    } catch { /* Skip unusable search results. */ }
    if (links.size >= 8) break
  }
  return [...links]
}

async function searchResultDestinations(html:string) {
  const paths=[...new Set([...html.matchAll(/<a\s+href="(\/go\/v1\/[a-z\d_-]{40,750})"\s+target="_self"/giu)].map(match=>match[1]))].slice(0,8)
  const destinations:string[]=[]
  for (let offset=0;offset<paths.length;offset+=3) {
    const group=await Promise.all(paths.slice(offset,offset+3).map(async path=>{
      try {
        const url=new URL(path,'https://search.brave.com')
        const result=await downloadWithCurl(url,128*1024,/^text\/html\b/iu,AbortSignal.timeout(3500))
        const address=result instanceof URL ? result : productAddress(decode(result.toString('utf8')
          .match(/<a\s+class="destination\s+[^"]*"\s+href="([^"]+)"/iu)?.[1]??''))
        if (!/(?:^|\.)brave\.com$/iu.test(address.hostname) && address.pathname!=='/') return address.href
      } catch { /* Continue with the remaining public results. */ }
    }))
    for (const address of group) if (address && !destinations.includes(address)) destinations.push(address)
  }
  return destinations
}

export async function searchProductPages(raw: unknown, resolveDestinations=false) {
  if (typeof raw !== 'string' || raw.trim().length < 3 || raw.length > 420 || /[\x00-\x1f\x7f]/u.test(raw)) {
    throw new Problem(400,'Gib einen Kleidungsnamen oder einen kurzen Suchhinweis ein.')
  }
  const address = new URL('https://search.brave.com/search')
  address.searchParams.set('q',raw.trim())
  if (remoteJobs>=3) throw new Problem(429,'Die Produktsuche ist gerade beschäftigt. Versuche es gleich erneut.')
  remoteJobs++
  try {
    let html:string
    try {
      const result=await downloadWithCurl(address,1024*1024,/^text\/html\b/iu,AbortSignal.timeout(8500))
      if (result instanceof URL) throw new Error('Unexpected search redirect')
      html=result.toString('utf8')
    } catch {
      throw new Problem(503,'Die Produktsuche ist gerade nicht erreichbar. Du kannst einen Produktlink einfügen.')
    }
    if (/anomaly-modal|challenge-form/u.test(html)) throw new Problem(503,'Die Internetsuche ist vorübergehend blockiert. Du kannst einen Produktlink einfügen.')
    const direct=productSearchLinks(html)
    return resolveDestinations ? [...new Set([...(await searchResultDestinations(html)),...direct])].slice(0,8) : direct
  } finally {remoteJobs--}
}

export function productImageResults(html:string) {
  const values:{name:string,source:string,image:string}[]=[]
  const seen=new Set<string>()
  const encoded=String.raw`"(?:[^"\\]|\\.)*"`
  const images=new RegExp(String.raw`\{title:(${encoded}),url:(${encoded}),is_source_local:.{0,5000}?thumbnail:\{src:${encoded},.{0,600}?original:(${encoded})`,'gsu')
  for (const [,title,page,original] of html.matchAll(images)) {
    try {
      const name=textField(JSON.parse(title),120)
      const source=productAddress(JSON.parse(page)).href
      const image=productAddress(JSON.parse(original)).href
      if (!name || source.length>500 || seen.has(image)) continue
      seen.add(image)
      values.push({name,source,image})
      if (values.length>=24) break
    } catch { /* Skip results without usable public addresses. */ }
  }
  return values
}

export async function searchProductImages(query:string) {
  if (remoteJobs>=3) throw new Problem(429,'Die Produktsuche ist gerade beschäftigt. Versuche es gleich erneut.')
  remoteJobs++
  try {
    const address=new URL('https://search.brave.com/images')
    address.searchParams.set('q',query)
    const result=await downloadWithCurl(address,2*1024*1024,/^text\/html\b/iu,AbortSignal.timeout(8500))
    return Buffer.isBuffer(result) ? productImageResults(result.toString('utf8')) : []
  } finally {remoteJobs--}
}

export async function searchFragranceDirectory(query:string) {
  const page=new URL('https://www.parfumo.de/search')
  page.searchParams.set('filter',query)
  const {bytes}=await boundedDownload(page,1024*1024,/^text\/html\b/iu,false,true)
  const links=new Set<string>()
  for (const [,value] of bytes.toString('utf8').matchAll(/\bhref="(https:\/\/www\.parfumo\.de\/Parfums\/[^"/?#]+\/[^"?#]+)"/giu)) {
    try { links.add(productAddress(decode(value)).href) } catch { /* Skip unusable catalogue links. */ }
    if (links.size>=16) break
  }
  return [...links]
}
