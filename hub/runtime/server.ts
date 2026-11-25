import type {Result} from '../../agents/lifepilot/tools/validate.ts'
import {researchPantryRecipes} from '../connectors/recipe-web.ts'
import {localRecipePreference,recipeRequest} from './recipe-preferences.ts'
import {taskBoardFromChat} from './tasks-board-chat.ts'
import {changeBoardSource,taskBoard} from './tasks-board.ts'
import type {CalendarWindow,ExternalConflicts} from './calendar-conflicts.ts'
import {projectFromChat} from './project-chat.ts'
import {applyProjectChange,manualProjectPlan,prepareProjectChange,prepareProjectEditor,projectOverview} from './projects.ts'
import {decideProjectMail} from './project-mail.ts'
import {extendReminders,holidayRegion} from './calendar-series.ts'
import {honorSeriesPeriod,seriesFromChat} from './calendar-series-chat.ts'
import {publicHoliday,travelDays} from './trip-windows.ts'
import {approveLectureCancellation,inboxWithLectureTargets} from './university-calendar.ts'
import {MAX_CHAT_BODY_BYTES,MAX_CHAT_INPUT} from './model-payload.ts'
import { addTravelWardrobeItem, changeResale, fragranceList, fragrancePhoto, updateFragranceTags, resaleList, saveFragrance, saveTravelWardrobe, travelWardrobe } from './wardrobe-extras.ts'
import { researchFragrance, normalizedFragranceQuery } from './fragrance-research.ts'
import type { FragranceDraft } from './wardrobe-extras-types.ts'
import type { WardrobeDraft } from './outfit-types.ts'
import { bookOrderFinance,clothingOrders, changeClothingOrder, clothingPhotoTargets,orderItemPhoto,scanClothingOrders, updateClothingTask } from './clothing-orders.ts'
import { transcribeDictation, maxDictationBytes } from '../connectors/local-dictation.ts'
import { validRecipeServings } from './recipe-portions.ts'
import { acceptGroceryRows, adoptGrocery, checkout, checkGrocery, groceryAnswer, groceryIdeas, groceryOverview, normalizeGrocery, putGrocery, removeGrocery, listRecipes, saveRecipe, checkRecipe, removeRecipe, updateRecipePortions } from './grocery.ts'
import { scanGroceries } from './grocery-scan.ts'
import { decideMailFinance, pendingMailFinances } from './mail-finance.ts'
import { confirmedMailAccount, enableMailCategorization, mailAccountKey, syncCategorizedMail } from './mail-sync.ts'
import { deleteFinance, financeMonth, financeOverview, saveFinance, saveFinanceSettings } from './finance.ts'
import { personalProfile, savePersonalProfile } from './personal-profile.ts'
import { createTripGuide } from './trip-guide.ts'
import { previewTripChange, decideTripChange } from './trip-chat-change.ts'
import { trips, trip, previewTrip, chatTripPreview, generateTripPreview, saveTrip, changeTrip, tripDateChange, readTripPreview, removeSavedTrip } from './trips.ts'
import { travelWindows } from './trip-windows.ts'
import { tripCalendarTitle } from './trip-types.ts'
import {searchTripAddresses,searchTripPlaces} from '../connectors/trip-places.ts'
import { fetchOutfitWeather, outfitLocation } from '../connectors/outfit-weather.ts'
import { outfitGarment, productWardrobeFields, textProductColor } from './outfit-fields.ts'
import { matchProductPhoto } from './outfit-catalog.ts'
import { analyzeOutfitPhoto, prepareFullOutfitPhoto } from '../connectors/outfit-vision.ts'
import { OutfitStudio, outfitOverview, saveWardrobe, saveStyle, attachOutfitPhoto, outfitPhoto, removeOutfitData, lookPhoto, saveLookPhoto, removeLookPhoto, assignLookPieces } from './outfits.ts'
import { inspectProduct, importProductPhoto, searchProductImages, searchProductPages, photoMime, uploadOutfitPhoto, outfitUploadLimit } from '../connectors/outfit-import.ts'
import { createServer as createSocketServer } from 'node:net'
import { adapterToken, prepareAdapterSocket } from './local-adapter.ts'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash, randomBytes, timingSafeEqual, randomUUID } from 'node:crypto'
import { chmodSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { acceptance, audit, chatMode, cloudModel, data, fixtures, host, MAX_INPUT, MODEL_MS, nightbot, origin, port, Problem, root, secretPath, probeSecretPath, version } from './settings.ts'
import { Store, type Channel } from './store.ts'
import { connectors } from '../connectors/catalog.ts'
import { GoogleConnector, googleService } from '../connectors/google.ts'
import { MacCalendar, macCalendarBridge } from '../connectors/mac-calendar.ts'
import { analyzeCodexImage } from '../adapters/codex-image.ts'
import { runCodex } from '../adapters/codex.ts'
import { berlinInstant } from '../../agents/lifepilot/tools/validate.ts'
import type { TaskPatch, Step } from './workspace.ts'
import { bounded, dateInBerlin, isDate, mondayOf, shiftDay } from './values.ts'
import { applicationHistory, applicationOverview, denyApplicationSource, saveApplication, scanApplicationMails } from './applications.ts'
import { uploadApplicationImage, uploadChatDocument } from '../connectors/application-ocr.ts'
import { finishAppointmentChange, googleLifePilotCalendar, queueAppointmentChange, syncApprovedAppointment } from './google-appointment.ts'
import { refreshInbox, planRefreshedInbox, readInboxFeed } from './refresh-inbox.ts'
import { scanInbox, decideInbox, inboxProposal, clothingDemoMail,mailDemoFixtures, readGmailPage } from './inbox.ts'
import { classifyMail, mailCategoryNames, type MailClassificationCategory } from '../../agents/lifepilot/tools/classify-mail.ts'
import { explicitCategory, isCategory, suggestCategory } from './categories.ts'
import { availability, validateFreeQuery } from './availability.ts'

process.umask(0o077)
const assets = new Map([
  ['/', { file: 'hub/ui/index.html', type: 'text/html; charset=utf-8' }],
  ['/app.css', { file: 'hub/ui/app.css', type: 'text/css; charset=utf-8' }],
  ['/app.js', { file: 'dist/app.js', type: 'text/javascript; charset=utf-8' }],
])
const manifest = JSON.parse(readFileSync(join(root, 'agents/lifepilot/manifest.json'), 'utf8'))
const google = new GoogleConnector(data, origin)
const outfits = new OutfitStudio()
const tripCalendarJobs = new Set<string>()
const preparedPhotos = new Map<string,{ photo:Buffer, expires:number, origin:'own'|'web', fragranceSource?:string }>()
function preparedPhoto(key: string) {
  const match = preparedPhotos.get(key)
  if (match && match.expires > Date.now()) return match.photo
  preparedPhotos.delete(key)
  throw new Problem(410,'Die Bildvorschau ist abgelaufen. Wähle die Quelle erneut.')
}
function stageOutfitPhoto(photo: Buffer, origin:'own'|'web'='own',fragranceSource?:string) {
  for (const [key,entry] of preparedPhotos) if (entry.expires <= Date.now()) preparedPhotos.delete(key)
  const oldest = preparedPhotos.keys().next()
  if (preparedPhotos.size >= 12 && !oldest.done) preparedPhotos.delete(oldest.value)
  const key = randomUUID()
  preparedPhotos.set(key,{photo,origin,fragranceSource,expires:Date.now()+10*60_000})
  return key
}
async function prepareProductImage(images:string[], deadline:number, useCurl=false, allowRetailerPhoto=false) {
  let retailerPhoto:Awaited<ReturnType<typeof analyzeOutfitPhoto>>|undefined
  const imageRank=(url:string)=> /packshot|flatlay|freisteller|still[-_]?life/iu.test(url)?0:
    /on[-_]?model|lifestyle|detail|close[-_]?up/iu.test(url)?2:1
  for (const address of [...new Set(images)].sort((a,b)=>imageRank(a)-imageRank(b)).slice(0,5)) {
    if (Date.now()>=deadline) break
    try {
      const result = await analyzeOutfitPhoto(await importProductPhoto(address,useCurl),true)
      if (result.personFree) return result
      if (allowRetailerPhoto) retailerPhoto ??= result
    } catch (error) {
      if (error instanceof Problem && error.status===429) throw error
    }
  }
  return retailerPhoto
}
const clothingPhotoJobs=new Map<string,Promise<{loaded:number}>>()
async function loadClothingPhotos(order:string) {
  const running=clothingPhotoJobs.get(order)
  if (running) return running
  if (clothingPhotoJobs.size>=2) throw new Problem(429,'Artikelbilder werden gerade vorbereitet.')
  const targets=clothingPhotoTargets(store,order).filter(target=>target.wardrobe ? !outfitPhoto(store,target.wardrobe) : !orderItemPhoto(store,target.id)).slice(0,8)
  const job=(async()=>{
    let loaded=0
    const deadline=Date.now()+45_000
    for (const target of targets) {
      if (Date.now()>=deadline) break
      let image=target.image ? await prepareProductImage([target.image],deadline,false,true) : undefined
      let product:Awaited<ReturnType<typeof inspectProduct>>|undefined
      if(!image && target.source && Date.now()<deadline) {
        product=await inspectProduct(target.source,target.draft.color||undefined).catch(()=>undefined)
        if(product?.name && (!target.draft.color || (product.draft as Partial<WardrobeDraft>).color?.toLowerCase()===target.draft.color.toLowerCase())) {
          image=await prepareProductImage(product.images,deadline)
        }
      }
      if(!image && !target.image && !target.source && target.draft.color && target.merchant==='Weekday' && Date.now()<deadline){
        const links=await searchProductPages('site:weekday.com '+target.draft.name.slice(0,120),true).catch(()=>[])
        for(const link of links.filter(value=>/(?:^|\.)weekday\.com$/iu.test(new URL(value).hostname)).slice(0,3)){
          if(Date.now()>=deadline) break
          const candidate=await inspectProduct(link,target.draft.color||undefined,true).catch(()=>undefined)
          if(candidate?.name.toLowerCase()!==target.draft.name.toLowerCase() ||
             !target.draft.color || (candidate.draft as Partial<WardrobeDraft>).color?.toLowerCase()!==target.draft.color.toLowerCase()) continue
          image=await prepareProductImage(candidate.images,deadline,true,true)
          if(image){product=candidate;break}
        }
      }
      // Kein Bild in der Mail und keine Produktseite: Bildersuche über Produktname bzw. -nummer.
      if(!image && Date.now()<deadline) {
        const query=[target.draft.brand,target.draft.name.slice(0,110),target.sku&&/\d{5,}/u.test(target.sku)?target.sku:'',target.merchant].filter(Boolean).join(' ')
        const hits=await searchProductImages(query).catch(()=>[])
        if(hits.length) image=await prepareProductImage(hits.slice(0,4).map(hit=>hit.image),deadline,true,true)
      }
      const saved=store.transaction(()=>{
        const item=store.db.prepare('SELECT wardrobe_id,decision,details FROM clothing_order_items WHERE id=?').get(target.id)
        if (!item) return false
        if (!target.wardrobe) {
          if (image) store.db.prepare('UPDATE clothing_order_items SET product_photo=coalesce(product_photo,?),image_checked=1 WHERE id=?').run(image.photo,target.id)
          else store.db.prepare('UPDATE clothing_order_items SET image_checked=1 WHERE id=?').run(target.id)
          return Boolean(image)
        }
        if (item.wardrobe_id!==target.wardrobe || item.decision==='returned') return false
        if (image && !outfitPhoto(store,target.wardrobe)) attachOutfitPhoto(store,target.wardrobe,image.photo,'image/png','web')
        if (product?.structured) {
          const details=JSON.parse(String(item.details)) as WardrobeDraft
          const fields:Partial<WardrobeDraft>=product.draft
          if (details.category===fields.category) {
            for (const key of ['brand','material','fit','garmentType'] as const) {
              const value=fields[key]
              if (value && !details[key]) details[key]=value
            }
            store.db.prepare(`UPDATE wardrobe_items SET brand=coalesce(nullif(brand,''),?),
              material=coalesce(nullif(material,''),?),fit=coalesce(nullif(fit,''),?),
              garment_type=coalesce(nullif(garment_type,''),?) WHERE id=?`)
              .run(details.brand??'',details.material??'',details.fit??'',details.garmentType??'',target.wardrobe)
            store.db.prepare('UPDATE clothing_order_items SET details=? WHERE id=?').run(JSON.stringify(details),target.id)
          }
        }
        store.db.prepare('UPDATE clothing_order_items SET image_checked=1 WHERE id=?').run(target.id)
        return Boolean(image)
      })
      if (saved) loaded++
    }
    return {loaded}
  })().finally(()=>clothingPhotoJobs.delete(order))
  clothingPhotoJobs.set(order,job)
  return job
}
function queueOrderPhotos(order?:string){
  if(acceptance || stopping || clothingPhotoJobs.size>=2) return
  const target=order ?? clothingOrders(store).find(row=>!clothingPhotoJobs.has(row.id) && row.items.some(item=>item.canLoadPhoto&&!item.hasPhoto))?.id
  if(target) void loadClothingPhotos(target).catch(()=>{})
}
let attentionFeed:ReturnType<typeof readInboxFeed>|undefined
async function runAutomaticMailSync() {
  if(acceptance || scanningInbox || stopping) return
  scanningInbox=true
  try {
    const synced = await syncCategorizedMail(store,google)
    if (synced) queueOrderPhotos()
  }
  catch (error) {
    if (!(error instanceof Problem && error.status===503)) console.warn('LifePilot-Mailabgleich pausiert.',error instanceof Problem ? error.status : '')
  } finally { scanningInbox=false }
}
const mailSyncTimer=setInterval(()=>void runAutomaticMailSync(),120_000)
mailSyncTimer.unref()
function refreshAttentionFeed() {
  if (!attentionFeed) attentionFeed=readInboxFeed(google,acceptance,store).then(feed=>{
    queueOrderPhotos()
    return feed
  }).finally(()=>{attentionFeed=undefined})
  return attentionFeed
}

const macCalendar = new MacCalendar(macCalendarBridge(join(root, 'dist/LifePilotCalendar.app')))
const sessionCookie = audit ? 'lifepilot_audit_session' : acceptance ? 'lifepilot_test_session' : nightbot ? 'lifepilot_nightbot_session' : 'lifepilot_session'
type Session = { expires: number, principal: 'owner' | 'trinity-probe' }
const tickets = new Map<string, Session>()
const sessions = new Map<string, Session>()
const token = () => randomBytes(32).toString('base64url')
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
let store: Store
let secret: Buffer
let probeSecret: Buffer | undefined
let active: { id: string, controller: AbortController } | undefined
let stopping = false
let readingChatDocument = false
let scanningInbox = false
const offlineMetrics = { wallMs: 0, model: null, usage: null, cost: null }

function reply(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}
function prune(entries: Map<string, Session>) {
  for (const [key, entry] of entries) if (entry.expires <= Date.now()) entries.delete(key)
}
function identity(req: IncomingMessage): { channel: Channel, principal: Session['principal'] } {
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) {
    const provided = Buffer.from(auth.slice(7))
    if (!req.headers.origin) {
      if (provided.length === secret.length && timingSafeEqual(provided, secret)) return { channel: 'cli', principal: 'owner' }
      if (probeSecret && provided.length === probeSecret.length && timingSafeEqual(provided, probeSecret)) return { channel: 'cli', principal: 'trinity-probe' }
    }
    throw new Problem(401, 'CLI-Zugriff verweigert.')
  }
  const cookie = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${sessionCookie}=`))
  const id = cookie?.slice(sessionCookie.length + 1)
  const session = id ? sessions.get(id) : undefined
  if (session && session.expires > Date.now()) return { channel: 'ui', principal: session.principal }
  throw new Problem(401, 'Öffne LifePilot mit dem lokalen Adapter, um dich anzumelden.')
}

async function body(req: IncomingMessage, expected: string[], maxBytes = 32_768): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new Problem(415, 'JSON erforderlich.')
  const chunks: Buffer[] = []
  let received = 0
  if (Number(req.headers['content-length'] ?? 0) > maxBytes) throw new Problem(413, 'Eingabe zu groß.')
  for await (const chunk of req) {
    received += chunk.length
    if (received > maxBytes) throw new Problem(413, 'Eingabe zu groß.')
    chunks.push(chunk)
  }
  let value: unknown
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Problem(400, 'Ungültiges JSON.') }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !expected.includes(key))) {
    throw new Problem(400, 'Ungültige Felder für diese Aktion.')
  }
  return value as Record<string, unknown>
}

function field(value: unknown, limit: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000\u007f]/u.test(value)) {
    throw new Problem(400, `Text erforderlich, maximal ${limit} Zeichen.`)
  }
  return value.trim()
}
function id(value: unknown) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new Problem(400, 'Ungültige ID.')
  return value
}
function scope(value: unknown) {
  if (value === 'lifepilot' || value === 'owner' || (audit && value === 'trinity-probe')) return value
  throw new Problem(403, 'Dieser Memory-Bereich ist nicht freigegeben.')
}
function expiration(value: unknown) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value || Date.parse(value) <= Date.now()) {
    throw new Problem(400, 'Ungültiges Ablaufdatum.')
  }
  return value
}
function taskPatch(value: unknown): TaskPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Problem(400, 'Ungültige Änderungen.')
  const allowed = ['title', 'detail', 'due_date', 'priority', 'status', 'related_id', 'steps', 'category', 'project_id']
  const fields = value as Record<string, unknown>
  if (Object.keys(fields).some(key => !allowed.includes(key))) throw new Problem(400, 'Unbekannte Änderung.')
  if ('title' in fields && !bounded(fields.title, 120)) throw new Problem(400, 'Gültiger Titel erforderlich.')
  if ('detail' in fields) fields.detail = taskDetail(fields.detail)
  if ('due_date' in fields && fields.due_date !== null && !isDate(fields.due_date)) throw new Problem(400, 'Ungültiges Datum.')
  if ('priority' in fields && (typeof fields.priority !== 'string' || !['low', 'normal', 'high'].includes(fields.priority))) throw new Problem(400, 'Ungültige Priorität.')
  if ('status' in fields && (typeof fields.status !== 'string' || !['open', 'done', 'archived'].includes(fields.status))) throw new Problem(400, 'Ungültiger Status.')
  if ('category' in fields && fields.category !== null && !isCategory(fields.category)) throw new Problem(400, 'Ungültige Kategorie.')
  if ('project_id' in fields && fields.project_id !== null) id(fields.project_id)
  if ('related_id' in fields && fields.related_id !== null) id(fields.related_id)
  if ('steps' in fields && (!Array.isArray(fields.steps) || fields.steps.length > 12 ||
    fields.steps.some((step: Step) => !step || Object.keys(step).length !== 2 || !bounded(step.title, 120) || typeof step.done !== 'boolean'))) {
    throw new Problem(400, 'Ungültige Teilaufgaben.')
  }
  return fields as TaskPatch
}

function taskDetail(value: unknown) {
  return value === '' || value === undefined ? '' : field(value, 360)
}
function confirmCodexImage(requested: boolean) {
  if (requested && !cloudModel) throw new Problem(423, 'Die Bildanalyse über Codex ist in diesem Profil gesperrt.')
  return requested
}

function imageApproval(req: IncomingMessage) {
  const confirm = req.headers['x-lifepilot-confirm']
  confirmLocalChange(confirm === 'image' || confirm === 'codex-image')
  return confirmCodexImage(confirm === 'codex-image')
}

function confirmLocalChange(confirm: unknown) {
  if (confirm !== true) throw new Problem(403, 'Bestätige genau diese lokale Änderung.')
}
function localInstant(value: unknown) {
  try { return berlinInstant(field(value, 16)) }
  catch { throw new Problem(400, 'Ungültige oder mehrdeutige Ortszeit in Europe/Berlin.') }
}

function googleCalendarSources() {
  const target=googleLifePilotCalendar(store)
  const statuses=acceptance?[]:google.status()
  const sources:(string|undefined)[]=[]
  if(statuses.some(item=>item.service==='calendar'&&item.connected))sources.push(undefined)
  if(target&&target!=='pending'&&statuses.some(item=>item.service==='calendar-test'&&item.connected))sources.push(target)
  return sources
}

async function googleConflicts(windows:CalendarWindow[]):Promise<ExternalConflicts|undefined> {
  if(!windows.length)return
  const sources=googleCalendarSources()
  if(!sources.length)return
  const weeks=[...new Set(windows.map(window=>mondayOf(dateInBerlin(new Date(window.at)))))]
  const lookups=weeks.flatMap(week=>sources.map(source=>({week,source})))
  const synced=new Set(store.db.prepare(`SELECT event_id FROM google_appointment_sync WHERE event_id IS NOT NULL AND removed=0
    UNION SELECT event_id FROM trip_google_events WHERE event_id IS NOT NULL`).all().map(row=>row.event_id))
  const events=new Map<string,ExternalConflicts['windows'][number]>()
  let incomplete=false
  for(let offset=0;offset<lookups.length;offset+=6){
    const checked=await Promise.allSettled(lookups.slice(offset,offset+6).map(({week,source})=>
      google.calendarRange(berlinInstant(week+'T00:00'),berlinInstant(shiftDay(week,8)+'T00:00'),source)))
    for(const result of checked){
      if(result.status==='rejected'){incomplete=true;continue}
      if(result.value.limited)incomplete=true
      for(const event of result.value.events){
        if(synced.has(event.id)||event.allDay)continue
        const at=new Date(event.start).toISOString(),endsAt=new Date(event.end).toISOString()
        events.set(event.id,{id:event.id,title:event.title,at,endsAt})
      }
    }
  }
  return {windows:[...events.values()],incomplete}
}

function syncWorker() {
  if (active && store.run(active.id).state === 'cancelled') active.controller.abort()
}

function advisedPriority(input:string){
  const level=/\b(?:mit\s+)?(hoh(?:er|e)|mittler(?:er|e)|niedrig(?:er|e))\s+priorität\b|\bpriorität\s*[:=]?\s*(hoch|mittel|niedrig)\b/iu.exec(input)
  const value=(level?.[1]??level?.[2])?.toLowerCase()
  return value?.startsWith('ho')?'high' as const:value?.startsWith('niedrig')?'low' as const:value?'normal' as const:undefined
}

async function work() {
  if (chatMode === 'disabled' || stopping || active) return
  const next = store.next()
  if (!next) return
  if (next.agent !== manifest.id || next.version !== manifest.version || next.synthetic !== Number(chatMode === 'synthetic') || !isDate(next.reference_day) ||
    next.memory.some(entry => entry.synthetic !== 1 || !uuidPattern.test(entry.id) ||
      !['Bestätigt über Oberfläche', 'Bestätigt über CLI'].includes(entry.source))) {
    store.finish(next.id, null, 'Der Vorgang passt nicht zum freigegebenen Chatprofil.',
      { wallMs: 0, model: null, usage: null, cost: null })
    return
  }
  const controller = new AbortController()
  active = { id: next.id, controller }
  try {
    const latest=next.payload.messages.at(-1)?.input??''
    const previous=store.previousRecipePlan(next.id)
    const stated=localRecipePreference(latest)
    const refinement=previous&&Boolean(stated.include?.length||stated.side||stated.mode||stated.excluded.length)&&
      !/\b(?:plane|termin|kalender|kauf|bestell)\b/iu.test(latest)
    const wantsIdeas=recipeRequest(latest)||refinement
    const portions=Number(/\b(\d{1,2})\s+portion(?:en)?\b/iu.exec(latest)?.[1])
    const fallback:Result|null=wantsIdeas?{
      skill:'grocery' as const,tasks:[],questions:[],
      skillData:{groceryIntent:'ideas' as const,title:null,items:[],steps:[],totalCents:null,
        servings:validRecipeServings(portions)?portions:previous?.servings??1},
    }:null
    const recurring=projectFromChat(store,next.payload)??seriesFromChat(next.payload)??taskBoardFromChat(next.payload)
    const model=recurring ? {result:recurring,error:null,metrics:offlineMetrics} : cloudModel ?
      await runCodex(next.payload,controller.signal) : {result:fallback,error:null,metrics:offlineMetrics}
    const result=model.result??fallback
    const {error,metrics}=model
    if (!stopping) {
      const explicit=explicitCategory(latest)
      function categorize(proposal:NonNullable<typeof result>, part=false):NonNullable<typeof result> {
        if (proposal.parts?.length) return {...proposal,parts:proposal.parts.map(child=>categorize(child,true))}
        const tasks=proposal.tasks.map(task=>({...task,
          priority:task.priority??(proposal.tasks.length===1?advisedPriority(latest):undefined),
          category:explicitCategory(task.evidence) ?? (!part&&proposal.tasks.length===1?explicit:null) ?? suggestCategory(task.title,task.evidence) ??
            (/\bb2b\b/iu.test(task.title+' '+task.evidence) ? null : task.category ?? null)}))
        const unknown=tasks.find(task=>!task.category)
        return unknown ? {...proposal,tasks:[],actions:[],advice:[],summary:null,
          questions:[`Gehört „${unknown.title}“ zu Arbeit, Uni oder Freizeit?`,...proposal.questions].slice(0,8)}:
          {...proposal,tasks}
      }
      let categorized=result?categorize(recurring?result:honorSeriesPeriod(result,next.payload)):null
      const plan=categorized?.skillData
      let webRecipes:Awaited<ReturnType<typeof researchPantryRecipes>>=[]
      if(categorized?.skill==='grocery'&&plan&&'groceryIntent' in plan&&!categorized.questions.length&&
        (plan.groceryIntent==='ideas'||wantsIdeas&&plan.groceryIntent==='recipe')){
        const modelPreferences=plan.preferences
        const inherited=refinement?previous?.preferences:undefined
        const preference={
          ...inherited,...modelPreferences,
          excluded:[...new Set([...(inherited?.excluded??[]),...(modelPreferences?.excluded??[]),...stated.excluded])].slice(0,12),
          include:[...new Set([
            ...(/\b(?:statt|ersetz\w*)\b/iu.test(latest)?[]:inherited?.include??[]),
            ...(stated.include??modelPreferences?.include??[]),
          ])].slice(0,6),
          side:stated.side??modelPreferences?.side??inherited?.side,
          mode:stated.mode??modelPreferences?.mode??inherited?.mode,
          allergy:stated.allergy||modelPreferences?.allergy||inherited?.allergy||false,
        }
        if(preference.allergy&&!preference.excluded.length)
          categorized={...categorized,skillData:null,questions:['Welche Zutaten soll ich wegen der Allergie ausschließen?']}
        else{
          const sharePlan={...plan,groceryIntent:'ideas' as const,preferences:preference,
            servings:validRecipeServings(portions)?portions:plan.servings??1}
          categorized={...categorized,skillData:sharePlan}
          if(cloudModel)webRecipes=await researchPantryRecipes(groceryOverview(store).stock,preference,controller.signal)
        }
      }
      if(!controller.signal.aborted)store.finish(next.id,categorized,categorized?null:error??(cloudModel?'Für diesen Auftrag ist kein Entwurf verfügbar.':'Im Testprofil sind externe Modelle gesperrt. Für diesen Auftrag ist kein lokaler Entwurf verfügbar.'),metrics,webRecipes)
    }
  } catch {
    if (!stopping) store.finish(next.id, null, 'Der Modelladapter konnte nicht gestartet werden.', { wallMs: 0, model: null, usage: null, cost: null })
  } finally {
    active = undefined
  }
}

async function route(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
  if (req.headers.host !== host) throw new Problem(403, 'Host nicht erlaubt.')
  if (req.headers.origin && req.headers.origin !== origin) throw new Problem(403, 'Herkunft nicht erlaubt.')
  if (!req.url?.startsWith('/') || req.url.startsWith('//')) throw new Problem(400, 'Ungültiger Pfad.')
  const url = new URL(req.url, origin)
  const path = url.pathname
  const method = req.method
  if (method === 'GET' && path === '/oauth/google/callback') {
    if (acceptance) throw new Problem(403, 'Google ist nur im Hauptprofil verfügbar.')
    const linked = await google.complete(url.searchParams)
    res.writeHead(303, { Location: linked ? '/?view=google' : '/?view=google&google=cancelled' })
    return res.end()
  }
  const asset = method === 'GET' ? assets.get(path) : undefined
  if (asset) {
    res.writeHead(200, { 'Content-Type': asset.type })
    res.end(readFileSync(join(root, asset.file)))
    return
  }
  if (method === 'POST' && path === '/api/session') {
    if (req.headers.origin !== origin) throw new Problem(403, 'Herkunft erforderlich.')
    const { ticket } = await body(req, ['ticket'])
    prune(tickets)
    prune(sessions)
    const claim = typeof ticket === 'string' ? tickets.get(ticket) : undefined
    if (!claim || typeof ticket !== 'string') throw new Problem(401, 'Anmeldelink abgelaufen.')
    tickets.delete(ticket)
    const session = token()
    sessions.set(session, { expires: Date.now() + 12 * 3600_000, principal: claim.principal })
    res.setHeader('Set-Cookie', `${sessionCookie}=${session}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=43200`)
    return reply(res, 200, { ok: true })
  }
  if (method === 'GET' && path === '/favicon.ico') { res.writeHead(204); res.end(); return }
  if (!path.startsWith('/api/')) throw new Problem(404, 'Seite nicht gefunden.')
  const { channel: client, principal } = identity(req)
  if (principal === 'trinity-probe' && !(method === 'GET' && path === '/api/memory') &&
      !(method === 'POST' && path === '/api/ticket' && client === 'cli')) {
    throw new Problem(403, 'Der Prüfhelfer hat nur Lesezugriff auf seinen Memory-Bereich.')
  }
  if (method !== 'GET' && (method !== 'POST' || (client === 'ui' && req.headers.origin !== origin))) {
    throw new Problem(403, 'Aktion nicht erlaubt.')
  }
  if (path === '/api/grocery' && method === 'GET') return reply(res,200,groceryOverview(store))
  if (path === '/api/grocery/recipe' && method === 'GET') return reply(res,200,groceryAnswer(store,{
    groceryIntent:'ideas',title:null,items:[],steps:[],totalCents:null,
  }))
  if (path === '/api/grocery/scan' && method === 'POST') {
    const allowCodex=imageApproval(req)
    const photo=await uploadOutfitPhoto(req,outfitUploadLimit)
    const receipt=url.searchParams.get('kind')==='receipt'
    const result=await scanGroceries(photo,receipt,url.searchParams.get('kind')==='item',allowCodex)
    if (!receipt) return reply(res,200,result)
    const fingerprint=createHash('sha256').update(photo).digest('hex').slice(0,32)
    const operation=[fingerprint.slice(0,8),fingerprint.slice(8,12),fingerprint.slice(12,16),fingerprint.slice(16,20),fingerprint.slice(20)].join('-')
    return reply(res,200,{...result,operation})
  }
  if (path === '/api/grocery/recipes/ideas' && method === 'GET') {
    const servings=Number(url.searchParams.get('servings')??1)
    if(!validRecipeServings(servings))throw new Problem(400,'Wähle zwischen 1 und 24 Portionen.')
    return reply(res,200,groceryIdeas(store,undefined,undefined,servings))
  }
  if (path === '/api/grocery/recipes' && method === 'GET') return reply(res,200,listRecipes(store))
  if (path === '/api/grocery/recipes/decision' && method === 'POST') {
    const {run,turn,save,shop,cancelled,servings,option,confirm}=await body(req,['run','turn','save','shop','cancelled','servings','option','confirm'])
    confirmLocalChange(confirm)
    if(typeof turn!=='number'||!Number.isSafeInteger(turn)||turn<0||typeof save!=='boolean'||typeof shop!=='boolean'||
      typeof cancelled!=='boolean'||cancelled&&(save||shop)||!validRecipeServings(servings)||
      option!==undefined&&(typeof option!=='number'||!Number.isSafeInteger(option)||option<0||option>3))throw new Problem(400,'Ungültige Rezeptentscheidung.')
    return reply(res,200,store.decideRecipe(id(run),turn,{save,shop,cancelled,servings},client,option as number|undefined))
  }
  if (path === '/api/grocery/recipes' && method === 'POST') {
    const input=await body(req,['action','recipe','run','recipeId','part','index','checked','servings','quantities','confirm'])
    confirmLocalChange(input.confirm)
    return reply(res,200,store.transaction(()=>{
      if(input.action==='save') return saveRecipe(store,input.run===undefined?input.recipe:store.recipeFromRun(id(input.run)))
      if(input.action==='portions' && validRecipeServings(input.servings))
        return updateRecipePortions(store,id(input.recipeId),input.servings,input.quantities)
      if(input.action==='remove')return removeRecipe(store,id(input.recipeId))
      if(input.action==='check' && (input.part==='ingredients'||input.part==='steps') && typeof input.index==='number' && typeof input.checked==='boolean') {
        return checkRecipe(store,id(input.recipeId),input.part,input.index,input.checked)
      }
      throw new Problem(400,'Ungültige Rezeptaktion.')
    }))
  }
  if (path === '/api/grocery/change' && method === 'POST') {
    const input=await body(req,['action','place','item','draft','checked','items','receipt','operation','confirm'])
    confirmLocalChange(input.confirm)
    const result=store.transaction(()=>{
      if(input.action==='check' && typeof input.checked==='boolean') return checkGrocery(store,id(input.item),input.checked)
      if(input.action==='checkout' && Array.isArray(input.items) && input.items.length<=500) return checkout(store,input.items.map(id))
      if(input.action==='ingredients' && Array.isArray(input.items) && input.items.length>0 && input.items.length<=30 && typeof input.draft==='string' && bounded(input.draft,120)) {
        return adoptGrocery(store,{title:input.draft,available:[],missing:[],steps:['Rezept'],write:'shop',rows:input.items.map(normalizeGrocery)})
      }
      if(input.action==='scan' && Array.isArray(input.items) && (input.items.length>0||input.receipt!==undefined) && input.items.length<=30 &&
          (input.place==='stock'||input.place==='receipt')) {
        const rows=input.items.map(normalizeGrocery)
        let receipt: {title:string,cents:number,date?:string}|undefined
        if(input.receipt!==undefined) {
          if(input.place!=='receipt'||!input.receipt||typeof input.receipt!=='object'||Array.isArray(input.receipt)) throw new Problem(400,'Ungültiger Kassenbon.')
          const {title,cents,date}=input.receipt as Record<string,unknown>
          if(!bounded(title,120)||typeof title!=='string'||typeof cents!=='number'||!Number.isSafeInteger(cents)||cents<1||cents>1_000_000) throw new Problem(400,'Ungültiger Bonbetrag.')
          const operation=id(input.operation)
          if (date!==undefined && !isDate(date)) throw new Problem(400,'Prüfe das Datum des Kassenbons.')
          receipt={title,cents,...(typeof date==='string'?{date}:{})}
          const digest=createHash('sha256').update(JSON.stringify([rows,receipt])).digest('hex')
          const prior=store.db.prepare('SELECT digest FROM grocery_receipts WHERE operation=?').get(operation)
          if(prior) {
            if(prior.digest!==digest) throw new Problem(409,'Diese Bonbuchung wurde bereits mit anderen Angaben gespeichert.')
            return {ok:true}
          }
          store.db.prepare('INSERT INTO grocery_receipts VALUES (?,?)').run(operation,digest)
        }
        return acceptGroceryRows(store,input.place,rows,receipt)
      }
      if(input.place==='stock'||input.place==='shopping') {
        if(input.action==='put') return putGrocery(store,input.place,input.draft,input.item===undefined?undefined:id(input.item))
        if(input.action==='remove') return removeGrocery(store,input.place,id(input.item))
      }
      throw new Problem(400,'Ungültige Aktion im Vorrat.')
    })
    return reply(res,200,result??{ok:true})
  }
  if (path === '/api/finance' && method === 'GET') return reply(res,200,financeOverview(store,financeMonth(url.searchParams.get('month'))))
  if (path === '/api/finance/entry' && method === 'POST') {
    const input=await body(req,['draft','month','id','revision','remove','confirm'])
    confirmLocalChange(input.confirm)
    const month=financeMonth(input.month)
    const existing=input.id===undefined?undefined:{id:id(input.id),revision:Number(input.revision)}
    if(existing && (typeof input.revision!=='number'||!Number.isSafeInteger(input.revision)||input.revision<1)) throw new Problem(400,'Ungültiger Stand des Finanzeintrags.')
    if(input.remove!==undefined && (input.remove!==true || !existing)) throw new Problem(400,'Wähle einen Eintrag zum Entfernen.')
    return reply(res,200,store.transaction(()=>input.remove && existing
      ? deleteFinance(store,existing.id,existing.revision,month):saveFinance(store,input.draft,month,existing)))
  }
  if (path === '/api/finance/settings' && method === 'POST') {
    const input=await body(req,['settings','revision','confirm'])
    confirmLocalChange(input.confirm)
    return reply(res,200,store.transaction(()=>saveFinanceSettings(store,input.settings,input.revision)))
  }
  if (path === '/api/finance/chat-draft' && method === 'POST') {
    const input=await body(req,['run','draft','confirm','index'])
    confirmLocalChange(input.confirm)
    const index=input.index??0
    if(typeof index!=='number'||!Number.isSafeInteger(index)||index<0||index>=12) throw new Problem(400,'Ungültige Position.')
    return reply(res,200,store.reviseFinance(id(input.run),input.draft,client,index))
  }
  if(path==='/api/tasks-board'&&method==='GET')return reply(res,200,taskBoard(store))
  if(path==='/api/tasks-board'&&method==='POST'){
    const {source,revision,patch,confirm}=await body(req,['source','revision','patch','confirm'])
    confirmLocalChange(confirm)
    store.transaction(()=>changeBoardSource(store,source,revision,patch))
    return reply(res,200,{ok:true})
  }
  if(path==='/api/projects'&&method==='GET'){
    const hasMail=store.db.prepare('SELECT 1 FROM project_email_suggestions LIMIT 1').get()
    const address=acceptance?'fixture':hasMail?await confirmedMailAccount(google).catch(()=>undefined):undefined
    return reply(res,200,{...projectOverview(store,address?(acceptance?address:mailAccountKey(address)):undefined),gmail:acceptance?undefined:address})
  }
  if(path==='/api/projects'&&method==='POST'){
    const {plan,project,step,revision,confirm}=await body(req,['plan','project','step','revision','confirm'])
    confirmLocalChange(confirm)
    const draft=manualProjectPlan(plan)
    const target=project===undefined?undefined:{id:id(project),revision:Number(revision),...(step!==undefined&&{stepId:id(step)})}
    if(draft.projectIntent!=='create'&&(!target||!Number.isSafeInteger(target.revision)||target.revision<1))
      throw new Problem(400,'Projektbezug fehlt.')
    const projectId=store.transaction(()=>applyProjectChange(store,prepareProjectChange(store,draft,target)))
    return reply(res,200,{id:projectId})
  }
  if(path==='/api/projects/editor'&&method==='POST'){
    const {plan,steps,project,revision,confirm}=await body(req,['plan','steps','project','revision','confirm'],100_000)
    confirmLocalChange(confirm)
    const identity=project===undefined?undefined:{id:id(project),revision:Number(revision)}
    if(identity&&(!Number.isSafeInteger(identity.revision)||identity.revision<1))throw new Problem(400,'Projektbezug fehlt.')
    const projectId=store.transaction(()=>applyProjectChange(store,prepareProjectEditor(store,plan,steps,identity)))
    return reply(res,200,{id:projectId})
  }
  if(path==='/api/projects/mail'&&method==='POST'){
    const {suggestion,revision,approved,confirm}=await body(req,['suggestion','revision','approved','confirm'])
    confirmLocalChange(confirm)
    if(typeof approved!=='boolean'||typeof revision!=='number'||!Number.isSafeInteger(revision))
      throw new Problem(400,'Bestätige einen aktuellen Mailvorschlag.')
    const address=acceptance?'fixture':await confirmedMailAccount(google)
    if(!address)throw new Problem(409,'Das Gmail-Konto ist nicht verbunden.')
    decideProjectMail(store,id(suggestion),acceptance?address:mailAccountKey(address),revision,approved)
    return reply(res,200,{ok:true,revision:approved?revision+1:revision})
  }
  if (path === '/api/profile' && method === 'GET') return reply(res, 200, personalProfile(store))
  if (path === '/api/profile' && method === 'POST') {
    const { fields, revision, confirm } = await body(req, ['fields','revision','confirm'])
    confirmLocalChange(confirm)
    return reply(res, 200, savePersonalProfile(store, fields, revision))
  }
  const draftRoute = /^\/api\/trips\/draft\/([\w-]+)$/.exec(path)
  if (draftRoute && method==='GET') return reply(res,200,readTripPreview(store,id(draftRoute[1])))
  if (path === '/api/trips/places' && method === 'GET') {
    const kind=url.searchParams.get('kind')
    if (kind==='address') {
      return reply(res,200,{addresses:await searchTripAddresses(url.searchParams.get('q')??'',url.searchParams.get('destination')??'')})
    }
    if (kind!=='destination' && kind!=='departure') throw new Problem(400,'Wähle Reiseziel oder Abreiseort.')
    return reply(res,200,{places:await searchTripPlaces(url.searchParams.get('q')??'',kind==='departure')})
  }
  if (path === '/api/trips' && method === 'GET') return reply(res,200,trips(store))
  const tripDetail = /^\/api\/trips\/([a-f0-9-]{36})$/iu.exec(path)
  if (tripDetail && method === 'GET') return reply(res,200,trip(store,id(tripDetail[1])))
  if (method === 'POST' && path.startsWith('/api/trips/')) {
    if (path === '/api/trips/windows') {
      const input = await body(req,['start','end','weekdays','state','maxLeave','approved','shiftWork','includeCalendar','tripId','confirm'])
      confirmLocalChange(input.confirm)
      const lodging=input.tripId===undefined ? [] : trip(store,id(input.tripId)).bookings.filter(entry=>entry.kind==='stay' && entry.status==='confirmed')
      if (lodging.length>1) throw new Problem(409,'Mehrere Unterkünfte sind bestätigt. Wähle einen Zeitraum ohne Buchungsabgleich.')
      return reply(res,200,travelWindows(store,input,lodging[0]))
    }
    if (path === '/api/trips/chat-change') {
      const { run, turn, tripId, confirm } = await body(req,['run','turn','tripId','confirm'])
      confirmLocalChange(confirm)
      if (typeof turn!=='number' || !Number.isSafeInteger(turn) || turn<0) throw new Problem(400,'Ungültiger Dialogstand.')
      return reply(res,200,previewTripChange(store,id(run),turn,tripId===undefined ? undefined : id(tripId)))
    }
    if (path === '/api/trips/chat-decision') {
      const { offer, approved, confirm } = await body(req,['offer','approved','confirm'])
      confirmLocalChange(confirm)
      if (typeof approved!=='boolean') throw new Problem(400,'Wähle Ja oder Nein.')
      return reply(res,200,decideTripChange(store,id(offer),approved))
    }
    if (path === '/api/trips/chat-preview') {
      const { run, turn, confirm } = await body(req,['run','turn','confirm'])
      confirmLocalChange(confirm)
      if (typeof turn!=='number' || !Number.isSafeInteger(turn) || turn<0) throw new Problem(400,'Ungültiger Dialogstand.')
      return reply(res,200,chatTripPreview(store,{run:id(run),turn}))
    }
    if (path === '/api/trips/preview') {
      const { draft, confirm } = await body(req,['draft','confirm'])
      confirmLocalChange(confirm)
      return reply(res,200,previewTrip(draft,undefined,undefined,store))
    }
    if (path === '/api/trips/guide') {
      const { preview, confirm } = await body(req,['preview','confirm'])
      confirmLocalChange(confirm)
      if (!cloudModel) throw new Problem(423,'Der externe Reiseguide ist in diesem Profil gesperrt. Speichere bei Bedarf die lokale Reisevorschau.')
      return reply(res,200,await generateTripPreview(store,id(preview),async plan=>{
        const forecast=fetchOutfitWeather(plan.draft.destination.split(',')[0].trim(),plan.draft.start).catch(()=>undefined)
        const guide=await createTripGuide(plan,AbortSignal.timeout(MODEL_MS+3000))
        const weather=await forecast
        return weather ? {...guide,packingTemperature:weather.max} : guide
      }))
    }
    if (path === '/api/trips/save') {
      const { preview, confirm } = await body(req,['preview','confirm'])
      confirmLocalChange(confirm)
      return reply(res,200,saveTrip(store,id(preview)))
    }
    if (path==='/api/trips/google' || path==='/api/trips/remove') {
      const {tripId,confirm}=await body(req,['tripId','confirm'])
      confirmLocalChange(confirm)
      const key=id(tripId)
      if (tripCalendarJobs.has(key)) throw new Problem(409,'Für diese Reise läuft bereits eine Kalenderaktion.')
      tripCalendarJobs.add(key)
      try {
        const removing=path.endsWith('/remove')
        const saved=trip(store,key)
        if (!removing && saved.googleCalendar==='saved') return reply(res,200,saved)
        if (removing && !saved.googleCalendar) return reply(res,200,removeSavedTrip(store,key))
        if (acceptance || !google.status().some(service=>service.service==='calendar-test'&&service.connected)) {
          throw new Problem(409,'Verbinde zuerst den Google-Kalender für Schreibzugriffe.')
        }
        if (removing) {
          const calendar=googleLifePilotCalendar(store)
          if (!calendar || calendar==='pending') throw new Problem(409,'Der LifePilot-Kalender bei Google ist noch nicht verfügbar.')
          await google.removeTrip(calendar,key)
          return reply(res,200,removeSavedTrip(store,key))
        }
        store.db.prepare('INSERT OR IGNORE INTO trip_google_events (trip_id) VALUES (?)').run(key)
        const receipt=await google.syncTrip(key,tripCalendarTitle(saved.draft.destination),saved.draft.start,shiftDay(saved.draft.end,1),
          ()=>googleLifePilotCalendar(store), calendar=>store.db.prepare('INSERT OR REPLACE INTO google_lifepilot_calendar VALUES (1,?)').run(calendar))
        store.db.prepare('UPDATE trip_google_events SET event_id=? WHERE trip_id=?').run(receipt.event,key)
        return reply(res,200,trip(store,key))
      } finally {tripCalendarJobs.delete(key)}
    }
    if (path==='/api/trips/packing-weather') {
      const {tripId,confirm}=await body(req,['tripId','confirm'])
      confirmLocalChange(confirm)
      const current=trip(store,id(tripId))
      const destination=current.draft.destination.split(',')[0].trim()
      const date=current.draft.start>=dateInBerlin() ? current.draft.start : dateInBerlin()
      const forecast=await fetchOutfitWeather(destination,date)
      return reply(res,200,changeTrip(store,current.id,current.revision,{kind:'packing-weather',temperature:forecast.max}))
    }
    if (path === '/api/trips/change') {
      const { tripId, revision, patch, confirm } = await body(req,['tripId','revision','patch','confirm'])
      confirmLocalChange(confirm)
      if (typeof revision!=='number' || !Number.isSafeInteger(revision) || revision<1) throw new Problem(400,'Ungültiger Reisestand.')
      const key=id(tripId)
      if (tripCalendarJobs.has(key)) throw new Problem(409,'Für diese Reise läuft bereits eine Kalenderaktion.')
      if (patch && typeof patch==='object' && Reflect.get(patch,'kind')==='dates') {
        const saved=trip(store,key)
        if (saved.revision!==revision) throw new Problem(409,'Die Reise wurde seitdem geändert. Lade sie erneut.')
        const next=tripDateChange(saved,Reflect.get(patch,'start'),Reflect.get(patch,'end')).draft
        if (next.start===saved.draft.start && next.end===saved.draft.end) return reply(res,200,saved)
        if (saved.googleCalendar) {
          const calendar=googleLifePilotCalendar(store)
          const event=store.db.prepare('SELECT event_id FROM trip_google_events WHERE trip_id=?').get(key)?.event_id
          if (!calendar || calendar==='pending' || typeof event!=='string') {
            throw new Problem(409,'Bestätige zuerst den offenen Google-Kalenderblock.')
          }
          tripCalendarJobs.add(key)
          try {
            await google.moveTrip(calendar,event,tripCalendarTitle(saved.draft.destination),
              {start:saved.draft.start,end:shiftDay(saved.draft.end,1)},
              {start:next.start,end:shiftDay(next.end,1)})
            return reply(res,200,changeTrip(store,key,trip(store,key).revision,patch))
          } finally {tripCalendarJobs.delete(key)}
        }
      }
      return reply(res,200,changeTrip(store,key,revision,patch))
    }
  }
  if (path==='/api/outfits/resale' && method==='GET') return reply(res,200,resaleList(store))
  if (path==='/api/outfits/resale' && method==='POST') {
    const {item,action,details,confirm}=await body(req,['item','action','details','confirm'])
    confirmLocalChange(confirm)
    return reply(res,200,store.transaction(()=>changeResale(store,id(item),action,details)))
  }
  if (path==='/api/outfits/travel' && method==='GET') return reply(res,200,travelWardrobe(store,id(url.searchParams.get('trip'))))
  if (path==='/api/outfits/travel' && method==='POST') {
    const {tripId,items,item,removeItem,confirm}=await body(req,['tripId','items','item','removeItem','confirm'])
    confirmLocalChange(confirm)
    const tripKey=id(tripId)
    if (removeItem!==undefined) {
      if (item!==undefined || items!==undefined) throw new Problem(400,'Wähle ein Teil zum Auspacken.')
      return reply(res,200,store.transaction(()=>{
        store.db.prepare('DELETE FROM wardrobe_travel WHERE trip_id=? AND wardrobe_id=?').run(tripKey,id(removeItem))
        return travelWardrobe(store,tripKey)
      }))
    }
    if (item!==undefined && items===undefined) {
      return reply(res,200,store.transaction(()=>addTravelWardrobeItem(store,tripKey,id(item))))
    }
    if (item!==undefined || !Array.isArray(items) || items.length>80) throw new Problem(400,'Wähle bis zu 80 Kleidungsstücke.')
    return reply(res,200,store.transaction(()=>saveTravelWardrobe(store,tripKey,items.map(id))))
  }
  if (path==='/api/outfits/fragrance-tags' && method==='POST') {
    const {scent,occasions,seasons,confirm}=await body(req,['scent','occasions','seasons','confirm'])
    confirmLocalChange(confirm)
    return reply(res,200,updateFragranceTags(store,id(scent),occasions,seasons))
  }
  if (path==='/api/outfits/fragrances' && method==='GET') return reply(res,200,fragranceList(store))
  if (path==='/api/outfits/fragrance-photo' && method==='GET') {
    const image=fragrancePhoto(store,id(url.searchParams.get('scent')))
    if (!image) throw new Problem(404,'Produktfoto nicht gefunden.')
    res.writeHead(200,{'Content-Type':image.mime,'Cache-Control':'private, no-store'})
    return res.end(image.photo)
  }
  if (path==='/api/outfits/fragrance-label' && method==='POST') {
    confirmLocalChange(req.headers['x-lifepilot-confirm']==='image')
    const {recognizedText}=await analyzeOutfitPhoto(await uploadOutfitPhoto(req,outfitUploadLimit))
    const query=recognizedText.split('\n').map(line=>line.trim()).filter(Boolean).slice(0,5).join(' ').slice(0,150)
    return reply(res,200,{query})
  }
  if (path==='/api/outfits/fragrance-search' && method==='POST') {
    const input=await body(req,['query','confirm'])
    confirmLocalChange(input.confirm)
    const query=field(input.query,500)
    if (query.trim().length<3) throw new Problem(400,'Gib den Duftnamen ein.')
    const deadline=Date.now()+55_000
    const profiles=await researchFragrance(query)
    const candidates: {draft:FragranceDraft,photoToken:string}[]=[]
    for (const {draft,images} of profiles) {
      if (candidates.length>=3 || Date.now()>deadline) break
      const image=await prepareProductImage(images,deadline,true)
      if (image) candidates.push({draft,photoToken:stageOutfitPhoto(image.photo,'web',draft.source)})
    }
    return reply(res,200,{candidates,query:normalizedFragranceQuery(query)})
  }
  if (path==='/api/outfits/fragrances' && method==='POST') {
    const {draft,photoToken,remove,confirm}=await body(req,['draft','photoToken','remove','confirm'])
    confirmLocalChange(confirm)
    if (remove) {
      if (!store.db.prepare('DELETE FROM wardrobe_fragrances WHERE id=?').run(id(remove)).changes) throw new Problem(404,'Duft nicht gefunden.')
      return reply(res,200,{removed:true})
    }
    const key=id(photoToken), image=preparedPhoto(key)
    const source=preparedPhotos.get(key)?.fragranceSource
    if (!source || !draft || typeof draft!=='object' || Array.isArray(draft)) throw new Problem(400,'Wähle ein Duft-Produktfoto.')
    const result=store.transaction(()=>saveFragrance(store,{...draft,source},image,'image/png'))
    preparedPhotos.delete(key)
    return reply(res,200,result)
  }
  if (path === '/api/outfits' && method === 'GET') return reply(res, 200, {
    ...outfitOverview(store, acceptance), weatherPlace: outfitLocation(personalProfile(store).fields.location) ? personalProfile(store).fields.location : '',
  })
  if (path === '/api/clothing-orders/photo' && method === 'GET') {
    const photo = orderItemPhoto(store,id(url.searchParams.get('item')))
    if (!photo) throw new Problem(404,'Kein Artikelbild vorhanden.')
    res.writeHead(200,{ 'Content-Type':'image/png', 'Cache-Control':'private, no-store' })
    return res.end(photo)
  }
  if (path === '/api/outfits/prepared-photo' && method === 'GET') {
    const file = preparedPhoto(id(url.searchParams.get('token')))
    res.writeHead(200,{ 'Content-Type':'image/png', 'Cache-Control':'private, no-store' })
    return res.end(file)
  }
  if (path === '/api/outfits/analyze-photo' && method === 'POST') {
    const allowCodex=imageApproval(req)
    const { draft, photo, feature } = await analyzeOutfitPhoto(await uploadOutfitPhoto(req,outfitUploadLimit))
    const catalog = matchProductPhoto(feature)
    if (catalog && (!draft.model || draft.model===catalog.model)) {
      return reply(res,200,{draft:{...draft,...catalog},photoToken:stageOutfitPhoto(photo),
        note:'Ähnliches Herstellerfoto im lokalen Katalog gefunden. Prüfe Modell und Variante.'})
    }
    const visual=allowCodex && !draft.model ? await analyzeCodexImage(photo,'png','garment') : undefined
    const result={...visual,...draft}
    if (visual?.name && !draft.brand && !draft.model) result.name=visual.name
    if (result.model && !draft.model && draft.brand && visual?.brand?.toLowerCase()!==draft.brand.toLowerCase()) delete result.model
    const note = draft.model ? 'Modell aus dem sichtbaren Etikett erkannt. Prüfe die Variante vor dem Speichern.' :
      'Prüfe die erkannten Angaben. Ein Foto vom Etikett oder ein Produktlink hilft beim genauen Modell.'
    return reply(res,200,{draft:{...result,...outfitGarment(result.name ?? '')},photoToken:stageOutfitPhoto(photo),note})
  }
  if (path === '/api/outfits/look-photo') {
    if (method === 'GET') {
      const file = lookPhoto(store,id(url.searchParams.get('photo')))
      if (!file) throw new Problem(404,'Foto nicht gefunden.')
      res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, no-store'})
      return res.end(file)
    }
    confirmLocalChange(req.headers['x-lifepilot-confirm'] === 'image')
    const look = url.searchParams.get('look')
    const lookId = look === null ? undefined : id(look)
    const name = url.searchParams.get('name') ?? undefined
    const replacement = url.searchParams.get('replace')
    const photo = await prepareFullOutfitPhoto(await uploadOutfitPhoto(req,outfitUploadLimit))
    return reply(res,200,store.transaction(()=>saveLookPhoto(store,photo,lookId,name,replacement ? id(replacement) : undefined)))
  }
  if (path === '/api/outfits/photo') {
    const target = url.searchParams.get('item')
    const item = target === 'profile' ? target : id(target)
    if (method === 'GET') {
      const file = outfitPhoto(store,item)
      if (!file) throw new Problem(404,'Foto nicht gefunden.')
      res.writeHead(200, { 'Content-Type': file.mime, 'Cache-Control': 'private, no-store' })
      return res.end(file.photo)
    }
    confirmLocalChange(req.headers['x-lifepilot-confirm'] === 'image')
    const bytes = await uploadOutfitPhoto(req)
    return reply(res, 200, attachOutfitPhoto(store,item,bytes,photoMime(bytes),'own'))
  }
  if (method === 'POST' && path.startsWith('/api/outfits/')) {
    if (path==='/api/outfits/look-pieces') {
      const {look,items,confirm}=await body(req,['look','items','confirm'])
      confirmLocalChange(confirm)
      if (!Array.isArray(items) || items.length>16) throw new Problem(400,'Wähle bis zu 16 Kleidungsstücke.')
      return reply(res,200,store.transaction(()=>assignLookPieces(store,id(look),items.map(id))))
    }
    if (path==='/api/outfits/look-analyze') {
      const {photo,confirm,codex}=await body(req,['photo','confirm','codex'])
      confirmLocalChange(confirm)
      const allowCodex=confirmCodexImage(codex===true)
      const image=lookPhoto(store,id(photo))
      if (!image) throw new Problem(404,'Tragefoto nicht gefunden.')
      const bytes=Buffer.from(image)
      const names=allowCodex ? await analyzeCodexImage(bytes,'jpeg','look') : []
      if (!names.length) {
        const {draft}=await analyzeOutfitPhoto(bytes)
        if (draft.name && outfitGarment(draft.name)) names.push(draft.name)
      }
      const wardrobe=outfitOverview(store).wardrobe
      return reply(res,200,{pieces:names.map(name=>{
        const type=outfitGarment(name)?.garmentType
        return {name,suggestions:type ? wardrobe.filter(item=>
          (item.garmentType || outfitGarment(item.name)?.garmentType)===type).slice(0,8).map(item=>item.id) : []}
      })})
    }
    if (path === '/api/outfits/item') {
      const { draft, item, confirm, photoToken } = await body(req,['draft','item','confirm','photoToken'])
      confirmLocalChange(confirm)
      outfitOverview(store, acceptance)
      const key = photoToken === undefined ? undefined : id(photoToken)
      const photo = key ? preparedPhoto(key) : undefined
      const result = store.transaction(() => {
        const saved = saveWardrobe(store,draft,item === undefined ? undefined : id(item))
        if (photo) attachOutfitPhoto(store,saved.id,photo,'image/png',key?preparedPhotos.get(key)?.origin:undefined)
        return saved
      })
      if (key) preparedPhotos.delete(key)
      return reply(res,200,result)
    }
    if (path === '/api/outfits/profile') {
      const { profile, confirm } = await body(req,['profile','confirm'])
      confirmLocalChange(confirm)
      return reply(res,200,saveStyle(store,profile))
    }
    if (path === '/api/outfits/generate') {
      const { query, useCalendar, confirm } = await body(req,['query','useCalendar','confirm'])
      confirmLocalChange(confirm)
      if (useCalendar !== undefined && typeof useCalendar !== 'boolean') throw new Problem(400,'Ungültige Kalenderwahl.')
      if (!query || typeof query!=='object' || Array.isArray(query)) throw new Problem(400,'Ungültige Outfit-Eingabe.')
      const values = query as Record<string,unknown>
      if (values.date !== undefined && !isDate(values.date)) throw new Problem(400,'Wähle ein gültiges Datum.')
      if (values.place !== undefined && !outfitLocation(values.place)) throw new Problem(400,'Gib eine Stadt oder Postleitzahl ein.')
      const date=values.date as string | undefined ?? dateInBerlin()
      const place=values.place as string | undefined
      outfitOverview(store, acceptance)
      let calendarOccasion = ''
      if (useCalendar) {
        if (acceptance) throw new Problem(409,'In diesem Testprofil sind keine Kalender verbunden.')
        const { events } = await google.calendarRange(berlinInstant(date+'T00:00'),berlinInstant(shiftDay(date,1)+'T00:00'))
        calendarOccasion = events[0]?.title.replace(/[\x00-\x1f\x7f]/gu,' ').trim().slice(0,110) ?? ''
      }
      const weather = place ? await fetchOutfitWeather(place,date).catch(reason=>{
        if (!(reason instanceof Problem) || reason.status<429) throw reason
        return undefined
      }) : undefined
      const cached=values.tripId===undefined ? undefined : trip(store,id(values.tripId)).packingTemperature
      const temperature=values.temperature ?? (cached!==undefined && cached>=-40 && cached<=50 ? cached : undefined)
      return reply(res,200,outfits.generate(store,{...values,date,temperature},calendarOccasion,weather))
    }
    if (path === '/api/outfits/save') {
      const { proposal, confirm } = await body(req,['proposal','confirm'])
      confirmLocalChange(confirm)
      return reply(res,200,outfits.save(store,id(proposal)))
    }
    if (path === '/api/outfits/remove') {
      const { target, item, confirm } = await body(req,['target','item','confirm'])
      confirmLocalChange(confirm)
      if (target === 'look-photo') return reply(res,200,removeLookPhoto(store,id(item)))
      if (target !== 'item' && target !== 'look' && target !== 'profile-photo') throw new Problem(400,'Ungültige Löschaktion.')
      return reply(res,200,removeOutfitData(store,target,target === 'profile-photo' ? '' : id(item)))
    }
    if (path === '/api/outfits/product-search') {
      const { query, confirm } = await body(req,['query','confirm'])
      confirmLocalChange(confirm)
      const text=field(query,420).trim()
      if (text.length<3) throw new Problem(400,'Gib mindestens drei Zeichen für die Produktsuche ein.')
      const [web,pictures]=await Promise.allSettled([searchProductPages(text,true),searchProductImages(text)])
      if (web.status==='rejected' && pictures.status==='rejected') throw web.reason
      const candidates = []
      const deadline = Date.now()+43_000
      const terms=text.toLocaleLowerCase('de-DE').match(/[\p{L}\p{N}-]{3,}/gu)??[]
      const expected=outfitGarment(text)
      const score=(name:string)=>{
        const garment=outfitGarment(name)
        if (!garment || expected && garment.category!==expected.category) return 0
        const title=name.toLocaleLowerCase('de-DE')
        const matched=terms.filter(term=>title.includes(term)).length
        return matched ? matched+Number(garment.garmentType===expected?.garmentType) : 0
      }
      const ranked=(pictures.status==='fulfilled'?pictures.value:[]).map(row=>({...row,score:score(row.name)}))
        .filter(row=>row.score>0).sort((a,b)=>b.score-a.score)
      const pictureMatches=ranked.slice(0,8)
      const pages=web.status==='fulfilled'?web.value.slice(0,6):[]
      const addresses=[...new Set([...pictureMatches.map(picture=>picture.source),...pages])]
      const products=new Map(await Promise.all(addresses.map(async address=>[address,
        await inspectProduct(address,undefined,true).catch(()=>undefined)] as const)))
      for (const picture of pictureMatches) {
        if (Date.now()>=deadline || candidates.length>=3) break
        const product=products.get(picture.source)
        const matching=product?.name && score(product.name) ? product : undefined
        const title=matching?.name || picture.name
        const image=await prepareProductImage([...(matching?.images ?? []),picture.image],deadline,true)
        if (!image) continue
        const metadata:Partial<WardrobeDraft>={...matching?.draft}
        if (matching && !textProductColor(matching.name) && !metadata.color) metadata.color=textProductColor(picture.name)
        candidates.push({name:title,source:picture.source,colors:matching?.colors,sizes:matching?.sizes,
          draft:productWardrobeFields(title,matching?.description,text,metadata,image.draft.color),
          photoToken:stageOutfitPhoto(image.photo,'web')})
      }
      for (const address of pages) {
        if (Date.now()>=deadline || candidates.length>=3) break
        if (candidates.some(candidate=>candidate.source===address)) continue
        const product = products.get(address)
        if (!product || !product.name || !score(product.name)) continue
        const image = await prepareProductImage(product.images,deadline,true)
        if (image) candidates.push({name:product.name,source:product.source,colors:product.colors,sizes:product.sizes,
          draft:productWardrobeFields(product.name,product.description,text,product.draft,image.draft.color),
          photoToken:stageOutfitPhoto(image.photo,'web')})
      }
      return reply(res,200,{candidates})
    }
    if (path === '/api/outfits/product') {
      const { address, prepareImage, confirm, color } = await body(req,['address','prepareImage','confirm','color'])
      confirmLocalChange(confirm)
      if (prepareImage !== undefined && typeof prepareImage !== 'boolean') throw new Problem(400,'Ungültige Bildauswahl.')
      const product = await inspectProduct(address,color===undefined ? undefined : field(color,100))
      let note = product.name ? '' : 'Die Produktseite liefert keine Angaben. Ergänze den Namen im Formular.'
      const waitingForColor = product.colors.length>1 && !('color' in product.draft && product.draft.color)
      if (prepareImage && !waitingForColor && product.name) {
        const image = await prepareProductImage(product.images,Date.now()+17_000,true,true)
        if (image) return reply(res,200,{...product,draft:productWardrobeFields(product.name,product.description,'',product.draft,image.draft.color),
          photoToken:stageOutfitPhoto(image.photo,'web'),note})
        note = 'Für diese Auswahl ließ sich kein Produktbild laden.'
      }
      return reply(res,200,{...product,note})
    }
    if (path === '/api/outfits/import-photo') {
      const { address, item, confirm } = await body(req,['address','item','confirm'])
      confirmLocalChange(confirm)
      const target = id(item)
      const bytes = await importProductPhoto(address)
      return reply(res,200,attachOutfitPhoto(store,target,bytes,photoMime(bytes),'web'))
    }
  }
  if (path==='/api/chat/dictation' && method==='POST') {
    confirmLocalChange(req.headers['x-lifepilot-confirm']==='dictation')
    if (req.headers['content-type']!=='audio/mp4') throw new Problem(415,'Ungültiges Diktatformat.')
    return reply(res,200,await transcribeDictation(await uploadOutfitPhoto(req,maxDictationBytes)))
  }
  if (path === '/api/chat/attachment' && method === 'POST') {
    if (chatMode === 'disabled') throw new Problem(423, 'Der persönliche KI-Chat wartet auf seine Freigabe.')
    if (req.headers['content-type'] !== 'application/octet-stream') throw new Problem(415, 'Wähle eine PDF- oder Bilddatei.')
    confirmLocalChange(req.headers['x-lifepilot-confirm'] === 'attachment')
    if (readingChatDocument) throw new Problem(409, 'Ein Anhang wird bereits gelesen.')
    readingChatDocument = true
    try { return reply(res, 200, await uploadChatDocument(req)) }
    finally { readingChatDocument = false }
  }
  if (path === '/api/applications' && method === 'GET') return reply(res, 200, applicationOverview(store))
  const applicationDetail = /^\/api\/applications\/([\w-]+)\/history$/.exec(path)
  if (applicationDetail && method === 'GET') return reply(res, 200, applicationHistory(store, id(applicationDetail[1])))
  if (path === '/api/applications/save' && method === 'POST') {
    const { draft, existing, revision, source, confirm } = await body(req, ['draft', 'existing', 'revision', 'source', 'confirm'], 18000)
    confirmLocalChange(confirm)
    if (existing !== undefined && (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1)) {
      throw new Problem(400, 'Ungültiger Bewerbungsstand.')
    }
    return reply(res, 200, saveApplication(store, draft,
      existing === undefined ? undefined : { id: id(existing), revision: revision as number },
      source === undefined ? undefined : id(source)))
  }
  if (path === '/api/applications/deny' && method === 'POST') {
    const { source, confirm } = await body(req, ['source', 'confirm'])
    confirmLocalChange(confirm)
    return reply(res, 200, denyApplicationSource(store, id(source)))
  }
  if (path === '/api/applications/scan' && method === 'POST') {
    const { confirm } = await body(req, ['confirm'])
    confirmLocalChange(confirm)
    const report = acceptance ? {
      account: 'fixture', limited: false, mails: [{
        id: 'bewerbung', from: 'Fiktives Konto', subject: 'Vielen Dank für deine Bewerbung',
        text: 'Firma: Beispieltechnik GmbH\nStelle: Werkstudent Datenanalyse\nOrt: Stuttgart\nVielen Dank für deine Bewerbung.',
        dates: [], at: null, truncated: false,
      }],
    } : await google.applicationMails()
    return reply(res, 200, { checked: report.mails.length, added: scanApplicationMails(store, report.mails, report.account, true), limited: report.limited })
  }
  if (path === '/api/applications/image' && method === 'POST') {
    if (req.headers['x-lifepilot-confirm'] !== 'image') throw new Problem(403, 'Bestätige die lokale Bilderkennung.')
    return reply(res, 200, await uploadApplicationImage(req))
  }
  if (path === '/api/skills/deadlines' && method === 'GET') {
    const through = shiftDay(dateInBerlin(), 14)
    return reply(res, 200, store.workspace.list().filter(task => task.status === 'open' && task.due_date && task.due_date <= through).slice(0,20))
  }
  if (path === '/api/skills/planning' && method === 'POST') {
    const values = await body(req, ['date', 'days', 'start', 'end', 'minutes', 'confirm'])
    confirmLocalChange(values.confirm)
    const query = validateFreeQuery({ date: field(values.date,10), start: field(values.start,5), end: field(values.end,5),
      days: Number(values.days), minutes: Number(values.minutes) })
    const calendar = !acceptance && google.status().some(item => item.service === 'calendar' && item.connected)
    const from = berlinInstant(query.date + 'T00:00')
    const to = berlinInstant(shiftDay(query.date,query.days) + 'T00:00')
    const targets = calendar ? [undefined, googleLifePilotCalendar(store)].filter((value,index) => index === 0 || value && value !== 'pending') : []
    const external = await Promise.all(targets.map(target => google.calendarRange(from,to,target)))
    if (external.some(result => result.limited)) throw new Problem(409,'Der Google-Zeitraum enthält zu viele Termine. Verkürze die Suche.')
    const busy = external.flatMap(result => result.events.map(item => ({
      at: item.allDay ? berlinInstant(item.start + 'T00:00') : new Date(item.start).toISOString(),
      endsAt: item.allDay ? berlinInstant(item.end + 'T00:00') : new Date(item.end).toISOString(),
    })))
    return reply(res, 200, { ...availability(store.workspace,query,Date.now(),busy), calendar })
  }
  if (path==='/api/inbox/finance' && method==='GET') {
    const account=acceptance ? 'fixture' : await confirmedMailAccount(google)
    return reply(res,200,account ? pendingMailFinances(store,acceptance ? account : mailAccountKey(account)) : [])
  }
  if (path==='/api/inbox/finance/bulk' && method==='POST') {
    const {proposals,confirm}=await body(req,['proposals','confirm'],180_000)
    confirmLocalChange(confirm)
    if(!Array.isArray(proposals)||proposals.length<1||proposals.length>100)throw new Problem(400,'Wähle bis zu 100 offene Finanzvorschläge.')
    const selected=new Map(proposals.map(value=>{
      if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.expected!=='string')throw new Problem(400,'Ungültiger Finanzvorschlag.')
      return [id(value.id),value.expected] as const
    }))
    if(selected.size!==proposals.length)throw new Problem(400,'Ein Finanzvorschlag wurde doppelt ausgewählt.')
    const address=acceptance?'fixture':await confirmedMailAccount(google)
    if(!address)throw new Problem(409,'Gmail ist nicht verbunden.')
    const account=acceptance?address:mailAccountKey(address)
    const current=new Map(pendingMailFinances(store,account).map(({id,...draft})=>[id,draft]))
    const accepted:string[]=[]
    const failed:{id:string,reason:string}[]=[]
    for(const [id,expected] of selected){
      const draft=current.get(id)
      if(!draft||JSON.stringify(draft)!==expected){
        failed.push({id,reason:'Der Vorschlag hat sich geändert. Prüfe ihn erneut.'})
        continue
      }
      try{
        decideMailFinance(store,account,id,true,draft)
        accepted.push(id)
      }catch(cause){
        failed.push({id,reason:cause instanceof Problem?cause.message:'Übernahme fehlgeschlagen.'})
      }
    }
    return reply(res,200,{accepted,failed})
  }
  if (path==='/api/inbox/finance' && method==='POST') {
    const {proposal,approved,draft,confirm}=await body(req,['proposal','approved','draft','confirm'])
    confirmLocalChange(confirm)
    if(typeof approved!=='boolean') throw new Problem(400,'Wähle Ja oder Nein.')
    const account=acceptance ? 'fixture' : await confirmedMailAccount(google)
    if(!account) throw new Problem(409,'Gmail ist nicht verbunden.')
    return reply(res,200,decideMailFinance(store,acceptance ? account : mailAccountKey(account),id(proposal),approved,draft))
  }
  if (path==='/api/inbox/categorization' && method==='GET') {
    const row=store.db.prepare('SELECT before_epoch FROM gmail_categorization WHERE singleton=1').get()
    return reply(res,200,{enabled:!acceptance && Boolean(row),backlog:Boolean(row?.before_epoch)})
  }
  if (path==='/api/inbox/categorization' && method==='POST') {
    if(acceptance) throw new Problem(403,'Gmail steht im Testprofil nicht zur Verfügung.')
    const {address,afterEpoch,confirm}=await body(req,['address','afterEpoch','confirm'])
    confirmLocalChange(confirm)
    await enableMailCategorization(store,google,field(address,320),afterEpoch)
    void runAutomaticMailSync()
    return reply(res,200,{enabled:true})
  }
  if (path==='/api/inbox/feed' && method==='GET') return reply(res,200,await readInboxFeed(google,acceptance))
  if (path==='/api/inbox/feed' && method==='POST') {
    const {confirm}=await body(req,['confirm'])
    confirmLocalChange(confirm)
    return reply(res,200,await refreshAttentionFeed())
  }
  if (path==='/api/clothing-orders/refresh' && method==='POST') {
    const {confirm,month}=await body(req,['confirm','month'])
    confirmLocalChange(confirm)
    if(scanningInbox) throw new Problem(409,'Ein Mail-Abgleich läuft bereits. Versuche es gleich erneut.')
    const selected=month===undefined ? dateInBerlin().slice(0,7) : financeMonth(month)
    const start=selected+'-01'
    const end=shiftDay(selected+'-28',4).slice(0,7)+'-01'
    const from=Math.floor(Date.parse(berlinInstant(start+'T00:00'))/1000)-1
    const through=Math.min(Math.ceil(Date.now()/1000),Math.floor(Date.parse(berlinInstant(end+'T00:00'))/1000))
    scanningInbox=true
    try {
      const row=store.db.prepare('SELECT account FROM gmail_categorization WHERE singleton=1').get()
      const result=acceptance ? {account:'fixture',mails:clothingDemoMail,limited:false} :
        await google.searchOrderMails(from,through,typeof row?.account==='string' ? row.account : undefined)
      const changed=scanClothingOrders(store,result.mails,result.account)
      queueOrderPhotos()
      return reply(res,200,{checked:result.mails.length,changed,limited:result.limited})
    } finally {scanningInbox=false}
  }
  if (path==='/api/clothing-orders/finance' && method==='POST') {
    const {order,kind,date,cents,confirm}=await body(req,['order','kind','date','cents','confirm'])
    confirmLocalChange(confirm)
    return reply(res,200,bookOrderFinance(store,id(order),kind,date,cents))
  }
  if (path==='/api/clothing-orders' && method==='GET') {
    const month=url.searchParams.get('month'), focus=url.searchParams.get('focus')
    return reply(res,200,clothingOrders(store,month===null?undefined:financeMonth(month),focus===null?undefined:id(focus)))
  }
  if (path==='/api/clothing-orders/change' && method==='POST') {
    const {order,item,action,value,confirm}=await body(req,['order','item','action','value','confirm'])
    confirmLocalChange(confirm)
    const result=changeClothingOrder(store,id(order),action,item===undefined?undefined:id(item),value)
    if(action==='kept') queueOrderPhotos(result.id)
    return reply(res,200,result)
  }
  if (path==='/api/clothing-orders/photos' && method==='POST') {
    const {order,confirm}=await body(req,['order','confirm'])
    confirmLocalChange(confirm)
    return reply(res,200,await loadClothingPhotos(id(order)))
  }
  if (path === '/api/inbox' && method === 'GET') return reply(res, 200, await inboxWithLectureTargets(store,acceptance?undefined:google))
  if (path === '/api/inbox/refresh' && method === 'POST') {
    const { confirm, restart } = await body(req, ['confirm','restart'])
    confirmLocalChange(confirm)
    if (restart !== undefined && typeof restart !== 'boolean') throw new Problem(400, 'Ungültiger Synchronisierungsmodus.')
    if (scanningInbox) throw new Problem(409, 'Ein Mail-Durchlauf läuft bereits.')
    scanningInbox = true
    try {
      const result = await refreshInbox(store, google, acceptance, restart === true)
      return reply(res, 200, { ...result, ...await planRefreshedInbox(store, google, acceptance) })
    } finally { scanningInbox = false }
  }
  if (path === '/api/inbox/scan' && method === 'POST') {
    const { confirm, restart } = await body(req, ['confirm', 'restart'])
    confirmLocalChange(confirm)
    if (restart !== undefined && typeof restart !== 'boolean') throw new Problem(400, 'Ungültiger Synchronisierungsmodus.')
    if (scanningInbox) throw new Problem(409, 'Ein Mail-Durchlauf läuft bereits.')
    scanningInbox = true
    try {
      if (acceptance) return reply(res, 200, { ...scanInbox(store, mailDemoFixtures), limited: false, classified: mailDemoFixtures.map(classifyMail) })
      const gmail = await google.recentInbox(account => readGmailPage(store, account), restart === true)
      return reply(res, 200, { ...scanInbox(store, gmail.mails, gmail), limited: Boolean(gmail.next), classified: gmail.mails.map(classifyMail) })
    } finally { scanningInbox = false }
  }
  if (path === '/api/inbox/decision' && method === 'POST') {
    const values = await body(req, ['proposal', 'decision', 'confirm', 'slot', 'lectureTarget'])
    confirmLocalChange(values.confirm)
    if (values.decision !== 'accept' && values.decision !== 'deny') throw new Problem(400, 'Ungültige Entscheidung.')
    const proposal = id(values.proposal)
    const existing=inboxProposal(store,proposal)
    if(values.decision==='accept'&&existing?.lectureCancellation){
      await approveLectureCancellation(store,acceptance?undefined:google,existing,values.lectureTarget,client)
      return reply(res,200,{id:proposal,state:'accepted'})
    }
    if (values.slot !== undefined) {
      if (values.decision !== 'accept' || typeof values.slot !== 'string') throw new Problem(400, 'Ungültiger Zeitblock.')
      const { plans } = await planRefreshedInbox(store, google, acceptance)
      const slot = plans.find(plan => plan.id === proposal && plan.at === values.slot)
      if (!slot) throw new Problem(409, 'Zeitfenster inzwischen nicht verfügbar. Aktualisiere die Übersicht.')
      return reply(res, 200, decideInbox(store, proposal, 'accept', client, slot))
    }
    return reply(res, 200, decideInbox(store, proposal, values.decision, client))
  }
  if (path.startsWith('/api/mac-calendar/')) {
    if (acceptance || method !== 'POST') throw new Problem(403, 'Der Mac-Kalender ist nur im Hauptprofil verfügbar.')
    if (path === '/api/mac-calendar/list') {
      const { confirm } = await body(req, ['confirm'])
      confirmLocalChange(confirm)
      return reply(res, 200, await macCalendar.calendars())
    }
    if (path === '/api/mac-calendar/free-windows') {
      const { confirm, date, days, start, end, minutes } = await body(req, ['confirm', 'date', 'days', 'start', 'end', 'minutes'])
      confirmLocalChange(confirm)
      const query = validateFreeQuery({ date: field(date, 10), start: field(start, 5), end: field(end, 5),
        days: typeof days === 'number' ? days : 0, minutes: typeof minutes === 'number' ? minutes : 0 })
      const busy = await macCalendar.occupied(berlinInstant(query.date + 'T00:00'),
        berlinInstant(shiftDay(query.date, query.days) + 'T00:00'))
      return reply(res, 200, availability(store.workspace, query, Date.now(), busy))
    }
    if (path === '/api/mac-calendar/preview') {
      const { slot, calendar } = await body(req, ['slot', 'calendar'])
      return reply(res, 200, macCalendar.preview(store, id(slot), calendar === undefined ? undefined : field(calendar, 256)))
    }
    if (path === '/api/mac-calendar/approve') {
      const { approval, confirm } = await body(req, ['approval', 'confirm'])
      confirmLocalChange(confirm)
      return reply(res, 200, await macCalendar.approve(store, id(approval)))
    }
    throw new Problem(403, 'Diese Kalenderaktion ist nicht verfügbar.')
  }
  if (path.startsWith('/api/google/')) {
    if (acceptance) throw new Problem(403, 'Google ist nur im Hauptprofil verfügbar.')
    if (method === 'GET' && path === '/api/google/account') return reply(res, 200, { gmail: await google.mailboxAddress() })
    if (method === 'GET' && path === '/api/google/status') return reply(res, 200, google.status())
    if (method === 'POST' && path === '/api/google/sync-appointment') {
      const { run, confirm } = await body(req, ['run', 'confirm'])
      confirmLocalChange(confirm)
      const key = id(run)
      if (!await finishAppointmentChange(store, google, key)) await syncApprovedAppointment(store, google, key)
      return reply(res, 200, store.present(store.run(key)))
    }
    if (method === 'POST' && path === '/api/google/appointment-change') {
      const { run, operation, title, start, minutes, confirm } = await body(req, ['run', 'operation', 'title', 'start', 'minutes', 'confirm'])
      confirmLocalChange(confirm)
      if (!google.status().some(item => item.service === 'calendar-test' && item.connected)) throw new Problem(409,'Verbinde zuerst Google Kalender.')
      const key = id(run)
      if (operation === 'remove') queueAppointmentChange(store,key,client,null)
      else if (operation === 'update' && typeof start === 'string' && typeof minutes === 'number' && Number.isInteger(minutes) && minutes>=5 && minutes<=480) {
        const at=localInstant(start)
        if (Date.parse(at)<=Date.now()) throw new Problem(400,'Wähle einen zukünftigen Termin.')
        queueAppointmentChange(store,key,client,{title:field(title,120),start:at,end:new Date(Date.parse(at)+minutes*60000).toISOString(),day:start.slice(0,10)})
      } else throw new Problem(400,'Ungültige Terminänderung.')
      try { await finishAppointmentChange(store,google,key) } catch { /* The confirmed change stays queued for a retry. */ }
      return reply(res,200,store.present(store.run(key)))
    }
    if (method === 'POST' && path === '/api/google/calendar-test') {
      const { start, confirm } = await body(req, ['start', 'confirm'])
      confirmLocalChange(confirm)
      if (typeof start !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start)) throw new Problem(400, 'Gib eine Berliner Ortszeit an.')
      let instant: string
      try { instant = berlinInstant(start) } catch { throw new Problem(400, 'Ungültige Berliner Ortszeit.') }
      const at = Date.parse(instant)
      if (at <= Date.now() || at > Date.now() + 30 * 86400_000) throw new Problem(400, 'Wähle einen Zeitpunkt in den nächsten 30 Tagen.')
      return reply(res, 200, await google.calendarTest(instant, new Date(at + 15 * 60_000).toISOString(),
        () => store.db.prepare('SELECT calendar_id FROM google_calendar_test WHERE singleton=1').get()?.calendar_id as string | undefined,
        calendar => { store.db.prepare('INSERT OR REPLACE INTO google_calendar_test VALUES (1,?)').run(calendar) }))
    }
    if (method === 'POST' && path === '/api/google/gmail-label') {
      const { message, category, confirm } = await body(req, ['message', 'category', 'confirm'])
      confirmLocalChange(confirm)
      if (typeof category !== 'string' || !Object.hasOwn(mailCategoryNames, category)) throw new Problem(400, 'Ungültige Mailkategorie.')
      return reply(res, 200, await google.gmailSortTest(message, category as MailClassificationCategory))
    }
    if (method === 'POST' && path === '/api/google/gmail-sort-test') {
      const { message, confirm } = await body(req, ['message', 'confirm'])
      confirmLocalChange(confirm)
      return reply(res, 200, await google.gmailSortTest(message))
    }
    if (method === 'POST' && path === '/api/google/calendar') {
      const { days, confirm } = await body(req, ['days', 'confirm'])
      confirmLocalChange(confirm)
      if (typeof days !== 'number') throw new Problem(400, 'Gib eine Anzahl von Tagen an.')
      return reply(res, 200, await google.calendar(days))
    }
    if (method === 'POST' && path === '/api/google/gmail') {
      const { limit, confirm } = await body(req, ['limit', 'confirm'])
      confirmLocalChange(confirm)
      if (typeof limit !== 'number') throw new Problem(400, 'Gib eine Anzahl von Nachrichten an.')
      return reply(res, 200, await google.gmail(limit))
    }
    if (method === 'POST' && path === '/api/google/mail-search') {
      const { category, confirm } = await body(req, ['category', 'confirm'])
      confirmLocalChange(confirm)
      return reply(res, 200, await google.gmail(10, field(category, 16)))
    }
    if (method === 'POST' && path === '/api/google/mail-content') {
      const { message, confirm } = await body(req, ['message', 'confirm'])
      confirmLocalChange(confirm)
      return reply(res, 200, await google.mailContent(message))
    }
    if (method === 'POST' && path === '/api/google/configure') {
      const { service, credentials, confirm } = await body(req, ['service', 'credentials', 'confirm'])
      confirmLocalChange(confirm)
      return reply(res, 200, google.configure(googleService(service), credentials))
    }
    if (method === 'POST' && (path === '/api/google/connect' || path === '/api/google/disconnect')) {
      const { service, confirm } = await body(req, ['service', 'confirm'])
      confirmLocalChange(confirm)
      const selected=googleService(service)
      if(path.endsWith('/disconnect'))return reply(res,200,google.disconnect(selected))
      const account=selected==='calendar-write'?await google.mailboxAddress():undefined
      if(selected==='calendar-write'&&!account)throw new Problem(409,'Verbinde zuerst das Gmail-Hauptkonto.')
      return reply(res,200,google.begin(selected,account))
    }
    throw new Problem(403, 'Diese Google-Aktion ist nicht verfügbar.')
  }

  if (method === 'GET') {
    if (path === '/api/status') return reply(res, 200, { version, acceptance, ready: !stopping })
    if (path === '/api/state') {
      store.expire()
      const target = acceptance ? undefined : macCalendar.preferred(store)
      return reply(res, 200, { version, acceptance, nightbot, chatMode,directTestChat:audit, modelName: cloudModel ? 'Codex' : 'LifePilot (lokal)', cloudModel,
        googleAppointmentWrite: !acceptance && google.status().some(item => item.service === 'calendar-test' && item.connected), calendarTarget: target ? { name: target.name, account: target.account } : null,
        agents: [manifest], connectors, runs: store.list(), tasks: store.workspace.list(), schedule: store.workspace.schedule(), fixtures: acceptance ? fixtures : null })
    }
    if (path === '/api/tasks') return reply(res, 200, store.workspace.list())
    if (path === '/api/schedule') return reply(res, 200, store.workspace.schedule())
    if (path === '/api/calendar-grid') {
      const start = url.searchParams.get('start')
      const days = Number(url.searchParams.get('days'))
      if (!isDate(start) || !Number.isInteger(days) || days < 1 || days > 56) throw new Problem(400, 'Ungültiger Kalenderzeitraum.')
      const from = berlinInstant(start + 'T00:00')
      const through = berlinInstant(shiftDay(start, days) + 'T00:00')
      const local = store.workspace.week(start, from, through, days)
      const region=holidayRegion(personalProfile(store).fields.location)
      const holidays=region?travelDays(start,shiftDay(start,days-1)).flatMap(date=>{
        const name=publicHoliday(date,region)
        return name?[{date,name}]:[]
      }):[]
      const target = googleLifePilotCalendar(store)
      const statuses = acceptance ? [] : google.status()
      const sources = [
        ...(statuses.some(item => item.service === 'calendar' && item.connected) ? [undefined] : []),
        ...(target && target !== 'pending' && statuses.some(item => item.service === 'calendar-test' && item.connected) ? [target] : []),
      ]
      const external = await Promise.allSettled(sources.map(calendar => google.calendarRange(from, through, calendar)))
      const sent = new Set((store.db.prepare(`SELECT event_id FROM google_appointment_sync WHERE event_id IS NOT NULL AND slot_id IN
        (SELECT id FROM schedule WHERE state='pending' AND at>=? AND at<?)`).all(from, through)).map(row => row.event_id))
      for (const row of store.db.prepare('SELECT event_id FROM trip_google_events WHERE event_id IS NOT NULL').all()) sent.add(row.event_id)
      return reply(res, 200, { ...local, holidays, external: external.flatMap(item => item.status === 'fulfilled'
        ? item.value.events.filter(event => !sent.has(event.id)) : []),
        calendarIncomplete: external.some(item => item.status === 'rejected' || item.value.limited) })
    }
    if (path === '/api/free-windows') return reply(res, 200, availability(store.workspace, {
      date: url.searchParams.get('date') ?? dateInBerlin(), days: Number(url.searchParams.get('days') ?? '7'),
      start: url.searchParams.get('start') ?? '09:00', end: url.searchParams.get('end') ?? '20:00',
      minutes: Number(url.searchParams.get('minutes') ?? '60'),
    }))
    if (path === '/api/week') {
      const day = url.searchParams.get('date') ?? dateInBerlin()
      if (!isDate(day) || day < '2000-01-03' || day > '9998-12-31') throw new Problem(400, 'Wähle ein gültiges Datum ab dem Jahr 2000.')
      const start = mondayOf(day)
      return reply(res, 200, store.workspace.week(start, berlinInstant(start + 'T00:00'), berlinInstant(shiftDay(start, 7) + 'T00:00')))
    }
    const taskRoute = /^\/api\/tasks\/([\w-]+)$/.exec(path)
    if (taskRoute) {
      const key = id(taskRoute[1])
      return reply(res, 200, { task: store.workspace.get(key), history: store.workspace.history(key) })
    }
    if (path === '/api/memory') return reply(res, 200, store.memory(scope(url.searchParams.get('scope') ?? 'lifepilot'), (url.searchParams.get('q') ?? '').slice(0, MAX_INPUT), principal))
    const preview = /^\/api\/runs\/([\w-]+)\/model-preview$/.exec(path)
    if (preview) return reply(res, 200, store.previewModel(id(preview[1]), id(url.searchParams.get('approval'))))
    const one = /^\/api\/runs\/([\w-]+)$/.exec(path)
    if (one) {
      store.expire()
      return reply(res, 200, store.present(store.run(id(one[1]))))
    }
  }

  if (method === 'POST') {
    if (path === '/api/ticket' && client === 'cli') {
      await body(req, [])
      prune(tickets)
      const ticket = token()
      tickets.set(ticket, { expires: Date.now() + 60_000, principal })
      return reply(res, 200, { url: `${origin}/#${ticket}` })
    }
    if (path === '/api/stop' && client === 'cli') {
      await body(req, [])
      reply(res, 200, { ok: true })
      stop()
      return
    }
    if (path === '/api/runs') {
      const values = await body(req, ['input', 'agent', 'key', 'synthetic', 'sourceNote','sendNow','previous'],MAX_CHAT_BODY_BYTES)
      return reply(res, 201, store.create(field(values.input, MAX_CHAT_INPUT), field(values.agent, 60), id(values.key), client,
        values.synthetic === true, values.sourceNote,audit && values.synthetic===true && values.sendNow===true,values.previous===undefined?null:id(values.previous)))
    }
    const action = /^\/api\/runs\/([\w-]+)\/(decision|cancel|revise|followup)$/.exec(path)
    if (action) {
      if (chatMode === 'disabled') throw new Problem(423, 'Der persönliche KI-Chat wartet auf seine Trinity-Freigabe.')
      if (action[2] === 'cancel') {
        await body(req, [])
        const result = store.cancel(id(action[1]), client)
        syncWorker()
        return reply(res, 200, result)
      }
      if (action[2] === 'followup') {
        const { input, key, turn, synthetic,sendNow } = await body(req, ['input', 'key', 'turn', 'synthetic','sendNow'],MAX_CHAT_BODY_BYTES)
        if (typeof turn !== 'number' || !Number.isSafeInteger(turn) || turn < 0) throw new Problem(400, 'Ungültiger Dialogstand.')
        return reply(res, 201, store.followup(id(action[1]), field(input, MAX_CHAT_INPUT), id(key), turn, client, synthetic === true,audit && synthetic===true && sendNow===true))
      }
      if (action[2] === 'revise') {
        const { result, confirm } = await body(req, ['result', 'confirm'])
        confirmLocalChange(confirm)
        return reply(res, 200, store.revise(id(action[1]), result, client))
      }
      const { approval, decision, googleSync, overlapToken } = await body(req, ['approval', 'decision', 'googleSync', 'overlapToken'])
      if (decision !== 'approve' && decision !== 'deny') throw new Problem(403, 'Diese Entscheidung ist nicht erlaubt.')
      const key = id(action[1])
      const approvalId=id(approval)
      const external=decision==='approve'?await googleConflicts(store.calendarWindows(key,approvalId)):undefined
      if (googleSync === true) {
        if (acceptance || !google.status().some(item => item.service === 'calendar-test' && item.connected)) {
          throw new Problem(409, 'Verbinde zuerst den Google-Schreibzugriff für den LifePilot-Kalender.')
        }
        const result=store.decide(key,approvalId,decision,client,true,overlapToken,external)
        if('calendarConfirmation' in result)return reply(res,200,result)
        try { await syncApprovedAppointment(store, google, key) } catch { /* Local approval remains recorded and can be retried. */ }
        return reply(res, 200, store.present(store.run(key)))
      }
      return reply(res, 200, store.decide(key,approvalId,decision,client,false,overlapToken,external))
    }
    if (path === '/api/tasks') {
      const { title, detail, date, kind, confirm, category, project, priority } = await body(req, ['title', 'detail', 'date', 'kind', 'confirm', 'category', 'project', 'priority'])
      confirmLocalChange(confirm)
      if ((kind !== 'task' && kind !== 'appointment') || (date !== null && !isDate(date)) || (kind === 'appointment' && date === null)) {
        throw new Problem(400, 'Ungültiger Aufgabentyp oder Termin.')
      }
      if (category !== undefined && category !== null && !isCategory(category)) throw new Problem(400, 'Ungültige Kategorie.')
      return reply(res, 201, store.transaction(() => store.workspace.add(null, {
        title: field(title, 120), detail: taskDetail(detail), date, kind, projectId:project==null?null:id(project),priority:taskPatch(priority===undefined?{}:{priority}).priority,
        category: category === null || isCategory(category) ? category : undefined,
      }, client)))
    }
    const edit = /^\/api\/tasks\/([\w-]+)\/(edit|schedule)$/.exec(path)
    if (edit) {
      const key = id(edit[1])
      if (edit[2] === 'edit') {
        const { patch, revision, confirm } = await body(req, ['patch', 'revision', 'confirm'])
        confirmLocalChange(confirm)
        if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) throw new Problem(400, 'Ungültiger Aufgabenstand.')
        return reply(res,200,updateClothingTask(store,key,revision,taskPatch(patch),client))
      }
      const { kind, at, minutes, confirm, overlapToken } = await body(req, ['kind', 'at', 'minutes', 'confirm', 'overlapToken'])
      confirmLocalChange(confirm)
      if (kind !== 'reminder' && kind !== 'slot') throw new Problem(400, 'Ungültige Terminart.')
      const starts = localInstant(at)
      let ends = null
      if (kind === 'slot') {
        if (typeof minutes !== 'number' || !Number.isSafeInteger(minutes) || minutes < 5 || minutes > 480) throw new Problem(400, 'Ungültige Dauer.')
        ends = new Date(Date.parse(starts) + minutes * 60000).toISOString()
      }
      const external=ends?await googleConflicts([{title:store.workspace.get(key).title,at:starts,endsAt:ends}]):undefined
      const result=store.transaction(()=>{
        const task=store.workspace.get(key)
        const windows=ends?[{title:task.title,at:starts,endsAt:ends}]:[]
        const confirmationKey=JSON.stringify([key,client,kind,starts,ends])
        const calendarConfirmation=store.calendarConfirmations.check(confirmationKey,windows,overlapToken,external)
        if(calendarConfirmation)return {calendarConfirmation}
        const saved=store.workspace.addSchedule(key,kind,starts,ends,client,windows.length>0)
        store.calendarConfirmations.finish(confirmationKey)
        return saved
      })
      return reply(res,'calendarConfirmation' in result?200:201,result)
    }
    const dismiss = /^\/api\/schedule\/([\w-]+)\/dismiss$/.exec(path)
    if (dismiss) {
      const { confirm } = await body(req, ['confirm'])
      confirmLocalChange(confirm)
      store.transaction(() => store.workspace.dismiss(id(dismiss[1]), client))
      return reply(res, 200, { ok: true })
    }
    if (path === '/api/memory') {
      const values = await body(req, ['content', 'scope', 'expires', 'replaces', 'confirm', 'synthetic'])
      if (values.confirm !== true) throw new Problem(403, 'Bestätige den genauen Memory-Inhalt.')
      const record = store.addMemory(field(values.content, 1200), scope(values.scope), client, expiration(values.expires),
        values.replaces == null ? null : id(values.replaces), values.synthetic === true)
      syncWorker()
      return reply(res, 201, record)
    }
    const forget = /^\/api\/memory\/([\w-]+)\/(revoke|erase)$/.exec(path)
    if (forget) {
      const { confirm } = await body(req, ['confirm'])
      if (confirm !== true) throw new Problem(403, 'Bestätige diese Memory-Aktion.')
      store.forget(id(forget[1]), forget[2] === 'erase')
      syncWorker()
      return reply(res, 200, { ok: true })
    }
    if (path === '/api/improvements') {
      const { content } = await body(req, ['content'])
      const request = randomUUID()
      store.db.prepare('INSERT INTO improvements VALUES (?,?,?,?)')
        .run(request, field(content, 1200), client, new Date().toISOString())
      return reply(res, 202, { id: request, status: 'gesperrt', reason: 'Builder, Isolationsnachweis und unabhängige Prüfungen fehlen.' })
    }
    if (path === '/api/backup' && client === 'cli') {
      const { confirm } = await body(req, ['confirm'])
      if (confirm !== true) throw new Problem(403, 'Bestätige die Sicherung.')
      return reply(res, 201, store.backup())
    }
    throw new Problem(403, 'Diese Aktion ist für LifePilot gesperrt.')
  }
  throw new Problem(404, 'Aktion nicht gefunden.')
}

