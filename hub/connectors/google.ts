import {needsMailBody} from '../../agents/lifepilot/tools/mail-depth.ts'
import { htmlMailText, parseClothingMail, type ClothingMail } from '../runtime/clothing-mail.ts'
import { createHash, randomBytes } from 'node:crypto'
import { constants, existsSync, mkdirSync, openSync, closeSync, fstatSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Problem } from '../runtime/settings.ts'
import { classifyMail, inboxLabel, inboxLabelNames, mailCategoryNames, type InboxLabel, type MailClassificationCategory } from '../../agents/lifepilot/tools/classify-mail.ts'
import { isDate } from '../runtime/values.ts'

export const googleScopes = {
  calendar: 'https://www.googleapis.com/auth/calendar.events.owned.readonly',
  'calendar-write':'https://www.googleapis.com/auth/calendar.events.owned openid email',
  gmail: 'https://www.googleapis.com/auth/gmail.metadata',
  'gmail-content': 'https://www.googleapis.com/auth/gmail.readonly',
  'calendar-test': 'https://www.googleapis.com/auth/calendar.app.created',
  'gmail-sort': 'https://www.googleapis.com/auth/gmail.modify',
} as const
export type GoogleService = keyof typeof googleScopes
export type GoogleStatus = { service: GoogleService, configured: boolean, connected: boolean }
export type GoogleEvent = { id: string, title: string, start: string, end: string, allDay: boolean }
export type GoogleMail = { id: string, subject: string, from: string, at: string | null }
export type MailCategory = 'deadlines' | 'orders' | 'returns'
export type GmailPage = { pageToken: string, afterEpoch: number }
export type GmailRange = { afterEpoch:number, beforeEpoch:number, account?:string }
export type MailContent = GoogleMail & { text: string, truncated: boolean, dates: string[], previewOnly?: boolean, replyToMessage?: boolean, originalRecipients?: string, mailingList?: boolean, clothing?:ClothingMail }
const mailQueries: Record<MailCategory, string> = {
  deadlines: '{Frist Abgabe Deadline fällig Zahlungsziel}',
  orders: '{Bestellung Bestellbestätigung Sendungsverfolgung Versand Lieferung}',
  returns: '{Retoure Rücksendung Rückgabefrist retourenlabel Rücksendeetikett}',
}
const validMessageId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)
type Client = { client_id: string, client_secret: string }
type GoogleIdentity = { subject: string, email: string }
type Grant = { token: string, refresh: string, expiresAt: number, scope: string, identity?: GoogleIdentity }
type OAuthAttempt = { service: GoogleService, verifier: string, expiresAt: number, epoch: number, expectedEmail?: string }

const tokenEndpoint = 'https://oauth2.googleapis.com/token'
const identityEndpoint = 'https://openidconnect.googleapis.com/v1/userinfo'
const accountEmail = (value: unknown) => typeof value === 'string' && value.length <= 320 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(value.trim())
  ? value.trim().toLowerCase() : undefined
function canonicalScopes(scope: string) {
  return [...new Set(scope.trim().split(/\s+/u).map(value =>
    value === 'https://www.googleapis.com/auth/userinfo.email' ? 'email' : value))].sort().join(' ')
}
const calendarEndpoint = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const gmailEndpoint = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
const maxResponse = 1_048_576
const nonce = () => randomBytes(32).toString('base64url')
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const display = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : ''
const credential = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= limit && /^[\x21-\x7e]+$/.test(value)

export function googleService(value: unknown): GoogleService {
  if (typeof value !== 'string' || !Object.hasOwn(googleScopes, value)) throw new Problem(400, 'Wähle Gmail oder Google Calendar.')
  return value as GoogleService
}

export class GoogleConnector {
  private readonly dir: string
  private readonly redirectUri: string
  private readonly request: typeof fetch
  private readonly attempts = new Map<string, OAuthAttempt>()
  private readonly epochs: Record<GoogleService, number> = { calendar: 0, 'calendar-write':0, gmail: 0, 'gmail-content': 0, 'calendar-test': 0, 'gmail-sort': 0 }
  private readonly refreshing = new Map<GoogleService, Promise<string>>()

  constructor(data: string, origin: string, request = fetch) {
    this.dir = join(data, 'google')
    this.redirectUri = origin + '/oauth/google/callback'
    this.request = request
  }

  private path(service: GoogleService, kind: 'client' | 'grant') { return join(this.dir, service + '-' + kind + '.json') }

