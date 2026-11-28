import {BulkApproval,approveEach} from './bulk-approval.tsx'
import {DateInput} from './presentation.tsx'
import { useEffect, useState, type FormEvent } from 'react'
import { applicationGroups, applicationStatuses, emptyApplication, type Application,
  type ApplicationDraft, type ApplicationOverview, type ApplicationSource } from '../runtime/application-types.ts'

type Api = <T>(path: string, value?: object, timeout?: number) => Promise<T>
type Editor = { draft: ApplicationDraft, existing?: Application, source?: ApplicationSource }
const applicationKey=(item:Pick<ApplicationDraft,'company'|'role'>)=>JSON.stringify([item.company,item.role].map(value=>value.trim().toLocaleLowerCase('de-DE')))
function applicationReviewDraft(source?: ApplicationSource, existing?: Application): ApplicationDraft {
  if (!source) return existing ?? emptyApplication
  const draft={...emptyApplication,company:source.company,role:source.role,location:source.location,
    salary:source.salary ?? '',description:source.description ?? '',notes:source.notes ?? '',link:source.link ?? '',
    applied_on:source.applied_on ?? null,follow_up:source.follow_up ?? null,status:source.status}
  if (!existing) return draft
  const supplement=(current:string,incoming:string,limit:number)=>incoming&&!current.includes(incoming)
    ? [current,incoming].filter(Boolean).join('\n\n').slice(0,limit) : current
  return {...existing, status:draft.status, location:existing.location||draft.location, salary:existing.salary||draft.salary,
    applied_on:existing.applied_on??draft.applied_on,link:existing.link||draft.link,
    description:supplement(existing.description,draft.description,2500),notes:supplement(existing.notes,draft.notes,1600)}
}

/** Vorschläge aus Mails, die eindeutig zugeordnet und vollständig sind, lassen sich mit einem Klick bestätigen. */
function eligibleSources(data?:ApplicationOverview){
  const sources=data?.sources??[]
  const counts=new Map<string,number>()
  for(const source of sources)counts.set(applicationKey(source),(counts.get(applicationKey(source))??0)+1)
  return sources.flatMap(source=>{
    const key=applicationKey(source)
    const matching=data?.items.filter(item=>applicationKey(item)===key)??[]
    const existing=source.application_id?data?.items.find(item=>item.id===source.application_id):matching[0]
    if(counts.get(key)!==1||matching.length>1||source.application_id&&!existing||
      !existing&&![source.company,source.role].every(value=>value.trim()))return []
    return [{id:source.id,title:source.title,existing,draft:applicationReviewDraft(source,existing)}]
  })
}
const sourceLine=(source:ApplicationSource)=>[source.location,applicationStatuses[source.status],
  source.follow_up?'Termin '+source.follow_up.split('-').reverse().join('.'):source.applied_on?'Beworben '+source.applied_on.split('-').reverse().join('.'):''].filter(Boolean).join(' · ')
const fields = [
  ['company','Firma',120,true], ['role','Stelle oder Jobbeschreibung',160,true], ['location','Ort',120,false],
  ['salary','Gehalt oder Gehaltsspanne',100,false], ['link','Link zur Stelle',500,false],
] as const