const server = createServer({ requestTimeout: 10_000, headersTimeout: 5000, keepAliveTimeout: 1500 }, (req, res) => {
  void route(req, res).catch((error: unknown) => {
    if (res.headersSent) return res.destroy()
    if (error instanceof Problem) return reply(res, error.status, { error: error.message })
    console.error('Interner Dienstfehler.', error instanceof Error ? error.name : '')
    reply(res, 500, { error: 'Der Hub konnte diese Aktion nicht abschließen.' })
  })
})
const adapter = createSocketServer(socket => { server.emit('connection', socket) })
adapter.once('error', () => { console.error('Lokaler Adapter nicht erreichbar.'); stop(); process.exitCode = 1 })
let interval: NodeJS.Timeout | undefined
function stop() {
  if (stopping) return
  stopping = true
  clearInterval(interval)
  active?.controller.abort()
  if (adapter.listening) adapter.close()
  server.close(() => {
    store?.recover()
    store?.db.close()
  })
  server.closeIdleConnections()
}
server.once('error', () => {
  console.error('Der lokale Port ist belegt oder nicht erreichbar.')
  process.exitCode = 1
})
if (nightbot && !acceptance) {
  setInterval(()=>{
    if (!stopping && !scanningInbox && !store.db.prepare('SELECT 1 FROM gmail_categorization WHERE singleton=1').get() &&
      google.status().some(service=>service.service==='gmail-content' && service.connected)) {
      void refreshAttentionFeed().catch(()=>{})
    }
  },120_000).unref()
}

server.listen(port, '127.0.0.1', () => {
  try {
    mkdirSync(data, { recursive: true, mode: 0o700 })
    chmodSync(data, 0o700)
    secret = Buffer.from(adapterToken(secretPath, true))
    if (audit) probeSecret = Buffer.from(adapterToken(probeSecretPath, true))
    adapter.listen(prepareAdapterSocket())
    store = new Store()
    store.recover()
    let seriesDay=''
    let nextReminderCheck = 0
    interval = setInterval(() => {
      if (Date.now() >= nextReminderCheck) {
        nextReminderCheck = Date.now() + 5000
        try {
          const day=dateInBerlin()
          if(day!==seriesDay){extendReminders(store);seriesDay=day}
          store.workspace.tick()
        } catch { console.error('Erinnerungsprüfung unterbrochen.') }
      }
      void work().catch(() => console.error('Auftragsverarbeitung unterbrochen.'))
    }, 350)
    console.log(`LifePilot ${version} wartet lokal auf ${origin}`)
  } catch {
    console.error('LifePilot konnte seinen lokalen Datenspeicher nicht öffnen.')
    stop()
    process.exitCode = 1
  }
})
process.once('SIGTERM', stop)
process.once('SIGINT', stop)
