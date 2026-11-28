import { useEffect, useState, useSyncExternalStore } from 'react'
import { newsCategories, newsOptions, newsTitles, type NewsBriefing, type NewsCategory, type NewsItem, type NewsPreferences, type NewsState } from '../runtime/news-types.ts'

type Api=<T>(path:string,payload?:object,timeout?:number)=>Promise<T>

/*
 * Der Auftrag läuft auf dem Server weiter, auch wenn du den Bereich wechselst oder die Seite neu lädst.
 * Hier liegt nur der Anzeigezustand außerhalb der Seite; während der Auftrag läuft, wird alle 3 Sekunden nachgefragt.
 */
type View={state:NewsState|null,error:string,starting:boolean}
let view:View={state:null,error:'',starting:false}
const listeners=new Set<()=>void>()
const publish=(next:Partial<View>)=>{view={...view,...next};listeners.forEach(listener=>listener())}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener)}}
export const useNews=()=>useSyncExternalStore(subscribe,()=>view)
let timer:ReturnType<typeof setTimeout>|undefined

export async function loadNews(api:Api) {
  clearTimeout(timer)
  try {
    const state=await api<NewsState>('/news',undefined,10_000)
    publish({state,error:state.error??''})
    if(state.running) timer=setTimeout(()=>{void loadNews(api)},3000)
  } catch(reason) {
    publish({error:reason instanceof Error?reason.message:'News konnten nicht geladen werden.'})
    timer=setTimeout(()=>{void loadNews(api)},8000)
  }
}
export async function startNews(api:Api) {
  if(view.starting||view.state?.running) return
  publish({starting:true,error:''})
  try {
    const state=await api<NewsState>('/news/refresh',{confirm:true},15_000)
    publish({state,starting:false})
    timer=setTimeout(()=>{void loadNews(api)},3000)
  } catch(reason) {
    publish({starting:false,error:reason instanceof Error?reason.message:'Das News-Briefing konnte nicht gestartet werden.'})
  }
}

export async function savePreferences(api:Api,preferences:NewsPreferences) {
  const state=await api<NewsState>('/news/preferences',{preferences,confirm:true},10_000)
  publish({state:{...(view.state??state),preferences:state.preferences}})
}

const stamp=(iso:string)=>new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'}).format(new Date(iso))
const day=(value:string)=>value.split('-').reverse().join('.')
const hint:Record<NewsCategory,string> = {wirtschaft:'Konjunktur, Unternehmen, Märkte',technik:'IT, KI, Geräte',politik:'Deutschland, EU, Welt',aktien:'Börse & Depot-Umfeld',regional:'',sport:'Fußball & mehr'}

function Story({item,open,toggle}:{item:NewsItem,open:boolean,toggle:() => void}) {
  return <li className="news-story" data-open={open||undefined}>
    <button type="button" className="news-headline" aria-expanded={open} onClick={toggle}>
      <span>{item.headline}</span><span className="news-chevron" aria-hidden="true">{open?'–':'+'}</span>
    </button>
    {open?<div className="news-detail">
      <p>{item.details}</p>
      <div className="news-meta"><span>{item.source}{item.published?' · '+day(item.published):''}</span>
        <a href={item.url} target="_blank" rel="noreferrer noopener">Zur Quelle ↗</a></div>
    </div>:null}
  </li>
}

function Category({id,items,subtitle,missing,loaded}:{id:NewsCategory,items:NewsItem[],subtitle:string,missing:boolean,loaded:boolean}) {
  const [open,setOpen]=useState(-1)
  return <section className="card news-card" aria-labelledby={'news-'+id} data-category={id}>
    <header><h2 id={'news-'+id}>{newsTitles[id]}</h2>{subtitle?<small>{subtitle}</small>:null}</header>
    {items.length?<ul>{items.map((item,index)=><Story key={item.url} item={item} open={open===index} toggle={()=>setOpen(open===index?-1:index)}/>)}</ul>
      :<p className="news-empty">{!loaded?'Noch keine Infos geladen.':missing?'Hier konnte gerade nichts geladen werden. Starte die Aktualisierung erneut.'
        :id==='regional'?'Trage deinen Wohnort im Profil ein, dann erscheinen hier Meldungen aus deiner Region.':'Keine Meldungen.'}</p>}
    {missing&&items.length?<p className="news-empty">Aktualisierung fehlgeschlagen, hier steht der letzte Stand.</p>:null}
  </section>
}

const customHint:Record<NewsCategory,string>={wirtschaft:'z. B. Autoindustrie, Mittelstand',technik:'z. B. Apple, Open-Source',politik:'z. B. Bundestag, Wahlen',
  aktien:'z. B. SAP, NVIDIA, MSCI World',regional:'z. B. Stadtteil, Verein, Thema',sport:'z. B. VfB Stuttgart, Sinner'}

