import { createHash, randomUUID } from 'node:crypto'
import { classifyMail } from '../../agents/lifepilot/tools/classify-mail.ts'
import type { MailContent } from '../connectors/google.ts'
import { Problem } from './settings.ts'
import type { Store } from './store.ts'
import { isDate, utcNow } from './values.ts'
import { applicationStatuses, type Application, type ApplicationDraft, type ApplicationOverview, type ApplicationSource, type ApplicationStatus } from './application-types.ts'

export function applicationDraft(value: unknown): ApplicationDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Problem(400, 'Das Bewerbungsformular ist ungültig.')
  const input = value as Record<string, unknown>
  function text(key: string, limit: number, required = false) {
    const raw = input[key] ?? ''
    if (typeof raw !== 'string' || raw.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(raw) || required && !raw.trim()) {
      throw new Problem(400, 'Firma und Stelle sind erforderlich. Prüfe auch die Länge der übrigen Felder.')
    }
    return raw.trim()
  }
  function date(key: string) {
    const raw = input[key]
    if (raw === null || raw === undefined || raw === '') return null
    if (!isDate(raw)) throw new Problem(400, 'Ungültiges Bewerbungsdatum.')
    return raw
  }
  const status = input.status ?? 'applied'
  if (typeof status !== 'string' || !Object.hasOwn(applicationStatuses, status)) throw new Problem(400, 'Ungültiger Bewerbungsstatus.')
  const link = text('link', 500)
  if (link) {
    try {
      const url = new URL(link)
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error()
    } catch { throw new Problem(400, 'Gib eine gültige Webadresse zur Stelle ein.') }
  }
  return {
    company: text('company', 120, true), role: text('role', 160, true), location: text('location', 120, false),
    salary: text('salary', 100), description: text('description', 2500), notes: text('notes', 1600), link,
    applied_on: date('applied_on'), follow_up: date('follow_up'), status: status as ApplicationStatus,
  }
}

export function applicationOverview(store: Store): ApplicationOverview {
  const items = store.db.prepare('SELECT * FROM applications ORDER BY updated_at DESC LIMIT 300').all() as Application[]
  const rawSources = store.db.prepare(`SELECT id,title,company,role,location,salary,description,notes,link,applied_on,follow_up,status,application_id
    FROM application_sources WHERE state='pending' ORDER BY created_at DESC LIMIT 100`).all() as ApplicationSource[]
  const sources = rawSources.map(source => {
    const fallbackRole = source.role || extractRoleFromTitle(source.title)
    return {
      ...source,
      role: fallbackRole,
      salary: source.salary ?? '',
      link: source.link ?? '',
      applied_on: source.applied_on ?? null,
      follow_up: source.follow_up ?? null,
      description: source.description || summarizeApplicationMail(source.title, ''),
      notes: source.notes || buildApplicationNotes(source.status, source.title),
    }
  })
  const stats = { applied: 0, reply: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0 }
  for (const row of store.db.prepare('SELECT status, COUNT(*) AS count FROM applications GROUP BY status').all()) {
    stats[String(row.status) as ApplicationStatus] = Number(row.count)
  }
  return { items, sources, stats }
}

export function applicationHistory(store: Store, id: string) {
  return store.db.prepare('SELECT status,changed_at FROM application_history WHERE application_id=? ORDER BY id DESC LIMIT 40').all(id)
}

