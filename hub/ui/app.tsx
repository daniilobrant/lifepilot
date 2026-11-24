import {TasksBoard} from './tasks-board.tsx'
import type {BoardItem,BoardSourcePatch} from '../runtime/tasks-board-types.ts'
import {ProjectDeadlineRow,ProjectMailSuggestions,ProjectProposal,ProjectsPanel,priorityText} from './projects.tsx'
import {priorityRank,type ProjectArea,type Project,type ProjectChange,type ProjectPlan,type ProjectSuggestion,type ProjectsOverview,type ProjectWork} from '../runtime/project-types.ts'
import {weekdayNames,type SeriesChange} from '../runtime/calendar-series-types.ts'
import type {CalendarConfirmation} from '../runtime/calendar-conflicts.ts'
import {briefingClock,calendarWeek,visibleOnStart} from './home-briefing.ts'
import {calendarLanes} from './calendar-lanes.ts'
import {quickReplyFor} from './chat-quick-replies.ts'
import {DateInput,TimeInput} from './presentation.tsx'
import {MAX_CHAT_INPUT} from '../runtime/model-payload.ts'
import { MailFinance } from './mail-finance.tsx'
import { OrderTracker } from './clothing-orders.tsx'
import { GroceryAnswerCard, GroceryPanel, scanGroceryFile } from './grocery.tsx'
import type { GroceryAnswer } from '../runtime/grocery-types.ts'
import { FinanceForm, FinancePanel } from './finance.tsx'
import { financeKinds, money, type FinanceChange } from '../runtime/finance-types.ts'
import type { TripChangeResult, TripChatPlan } from '../runtime/trip-types.ts'
import { TravelPlanner } from './travel.tsx'
import { resolveOutfitAnchor, type OutfitChatPlan, type OutfitChoice, type WardrobeItem } from '../runtime/outfit-types.ts'
import { useEffect, useEffectEvent, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ProfilePanel } from './personal-profile.tsx'
import { Dictation } from './dictation.tsx'
import { OutfitAssistant } from './outfit.tsx'
import { Applications } from './applications.tsx'
import { NewTask, TaskEditor, TaskList, displayTime, priorityNames } from './workspace.tsx'
import type { CalendarProposal, CalendarTarget } from '../connectors/mac-calendar.ts'
import type { ConnectorEntry } from '../connectors/catalog.ts'
import type { GoogleEvent, GoogleService, GoogleStatus } from '../connectors/google.ts'
import type { ScheduleRow, TaskContext, TaskRow, Week } from '../runtime/workspace.ts'
import type { ModelPreview } from '../runtime/model-payload.ts'
import type { AttentionMail, InboxRefresh, InboxPlan } from '../runtime/refresh-inbox.ts'
import type { InboxProposal } from '../runtime/inbox.ts'
import type { FreePlan } from '../runtime/availability.ts'
import { MAX_SOURCE_BYTES, sourceNote, type SourceNote } from '../runtime/source-note.ts'
import { inboxLabelNames, mailCategoryNames } from '../../agents/lifepilot/tools/classify-mail.ts'
import { categoryLabels, suggestCategory } from '../runtime/categories.ts'
import { dateInBerlin, mondayOf, shiftDay } from '../runtime/values.ts'
import type { Result } from '../../agents/lifepilot/tools/validate.ts'

type State = 'permission' | 'queued' | 'running' | 'review' | 'accepted' | 'denied' | 'cancelled' | 'failed'
type Approval = { id: string, action: 'model' | 'adopt', state: string, expires_at: string }
type Entry = { id: string, content: string, source: string, scope: 'owner' | 'lifepilot', replaces: string | null }
type Followup = { turn: number, input: string, previousResult: Result | null, sharesPrevious: boolean }
type Run = { projectChange?:ProjectChange, seriesChange?:SeriesChange, previous_run?:string|null, parent_run?:string|null, updated_at:string, financeChanges?:FinanceChange[], groceryChange?:GroceryAnswer, financeChange?:FinanceChange, googleSync?: 'pending' | 'saved' | 'removed' | null, id: string, input: string, state: State, origin: 'ui' | 'cli', result: Result | null,
  error: string | null, turn: number, followups: Followup[], version: string, approvals: Approval[], memory: Entry[], context: TaskContext[],
  reference_day: string | null, sourceName: string | null }
type Snapshot = { directTestChat?:boolean, nightbot?:boolean, googleAppointmentWrite?: boolean, modelName?: string, version: string, acceptance: boolean, chatMode: 'disabled' | 'synthetic' | 'private', runs: Run[], tasks?: TaskRow[], schedule?: ScheduleRow[], connectors?: ConnectorEntry[],
  agents: { name: string, description: string, version: string }[],
  calendarTarget?: { name: string, account: string } | null
  fixtures: { ui: string, cli: string, memory: string } | null }

const labels: Record<State, string> = {
  permission: 'Wartet auf Freigabe', queued: 'In der Warteschlange', running: 'In Bearbeitung',
  review: 'Zur Prüfung bereit', accepted: 'Übernommen', denied: 'Abgelehnt', cancelled: 'Abgebrochen', failed: 'Fehlgeschlagen',
}
const proposalNames = { rename:'Titel ändern', description:'Beschreibung ändern', category:'Kategorie ändern', archive:'Eintrag aus Kalender und Aufgaben entfernen', deadline: 'Frist ändern', priority: 'Priorität ändern', complete: 'Aufgabe abschließen',
  plan: 'Zeitblock planen', reschedule: 'Zeitblock verschieben', reminder: 'Erinnerung anlegen', remember: 'Präferenz merken', correct_memory: 'Präferenz korrigieren' }
const inFlight = new Set<State>(['queued', 'running'])
const openStates = new Set<State>(['permission', 'queued', 'running', 'review'])
const navigation = [
  { title: 'Übersicht', links: [['Start', 'home'], ['Kalender', 'calendar'], ['Aufgaben & Fristen','listtodo'], ['Posteingang', 'inbox']] },
  { title: 'Planen', links: [['Projekte','folder'], ['Bewerbungen', 'briefcase'], ['Urlaubsplaner', 'plane']] },
  { title: 'Persönlich', links: [['Outfit-Assistent', 'shirt'], ['Bestellungstracker', 'basket'], ['Finanzen & Abos','wallet'], ['Vorrat & Einkauf','basket']] },
  { title: 'Werkzeuge', links: [['Skills', 'wand']] },
] as const
type Page = typeof navigation[number]['links'][number][0] | 'Einstellungen'

const iconPaths = {
  envelope:'M3 5h18v14H3z M3 6l9 7 9-7',
  parcel:'M3 6l9-3 9 3v12l-9 3-9-3z M3 6l9 3 9-3M12 9v12m-5-16 9 3v6',
  chef:'M5 15a4 4 0 0 1 1-8 6 6 0 0 1 12 0 4 4 0 0 1 1 8v6H5zm0 2h14',
  clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l4 2',
  listtodo:'m3 6 2 2 3-4m3 3h10M4 13h3v3H4zm7 1h10M4 20h3m4 0h10',
  folder:'M3 6h7l2 2h9v12H3z M7 12h10m-10 4h7',
  basket: 'M3 9h18l-2 11H5z M8 9l4-6 4 6M9 13v3m6-3v3',
  camera: 'M3 7h5l2-3h4l2 3h5v13H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  wallet: 'M3 6h16v13H3z M3 6l12-3v3m4 5h2v5h-5a2.5 2.5 0 0 1 0-5z',
  leaf: 'M20 4c-4 3-9 0-13 4a7 7 0 0 0 10 10c4-4 1-9 3-14ZM3 21l8-8',
  home: 'm3 10 9-7 9 7v10H3z M9 20v-7h6v7',
  calendar: 'M4 5h16v16H4z M8 3v4m8-4v4M4 10h16m-12 5h2m4 0h2',
  inbox: 'M3 13 6 5h12l3 8v6H3z M3 13h5l2 3h4l2-3h5',
  briefcase: 'M8 7V5h8v2M3 7h18v13H3z M3 12h18m-11 0v2h4v-2',
  paperclip: 'm9 13 6-6a2 2 0 0 1 3 3l-8 8a4 4 0 0 1-6-6l9-9',
  plane: 'M17 3c2-1 4 1 3 3l-5 6 3 7-2 2-5-6-4 3v3l-2 1-2-5-2-2 1-2 5 1 3-3-7-5 2-2 8 3z',
  shirt: 'm8 4-5 3 2 5 3-1v9h8v-9l3 1 2-5-5-3a4 4 0 0 1-8 0Z',
  wand: 'm3 18 2 2L19 6l-2-2ZM13 8l3 3M5 3v6M2 6h6m12 7v6m-3-3h6',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M6 6l1 1m10 10 1 1m0-12-1 1M7 17l-1 1',
  chat: 'M20 11a8 8 0 0 1-8 8H4l2-4a8 8 0 1 1 14-4Z',
  plus: 'M12 5v14M5 12h14',
  search: 'm20 20-4-4m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
} as const

function Icon({ name }: { name: keyof typeof iconPaths }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name]} /></svg>
}

function Loading({ label }: { label: string }) {
  return <div className="loading" role="status"><span>{label}</span><progress aria-label={label} /></div>
}

async function api<T>(path: string, payload?: object, timeout = 7000): Promise<T> {
  const response = await fetch('/api' + path, {
    method: payload ? 'POST' : 'GET',
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(timeout),
  })
  const value = await response.json()
  if (!response.ok) throw Object.assign(new Error(value.error), { status:response.status })
  return value
}

const inboxCommand = /^(?:aktualisieren|(?:bitte\s+)?prüfe?\s+(?:den\s+)?(?:e[ -]?mail[ -]?verlauf|e[ -]?mails|posteingang)|(?:den\s+)?(?:e[ -]?mail[ -]?verlauf|e[ -]?mails|posteingang)\s+(?:prüfen|aktualisieren))[.!?]*$/iu

function Status({ state }: { state: State }) {
  return <span className={`status ${state}`}><span className="dot" />{labels[state]}</span>
}

const googleNames = { calendar: 'Google Kalender', 'calendar-write':'Google-Hauptkalender · Vorlesungsausfälle', gmail: 'Gmail · Nur Kopfzeilen', 'gmail-content': 'Gmail',
  'calendar-test': 'Google Kalender · Termine speichern', 'gmail-sort': 'Gmail · Labels verwalten' }

function PersonalAccountOverview({version,testMode}:{version:string,testMode:boolean}){
  const [gmail,setGmail]=useState<string>()
  const [labels,setLabels]=useState(false)
  useEffect(()=>{
    if(testMode) return
    let active=true
    void api<{gmail:string|null}>('/google/account').then(result=>{
      if(active && result.gmail) setGmail(result.gmail)
    }).catch(()=>{})
    void api<{enabled:boolean}>('/inbox/categorization').then(result=>{
      if(active) setLabels(result.enabled)
    }).catch(()=>{})
    return ()=>{active=false}
  },[testMode])
  return <section className="card settings">
    <h2>LifePilot {version}</h2>
    <p>{testMode?'Testprofil':gmail?'Persönliches Konto · '+gmail:'Persönliches Profil'}</p>
    {labels ? <p>Automatische Gmail-Kategorien aktiv</p>:null}
    <details><summary>Versionsverlauf</summary>
      <ul className="release-list">
        <li><strong>0.25.16</strong> · Bestellbilder, Vorrats-Texterkennung und einheitliche Formulare.</li>
        <li><strong>0.25.15</strong> · Ortssuche, Kalender und Mehrfachauswahl im Reiseformular.</li>
        <li><strong>0.25.14</strong> · Einkauf nach Kategorien, Vorratsaktionen rechts und eine kompakte Rezeptansicht.</li>
        <li><strong>0.25.13</strong> · Monatsfilter, Outfit- und Vorratsabläufe sowie einheitliche Ansichten.</li>
        <li><strong>0.25.12</strong> · Aufgabenboard, Projekt-Overlay und Archiv.</li>
        <li><strong>0.25.11</strong> · Aktuelle Zeiträume und Korrekturen im Pilot-Chat.</li>
        <li><strong>0.25.10</strong> · Projektphasen, verknüpfte Aufgaben und Tagesbriefing auf Start.</li>
        <li><strong>0.25.9</strong> · Kalenderüberschneidungen, Tagesansicht und passende Schnellantworten.</li>
        <li><strong>0.25.8</strong> · Projekte, Checklisten, Fristen und E-Mail-Updates.</li>
        <li><strong>0.25.7</strong> · Kalenderserien, Feiertage und lokale Änderungen nach Freigabe.</li>
        <li><strong>0.25.6</strong> · Weitergeleitete HFU-Mails und bestätigte Vorlesungsausfälle.</li>
        <li><strong>0.25.5</strong> · Mail-Tiefenprüfung, Bestellbeträge und Abo-Vorschläge.</li>
        <li><strong>0.25.4</strong> · Ticketbuchungen im Kalender und Finanzen, Gmail-Kategorien ohne Präfix.</li>
        <li><strong>0.25.3</strong> · Einheitliche LifePilot-Oberfläche mit kompakten Karten und Auswahlzuständen.</li>
        <li><strong>0.25.2</strong> · Längere Reiseanfragen mit konkreten Rückfragen und erhaltenen Reisewünschen.</li>
        <li><strong>0.25.1</strong> · PayPal-Zahlungen mit Gegenpartei und Zahlungsnotiz.</li>
        <li><strong>0.25.0</strong> · Bestellungstracker mit Lieferstatus, Retouren und Finanzbuchungen nach Bestätigung.</li>
        <li><strong>0.24.0</strong> · Automatische Gmail-Kategorien, Finanzvorschläge und getrennte Profilfelder für Studium und Beruf.</li>
        <li><strong>0.23.0</strong> · Produktlink-Import mit Varianten und Händlerbild.</li>
        <li><strong>0.22.0</strong> · Reisevorschau mit Freigabe und feste Navigation.</li>
      </ul>
    </details>
  </section>
}
function GoogleSettings({onMailConnectionChange}: {onMailConnectionChange:()=>void}) {
  const [status, setStatus] = useState<GoogleStatus[]>()
  const [gmailAccount, setGmailAccount] = useState<string | null>()
  useEffect(() => {
    if (!status?.some(item=>item.connected && (item.service==='gmail' || item.service==='gmail-content'))) {
      setGmailAccount(null)
      return
    }
    let current = true
    void api<{gmail:string|null}>('/google/account',undefined,15000).then(result=>{
      if (current) setGmailAccount(result.gmail)
    },()=>{ if (current) setGmailAccount(null) })
    return ()=>{current=false}
  },[status])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(() => new URLSearchParams(location.search).get('google') === 'cancelled'
    ? 'Die Google-Anmeldung wurde nicht abgeschlossen. Du kannst es erneut versuchen.' : '')
  useEffect(() => {
    let active = true
    void api<GoogleStatus[]>('/google/status').then(entries => { if (active) setStatus(entries) },
      cause => { if (active) setError(cause instanceof Error ? cause.message : 'Verbindungen konnten nicht geladen werden.') })
    return () => { active = false }
  }, [])
  async function act(action: () => Promise<void>) {
    setBusy(true); setError('')
    try { await action() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Google-Aktion fehlgeschlagen.') }
    finally { setBusy(false) }
  }
  function configure(service: GoogleService, file: File) {
    return act(async () => {
      if (!/\.json$/i.test(file.name) || file.size > 16000) throw new Error('Wähle die von Google heruntergeladene JSON-Datei.')
      let credentials: unknown
      try {
        const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()))
        const client = parsed?.installed
        if (typeof client?.client_id !== 'string' || typeof client?.client_secret !== 'string') throw new Error()
        credentials = { installed: { client_id: client.client_id, client_secret: client.client_secret } }
      } catch { throw new Error('Die Datei muss ein Google-OAuth-Client vom Typ Desktop-App sein.') }
      setStatus(await api('/google/configure', { service, credentials, confirm: true }))
      if (service === 'gmail' || service === 'gmail-content') onMailConnectionChange()
    })
  }
  function connect(service: GoogleService) {
    return act(async () => {
      const result = await api<{ url: string }>('/google/connect', { service, confirm: true })
      const target = new URL(result.url)
      if (target.origin !== 'https://accounts.google.com' || target.pathname !== '/o/oauth2/v2/auth') {
        throw new Error('Die Google-Anmeldung konnte nicht geöffnet werden.')
      }
      window.location.assign(target.href)
    })
  }
  return <section className="card settings google-connections" aria-label="Google-Verbindungen">
    <h2>Google-Verbindungen</h2>
    {gmailAccount && <p className="google-account"><small>Verbundenes Gmail-Konto</small><strong>{gmailAccount}</strong></p>}
    {!status && !error && <p role="status">Verbindungen werden geladen …</p>}
    {error && <p role="alert">{error}</p>}
    {!status && error && <button type="button" disabled={busy} onClick={()=>void act(async()=>setStatus(await api('/google/status')))}>Erneut versuchen</button>}
    {status?.filter(entry=>entry.service!=='gmail'||entry.connected||!status.some(other=>other.service==='gmail-content'&&other.connected))
      .map(entry=><article className="google-connection" key={entry.service}>
        <div><h3>{googleNames[entry.service]}</h3><span className="status">{entry.connected?'Verbunden':entry.configured?'Anmeldung offen':'Einrichtung offen'}</span></div>
        {entry.connected ? <button type="button" disabled={busy} onClick={()=>void act(async()=>{
          if (!window.confirm(googleNames[entry.service]+' von LifePilot trennen?')) return
          setStatus(await api('/google/disconnect',{service:entry.service,confirm:true}))
          if (entry.service==='gmail'||entry.service==='gmail-content') onMailConnectionChange()
        })}>Trennen</button> : entry.configured ?
          <button type="button" disabled={busy} onClick={()=>void connect(entry.service)}>Mit Google anmelden</button> :
          <label>OAuth-Clientdatei<input type="file" accept=".json,application/json" disabled={busy} onChange={event=>{
            const file=event.currentTarget.files?.[0]
            event.currentTarget.value=''
            if (file) void configure(entry.service,file)
          }}/></label>}
        {!entry.connected && entry.configured && <details><summary>OAuth-Clientdatei ersetzen</summary>
          <input type="file" aria-label={googleNames[entry.service]+' Clientdatei ersetzen'} accept=".json,application/json" disabled={busy} onChange={event=>{
            const file=event.currentTarget.files?.[0]
            event.currentTarget.value=''
            if (file) void configure(entry.service,file)
          }}/></details>}
      </article>)}
    {status?.some(entry=>!entry.configured) && <p><a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener noreferrer">OAuth-Client in Google Cloud öffnen</a></p>}
  </section>
}