export function Applications({ api, onBack, initialId }: { api: Api, onBack: () => void,initialId?:string }) {
  const [data, setData] = useState<ApplicationOverview>()
  const [editor, setEditor] = useState<Editor>()
  const [query, setQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [imageText, setImageText] = useState('')
  const [batchReviewed,setBatchReviewed]=useState(false)
  const [history, setHistory] = useState<{ status: keyof typeof applicationStatuses, changed_at: string }[]>([])
  useEffect(() => {
    let active = true
    void api<ApplicationOverview>('/applications').then(result => { if (active) setData(result) },
      cause => { if (active) setError(cause.message) })
    return () => { active = false }
  }, [api])

  useEffect(()=>{
    const item=data?.items.find(entry=>entry.id===initialId)
    if(item)open(undefined,item)
  },[initialId,Boolean(data)])

  async function act(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await action() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Die Änderung konnte nicht ausgeführt werden.') }
    finally { setBusy(false) }
  }
  async function reload() { setData(await api('/applications')) }
  const visible = (data?.items ?? []).filter(item =>
    [item.company, item.role, item.location].join(' ').toLocaleLowerCase('de').includes(query.toLocaleLowerCase('de').trim()))
  function open(source?: ApplicationSource, existing?: Application) {
    setImageText(''); setHistory([]); setConfirmDelete(false)
    setEditor({ source, existing, draft: applicationReviewDraft(source,existing) })
    if (existing) void api<typeof history>('/applications/' + existing.id + '/history').then(setHistory).catch(() => {})
  }
  function change<K extends keyof ApplicationDraft>(key: K, value: ApplicationDraft[K]) {
    setEditor(current => current ? { ...current, draft: { ...current.draft, [key]: value } } : current)
  }
  function remove() {
    const target = editor?.existing
    if (!target || busy) return
    void act(async () => {
      await api('/applications/delete', { existing: target.id, revision: target.revision, confirm: true })
      await reload()
      setEditor(undefined); setImageText(''); setConfirmDelete(false); setNotice('Bewerbung gelöscht.')
    })
  }
  function save(event: FormEvent) {
    event.preventDefault()
    if (!editor || busy) return
    void act(async () => {
      await api('/applications/save', { draft: editor.draft, existing: editor.existing?.id, revision: editor.existing?.revision,
        source: editor.source?.id, confirm: true })
      await reload()
      setEditor(undefined); setImageText(''); setNotice('Bewerbung gespeichert.')
    })
  }
  const sources=data?.sources??[]
  const eligible=eligibleSources(data)
  async function approveSources(items:readonly (typeof eligible)[number][]){
    setBusy(true);setError('');setBatchReviewed(true)
    try{
      const result=await approveEach(items,item=>api('/applications/save',{
        draft:item.draft,source:item.id,existing:item.existing?.id,revision:item.existing?.revision,confirm:true,
      }))
      await reload()
      if(items.some(item=>item.id===editor?.source?.id)&&result.approved)setEditor(undefined)
      return result
    }finally{setBusy(false)}
  }
  async function upload(file: File) {
    await act(async () => {
      if (file.size > 5 * 1024 * 1024) throw Error('Wähle ein Bild bis 5 MB.')
      const response = await fetch('/api/applications/image', {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-LifePilot-Confirm': 'image' },
        body: file, signal: AbortSignal.timeout(20000),
      })
      const recognized = await response.json()
      if (!response.ok) throw Error(recognized.error)
      setImageText(recognized.text)
      setEditor(current => ({
        ...current,
        draft: { ...(current?.draft ?? emptyApplication), ...Object.fromEntries(Object.entries(recognized.fields).filter(([, value]) => !!value)) },
      }))
      setNotice(recognized.text ? 'Text erkannt. Prüfe und ergänze die Felder vor dem Speichern.' : 'Im Bild wurde kein Text erkannt.')
    })
  }

  return <section className="application-space" aria-label="Bewerbungsmanager">
    {error ? <p className="banner" role="alert">{error}</p> : null}
    {notice ? <p className="banner" role="status">{notice}</p> : null}
    {data ? <dl className="application-metrics">
      <div><dt>Aktiv</dt><dd>{data.stats.applied + data.stats.reply + data.stats.interview}</dd></div>
      <div><dt>Zusagen</dt><dd>{data.stats.offer}</dd></div>
      <div><dt>Absagen</dt><dd>{data.stats.rejected}</dd></div>
      <div><dt>Zurückgezogen</dt><dd>{data.stats.withdrawn}</dd></div>
    </dl> : !error ? <p role="status">Bewerbungen werden geladen …</p> : null}
    {editor ? <form className="card settings application-editor" onSubmit={save}>
      <div className="editor-title"><h3>{editor.existing ? 'Bewerbung bearbeiten' : editor.source ? 'Mailvorschlag prüfen' : 'Neue Bewerbung'}</h3>
        <button className="quiet" type="button" disabled={busy} onClick={() => setEditor(undefined)}>Schließen</button></div>
      {editor.source ? <p>Quelle · {editor.source.title}</p> : null}
      {editor.source && data?.items.length ? <label>Zu bestehender Bewerbung zuordnen
        <select value={editor.existing?.id ?? ''} disabled={busy} onChange={event => {
          open(editor.source, data.items.find(item => item.id === event.target.value))
        }}><option value="">Neue Bewerbung</option>{data.items.map(item => <option value={item.id} key={item.id}>{item.company} · {item.role}</option>)}</select>
      </label> : null}
      <label className="application-upload">Screenshot oder Foto auslesen
        <input type="file" accept="image/png,image/jpeg" disabled={busy} onChange={event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void upload(file)
        }} />
      </label>
      {imageText ? <details><summary>Erkannten Text ansehen</summary><pre className="model-preview">{imageText}</pre></details> : null}
      <div className="application-fields">
        {fields.map(([name, label, maxLength, required]) => <label key={name}>{label}{required ? ' *' : ''}
          <input type={name === 'link' ? 'url' : 'text'} maxLength={maxLength} value={editor.draft[name]} required={required}
            onChange={event => change(name, event.target.value)} />
        </label>)}
        <label>Status<select value={editor.draft.status} onChange={event => change('status', event.target.value as ApplicationDraft['status'])}>
          {Object.entries(applicationStatuses).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label>Beworben am<DateInput  value={editor.draft.applied_on ?? ''} onChange={event => change('applied_on', event.target.value || null)} /></label>
        <label>Wiedervorlage<DateInput  value={editor.draft.follow_up ?? ''} onChange={event => change('follow_up', event.target.value || null)} /></label>
      </div>
      <label>Ausführliche Beschreibung<textarea maxLength={2500} value={editor.draft.description} onChange={event => change('description', event.target.value)} /></label>
      <label>Notizen und nächste Schritte<textarea maxLength={1600} value={editor.draft.notes} onChange={event => change('notes', event.target.value)} /></label>
      {editor.existing && history.length ? <details><summary>Statusverlauf</summary><ul>{history.map((event,index) =>
        <li key={index}>{applicationStatuses[event.status]} · {new Date(event.changed_at).toLocaleDateString('de-DE',{timeZone:'Europe/Berlin'})}</li>)}</ul></details> : null}
      <div className="actions"><button className="primary" disabled={busy}>Bewerbung speichern</button>
        {editor.existing ? confirmDelete ? <>
          <span role="alert">Bewerbung bei {editor.existing.company} wirklich löschen? Das lässt sich nicht rückgängig machen.</span>
          <button type="button" className="travel-danger-action" disabled={busy} onClick={remove}>Ja, löschen</button>
          <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Abbrechen</button>
        </> : <button type="button" className="travel-danger-action" disabled={busy} onClick={() => setConfirmDelete(true)}>Bewerbung löschen</button> : null}</div>
    </form> : null}
    {(sources.length||batchReviewed) ? <details className="card settings mail-finance disclosure application-suggestions" open>
      <summary><strong>Bewerbungsvorschläge aus Mails</strong><span className="count-badge">{sources.length} offen</span></summary>
      {sources.map(source => {
        const quick=eligible.find(item=>item.id===source.id)
        return <article className="application-source" key={source.id}>
          <div><strong>{source.company||source.title}{source.role?' · '+source.role:''}</strong><p>{sourceLine(source)}</p></div>
          <div className="actions">
            {quick?<button type="button" className="primary" disabled={busy} onClick={()=>void approveSources([quick])}>Passt</button>:null}
            <button type="button" disabled={busy} onClick={() => open(source)}>Prüfen</button>
            <button type="button" className="quiet" disabled={busy} onClick={() => void act(async () => {
              await api('/applications/deny', { source: source.id, confirm: true }); await reload()
            })}>Ablehnen</button></div>
        </article>})}
      {eligible.length<sources.length?<p>Vorschläge mit fehlenden Angaben oder mehreren möglichen Zuordnungen brauchen eine Einzelprüfung.</p>:null}
      <BulkApproval items={eligible} disabled={busy} approve={approveSources}
        description="LifePilot speichert vollständige Bewerbungen und übernimmt neue Status für eindeutig zugeordnete Bewerbungen."/>
    </details> : null}
    <div className="application-toolbar">
      <label className="application-search">Bewerbungen suchen<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Firma, Stelle oder Ort" /></label>
      <button type="button" className="primary" disabled={busy} onClick={() => open()}>Bewerbung hinzufügen</button>
    </div>
    <div className="application-board">
      {applicationGroups.map(({ title, statuses }) => {
        const column = visible.filter(item => statuses.some(status => status === item.status))
        return <section className="application-column" aria-label={title} key={title}>
          <div className="editor-title"><h3>{title}</h3><span>{column.length}</span></div>
          {column.length ? column.map(item => <button className="application-card" type="button" onClick={() => open(undefined,item)} key={item.id}>
            <span className="application-stage" data-stage={item.status}>{applicationStatuses[item.status]}</span>
            <strong>{item.role}</strong><span>{item.company}{item.location ? ' · ' + item.location : ''}</span>
            {item.follow_up ? <small>Wiedervorlage · {new Intl.DateTimeFormat('de-DE',{timeZone:'UTC'}).format(new Date(item.follow_up))}</small> : null}
          </button>) : <p className="empty">Keine Bewerbungen</p>}
        </section>
      })}
    </div>
  </section>
}

/** Auf der Startseite unter „Wartet auf dein OK“: Bewerbungen, die LifePilot in Mails erkannt hat, zum Bestätigen. */
export function ApplicationApprovals({api,refreshKey,onOpen,onUpdate}:{api:Api,refreshKey:string,onOpen:()=>void,onUpdate:()=>void}){
  const [data,setData]=useState<ApplicationOverview>()
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const load=()=>api<ApplicationOverview>('/applications').then(value=>{setData(value);setError('')})
  useEffect(()=>{
    let active=true
    void api<ApplicationOverview>('/applications').then(value=>{if(active){setData(value);setError('')}}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Bewerbungen konnten nicht geladen werden.')})
    return ()=>{active=false}
  },[api,refreshKey])
  const sources=data?.sources??[]
  if(!sources.length&&!error)return null
  const eligible=eligibleSources(data)
  async function run(action:()=>Promise<unknown>){
    setBusy(true);setError('')
    try{await action();await load();onUpdate()}catch(reason){setError(reason instanceof Error?reason.message:'Die Änderung konnte nicht gespeichert werden.')}finally{setBusy(false)}
  }
  return <details className="card settings mail-finance disclosure application-approvals" aria-label="Bewerbungen, die auf dich warten">
    <summary><strong>Bewerbungen</strong><span className="count-badge">{sources.length} offen</span></summary>
    {error?<p role="alert">{error}</p>:null}
    {sources.map(source=>{
      const quick=eligible.find(item=>item.id===source.id)
      return <article className="application-source" key={source.id}>
        <div><strong>{source.company||source.title}{source.role?' · '+source.role:''}</strong><p>{sourceLine(source)}</p></div>
        <div className="actions">
          {quick?<button type="button" className="primary" disabled={busy} onClick={()=>void run(()=>api('/applications/save',{draft:quick.draft,source:quick.id,existing:quick.existing?.id,revision:quick.existing?.revision,confirm:true}))}>Passt</button>:null}
          <button type="button" disabled={busy} onClick={onOpen}>Prüfen</button>
          <button type="button" className="quiet" disabled={busy} onClick={()=>void run(()=>api('/applications/deny',{source:source.id,confirm:true}))}>Ablehnen</button>
        </div>
      </article>})}
  </details>
}