  private read<T>(service: GoogleService, kind: 'client' | 'grant'): T | undefined {
    let descriptor: number
    try { descriptor = openSync(this.path(service, kind), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw new Problem(409, 'Die lokale Google-Konfiguration ist nicht lesbar.')
    }
    try {
      const file = fstatSync(descriptor)
      if (!file.isFile() || (file.mode & 0o077) || file.size > 24_000) throw new Error('Dateirechte')
      return JSON.parse(readFileSync(descriptor, 'utf8')) as T
    } catch { throw new Problem(409, 'Die lokale Google-Konfiguration ist nicht lesbar.') }
    finally { closeSync(descriptor) }
  }

  private save(service: GoogleService, kind: 'client' | 'grant', value: Client | Grant) {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
    const tmp = join(this.dir, nonce() + '.tmp')
    try {
      writeFileSync(tmp, JSON.stringify(value), { flag: 'wx', mode: 0o600 })
      renameSync(tmp, this.path(service, kind))
    } finally { rmSync(tmp, { force: true }) }
  }

  private client(service: GoogleService) {
    return this.read<Client>(service, 'client') ?? (service === 'gmail-content' ? this.read<Client>('gmail', 'client') : service==='calendar-write'?this.read<Client>('calendar','client'):undefined)
  }

  private calendarWriteGrant(): (Grant & { identity: GoogleIdentity }) | undefined {
    let grant: Grant | undefined
    try { grant = this.read<Grant>('calendar-write', 'grant') }
    catch { return undefined }
    if (grant?.scope === googleScopes['calendar-write'] && grant.identity &&
        credential(grant.identity.subject, 255) && accountEmail(grant.identity.email) === grant.identity.email) {
      return { ...grant, identity: grant.identity }
    }
  }

  status(): GoogleStatus[] {
    return (Object.keys(googleScopes) as GoogleService[]).map(service => ({
      service, configured: existsSync(this.path(service, 'client')) ||
        (service === 'gmail-content' && existsSync(this.path('gmail', 'client'))) ||
        (service==='calendar-write'&&existsSync(this.path('calendar','client'))), connected: service === 'calendar-write' ? Boolean(this.calendarWriteGrant()) : existsSync(this.path(service, 'grant')),
    }))
  }

  configure(service: GoogleService, input: unknown) {
    const client = object(object(input).installed)
    if (!credential(client.client_id, 240) || !/^[\w-]+\.apps\.googleusercontent\.com$/.test(client.client_id) ||
        !credential(client.client_secret, 256)) throw new Problem(400, 'Eine Google-OAuth-Clientdatei vom Typ Desktop-App ist erforderlich.')
    if (existsSync(this.path(service, 'grant'))) throw new Problem(409, 'Trenne zuerst die vorhandene Verbindung.')
    if (service === 'gmail' && !existsSync(this.path('gmail-content', 'client'))) {
      if (existsSync(this.path('gmail-content', 'grant'))) throw new Problem(409, 'Trenne zuerst den Gmail-Lesezugriff.')
      this.epochs['gmail-content']++
    }
    this.epochs[service]++
    this.save(service, 'client', { client_id: client.client_id, client_secret: client.client_secret })
    return this.status()
  }

  disconnect(service: GoogleService) {
    this.epochs[service]++
    this.refreshing.delete(service)
    for (const [state, attempt] of this.attempts) if (attempt.service === service) this.attempts.delete(state)
    rmSync(this.path(service, 'grant'), { force: true })
    return this.status()
  }

  begin(service: GoogleService, account?:string|null) {
    const client = this.client(service)
    if (!client) throw new Problem(409, 'Hinterlege zuerst die OAuth-Datei für diesen Dienst.')
    const expectedEmail = service === 'calendar-write' ? accountEmail(account) : undefined
    if (service === 'calendar-write' && !expectedEmail) throw new Problem(409, 'Verbinde zuerst das Gmail-Hauptkonto.')
    const connected = service === 'calendar-write' ? this.calendarWriteGrant() : existsSync(this.path(service, 'grant'))
    if (connected) throw new Problem(409, 'Trenne zuerst die vorhandene Verbindung.')
    for (const [state, attempt] of this.attempts) {
      if (attempt.expiresAt <= Date.now() || attempt.service === service) this.attempts.delete(state)
    }
    const verifier = nonce()
    const state = nonce()
    this.attempts.set(state, { service, verifier, expiresAt: Date.now() + 5 * 60_000, epoch: ++this.epochs[service], expectedEmail })
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search = new URLSearchParams({
      client_id: client.client_id, redirect_uri: this.redirectUri, response_type: 'code', scope: googleScopes[service],
      state, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'false',
    }).toString()
    if (expectedEmail) url.searchParams.set('login_hint', expectedEmail)
    return { url: url.href }
  }

  private async json(url: string, args?: RequestInit): Promise<Record<string, unknown>> {
    try {
      const response = await this.request(url, { ...args, redirect: 'error', signal: AbortSignal.timeout(6000) })
      if (!response.ok) {
        if (response.status===403) {
          const error=await response.json().catch(()=>({}))
          if (Array.isArray(error.error?.errors) && error.error.errors.some((entry:Record<string,unknown>)=>
            entry.reason==='rateLimitExceeded' || entry.reason==='userRateLimitExceeded')) {
            throw new Problem(503,'Gmail hat das Anfragelimit erreicht. LifePilot versucht es beim nächsten Durchlauf erneut.')
          }
        } else await response.body?.cancel()
        if (response.status === 404 || response.status === 410) throw new Problem(404, 'Google konnte den Eintrag nicht finden.')
        if (response.status === 412) throw new Problem(409, 'Der Google-Termin wurde inzwischen geändert.')
        if (response.status === 401) throw new Problem(409, 'Google-Zugriff abgelaufen. Verbinde den Dienst erneut.')
        if (response.status === 403) throw new Problem(403, 'Google hat den Zugriff verweigert. Prüfe API und Kontofreigabe.')
        if (response.status === 429) throw new Problem(503, 'Google begrenzt gerade die Anfragen. Versuche es später erneut.')
        if (url === tokenEndpoint && response.status === 400) throw new Problem(409, 'Google konnte die Anmeldung nicht bestätigen.')
        throw new Problem(502, 'Google konnte die Anfrage nicht abschließen.')
      }
      if (response.status === 204) return {}
      const reader = response.body?.getReader()
      if (!reader) throw new Error('Antwort fehlt')
      const chunks: Buffer[] = []
      let length = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > maxResponse) {
          await reader.cancel()
          throw new Error('Antwort zu groß')
        }
        chunks.push(Buffer.from(value))
      }
      return object(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    } catch (error) {
      if (error instanceof Problem) throw error
      throw new Problem(502, 'Google ist nicht erreichbar oder hat eine ungültige Antwort geliefert.')
    }
  }