function Section({ title, icon, children }: { title: string, icon: string, children: ReactNode }) {
  return <section className="section"><h2><span aria-hidden>{icon}</span>{title}</h2>{children}</section>
}

const inboxTopics = { returns: 'Retoure', deadlines: 'Frist', orders: 'Bestellung', appointments: 'Termin' }

const shipmentLabels = { order: 'Bestellung', 'return-open': 'Retoure offen', 'return-in-transit': 'Retoure unterwegs',
  'return-closed': 'Retoure eingegangen oder erledigt', 'return-unknown': 'Retourenstatus unklar' }

const inboxPollMs = 120_000
type InboxFeed = { messages: AttentionMail[], loadedAt: string }
const mailDate = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' })

function LiveInbox({ onDecision, batch, lecturesOnly=false, mailRefresh, onLectures, sourceId }: {
  onDecision: () => void, batch?: InboxRefresh, lecturesOnly?:boolean, mailRefresh?:string, onLectures?:(rows:InboxProposal[])=>void,sourceId?:string,
}) {
  const [proposals, setProposals] = useState<InboxProposal[]>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void api<InboxProposal[]>('/inbox').then(items => { if (active) setProposals(items) },
      cause => { if (active) setError(cause.message) })
    return () => { active = false }
  }, [batch,mailRefresh])

  async function act(action: () => Promise<void>) {
    setBusy(true); setError('')
    try {
      await action()
      setProposals(await api('/inbox'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Der Mail-Durchlauf ist fehlgeschlagen.')
    } finally { setBusy(false) }
  }

  useEffect(()=>{if(proposals)onLectures?.(proposals.filter(item=>item.state==='pending'&&item.lectureCancellation))},[proposals,onLectures])

  const pending = proposals?.filter(item => item.id===sourceId||item.state === 'pending' && item.category !== 'orders' && item.category !== 'returns' && (!lecturesOnly||Boolean(item.lectureCancellation))) ?? []
  if (!pending.length && !error) return null
  const heading=lecturesOnly?'Vorgeschlagene Vorlesungsausfälle':'Vorschläge aus deinen Mails'
  const visible=sourceId?[...pending].sort((a,b)=>Number(b.id===sourceId)-Number(a.id===sourceId)):pending
  return <section className="card settings" aria-label={heading}>
    <h2>{heading}</h2>
    {error ? <p role="alert">{error}</p> : null}
    {visible.slice(0, 12).map(item => {
      const cancellation=item.lectureCancellation
      if(cancellation){
        const target=cancellation.target
        const destination=target?.google?.calendar==='primary'?'Google-Hauptkalender':target?.google?'Google-Kalender „LifePilot“':'LifePilot-Kalender'
        return <section className="mail-lecture-cancellation" key={item.id}>
          <h3>Ausfall vorgeschlagen · {target?.title??item.subject}</h3>
          <p>{[cancellation.date?formatDate(cancellation.date):'',target?.google?.start.includes('T')?clockFormat.format(new Date(target.google.start)):
            target?.local?.start?clockFormat.format(new Date(target.local.start)):cancellation.time,item.evidence,target?destination:''].filter(Boolean).join(' · ')}</p>
          {cancellation.reason?<p>{cancellation.reason}</p>:null}
          <div className="actions">
            <button type="button" className="primary" disabled={busy||!target||Boolean(cancellation.reason)}
              onClick={()=>void act(async()=>{await api('/inbox/decision',{proposal:item.id,decision:'accept',lectureTarget:target,confirm:true},20000);onDecision()})}>
              {cancellation.approvedTarget?'Entfernen erneut versuchen':'Akzeptieren und Termin entfernen'}
            </button>
            {!cancellation.approvedTarget?<button type="button" disabled={busy} onClick={()=>void act(async()=>{
              await api('/inbox/decision',{proposal:item.id,decision:'deny',confirm:true});onDecision()
            })}>Ablehnen</button>:null}
          </div>
        </section>
      }
      const plan: InboxPlan | undefined = batch?.plans.find(candidate => candidate.id === item.id)
      return <section key={item.id}>
      <h3>{inboxTopics[item.category]} · {item.subject}</h3>
      <p>{item.evidence}</p>
      {item.event ? <p>Veranstaltung · {formatDate(item.event.date)}</p> : item.due_date ? <p>Frist aus der Mail · {formatDate(item.due_date)}</p> : <p>Keine eindeutige Frist im Mailtext.</p>}
      {plan && item.state === 'pending' ? <p>Zeitvorschlag · {displayTime(plan.at)}–{clockFormat.format(new Date(plan.endsAt))}</p> : null}
      {item.state === 'pending' ? <div className="actions">
        {plan ? <button disabled={busy} onClick={() => void act(async () => {
          await api('/inbox/decision', { proposal: item.id, decision: 'accept', slot: plan.at, confirm: true }, 15000)
          onDecision()
        })}>Aufgabe und Zeitblock bestätigen</button> : null}
        {(['accept', 'deny'] as const).map(decision => <button key={decision} disabled={busy}
          onClick={() => void act(async () => {
            await api('/inbox/decision', { proposal: item.id, decision, confirm: true })
            onDecision()
          })}>{decision === 'accept' ? item.event ? 'In Kalender übernehmen' : 'Als Aufgabe bestätigen' : 'Ablehnen'}</button>)}
      </div> : <p>{item.state === 'accepted' ? 'Aufgabe gespeichert' : 'Abgelehnt'}</p>}
    </section>})}
  </section>
}

function RunRow({ run, onClick }: { run: Run, onClick: () => void }) {
  return <button className="run-row card" onClick={onClick}>
    <span className="run-title">{run.input}</span><Status state={run.state} /><span className="arrow" aria-hidden>›</span>
  </button>
}

const clockFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })

function CalendarExport({ slot, preferred, onSaved }: { slot: string, preferred: boolean, onSaved: () => void }) {
  const [choices, setChoices] = useState<CalendarTarget[]>()
  const [target, setTarget] = useState('')
  const [proposal, setProposal] = useState<CalendarProposal>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')
  async function act(operation: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError('')
    try { await operation() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Kalenderaktion fehlgeschlagen.') }
    finally { setBusy(false) }
  }
  function preview(calendar?: string) {
    return act(async () => setProposal(await api('/mac-calendar/preview', { slot, calendar })))
  }
  return <details>
    <summary>In Mac-Kalender eintragen</summary>
    {saved ? <p role="status">{saved}</p> : proposal ? <>
      <p>{proposal.title} · {displayTime(proposal.start)} bis {displayTime(proposal.end)}</p>
      <p>Ziel: {proposal.target.name} ({proposal.target.account})</p>
      <button type="button" disabled={busy} onClick={() => void act(async () => {
        try {
          await api('/mac-calendar/approve', { approval: proposal.approval, confirm: true }, 65000)
          setSaved('An den Mac-Kalender übergeben. Google synchronisiert über den ausgewählten Account.')
          onSaved()
        } finally { setProposal(undefined) }
      })}>Termin im Zielkalender speichern</button>
      <button type="button" disabled={busy} onClick={() => setProposal(undefined)}>Zurück</button>
    </> : <>
      {preferred ? <button type="button" disabled={busy} onClick={() => void preview()}>Vorschau für gemerkten Kalender</button> : null}
      {choices ? <>
        {choices.length ? <>
          <label>Zielkalender<select value={target} onChange={event => setTarget(event.target.value)}>
            <option value="">Google-Kalender auswählen</option>
            {choices.map(item => <option key={item.id} value={item.id}>{item.name} ({item.account})</option>)}
          </select></label>
          <button type="button" disabled={busy || !target} onClick={() => void preview(target)}>Terminvorschau</button>
        </> : <p>Kein beschreibbarer Internetkalender gefunden.</p>}
      </> : null}
      <button type="button" disabled={busy} onClick={() => void act(async () => {
        setTarget('')
        setChoices(await api('/mac-calendar/list', { confirm: true }, 65000))
      })}>Mac-Kalender laden</button>
    </>}
    {error ? <p role="alert">{error}</p> : null}
  </details>
}

function FreeWindowFinder({ date, onDraft, allowMac, work }: { date: string, onDraft?: (input: string) => void, allowMac: boolean, work?:ProjectWork }) {
  const [result, setResult] = useState<FreePlan>()
  const [usedMac, setUsedMac] = useState(false)
  const [macReady, setMacReady] = useState(false)
  const [title, setTitle] = useState(work?.title??'')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const query = new URLSearchParams()
    for (const key of ['date', 'start', 'end', 'days', 'minutes']) query.set(key, String(fields.get(key) ?? ''))
    setBusy(true); setError(''); setResult(undefined)
    try {
      const mac = allowMac && fields.has('mac')
      if (mac && !macReady) {
        await api('/mac-calendar/list', { confirm: true }, 65000)
        setMacReady(true)
      }
      setResult(mac ? await api<FreePlan>('/mac-calendar/free-windows', {
        date: query.get('date'), start: query.get('start'), end: query.get('end'),
        minutes: Number(query.get('minutes')), days: Number(query.get('days')), confirm: true,
      }, 65000) : await api<FreePlan>('/free-windows?' + query))
      setUsedMac(mac)
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Zeitfenster konnten nicht berechnet werden.') }
    finally { setBusy(false) }
  }
  return <details className="card settings disclosure calendar-tools" open={work?true:undefined}><summary>Freie Zeit finden</summary>
    {work?<p>{work.title}{work.date?' · Zieldatum '+formatDate(work.date):''}</p>:null}
    <form onSubmit={search}>
      <div className="calendar-filter-fields">
        <label>Ab Datum<DateInput name="date"  defaultValue={date} required /></label>
        <label>Tage<input name="days" type="number" defaultValue={work?.date&&work.date>=date?Math.min(7,Math.floor((Date.parse(work.date)-Date.parse(date))/86_400_000)+1):7} min={1} max={7} required /></label>
        <label>Dauer in Minuten<input name="minutes" type="number" defaultValue={60} min={15} max={480} required /></label>
        <label>Frühestens<TimeInput name="start" defaultValue="09:00" required /></label>
        <label>Spätestens bis<TimeInput name="end" defaultValue="20:00" required /></label>
      </div>
      {allowMac ? <label className="data-check"><input type="checkbox" name="mac" />Mac-Kalender berücksichtigen</label> : null}
      {onDraft ? <label className="calendar-purpose">Vorhaben für den Chat (optional)<input value={title} maxLength={120} onChange={event => setTitle(event.target.value)} /></label> : null}
      <button className="primary" disabled={busy}>{busy ? 'Suche läuft …' : 'Zeitfenster suchen'}</button>
    </form>
    {error ? <p role="alert">{error}</p> : null}
    {result ? <div aria-live="polite">
      <p>{result.windows.length ? (usedMac ? 'Berücksichtigt Mac-Kalender und lokale Zeitblöcke' : 'Berücksichtigt lokale Zeitblöcke') : 'In diesem Zeitraum passt kein Zeitfenster.'}</p>
      {result.datesWithUntimedAppointments.length ? <p>Termine ohne Uhrzeit bitte prüfen · {result.datesWithUntimedAppointments.map(formatDate).join(', ')}</p> : null}
      <ul>{result.windows.map(window => <li key={window.at}>
        <time dateTime={window.at}>{displayTime(window.at)} – {clockFormat.format(new Date(window.endsAt))}</time>
        {onDraft && title.trim() ? <button type="button" onClick={() => onDraft(
          `Lege die Aufgabe „${title.trim()}“ an und plane am ${window.day} um ${clockFormat.format(new Date(window.at))} Uhr einen Block von ${result.query.minutes} Minuten.`
        )}>Im Chat planen</button> : null}
      </li>)}</ul>
    </div> : null}
  </details>
}

const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const monthName = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' })
function monthShift(month: string, delta: number) {
  const date = new Date(month + 'T00:00:00Z')
  date.setUTCMonth(date.getUTCMonth() + delta)
  return date.toISOString().slice(0, 10)
}

type CalendarEntry = { key: string, title: string, at?: string, endsAt?:string, category?: string, taskId?: string, cancellation?:boolean, kind?:string }
const fullDayFormat = new Intl.DateTimeFormat('de-DE', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })

function CalendarOverview({ today, openTask, updateKey, mode, onCalendar, lectureNotices=[], briefing }: {
  today: string, openTask: (id: string) => void, updateKey: string, mode: 'week' | 'month', onCalendar?: () => void, lectureNotices?:InboxProposal[], briefing?:{now:Date,remaining:boolean,tomorrowItems:string[]}
}) {
  const currentMonth = today.slice(0, 7) + '-01'
  const [month, setMonth] = useState(currentMonth)
  const [activeDay, setActiveDay] = useState(today)
  const [dayView,setDayView]=useState(false)
  const [plan, setPlan] = useState<Week & { external?: GoogleEvent[], calendarIncomplete?: boolean, holidays?:{date:string,name:string}[] }>()
  const [calendarError, setCalendarError] = useState('')
  const [calendarLoading,setCalendarLoading]=useState(true)
  const firstDay = mondayOf(mode === 'month' ? month : today)
  const days = mode === 'month' ? 42 : 8
  const lastDay = shiftDay(firstDay, days - 1)

  useEffect(() => {
    let current = true
    setCalendarLoading(true)
    void api<Week & { external?: GoogleEvent[], calendarIncomplete?: boolean, holidays?:{date:string,name:string}[] }>('/calendar-grid?' + new URLSearchParams({ start: firstDay, days: String(days) })).then(result => {
      if (current) { setCalendarError(''); setPlan(result) }
    }, cause => { if (current) setCalendarError(cause.message) }).finally(()=>{if(current)setCalendarLoading(false)})
    return () => { current = false }
  }, [firstDay, days, updateKey])

  const current = plan?.start === firstDay && plan.end === lastDay ? plan : undefined
  function entriesFor(date: string): CalendarEntry[] {
    const local = current?.entries.filter(item => item.day === date && (mode==='month'||['slot','appointment','travel'].includes(item.kind))).map(item => ({
      key: 'local:' + item.id, title: item.title, kind:item.kind, at: item.at ?? undefined, endsAt:item.endsAt??undefined, category: item.category ?? undefined, taskId: item.kind==='travel' ? undefined : item.taskId,
      cancellation:lectureNotices.some(row=>row.lectureCancellation?.date===date&&row.lectureCancellation.target?.local&&
        (row.lectureCancellation.target.local.slot??row.lectureCancellation.target.local.id)===item.id),
    })) ?? []
    const external = current?.external?.filter(item => item.allDay ? item.start <= date && item.end > date :
      dateInBerlin(new Date(item.start)) === date).map(item => ({
        key: 'google:' + item.id, title: item.title + ' · Google Kalender', at: item.allDay ? undefined : item.start, endsAt:item.allDay?undefined:item.end,
        cancellation:lectureNotices.some(row=>row.lectureCancellation?.date===date&&row.lectureCancellation.target?.google?.id===item.id),
        category: suggestCategory(item.title, '') ?? undefined,
      })) ?? []
    const holidays:CalendarEntry[]=current?.holidays?.filter(item=>item.date===date&&!external.some(event=>event.title.toLowerCase()===item.name.toLowerCase())).map(item=>({key:'holiday:'+item.date,title:item.name,category:'holiday'}))??[]
    return [...holidays,...local, ...external].sort((a, b) => (a.at ? Date.parse(a.at) : 0) - (b.at ? Date.parse(b.at) : 0))
  }
  const selectedDay = activeDay < firstDay || activeDay > lastDay ? today : activeDay
  const agenda = mode === 'week' ? entriesFor(selectedDay) : []
  const todayHasWork=Boolean(briefing?.remaining||briefing&&entriesFor(today).some(item=>
    item.category!=='holiday'&&(!item.at||Date.parse(item.endsAt??item.at)>briefing.now.valueOf())))
  const clock=briefing?briefingClock(briefing.now):null
  const tomorrow=shiftDay(today,1)
  const showTomorrow=!!clock?.evening&&!todayHasWork
  const passed=(item:CalendarEntry)=>!!(briefing&&selectedDay===today&&item.at&&Date.parse(item.endsAt??item.at)<=briefing.now.valueOf())
  const dayLabel=(date:string)=>fullDayFormat.format(new Date(date))
  const clickDay=(date:string)=>{
    if(!date.startsWith(month.slice(0,7)))setMonth(date.slice(0,7)+'-01')
    setActiveDay(date)
    setDayView(true)
  }
  return <section className="card settings calendar-overview" aria-label="Kalenderübersicht">
    <div className="editor-title"><h2>{mode==='week'?'Aktuelle Woche · KW '+calendarWeek(today):dayView?dayLabel(selectedDay):monthName.format(new Date(month))}</h2>
      {mode === 'month' ? <div className="actions">
        {dayView?<button type="button" onClick={()=>setDayView(false)}>Monat</button>:null}
        <button aria-label={dayView?'Vorheriger Tag':'Vorheriger Monat'} onClick={() => {
          if(dayView)clickDay(shiftDay(selectedDay,-1))
          else setMonth(value=>monthShift(value,-1))
        }}>‹</button>
        <button onClick={() => {setMonth(currentMonth);setActiveDay(today)}}>Heute</button>
        <button aria-label={dayView?'Nächster Tag':'Nächster Monat'} onClick={() => {
          if(dayView)clickDay(shiftDay(selectedDay,1))
          else setMonth(value=>monthShift(value,1))
        }}>›</button>
      </div> : <button className="quiet" onClick={onCalendar}>Kalender öffnen <span aria-hidden>→</span></button>}
    </div>
    <div className="actions calendar-legend" aria-label="Kalenderfarben">{Object.entries(categoryLabels).map(([key, label]) =>
      <span data-category={key} key={key}>{label}</span>)}</div>
    {calendarError ? <p role="alert">{calendarError}</p> : calendarLoading||!current ? <Loading label={mode==='week'?'Briefing wird aktualisiert …':'Kalender wird geladen …'} /> : null}
    {current?.calendarIncomplete ? <p className="calendar-notice">Google-Termine sind nur teilweise verfügbar.</p> : null}
    {mode === 'week' ? <>
      <div className="calendar-week-grid" aria-label="Tag der Woche">
        {weekdays.map((day, offset) => {
          const date = shiftDay(firstDay, offset)
          const markers = entriesFor(date)
          return <button type="button" className="week-date" aria-pressed={date === selectedDay} aria-current={date === today ? 'date' : undefined}
            aria-label={fullDayFormat.format(new Date(date)) + (markers.length ? ', ' + markers.length + ' Einträge' : '')}
            key={date} onClick={() => setActiveDay(date)}>
            <span>{day}</span><time dateTime={date}>{Number(date.slice(-2))}</time>
            <span className="week-dots" aria-hidden>{markers.slice(0, 3).map(item => <i key={item.key} data-category={item.category} />)}</span>
          </button>
        })}
      </div>
      {current&&selectedDay===today&&clock?<p className="briefing-status">{todayHasWork?
        clock.morning?'Was steht heute an?':'Was steht heute noch an?':
        showTomorrow?'Für heute stehen keine Sachen an.':'Heute stehen keine Sachen an.'}</p>:null}
      {current ? <div className="week-agenda" aria-label={'Termine am ' + fullDayFormat.format(new Date(selectedDay))}>
        {agenda.length ? <ul>{agenda.map(item => {
          const content = <><span className="agenda-time">{item.at ? clockFormat.format(new Date(item.at)) : '–'}</span>
            <span className="agenda-marker" data-category={item.category} aria-hidden /><span>{item.title}
              {item.category && Object.hasOwn(categoryLabels, item.category) ?
                <small className="agenda-category">{categoryLabels[item.category as keyof typeof categoryLabels]}</small> : null}</span></>
          return <li key={item.key} data-category={item.category} className={passed(item)?'passed-appointment':undefined}>{item.taskId ? <button className="agenda-line quiet" onClick={() => openTask(item.taskId!)}>{content}</button> :
            <div className="agenda-line">{content}</div>}</li>
        })}</ul> : selectedDay!==today?<p className="empty">Keine Einträge für diesen Tag.</p>:null}
      </div> : null}
      {current&&selectedDay===today&&showTomorrow?<div className="briefing-tomorrow">
        <h3>Diese Sachen stehen morgen an:</h3>
        <ul>{entriesFor(tomorrow).map(item=><li key={item.key}>{item.at?clockFormat.format(new Date(item.at))+' · ':''}{item.title}</li>)}
          {briefing?.tomorrowItems.map((item,index)=><li key={index}>{item}</li>)}</ul>
        {!entriesFor(tomorrow).length&&!briefing?.tomorrowItems.length?<p>Keine Einträge.</p>:null}
      </div>:null}
    </> : dayView ? current && <CalendarDay entries={entriesFor(selectedDay)} openTask={openTask} /> : <div className="calendar-month">
      {weekdays.map(day => <span className="calendar-weekday" key={day}>{day}</span>)}
      {Array.from({ length: days }, (_, offset) => {
        const date = shiftDay(firstDay, offset)
        const entries=entriesFor(date)
        const overlap=calendarLanes(entries.filter(item=>item.endsAt)).some(group=>group.lanes.length>1)
        return <div key={date} data-today={date === today} data-outside={!date.startsWith(month.slice(0, 7))} className="calendar-day">
          <button type="button" className="calendar-date-button quiet" aria-label={dayLabel(date)+(overlap?', mit Überschneidungen':'')}
            title={overlap?'Überschneidungen in der Tagesansicht anzeigen':'Tagesansicht öffnen'} onClick={()=>clickDay(date)}>
            <time dateTime={date}>{Number(date.slice(-2))}</time>{overlap?<span className="calendar-overlap-dot" aria-hidden/>:null}
          </button>
          {entries.map(item => {
            const text = (item.at ? clockFormat.format(new Date(item.at)) + ' ' : '') + item.title + (item.cancellation?' · Ausfall vorgeschlagen':'')
            return item.taskId ? <button key={item.key} type="button" className="calendar-entry" data-category={item.category} data-cancellation={item.cancellation}
              title={text} onClick={() => openTask(item.taskId!)}>{text}</button> :
              <div key={item.key} className="calendar-entry" data-category={item.category} data-cancellation={item.cancellation} title={text}>{text}</div>
          })}
        </div>
      })}
    </div>}
  </section>
}


function CalendarDay({entries,openTask}:{entries:CalendarEntry[],openTask:(id:string)=>void}){
  if(!entries.length)return <p className="empty">Keine Einträge für diesen Tag.</p>
  const time=(value:string)=>clockFormat.format(new Date(value))
  return <div className="calendar-day-agenda" aria-label="Tagesansicht">{calendarLanes(entries).map(group=>
    <div key={group.entries[0].key} className="calendar-lanes" role="group" aria-label={group.lanes.length>1?'Überschneidende Termine':undefined}>
      {group.lanes.map(lane=><div className="calendar-lane" key={lane[0].key}>{lane.map(item=>{
        const text=<><small>{item.at?time(item.at)+(item.endsAt?'–'+time(item.endsAt):''):'Ganztägig'}</small>
          <strong>{item.title}</strong>{item.cancellation?<small>Ausfall vorgeschlagen</small>:null}</>
        return item.taskId?
          <button type="button" key={item.key} className="calendar-entry" data-category={item.category} data-cancellation={item.cancellation}
            onClick={()=>openTask(item.taskId!)}>{text}</button>:
          <div key={item.key} className="calendar-entry" data-category={item.category} data-cancellation={item.cancellation}>{text}</div>
      })}</div>)}
    </div>)}</div>
}

function SeriesProposal({change}:{change:SeriesChange}){
  const {definition,blocks,skipped,existing}=change
  return <section className="task" aria-label="Serienvorschlag">
    <strong>{definition.title}</strong>
    <p>{definition.weekdays.map(day=>weekdayNames[day]).join(' und ')} · {definition.startTime} Uhr
      {definition.endTime?' bis '+definition.endTime+' Uhr':''}</p>
    <p>{formatDate(blocks[0]?.date??definition.startDate)}{definition.endDate?' bis '+formatDate(definition.endDate):' · ohne Enddatum'}</p>
    {existing?<p>Die gesamte Serie mit {existing.count} Einträgen wird nach Bestätigung entfernt.</p>:
      <p>{blocks.length} {definition.kind==='appointment'?'Termine':definition.endDate?'Erinnerungen':'vorbereitete Erinnerungen, danach fortlaufend'}</p>}
    {!existing&&definition.kind==='appointment'&&blocks.length?<details><summary>Einzelne Termine ansehen</summary>
      <ul>{blocks.slice(0,32).map(block=><li key={block.at}>{formatDate(block.date)} · {definition.startTime}–{definition.endTime} Uhr</li>)}</ul>
      {blocks.length>32?<small>Und {blocks.length-32} weitere Termine</small>:null}
    </details>:null}
    {skipped.length?<details><summary>{skipped.length} Feiertage ausgelassen</summary><ul>{skipped.map(day=><li key={day.date}>{formatDate(day.date)} · {day.name}</li>)}</ul></details>:null}
  </section>
}

