import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { chmodSync, constants, copyFileSync, existsSync, mkdirSync, openSync, closeSync, fstatSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { acceptance, audit, data, database, fixtures, nightbot, origin, port, root, schemaVersion, secretPath } from '../runtime/settings.ts'
import { MAX_SOURCE_BYTES, sourceNote } from '../runtime/source-note.ts'

process.umask(0o077)
const [command, ...args] = process.argv.slice(2).filter(arg => !['--acceptance', '--trinity-audit', '--nightbot'].includes(arg))
const help = `LifePilot [--acceptance | --nightbot] <Befehl>
  start | stop | status | open [google] | url
  agents | list | show VORGANGS-ID
  recipes | recipe-change JSON --confirm
  grocery | grocery-recipe | grocery-change JSON --confirm
  grocery-scan DATEI --confirm [--receipt | --item]
  finance [YYYY-MM] | finance-save JSON MONAT --confirm [ID REVISION]
  finance-remove ID REVISION MONAT --confirm | finance-settings JSON REVISION --confirm
  profile | profile-save 'JSON' REVISION --confirm | google-account
  continue VORGANGS-ID "Nachricht" [--synthetic] [--send-now] [WIEDERHOLUNGS-UUID]
  submit "Alltagsnotiz" [WIEDERHOLUNGS-UUID] [--synthetic] [--send-now]
  submit-note "Auftrag zur Quelle" NAME.txt --synthetic|--confirm (liest Text von stdin)
  tasks | task VORGANGS-ID | schedule | week [YYYY-MM-DD]
  free-windows [YYYY-MM-DD] [MINUTEN] [TAGE] [HH:mm] [HH:mm]
  mac-calendars --confirm | mac-calendar-preview SLOT-ID [KALENDER-ID] | mac-calendar-approve FREIGABE-ID --confirm
  mac-free-windows DATUM MINUTEN TAGE FRÜHESTE_UHRZEIT SPÄTESTE_UHRZEIT --confirm
  google-status | google-calendar [TAGE] | google-mail [ANZAHL]
  google-mail-search deadlines|orders|returns --confirm | google-mail-content NACHRICHT-ID --confirm
  mail-categorize KONTO --confirm [START-EPOCH]
  inbox | inbox-feed | inbox-refresh --confirm [--restart] | inbox-scan --confirm [--restart] | inbox-decide ID accept|deny --confirm [START-UTC]
  google-sync-appointment VORGANGS-ID --confirm
  google-appointment-move VORGANGS-ID TITEL START MINUTEN --confirm | google-appointment-remove VORGANGS-ID --confirm
  google-calendar-test YYYY-MM-DDTHH:mm --confirm | google-gmail-sort-test NACHRICHT-ID --confirm
  google-gmail-label NACHRICHT-ID KATEGORIE --confirm
  google-configure DIENST --confirm (OAuth-Clientdatei von stdin)
  google-connect DIENST --confirm | google-disconnect DIENST --confirm
  task-add TITEL BESCHREIBUNG DATUM-ODER-"-" --confirm [task|appointment]
  task-edit ID REVISION 'JSON-Änderung' --confirm
  task-schedule ID reminder|slot YYYY-MM-DDTHH:mm --confirm [MINUTEN] [--overlap TOKEN]
  schedule-dismiss ID --confirm
  preview VORGANGS-ID ANALYSEFREIGABE-ID
  approve VORGANGS-ID FREIGABE-ID [--google] [--overlap TOKEN] | deny VORGANGS-ID FREIGABE-ID
  revise VORGANGS-ID 'JSON-Vorschlag' --confirm
  followup VORGANGS-ID DIALOGSTAND "Antwort" [--synthetic] [WIEDERHOLUNGS-UUID]
  cancel VORGANGS-ID
  memory-search [Suchtext] [lifepilot|owner]
  memory-add lifepilot|owner "Bestätigter Inhalt" --confirm [ABLAUFDATUM-ISO] [ERSETZTE-ID]
  memory-revoke MEMORY-ID --confirm | memory-erase MEMORY-ID --confirm
  improve "Verbesserungswunsch"
  deadline-guardian | smart-planning DATUM TAGE MINUTEN START ENDE --confirm
  applications | applications-scan --confirm | application-history ID
  application-save 'JSON' --confirm [ID REVISION] | application-image PFAD --confirm
  dictation AUFNAHME.mp4 --confirm
  outfit-product-search 'SUCHTEXT' --confirm
  outfit-look-analyze FOTO-ID --confirm | outfit-look-pieces LOOK-ID 'ID-LISTE-JSON' --confirm
  orders-refresh --confirm [MONAT]
  clothing-orders | clothing-order ID received|kept|return|returned|deadline --confirm [ARTIKEL-ID-ODER-DATUM]
  clothing-photos ID --confirm
  outfit-resale | outfit-resale-change ID AKTION --confirm [DETAILS-JSON]
  outfit-travel REISE-ID | outfit-travel-save REISE-ID 'IDS-JSON' --confirm
  fragrances | fragrance-search TEXT --confirm | fragrance-save 'JSON' FOTO-TOKEN --confirm
  outfits | outfit-profile 'JSON' --confirm | outfit-item 'JSON' --confirm [ID-ODER--] [FOTO-TOKEN]
  outfit-generate 'JSON' --confirm [--calendar] | outfit-save VORSCHLAG-ID --confirm
  outfit-remove item|look|profile-photo ID --confirm | outfit-photo ID-ODER-profile PFAD --confirm
  outfit-look-photo LOOK-ID-ODER-"-" DATEI --confirm [TITEL]
  outfit-analyze FOTO --confirm | outfit-product URL --confirm [--image] | outfit-product-photo ID URL --confirm
  trips | trip ID | trip-windows 'JSON' --confirm | trip-preview 'JSON' --confirm
  trip-guide ENTWURF-ID --confirm | trip-draft ENTWURF-ID
  trip-google REISE-ID --confirm | trip-remove REISE-ID --confirm
  trip-chat-preview VORGANG-ID TURN --confirm | trip-save ENTWURF-ID --confirm | trip-change REISE-ID REVISION 'JSON' --confirm
  trip-move-preview VORGANG TURN --confirm [REISE-ID] | trip-move-decide VORSCHLAG yes|no --confirm
  backup --confirm | restore DATEINAME --confirm (Dienst vorher stoppen)
  fixtures (nur im Testmodus)
`

async function call<T = unknown>(path: string, payload?: object, timeout = 7000): Promise<T> {
  let secret: string
  try { secret = readFileSync(secretPath, 'utf8') } catch { throw new Error('LifePilot ist nicht gestartet. Nutze ./bin/lifepilot start.') }
  const headers = { Authorization: `Bearer ${secret}`, ...(payload && { 'Content-Type': 'application/json' }) }
  let response: Response
  try {
    response = await fetch(origin + '/api' + path, { headers, method: payload ? 'POST' : 'GET',
      body: payload ? JSON.stringify(payload) : undefined, signal: AbortSignal.timeout(timeout), redirect: 'error' })
  } catch {
    throw new Error('LifePilot ist nicht erreichbar. Prüfe den Dienst mit ./bin/lifepilot status.')
  }
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`)
  return result
}

async function status() {
  return call<{ ready: boolean, version: string, acceptance: boolean }>('/status')
}

async function start() {
  if ((await status().catch(() => null))?.ready) return { running: true, origin, acceptance }
  if (!existsSync(join(root, 'dist/app.js'))) throw new Error('Der Build fehlt. Siehe README.md.')
  mkdirSync(data, { recursive: true, mode: 0o700 })
  chmodSync(data, 0o700)
  const log = openSync(join(data, 'service.log'), 'a', 0o600)
  const child = spawn(process.execPath, [join(root, 'hub/runtime/server.ts'), ...(audit ? ['--trinity-audit'] : acceptance ? ['--acceptance'] : nightbot ? ['--nightbot'] : [])],
    { detached: true, stdio: ['ignore', log, log] })
  closeSync(log)
  child.unref()
  for (let attempt = 0; attempt < 40; attempt++) {
    await delay(100)
    if ((await status().catch(() => null))?.ready) return { running: true, origin, acceptance }
    if (child.exitCode !== null) break
  }
  throw new Error(`LifePilot konnte nicht starten. Dienstprotokoll: ${join(data, 'service.log')}`)
}

async function restore(name: string | undefined) {
  if (!name || !/^[\dTZ-]+-[0-9a-f-]{36}\.sqlite3$/.test(name)) throw new Error('Ungültiger Sicherungsname.')
  const lock = createServer()
  await new Promise<void>((resolve, reject) => {
    lock.once('error', () => reject(new Error('Stoppe die Instanz vor der Wiederherstellung.')))
    lock.listen(port, '127.0.0.1', resolve)
  })
  const source = join(data, 'backups', name)
  const temporary = join(data, `restore-${randomUUID()}.sqlite3`)
  try {
    copyFileSync(source, temporary, constants.COPYFILE_EXCL)
    chmodSync(temporary, 0o600)
    const check = new DatabaseSync(temporary)
    try {
      check.exec('PRAGMA trusted_schema=OFF')
      const version = Number(check.prepare('PRAGMA user_version').get()?.user_version)
      const tables = new Set(check.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(row => String(row.name)))
      const required = ['runs', 'approvals', 'memory', 'improvements']
      if (version >= 2) required.push('tasks', 'task_events', 'schedule')
      if (version >= 3) required.push('proposal_history')
      if (version >= 4) required.push('followups')
      if (version >= 8) required.push('calendar_exports', 'calendar_target')
      if (version >= 9) required.push('inbox_proposals')
      if (version >= 10) required.push('gmail_pages')
      if (version >= 11) required.push('google_calendar_test')
      if (version >= 13) required.push('google_lifepilot_calendar', 'google_appointment_sync')
      if (version >= 14) required.push('applications', 'application_sources', 'application_history')
      if (version >= 18) required.push('trip_chat_decisions')
      if (version >= 19) required.push('personal_profile')
      if (version >= 36) required.push('clothing_order_activity')
      if (version >= 33) required.push('projects','project_email_suggestions','project_chat_changes')
      if (version >= 32) required.push('calendar_series','calendar_series_changes')
      if (version >= 27) required.push('wardrobe_sales','wardrobe_travel','wardrobe_fragrances')
      if (version >= 26) required.push('clothing_orders','clothing_order_items','clothing_order_mail','clothing_order_shipments')
      if (version >= 25) required.push('trip_google_events','trip_previews')
      if (version >= 24) required.push('grocery_recipes')
      if (version >= 22) required.push('grocery_stock','grocery_shopping','grocery_recent','grocery_chat','grocery_receipts')
      if (version >= 21) required.push('outfit_look_photos')
      if (version >= 20) required.push('finance_entries','finance_settings','finance_chat_changes')
      if (version >= 17) required.push('trips','trip_revisions')
      if (version >= 16) required.push('wardrobe_items', 'outfit_profile', 'outfit_looks','outfit_demo_seed')
      if (check.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok' || !Number.isInteger(version) || version < 1 || version > schemaVersion ||
          check.prepare('PRAGMA foreign_key_check').all().length || required.some(name => !tables.has(name))) {
        throw new Error('Sicherung ist beschädigt oder inkompatibel.')
      }
      // Restore the data snapshot, but require fresh consent before an interrupted run can continue.
      check.exec('PRAGMA journal_mode=DELETE; BEGIN IMMEDIATE')
      try {
        const at = new Date().toISOString()
        check.prepare("UPDATE approvals SET state='revoked', decided_at=?, decided_via='restore' WHERE state='pending'").run(at)
        check.prepare("UPDATE runs SET state='failed', error=?, updated_at=? WHERE state IN ('permission','queued','running','review')")
          .run('Der Vorgang wurde aus einer Sicherung wiederhergestellt. Sende für eine neue Freigabe eine weitere Nachricht.', at)
        check.exec('COMMIT')
      } catch (error) {
        check.exec('ROLLBACK')
        throw error
      }
    } finally { check.close() }
    let previous: string | undefined
    if (existsSync(database)) {
      if (['-journal', '-wal', '-shm'].some(suffix => existsSync(database + suffix))) throw new Error('Offenes SQLite-Journal. Starte und stoppe den Dienst zuerst.')
      previous = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sqlite3`
      copyFileSync(database, join(data, 'backups', previous), constants.COPYFILE_EXCL)
    }
    renameSync(temporary, database)
    return { restored: name, previous }
  } finally {
    rmSync(temporary, { force: true })
    lock.close()
  }
}

