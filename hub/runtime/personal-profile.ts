import { Problem } from './settings.ts'
import type { Store } from './store.ts'
import { dateInBerlin, isDate } from './values.ts'

const limits = { name: 90, birthday: 10, height: 3, location: 100, study:160, occupation: 160, jobTitle:120, interests: 900, preferences: 600, glasses:3, contacts:3, travelCitizenship:5,
  diet:14, allergies:240, household:2, transport:200, rhythm:12, languages:200 }
export type ProfileFields = { [K in keyof typeof limits]: string }
export type PersonalProfile = { fields: ProfileFields, revision: number }

const empty = { name:'', birthday:'', height:'', location:'', study:'', occupation:'', jobTitle:'', interests:'', preferences:'', glasses:'', contacts:'', travelCitizenship:'',
  diet:'', allergies:'', household:'', transport:'', rhythm:'', languages:'' }

export function personalProfile(store: Store): PersonalProfile {
  const row = store.db.prepare('SELECT details, revision FROM personal_profile WHERE singleton=1').get()
  return row ? { fields: {...empty,...JSON.parse(String(row.details))}, revision: Number(row.revision) } : { fields: empty, revision: 0 }
}

export function savePersonalProfile(store: Store, fields: unknown, revision: unknown): PersonalProfile {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields) || !Number.isSafeInteger(revision) ||
    Object.keys(fields).some(key => !Object.hasOwn(limits, key))) throw new Problem(400, 'Prüfe deine Profilangaben.')
  const source = fields as Record<string, unknown>
  const profile: ProfileFields = { ...empty }
  for (const key of Object.keys(limits) as Array<keyof ProfileFields>) {
    const value = source[key] ?? ''
    if (typeof value !== 'string' || value.length > limits[key] || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
      throw new Problem(400, 'Ein Profilfeld ist ungültig oder zu lang.')
    }
    profile[key] = value.trim()
  }
  if (![profile.glasses,profile.contacts].every(value=>['','yes','no'].includes(value))) {
    throw new Problem(400,'Prüfe deine Angaben zu Brille und Kontaktlinsen.')
  }
  if (!['','alles','vegetarisch','vegan','pescetarisch','halal','koscher'].includes(profile.diet)) throw new Problem(400,'Prüfe deine Angabe zur Ernährung.')
  if (!['','frueh','normal','spaet'].includes(profile.rhythm)) throw new Problem(400,'Prüfe deine Angabe zum Tagesrhythmus.')
  if (profile.household && (!/^\d{1,2}$/u.test(profile.household) || Number(profile.household) < 1 || Number(profile.household) > 12)) throw new Problem(400,'Prüfe die Haushaltsgröße.')
  if (!['','eu','other'].includes(profile.travelCitizenship)) {
    throw new Problem(400,'Prüfe deine Angabe für Einreisehinweise.')
  }
  if (profile.birthday && (!isDate(profile.birthday) || profile.birthday > dateInBerlin())) {
    throw new Problem(400, 'Gib ein gültiges Geburtsdatum ein.')
  }
  if (profile.height && (!/^\d{2,3}$/u.test(profile.height) || Number(profile.height) < 30 || Number(profile.height) > 280)) {
    throw new Problem(400, 'Gib die Körpergröße in Zentimetern ein.')
  }
  return store.transaction(() => {
    const current = personalProfile(store)
    for (const key of ['study','jobTitle','glasses','contacts','travelCitizenship','diet','allergies','household','transport','rhythm','languages'] as const) {
      if (!Object.hasOwn(source,key)) profile[key]=current.fields[key]
    }
    if (current.revision !== revision) throw new Problem(409, 'Dein Profil wurde inzwischen geändert. Lade es neu.')
    store.db.prepare(`INSERT INTO personal_profile VALUES (1,?,1)
      ON CONFLICT(singleton) DO UPDATE SET details=excluded.details, revision=personal_profile.revision+1`)
      .run(JSON.stringify(profile))
    return personalProfile(store)
  })
}