/** Kleiner Fragebogen je Bereich: Überblick oder Schwerpunkte per Kästchen, dazu ein Freitextfeld für Namen und Begriffe. */
function NewsSettings({api,preferences,close}:{api:Api,preferences:NewsPreferences,close:()=>void}) {
  const [draft,setDraft]=useState<NewsPreferences>(preferences)
  const [error,setError]=useState('')
  const [saving,setSaving]=useState(false)
  const change=(id:NewsCategory,patch:Partial<NewsPreferences[NewsCategory]>)=>setDraft(current=>({...current,[id]:{...current[id],...patch}}))
  const save=async()=>{
    setSaving(true);setError('')
    try { await savePreferences(api,draft);close() } catch(reason) { setError(reason instanceof Error?reason.message:'Speichern fehlgeschlagen.') } finally { setSaving(false) }
  }
  return <section className="card news-settings" aria-label="News-Einstellungen">
    <div className="news-settings-head"><div><h2>Was interessiert dich?</h2><p>Gilt ab dem nächsten „News aktualisieren“. Ohne Auswahl bekommst du den allgemeinen Überblick.</p></div>
      <div className="news-settings-actions"><button type="button" className="quiet" onClick={close}>Abbrechen</button>
        <button type="button" className="inline-action" disabled={saving} onClick={()=>{void save()}}>Speichern</button></div></div>
    {error?<p className="news-error" role="alert">{error}</p>:null}
    <div className="news-settings-grid">
      {newsCategories.map(id=><fieldset key={id}>
        <legend>{newsTitles[id]}</legend>
        <label className="news-check"><input type="checkbox" checked={draft[id].general} onChange={event=>change(id,{general:event.target.checked})}/><span>Allgemeiner Überblick</span></label>
        <div className="news-checks">{newsOptions[id].map(option=><label className="news-check" key={option}>
          <input type="checkbox" checked={draft[id].topics.includes(option)}
            onChange={event=>change(id,{topics:event.target.checked?[...draft[id].topics,option]:draft[id].topics.filter(topic=>topic!==option)})}/><span>{option}</span></label>)}</div>
        <input type="text" maxLength={120} aria-label={newsTitles[id]+': eigener Schwerpunkt'} placeholder={customHint[id]} value={draft[id].custom} onChange={event=>change(id,{custom:event.target.value})}/>
      </fieldset>)}
    </div>
  </section>
}

export function NewsPage({api}:{api:Api}) {
  const {state,error,starting}=useNews()
  useEffect(()=>{void loadNews(api);return ()=>clearTimeout(timer)},[api])
  const [settings,setSettings]=useState(false)
  const running=starting||state?.running===true
  const briefing:NewsBriefing|null=state?.briefing??null
  return <div className="news">
    <header className="news-toolbar">
      <div>
        {briefing?<p className="news-stand">Stand {stamp(briefing.created)}{briefing.location?' · Region '+briefing.location:''}</p>
          :<p className="news-stand">{state?'Noch kein Briefing erstellt.':'Lade …'}</p>}
        {briefing?.overview?<p className="news-overview">{briefing.overview}</p>:null}
      </div>
      <div className="news-actions">
        <button className="quiet" type="button" aria-expanded={settings} onClick={()=>setSettings(open=>!open)}>Einstellungen</button>
        <button className="inline-action" type="button" disabled={running} onClick={()=>{void startNews(api)}}>{running?'Briefing wird erstellt …':'News aktualisieren'}</button>
      </div>
    </header>
    {settings&&state?<NewsSettings api={api} preferences={state.preferences} close={()=>setSettings(false)}/>:null}
    {running?<div className="loading news-status" role="status"><span>Pilot sucht aktuelle Meldungen. Du kannst solange in andere Bereiche wechseln, das Briefing läuft weiter.</span><progress aria-label="Suche läuft"/></div>:null}
    {error&&!running?<p className="news-status news-error" role="alert">{error}</p>:null}
    <div className="news-grid">
      {newsCategories.map(id=><Category key={id} id={id} items={briefing?.categories[id]??[]} loaded={briefing!==null} missing={briefing?.missing?.includes(id)===true}
        subtitle={id==='regional'?(briefing?.location?briefing.location+' · Landkreis · Bundesland':'Wohnort · Landkreis · Bundesland'):hint[id]}/>)}
    </div>
    <p className="news-footnote">Zusammenfassungen werden von Pilot aus Websuche-Ergebnissen erstellt und können Fehler enthalten; maßgeblich ist die verlinkte Quelle. Es wird nur dein Wohnort übermittelt, keine weiteren Profildaten.</p>
  </div>
}
