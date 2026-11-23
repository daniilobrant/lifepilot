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
      throw new Problem(400, 'Firma, Stelle und Ort sind erforderlich. Prüfe auch die Länge der übrigen Felder.')
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
    company: text('company', 120, true), role: text('role', 160, true), location: text('location', 120, true),
    salary: text('salary', 100), description: text('description', 2500), notes: text('notes', 1600), link,
    applied_on: date('applied_on'), follow_up: date('follow_up'), status: status as ApplicationStatus,
  }
}

export function applicationOverview(store: Store): ApplicationOverview {
  const items = store.db.prepare('SELECT * FROM applications ORDER BY updated_at DESC LIMIT 300').all() as Application[]
  const sources = store.db.prepare("SELECT id,title,company,role,location,status,application_id FROM application_sources WHERE state='pending' ORDER BY created_at DESC LIMIT 100").all() as ApplicationSource[]
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

export function extractApplicationFields(text: string) {
  const lines = text.split(/\r?\n/u).map(line => line.trim()).filter(line => !line.startsWith('>')).slice(0, 100)
  function read(pattern: RegExp, limit: number) {
    return lines.map(line => pattern.exec(line)?.[1]?.trim()).find(Boolean)?.slice(0,limit) ?? ''
  }
  const nearby = lines.slice(0,20)
  return {
    company: read(/^(?:firma|unternehmen|arbeitgeber|company)\s*[:–-]\s*(.+)$/iu,120) ||
      nearby.find(line => /^[\p{L}\p{N}][^:]{2,90}\b(?:GmbH|AG|UG|Ltd\.?|Inc\.?|SE|KG)$/u.test(line))?.slice(0,120) || '',
    role: read(/^(?:stelle|position|jobtitel|stellenbezeichnung|job description|job title)\s*[:–-]\s*(.+)$/iu,160) ||
      nearby.find(line => /^(?:werkstudent|praktikum|praktikant|ausbildung|softwareentwickler|working student|internship)[^:]{0,135}$/iu.test(line))?.slice(0,160) || '',
    location: read(/^(?:ort|standort|arbeitsort|einsatzort|location)\s*[:–-]\s*(.+)$/iu,120) ||
      read(/^\d{5}\s+([\p{L}][\p{L} -]{1,60})$/u,120),
    salary: read(/^(?:gehalt|vergütung|salary)\s*[:–-]\s*(.+)$/iu,100),
  }
}

export function applicationFromMail(mail: Pick<MailContent,'id'|'subject'|'text'|'from'>) {
  const title = mail.subject.replace(/\s+/gu,' ').trim().slice(0,180)
  const text = mail.text.split(/\r?\n/u).filter(line => !line.trimStart().startsWith('>')).join('\n').slice(0,5000)
  const head = title+'\n'+text.slice(0,1100)
  if (classifyMail(mail).category !== 'applications') return
  const states: [ApplicationStatus,RegExp][] = [
    ['rejected', /leider.{0,150}(?:absagen|nicht berücksichtigen|nicht weiterverfolgen|andere.*entschieden)|\babsage\b/isu],
    ['offer', /(?:vertragsangebot|stellenangebot|job offer)|wir möchten ihnen die stelle anbieten|wir freuen uns.{0,50}eine zusage/isu],
    ['interview', /vorstellungsgespräch|interview invitation|zum gespräch einladen/iu],
    ['applied', /(?:eingang|dank|danke).{0,85}(?:ihrer|deiner|deine|ihre)\s+bewerbung|bewerbung.{0,15}erhalten|application received/isu],
    ['reply', /(?:rückmeldung.{0,60}bewerbung|bewerbung.{0,60}rückmeldung|application (?:update|status)|bitte.{0,75}(?:unterlagen|lebenslauf))/isu],
  ]
  const status = states.find(([,pattern]) => pattern.test(head))?.[0]
  if (!status || !title) return
  const fields = extractApplicationFields(text)
  const role = fields.role || title.match(/\bbewerbung\s+(?:als|für die stelle)\s+([^|·]{3,110})/iu)?.[1]?.trim() || ''
  return { title, company: fields.company, role, location: fields.location, status }
}

export function scanApplicationMails(store: Store, mails: MailContent[], account: string, autoImport = false) {
  const put = store.db.prepare(`INSERT OR IGNORE INTO application_sources
    (id,source_key,title,company,role,location,status,created_at) VALUES (?,?,?,?,?,?,?,?)`)
  return store.transaction(() => {
    let count = 0
    const equivalent = (value: string) => value.normalize('NFKC').toLocaleLowerCase('de-DE').replace(/\s+/gu,' ').trim()
    const known = store.db.prepare('SELECT id,company,role,location FROM applications').all()
    const keyOf = (item: { company: unknown, role: unknown, location: unknown }) =>
      JSON.stringify([equivalent(String(item.company)),equivalent(String(item.role)),equivalent(String(item.location))])
    const matches = new Map<string, string[]>()
    for (const row of known) {
      const key = keyOf({company:row.company,role:row.role,location:row.location})
      matches.set(key, [...(matches.get(key) ?? []), String(row.id)])
    }
    for (const mail of mails) {
      const source = applicationFromMail(mail)
      if (!source) continue
      const hash = createHash('sha256').update(account + '\0' + mail.id).digest('hex')
      const id = randomUUID()
      const at = utcNow()
      if (!put.run(id,hash,source.title,source.company,source.role,source.location,source.status,at).changes) continue
      count++
      const key = keyOf(source)
      const existing = matches.get(key)
      if (existing?.length === 1) store.db.prepare('UPDATE application_sources SET application_id=? WHERE id=?').run(existing[0]!,id)
      if (!autoImport || source.status !== 'applied' || !source.company || !source.role || !source.location || existing ||
          !/^(?:firma|unternehmen|arbeitgeber|company)\s*:/imu.test(mail.text) ||
          !/^(?:stelle|position|jobtitel|stellenbezeichnung|job title)\s*:/imu.test(mail.text) ||
          !/^(?:ort|standort|arbeitsort|einsatzort|location)\s*:/imu.test(mail.text)) continue
      const applicationId = randomUUID()
      const day = mail.at?.slice(0,10)
      store.db.prepare(`INSERT INTO applications (id,company,role,location,salary,description,notes,link,applied_on,follow_up,status,updated_at)
        VALUES (?,?,?,?,'','','','',?,NULL,'applied',?)`)
        .run(applicationId,source.company,source.role,source.location,isDate(day)?day:null,at)
      store.db.prepare("INSERT INTO application_history (application_id,status,changed_at) VALUES (?,'applied',?)").run(applicationId,at)
      store.db.prepare("UPDATE application_sources SET state='accepted',application_id=? WHERE id=?").run(applicationId,id)
      matches.set(key,[applicationId])
    }
    return count
  })
}
