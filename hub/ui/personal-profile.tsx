import {DateInput} from './presentation.tsx'
import { useEffect, useState, type FormEvent } from 'react'
import type { PersonalProfile, ProfileFields } from '../runtime/personal-profile.ts'
import { dateInBerlin } from '../runtime/values.ts'
import { allergies, cities, diets, heights, interestGroups, jobTitles, languages, occupations, rhythms, studies, transports } from './profile-options.ts'

type Api = <T>(path: string, value?: object, timeout?: number) => Promise<T>

function ageLabel(birthday: string) {
  if (!birthday) return ''
  const today = dateInBerlin()
  const years = Number(today.slice(0,4)) - Number(birthday.slice(0,4)) - Number(today.slice(5) < birthday.slice(5))
  return years >= 0 ? years + ' Jahre' : ''
}

const split=(text:string)=>text.split(',').map(item=>item.trim()).filter(Boolean)
const join=(items:string[])=>items.join(', ')

/** Anklickbare Auswahl (Chips). Eigene Einträge lassen sich ergänzen und wieder entfernen. */
function Chips({options,value,onChange,custom=false,placeholder,known}:{options:string[],value:string,onChange:(value:string)=>void,custom?:boolean,placeholder?:string,known?:string[]}) {
  const [draft,setDraft]=useState('')
  const chosen=split(value)
  const toggle=(item:string)=>onChange(join(chosen.includes(item)?chosen.filter(entry=>entry!==item):[...chosen,item]))
  const extras=custom?chosen.filter(item=>!(known??options).includes(item)):[]
  function add() {
    const item=draft.trim().replace(/,/gu,' ')
    if(item&&!chosen.some(entry=>entry.toLowerCase()===item.toLowerCase())) onChange(join([...chosen,item]))
    setDraft('')
  }
  return <div className="profile-chips-wrap">
    <div className="profile-chips" role="group">
      {[...options,...extras].map(item=><button type="button" key={item} className="profile-chip" aria-pressed={chosen.includes(item)} onClick={()=>toggle(item)}>{item}</button>)}
    </div>
    {custom?<div className="profile-chip-add"><input value={draft} maxLength={40} placeholder={placeholder??'Eigenes hinzufügen'} onChange={event=>setDraft(event.target.value)}
      onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();add()}}}/><button type="button" onClick={add} disabled={!draft.trim()}>Hinzufügen</button></div>:null}
  </div>
}