function ProposalEditor({ result, save }: { result: Result, save: (result: Result) => Promise<unknown> }) {
  const [draft, setDraft] = useState(result)
  const [saving, setSaving] = useState(false)
  return <details><summary>Vorschlag bearbeiten</summary>
    <form onSubmit={async event => {
      event.preventDefault()
      if (saving) return
      setSaving(true)
      try { await save(draft) } finally { setSaving(false) }
    }}>
      {draft.tasks.map((task, index) => <fieldset key={index}>
        <legend>Aufgabe {index + 1}</legend>
        <label>Titel<input value={task.title} required maxLength={120} onChange={event => setDraft({
          ...draft, tasks: draft.tasks.map((item, i) => i === index ? { ...item, title: event.target.value } : item),
        })} /></label>
        <label>Frist<DateInput  value={task.date ?? ''} required={task.kind === 'appointment'} onChange={event => setDraft({
          ...draft, tasks: draft.tasks.map((item, i) => i === index ? { ...item, date: event.target.value || null } : item),
        })} /></label>
      </fieldset>)}
      {draft.actions?.map((action, index) => {
        if (action.kind === 'complete' || action.kind === 'archive' || action.kind === 'remember' || action.kind === 'correct_memory') return null
        const update = (value: string) => setDraft({ ...draft, actions: draft.actions?.map((item, i) => i === index ? { ...item, value } : item) })
        return <label key={index}>{proposalNames[action.kind]}
          {action.kind === 'priority' ? <select value={action.value} onChange={event => update(event.target.value)}>
            {Object.entries(priorityNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select> : <input type={action.kind === 'deadline' ? 'date' : ['plan','reschedule','reminder'].includes(action.kind)?'datetime-local':'text'} value={action.value} required onChange={event => update(event.target.value)} />}
        </label>
      })}
      <button type="submit" disabled={saving || JSON.stringify(draft) === JSON.stringify(result)}>Vorschlag aktualisieren</button>
    </form>
  </details>
}

function AnalysisApproval({ runId, approval, busy, decide, modelName }: {
  runId: string, approval: Approval, busy: boolean, modelName: string, decide: (decision: 'approve' | 'deny') => void
}) {
  const [preview, setPreview] = useState<ModelPreview>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function inspect() {
    setError('')
    setLoading(true)
    try {
      const value = await api<ModelPreview>(`/runs/${runId}/model-preview?approval=${encodeURIComponent(approval.id)}`)
      if (value.approval === approval.id) setPreview(value)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Datenvorschau nicht verfügbar.')
    } finally { setLoading(false) }
  }
  return <div className="approval">
    <strong>Analyse mit {modelName} freigeben</strong>
    <p>Prüfe, welche Auftragsdaten LifePilot für diese Analyse an {modelName} sendet.</p>
    {preview ? <>
      <details open><summary>Nachrichten für {modelName}</summary>
        {preview.payload.messages.map((message, index) => <div className="note" key={index}>
          {message.input}
          {message.previousResult ? <small><br />Ein früherer Entwurf ist im Kontext enthalten.</small> : null}
        </div>)}
      </details>
      <details><summary>Erinnerungen ({preview.payload.memory.length})</summary>
        {preview.payload.memory.map(entry => <p key={entry.id}>{entry.content} · <small>{entry.source}</small></p>)}
      </details>
      <details><summary>Aufgabenkontext ({preview.payload.context.length})</summary>
        {preview.payload.context.map(task => <p key={task.id}>{task.title} · {task.detail}{task.due_date ? ' · ' + formatDate(task.due_date) : ''}</p>)}
      </details>
      {preview.payload.sourceNote ? <details><summary>Textquelle · {preview.payload.sourceNote.name}</summary>
        <pre className="model-preview">{preview.payload.sourceNote.text}</pre>
      </details> : null}
      <details><summary>Vollständige Auftragsdaten</summary>
        <pre className="model-preview">{JSON.stringify(preview.payload, null, 2)}</pre>
      </details>
    </> : <button type="button" disabled={busy || loading} onClick={() => void inspect()}>{loading ? 'Vorschau wird geladen …' : `Daten für ${modelName} ansehen`}</button>}
    {error ? <p role="alert">{error}</p> : null}
    <div className="actions">
      <button disabled={busy || !preview} className="primary" onClick={() => decide('approve')}>Analyse erlauben</button>
      <button disabled={busy} onClick={() => decide('deny')}>Ablehnen</button>
    </div>
  </div>
}

const chatSkills: Record<NonNullable<Result['skill']>, string> = {
  appointment: 'Kalenderplanung', calendar_series:'Kalenderserien', projects:'Projektplaner', inbox_refresh: 'E-Mail-Manager', smart_planning: 'Smart Planning',
  deadline_guardian: 'Deadline Guardian', applications: 'Bewerbungsmanager', outfit: 'Outfit-Assistent', travel: 'Urlaubsplaner', finance:'Finanzen & Abos', grocery:'Vorrat & Einkauf', orders:'Bestellungstracker',
}

function ChatQuickReply({questions,onAnswer,busy}:{questions:string[],onAnswer:(text:string)=>void,busy:boolean}){
  const [from,setFrom]=useState('')
  const [to,setTo]=useState('')
  const reply=quickReplyFor(questions)
  if(!reply)return null
  return reply.kind==='date-range'?<div className="chat-period">
    <label>Von <DateInput aria-label="Von" value={from} max={to||undefined} onChange={event=>setFrom(event.target.value)} /></label>
    <label>Bis <DateInput aria-label="Bis" value={to} min={from||undefined} onChange={event=>setTo(event.target.value)} /></label>
    <button type="button" disabled={busy||!from||!to||to<from} onClick={()=>onAnswer(formatDate(from)+' bis '+formatDate(to))}>
      Zeitraum übernehmen
    </button>
  </div>:<div className="actions chat-quick-replies">{reply.choices.map(answer=>
    <button type="button" disabled={busy} onClick={()=>onAnswer(answer)} key={answer}>{answer}</button>)}</div>
}

function CalendarConflictDialog({confirmation,busy,error,onConfirm,onCancel}:{
  confirmation:CalendarConfirmation,busy:boolean,error?:string,onConfirm:()=>void,onCancel:()=>void
}){
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{dialog.current?.showModal()},[])
  const hasConflicts=confirmation.conflicts.length>0
  return <dialog ref={dialog} className="task-dialog card calendar-conflict-dialog" aria-labelledby="calendar-conflict-title"
    onCancel={event=>{event.preventDefault();if(!busy)onCancel()}}>
    <h2 id="calendar-conflict-title">{hasConflicts?'Terminüberschneidung':'Kalenderprüfung'}</h2>
    {hasConflicts?<><p>Diese Termine finden ganz oder teilweise gleichzeitig statt.</p>
      <ul>{confirmation.conflicts.map(item=><li key={item.key}><strong>{item.title}</strong>
        <span>{formatDate(dateInBerlin(new Date(item.at)))} · {clockFormat.format(new Date(item.at))}–{clockFormat.format(new Date(item.endsAt))}
          {item.source==='google'?' · Google Kalender':item.source==='proposal'?' · Im selben Vorschlag':''}</span>
        {item.proposed!==item.title?<small>Überschneidet sich mit „{item.proposed}“</small>:null}
      </li>)}</ul></>:null}
    {confirmation.incomplete?<p>Ein Teil der verbundenen Google-Kalender konnte nicht vollständig geprüft werden.</p>:null}
    {error?<p role="alert">{error}</p>:null}
    <div className="actions">
      <button type="button" autoFocus disabled={busy} onClick={onCancel}>Abbrechen</button>
      <button type="button" disabled={busy} className="primary" onClick={onConfirm}>
        {hasConflicts?'Trotz Überschneidung bestätigen':'Planung bestätigen'}
      </button>
    </div>
  </dialog>
}

function FinanceProposal({run, change, index, mutate}:{run:Run,change:FinanceChange,index:number,mutate:(path:string,payload:object)=>Promise<unknown>}) {
  const [editing,setEditing]=useState(false)
  const {draft,entry}=change
  return <section className="task">
    <strong>{financeKinds[draft.kind]} {entry?'ändern':'eintragen'} · {draft.title}</strong>
    <p>{entry?money(entry.cents)+' → ':''}{money(draft.cents)} · {draft.date??change.month}{draft.kind==='expense'?'':draft.cycle==='yearly'?' · jährlich':' · monatlich'}</p>
    {draft.category?<small>{draft.category}</small>:null}
    {run.state==='review' && (editing?<FinanceForm draft={draft} label="Entwurf aktualisieren" cancel={()=>setEditing(false)} save={async value=>{
      if(!await mutate('/finance/chat-draft',{run:run.id,draft:value,index,confirm:true})) throw Error('Der Entwurf konnte nicht geändert werden.')
      setEditing(false)
    }}/>:<button type="button" className="quiet" onClick={()=>setEditing(true)}>Entwurf bearbeiten</button>)}
  </section>
}

function RunDetail({ run, mutate, busy, onReply, actionError, modelName, googleWrite, auditDetails, onQuickReply, compact = false, grouped = false }: {
  auditDetails: boolean, compact?:boolean, grouped?:boolean, onQuickReply?: (text: string) => void,
  googleWrite: boolean,
  modelName: string,
  run: Run, onReply?: () => void, mutate: (path: string, payload: object) => Promise<unknown>, busy: boolean, actionError?: string
}) {
  const [recipeSaved,setRecipeSaved]=useState(false)
  const approval = run.approvals.find(item => item.state === 'pending')
  const context = run.context ?? []
  const titles = new Map(context.map(task => [task.id, task.title]))
  const actionable = Boolean(run.projectChange || run.seriesChange || run.groceryChange?.write || run.financeChange || run.result?.tasks.length || run.result?.actions?.length)
  const slotTitles = new Map(context.flatMap(task => task.schedule.map(item => [item.id, task.title] as const)))
  const actionTitle = (target: string) => titles.get(target) ?? slotTitles.get(target) ?? 'Aufgabe'
  const decide = (decision: 'approve' | 'deny', googleSync = false) => {
    if (approval) void mutate(`/runs/${run.id}/decision`, { approval: approval.id, decision, googleSync })
  }
  return <article className="run-detail">
    {!grouped && <div className="note chat-message-user">{run.input}</div>}
    {run.sourceName ? <p><small>Textquelle · {run.sourceName}</small></p> : null}
    {(run.followups ?? []).map(message => <div key={message.turn}>
      {message.previousResult && !auditDetails ? <div className="chat-message-assistant">
        {message.previousResult.summary ? <p>{message.previousResult.summary}</p> : null}
        {message.previousResult.questions.map((question,index) => <p key={index}>{question}</p>)}
        {message.previousResult.tasks.map((task,index) => <p key={index}>{task.title}{task.date ? ' · ' + formatDate(task.date) : ''}</p>)}
      </div> : null}
      {message.previousResult && auditDetails ? <details className="history-note"><summary>Vorherige Antwort</summary>
        {message.previousResult.correctedInput ? <p>Sprachlich korrigiert: {message.previousResult.correctedInput}</p> : null}
        {message.previousResult.summary ? <p>{message.previousResult.summary}</p> : null}
        {message.previousResult.questions.map((question, i) => <p key={i}>{question}</p>)}
        {message.previousResult.tasks.map((task, i) => <p key={i}>{task.title}{task.date ? ' · ' + formatDate(task.date) : ''}</p>)}
        {message.previousResult.actions?.map((action, i) => <p key={i}>{proposalNames[action.kind]} · {action.value}</p>)}
        {!message.sharesPrevious ? <small>Diese frühere Antwort bleibt lokal.</small> : null}
      </details> : null}
      <div className="note chat-message-user">{message.input}</div>
    </div>)}
    <div className="run-meta">{run.state === 'accepted' && !actionable ? <span className="status accepted">Beantwortet</span> : <Status state={run.state} />}{run.result?.skill ? <span className="chat-skill">{run.result.skill==='grocery'&&run.groceryChange?.steps.length?'Kochassistent':chatSkills[run.result.skill]}</span> : null}
      {auditDetails ? <small>LifePilot {run.version} · {run.origin === 'cli' ? 'CLI' : 'Oberfläche'}</small> : null}</div>
    {run.error ? <p className="error-text">{run.error}</p> : null}
    {run.result ? <div className="result">
      {run.result.correctedInput && !compact ? <div className="task"><strong>Sprachlich korrigiert</strong><p>{run.result.correctedInput}</p></div> : null}
      {run.result.summary ? <p className="note">{run.result.summary}</p> : null}
      {run.projectChange?<ProjectProposal change={run.projectChange}/>:null}
      {run.seriesChange?<SeriesProposal change={run.seriesChange}/>:null}
      {run.groceryChange ? <GroceryAnswerCard answer={run.groceryChange}/> : null}
      {run.groceryChange?.ingredients?.length&&run.groceryChange.steps.length>0&&run.state==='accepted'&&run.groceryChange.write!=='recipe'?
        <button type="button" className="quiet" disabled={busy||recipeSaved} onClick={()=>void (async()=>{
          if(await mutate('/grocery/recipes',{action:'save',run:run.id,confirm:true}))setRecipeSaved(true)
        })()}>{recipeSaved?'Rezept gespeichert':'In Meine Rezepte speichern'}</button>:null}
      {(run.financeChanges??(run.financeChange?[run.financeChange]:[])).map((change,index)=>
        <FinanceProposal key={run.id+':'+run.turn+':'+index} run={run} change={change} index={index} mutate={mutate}/>)}
      {run.result.advice?.length ? <div className="task"><strong>Empfohlene Reihenfolge</strong><ol>
        {run.result.advice.map((item, index) => <li key={index}><b>{titles.get(item.target)}</b> · {item.reason}</li>)}
      </ol></div> : null}
      {run.result.tasks.map((task, index) => <div className="task" key={index}>
        <strong>{task.title}</strong>
        {task.date ? <time dateTime={task.date}>{formatDate(task.date)}</time> : null}{task.priority?<small>Priorität · {task.priority==='normal'?'Mittel':priorityText(task.priority)}</small>:null}
        <p>{task.doneWhen}</p>{task.steps?.length ? <ul>{task.steps.map((step, i) => <li key={i}>{step}</li>)}</ul> : null}
        {task.blocks?.length ? <ul>{task.blocks.map((block, i) => <li key={i}>
          {block.minutes === null ? 'Erinnerung' : 'Zeitblock'} · {block.start.replace('T', ' ')} Uhr
          {block.minutes !== null ? ` · ${block.minutes} Min.` : ''}{block.weeks > 1 ? ` · jede Woche, ${block.weeks} Termine` : ''}
        </li>)}</ul> : null}{auditDetails ? <small>Beleg „{task.evidence}“</small> : null}
      </div>)}
      {run.result.actions?.map((action, index) => <div className="task" key={'a-' + index}>
        <strong>{proposalNames[action.kind]}{action.target ? ' · ' + (action.kind === 'correct_memory' ? run.memory.find(item => item.id === action.target)?.content ?? action.target : actionTitle(action.target)) : ''}</strong>
        <p>{action.kind === 'priority' ? priorityNames[action.value as keyof typeof priorityNames] :
          action.kind === 'complete' ? 'Erledigt' : action.value}{action.duration ? ' · ' + action.duration + ' Min.' : ''}</p>
        {!compact && action.tags?.length ? <small>Suchwörter · {action.tags.join(' · ')}</small> : null}
        {!compact ? <small>{action.reason}</small> : null}
      </div>)}
      {run.result.questions.length ? <div className="task">
        {run.result.questions.map((question, index) => <p key={index}>{question}</p>)}
        {onQuickReply ? <ChatQuickReply key={run.id+':'+run.turn} questions={run.result.questions} onAnswer={onQuickReply} busy={busy} /> : null}
      </div> : null}
      {!actionable && !run.result.skillData && !run.result.questions.length && !run.result.summary && !run.result.correctedInput && !run.result.advice?.length ? <p>Aus dieser Notiz ergaben sich keine Aufgaben.</p> : null}
    </div> : null}
    {auditDetails ? <details><summary>Kontext und Herkunft</summary>
      <p className="identifier">{run.id}</p>
      {run.memory.length ? run.memory.map(item => <p key={item.id}>{item.content}<small className="identifier">{item.source} · {item.id}</small></p>) : <p>Keine passende Erinnerung gefunden.</p>}
      {run.reference_day ? <small>Bezugstag {formatDate(run.reference_day)} · Europe/Berlin</small> : null}
      {context.length ? <ul>{context.map(task => <li key={task.id}>
        {task.title} · {task.detail}{task.due_date ? ' · ' + formatDate(task.due_date) : ''} · {priorityNames[task.priority]}
        {task.schedule.length ? <ul>{task.schedule.map(item => <li key={item.kind + item.at}>
          {item.kind === 'slot' ? 'Zeitblock' : 'Erinnerung'} · {displayTime(item.at)}{item.ends_at ? ' bis ' + displayTime(item.ends_at) : ''}
        </li>)}</ul> : null}
      </li>)}</ul> : null}
    </details> : null}
    {approval?.action === 'model' ? <AnalysisApproval modelName={modelName} key={approval.id} runId={run.id} approval={approval} busy={busy} decide={decide} /> :
      approval && (!compact || actionable) ? <div className="approval">
      <strong>{actionable ? compact ? 'Soll ich das übernehmen?' : 'Lokale Änderungen freigeben' : 'Ergebnis zur Kenntnis nehmen'}</strong>
      {!compact ? <p>{actionable ? 'Bestätige genau die angezeigten lokalen Änderungen.' : 'Die Antwort enthält keine lokalen Änderungen.'}</p> : null}
      {!compact && approval.action === 'adopt' && run.result && Boolean(run.result.tasks.length || run.result.actions?.some(action => !['complete', 'remember', 'correct_memory'].includes(action.kind))) ? <ProposalEditor key={approval.id} result={run.result}
        save={candidate => mutate('/runs/' + run.id + '/revise', { result: candidate, confirm: true })} /> : null}
      <div className="actions"><button disabled={busy} className="primary" onClick={() => decide('approve')}>{run.projectChange?'Ja, übernehmen':run.seriesChange?.operation==='delete'?'Serie löschen':run.seriesChange?'Serie eintragen':run.groceryChange?.write==='recipe' ? run.groceryChange.rows.length || run.groceryChange.stockRows?.length ? 'Rezept und Zutaten übernehmen' : 'Rezept speichern' :
        run.groceryChange?.write==='shop' ? run.groceryChange.steps.length ? 'Fehlende Zutaten ('+run.groceryChange.rows.length+') auf Einkaufsliste setzen' : 'Auf Einkaufsliste setzen' :
        run.groceryChange?.write==='remove' ? 'Artikel entfernen' : (run.financeChanges?.length??0)>1 ? run.financeChanges!.length+' Einträge übernehmen' : actionable ? compact && !run.financeChange && !run.groceryChange ? 'Ja' : 'Übernehmen' : 'Gelesen'}</button>
        {googleWrite && run.result?.skill === 'appointment' && run.result.tasks.length === 1 ?
          <button disabled={busy} onClick={() => decide('approve', true)}>In LifePilot und Google speichern</button> : null}
        <button disabled={busy} onClick={() => decide('deny')}>{run.projectChange?'Nein':run.financeChange ? 'Abbrechen' : compact ? 'Nein' : 'Ablehnen'}</button></div>
    </div> : null}
    {run.googleSync === 'saved' ? <details className="approval"><summary>Google-Termin bearbeiten</summary>
      <form onSubmit={event => {
        event.preventDefault()
        const fields = new FormData(event.currentTarget)
        void mutate('/google/appointment-change', { run:run.id, operation:'update', confirm:true,
          title:fields.get('title'), start:fields.get('start'), minutes:Number(fields.get('minutes')) })
      }}>
        <label>Titel<input name="title" defaultValue={run.result?.tasks[0]?.title} maxLength={120} required /></label>
        <label>Neuer Beginn (Berlin)<input name="start" type="datetime-local" required /></label>
        <label>Dauer in Minuten<input name="minutes" type="number" defaultValue={run.result?.tasks[0]?.blocks?.[0]?.minutes ?? 30} min={5} max={480} required /></label>
        <button disabled={busy || !googleWrite}>Termin in LifePilot und Google ändern</button>
      </form>
      <button type="button" disabled={busy || !googleWrite} onClick={() => {
        if (window.confirm('Diesen Termin aus LifePilot und Google Kalender entfernen?')) {
          void mutate('/google/appointment-change',{run:run.id,operation:'remove',confirm:true})
        }
      }}>Termin entfernen</button>
    </details> : null}
    {run.googleSync === 'removed' ? <p role="status">Der Termin wurde aus LifePilot und Google entfernt.</p> : null}
    {run.googleSync === 'pending' ? <div className="approval"><p>In LifePilot gespeichert. Die Google-Bestätigung steht aus.</p>
      <button disabled={busy || !googleWrite} onClick={() => void mutate('/google/sync-appointment', { run: run.id, confirm: true })}>Google-Speicherung prüfen</button>
    </div> : null}
    {actionError ? <p role="alert" className="error-text">{actionError}</p> : null}
    {onReply ? <button disabled={busy} className="primary" onClick={onReply}>
      {run.result?.questions.length ? 'Rückfrage beantworten' : 'Vorgang fortsetzen'}
    </button> : null}
    {openStates.has(run.state) ? <button disabled={busy} className="quiet" onClick={() => void mutate(`/runs/${run.id}/cancel`, {})}>Vorgang abbrechen</button> : null}
  </article>
}

const formatter = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
function formatDate(date: string) { return formatter.format(new Date(date)) }

function MemoryPanel({ snapshot, mutate, busy }: { snapshot: Snapshot,
  mutate: (path: string, payload: object) => Promise<unknown>, busy: boolean }) {
  const [scope, setScope] = useState<'owner' | 'lifepilot'>('lifepilot')
  const [content, setContent] = useState('')
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [error, setError] = useState('')
  const [replaces, setReplaces] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let current = true
    api<Entry[]>('/memory?' + new URLSearchParams({ scope, q: query }))
      .then(value => { if (current) { setEntries(value); setError('') } })
      .catch(cause => { if (current) setError(cause.message) })
    return () => { current = false }
  }, [scope, query, revision])
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!await mutate('/memory', { scope, content, confirm: true, replaces, synthetic: snapshot.acceptance })) return
    setContent('')
    setReplaces(null)
    setRevision(value => value + 1)
  }
  return <details className="card settings"><summary>Erinnerungen</summary>
    <label>Bereich<select value={scope} onChange={event => {
      setScope(event.target.value === 'owner' ? 'owner' : 'lifepilot'); setReplaces(null); setContent('')
    }}><option value="lifepilot">Für LifePilot</option><option value="owner">Nur für mich</option></select></label>
    <label>Erinnerung suchen<input value={query} onChange={event => setQuery(event.target.value)} /></label>
    {error ? <p role="alert">{error}</p> : null}
    <ul className="memory-list">{entries.map(entry => <li key={entry.id}>
      <strong>{entry.content}</strong><small className="identifier">{entry.source} · {entry.id}</small>
      <div className="actions">
        <button onClick={() => { setContent(entry.content); setReplaces(entry.id) }}>Korrigieren</button>
        <button onClick={async () => {
          if (window.confirm('Diese Erinnerung widerrufen?') && await mutate(`/memory/${entry.id}/revoke`, { confirm: true })) setRevision(value => value + 1)
        }}>Widerrufen</button>
        <button onClick={async () => {
          if (window.confirm('Den gespeicherten Memory-Text löschen?') && await mutate(`/memory/${entry.id}/erase`, { confirm: true })) setRevision(value => value + 1)
        }}>Löschen</button>
      </div>
    </li>)}</ul>
    <form onSubmit={save}>
      <label>{replaces ? 'Korrigierte Erinnerung' : 'Neue bestätigte Erinnerung'}
        <textarea value={content} onChange={event => setContent(event.target.value)} maxLength={1200} required />
      </label>
      <div className="actions">
        {snapshot.fixtures && scope === 'lifepilot' ? <button type="button" onClick={() => setContent(snapshot.fixtures!.memory)}>Test-Erinnerung einfügen</button> : null}
        <button className="primary" disabled={busy || !content.trim()}>{replaces ? 'Korrektur bestätigen' : 'Erinnerung bestätigen'}</button>
        {replaces ? <button type="button" onClick={() => { setReplaces(null); setContent('') }}>Abbrechen</button> : null}
      </div>
    </form>
  </details>
}

