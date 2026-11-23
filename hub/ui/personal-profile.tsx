import {DateInput} from './presentation.tsx'
import { useEffect, useState, type FormEvent } from 'react'
import type { PersonalProfile, ProfileFields } from '../runtime/personal-profile.ts'
import { dateInBerlin } from '../runtime/values.ts'

type Api = <T>(path: string, value?: object, timeout?: number) => Promise<T>

function ageLabel(birthday: string) {
  if (!birthday) return ''
  const today = dateInBerlin()
  const years = Number(today.slice(0,4)) - Number(birthday.slice(0,4)) - Number(today.slice(5) < birthday.slice(5))
  return years >= 0 ? years + ' Jahre' : ''
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
  return <section className="card settings profile-panel" aria-label="Persönliches Profil">
    <div className="profile-header">
      <span className="mark pilot-mark" aria-hidden>{fields?.name.trim().charAt(0).toUpperCase() || 'P'}</span>
      <div><h2>{fields?.name.trim() || 'Mein Profil'}</h2><p>{[ageLabel(fields?.birthday || ''),fields?.location].filter(Boolean).join(' · ') || 'Persönliche Angaben'}</p></div>
    </div>
    {error ? <p role="alert">{error} <button type="button" className="quiet" onClick={()=>{setError('');setReload(value=>value+1)}}>Neu laden</button></p> : null}
    {!fields && !error ? <p role="status">Profil wird geladen …</p> : null}
    {fields ? <form onSubmit={save} className="profile-form">
      <fieldset disabled={busy}>
        <div className="profile-grid">
          <label>Anzeigename<input value={fields.name} maxLength={90} autoComplete="nickname" onChange={event=>change('name',event.target.value)} /></label>
          <label>Wohnort<input value={fields.location} maxLength={100} onChange={event=>change('location',event.target.value)} /></label>
          <label>Geburtstag<DateInput  value={fields.birthday} max={dateInBerlin()} autoComplete="bday" onChange={event=>change('birthday',event.target.value)} /></label>
          <label>Körpergröße in cm<input value={fields.height} maxLength={3} inputMode="numeric" pattern="[0-9]{2,3}" onChange={event=>change('height',event.target.value)} /></label>
        </div>
        <div className="profile-grid">
          <label>Studium<input list="profile-study" value={fields.study} maxLength={160} placeholder="Studiengang oder Abschluss" onChange={event=>change('study',event.target.value)}/></label>
          <datalist id="profile-study">{['Bachelorstudium','Masterstudium','Duales Studium','Promotion','Ausbildung','Studium abgeschlossen'].map(value=><option key={value} value={value}/>)}</datalist>
          <label>Beruf<input list="profile-work" value={fields.occupation} maxLength={160} placeholder="Tätigkeit oder Beschäftigung" onChange={event=>change('occupation',event.target.value)}/></label>
          <datalist id="profile-work">{['Werkstudent','Teilzeit','Vollzeit','Selbstständig','Praktikum','Nebenjob'].map(value=><option key={value} value={value}/>)}</datalist>
        </div>
        <label>Interessen<textarea value={fields.interests} maxLength={450} placeholder="Zum Beispiel Volleyball, Reisen oder Musik" onChange={event=>change('interests',event.target.value)} /></label>
        <label>Was Pilot bei der Planung beachten soll<textarea value={fields.preferences} maxLength={600} onChange={event=>change('preferences',event.target.value)} /></label>
        <div className="profile-grid">
          {([['glasses','Brille'],['contacts','Kontaktlinsen']] as const).map(([field,label])=><label key={field}>{label}
            <select value={fields[field]} onChange={event=>change(field,event.target.value)}>
              <option value="">Keine Angabe</option><option value="yes">Ja</option><option value="no">Nein</option>
            </select></label>)}
        </div>
        <label>Grundlage für Einreisehinweise<select value={fields.travelCitizenship}
          onChange={event=>change('travelCitizenship',event.target.value)}>
          <option value="">Aus dem Wohnort ableiten</option>
          <option value="eu">EU-Staatsangehörigkeit</option>
          <option value="other">Einreise individuell prüfen</option>
        </select></label>
        <button className="primary" type="submit">{busy?'Wird gespeichert …':'Profil speichern'}</button>
      </fieldset>
    </form> : null}
    {saved ? <p role="status">Profil gespeichert.</p> : null}
    <small>Alle Angaben sind freiwillig und bleiben in diesem LifePilot-Profil gespeichert.</small>
  </section>
}