  private async exchange(service: GoogleService, params: Record<string, string>, existing?: Grant): Promise<Grant> {
    const client = this.client(service)
    if (!client) throw new Problem(409, 'Google ist nicht eingerichtet.')
    const response = await this.json(tokenEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...client, ...params }),
    })
    const scope = response.scope ?? existing?.scope
    const refresh = response.refresh_token ?? existing?.refresh
    if (typeof scope !== 'string' || canonicalScopes(scope) !== canonicalScopes(googleScopes[service]) || !credential(response.access_token, 4096) ||
        !credential(refresh, 4096) || typeof response.expires_in !== 'number' ||
        !Number.isSafeInteger(response.expires_in) || response.expires_in <= 0 || response.expires_in > 86400 ||
        typeof response.token_type !== 'string' || response.token_type.toLowerCase() !== 'bearer') {
      throw new Problem(409, 'Google hat die erwarteten Berechtigungen nicht bestätigt.')
    }
    return { token: response.access_token, refresh, scope: googleScopes[service], expiresAt: Date.now() + response.expires_in * 1000 }
  }

  private async verifyCalendarIdentity(grant: Grant, expectedEmail: string | undefined, expectedSubject?: string) {
    const identity = await this.json(identityEndpoint, { headers: { Authorization: 'Bearer ' + grant.token } })
    const email = accountEmail(identity.email)
    if (!expectedEmail || email !== expectedEmail || identity.email_verified !== true ||
        !credential(identity.sub, 255) || (expectedSubject !== undefined && identity.sub !== expectedSubject)) {
      throw new Problem(403, 'Der Google-Schreibzugriff muss zum verifizierten Gmail-Hauptkonto gehören.')
    }
    grant.identity = { email, subject: identity.sub }
  }

  async complete(params: URLSearchParams) {
    const states = params.getAll('state')
    const state = states.length === 1 ? states[0] : ''
    const attempt = this.attempts.get(state)
    this.attempts.delete(state)
    if (!attempt || attempt.expiresAt <= Date.now() || attempt.epoch !== this.epochs[attempt.service]) {
      throw new Problem(400, 'Diese Google-Anmeldung ist nicht mehr gültig.')
    }
    if (params.has('error')) return false
    const codes = params.getAll('code')
    if (codes.length !== 1 || !credential(codes[0], 1024)) {
      throw new Problem(400, 'Die Google-Anmeldung wurde nicht bestätigt.')
    }
    const grant = await this.exchange(attempt.service, {
      grant_type: 'authorization_code', code: codes[0], code_verifier: attempt.verifier, redirect_uri: this.redirectUri,
    })
    this.ensureEpoch(attempt.service, attempt.epoch)
    if (attempt.service === 'calendar-write') {
      await this.verifyCalendarIdentity(grant, attempt.expectedEmail)
      this.ensureEpoch(attempt.service, attempt.epoch)
    }
    this.save(attempt.service, 'grant', grant)
    return true
  }

  private ensureEpoch(service: GoogleService, epoch: number) {
    if (epoch !== this.epochs[service]) throw new Problem(409, 'Die Google-Verbindung wurde inzwischen geändert.')
  }

  private async access(service: GoogleService) {
    const grant = service === 'calendar-write' ? this.calendarWriteGrant() : this.read<Grant>(service, 'grant')
    if (!grant || grant.scope !== googleScopes[service]) throw new Problem(409, 'Verbinde diesen Google-Dienst zuerst.')
    if (grant.expiresAt > Date.now() + 30_000) return grant.token
    const active = this.refreshing.get(service)
    if (active) return active
    const epoch = this.epochs[service]
    const pending = this.exchange(service, { grant_type: 'refresh_token', refresh_token: grant.refresh }, grant)
      .then(async updated => {
        this.ensureEpoch(service, epoch)
        if (service === 'calendar-write' && grant.identity) {
          await this.verifyCalendarIdentity(updated, grant.identity.email, grant.identity.subject)
          this.ensureEpoch(service, epoch)
        }
        this.save(service, 'grant', updated)
        return updated.token
      }).finally(() => { if (this.refreshing.get(service) === pending) this.refreshing.delete(service) })
    this.refreshing.set(service, pending)
    return pending
  }

  async calendar(days: number) {
    if (!Number.isSafeInteger(days) || days < 1 || days > 31) throw new Problem(400, 'Wähle 1 bis 31 Tage.')
    const start = Date.now()
    return this.calendarRange(new Date(start).toISOString(), new Date(start + days * 86_400_000).toISOString())
  }

  async calendarRange(start: string, end: string, calendar?: string) {
    const service = calendar ? 'calendar-test' : 'calendar'
    const epoch = this.epochs[service]
    const token = await this.access(service)
    this.ensureEpoch(service, epoch)
    const endpoint = calendar ? 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendar) + '/events' : calendarEndpoint
    const params = new URLSearchParams({
      timeMin: start, timeMax: end, singleEvents: 'true', orderBy: 'startTime', showDeleted: 'false', maxResults: '50',
      fields: 'items(id,summary,start,end,status),nextPageToken',
    })
    const data = await this.json(endpoint + '?' + params, { headers: { Authorization: 'Bearer ' + token } })
    this.ensureEpoch(service, epoch)
    const events: GoogleEvent[] = []
    for (const raw of Array.isArray(data.items) ? data.items.slice(0, 50) : []) {
      const event = object(raw), from = object(event.start), to = object(event.end)
      const allDay = typeof from.date === 'string' && typeof to.date === 'string'
      const id = display(event.id, 128)
      const start = display(allDay ? from.date : from.dateTime, 40)
      const end = display(allDay ? to.date : to.dateTime, 40)
      if (!id || event.status === 'cancelled' || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) continue
      events.push({ id, title: display(event.summary, 180) || 'Termin ohne Titel', start, end, allDay })
    }
    return { events, limited: Boolean(data.nextPageToken) }
  }

  private mailHeader(id: string, data: Record<string, unknown>): GoogleMail {
    const parts = object(data.payload).headers
    const header = (name: string) => display((Array.isArray(parts) ? parts.map(object) : [])
      .find(item => typeof item.name === 'string' && item.name.toLowerCase() === name)?.value, 240)
    const at = Number(data.internalDate)
    return { id, subject: header('subject') || '(Ohne Betreff)', from: header('from') || 'Unbekannt',
      at: Number.isSafeInteger(at) && at > 0 && at < 8.64e15 ? new Date(at).toISOString() : null }
  }

  async gmail(limit: number, category?: unknown) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new Problem(400, 'Wähle 1 bis 10 Nachrichten.')
    if (category !== undefined && (typeof category !== 'string' || !Object.hasOwn(mailQueries, category))) {
      throw new Problem(400, 'Wähle Fristen, Bestellungen oder Retouren.')
    }
    const service = category === undefined && this.read('gmail','grant') ? 'gmail' : 'gmail-content'
    const epoch = this.epochs[service]
    const token = await this.access(service)
    this.ensureEpoch(service, epoch)
    const headers = { Authorization: 'Bearer ' + token }
    const params = new URLSearchParams({ maxResults: String(limit), fields: 'messages(id),nextPageToken' })
    if (category === undefined) params.set('labelIds', 'INBOX')
    else params.set('q', 'newer_than:90d ' + mailQueries[category as MailCategory])
    const input = await this.json(gmailEndpoint + '?' + params, { headers })
    this.ensureEpoch(service, epoch)
    const ids = [...new Set((Array.isArray(input.messages) ? input.messages : []).slice(0, limit)
      .map(value => object(value).id).filter(validMessageId))]
    const messages = await Promise.all(ids.map(async id => {
      const fields = new URLSearchParams({ format: 'metadata', fields: 'internalDate,payload(headers)' })
      for (const name of ['Subject', 'From']) fields.append('metadataHeaders', name)
      const data = await this.json(gmailEndpoint + '/' + encodeURIComponent(id) + '?' + fields, { headers })
      return this.mailHeader(id, data)
    }))
    this.ensureEpoch(service, epoch)
    return { messages, limited: Boolean(input.nextPageToken) }
  }

  private async writeRequest(service: 'calendar-test' | 'calendar-write' | 'gmail-sort') {
    const epoch = this.epochs[service]
    const token = await this.access(service)
    this.ensureEpoch(service, epoch)
    return async (url: string, value?: object, method?: 'PATCH' | 'DELETE', etag?: string) => {
      this.ensureEpoch(service, epoch)
      const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(etag ? { 'If-Match': etag } : {}) }
      const result = await this.json(url, { headers, method: method ?? (value ? 'POST' : 'GET'),
        ...(value ? { body: JSON.stringify(value) } : {}) })
      this.ensureEpoch(service, epoch)
      return result
    }
  }

  async calendarTest(start: string, end: string, load: () => string | undefined, save: (calendar: string) => void) {
    return this.insertCalendarEvent('LifePilot Test', 'LifePilot Testtermin', 'lifepilot-test:' + start, start, end, load, save)
  }

  async syncAppointment(slot: string, title: string, start: string, end: string, load: () => string | undefined, save: (calendar: string) => void) {
    return this.insertCalendarEvent('LifePilot', title, 'lifepilot-slot:' + slot, start, end, load, save)
  }

  async syncTrip(trip: string, title: string, start: string, end: string, load: () => string | undefined, save: (calendar: string) => void) {
    return this.insertCalendarEvent('LifePilot', title, 'lifepilot-trip:' + trip, start, end, load, save, true)
  }

  async moveTrip(calendar:string,eventId:string,title:string,previous:{start:string,end:string},next:{start:string,end:string}) {
    const request=await this.writeRequest('calendar-test')
    const url='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calendar)+'/events/'+encodeURIComponent(eventId)
    const matches=(event:Record<string,unknown>,dates:typeof next)=>
      event.id===eventId && event.summary===title && event.visibility==='private' &&
      object(event.start).date===dates.start && object(event.end).date===dates.end
    const current=await request(url)
    if (matches(current,next)) return
    if (!matches(current,previous) || !credential(current.etag,200)) {
      throw new Problem(409,'Der Google-Reiseblock wurde außerhalb von LifePilot geändert. Prüfe den Eintrag bei Google.')
    }
    const result=await request(url+'?sendUpdates=none',{start:{date:next.start},end:{date:next.end}},'PATCH',current.etag)
    if (!matches(result,next)) throw new Problem(502,'Google bestätigte die neuen Reisedaten nicht eindeutig.')
  }

  async removeTrip(calendar: string, trip: string) {
    const id = createHash('sha256').update('lifepilot-trip:' + trip).digest('hex')
    const request = await this.writeRequest('calendar-test')
    const url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendar) + '/events/' + id
    try { await request(url+'?sendUpdates=none', undefined, 'DELETE') }
    catch (error) { if (!(error instanceof Problem && [404,410].includes(error.status))) throw error }
  }

  private async insertCalendarEvent(calendarTitle: string, title: string, key: string, start: string, end: string,
    load: () => string | undefined, save: (calendar: string) => void, allDay = false) {
    const request = await this.writeRequest('calendar-test')
    const endpoint = 'https://www.googleapis.com/calendar/v3/calendars'
    let calendar = load()
    if (!calendar) {
      // Reserve creation before calling Google. Unknown network outcomes must not cause another calendar to be created.
      save('pending')
      const created = await request(endpoint, { summary: calendarTitle, timeZone: 'Europe/Berlin' })
      if (!credential(created.id, 512) || !created.id.includes('@')) throw new Problem(502, 'Google bestätigte die Kalender-ID nicht.')
      calendar = created.id
      save(calendar)
    }
    if (calendar === 'pending') throw new Problem(409, 'Kalendererstellung ungeklärt. Prüfe den LifePilot-Kalender bei Google.')
    const events = endpoint + '/' + encodeURIComponent(calendar) + '/events'
    const id = createHash('sha256').update(key).digest('hex')
    let event: Record<string, unknown>
    try {
      event = await request(events + '?sendUpdates=none', { id, summary: title,
        start: allDay ? {date:start} : {dateTime:start}, end: allDay ? {date:end} : {dateTime:end},
        ...(allDay && {visibility:'private'}), reminders: { useDefault: false } })
    } catch (error) {
      // A retry can recover a success whose original response was lost.
      try { event = await request(events + '/' + id) } catch { throw error }
    }
    const matchesTime = allDay ? object(event.start).date===start && object(event.end).date===end && event.visibility==='private' :
      Date.parse(String(object(event.start).dateTime))===Date.parse(start) && Date.parse(String(object(event.end).dateTime))===Date.parse(end)
    if (event.id !== id || event.summary !== title || !matchesTime) throw new Problem(502, 'Google bestätigte den Termin nicht eindeutig.')
    return { calendar, event: id, title, start, end }
  }

  async changeAppointment(calendar: string, eventId: string, previous: { title: string, start: string, end: string },
    next: { title: string, start: string, end: string } | null, service:'calendar-test'|'calendar-write'='calendar-test') {
    if (service === 'calendar-write' && (!accountEmail(calendar) || this.calendarWriteGrant()?.identity.email !== accountEmail(calendar))) {
      throw new Problem(403, 'Der Kalender gehört nicht zum verifizierten Google-Schreibkonto.')
    }
    const request = await this.writeRequest(service)
    const collection='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calendar)+'/events'
    if(service==='calendar-write'){
      const principal=await request(collection+'?maxResults=1&fields=accessRole')
      if(principal.accessRole!=='owner')throw new Problem(403,'Der Schreibzugriff muss zum verbundenen Hauptkonto gehören.')
    }
    const url=collection+'/'+encodeURIComponent(eventId)
    let current: Record<string, unknown>
    try { current = await request(url) }
    catch (error) { if (!next && error instanceof Problem && error.status === 404) return; throw error }
    if (!next && current.status === 'cancelled') return
    if(service==='calendar-write'&&Array.isArray(current.recurrence)&&current.recurrence.length)throw new Problem(409,'Zur Sicherheit kann nur ein einzelner Termin entfernt werden.')
    const matches = (entry: Record<string, unknown>, expected: typeof previous) => entry.id === eventId && entry.summary === expected.title &&
      Date.parse(String(object(entry.start).dateTime??object(entry.start).date)) === Date.parse(expected.start) &&
      Date.parse(String(object(entry.end).dateTime??object(entry.end).date)) === Date.parse(expected.end)
    if (next && matches(current, next)) return
    if (!matches(current, previous) || !credential(current.etag, 200)) {
      throw new Problem(409, 'Der Google-Termin wurde außerhalb von LifePilot geändert. Prüfe den Eintrag bei Google.')
    }
    const result = await request(url+'?sendUpdates=none', next ? {
      summary: next.title, start: { dateTime: next.start }, end: { dateTime: next.end },
    } : undefined, next ? 'PATCH' : 'DELETE', current.etag)
    if (next && !matches(result,next)) throw new Problem(502, 'Google bestätigte die Änderung nicht eindeutig.')
  }

  async trashInboxMessage(account: string, id: unknown) {
    if (!validMessageId(id)) throw new Problem(400, 'Wähle eine gültige Gmail-Nachricht.')
    const service = 'gmail-sort'
    const epoch = this.epochs[service]
    const token = await this.access(service)
    this.ensureEpoch(service, epoch)
    const headers = { Authorization: 'Bearer ' + token }
    const profile = await this.json('https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=emailAddress', { headers })
    this.ensureEpoch(service, epoch)
    const address = display(profile.emailAddress, 320).toLowerCase()
    if (!address || createHash('sha256').update(address).digest('hex') !== account)
      throw new Problem(409, 'Gmail-Lesen und Schreiben müssen mit demselben Konto verbunden sein.')
    await this.json(gmailEndpoint + '/' + encodeURIComponent(id) + '/trash', { headers, method: 'POST' })
  }

  async sortInboxPage(account: string, mails: MailContent[]) {
    const byCategory = new Map<InboxLabel,string[]>()
    for (const mail of mails) {
      const category=inboxLabel(mail)
      const group=byCategory.get(category) ?? []
      group.push(mail.id)
      byCategory.set(category,group)
    }
    return this.applyInboxLabels(account,byCategory)
  }

  async renameInboxLabels(account:string) {
    const request=await this.writeRequest('gmail-sort')
    const profile=await request('https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=emailAddress')
    const address=display(profile.emailAddress,320).toLowerCase()
    if(!address||createHash('sha256').update(address).digest('hex')!==account)
      throw new Problem(409,'Gmail-Lesen und Sortieren müssen mit demselben Konto verbunden sein.')
    const endpoint='https://gmail.googleapis.com/gmail/v1/users/me/labels'
    const list=await request(endpoint+'?fields=labels(id,name,type)')
    const labels=Array.isArray(list.labels)?list.labels.map(object):[]
    const renamed:string[]=[], conflicts:string[]=[]
    for(const name of new Set([...Object.values(inboxLabelNames),...Object.values(mailCategoryNames)])){
      const previous=labels.find(label=>label.type==='user'&&label.name==='LifePilot · '+name)
      if(!previous||!validMessageId(previous.id)||!previous.id.startsWith('Label_'))continue
      if(labels.some(label=>typeof label.name==='string'&&label.name.toLowerCase()===name.toLowerCase())){
        conflicts.push(name)
        continue
      }
      const updated=await request(endpoint+'/'+previous.id,{name},'PATCH')
      if(updated.id!==previous.id||updated.name!==name)throw new Problem(502,'Gmail hat die Label-Umbenennung nicht bestätigt.')
      renamed.push(name)
    }
    return {renamed,conflicts}
  }

  async applyInboxLabels(account:string,byCategory:ReadonlyMap<InboxLabel,string[]>) {
    const request = await this.writeRequest('gmail-sort')
    const profile = await request('https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=emailAddress')
    const address = display(profile.emailAddress, 320).toLowerCase()
    if (!address || createHash('sha256').update(address).digest('hex') !== account) {
      throw new Problem(409, 'Gmail-Lesen und Sortieren müssen mit demselben Konto verbunden sein.')
    }
    if (!byCategory.size) return 0
    const endpoint = 'https://gmail.googleapis.com/gmail/v1/users/me/labels'
    const list = await request(endpoint + '?fields=labels(id,name,type)')
    const labels = Array.isArray(list.labels) ? list.labels.map(object) : []
    const managed=new Set([...Object.values(inboxLabelNames),...Object.values(mailCategoryNames)].flatMap(name=>[name,'LifePilot · '+name]))
    let labeled = 0
    for (const [category, ids] of byCategory) {
      if (!Object.hasOwn(inboxLabelNames,category) || !ids.length || ids.length>1000 || !ids.every(validMessageId)) {
        throw new Problem(400,'Ungültige Gmail-Labelzuordnung.')
      }
      const name = inboxLabelNames[category]
      const found = labels.find(label => label.name === name && label.type === 'user')
      const label = found ?? await request(endpoint, { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' })
      if (!validMessageId(label.id) || !label.id.startsWith('Label_')) throw new Problem(502, 'Google lieferte kein gültiges LifePilot-Label.')
      const prior=labels.filter(item=>item.type==='user' && item.name!==name && typeof item.name==='string' && managed.has(item.name) &&
        validMessageId(item.id)).map(item=>item.id)
      await request(gmailEndpoint + '/batchModify', { ids, addLabelIds: [label.id], ...(prior.length && {removeLabelIds:prior}) })
      labeled += ids.length
    }
    return labeled
  }

  async gmailSortTest(id: unknown, category?: MailClassificationCategory) {
    if (!validMessageId(id)) throw new Problem(400, 'Wähle eine gültige Gmail-Nachricht.')
    const readEpoch = this.epochs['gmail-content']
    const readToken = await this.access('gmail-content')
    const request = await this.writeRequest('gmail-sort')
    const profileUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=emailAddress'
    const [reader, writer] = await Promise.all([
      this.json(profileUrl, { headers: { Authorization: 'Bearer ' + readToken } }), request(profileUrl),
    ])
    this.ensureEpoch('gmail-content', readEpoch)
    const account = display(reader.emailAddress, 320).toLowerCase()
    if (!account || account !== display(writer.emailAddress, 320).toLowerCase()) {
      throw new Problem(409, 'Gmail-Lesen und Sortieren müssen mit demselben Konto verbunden sein.')
    }
    if (category) {
      const current = classifyMail(await this.mailContent(id))
      this.ensureEpoch('gmail-content', readEpoch)
      if (current.category !== category) throw new Problem(409, 'Die Kategorie hat sich geändert. Prüfe den Mailvorschlag erneut.')
    }
    const message = gmailEndpoint + '/' + id
    const metadata = await request(message + '?format=minimal&fields=id,labelIds')
    if (metadata.id !== id || !Array.isArray(metadata.labelIds) || !metadata.labelIds.includes('INBOX')) {
      throw new Problem(409, 'Wähle eine Nachricht aus dem aktuellen Gmail-Posteingang.')
    }
    const endpoint = 'https://gmail.googleapis.com/gmail/v1/users/me/labels'
    const name = category ? mailCategoryNames[category] : 'LifePilot Test'
    const list = await request(endpoint + '?fields=labels(id,name,type)')
    const found = (Array.isArray(list.labels) ? list.labels : []).map(object).find(label => label.name === name && label.type === 'user')
    const label = found ?? await request(endpoint, { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' })
    if (!validMessageId(label.id) || !label.id.startsWith('Label_')) throw new Problem(502, 'Google lieferte kein gültiges Testlabel.')
    const changed = await request(message + '/modify', { addLabelIds: [label.id] })
    if (changed.id !== id || !Array.isArray(changed.labelIds) || !changed.labelIds.includes(label.id)) {
      throw new Problem(502, 'Gmail bestätigte das Testlabel nicht.')
    }
    return { message: id, label: name }
  }

  async applicationMails() {
    const service = 'gmail-content'
    const epoch = this.epochs[service]
    const token = await this.access(service)
    this.ensureEpoch(service, epoch)
    const headers = { Authorization: 'Bearer ' + token }
    const profile = await this.json('https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=emailAddress', { headers })
    this.ensureEpoch(service, epoch)
    const address = display(profile.emailAddress, 320).toLowerCase()
    if (!address.includes('@')) throw new Problem(502, 'Google konnte das Gmail-Konto nicht identifizieren.')
    const params = new URLSearchParams({
      q: 'newer_than:365d {subject:bewerbung subject:vorstellungsgespräch subject:"application received" subject:"job offer"}',
      maxResults: '20', fields: 'messages(id),nextPageToken',
    })
    const result = await this.json(gmailEndpoint + '?' + params, { headers })
    this.ensureEpoch(service, epoch)
    const ids = [...new Set((Array.isArray(result.messages) ? result.messages : []).slice(0, 20).map(value => object(value).id).filter(validMessageId))]
    const mails = await Promise.all(ids.map(id => this.mailContent(id)))
    this.ensureEpoch(service, epoch)
    return { mails, account: createHash('sha256').update(address).digest('hex'), limited: Boolean(result.nextPageToken) }
  }

  async mailboxAddress() {
    const service = this.read('gmail-content', 'grant') ? 'gmail-content' : 'gmail'
    if (!this.read(service, 'grant')) return null
    const epoch = this.epochs[service]
    const token = await this.access(service)
    const result = await this.json('https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=emailAddress',
      { headers: { Authorization: 'Bearer ' + token } })
    this.ensureEpoch(service, epoch)
    const address = display(result.emailAddress, 320)
    return /^[^@\s]+@[^@\s]+$/u.test(address) ? address : null
  }

  async recentInbox(readPage: (account: string) => GmailPage | undefined, restart = false, range?:GmailRange, inboxAfterEpoch?:number) {
    const service = 'gmail-content'
    const epoch = this.epochs[service]
    const token = await this.access(service)
    this.ensureEpoch(service, epoch)
    const headers = { Authorization: 'Bearer ' + token }
    const profile = await this.json('https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=emailAddress', { headers })
    this.ensureEpoch(service, epoch)
    const address = display(profile.emailAddress, 320).toLowerCase()
    if (!/^[^@\s]+@[^@\s]+$/.test(address)) throw new Problem(502, 'Google konnte das Gmail-Konto nicht identifizieren.')
    const account = createHash('sha256').update(address).digest('hex')
    if(range?.account && account!==range.account) throw new Problem(409,'Automatische Gmail-Kategorien sind für ein anderes Konto eingerichtet.')
    const page = restart ? undefined : readPage(account)
    const afterEpoch = range?.afterEpoch ?? page?.afterEpoch ?? inboxAfterEpoch ?? Math.floor(Date.now() / 1000) - 30 * 86400
    const params = new URLSearchParams({q: 'after:' + afterEpoch +
      (range ? ' before:'+range.beforeEpoch+' -in:sent -in:drafts' : ''),
      ...(!range && {labelIds:'INBOX'}), maxResults: '10', fields: 'messages(id),nextPageToken' })
    if (page) params.set('pageToken', page.pageToken)
    const data = await this.json(gmailEndpoint + '?' + params, { headers })
    this.ensureEpoch(service, epoch)
    const ids = [...new Set((Array.isArray(data.messages) ? data.messages : []).slice(0, 10)
      .map(value => object(value).id).filter(validMessageId))]
    const metadata=new URLSearchParams({format:'metadata',fields:'internalDate,snippet,payload(headers)'})
    for(const name of ['Subject','From','List-Id','List-Unsubscribe','To','Delivered-To','X-Forwarded-To','X-Original-To','X-Forwarded-For','In-Reply-To','References'])metadata.append('metadataHeaders',name)
    const mails = await Promise.all(ids.map(async id => {
      const row=await this.json(gmailEndpoint+'/'+encodeURIComponent(id)+'?'+metadata,{headers})
      this.ensureEpoch(service,epoch)
      const preview={...this.mailHeader(id,row),...this.mailThreadHeaders(row),text:display(row.snippet,500).replace(/\p{Cf}|\u034f/gu,''),
        mailingList:this.isMailingList(row),previewOnly:true,truncated:true,dates:[]}
      return needsMailBody(preview)?this.mailContent(id):preview
    }))
    this.ensureEpoch(service, epoch)
    const next = credential(data.nextPageToken, 4096) ? { pageToken: data.nextPageToken, afterEpoch } : null
    if (next && next.pageToken === page?.pageToken) throw new Problem(502, 'Gmail lieferte dieselbe Seite erneut. Starte die Suche neu.')
    return { mails, account, next }
  }

  async searchOrderMails(afterEpoch:number,untilEpoch:number,expected?:string) {
    const service='gmail-content'
    const epoch=this.epochs[service]
    const token=await this.access(service)
    const headers={Authorization:'Bearer '+token}
    const profile=await this.json('https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=emailAddress',{headers})
    const address=display(profile.emailAddress,320).toLowerCase()
    if(!/^[^@\s]+@[^@\s]+$/u.test(address)) throw new Problem(502,'Google konnte das Gmail-Konto nicht identifizieren.')
    const account=createHash('sha256').update(address).digest('hex')
    if(expected&&expected!==account) throw new Problem(409,'Bestellungen sind einem anderen Gmail-Konto zugeordnet.')
    const query='after:'+afterEpoch+' before:'+untilEpoch+' -in:sent -in:drafts '+
      '{subject:Bestellbestätigung subject:Bestellung subject:Bestellt subject:Versendet subject:Zugestellt subject:Rechnung subject:Einkauf subject:Sendung subject:Paket subject:Retoure subject:Rücksendung subject:Rückerstattung subject:order subject:receipt subject:refund}'
    const ids=new Set<string>()
    let next=''
    for(let page=0;page<4;page++){
      const params=new URLSearchParams({q:query,maxResults:'50',fields:'messages(id),nextPageToken',...(next && {pageToken:next})})
      const found=await this.json(gmailEndpoint+'?'+params,{headers})
      for(const row of Array.isArray(found.messages)?found.messages.map(object):[]) if(validMessageId(row.id)) ids.add(row.id)
      next=credential(found.nextPageToken,4096)?found.nextPageToken:''
      if(!next) break
    }
    const list=[...ids]
    const mails:MailContent[]=[]
    for(let i=0;i<list.length;i+=4){
      this.ensureEpoch(service,epoch)
      mails.push(...await Promise.all(list.slice(i,i+4).map(id=>this.mailContent(id))))
    }
    this.ensureEpoch(service,epoch)
    return {account,mails,limited:Boolean(next)}
  }

  private mailThreadHeaders(data:Record<string,unknown>){
    const headers=object(data.payload).headers
    const recipients:string[]=[]
    let replyToMessage=false
    for(const entry of Array.isArray(headers)?headers.map(object):[]){
      const name=typeof entry.name==='string'?entry.name.toLowerCase():''
      if(['to','delivered-to','x-forwarded-to','x-original-to','x-forwarded-for'].includes(name))recipients.push(display(entry.value,220))
      if(['in-reply-to','references'].includes(name)&&display(entry.value,220))replyToMessage=true
    }
    return {originalRecipients:recipients.join(' '),replyToMessage}
  }

  private isMailingList(data:Record<string,unknown>) {
    const headers = object(data.payload).headers
    return Array.isArray(headers) && headers.some(raw => {
      const { name, value } = object(raw)
      return typeof name === 'string' && ['list-id', 'list-unsubscribe'].includes(name.toLowerCase()) && Boolean(value)
    })
  }

  async mailContent(id: unknown): Promise<MailContent> {
    if (!validMessageId(id)) throw new Problem(400, 'Wähle eine gültige Gmail-Nachricht.')
    const service = 'gmail-content'
    const epoch = this.epochs[service]
    const token = await this.access(service)
    this.ensureEpoch(service, epoch)
    const sections = 'mimeType,filename,body(data)'
    const fields = 'internalDate,snippet,payload(headers,' + sections + ',parts(' + sections + ',parts(' + sections + ')))'
    const params = new URLSearchParams({ format: 'full', fields })
    const data = await this.json(gmailEndpoint + '/' + encodeURIComponent(id) + '?' + params,
      { headers: { Authorization: 'Bearer ' + token } })
    this.ensureEpoch(service, epoch)
    const content = (part: Record<string, unknown>, depth: number, mime: 'text/plain'|'text/html'): string => {
      if (part.filename) return ''
      if (part.mimeType === mime) {
        const value = object(part.body).data
        return typeof value === 'string' && /^[A-Za-z0-9_-]+={0,2}$/.test(value) ?
          Buffer.from(value, 'base64url').toString('utf8').slice(0,160_000).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim() : ''
      }
      if (depth >= 2 || typeof part.mimeType !== 'string' || !part.mimeType.startsWith('multipart/') || !Array.isArray(part.parts)) return ''
      for (const child of part.parts.slice(0, 30)) {
        const text = content(object(child), depth + 1,mime)
        if (text) return text
      }
      return ''
    }
    const plain = content(object(data.payload),0,'text/plain')
    const markupInPlain=/<(?:!doctype|html|head|body|table)\b/iu.test(plain)
    const html = content(object(data.payload),0,'text/html') || (markupInPlain ? plain : '')
    const full = ((!markupInPlain && plain) || htmlMailText(html) || display(data.snippet,5000)).replace(/\p{Cf}|\u034f/gu,'')
    const text = full.slice(0, 16_000)
    const dates = new Set<string>()
    for (const match of text.matchAll(/\b(\d{4}-\d{2}-\d{2}|(\d{1,2})\.(\d{1,2})\.(\d{4}))\b/g)) {
      const date = match[4] ? match[4] + '-' + match[3].padStart(2, '0') + '-' + match[2].padStart(2, '0') : match[1]
      if (isDate(date)) dates.add(date)
      if (dates.size === 8) break
    }
    const header=this.mailHeader(id,data)
    const clothing=parseClothingMail({...header,text:full},html)
    return { ...header, ...this.mailThreadHeaders(data), text, dates: [...dates], truncated: full.length > text.length, mailingList:this.isMailingList(data), ...(clothing && {clothing}) }
  }
}