export function ProfilePanel({api}: {api: Api}) {
  const [profile,setProfile] = useState<PersonalProfile>()
  const [fields,setFields] = useState<ProfileFields>()
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [saved,setSaved] = useState(false)
  const [reload,setReload] = useState(0)

  useEffect(() => {
    let active = true
    void api<PersonalProfile>('/profile').then(value => {
      if (active) { setProfile(value); setFields(value.fields) }
    }, reason => { if (active) setError(reason.message) })
    return () => {active = false}
  }, [api,reload])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!profile || !fields || busy) return
    setBusy(true); setError(''); setSaved(false)
    try {
      const updated = await api<PersonalProfile>('/profile',{fields,revision:profile.revision,confirm:true})
      setProfile(updated); setFields(updated.fields); setSaved(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Das Profil konnte nicht gespeichert werden.') }
    finally { setBusy(false) }
  }
  function change(key: keyof ProfileFields, value: string) {
    setFields(current => current ? { ...current, [key]:value } : undefined)
    setSaved(false)
  }
  const allInterests=interestGroups.flatMap(group=>group.items)
  const interestCount=split(fields?.interests??'').length
  const occupationOptions=fields&&fields.occupation&&!occupations.includes(fields.occupation)?[...occupations,fields.occupation]:occupations
  const heightOptions=fields&&fields.height&&!heights.includes(fields.height)?[...heights,fields.height]:heights
  return <section className="card settings profile-panel" aria-label="Persönliches Profil">
    <div className="profile-header">
      <span className="mark pilot-mark" aria-hidden>{fields?.name.trim().charAt(0).toUpperCase() || 'P'}</span>
      <div><h2>{fields?.name.trim() || 'Mein Profil'}</h2><p>{[ageLabel(fields?.birthday || ''),fields?.location,fields?.jobTitle||fields?.occupation].filter(Boolean).join(' · ') || 'Persönliche Angaben'}</p></div>
    </div>
    {error ? <p role="alert">{error} <button type="button" className="quiet" onClick={()=>{setError('');setReload(value=>value+1)}}>Neu laden</button></p> : null}
    {!fields && !error ? <p role="status">Profil wird geladen …</p> : null}
    {fields ? <form onSubmit={save} className="profile-form">
      <fieldset disabled={busy}>
        <section className="profile-section"><h3>Über mich</h3>
          <div className="profile-grid">
            <label>Anzeigename<input value={fields.name} maxLength={90} autoComplete="nickname" onChange={event=>change('name',event.target.value)} /></label>
            <label>Wohnort<input list="profile-cities" value={fields.location} maxLength={100} placeholder="Stadt eintippen oder auswählen" autoComplete="off" onChange={event=>change('location',event.target.value)} /></label>
            <datalist id="profile-cities">{cities.map(value=><option key={value} value={value}/>)}</datalist>
            <label>Geburtstag<DateInput  value={fields.birthday} max={dateInBerlin()} autoComplete="bday" onChange={event=>change('birthday',event.target.value)} /></label>
            <label>Körpergröße<select value={fields.height} onChange={event=>change('height',event.target.value)}>
              <option value="">Keine Angabe</option>{heightOptions.map(value=><option key={value} value={value}>{value} cm</option>)}</select></label>
          </div>
        </section>
        <section className="profile-section"><h3>Studium &amp; Beruf</h3>
          <div className="profile-grid">
            <label>Studium<input list="profile-study" value={fields.study} maxLength={160} placeholder="Studiengang eintippen oder auswählen" autoComplete="off" onChange={event=>change('study',event.target.value)}/></label>
            <datalist id="profile-study">{studies.map(value=><option key={value} value={value}/>)}</datalist>
            <label>Beruf<select value={fields.occupation} onChange={event=>change('occupation',event.target.value)}>
              <option value="">Keine Angabe</option>{occupationOptions.map(value=><option key={value}>{value}</option>)}</select></label>
            <label>Stellenbezeichnung<input list="profile-titles" value={fields.jobTitle} maxLength={120} placeholder="Falls nicht in der Liste: einfach eintippen" autoComplete="off" onChange={event=>change('jobTitle',event.target.value)}/></label>
            <datalist id="profile-titles">{jobTitles.map(value=><option key={value} value={value}/>)}</datalist>
          </div>
          {fields.jobTitle?<div className="profile-chips"><span className="profile-chip profile-chip-fixed">{fields.jobTitle}<button type="button" aria-label="Stellenbezeichnung entfernen" onClick={()=>change('jobTitle','')}>×</button></span></div>:null}
        </section>
        <section className="profile-section"><h3>Interessen <small>{interestCount?interestCount+' gewählt':'Tippe an, was dir gefällt'}</small></h3>
          {interestGroups.map(group=><div className="profile-group" key={group.title}><h4>{group.title}</h4>
            <Chips options={group.items} value={fields.interests} onChange={value=>change('interests',value)}/></div>)}
          <div className="profile-group"><h4>Eigene Interessen</h4>
            <Chips options={[]} known={allInterests} custom value={fields.interests} onChange={value=>change('interests',value)} placeholder="Zum Beispiel ein bestimmter Verein oder Künstler"/></div>
        </section>
        <section className="profile-section"><h3>Alltag</h3>
          <div className="profile-grid">
            <label>Ernährung<select value={fields.diet} onChange={event=>change('diet',event.target.value)}>{Object.entries(diets).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
            <label>Personen im Haushalt<select value={fields.household} onChange={event=>change('household',event.target.value)}>
              <option value="">Keine Angabe</option>{Array.from({length:8},(_,index)=><option key={index} value={String(index+1)}>{index+1}</option>)}</select></label>
            <label>Tagesrhythmus<select value={fields.rhythm} onChange={event=>change('rhythm',event.target.value)}>{Object.entries(rhythms).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          </div>
          <div className="profile-group"><h4>Allergien &amp; Unverträglichkeiten</h4><Chips options={allergies} custom value={fields.allergies} onChange={value=>change('allergies',value)}/></div>
          <div className="profile-group"><h4>Unterwegs mit</h4><Chips options={transports} custom value={fields.transport} onChange={value=>change('transport',value)}/></div>
          <div className="profile-group"><h4>Sprachen</h4><Chips options={languages} custom value={fields.languages} onChange={value=>change('languages',value)}/></div>
        </section>
        <section className="profile-section"><h3>Aussehen &amp; Reisen</h3>
          <div className="profile-grid">
            {([['glasses','Brille'],['contacts','Kontaktlinsen']] as const).map(([field,label])=><label key={field}>{label}
              <select value={fields[field]} onChange={event=>change(field,event.target.value)}>
                <option value="">Keine Angabe</option><option value="yes">Ja</option><option value="no">Nein</option>
              </select></label>)}
            <label>Grundlage für Einreisehinweise<select value={fields.travelCitizenship}
              onChange={event=>change('travelCitizenship',event.target.value)}>
              <option value="">Aus dem Wohnort ableiten</option>
              <option value="eu">EU-Staatsangehörigkeit</option>
              <option value="other">Einreise individuell prüfen</option>
            </select></label>
          </div>
        </section>
        <section className="profile-section"><h3>Hinweise</h3>
          <label>Was Pilot bei der Planung beachten soll<textarea value={fields.preferences} maxLength={600} onChange={event=>change('preferences',event.target.value)} /></label>
        </section>
        <button className="primary" type="submit">{busy?'Wird gespeichert …':'Profil speichern'}</button>
      </fieldset>
    </form> : null}
    {saved ? <p role="status">Profil gespeichert.</p> : null}
    <small>Alle Angaben sind freiwillig und bleiben in diesem LifePilot-Profil gespeichert. Die Abteilungen nutzen sie lokal, zum Beispiel Outfit und Reisen die Interessen.</small>
  </section>
}