function confirm(...allowed: string[]) {
  if (!allowed.includes('--confirm')) throw new Error('Für diese Aktion ist --confirm erforderlich.')
  return true
}

async function dispatch() {
  switch (command) {
    case 'start': return start()
    case 'stop': {
      await call('/stop', {})
      for (let attempt = 0; attempt < 40; attempt++) {
        if (!(await status().catch(() => null))) return { running: false }
        await delay(100)
      }
      throw new Error('Der Dienst antwortet noch.')
    }
    case 'status': return status()
    case 'open':
    case 'url': {
      if (command === 'open' && args[0] === 'google' && acceptance) throw new Error('Google ist nur im Hauptprofil verfügbar.')
      if (command === 'open') await start()
      const { url } = await call<{ url: string }>('/ticket', {})
      if (command === 'url') return url
      const target = new URL(url)
      if (args[0] === 'google') target.searchParams.set('view', 'google')
      const browser = spawn('/usr/bin/open', [target.href], { stdio: 'ignore' })
      await new Promise<void>((resolve, reject) => {
        browser.once('error', reject)
        browser.once('exit', code => code === 0 ? resolve() : reject(new Error('Browser konnte nicht geöffnet werden.')))
      })
      return { opened: origin }
    }
    case 'agents': return (await call<{ agents: unknown }>('/state')).agents
    case 'list': return (await call<{ runs: unknown }>('/state')).runs
    case 'show': return call('/runs/' + encodeURIComponent(args[0] ?? ''))
    case 'continue': return call('/runs',{agent:'lifepilot',input:args[1],previous:args[0],key:args.slice(2).find(arg=>arg!=='--synthetic'&&arg!=='--send-now')??randomUUID(),
      synthetic:args.includes('--synthetic'),sendNow:args.includes('--send-now')})
    case 'submit': return call('/runs', { agent: 'lifepilot', input: args[0],
      key: args.slice(1).find(arg => arg !== '--synthetic' && arg !== '--send-now') ?? randomUUID(), synthetic: args.slice(1).includes('--synthetic'),sendNow:args.slice(1).includes('--send-now') })
    case 'submit-note': {
      if (process.stdin.isTTY || args[2] !== (acceptance ? '--synthetic' : '--confirm')) {
        throw new Error('Übergib den lesbaren Anhang über stdin. Nutze --synthetic im Testprofil, sonst --confirm für den lokalen Entwurf.')
      }
      const chunks: Buffer[] = []
      let bytes = 0
      for await (const chunk of process.stdin) {
        bytes += chunk.length
        if (bytes > MAX_SOURCE_BYTES) throw new Error('Die Quelle überschreitet 8 KB.')
        chunks.push(chunk)
      }
      const note = sourceNote({ name: args[1], text: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) })
      return call('/runs', { agent: 'lifepilot', input: args[0], key: randomUUID(), synthetic: acceptance, sourceNote: note })
    }
    case 'tasks': return call('/tasks')
    case 'task': return call('/tasks/' + encodeURIComponent(args[0] ?? ''))
    case 'schedule': return call('/schedule')
    case 'mac-calendars': return call('/mac-calendar/list', { confirm: confirm(args[0]) }, 65_000)
    case 'mac-free-windows': return call('/mac-calendar/free-windows', { date: args[0], minutes: Number(args[1]),
      days: Number(args[2]), start: args[3], end: args[4], confirm: confirm(args[5]) }, 65_000)
    case 'mac-calendar-preview': return call('/mac-calendar/preview', { slot: args[0], calendar: args[1] })
    case 'mac-calendar-approve': return call('/mac-calendar/approve', { approval: args[0], confirm: confirm(args[1]) }, 65_000)
    case 'google-mail-search': return call('/google/mail-search', { category: args[0], confirm: confirm(args[1]) }, 15000)
    case 'google-mail-content': return call('/google/mail-content', { message: args[0], confirm: confirm(args[1]) }, 15000)
    case 'inbox': return call('/inbox')
    case 'mail-categorize': return call('/inbox/categorization',{address:args[0],confirm:confirm(args[1]),afterEpoch:args[2]===undefined?undefined:Number(args[2])})
    case 'inbox-feed': return call('/inbox/feed', undefined, 60_000)
    case 'inbox-refresh': return call('/inbox/refresh', { confirm: confirm(args[0]), restart: args[1] === '--restart' }, 100000)
    case 'inbox-scan': return call('/inbox/scan', { confirm: confirm(args[0]), restart: args[1] === '--restart' }, 45000)
    case 'inbox-decide': return call('/inbox/decision', { proposal: args[0], decision: args[1], confirm: confirm(args[2]), slot: args[3] }, 15000)
    case 'google-appointment-move': return call('/google/appointment-change', { run:args[0],operation:'update',title:args[1],start:args[2],minutes:Number(args[3]),confirm:confirm(args[4]) },30000)
    case 'google-appointment-remove': return call('/google/appointment-change', { run:args[0],operation:'remove',confirm:confirm(args[1]) },30000)
    case 'google-sync-appointment': return call('/google/sync-appointment', { run: args[0], confirm: confirm(args[1]) }, 30000)
    case 'google-calendar-test': return call('/google/calendar-test', { start: args[0], confirm: confirm(args[1]) }, 30000)
    case 'google-gmail-label': return call('/google/gmail-label', { message: args[0], category: args[1], confirm: confirm(args[2]) }, 45000)
    case 'google-gmail-sort-test': return call('/google/gmail-sort-test', { message: args[0], confirm: confirm(args[1]) }, 30000)
    case 'deadline-guardian': return call('/skills/deadlines')
    case 'smart-planning': return call('/skills/planning', { date: args[0], days: Number(args[1]), minutes: Number(args[2]),
      start: args[3], end: args[4], confirm: confirm(args[5]) }, 20000)
    case 'trips': return call('/trips')
    case 'trip': return call('/trips/'+encodeURIComponent(args[0] ?? ''))
    case 'trip-windows': return call('/trips/windows',{...JSON.parse(args[0] ?? '{}'),confirm:confirm(args[1])})
    case 'trip-preview': return call('/trips/preview',{draft:JSON.parse(args[0] ?? '{}'),confirm:confirm(args[1])})
    case 'trip-move-preview': return call('/trips/chat-change',{run:args[0],turn:Number(args[1]),confirm:confirm(args[2]),tripId:args[3]})
    case 'trip-move-decide': {
      if (args[1]!=='yes' && args[1]!=='no') throw Error('Wähle yes oder no.')
      return call('/trips/chat-decision',{offer:args[0],approved:args[1]==='yes',confirm:confirm(args[2])})
    }
    case 'trip-chat-preview': return call('/trips/chat-preview',{run:args[0],turn:Number(args[1]),confirm:confirm(args[2])})
    case 'trip-guide': return call('/trips/guide',{preview:args[0],confirm:confirm(args[1])},105000)
    case 'trip-draft': return call('/trips/draft/'+encodeURIComponent(args[0] ?? ''))
    case 'trip-google': return call('/trips/google',{tripId:args[0],confirm:confirm(args[1])},45000)
    case 'trip-remove': return call('/trips/remove',{tripId:args[0],confirm:confirm(args[1])},45000)
    case 'trip-save': return call('/trips/save',{preview:args[0],confirm:confirm(args[1])})
    case 'trip-change': return call('/trips/change',{tripId:args[0],revision:Number(args[1]),patch:JSON.parse(args[2] ?? '{}'),confirm:confirm(args[3])})
    case 'orders-refresh': return call('/clothing-orders/refresh',{confirm:confirm(args[0]),month:args[1]},120000)
    case 'clothing-orders': return call('/clothing-orders')
    case 'clothing-order': return call('/clothing-orders/change',{order:args[0],action:args[1],confirm:confirm(args[2]),
      ...(args[1]==='deadline'?{value:args[3]}:{item:args[3]})})
    case 'clothing-photos': return call('/clothing-orders/photos',{order:args[0],confirm:confirm(args[1])},76000)
    case 'outfit-resale': return call('/outfits/resale')
    case 'outfit-resale-change': return call('/outfits/resale',{item:args[0],action:args[1],confirm:confirm(args[2]),details:args[3]&&JSON.parse(args[3])})
    case 'outfit-travel': return call('/outfits/travel?trip='+encodeURIComponent(args[0]??''))
    case 'outfit-travel-save': return call('/outfits/travel',{tripId:args[0],items:JSON.parse(args[1]??'[]'),confirm:confirm(args[2])})
    case 'fragrances': return call('/outfits/fragrances')
    case 'fragrance-search': return call('/outfits/fragrance-search',{query:args[0],confirm:confirm(args[1])},76000)
    case 'fragrance-save': return call('/outfits/fragrances',{draft:JSON.parse(args[0]??'{}'),photoToken:args[1],confirm:confirm(args[2])})
    case 'fragrance-remove': return call('/outfits/fragrances',{remove:args[0],confirm:confirm(args[1])})
    case 'trip-packing-weather': return call('/trips/packing-weather',{tripId:args[0],confirm:confirm(args[1])},25000)
    case 'outfits': return call('/outfits')
    case 'outfit-item': return call('/outfits/item', { draft: JSON.parse(args[0] ?? 'null'), item: args[2] === '-' ? undefined : args[2], photoToken:args[3], confirm: confirm(args[1]) })
    case 'outfit-profile': return call('/outfits/profile', { profile: JSON.parse(args[0] ?? 'null'), confirm: confirm(args[1]) })
    case 'outfit-generate': return call('/outfits/generate', { query: JSON.parse(args[0] ?? 'null'), confirm: confirm(args[1]), useCalendar: args[2] === '--calendar' }, 20000)
    case 'outfit-save': return call('/outfits/save', { proposal: args[0], confirm: confirm(args[1]) })
    case 'outfit-remove': return call('/outfits/remove', { target: args[0], item: args[1], confirm: confirm(args[2]) })
    case 'outfit-look-analyze': return call('/outfits/look-analyze',{photo:args[0],confirm:confirm(args[1])},34000)
    case 'outfit-look-pieces': return call('/outfits/look-pieces',{look:args[0],items:JSON.parse(args[1]??'[]'),confirm:confirm(args[2])})
    case 'outfit-product-search': return call('/outfits/product-search',{query:args[0],confirm:confirm(args[1])},76000)
    case 'outfit-product': return call('/outfits/product', { address: args[0], confirm: confirm(args[1]), prepareImage: args[2] === '--image' }, 30000)
    case 'outfit-product-photo': return call('/outfits/import-photo', { item: args[0], address: args[1], confirm: confirm(args[2]) }, 10000)
    case 'applications': return call('/applications')
    case 'applications-scan': return call('/applications/scan', { confirm: confirm(args[0]) }, 45000)
    case 'application-history': return call('/applications/' + encodeURIComponent(args[0] ?? '') + '/history')
    case 'application-save': return call('/applications/save', { draft: JSON.parse(args[0] ?? 'null'), confirm: confirm(args[1]),
      existing: args[2], revision: args[3] ? Number(args[3]) : undefined })
    case 'application-source-deny': return call('/applications/deny', { source: args[0], confirm: confirm(args[1]) })
    case 'dictation':
    case 'grocery-scan':
    case 'fragrance-label':
    case 'outfit-analyze':
    case 'outfit-photo':
    case 'outfit-look-photo':
    case 'application-image': {
      const audio = command === 'dictation'
      const outfit = command !== 'application-image' && !audio
      const scan = command === 'grocery-scan'
      const look = command === 'outfit-look-photo'
      const attach = command === 'outfit-photo' || look
      confirm(args[attach ? 2 : 1])
      const descriptor = openSync(args[attach ? 1 : 0], constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        const image = fstatSync(descriptor)
        if (!image.isFile() || image.size > (audio ? 8 : scan || look || command === 'outfit-analyze' || command === 'fragrance-label' ? 16 : outfit ? 4 : 5) * 1024 * 1024) throw Error(audio ? 'Wähle eine lokale MP4-Audiodatei bis 8 MB.' : outfit ? 'Das Bildformat oder die Dateigröße wird nicht unterstützt.' : 'Wähle ein PNG- oder JPEG-Bild bis 5 MB.')
        const lookQuery = new URLSearchParams(args[0]==='-'?{}:{look:args[0]??''})
        if (look && args[3]) lookQuery.set('name',args[3])
        const path = audio ? '/chat/dictation' : command==='fragrance-label' ? '/outfits/fragrance-label' : scan ? '/grocery/scan'+(args[2]==='--receipt'?'?kind=receipt':args[2]==='--item'?'?kind=item':'') : look ? '/outfits/look-photo?'+lookQuery : attach ? '/outfits/photo?item=' + encodeURIComponent(args[0] ?? '') : outfit ? '/outfits/analyze-photo' : '/applications/image'
        const response = await fetch(origin + '/api' + path, {
          method: 'POST', headers: { Authorization: 'Bearer ' + readFileSync(secretPath, 'utf8'),
            'Content-Type': audio ? 'audio/mp4' : 'application/octet-stream', 'X-LifePilot-Confirm': audio ? 'dictation' : 'image' },
          body: readFileSync(descriptor), signal: AbortSignal.timeout(audio?85000:scan?62000:50000), redirect: 'error',
        })
        const result = await response.json()
        if (!response.ok) throw Error(result.error)
        return result
      } finally { closeSync(descriptor) }
    }
    case 'finance': return call('/finance'+(args[0]?'?month='+encodeURIComponent(args[0]):''))
    case 'recipes': return call('/grocery/recipes')
    case 'recipe-change': return call('/grocery/recipes',{...JSON.parse(args[0]??'null'),confirm:confirm(args[1])})
    case 'grocery': return call('/grocery')
    case 'grocery-recipe': return call('/grocery/recipe')
    case 'grocery-change': return call('/grocery/change',{...JSON.parse(args[0]??'null'),confirm:confirm(args[1])})
    case 'finance-save': return call('/finance/entry',{draft:JSON.parse(args[0]??'null'),month:args[1],confirm:confirm(args[2]),id:args[3],revision:args[4]===undefined?undefined:Number(args[4])})
    case 'finance-remove': return call('/finance/entry',{id:args[0],revision:Number(args[1]),month:args[2],remove:true,confirm:confirm(args[3])})
    case 'finance-settings': return call('/finance/settings',{settings:JSON.parse(args[0]??'null'),revision:Number(args[1]),confirm:confirm(args[2])})
    case 'profile': return call('/profile')
    case 'profile-save': return call('/profile',{ fields:JSON.parse(args[0] ?? '{}'), revision:Number(args[1]), confirm:confirm(args[2]) })
    case 'google-account': return call('/google/account', undefined, 15000)
    case 'google-status': return call('/google/status')
    case 'google-calendar': return call('/google/calendar', { days: Number(args[0] ?? 7), confirm: true }, 15000)
    case 'google-mail': return call('/google/gmail', { limit: Number(args[0] ?? 8), confirm: true }, 15000)
    case 'google-configure': {
      if (acceptance || process.stdin.isTTY) throw new Error('Übergib die Clientdatei über stdin im Hauptprofil.')
      confirm(args[1])
      const chunks: Buffer[] = []
      let bytes = 0
      for await (const chunk of process.stdin) {
        bytes += chunk.length
        if (bytes > 16_000) throw new Error('OAuth-Clientdatei zu groß.')
        chunks.push(chunk)
      }
      let credentials: unknown
      try { credentials = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
      catch { throw new Error('Die OAuth-Clientdatei ist kein gültiges JSON.') }
      return call('/google/configure', { service: args[0], credentials, confirm: true })
    }
    case 'google-connect':
    case 'google-disconnect': return call('/google/' + command.slice(7), { service: args[0], confirm: confirm(args[1]) })
    case 'week': return call('/week' + (args[0] ? '?' + new URLSearchParams({ date: args[0] }) : ''))
    case 'free-windows': {
      const [date, minutes, days, start, end] = args
      return call('/free-windows?' + new URLSearchParams({ ...(date && { date }), ...(minutes && { minutes }),
        ...(days && { days }), ...(start && { start }), ...(end && { end }) }))
    }
    case 'task-add': return call('/tasks', { title: args[0], detail: args[1], date: args[2] === '-' ? null : args[2],
      kind: args[4] ?? 'task', confirm: confirm(args[3]) })
    case 'task-edit': return call(`/tasks/${encodeURIComponent(args[0] ?? '')}/edit`, {
      revision: Number(args[1]), patch: JSON.parse(args[2] ?? 'null'), confirm: confirm(args[3]) })
    case 'task-schedule': return call(`/tasks/${encodeURIComponent(args[0] ?? '')}/schedule`, {
      kind: args[1], at: args[2], confirm: confirm(args[3]), minutes: args[4] ? Number(args[4]) : undefined,
      overlapToken: args[5]==='--overlap'?args[6]:undefined },40_000)
    case 'schedule-dismiss': return call(`/schedule/${encodeURIComponent(args[0] ?? '')}/dismiss`, { confirm: confirm(args[1]) })
    case 'preview': return call('/runs/' + encodeURIComponent(args[0] ?? '') + '/model-preview?' + new URLSearchParams({ approval: args[1] ?? '' }))
    case 'approve':
    case 'deny': {
      const flags=args.slice(2)
      const overlap=flags.indexOf('--overlap')
      return call(`/runs/${encodeURIComponent(args[0] ?? '')}/decision`,{approval:args[1],decision:command,
        googleSync:command==='approve'&&flags.includes('--google'),overlapToken:overlap<0?undefined:flags[overlap+1]},30_000)
    }
    case 'revise': return call(`/runs/${encodeURIComponent(args[0] ?? '')}/revise`, { result: JSON.parse(args[1] ?? 'null'), confirm: confirm(args[2]) })
    case 'followup': return call(`/runs/${encodeURIComponent(args[0] ?? '')}/followup`, {
      turn: args[1] ? Number(args[1]) : null, input: args[2], synthetic: args[3] === '--synthetic',
      key: (args[3] === '--synthetic' ? args[4] : args[3]) ?? randomUUID() })
    case 'cancel': return call(`/runs/${encodeURIComponent(args[0] ?? '')}/cancel`, {})
    case 'memory-search': return call('/memory?' + new URLSearchParams({ q: args[0] ?? '', scope: args[1] ?? 'lifepilot' }))
    case 'memory-add': return call('/memory', { scope: args[0], content: args[1], confirm: confirm(args[2]),
      expires: args[3] === '--synthetic' ? undefined : args[3], replaces: args[4] === '--synthetic' ? undefined : args[4], synthetic: args.slice(3).includes('--synthetic') })
    case 'memory-revoke':
    case 'memory-erase': return call(`/memory/${encodeURIComponent(args[0] ?? '')}/${command.slice(7)}`, { confirm: confirm(args[1]) })
    case 'improve': return call('/improvements', { content: args[0] })
    case 'backup': return call('/backup', { confirm: confirm(args[0]) })
    case 'restore':
      confirm(args[1])
      return restore(args[0])
    case 'fixtures':
      if (acceptance) return fixtures
      throw new Error('Testdaten sind nur im Testmodus verfügbar.')
    case 'help':
    case undefined: return help
    default: throw new Error('Unbekannter Befehl. Nutze ./bin/lifepilot help.')
  }
}
try {
  const result = await dispatch()
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Unbekannter Adapterfehler.')
  process.exitCode = 1
}
