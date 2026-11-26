import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { GoogleConnector, googleScopes } from '../../../hub/connectors/google.ts'

const origin = 'http://127.0.0.1:45137'
const credentials = { installed: { client_id: 'fixture.apps.googleusercontent.com', client_secret: 'fixture-client-secret' } }
const json = (value: unknown) => Response.json(value)

test('Google connectors request separate scopes, enforce one-use PKCE and read only calendar events and inbox headers', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'lifepilot-google-test-'))
  let activeScope = ''
  let reference: URL
  let codeExchanges = 0
  let reads = 0
  const mock: typeof fetch = async (input, options) => {
    const url = new URL(String(input))
    assert.equal(options?.redirect, 'error')
    if (url.hostname === 'oauth2.googleapis.com') {
      codeExchanges++
      assert.equal(options?.method, 'POST')
      const body = options.body as URLSearchParams
      assert.equal(body.get('redirect_uri'), origin + '/oauth/google/callback')
      assert.equal(createHash('sha256').update(body.get('code_verifier')!).digest('base64url'), reference.searchParams.get('code_challenge'))
      return json({ token_type: 'Bearer', expires_in: 3600, access_token: activeScope === googleScopes.gmail ? 'mail-token' : 'calendar-token',
        refresh_token: 'fixture-refresh', scope: activeScope })
    }
    reads++
    const headers = new Headers(options?.headers)
    assert.equal(options?.method, undefined)
    if (url.hostname === 'www.googleapis.com') {
      assert.equal(url.pathname, '/calendar/v3/calendars/primary/events')
      assert.equal(headers.get('Authorization'), 'Bearer calendar-token')
      assert.equal(url.searchParams.get('singleEvents'), 'true')
      assert.equal(Date.parse(url.searchParams.get('timeMax')!) - Date.parse(url.searchParams.get('timeMin')!), 7 * 86400000)
      return json({ items: [{ id: 'public-read-test', summary: 'Volleyballtraining', start: { date: '2090-06-02' }, end: { date: '2090-06-03' },
        description: 'Nicht übernehmen' }] })
    }
    assert.equal(url.hostname, 'gmail.googleapis.com')
    assert.equal(headers.get('Authorization'), 'Bearer mail-token')
    if (url.pathname.endsWith('/messages')) {
      assert.equal(url.searchParams.get('labelIds'), 'INBOX')
      assert.equal(url.searchParams.get('q'), null)
      return json({ messages: [{ id: 'message1' }, { id: 'message1' }] })
    }
    assert.equal(url.pathname, '/gmail/v1/users/me/messages/message1')
    assert.equal(url.searchParams.get('format'), 'metadata')
    assert.deepEqual(url.searchParams.getAll('metadataHeaders'), ['Subject', 'From'])
    return json({ internalDate: '1900000000000', snippet: 'Nicht übernehmen', payload: { body: { data: 'Version' },
      headers: [{ name: 'Subject', value: 'Kursdetails' }, { name: 'From', value: 'Testperson' }] } })
  }
  try {
    const connector = new GoogleConnector(temp, origin, mock)
    await assert.rejects(() => connector.calendar(7), { status: 409 })
    assert.equal(reads, 0)
    assert.throws(() => connector.configure('calendar', { web: credentials.installed }), { status: 400 })
    for (const service of ['calendar', 'gmail'] as const) {
      connector.configure(service, credentials)
      reference = new URL(connector.begin(service).url)
      activeScope = googleScopes[service]
      assert.equal(reference.hostname, 'accounts.google.com')
      assert.equal(reference.searchParams.get('scope'), activeScope)
      assert.equal(reference.searchParams.get('code_challenge_method'), 'S256')
      const callback = new URLSearchParams({ state: reference.searchParams.get('state')!, code: 'fixture-code' })
      await assert.rejects(() => connector.complete(new URLSearchParams({ state: 'fremd', code: 'fixture-code' })), { status: 400 })
      await connector.complete(callback)
      await assert.rejects(() => connector.complete(callback), { status: 400 })
      const saved = join(temp, 'google', service + '-grant.json')
      assert.equal(statSync(saved).mode & 0o777, 0o600)
      assert.ok(readFileSync(saved, 'utf8').includes('fixture-refresh'))
    }
    assert.equal(codeExchanges, 2)
    assert.deepEqual(await connector.calendar(7), { events: [{ id: 'public-read-test', title: 'Volleyballtraining', start: '2090-06-02', end: '2090-06-03', allDay: true }], limited: false })
    const mail = await connector.gmail(8)
    assert.equal(mail.messages.length, 1)
    assert.equal(mail.messages[0].subject, 'Kursdetails')
    assert.equal(JSON.stringify(mail).includes('Nicht übernehmen'), false)
    connector.disconnect('gmail')
    assert.deepEqual(connector.status().filter(item => item.connected).map(item=>item.service), ['calendar'])
    await assert.rejects(() => connector.gmail(8), { status: 409 })
    assert.equal(reads, 3)
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

test('Unrequested Google scopes and unexpected HTTP responses leave access unconnected', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'lifepilot-google-scope-'))
  let denied = false
  const connector = new GoogleConnector(temp, origin, async () => denied ? new Response(null, { status: 400 }) : json({
    access_token: 'test', refresh_token: 'test-refresh', token_type: 'Bearer', expires_in: 3600, scope: googleScopes.calendar + ' ' + googleScopes.gmail,
  }))
  try {
    connector.configure('gmail', credentials)
    const begin = () => new URLSearchParams({ state: new URL(connector.begin('gmail').url).searchParams.get('state')!, code: 'test' })
    await assert.rejects(() => connector.complete(begin()), { status: 409 })
    denied = true
    await assert.rejects(() => connector.complete(begin()), { status: 409 })
    assert.equal(connector.status().find(item => item.service === 'gmail')?.connected, false)
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

test('Refresh is shared by concurrent reads and a disconnect prevents an in-flight grant from returning', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'lifepilot-google-race-'))
  let refreshes = 0
  let reads = 0
  let release!: () => void
  const pause = new Promise<void>(resolve => { release = resolve })
  const mock: typeof fetch = async (input, options) => {
    if (new URL(String(input)).hostname === 'oauth2.googleapis.com') {
      const body = options?.body as URLSearchParams
      if (body.get('grant_type') === 'refresh_token') {
        refreshes++
        await pause
        return json({ token_type: 'Bearer', expires_in: 3600, access_token: 'new-access' })
      }
      return json({ token_type: 'Bearer', expires_in: 20, access_token: 'fixture-access',
        refresh_token: 'fixture-refresh', scope: googleScopes.calendar })
    }
    reads++
    return json({ items: [] })
  }
  try {
    const connector = new GoogleConnector(temp, origin, mock)
    connector.configure('calendar', credentials)
    const begin = new URL(connector.begin('calendar').url)
    await connector.complete(new URLSearchParams({ state: begin.searchParams.get('state')!, code: 'fixture' }))
    const checks = [connector.calendar(7), connector.calendar(1)].map(call => assert.rejects(call, { status: 409 }))
    connector.disconnect('calendar')
    release()
    await Promise.all(checks)
    assert.equal(refreshes, 1)
    assert.equal(reads, 0)
    assert.equal(connector.status()[0].connected, false)
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

test('Gmail content authorizes read-only and resumes a page only for the connected mailbox', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'lifepilot-gmail-page-'))
  let account = 'fixture@example.com'
  let requestedPages: (string | null)[] = []
  const mock: typeof fetch = async (input, options) => {
    const url = new URL(String(input))
    if (url.hostname === 'oauth2.googleapis.com') return json({
      scope: googleScopes['gmail-content'], token_type: 'Bearer', expires_in: 3600,
      access_token: 'fixture-access', refresh_token: 'fixture-refresh',
    })
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer fixture-access')
    assert.equal(options?.method, undefined)
    if (url.pathname.endsWith('/profile')) return json({ emailAddress: account })
    if (url.pathname.endsWith('/messages')) {
      if (url.searchParams.get('maxResults')==='1') {
        assert.equal(url.searchParams.get('q'), null)
        assert.equal(url.searchParams.get('labelIds'), 'INBOX')
        return json({messages:[{id:'header'}]})
      }
      const cursor = url.searchParams.get('pageToken')
      requestedPages.push(cursor)
      assert.equal(url.searchParams.get('maxResults'), '10')
      assert.equal(url.searchParams.get('labelIds'), 'INBOX')
      assert.ok(url.searchParams.get('q')?.startsWith('after:'))
      return json({ messages: [{ id: cursor ? 'second' : 'first' },{id:'promo'}], nextPageToken: cursor ? undefined : 'next-page' })
    }
    if (url.pathname.endsWith('/header')) {
      assert.equal(url.searchParams.get('format'), 'metadata')
      assert.equal(url.searchParams.get('fields'), 'internalDate,payload(headers)')
      return json({internalDate:'1900000000000',payload:{headers:[{name:'Subject',value:'Nur Betreff'}]}})
    }
    if(url.searchParams.get('format')==='metadata'){
      const id=url.pathname.split('/').at(-1)
      return json({internalDate:'1900000000000',snippet:id==='promo'?'Unser Angebot':'Rückgabe ansehen',
        payload:{headers:[{name:'Subject',value:id==='promo'?'Newsletter · Wochenangebote':'Rücksendung'}]}})
    }
    assert.ok(!url.pathname.endsWith('/promo'))
    assert.equal(url.searchParams.get('format'), 'full')
    assert.ok(!url.searchParams.get('fields')?.includes('attachmentId'))
    return json({ internalDate: '1900000000000', payload: {
      mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'Rücksendung' }],
      body: { data: Buffer.from('Rücksendung bis 30.11.2026').toString('base64url') },
    } })
  }
  try {
    const connector = new GoogleConnector(temp, origin, mock)
    await assert.rejects(() => connector.recentInbox(() => undefined), { status: 409 })
    connector.configure('gmail-content', credentials)
    const authorization = new URL(connector.begin('gmail-content').url)
    assert.equal(authorization.searchParams.get('scope'), googleScopes['gmail-content'])
    await connector.complete(new URLSearchParams({ state: authorization.searchParams.get('state')!, code: 'fixture-code' }))
    assert.equal(connector.status().find(entry=>entry.service==='gmail')?.connected,false)
    assert.equal((await connector.gmail(1)).messages[0].subject,'Nur Betreff')
    const first = await connector.recentInbox(() => undefined)
    assert.equal(first.next?.pageToken, 'next-page')
    assert.equal(first.mails.find(mail=>mail.id==='promo')?.text,'Unser Angebot')
    assert.equal(first.mails[0].text, 'Rücksendung bis 30.11.2026')
    const pageForAccount = (key: string) => key === first.account ? first.next ?? undefined : undefined
    const second = await connector.recentInbox(pageForAccount)
    assert.equal(second.mails[0].id, 'second')
    assert.equal(second.next, null)
    account = 'different@example.com'
    assert.notEqual((await connector.recentInbox(pageForAccount)).account, first.account)
    assert.deepEqual(requestedPages, [null, 'next-page', null])
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

test('Google write tests create one isolated calendar, recover the event and add only one Gmail label', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'lifepilot-google-write-'))
  let scope: string
  let storedCalendar: string | undefined
  let event: Record<string, unknown> | undefined
  let creations = 0
  let labels = 0
  let removals = 0
  let differentMailbox = false
  let categoryLabels = [
    {id:'Label_33',name:'LifePilot · Freizeit, Sport & Veranstaltungen',type:'user'},
    {id:'Label_34',name:'LifePilot · Finanzen & Belege',type:'user'},
    {id:'Label_35',name:'Finanzen & Belege',type:'user'},
  ]
  let renames=0
  let trashed=0
  const mock: typeof fetch = async (input, options) => {
    const url = new URL(String(input))
    if (url.hostname === 'oauth2.googleapis.com') return json({
      scope, token_type: 'Bearer', expires_in: 3600, access_token: scope === googleScopes['gmail-sort'] ? 'writer' : 'reader', refresh_token: 'fixture-refresh',
    })
    if (url.pathname.endsWith('/profile')) return json({
      emailAddress: differentMailbox && new Headers(options?.headers).get('Authorization') === 'Bearer writer'
        ? 'different@example.com' : 'fixture@example.com',
    })
    const body = options?.body ? JSON.parse(String(options.body)) : undefined
    if (url.pathname === '/gmail/v1/users/me/messages/msg1/trash') {
      assert.equal(options?.method, 'POST')
      assert.equal(options?.body, undefined)
      assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer writer')
      trashed++
      return json({ id:'msg1', labelIds:['TRASH'] })
    }
    if (url.pathname === '/calendar/v3/calendars') {
      creations++
      assert.equal(storedCalendar, 'pending')
      assert.deepEqual(body, { summary: 'LifePilot Test', timeZone: 'Europe/Berlin' })
      return json({ id: 'test@group.calendar.google.com' })
    }
    if (url.pathname.endsWith('/events')) {
      assert.equal(url.searchParams.get('sendUpdates'), 'none')
      assert.equal(body.attendees, undefined)
      if (event) return new Response(null, { status: 409 })
      event = body
      return json(event)
    }
    if (url.pathname.includes('/events/')) {
      if (options?.method==='DELETE') {
        removals++
        assert.equal(url.searchParams.get('sendUpdates'),'none')
        assert.equal(url.pathname.split('/').at(-1),event?.id)
        event=undefined
        return new Response(null,{status:204})
      }
      if (options?.method==='PATCH') {
        assert.equal(new Headers(options.headers).get('if-match'),'"trip-etag"')
        assert.equal(url.searchParams.get('sendUpdates'),'none')
        event={...event,...body}
      }
      return json({...event,etag:'"trip-etag"'})
    }
    if (url.pathname.endsWith('/messages/msg1')) {
      if (url.searchParams.get('format') === 'full') return json({
        payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'Rücksendung zur Bestellung' }],
          body: { data: Buffer.from('Deine Rücksendung.').toString('base64url') } },
      })
      return json({ id: 'msg1', labelIds: ['INBOX'] })
    }
    if (url.pathname.endsWith('/labels') && !body) return json({ labels: categoryLabels })
    if (url.pathname.endsWith('/labels/Label_33')) {
      assert.equal(options?.method,'PATCH')
      assert.deepEqual(body,{name:'Freizeit, Sport & Veranstaltungen'})
      renames++
      const changed={...categoryLabels[0],...body}
      categoryLabels=categoryLabels.map(item=>item.id===changed.id?changed:item)
      return json(changed)
    }
    if (url.pathname.endsWith('/labels')) {
      labels++
      assert.ok(['LifePilot Test', 'Bestellungen'].includes(body.name))
      return json({ id: 'Label_1' })
    }
    assert.ok(url.pathname.endsWith('/messages/msg1/modify'))
    assert.deepEqual(body, { addLabelIds: ['Label_1'] })
    return json({ id: 'msg1', labelIds: ['INBOX', 'Label_1'] })
  }
  try {
    const connector = new GoogleConnector(temp, origin, mock)
    await assert.rejects(() => connector.gmailSortTest('msg1'), { status: 409 })
    for (const service of ['calendar-test', 'gmail-content', 'gmail-sort'] as const) {
      scope = googleScopes[service]
      connector.configure(service, credentials)
      const authorization = new URL(connector.begin(service).url)
      assert.equal(authorization.searchParams.get('scope'), scope)
      await connector.complete(new URLSearchParams({ state: authorization.searchParams.get('state')!, code: 'fixture-code' }))
    }
    const trashAccount = createHash('sha256').update('fixture@example.com').digest('hex')
    await assert.rejects(() => connector.trashInboxMessage('other-account', 'msg1'), { status:409 })
    await assert.rejects(() => connector.trashInboxMessage(trashAccount, 'invalid/id'), { status:400 })
    assert.equal(trashed, 0)
    await connector.trashInboxMessage(trashAccount, 'msg1')
    assert.equal(trashed, 1)
    const start = '2026-11-25T10:00:00.000Z'
    const end = '2026-11-25T10:15:00.000Z'
    const save = (id: string) => { storedCalendar = id }
    const receipt = await connector.calendarTest(start, end, () => storedCalendar, save)
    assert.deepEqual(await connector.calendarTest(start, end, () => storedCalendar, save), receipt)
    assert.equal(creations, 1)
    event=undefined
    const trip = ()=>connector.syncTrip('fixture-trip','Teneriffa Urlaub','2026-12-10','2026-12-18',()=>storedCalendar,save)
    const travelReceipt=await trip()
    assert.deepEqual(await trip(),travelReceipt)
    assert.deepEqual(event,{id:travelReceipt.event,summary:'Teneriffa Urlaub',start:{date:'2026-12-10'},end:{date:'2026-12-18'},
      visibility:'private',reminders:{useDefault:false}})
    const previous={start:'2026-12-10',end:'2026-12-18'}
    const next={start:'2026-12-11',end:'2026-12-19'}
    await connector.moveTrip(storedCalendar!,travelReceipt.event,'Teneriffa Urlaub',previous,next)
    await connector.moveTrip(storedCalendar!,travelReceipt.event,'Teneriffa Urlaub',previous,next)
    assert.deepEqual(event,{id:travelReceipt.event,summary:'Teneriffa Urlaub',start:{date:next.start},end:{date:next.end},
      visibility:'private',reminders:{useDefault:false}})
    await connector.removeTrip(storedCalendar!,'fixture-trip')
    assert.equal(removals,1)
    assert.deepEqual(await connector.gmailSortTest('msg1'), { message: 'msg1', label: 'LifePilot Test' })
    assert.equal(labels, 1)
    await assert.rejects(() => connector.gmailSortTest('msg1', 'jobs'), { status: 409 })
    assert.deepEqual(await connector.gmailSortTest('msg1', 'orders'), { message: 'msg1', label: 'Bestellungen' })
    assert.equal(labels, 2)
    const account=createHash('sha256').update('fixture@example.com').digest('hex')
    assert.deepEqual(await connector.renameInboxLabels(account),{renamed:['Freizeit, Sport & Veranstaltungen'],conflicts:['Finanzen & Belege']})
    assert.deepEqual(await connector.renameInboxLabels(account),{renamed:[],conflicts:['Finanzen & Belege']})
    assert.equal(renames,1)
    differentMailbox = true
    await assert.rejects(() => connector.renameInboxLabels(account),{status:409})
    await assert.rejects(() => connector.gmailSortTest('msg1'), { status: 409 })
    assert.equal(labels, 2)
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

test('owned Calendar grant can remove a verified occurrence but rejects recurrence masters and other owners', async () => {
  const temp=mkdtempSync(join(tmpdir(),'lifepilot-calendar-write-'))
  let recurrence=false, owner=true, deletions=0, verified=true, email='other@example.com', subject='identity-a'
  let expiresIn=3600
  const start='2026-11-25T09:00:00+01:00', end='2026-11-25T10:00:00+01:00'
  const previous={title:'Vorlesung Statistik',start,end}
  const mock:typeof fetch=async(input,options)=>{
    const url=new URL(String(input))
    if(url.hostname==='oauth2.googleapis.com')return json({scope:'email openid https://www.googleapis.com/auth/calendar.events.owned',token_type:'Bearer',
      expires_in:expiresIn,access_token:'fixture-owned-calendar',refresh_token:'fixture-refresh'})
    if (url.hostname==='openidconnect.googleapis.com') {
      assert.equal(url.pathname, '/v1/userinfo')
      assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer fixture-owned-calendar')
      return json({email, email_verified:verified, sub:subject})
    }
    assert.match(url.pathname,/\/calendars\/fixture%40example\.com\/events/u)
    if(url.pathname.endsWith('/events'))return json({accessRole:owner?'owner':'reader'})
    assert.ok(url.pathname.endsWith('/one_occurrence'))
    if(options?.method==='DELETE'){
      assert.equal(new Headers(options.headers).get('if-match'),'"event-revision"')
      assert.equal(url.searchParams.get('sendUpdates'),'none')
      deletions++
      return new Response(null,{status:204})
    }
    return json({id:'one_occurrence',etag:'"event-revision"',summary:previous.title,start:{dateTime:start},end:{dateTime:end},
      ...(recurrence&&{recurrence:['RRULE:FREQ=WEEKLY']})})
  }
  try{
    const connector=new GoogleConnector(temp,origin,mock)
    connector.configure('calendar',credentials)
    const connect = () => {
      const authorization=new URL(connector.begin('calendar-write','fixture@example.com').url)
      assert.equal(authorization.searchParams.get('scope'),googleScopes['calendar-write'])
      assert.equal(authorization.searchParams.get('login_hint'),'fixture@example.com')
      return connector.complete(new URLSearchParams({state:authorization.searchParams.get('state')!,code:'fixture-code'}))
    }
    await assert.rejects(connect(), {status:403})
    assert.equal(connector.status().find(item=>item.service==='calendar-write')?.connected,false)
    email='fixture@example.com'
    verified=false
    await assert.rejects(connect(), {status:403})
    verified=true
    await connect()
    await assert.rejects(connector.changeAppointment('other@example.com','one_occurrence',previous,null,'calendar-write'),{status:403})
    const remove=()=>connector.changeAppointment('fixture@example.com','one_occurrence',previous,null,'calendar-write')
    recurrence=true
    await assert.rejects(remove,{status:409})
    recurrence=false
    owner=false
    await assert.rejects(remove,{status:403})
    owner=true
    await remove()
    assert.equal(deletions,1)
    connector.disconnect('calendar-write')
    expiresIn=1
    await connect()
    subject='identity-b'
    await assert.rejects(remove(), {status:403})
    assert.equal(deletions,1)
  }finally{rmSync(temp,{recursive:true,force:true})}
})