export function saveApplication(store: Store, value: unknown, existing?: { id: string, revision: number }, sourceId?: string) {
  const draft = applicationDraft(value)
  return store.transaction(() => {
    const prior = existing ? store.db.prepare('SELECT * FROM applications WHERE id=? AND revision=?')
      .get(existing.id, existing.revision) as Application | undefined : undefined
    if (existing && !prior) throw new Problem(409, 'Die Bewerbung wurde inzwischen geändert.')
    const source = sourceId ? store.db.prepare("SELECT * FROM application_sources WHERE id=? AND state='pending'").get(sourceId) : undefined
    if (sourceId && !source) throw new Problem(409, 'Der Mailvorschlag ist nicht mehr offen.')
    const id = prior?.id ?? randomUUID()
    const at = utcNow()
    const values = [draft.company,draft.role,draft.location,draft.salary,draft.description,draft.notes,draft.link,draft.applied_on,draft.follow_up,draft.status,at]
    if (prior) {
      store.db.prepare(`UPDATE applications SET company=?,role=?,location=?,salary=?,description=?,notes=?,link=?,applied_on=?,
        follow_up=?,status=?,updated_at=?,revision=revision+1 WHERE id=?`).run(...values,id)
    } else {
      store.db.prepare(`INSERT INTO applications (company,role,location,salary,description,notes,link,applied_on,follow_up,status,updated_at,id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(...values,id)
    }
    if (prior?.status !== draft.status) store.db.prepare('INSERT INTO application_history (application_id,status,changed_at) VALUES (?,?,?)')
      .run(id,draft.status,at)
    if (source) store.db.prepare("UPDATE application_sources SET state='accepted',application_id=? WHERE id=?").run(id,sourceId!)
    return store.db.prepare('SELECT * FROM applications WHERE id=?').get(id) as Application
  })
}

export function denyApplicationSource(store: Store, id: string) {
  if (!store.db.prepare("UPDATE application_sources SET state='denied' WHERE id=? AND state='pending'").run(id).changes) {
    throw new Problem(409, 'Der Mailvorschlag ist nicht mehr offen.')
  }
  return { id, state: 'denied' }
}

function cleanExtractedRole(raw: string) {
  return raw
    .replace(/^[„"'“”«»\s]+|[„"'“”«»\s.,;!?]+$/gu, '')
    .replace(/\s+(?:gesucht!?(?:\s*[-–]\s*[A-Za-z0-9_-]+)?|[-–]\s+[A-Z0-9_-]{5,}|ist\s+eingegangen|wurde\s+erhalten|haben\s+wir\s+erhalten|wurde\s+gelöscht|für\s+eine\s+andere\s+person.*|bei\s+(?:der\s+)?[\p{L}\p{N}&., -]+)$/iu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 160)
}

function extractRoleFromTitle(title: string) {
  const clean = title.replace(/\s+/gu, ' ').trim()
  const match =
    clean.match(/\bbewerbung\s+(?:als|für(?:\s+die\s+(?:stelle|position|funktion|rolle))?|auf(?:\s+die\s+(?:stelle|position|funktion|rolle))?|zum|zur)\s+([^|·]{3,140})/iu)?.[1] ||
    clean.match(/\bapplication\s+(?:for|as)\s+([^|·]{3,140})/iu)?.[1] ||
    clean.match(/([A-ZÄÖÜ][\p{L}\p{N}&/+, -]{3,110}\s*\((?:m\/w\/d|w\/m\/d|d\/m\/w|f\/m\/d|all genders)\))/iu)?.[1]
  if (match) {
    const parsed = cleanExtractedRole(match)
    if (parsed.length >= 3) return parsed
  }
  const ref = clean.match(/\(([A-Za-z0-9_-]{4,25})\)/u)?.[1] || clean.match(/\b(?:Ref\.?-?Nr\.?|Kennziffer|Job-?ID)\s*[:#]?\s*([A-Za-z0-9_-]{4,25})/iu)?.[1]
  if (ref) return `Bewerbung (${ref})`
  return ''
}

function extractCompanyFromSender(from: string) {
  const raw = from.replace(/\s+/gu, ' ').trim()
  if (!raw) return ''
  const display = raw.includes('<') ? raw.slice(0, raw.indexOf('<')).trim() : !raw.includes('@') ? raw : ''
  if (display) {
    const unquoted = display.replace(/^["'„“”]+|["'„“”]+$/gu, '').trim()
    const viaAt = unquoted.match(/^.+?\s+@\s+(.+)$/u)?.[1]?.trim()
    const candidate = (viaAt || unquoted)
      .replace(/\b(?:recruiting|karriere|careers|talent\s+acquisition|human\s+resources|personalabteilung|bewerbung(?:en)?|no-?reply|noreply|donotreply|workday|personio|softgarden|smartrecruiters)\b/giu, ' ')
      .replace(/^[\s\-–|:,/]+|[\s\-–|:,/]+$/gu, '')
      .replace(/\s+/gu, ' ')
      .trim()
    if (candidate.length >= 2 && !candidate.includes('@')) return candidate.slice(0, 120)
  }
  const domainMatch = raw.match(/@([a-z0-9.-]+)\.[a-z]{2,}/iu)?.[1]?.toLowerCase()
  if (!domainMatch) return ''
  const ignored = new Set(['gmail', 'googlemail', 'gmx', 'web', 'outlook', 'hotmail', 'icloud', 'yahoo', 't-online', 'myworkday', 'myworkdayjobs', 'workday', 'personio', 'softgarden', 'smartrecruiters', 'greenhouse', 'lever', 'stepstone', 'indeed', 'linkedin', 'xing', 'bamboohr', 'recruitee', 'successfactors', 'sap'])
  const parts = domainMatch.split('.').filter(part => part && !['mail', 'email', 'jobs', 'career', 'careers', 'karriere', 'hr', 'recruiting', 'news', 'info', 'eu', 'de', 'com'].includes(part))
  const core = parts.at(-1) ?? domainMatch.split('.')[0] ?? ''
  if (!core || core.length < 2 || ignored.has(core)) return ''
  return core
    .split('-')
    .map(word => word.length <= 3 ? word.toUpperCase() : word[0]!.toUpperCase() + word.slice(1))
    .join('-')
    .slice(0, 120)
}

function extractLinkFromMail(text: string) {
  const matches = text.match(/https?:\/\/[^\s<>"')\]}]+/giu) ?? []
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;!?]+$/u, '')
    if (cleaned.length > 500) continue
    if (/(?:unsubscribe|abmelden|datenschutz|privacy|impressum|imprint|optout|opt-out|tracking)/iu.test(cleaned)) continue
    try {
      const url = new URL(cleaned)
      const destination=url.hostname+'/'+url.pathname
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password &&
          /jobs?|careers?|karriere|bewerb|recruit|application|stellen|portal|workday|personio|softgarden|successfactors|vacanc/iu.test(destination)) {
        return cleaned
      }
    } catch { /* ignore invalid URL */ }
  }
  return ''
}

export function summarizeApplicationMail(title: string, text: string) {
  const cleanTitle = title.replace(/\s+/gu, ' ').trim()
  const rawLines = text.split(/\r?\n/u).map(line => line.replace(/\s+/gu, ' ').trim())
  const lines: string[] = []
  for (const line of rawLines) {
    if (!line || line.startsWith('>')) continue
    if (/^[-_*=]{3,}$/u.test(line)) continue
    if (/^(?:rechtlicher\s+hinweis|disclaimer|confidentiality\s+notice|vertraulichkeitshinweis)\s*:?$/iu.test(line)) break
    if (/^(?:sitz der gesellschaft|registergericht|amtsgericht|handelsregister|vorstand|aufsichtsrat|vorsitzender|ust-id|steuer-nr|diese e-mail (?:enthält vertrauliche|ist vertraulich)|wenn ein anderer vorgesehener empfänger|es besteht keine möglichkeit direkt auf diese e-mail|dies ist eine automatisch generierte e-mail|this e-?mail (?:is confidential|and any attachments)|bitte antworten sie nicht auf diese|please do not reply)/iu.test(line)) continue
    lines.push(line)
  }
  if (!lines.length) return cleanTitle ? `Betreff: ${cleanTitle}` : ''
  const body = lines.join('\n').replace(/https?:\/\/\S+/gu, '[Link]').trim()
  const header = cleanTitle && !body.toLowerCase().startsWith(cleanTitle.toLowerCase()) ? `Betreff: ${cleanTitle}\n\n` : ''
  return (header + body).slice(0, 1800).trim()
}

export function buildApplicationNotes(status: ApplicationStatus, text: string) {
  const content = text.replace(/\s+/gu, ' ').trim()
  if (status === 'rejected') {
    return 'Nächster Schritt erforderlich: Nein — Absage erhalten, keine weitere Aktion notwendig.'
  }
  if (status === 'offer') {
    return 'Nächster Schritt erforderlich: Ja — Vertrags- bzw. Stellenangebot prüfen und Rückmeldung geben.'
  }
  if (status === 'interview') {
    return 'Nächster Schritt erforderlich: Ja — Gesprächseinladung prüfen, Termin bestätigen und Vorstellungsgespräch vorbereiten.'
  }
  if (status === 'reply') {
    if (/(?:bitte|unterlagen|zeugnis|lebenslauf|immatrikulation|termin|rückruf|telefonat|fragebogen|test|assessment|hochladen|nachreichen)/iu.test(content)) {
      return 'Nächster Schritt erforderlich: Ja — Rückmeldung prüfen und angeforderte Unterlagen, Terminauswahl oder Antwort senden.'
    }
    return 'Nächster Schritt erforderlich: Ja — Rückmeldung zur Bewerbung lesen und bei Bedarf antworten.'
  }
  if (/(?:bitte\s+(?:bestätigen|vervollständigen|hochladen|ausfüllen)|online-?test|assessment|profil\s+vervollständigen)/iu.test(content)) {
    return 'Nächster Schritt erforderlich: Ja — Bewerbung eingegangen; prüfe die in der E-Mail genannte Bestätigung oder Aufgabe.'
  }
  return 'Nächster Schritt erforderlich: Nein — Eingangsbestätigung erhalten, aktuell auf Rückmeldung des Unternehmens warten.'
}

export function extractApplicationFields(text: string) {
  const lines = text.split(/\r?\n/u).map(line => line.trim()).filter(line => line && !line.startsWith('>')).slice(0, 100)
  function read(pattern: RegExp, limit: number) {
    return lines.map(line => pattern.exec(line)?.[1]?.trim()).find(Boolean)?.slice(0,limit) ?? ''
  }
  const nearby = lines.slice(0,30)
  const full = lines.join('\n')
  const signatureTeam = lines
    .map(line => line.match(/^(?:Ihr|Dein|Euer)\s+([A-ZÄÖÜ][\p{L}\p{N}& -]{2,80}?)-Team\b/u)?.[1]?.trim())
    .find(name => name && !/^(?:Recruiting|HR|Karriere|Bewerbermanagement|Personal|Talent(?:\s+Acquisition)?)$/iu.test(name))
  const company =
    read(/^(?:firma|unternehmen|arbeitgeber|company|konzerngesellschaft)\s*[:–-]\s*(.+)$/iu,120) ||
    nearby.find(line => /^[\p{L}\p{N}][^:]{2,95}\b(?:GmbH(?:\s*&\s*Co\.\s*KG)?|AG|UG|Ltd\.?|Inc\.?|SE(?:\s*&\s*Co\.\s*KGaA)?|KG|KGaA)$/u.test(line))?.slice(0,120) ||
    lines.find(line => /^[\p{L}\p{N}][^:]{2,95}\b(?:GmbH(?:\s*&\s*Co\.\s*KG)?|AG|UG|Ltd\.?|Inc\.?|SE(?:\s*&\s*Co\.\s*KGaA)?|KG|KGaA)$/u.test(line))?.slice(0,120) ||
    full.match(/(?:bewerbung\s+bei(?:\s+der)?|interesse\s+an(?:\s+der)?|einstieg\s+bei(?:\s+der)?|recruiting-?team\s+(?:der|von))\s+([A-ZÄÖÜ][\p{L}\p{N}&.,'’() -]{2,85}?\b(?:GmbH(?:\s*&\s*Co\.\s*KG)?|AG|UG|Ltd\.?|Inc\.?|SE|KG|Group|Holding))\b/iu)?.[1]?.trim()?.slice(0,120) ||
    signatureTeam?.slice(0,120) ||
    ''
  const scholarshipRole = full.match(/\b(Deutschlandstipendium|Stipendium)\b/iu)?.[1]
  const appNum = full.match(/\(Bewerbungsnummer\s+([A-Za-z0-9_-]+)\)/iu)?.[1]
  const rawRole =
    read(/^(?:stelle|position|jobtitel|stellenbezeichnung|job description|job title|ausschreibung|rolle|vakanz)\s*[:–-]\s*(.+)$/iu,160) ||
    nearby.find(line => /^(?:werkstudent(?:in)?|praktikum|praktikant(?:in)?|ausbildung|softwareentwickler(?:in)?|working student|internship)[^:]{0,135}$/iu.test(line))?.slice(0,160) ||
    full.match(/(?:besetzung\s+der\s+(?:position|stelle)|bewerbung\s+(?:als|für(?:\s+die\s+(?:stelle|position|funktion|rolle))?|auf(?:\s+die\s+(?:stelle|position|funktion|rolle))?)|(?:stelle|position)\s+als)\s+[„"'“”]?([^\n.!?;"'“”]{3,140}?)(?:\s+gesucht!?(?:\s*-\s*[A-Z0-9_-]+)?|\s+für\s+eine\s+andere\s+person|$)/iu)?.[1] ||
    full.match(/[„"“]([^„"“”\n]{4,130}(?:\((?:m\/w\/d|w\/m\/d|d\/m\/w|f\/m\/d|all genders)\)|werkstudent|praktik|intern|working student)[^„"“”\n]{0,50})[”"“]/iu)?.[1] ||
    nearby.find(line => /^[A-ZÄÖÜ][\p{L}\p{N}&/+, -]{3,115}\((?:m\/w\/d|w\/m\/d|d\/m\/w|f\/m\/d|all genders)\)$/iu.test(line)) ||
    (scholarshipRole ? `${scholarshipRole}${appNum ? ` (Nr. ${appNum})` : ''}` : '') ||
    ''
  const role = rawRole ? cleanExtractedRole(rawRole) : ''
  const location =
    read(/^(?:ort|standort|arbeitsort|einsatzort|location|stadt|city)\s*[:–-]\s*(.+)$/iu,120) ||
    read(/^(?:D-|DE-)?\d{5}\s+([\p{L}][\p{L} -]{1,60})$/u,120) ||
    full.match(/(?:[Aa]m\s+[Ss]tandort|[Ff]ür\s+unseren\s+[Ss]tandort|[Ee]insatzort\s+ist)\s+([A-ZÄÖÜ][\p{Ll}\p{M}-]{1,40}(?:\s+(?:am|an|ob|in|bei)\s+(?:der\s+)?[A-ZÄÖÜ][\p{Ll}\p{M}-]{1,30})?)\b/u)?.[1]?.trim()?.slice(0,120) ||
    full.match(/\b(?:D-|DE-)?\d{5}\s+([A-ZÄÖÜ][\p{Ll}\p{M}-]{1,40}(?:\s+(?:am|an|ob|in|bei)\s+(?:der\s+)?[A-ZÄÖÜ][\p{Ll}\p{M}-]{1,30})?)\b/u)?.[1]?.trim()?.slice(0,120) ||
    ''
  const salary = read(/^(?:gehalt|vergütung|salary|stundenlohn)\s*[:–-]\s*(.+)$/iu,100)
  return { company, role, location, salary }
}

export function applicationFromMail(mail: Pick<MailContent,'id'|'subject'|'text'|'from'> & { at?: string | null }) {
  const title = mail.subject.replace(/\s+/gu,' ').trim().slice(0,180)
  const text = mail.text.split(/\r?\n/u).filter(line => !line.trimStart().startsWith('>')).join('\n').slice(0,5000)
  const head = title+'\n'+text.slice(0,1100)
  if (classifyMail(mail).category !== 'applications') return
  const states: [ApplicationStatus,RegExp][] = [
    ['rejected', /leider.{0,150}(?:absagen|nicht berücksichtigen|nicht weiterverfolgen|andere.*entschieden)|\babsage\b/isu],
    ['offer', /(?:vertragsangebot|stellenangebot|job offer)|wir möchten ihnen die stelle anbieten|wir freuen uns.{0,50}eine zusage/isu],
    ['interview', /vorstellungsgespräch|interview invitation|zum gespräch einladen/iu],
    ['applied', /(?:eingang|dank|danke).{0,85}(?:ihrer|deiner|deine|ihre)\s+bewerbung|bewerbung.{0,25}(?:erhalten|eingegangen)|application received/isu],
    ['reply', /(?:rückmeldung.{0,60}bewerbung|bewerbung.{0,60}rückmeldung|application (?:update|status)|bitte.{0,75}(?:unterlagen|lebenslauf))/isu],
  ]
  const status = states.find(([,pattern]) => pattern.test(head))?.[0]
  if (!status || !title) return
  const fields = extractApplicationFields(text)
  const company = fields.company || extractCompanyFromSender(mail.from)
  const role = fields.role || extractRoleFromTitle(title)
  const day = mail.at?.slice(0, 10)
  const applied_on = isDate(day) ? day : null
  const link = extractLinkFromMail(text)
  const description = summarizeApplicationMail(title, text)
  const notes = buildApplicationNotes(status, text || title)
  return {
    title, company, role, location: fields.location, salary: fields.salary,
    description, notes, link, applied_on, follow_up: null, status,
  }
}

export function scanApplicationMails(store: Store, mails: MailContent[], account: string, autoImport = false) {
  const findSource = store.db.prepare('SELECT id,state FROM application_sources WHERE source_key=?')
  const insertSource = store.db.prepare(`INSERT INTO application_sources
    (id,source_key,title,company,role,location,salary,description,notes,link,applied_on,follow_up,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  const updatePendingSource = store.db.prepare(`UPDATE application_sources
    SET title=?,company=?,role=?,location=?,salary=?,description=?,notes=?,link=?,applied_on=?,follow_up=?,status=?
    WHERE id=? AND state='pending'`)
  return store.transaction(() => {
    let count = 0
    const equivalent = (value: string) => value.normalize('NFKC').toLocaleLowerCase('de-DE').replace(/\s+/gu,' ').trim()
    const known = store.db.prepare('SELECT id,company,role,location FROM applications').all()
    const keyOf = (item: { company: unknown, role: unknown, location: unknown }) =>
      JSON.stringify([equivalent(String(item.company)),equivalent(String(item.role)),equivalent(String(item.location))])
    const roleKeyOf = (item: { company: unknown, role: unknown }) =>
      JSON.stringify([equivalent(String(item.company)),equivalent(String(item.role))])
    const matches = new Map<string, string[]>()
    const roleMatches = new Map<string, string[]>()
    for (const row of known) {
      const key = keyOf({company:row.company,role:row.role,location:row.location})
      matches.set(key, [...(matches.get(key) ?? []), String(row.id)])
      const rKey = roleKeyOf({company:row.company,role:row.role})
      roleMatches.set(rKey, [...(roleMatches.get(rKey) ?? []), String(row.id)])
    }
    for (const mail of mails) {
      const source = applicationFromMail(mail)
      if (!source) continue
      const hash = createHash('sha256').update(account + '\0' + mail.id).digest('hex')
      const prior = findSource.get(hash) as { id: string, state: string } | undefined
      const at = utcNow()
      if (prior) {
        if (prior.state === 'pending') {
          updatePendingSource.run(
            source.title, source.company, source.role, source.location, source.salary,
            source.description, source.notes, source.link, source.applied_on, source.follow_up,
            source.status, prior.id,
          )
        }
        continue
      }
      const id = randomUUID()
      insertSource.run(
        id, hash, source.title, source.company, source.role, source.location, source.salary,
        source.description, source.notes, source.link, source.applied_on, source.follow_up,
        source.status, at,
      )
      count++
      const key = keyOf(source)
      const existing = (matches.get(key) ?? (source.location ? undefined : roleMatches.get(roleKeyOf(source))))
      if (existing?.length === 1) store.db.prepare('UPDATE application_sources SET application_id=? WHERE id=?').run(existing[0]!,id)
      if (!autoImport || source.status !== 'applied' || !source.company || !source.role || !source.location || existing ||
          !/^(?:firma|unternehmen|arbeitgeber|company)\s*:/imu.test(mail.text) ||
          !/^(?:stelle|position|jobtitel|stellenbezeichnung|job title)\s*:/imu.test(mail.text) ||
          !/^(?:ort|standort|arbeitsort|einsatzort|location)\s*:/imu.test(mail.text)) continue
      const applicationId = randomUUID()
      store.db.prepare(`INSERT INTO applications (id,company,role,location,salary,description,notes,link,applied_on,follow_up,status,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,NULL,'applied',?)`)
        .run(applicationId,source.company,source.role,source.location,source.salary,source.description,source.notes,source.link,source.applied_on,at)
      store.db.prepare("INSERT INTO application_history (application_id,status,changed_at) VALUES (?,'applied',?)").run(applicationId,at)
      store.db.prepare("UPDATE application_sources SET state='accepted',application_id=? WHERE id=?").run(applicationId,id)
      matches.set(key,[applicationId])
      roleMatches.set(roleKeyOf(source),[applicationId])
    }
    return count
  })
}