const ticket = location.hash.slice(1)
const viewQuery=new URLSearchParams(location.search)
const opensGoogle=viewQuery.get('view')==='google'
const opensProject=viewQuery.get('view')==='projects'
const opensTasks=viewQuery.get('view')==='tasks'
if (ticket) history.replaceState(null, '', location.pathname + location.search)
const connected = ticket ? api('/session', { ticket }).then(() => true).catch(() => false) : Promise.resolve(true)

function App() {
  const [travelRequest,setTravelRequest]=useState<{run:string,plan?:TripChatPlan}>()
  const [travelSelection,setTravelSelection]=useState<string>()
  const [outfitRequest, setOutfitRequest] = useState<{ run: string, plan?:OutfitChatPlan, fragranceNames?:string[], required?:string[], choice?:OutfitChoice, error?:string }>()
  const [projects,setProjects]=useState<ProjectsOverview>()
  const [projectsError,setProjectsError]=useState('')
  const [projectRefresh,setProjectRefresh]=useState(0)
  const [taskProject,setTaskProject]=useState<string>()
  const [briefingVersion,setBriefingVersion]=useState(0)
  const [briefingName,setBriefingName]=useState('')
  const [projectSelection,setProjectSelection]=useState<{id:string,step?:string,area:ProjectArea,token?:number}|undefined>(()=>{
    const id=viewQuery.get('project')
    return opensProject&&id?{id,area:'uni'}:undefined
  })
  const [boardSource,setBoardSource]=useState<BoardItem>()
  const [projectWork,setProjectWork]=useState<ProjectWork>()
  const [page, setPage] = useState<Page>(opensGoogle?'Einstellungen':opensProject?'Projekte':opensTasks?'Aufgaben & Fristen':'Start')
  useEffect(()=>{
    if(page!=='Start')return
    let current=true
    void connected.then(()=>api<{fields:{name:string}}>('/profile')).then(profile=>{
      if(current)setBriefingName(profile.fields.name.trim().split(/\s+/u)[0])
    },()=>{})
    return ()=>{current=false}
  },[page,briefingVersion])
  const [settingsSection, setSettingsSection] = useState<'Übersicht' | 'Profil' | 'Verbindungen'>(opensGoogle ? 'Verbindungen' : 'Profil')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [newConversation, setNewConversation] = useState(()=>!viewQuery.get('run')&&sessionStorage.getItem('lifepilot-chat')==='closed')
  const [replyTo, setReplyTo] = useState<{ id: string, turn: number } | null>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const autoReadSelection=useRef<string|null>(null)
  const [selected, setSelected] = useState<string | null>(()=>{
    const requested=viewQuery.get('run')
    if(requested&&/^[a-f0-9-]{36}$/iu.test(requested))return requested
    const saved=sessionStorage.getItem('lifepilot-chat')
    return saved==='closed'?null:saved
  })
  const [taskScheduleFocus,setTaskScheduleFocus]=useState(false)
  const [taskId, setTaskId] = useState<string | null>(null)
  const taskDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { taskDialog.current?.showModal() }, [taskId])
  const [pageSearch, setPageSearch] = useState('')
  const [synthetic, setSynthetic] = useState(false)
  const [input, setInput] = useState('')
  const [doc, setDoc] = useState<SourceNote>()
  const attachmentInput = useRef<HTMLInputElement>(null)
  const [dictationStop, setDictationStop] = useState(0)
  const [docError, setDocError] = useState('')
  const [readingFile, setReadingFile] = useState(false)
  const fileRevision = useRef(0)
  const [error, setError] = useState<{ path: string, message: string }>()
  const [offline, setOffline] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [calendarApproval,setCalendarApproval]=useState<{path:string,payload:object,confirmation:CalendarConfirmation}>()
  const [busy, setBusy] = useState(false)
  const [improvement, setImprovement] = useState('')
  const [inboxBatch, setInboxBatch] = useState<InboxRefresh>()
  const [lectureNotices,setLectureNotices]=useState<InboxProposal[]>([])
  const [lectureRefresh,setLectureRefresh]=useState(0)
  const [inboxFeed, setInboxFeed] = useState<InboxFeed>()
  const [inboxFeedError, setInboxFeedError] = useState('')
  const [loadingInboxFeed, setLoadingInboxFeed] = useState(false)
  const inboxFeedRequest = useRef(false)
  const inboxFeedRevision = useRef(0)
  const [refreshError, setRefreshError] = useState('')
  const [refreshingInbox, setRefreshingInbox] = useState(false)
  const [orderRefreshKey,setOrderRefreshKey]=useState(0)
  const [skillOutput, setSkillOutput] = useState<{ run: string, turn: number, deadlines?: TaskRow[],
    planning?: FreePlan & { calendar: boolean }, orders?: {checked:number,changed:number,limited:boolean}, error?: string }>()
  const [tripChange,setTripChange]=useState<{run:string,turn:number,result:TripChangeResult}>()
  const [skillBusy, setSkillBusy] = useState(false)
  const [recipeVersion,setRecipeVersion]=useState(0)
  const [builderStatus, setBuilderStatus] = useState('')
  const revision = useRef(0)
  const pending = useRef<{ input: string, key: string, target: string, doc?: SourceNote } | null>(null)

  function removeDocument() {
    fileRevision.current++
    setDoc(undefined); setDocError(''); setReadingFile(false)
  }

  async function selectDocument(file: File) {
    const selection = ++fileRevision.current
    setReadingFile(true); setDoc(undefined); setDocError(''); setSynthetic(false)
    try {
      let text: string
      if (/\.(txt|md)$/iu.test(file.name)) {
        if (file.size > MAX_SOURCE_BYTES) throw new Error('Textdateien dürfen höchstens 8 KB groß sein.')
        text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      } else {
        if (!/\.(pdf|png|jpe?g)$/iu.test(file.name) || file.size > 5 * 1024 * 1024) {
          throw new Error('Wähle PDF, PNG, JPEG, TXT oder Markdown. Bilder und PDFs dürfen bis 5 MB groß sein.')
        }
        const response = await fetch('/api/chat/attachment', {
          method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-LifePilot-Confirm': 'attachment' },
          body: file, signal: AbortSignal.timeout(20000),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
        text = result.text
      }
      if (selection === fileRevision.current) {
        setDoc(sourceNote({ name: file.name, text }))
        setReplyTo(null)
        setNewConversation(true)
      }
    } catch (reason) {
      if (selection === fileRevision.current) setDocError(reason instanceof Error ? reason.message : 'Die Datei konnte nicht gelesen werden.')
    } finally { if (selection === fileRevision.current) setReadingFile(false) }
  }

  async function selectGroceryImage(file:File) {
    const selection=++fileRevision.current
    setReadingFile(true);setDoc(undefined);setDocError('');setSynthetic(false)
    try {
      const result=await scanGroceryFile(file,/\b(?:kassenbon|quittung|einkaufsbon)\b/iu.test(input))
      const data=result.text||result.rows.map(item=>[item.name,item.quantity,item.status==='low'?'wird knapp':''].filter(Boolean).join(' · ')).join('\n')
      if(!data)throw Error('Auf dem Bild waren keine Artikel klar erkennbar.')
      if(selection===fileRevision.current) {
        setDoc(sourceNote({name:'Vorrat-'+file.name.slice(-70)+'.txt',text:data}))
        setInput(value=>value.trim()?value:'Prüfe die aus meinem Vorratsfoto erkannten Artikel und schlage die Aktualisierung vor.')
        setReplyTo(null);setNewConversation(true)
      }
    } catch(reason) {
      if(selection===fileRevision.current)setDocError(reason instanceof Error?reason.message:'Vorratsfoto konnte nicht gelesen werden.')
    } finally {if(selection===fileRevision.current)setReadingFile(false)}
  }

  async function refresh() {
    const current = ++revision.current
    try {
      await connected
      const value = await api<Snapshot>('/state')
      if (current === revision.current) { setSnapshot(value); setOffline('');setSessionExpired(false) }
    } catch (cause) {
      if (current === revision.current) {
        setSessionExpired(cause instanceof Error && 'status' in cause && cause.status === 401)
        setOffline(cause instanceof Error ? cause.message : 'Hub nicht erreichbar.')
      }
    }
  }
  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => { if (!document.hidden) void refresh() }, 2000)
    function resume() { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', resume)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', resume); revision.current++ }
  }, [])

  async function mutate<T>(path: string, payload: object) {
    setBusy(true)
    setError(undefined)
    try {
      const calendarAction=path.endsWith('/decision')||path.endsWith('/schedule')
      const result=await api<T & {calendarConfirmation?:CalendarConfirmation}>(path,payload,calendarAction?40_000:undefined)
      if(result?.calendarConfirmation){
        setCalendarApproval({path,payload,confirmation:result.calendarConfirmation})
        return
      }
      if(calendarAction)setCalendarApproval(undefined)
      if(path==='/grocery/recipes' || path.endsWith('/decision'))setRecipeVersion(value=>value+1)
      await refresh()
      return result
    } catch (cause) {
      setError({ path, message: cause instanceof Error ? cause.message : 'Aktion fehlgeschlagen.' })
    } finally { setBusy(false) }
  }
  function show(id: string) {
    if (replyTo && replyTo.id !== id) { setReplyTo(null); setInput(''); setSynthetic(false) }
    sessionStorage.setItem('lifepilot-chat',id)
    autoReadSelection.current=id
    setSelected(id); setNewConversation(false)
  }
  function chooseReply(run: Run) {
    removeDocument(); setReplyTo({ id: run.id, turn: run.turn }); setInput(''); setSynthetic(false)
    requestAnimationFrame(() => composer.current?.focus())
  }
  function clearDraft() { setDictationStop(value => value + 1); removeDocument(); setReplyTo(null); setInput(''); setSynthetic(false) }
  function resetConversation() {
    autoReadSelection.current=null
    clearDraft()
    setSelected(null);setNewConversation(true)
    sessionStorage.setItem('lifepilot-chat','closed')
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = input.trim()
    if(text.length>MAX_CHAT_INPUT){setError({path:'/runs',message:'Die Nachricht hat mehr als 200.000 Zeichen. Sende sie in mehreren Nachrichten im selben Reise-Chat.'});return}
    const answer=/^(ja|nein)[.!]?$/iu.exec(text)?.[1]?.toLowerCase()
    if (answer && !busy && !skillBusy && focus && !doc) {
      if (currentTripChange && 'offer' in currentTripChange) {
        if (await answerTripChange(focus,currentTripChange.offer.id,answer==='ja')) clearDraft()
        return
      }
      const approval=focus.approvals.find(entry=>entry.action==='adopt' && entry.state==='pending')
      if (approval && (focus.projectChange || focus.seriesChange || focus.projectChange || focus.seriesChange || focus.groceryChange?.write || focus.financeChange || focus.result?.tasks.length || focus.result?.actions?.length)) {
        if (await mutate(`/runs/${focus.id}/decision`,{approval:approval.id,decision:answer==='ja'?'approve':'deny'})) clearDraft()
        return
      }
    }
    if (snapshot?.chatMode === 'disabled' && !activeReply && !doc && inboxCommand.test(text)) {
      if (!refreshingInbox && !offline) {
        setInput('')
        await runInboxRefresh()
      }
      return
    }
    if (!text || busy || waitingForChat || !canChat || (snapshot?.acceptance && !synthetic && (!snapshot.directTestChat || !!doc)) || readingFile || docError) return
    const target = activeReply ? activeReply.id + ':' + activeReply.turn : recentConversation?.id??'new'
    if (pending.current?.input !== text || pending.current.target !== target || pending.current.doc !== doc) {
      pending.current = { input: text, key: crypto.randomUUID(), target, doc }
    }
    const { input: message, key } = pending.current
    const created = activeReply
      ? await mutate<Run>(`/runs/${activeReply.id}/followup`, { input: message, key, turn: activeReply.turn, synthetic: !!snapshot?.acceptance,sendNow: snapshot?.directTestChat })
      : await mutate<Run>('/runs', { input: message, key, agent: 'lifepilot', synthetic: !!snapshot?.acceptance, sourceNote: doc,sendNow:snapshot?.directTestChat && !doc,previous:recentConversation?.id })
    if (created) { show(created.id); clearDraft(); pending.current = null }
  }

  const canChat = snapshot?.chatMode === 'synthetic' || snapshot?.chatMode === 'private'
  const runs = snapshot?.runs ?? []
  const focus = newConversation ? undefined : runs.find(run => run.id === selected) ?? runs.find(run=>!run.parent_run)
  const skillRefresh=(skill:Result['skill'])=>runs.filter(run=>run.result?.skill===skill).slice(0,20)
    .map(run=>run.id+':'+run.turn+':'+run.state+':'+run.updated_at).join('|')
  const currentTripChange=tripChange && tripChange.run===focus?.id && tripChange.turn===focus.turn ? tripChange.result : undefined
  const mayReply = focus && (['review', 'failed'].includes(focus.state) ||
    ((snapshot?.chatMode === 'private'||snapshot?.directTestChat) && focus.state === 'accepted' && focus.result &&
      !focus.result.tasks.length && !focus.result.actions?.length && !focus.financeChange && !focus.groceryChange?.write))
  const startsNew = /^(?:neues thema|neuer chat|anderes thema)\b/iu.test(input.trim())
  const recentConversation = !startsNew && focus &&
    !['permission','queued','running'].includes(focus.state) ? focus:undefined
  const group = focus ? runs.filter(run=>run.parent_run===focus.id) : []
  const unanswered=group.filter(run=>run.state==='review'&&run.result?.questions.length&&run.turn<24)
  const replying = focus?.result?.questions.length || currentTripChange ? focus : unanswered.length===1 ? unanswered[0]:undefined
  const activeReply = !doc && recentConversation ? replyTo ?? (replying && (replying!==focus||mayReply) && replying.turn<24 ?
    {id:replying.id,turn:replying.turn}:null) : null
  const earlier:Run[]=[]
  let preceding=focus?.parent_run ? runs.find(run=>run.id===focus.parent_run)?.previous_run : focus?.previous_run
  while(preceding&&earlier.length<12) {
    const prior=runs.find(run=>run.id===preceding)
    if(!prior)break
    earlier.unshift(prior)
    preceding=prior.parent_run?runs.find(run=>run.id===prior.parent_run)?.previous_run:prior.previous_run
  }
  const readyAnswer=/^(ja|nein)[.!]?$/iu.test(input.trim()) && Boolean(
    currentTripChange && 'offer' in currentTripChange ||
    focus?.approvals.some(entry=>entry.action==='adopt' && entry.state==='pending') &&
    (focus.projectChange || focus.seriesChange || focus.groceryChange?.write || focus.financeChange || focus.result?.tasks.length || focus.result?.actions?.length))
  const waitingForChat = (snapshot?.chatMode === 'private' || snapshot?.directTestChat) && Boolean(focus && inFlight.has(focus.state))
  const inboxShortcut = snapshot?.chatMode === 'disabled' && inboxCommand.test(input.trim()) && !activeReply && !doc
  const composerError = error && (error.path === '/runs' || error.path === `/runs/${activeReply?.id}/followup`) ? error.message : undefined
  const runError = error && !composerError && error.path.startsWith(`/runs/${focus?.id}/`) ? error.message : undefined
  const waiting = runs.filter(run => run.approvals.some(approval => approval.state === 'pending'))
  const tasks = snapshot?.tasks ?? []
  const schedule = snapshot?.schedule ?? []
  const today = dateInBerlin()
  const openTasks = tasks.filter(task => task.status === 'open' && task.kind === 'task')
  const now=new Date()
  const dayState=briefingClock(now)
  const homeTasks=tasks.filter(task=>visibleOnStart(task,today))
  const projectNames=new Map(projects?.projects.map(project=>[project.id,project.title]))
  const deadlines = [
    ...homeTasks.filter(task=>task.due_date).map(task=>({task,project:null,priority:task.priority==='normal'?'medium' as const:task.priority,date:task.due_date!})),
    ...(projects?.deadlines??[]).map(project=>({task:null,project,priority:project.priority,date:project.date})),
  ].sort((a,b)=>a.date.localeCompare(b.date)||priorityRank[a.priority]-priorityRank[b.priority])
  const tomorrow=shiftDay(today,1)
  const briefing={now,remaining:homeTasks.some(task=>task.status==='open'&&(!task.due_date||task.due_date<=today))||
    deadlines.some(({project,date})=>project&&!project.completed&&date<=today),
    tomorrowItems:deadlines.filter(item=>item.date===tomorrow&&(item.task?.status==='open'||item.project&&!item.project.completed))
      .map(item=>item.task?.title??item.project?.title??'')}
  const projectRunRefresh=skillRefresh('projects')
  const projectInboxRefresh=inboxFeed?.loadedAt
  const projectReady=Boolean(snapshot)
  useEffect(()=>{
    if(!projectReady)return
    let current=true
    void api<ProjectsOverview>('/projects').then(value=>{if(current){setProjects(value);setProjectsError('')}},
      reason=>{if(current)setProjectsError(reason.message)})
    return ()=>{current=false}
  },[projectRefresh,projectRunRefresh,projectInboxRefresh,projectReady,page])
  async function saveProject(plan:Partial<ProjectPlan>&Pick<ProjectPlan,'projectIntent'>,project?:Project,step?:string){
    const value=await mutate<{id:string}>('/projects',{plan,project:project?.id,step,revision:project?.revision,confirm:true})
    if(value)setProjectRefresh(number=>number+1)
    return Boolean(value)
  }
  async function decideProject(suggestion:ProjectSuggestion,approved:boolean){
    const project=projects?.projects.find(project=>project.id===suggestion.projectId)
    if(!project)return
    const saved=await mutate<{ok:boolean}>('/projects/mail',{suggestion:suggestion.id,revision:project.revision,approved,confirm:true})
    if(saved)setProjectRefresh(number=>number+1)
  }
  async function saveProjectEditor(plan:Partial<ProjectPlan>&Pick<ProjectPlan,'projectIntent'>,
    steps:Array<{key:string,id?:string,title:string,date:string|null,priority:unknown,scheduleMode:unknown,approxLabel:string|null,completed:boolean|null,startDate?:string|null,notes?:string|null,phase?:string|null}>,
    project?:Project){
    const value=await mutate<{id:string}>('/projects/editor',{plan,steps:steps.map(({id,title,date,priority,scheduleMode,approxLabel,completed,startDate,notes,phase})=>
      ({id,title,date,priority,scheduleMode,approxLabel,completed,startDate,notes,phase})),
      project:project?.id,revision:project?.revision,confirm:true})
    if(value)setProjectRefresh(value=>value+1)
    return Boolean(value)
  }
  function showProject(id:string,step?:string){
    const project=projects?.projects.find(item=>item.id===id)
    setProjectSelection({id,step,area:project?.area??'uni',token:Date.now()})
    navigate('Projekte')
  }
  async function changeProjectBoard(item:BoardItem,patch:BoardSourcePatch){
    const project=projects?.projects.find(project=>project.id===item.projectId)
    if(!project||project.status!=='active')return false
    const plan:Partial<ProjectPlan>&Pick<ProjectPlan,'projectIntent'>={
      projectIntent:item.stepId?'update_step':'update',
      ...((item.stepId&&patch.completed!==undefined)&&{completed:patch.completed}),
      ...((!item.stepId&&patch.completed!==undefined)&&{deadlineCompleted:patch.completed}),
      ...(patch.priority&&{priority:patch.priority}),...(patch.area&&{area:patch.area}),
    }
    return saveProject(plan,{...project,revision:item.revision},item.stepId)
  }
  function showBoardSource(item:BoardItem){
    if(item.source_type==='project'&&item.projectId){showProject(item.projectId,item.stepId);return}
    if(item.source_type==='pilot'&&item.source_id){show(item.source_id);document.getElementById('agent-chat')?.focus();return}
    const pages:Partial<Record<BoardItem['source_type'],Page>>={order:'Bestellungstracker',finance:'Finanzen & Abos',application:'Bewerbungen',
      travel:'Urlaubsplaner',email:'Posteingang',inventory:'Vorrat & Einkauf',outfit:'Outfit-Assistent'}
    const destination=pages[item.source_type]
    if(destination){
      navigate(destination)
      setBoardSource(item)
      if(item.source_type==='travel'&&item.source_id)setTravelSelection(item.source_id)
    }else if(item.taskId)openTask(item.taskId)
  }
  function goProjectWork(work:ProjectWork){setProjectWork(work);navigate('Kalender')}
  const projectReview=focus?.result?.skill==='projects'&&focus.result.skillData&&'projectIntent' in focus.result.skillData&&
    focus.result.skillData.projectIntent==='check'&&!focus.result.questions.length?focus.result.skillData:undefined
  const notices = schedule.filter(item => item.kind === 'reminder' && item.state === 'ready')
  const currentTask = tasks.find(task => task.id === taskId)
  const chatAppointment = focus?.state === 'accepted' ? tasks.find(task =>
    task.run_id === focus.id && schedule.some(slot => slot.task_id === task.id && slot.kind === 'slot')) : undefined
  function openFromPilot(name: Page) {
    setPage(name)
    if (matchMedia('(max-width: 720px)').matches) {
      requestAnimationFrame(() => document.getElementById('main-content')?.focus())
    }
  }
  function openTask(id:string,schedule=false){setTaskScheduleFocus(schedule);setTaskId(id)}
  function homeTaskFields(task:TaskRow){
    const checked=task.status==='done',project=task.project_id?projectNames.get(task.project_id):undefined
    return <>
      <input type="checkbox" checked={checked} aria-label={checked?task.title+' wieder öffnen':task.title+' abhaken'} disabled={busy||!!offline}
        onChange={event=>void mutate('/tasks/'+task.id+'/edit',{revision:task.revision,confirm:true,
          patch:{status:event.target.checked?'done':'open'}})}/>
      <div className="home-task-title">
        <button type="button" className="quiet" onClick={()=>openTask(task.id)}>{task.title}</button>
        {project?<small>Projekt · {project}</small>:null}
      </div>
      {task.due_date?<time dateTime={task.due_date}>Frist · {formatDate(task.due_date)}</time>:null}
    </>
  }
  function openDraft(message: string) {
    setNewConversation(true)
    removeDocument(); setReplyTo(null); setInput(message); setSynthetic(false)
    requestAnimationFrame(() => composer.current?.focus())
  }
  const calendarUpdateKey = JSON.stringify([lectureRefresh,briefingVersion,tasks.map(task => [task.id, task.revision]), schedule.map(item => [item.id, item.state])])
  async function askTripChange(run:Run,tripId?:string) {
    const result=await api<TripChangeResult>('/trips/chat-change',{run:run.id,turn:run.turn,tripId,confirm:true})
    setTripChange({run:run.id,turn:run.turn,result})
  }
  async function answerTripChange(run:Run,offer:string,approved:boolean) {
    setSkillBusy(true)
    try {
      const result=await api<{message:string,tripId?:string}>('/trips/chat-decision',{offer,approved,confirm:true})
      setTripChange({run:run.id,turn:run.turn,result:{message:result.message}})
      if (result.tripId) {
        setTravelSelection(result.tripId)
        setTravelRequest({run:'updated:'+result.tripId+':'+offer})
      }
      return true
    } catch (cause) {
      setTripChange({run:run.id,turn:run.turn,result:{message:cause instanceof Error ? cause.message : 'Änderung fehlgeschlagen.'}})
      return false
    } finally {setSkillBusy(false)}
  }
  async function executeChatSkill(run: Run) {
    if (skillBusy || !run.result) return
    setSkillBusy(true)
    try {
      if (run.result.skill === 'deadline_guardian') {
        setSkillOutput({ run: run.id, turn: run.turn, deadlines: await api('/skills/deadlines') })
      } else if (run.result.skill === 'smart_planning' && run.result.skillData && 'days' in run.result.skillData) {
        setSkillOutput({ run: run.id, turn: run.turn, planning: await api('/skills/planning', { ...run.result.skillData, confirm: true }, 20000) })
      } else if (run.result.skill === 'orders') {
        openFromPilot('Bestellungstracker')
        const months=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
        const current=dateInBerlin().slice(0,7)
        const explicit=run.input.match(/\b20\d{2}-(?:0[1-9]|1[0-2])\b/u)?.[0]
        // Months come from the fixed month table.
        const named=months.findIndex(month=>new RegExp('\\b'+month+'\\b','iu').test(run.input)) // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
        const numbered=named<0 ? undefined : String(named+1).padStart(2,'0')
        const year=run.input.match(/\b20\d{2}\b/u)?.[0] ??
          String(Number(current.slice(0,4))-(numbered && numbered>current.slice(5) ? 1:0))
        const month=explicit ?? (numbered ? year+'-'+numbered : undefined)
        const orders=await api<NonNullable<NonNullable<typeof skillOutput>['orders']>>('/clothing-orders/refresh',{month,confirm:true},120000)
        setOrderRefreshKey(key=>key+1)
        setSkillOutput({run:run.id,turn:run.turn,orders})
      } else if (run.result.skill === 'applications') {
        openFromPilot('Bewerbungen')
      } else if (run.result.skill === 'travel') {
        const data=run.result.skillData
        if (data && 'intent' in data && data.intent==='change') {
          await askTripChange(run,travelSelection)
          return
        }
        setTravelRequest({run:run.id+':'+run.turn,plan:data && 'intent' in data ? data : undefined})
        openFromPilot('Urlaubsplaner')
      } else if (run.result.skill === 'outfit') {
        const data = run.result.skillData
        if (data && 'fragrances' in data && !run.result.questions.length) {
          setOutfitRequest({run:run.id+':'+run.turn,fragranceNames:data.fragrances})
          openFromPilot('Outfit-Assistent')
          return
        }
        const plan = data && 'place' in data ? data : {place:null,date:null,occasion:null}
        const request: NonNullable<typeof outfitRequest> = {run:run.id+':'+run.turn,plan}
        if (data && 'place' in data && !run.result.questions.length) {
          try {
            if (plan.anchor) {
              const {wardrobe}=await api<{wardrobe:WardrobeItem[]}>('/outfits')
              const anchor=resolveOutfitAnchor(plan.anchor,wardrobe)
              if (!anchor) throw Error('Wähle im Styling-Studio, welches Teil du mit „'+plan.anchor+'“ meinst.')
              request.required=[anchor.id]
            }
            request.choice = await api('/outfits/generate', {
              query:{mode:request.required?.length?'anchor':plan.occasion?'occasion':'inspiration',
                occasion:plan.occasion ?? '',required:request.required??[],variant:0,place:plan.place ?? undefined,
                date:plan.date ?? undefined,daypart:plan.daypart??undefined},confirm:true,
            },20000)
          } catch (cause) {
            request.error = cause instanceof Error ? cause.message : 'Der Look konnte nicht erstellt werden.'
          }
        }
        setOutfitRequest(request)
        openFromPilot('Outfit-Assistent')
      }
    } catch (cause) {
      setSkillOutput({ run: run.id, turn: run.turn, error: cause instanceof Error ? cause.message : 'Skill konnte nicht ausgeführt werden.' })
    } finally { setSkillBusy(false) }
  }
  const autoRead = useEffectEvent((run: Run) => { void executeChatSkill(run) })
  const autoReadKey = useRef<string | undefined>(undefined)
  useEffect(() => {
    const travelChangePreview=focus?.result?.skill==='travel' && focus.result.skillData &&
      'intent' in focus.result.skillData && focus.result.skillData.intent==='change' && !focus.result.questions.length
    // Restoring the previous chat can display it without repeating its navigation.
    if (!focus || autoReadSelection.current !== focus.id || selected !== focus.id || skillBusy || !((snapshot?.chatMode==='private' || snapshot?.directTestChat) && focus.state==='accepted' ||
      snapshot?.acceptance && focus.state==='review' && travelChangePreview) ||
      (focus.result?.skill !== 'deadline_guardian' &&
        !(focus.result?.skill === 'smart_planning' && focus.result.skillData) &&
        !(focus.result?.skill === 'outfit' && focus.result.skillData && ('place' in focus.result.skillData || 'fragrances' in focus.result.skillData) && !focus.result.questions.length) &&
        !(focus.result?.skill === 'travel' && focus.result.skillData && !focus.result.questions.length) &&
        focus.result?.skill !== 'applications' && focus.result?.skill !== 'orders')) return
    const key = focus.id + ':' + focus.turn
    if (autoReadKey.current === key) return
    autoReadKey.current = key
    autoRead(focus)
  }, [snapshot?.chatMode, snapshot?.acceptance, snapshot?.directTestChat, focus, selected, skillBusy])
  const skillResult = skillOutput?.run === focus?.id && skillOutput?.turn === focus?.turn ? skillOutput : undefined
  async function runInboxRefresh(restart = true) {
    if (refreshingInbox || !snapshot || offline) return
    setRefreshingInbox(true); setRefreshError('')
    try {
      setInboxBatch(await api<InboxRefresh>('/inbox/refresh', { confirm: true, restart }, 100000))
      await refresh()
    } catch (cause) {
      setRefreshError(cause instanceof Error ? cause.message : 'Aktualisieren fehlgeschlagen.')
    } finally { setRefreshingInbox(false) }
  }
  const refreshSummary = inboxBatch
    ? `${inboxBatch.checked} Mails geprüft · ${inboxBatch.added} neue Vorschläge · ${inboxBatch.plans.length} Zeitvorschläge` +
      (inboxBatch.applications ? ` · ${inboxBatch.applications} Bewerbungsfunde` : '') +
      (inboxBatch.labelsAvailable ? ` · ${inboxBatch.labeled} Gmail-Labels bestätigt` : '') +
      (inboxBatch.limited ? ' · Weitere Mails oder Wiederholung möglich' : '')
    : ''
  const refreshFeedback = <>
    {refreshingInbox ? <Loading label="Posteingang wird geprüft …" /> : null}
    {refreshSummary ? <p role="status">{refreshSummary}</p> : null}
    {inboxBatch && !snapshot?.acceptance && !inboxBatch.labelsAvailable ?
      <p>Gmail-Sortieren braucht die vorhandene Label-Freigabe. <button className="quiet" onClick={() => navigate('Einstellungen')}>Verbindung prüfen</button></p> : null}
    {refreshError || inboxBatch?.labelError ? <p role="alert">{refreshError || inboxBatch?.labelError}</p> : null}
    {inboxBatch?.calendar === 'unconnected' ? <p>Google-Kalender verbinden, um freie Zeitfenster zu prüfen.</p> : null}
    {inboxBatch?.calendar === 'unavailable' || inboxBatch?.calendar === 'incomplete' ?
      <p>Google-Kalender konnte nicht vollständig geprüft werden.</p> : null}
  </>
  function clearInboxFeed() {
    inboxFeedRevision.current++
    inboxFeedRequest.current = false
    setLoadingInboxFeed(false)
    setInboxFeedError('')
    setInboxFeed(undefined)
  }

  async function loadInboxFeed() {
    if (!snapshot || inboxFeedRequest.current) return
    inboxFeedRequest.current = true
    const revision = ++inboxFeedRevision.current
    setLoadingInboxFeed(true)
    setInboxFeedError('')
    try {
      const feed = await api<{ messages: AttentionMail[] }>('/inbox/feed', {confirm:true}, 60_000)
      if (revision === inboxFeedRevision.current) setInboxFeed({ messages: feed.messages, loadedAt: new Date().toISOString() })
    } catch (reason) {
      if (revision === inboxFeedRevision.current) setInboxFeedError(reason instanceof Error ? reason.message : 'Gmail ist gerade nicht erreichbar.')
    } finally {
      if (revision === inboxFeedRevision.current) {
        inboxFeedRequest.current = false
        setLoadingInboxFeed(false)
      }
    }
  }

  const watchInbox = Boolean(snapshot && (page === 'Start' || page === 'Posteingang'))
  const checkActiveInbox = useEffectEvent(() => { if (!document.hidden) void loadInboxFeed() })
  useEffect(() => {
    if (!watchInbox) return
    checkActiveInbox()
    const timer = window.setInterval(checkActiveInbox, inboxPollMs)
    const resumeInbox = () => checkActiveInbox()
    document.addEventListener('visibilitychange', resumeInbox)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', resumeInbox)
    }
  }, [watchInbox, page])

  function inboxFeedContents(compact: boolean) {
    const messages=compact ? inboxFeed?.messages.filter(item=>item.important).slice(0,3) : inboxFeed?.messages
    return <>
      {loadingInboxFeed && !inboxFeed ? <Loading label="Gmail wird geladen …" /> : null}
      {inboxFeedError ? <p role="alert">Gmail konnte nicht aktualisiert werden. {inboxFeedError}
        {' '}<button className="quiet" onClick={() => navigate('Einstellungen')}>Verbindung prüfen</button></p> : null}
      {inboxFeed ? <small>Zuletzt aktualisiert <time dateTime={inboxFeed.loadedAt}>{clockFormat.format(new Date(inboxFeed.loadedAt))} Uhr</time></small> : null}
      {messages?.length ? <ul className="inbox-feed-list">
        {messages.map(item => <li key={item.id}>
          <span><strong>{item.subject}</strong><small>{item.from}</small>
            <span className="inbox-row-meta">
              <small className="inbox-category" data-category={item.label}>{inboxLabelNames[item.label] || (item.category && mailCategoryNames[item.category])}</small>
              {item.reply && <small>Antwort erbeten</small>}
              {item.shipment && <small>{shipmentLabels[item.shipment]}</small>}
            </span></span>
          {item.at ? <time dateTime={item.at}>{mailDate.format(new Date(item.at))}</time> : null}
        </li>)}
      </ul> : inboxFeed ? <p className="empty">Keine relevanten Nachrichten gefunden.</p> : null}
    </>
  }

  function useQuickReply(text: string) {
    setInput(text)
    requestAnimationFrame(() => {
      composer.current?.focus()
      if (Object.values(categoryLabels).some(label => label === text) ||
        ['Ja','Nein'].includes(text) && focus?.result?.questions.includes('Willst du ein bestimmtes Teil anziehen?')) {
        composer.current?.form?.requestSubmit()
      }
    })
  }

  function navigate(name: Page) {
    setBoardSource(undefined)
    if(name!=='Kalender')setProjectWork(undefined)
    if(name!=='Projekte')setProjectSelection(undefined)
    if (name === 'Outfit-Assistent') setOutfitRequest(undefined)
    if (name === 'Urlaubsplaner') setTravelRequest(undefined)
    setPageSearch('')
    setPage(name)
  }
  const searchResults = pageSearch.trim() ? [...navigation.flatMap(group => group.links.map(([name]) => name)),
    'Einstellungen'].filter(name => name.toLocaleLowerCase('de').includes(pageSearch.trim().toLocaleLowerCase('de'))) as Page[] : []

  return <div className="shell">
    {calendarApproval?<CalendarConflictDialog confirmation={calendarApproval.confirmation} busy={busy}
      error={error?.path===calendarApproval.path?error.message:undefined}
      onCancel={()=>setCalendarApproval(undefined)}
      onConfirm={()=>void mutate(calendarApproval.path,{...calendarApproval.payload,overlapToken:calendarApproval.confirmation.token})} />:null}
    <a className="skip-link" href="#main-content">Zum Inhalt springen</a>
    <nav aria-label="Hauptnavigation" className="sidebar">
      <button className="brand" type="button" aria-label="LifePilot Start" onClick={() => navigate('Start')}>
        <span className="mark"><Icon name="leaf" /></span><strong>LifePilot</strong>
      </button>
      <div className="nav-groups">{navigation.map(group => <section key={group.title} className="nav-group">
        <h2>{group.title}</h2>
        {group.links.map(([name, icon]) => <button key={name} aria-label={name} title={name}
          aria-current={page === name ? 'page' : undefined}
          onClick={() => navigate(name)}><Icon name={icon} /><span className="nav-label">{name}</span></button>)}
      </section>)}</div>
      <div className="nav-footer">
        <button type="button" aria-label="Einstellungen" title="Einstellungen" aria-current={page === 'Einstellungen' ? 'page' : undefined}
          onClick={() => navigate('Einstellungen')}><Icon name="settings" /><span className="nav-label">Einstellungen</span></button>
      </div>
    </nav>
    <main id="main-content" tabIndex={-1}>
      <header className="topbar">
        <form className="navigation-search" role="search" onSubmit={event => {
          event.preventDefault()
          if (searchResults.length) navigate(searchResults[0]!)
        }}>
          <Icon name="search" /><input type="search" aria-label="Bereich suchen" placeholder="Suchen …" value={pageSearch}
            onChange={event => setPageSearch(event.target.value)} onKeyDown={event => {
              if (event.key === 'Escape') setPageSearch('')
            }} />
          {pageSearch.trim() ? <div className="search-results card">
            {searchResults.length ? searchResults.map(name => <button key={name} type="button" className="quiet"
              onClick={() => navigate(name)}>{name}</button>) : <p>Kein Bereich gefunden.</p>}
          </div> : null}
        </form>
        <a className="layout-jump" href="#agent-chat"><Icon name="chat" />Zu Pilot</a>
      </header>
      <div className="main-content">
        {offline && !sessionExpired ? <p role="alert" className="banner">{offline}</p> : null}
        {sessionExpired ? <section className="card settings reconnect" aria-label="Sitzung erneuern">
          <h2>LifePilot erneut öffnen</h2><p>Öffne den LifePilot-Starter für eine neue Sitzung. Wenn LifePilot bereits offen ist, kannst du hier die Verbindung prüfen.</p>
          <button type="button" onClick={()=>void refresh()}>Verbindung prüfen</button>
        </section> : null}
        {error && !(runError || composerError) ? <p role="alert" className="banner">{error.message}</p> : null}
        {!snapshot && !offline ? <Loading label="LifePilot wird verbunden …" /> : null}
        {snapshot ? <>
          {page === 'Start' ? <div className="heading start-heading">
            <div className="editor-title"><h1>{dayState.greeting}{briefingName?', '+briefingName:''}.</h1>
              <button type="button" disabled={!!offline} onClick={()=>{setBriefingVersion(value=>value+1);void refresh()}}>Briefing aktualisieren</button>
            </div>
            <time dateTime={today}>{fullDayFormat.format(new Date(today))}</time>
          </div> : <div className="heading"><h1>{page}</h1></div>}
          {page === 'Kalender' ? <CalendarOverview key={page} mode="month" today={today} openTask={openTask}
            updateKey={calendarUpdateKey} lectureNotices={lectureNotices} /> : null}
          {page === 'Kalender' ? <LiveInbox lecturesOnly onLectures={setLectureNotices} onDecision={()=>{setLectureRefresh(value=>value+1);void refresh()}} batch={inboxBatch} mailRefresh={inboxFeed?.loadedAt} /> : null}
          {page === 'Kalender' ? <FreeWindowFinder key={projectWork?.title??'calendar-tools'} date={today} work={projectWork} allowMac={!snapshot.acceptance} onDraft={canChat ? openDraft : undefined} /> : null}
          {page==='Aufgaben & Fristen'?<TasksBoard api={api} mutate={mutate} today={today} busy={busy||!!offline}
            openTask={openTask} openProject={showProject} openSource={showBoardSource} changeProject={changeProjectBoard}
            planSlot={item=>goProjectWork({title:item.title,date:item.due_date??undefined})}
            updateKey={JSON.stringify([calendarUpdateKey,projectRefresh,projectRunRefresh,inboxFeed?.loadedAt])}/>:null}
          {page==='Projekte'?<>
            {projectsError?<p role="alert">{projectsError}</p>:projects?<ProjectsPanel overview={projects} save={saveProject} saveEditor={saveProjectEditor} mail={decideProject} error={error?.path.startsWith('/projects')?error.message:undefined}
              work={goProjectWork} busy={busy||!!offline} selected={projectSelection} tasks={tasks} openTask={openTask} addTask={id=>{setTaskProject(id);requestAnimationFrame(()=>document.querySelector('.project-task-create')?.scrollIntoView({block:'center'}))}}/>:<Loading label="Projekte werden geladen …"/>}
          </>:null}
          {page === 'Posteingang' ? <>
            <ProjectMailSuggestions suggestions={projects?.suggestions??[]} decide={decideProject} busy={busy||!!offline}/>
            <section className="card settings" aria-label="Relevante Nachrichten">
              <div className="editor-title inbox-header"><h2>Wichtig für dich</h2>
                <div className="actions">
                  <button disabled={loadingInboxFeed || !!offline} onClick={() => void loadInboxFeed()}>
                    {loadingInboxFeed ? 'Wird aktualisiert …' : 'Aktualisieren'}
                  </button>
                  <button className="primary" disabled={refreshingInbox || !!offline} onClick={() => void runInboxRefresh()}>
                    {refreshingInbox ? 'Wird sortiert …' : 'Mails sortieren'}
                  </button>
                </div>
              </div>
              {snapshot.acceptance ? <p className="quiet">Testprofil · Beispielmails. Für Gmail öffne dein persönliches Profil.</p> : null}
              {inboxFeedContents(false)}
              {refreshFeedback}
              {inboxBatch?.applications ? <button className="quiet" onClick={() => navigate('Bewerbungen')}>Bewerbungen ansehen →</button> : null}
              {inboxBatch?.limited ? <button className="quiet" disabled={refreshingInbox} onClick={() => void runInboxRefresh(false)}>Weitere Mails sortieren</button> : null}
            </section>
            <LiveInbox sourceId={boardSource?.source_type==='email'?boardSource.source_id:undefined} onLectures={setLectureNotices} onDecision={()=>{setLectureRefresh(value=>value+1);void refresh()}} batch={inboxBatch} mailRefresh={inboxFeed?.loadedAt} />
          </> : null}
          {page === 'Start' ? <>
            <div className="start-grid briefing-grid">
              <CalendarOverview key="start-week" mode="week" today={today} openTask={openTask} updateKey={calendarUpdateKey}
                briefing={briefing} lectureNotices={lectureNotices} onCalendar={()=>navigate('Kalender')}/>
              <Section title="Fristen & Abgaben" icon="◷">
                {deadlines.length?<ul className="deadline-list">{deadlines.map(({task,project})=>project?
                  <ProjectDeadlineRow key={'project:'+project.id} item={project} open={showProject} busy={busy||!!offline||projects?.projects.find(entry=>entry.id===project.projectId)?.status==='archived'}
                    toggle={async value=>{
                      const owner=projects?.projects.find(entry=>entry.id===project.projectId)
                      if(owner?.status==='active')await (project.id===owner.id?saveProject({projectIntent:'update',deadlineCompleted:value},owner):
                        saveProject({projectIntent:'update_step',completed:value},owner,project.id))
                    }}/>:task?<li key={'task:'+task.id} className={task.status==='done'?'done':''}>
                      {homeTaskFields(task)}
                    </li>:null)}</ul>:<p className="empty">Keine Fristen.</p>}
              </Section>
              <Section title="Aufgaben" icon="✓">
                {homeTasks.some(task=>!task.due_date)?<ul className="deadline-list">{homeTasks.filter(task=>!task.due_date).map(task=>
                  <li key={'task:'+task.id} className={task.status==='done'?'done':''}>{homeTaskFields(task)}</li>)}</ul>:
                  <p className="empty">Keine Aufgaben ohne Frist.</p>}
              </Section>
              <Section title="Wartet auf dein OK" icon="◇">
                {waiting.filter(run=>run.approvals.some(item=>item.action==='adopt'&&item.state==='pending')&&
                  (run.state==='review')).map(run=><details key={'run:'+run.id} className="briefing-approval">
                    <summary>{run.projectChange?.data.title??run.result?.summary??run.input}</summary>
                    <RunDetail compact auditDetails={false} run={run} googleWrite={!!snapshot.googleAppointmentWrite}
                      modelName={snapshot.modelName??'Codex'} busy={busy||!!offline} mutate={mutate}/>
                  </details>)}
                <ProjectMailSuggestions suggestions={projects?.suggestions??[]} decide={decideProject} busy={busy||!!offline} compact/>
                <MailFinance api={api} refreshKey={inboxFeed?.loadedAt+':'+briefingVersion} onUpdate={()=>void refresh()}/>
                <LiveInbox batch={inboxBatch} mailRefresh={inboxFeed?.loadedAt+':'+briefingVersion} onDecision={()=>{setLectureRefresh(value=>value+1);void refresh()}}/>
                <button type="button" className="quiet" onClick={()=>navigate('Posteingang')}>Mailvorschläge öffnen →</button>
              </Section>
            </div>
            {inboxFeed?.messages.some(item=>item.important) ? <section className="card settings start-inbox">
              <div className="editor-title"><h2>Wichtige Nachrichten</h2><button className="quiet" onClick={() => navigate('Posteingang')}>Posteingang öffnen →</button></div>
              {inboxFeedContents(true)}
            </section> : null}
          </> : null}
          {page==='Bestellungstracker' ? <OrderTracker focusId={boardSource?.source_type==='order'?boardSource.source_id:undefined} api={api} refreshKey={inboxFeed?.loadedAt+':'+orderRefreshKey} onTask={openTask} onUpdate={()=>void refresh()} /> : null}
          {page==='Kalender' ? <>
            {!snapshot.acceptance ? <NewTask mutate={mutate} projects={projects?.projects} onAdded={openTask} disabled={busy || !!offline} /> : null}
            {notices.length ? <Section title="Fällige Erinnerungen" icon="•">{notices.map(item => <div className="run-row card" key={item.id}>
              <button className="quiet" onClick={() => openTask(item.task_id)}>{tasks.find(task => task.id === item.task_id)?.title}</button>
              <button onClick={() => void mutate('/schedule/' + item.id + '/dismiss', { confirm: true })}>Ausblenden</button>
            </div>)}</Section> : null}
          </> : null}
          {page === 'Skills' ? <>
            {waiting.length ? <Section title="Freigaben" icon="◇">{waiting.map(run => <RunRow key={run.id} run={run} onClick={() => { show(run.id); document.getElementById('agent-chat')?.focus() }} />)}</Section> : null}
            <div className="skill-grid">
              {([
                ['E-Mail-Manager','envelope','Prüft relevante Mails und schlägt Ausgaben, Abos und Fristen vor.'],
                ['Projektplaner','folder','Verwaltet Projektaufgaben, Meilensteine und Fristen.','Projekte',()=>navigate('Projekte')],
                ['Bestellungstracker','parcel','Verfolgt Lieferungen, Retouren und Erstattungen.','Bestellungen',()=>navigate('Bestellungstracker')],
                ['Urlaubsplaner','plane','Bündelt Tagespläne, Buchungen und Reisevorbereitung.','Reisen',()=>navigate('Urlaubsplaner')],
                ['Outfit-Assistent','shirt','Kombiniert Kleidungsstücke und Düfte passend zum Anlass.','Styling-Studio',()=>navigate('Outfit-Assistent')],
                ['Bewerbungsmanager','briefcase','Verwaltet Bewerbungen, Rückmeldungen und Gespräche.','Bewerbungen',()=>navigate('Bewerbungen')],
                ['Vorrat & Einkauf','basket','Pflegt Vorräte, Einkaufslisten und Artikel vom Kassenbon.','Vorrat & Einkauf',()=>navigate('Vorrat & Einkauf')],
                ['Kochassistent','chef','Schlägt Rezepte vor und zeigt fehlende Zutaten.','Rezeptidee anfragen',()=>openDraft('Was kann ich heute aus meinem Vorrat kochen?')],
                ['Deadline Guardian','clock','Zeigt offene und überfällige Fristen im Chat.','Fristen prüfen',()=>openDraft('Welche Fristen sind offen oder überfällig?')],
                ['Smart Planning','wand','Findet freie Zeitfenster anhand deiner Aufgaben und Kalender.','Planung anfragen',()=>openDraft('Welche freien Zeitfenster habe ich diese Woche?')],
                ['Aufgaben & Fristen','listtodo','Bündelt Aufgaben, Abgaben und verknüpfte Projekte.','Aufgaben & Fristen',()=>navigate('Aufgaben & Fristen')],
                ['Kalender & Serien','calendar','Bereitet Termine und wiederkehrende Kalenderserien vor.','Kalender',()=>navigate('Kalender')],
                ['Finanzen & Abos','wallet','Zeigt Einnahmen, Ausgaben und Abos im Monatsvergleich.','Finanzen & Abos',()=>navigate('Finanzen & Abos')],
              ] as const).map(([title,icon,description,label,action])=><section className="card skill-card" key={title}>
                <span className="skill-icon"><Icon name={icon}/></span><h2>{title}</h2><p>{description}</p>
                {action&&<button type="button" onClick={action}>{label}</button>}
              </section>)}
            </div>
          </> : null}
          {page==='Vorrat & Einkauf' ? <GroceryPanel api={api} recipeVersion={recipeVersion} onAsk={()=>openDraft('Was kann ich heute mit meinem Vorrat kochen?')} refreshKey={skillRefresh('grocery')}/> : null}
          {page==='Finanzen & Abos' ? <>
            <MailFinance api={api} refreshKey={inboxFeed?.loadedAt??''} onUpdate={()=>void refresh()} />
            <FinancePanel focus={boardSource?.source_type==='finance'?{id:boardSource.source_id,month:boardSource.originalDue?.slice(0,7)}:undefined} api={api} refreshKey={skillRefresh('finance')} />
          </> : null}
          {page==='Urlaubsplaner' ? <TravelPlanner key={travelRequest?.run ?? 'travel'} api={api} plan={travelRequest?.plan} handoff={travelRequest?.run}
            initialId={travelSelection} onSelect={setTravelSelection} /> : null}
          {page === 'Outfit-Assistent' ? <OutfitAssistant key={outfitRequest?.run ?? 'studio'} api={api} initialPlan={outfitRequest?.plan} initialChoice={outfitRequest?.choice} initialError={outfitRequest?.error} fragranceNames={outfitRequest?.fragranceNames} initialRequired={outfitRequest?.required} onOrders={()=>navigate('Bestellungstracker')} /> : null}
          {page === 'Bewerbungen' ? <Applications initialId={boardSource?.source_type==='application'?boardSource.source_id:undefined} api={api} onBack={() => setPage('Skills')} /> : null}
          {page === 'Einstellungen' ? <>
            <nav className="actions settings-tabs" aria-label="Einstellungsbereiche">
              {(['Profil','Übersicht','Verbindungen'] as const).map(item=><button type="button" key={item}
                className={settingsSection===item?'primary':undefined} aria-pressed={settingsSection===item}
                onClick={()=>setSettingsSection(item)}>{item}</button>)}
            </nav>
            {settingsSection==='Profil' ? <><ProfilePanel api={api} /><MemoryPanel snapshot={snapshot} mutate={mutate} busy={busy} /></> : null}
            {settingsSection==='Verbindungen' && !snapshot.acceptance ? <GoogleSettings onMailConnectionChange={clearInboxFeed} /> : null}
            {settingsSection==='Verbindungen' && snapshot.acceptance ? <p>Google-Verbindungen sind im persönlichen Profil verfügbar.</p> : null}
            {settingsSection==='Übersicht' ? <>
            <PersonalAccountOverview version={snapshot.version} testMode={snapshot.acceptance}/>
            <div className="card settings"><h2>Erscheinungsbild</h2><p>Heller Modus</p></div>
            <div className="card settings"><h2>Agenten-Chat</h2>
              <p>{snapshot.chatMode==='disabled' ? 'Wartet auf Freigabe' : snapshot.chatMode==='synthetic' ? 'Bereit für Testdaten' : 'Mit Codex verbunden'}</p>
            </div>
            <details className="card settings"><summary>Verbesserung anfragen</summary>
              <form onSubmit={async event => {
                event.preventDefault()
                const answer = await mutate<{ reason: string }>('/improvements', { content: improvement })
                if (answer) { setBuilderStatus(answer.reason); setImprovement('') }
              }}>
                <label>Dein Vorschlag<textarea value={improvement} onChange={event => setImprovement(event.target.value)} maxLength={1200} required /></label>
                <button disabled={busy || !improvement.trim()}>Vorschlag speichern</button>
                {builderStatus ? <p role="status">{builderStatus}</p> : null}
              </form>
            </details>
            </> : null}
          </> : null}
        </> : null}
        {taskProject&&page==='Projekte'?<section className="card settings project-task-create" aria-label="Projektaufgabe anlegen">
          <button type="button" className="quiet" onClick={()=>setTaskProject(undefined)}>Schließen</button>
          <NewTask expanded projects={projects?.projects} projectId={taskProject} mutate={mutate} disabled={busy||!!offline}
            onAdded={id=>{setTaskProject(undefined);openTask(id)}}/>
        </section>:null}
        {currentTask ? <dialog className="task-dialog card" aria-label="Aufgabe oder Termin bearbeiten" ref={taskDialog}
          onCancel={event => { event.preventDefault(); setTaskId(null) }}>
          {error && currentTask && (error.path.startsWith('/tasks/') || error.path.startsWith('/schedule')) ? <p role="alert">{error.message}</p> : null}
          <TaskEditor key={currentTask.id + ':' + currentTask.revision} task={currentTask} tasks={tasks} schedule={schedule} projects={projects?.projects} openSchedule={taskScheduleFocus}
            mutate={mutate} onClose={() => setTaskId(null)} loadHistory={id => api('/tasks/' + id)}
            renderExport={snapshot?.acceptance ? undefined : slot => <CalendarExport slot={slot.id}
              preferred={!!snapshot?.calendarTarget} onSaved={() => void refresh()} />} />
        </dialog> : null}
      </div>
    </main>
    <aside className="chat" id="agent-chat" tabIndex={-1} aria-label="LifePilot Chat">
      <header className="chat-head"><span className="mark pilot-mark" aria-hidden>P</span><div><strong>Pilot</strong><small>Dein Assistent</small></div>
          <a className="layout-jump" href="#main-content">Zum Inhalt</a>
          <button type="button" className="quiet" onClick={()=>{resetConversation();requestAnimationFrame(()=>composer.current?.focus())}}>Neuer Chat</button>
      </header>
      <div className="conversation" aria-live="polite">
        {snapshot?.chatMode==='disabled' ? <div className="actions">
          <button type="button" disabled={refreshingInbox || !!offline} onClick={() => void runInboxRefresh()}>E-Mail-Verlauf prüfen</button>
          {inboxBatch ? <button type="button" onClick={() => { openFromPilot('Posteingang') }}>Vorschläge öffnen</button> : null}
        </div> : null}
        {refreshFeedback}
        {sessionExpired ? <div className="approval" role="status">Die Sitzung ist abgelaufen. Öffne LifePilot erneut mit dem NIGHTBOT-Starter oder prüfe die Verbindung auf Start.</div> : null}
        {earlier.length>0&&<details className="history-note"><summary>Vorherige Nachrichten in diesem Chat</summary>
          {earlier.map(run=><div key={run.id}><p>{run.input}</p>{run.result?.summary&&<p>{run.result.summary}</p>}</div>)}
        </details>}
        <ProjectMailSuggestions suggestions={projects?.suggestions??[]} decide={decideProject} busy={busy||!!offline} compact/>
        {projectReview?.step?<button type="button" onClick={()=>goProjectWork({title:projectReview.step!,date:projectReview.date??undefined})}>Freie Zeit finden</button>:null}
        {focus?.parent_run&&<button type="button" className="quiet" onClick={()=>show(focus.parent_run!)}>Alle Aufträge dieser Nachricht</button>}
        {focus ? <RunDetail key={focus.id+':'+focus.turn} compact auditDetails={false} onQuickReply={activeReply && canChat ? useQuickReply : undefined} googleWrite={!!snapshot?.googleAppointmentWrite} modelName={snapshot?.modelName ?? 'Codex'} run={focus} busy={busy || !!offline} mutate={mutate} actionError={runError} onReply={
          canChat && mayReply && focus.turn < 24 && !activeReply ? () => chooseReply(focus) : undefined
        } /> :
          canChat ? <p className="empty">Hier erscheinen dein Auftrag und die Vorschläge von LifePilot.</p> : null}
        {focus?.result?.skill==='outfit' && focus.result.skillData && 'fragrances' in focus.result.skillData &&
          !focus.result.questions.length && ['review','accepted'].includes(focus.state) ? <section className="approval" aria-label="Duftaufnahme">
            <ul>{focus.result.skillData.fragrances.map(name=><li key={name}>{name}</li>)}</ul>
            <button type="button" className="primary" disabled={skillBusy}
              onClick={()=>void executeChatSkill(focus)}>Duftsammlung ergänzen</button>
          </section>:null}
        {focus?.result?.skill === 'inbox_refresh' && focus.state === 'review' ? <button className="primary" type="button"
          disabled={refreshingInbox || !!offline} onClick={() => void runInboxRefresh()}>Vorgeschlagenen E-Mail-Durchlauf starten</button> : null}
        {group.length>0&&<div className="chat-groups">{group.map((run,index)=><section key={run.id}>
          <div className="run-meta"><strong>{run.result?.skill?chatSkills[run.result.skill]:'Aufgaben'} · {index+1}</strong></div>
          <RunDetail key={run.id+':'+run.turn} grouped compact auditDetails={false} run={run} mutate={mutate} busy={busy||!!offline}
            modelName={snapshot?.modelName??'Codex'} googleWrite={!!snapshot?.googleAppointmentWrite}/>
          <button type="button" className="quiet" onClick={()=>show(run.id)}>{run.result?.questions.length?'Rückfrage öffnen':'Auftrag öffnen'}</button>
        </section>)}</div>}
        {focus && ['review','accepted'].includes(focus.state) && focus.result?.skill === 'deadline_guardian' && (snapshot?.acceptance || skillResult?.error) ? <button type="button" className="primary"
          disabled={skillBusy} onClick={() => void executeChatSkill(focus)}>Offene Fristen anzeigen</button> : null}
        {focus && ['review','accepted'].includes(focus.state) && focus.result?.skill === 'smart_planning' && focus.result.skillData && (snapshot?.acceptance || skillResult?.error) ? <button type="button" className="primary"
          disabled={skillBusy} onClick={() => void executeChatSkill(focus)}>Freie Zeitfenster berechnen</button> : null}
        {focus && currentTripChange ? <div className="approval" aria-live="polite">
          {'offer' in currentTripChange ? <>
            <p>„{currentTripChange.offer.activity}“ in {currentTripChange.offer.destination} vom {formatDate(currentTripChange.offer.from)} auf {formatDate(currentTripChange.offer.to)} verschieben?</p>
            <div className="actions">
              <button type="button" className="primary" disabled={skillBusy} onClick={()=>void answerTripChange(focus,currentTripChange.offer.id,true)}>Ja</button>
              <button type="button" disabled={skillBusy} onClick={()=>void answerTripChange(focus,currentTripChange.offer.id,false)}>Nein</button>
            </div>
          </> : 'choices' in currentTripChange ? <>
            <p>Welche Reise meinst du?</p>
            <div className="actions">{currentTripChange.choices.map(entry=><button type="button" key={entry.id} disabled={skillBusy}
              onClick={()=>void askTripChange(focus,entry.id).catch(cause=>setTripChange({run:focus.id,turn:focus.turn,
                result:{message:cause instanceof Error ? cause.message : 'Die Reise konnte nicht geöffnet werden.'}}))}>
              {entry.destination} · {formatDate(entry.start)}</button>)}</div>
          </> : <p>{currentTripChange.message}</p>}
        </div> : null}
        {focus?.result?.skill==='grocery' ? <button className="quiet" type="button" onClick={()=>{openFromPilot('Vorrat & Einkauf')}}>Vorrat &amp; Einkauf öffnen</button> : null}
        {focus?.state==='accepted'&&focus.groceryChange?.write==='receipt'&&focus.groceryChange.totalCents ? <button className="quiet" type="button"
          onClick={()=>{setReplyTo(null);setNewConversation(true);setInput('Erfasse den bestätigten Bonbetrag '+money(focus.groceryChange!.totalCents!)+' als variable Ausgabe Supermarkteinkauf in Finanzen.')}}>Bonbetrag für Finanzen vorbereiten</button>:null}
        {focus?.result?.skill==='orders' && skillResult?.orders ? <p role="status">{skillResult.orders.checked} Bestellmails geprüft.
          {skillResult.orders.limited ? ' Der Abruf hat sein Limit erreicht.' : ''}</p> : null}
        {focus?.result?.skill==='orders' ? <button className="quiet" type="button" disabled={skillBusy}
          onClick={()=>skillResult?.orders ? openFromPilot('Bestellungstracker') : void executeChatSkill(focus)}>
          {skillResult?.orders ? 'Bestellungstracker öffnen' : 'Bestellungen prüfen'}</button> : null}
        {focus?.result?.skill==='finance' ? <button className="quiet" type="button" onClick={()=>{openFromPilot('Finanzen & Abos')}}>Finanzen &amp; Abos öffnen</button> : null}
        {focus && ['review','accepted'].includes(focus.state) && focus.result?.skill==='travel' && !focus.result.questions.length &&
          !(focus.result.skillData && 'intent' in focus.result.skillData && focus.result.skillData.intent==='change') ? <button type="button"
          disabled={skillBusy} onClick={()=>void executeChatSkill(focus)}>{focus.result.skillData && 'intent' in focus.result.skillData &&
            focus.result.skillData.intent==='draft' ? 'Reisevorschau öffnen' : 'Urlaubsplaner öffnen'}</button> : null}
        {focus && ['review','accepted'].includes(focus.state) && focus.result?.skill === 'outfit' &&
          !focus.result.questions.length && !(focus.result.skillData && 'fragrances' in focus.result.skillData) ? <button type="button"
          disabled={skillBusy} onClick={() => void executeChatSkill(focus)}>Styling-Studio öffnen</button> : null}
        {focus && ['review','accepted'].includes(focus.state) && focus.result?.skill === 'applications' ? <button type="button"
          disabled={skillBusy} onClick={() => void executeChatSkill(focus)}>Bewerbungsmanager öffnen</button> : null}
        {waitingForChat || skillBusy ? <Loading label="Pilot arbeitet …" /> : null}
        {skillResult?.error ? <p role="alert">{skillResult.error}</p> : null}
        {skillResult?.deadlines ? <TaskList tasks={skillResult.deadlines} onSelect={openTask} /> : null}
        {skillResult?.planning ? <div className="note">
          <strong>{skillResult.planning.calendar ? 'Freie Zeiten mit Google-Kalender' : 'Freie Zeiten im lokalen Kalender'}</strong>
          {skillResult.planning.windows.length ? <div className="actions chat-quick-replies">{skillResult.planning.windows.slice(0,6).map(slot =>
            <button type="button" key={slot.at} disabled={busy || waitingForChat} onClick={() => {
              const duration = Math.round((Date.parse(slot.endsAt) - Date.parse(slot.at))/60000)
              useQuickReply(`Nimm für den Termin den ${slot.day} um ${clockFormat.format(new Date(slot.at))} Uhr für ${duration} Minuten.`)
            }}>{displayTime(slot.at)}–{clockFormat.format(new Date(slot.endsAt))}</button>)}</div> : <p>Keine passenden Zeitfenster gefunden.</p>}
        </div> : null}
        {chatAppointment && !snapshot?.acceptance ? <button type="button" onClick={() => {
          openTask(chatAppointment.id)
        }}>Zeitblock für Kalender öffnen</button> : null}
      </div>
      {snapshot ? <form className="composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="input">{activeReply ? 'Antwort im selben Vorgang' : 'Was steht an?'}</label>
        <textarea id="input" ref={composer} placeholder={!canChat ? 'E-Mail-Verlauf prüfen' : activeReply ? 'Schreib deine Antwort …' : 'Schreib Pilot eine Nachricht …'} value={input} onChange={event => { setInput(event.target.value); setSynthetic(false) }}
          onPaste={event => {
            const file = event.clipboardData.files[0]
            if (!file || !canChat || busy || waitingForChat || readingFile || offline) return
            event.preventDefault()
            void selectDocument(file)
          }}
          onKeyDown={event => {
            if ((snapshot.chatMode === 'private' || snapshot.directTestChat) && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (!waitingForChat && !busy && !offline && input.trim()) event.currentTarget.form?.requestSubmit()
            }
          }} required />
        {readingFile ? <Loading label="Anhang wird gelesen …" /> : null}
        {doc ? <div className="composer-attachment"><Icon name="paperclip" /><span>{doc.name}</span>
          <button type="button" className="quiet" aria-label="Anhang entfernen" onClick={removeDocument}>×</button></div> : null}
        {docError ? <p role="alert">{docError} <button type="button" className="quiet" onClick={removeDocument}>Zurücksetzen</button></p> : null}
        {!canChat ? <small>Der persönliche KI-Chat wartet auf seine Freigabe. Der E-Mail-Manager ist verfügbar.</small> :
          snapshot.directTestChat && !doc ? <small>Nur Beispieldaten verwenden.</small> :
          snapshot.acceptance ? <label className="data-check"><input type="checkbox" checked={synthetic} onChange={event => setSynthetic(event.target.checked)} />Nur synthetische Testdaten</label> : null}
        <div className="composer-actions">
          <input ref={attachmentInput} hidden type="file" accept=".txt,.md,.pdf,.png,.jpg,.jpeg" onChange={event => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void selectDocument(file)
          }} />
          <button type="button" className="quiet composer-tool" aria-label="Datei oder Bild anhängen" title="Datei oder Bild anhängen"
            disabled={!canChat || busy || waitingForChat || readingFile || !!offline}
            onClick={() => attachmentInput.current?.click()}><Icon name="paperclip" /></button>
          <label className="quiet composer-tool grocery-chat-upload" title="Vorratsfoto oder Kassenbon scannen">
            <Icon name="camera"/><span className="sr-only">Vorratsfoto oder Kassenbon scannen</span>
            <input type="file" aria-label="Vorratsfoto oder Kassenbon scannen" accept="image/png,image/jpeg,image/webp,image/heic,.heic,.heif"
              disabled={!canChat||busy||waitingForChat||readingFile||!!offline} onChange={event=>{
                const file=event.currentTarget.files?.[0]
                event.currentTarget.value=''
                if(file)void selectGroceryImage(file)
              }}/>
          </label>
          <Dictation disabled={!canChat || busy || waitingForChat || !!offline} stopSignal={dictationStop}
            focus={() => composer.current?.focus()} append={value => {
              setInput(text => (text.trimEnd() + (text.trim() ? ' ' : '') + value))
              setSynthetic(false)
            }} />
          <button className="primary composer-send" aria-label={inboxShortcut ? 'E-Mail-Manager starten' : 'Senden'}
            title={inboxShortcut ? 'E-Mail-Manager starten' : 'Senden'}
            disabled={!input.trim() || busy || waitingForChat || !!offline || readingFile || !!docError ||
              (inboxShortcut ? refreshingInbox : !canChat || snapshot.acceptance && !synthetic && (!snapshot.directTestChat || !!doc) && !readyAnswer)}>
            <span aria-hidden>↑</span>
          </button>
        </div>
        {composerError ? <p role="alert" className="error-text">{composerError}</p> : null}
      </form> : null}
    </aside>
  </div>
}

createRoot(document.getElementById('app')!).render(<App />)
