import type { FragranceDraft } from './wardrobe-extras-types.ts'

/**
 * Leitet aus Duftnoten und Konzentration ab, wofür ein Duft gedacht ist, wie intensiv er wirkt,
 * wann er am besten passt und in welchen Jahreszeiten. Ersetzt die früheren Pauschalvorlagen
 * („Alltag, Büro, Date“ und „… oder einem Hemd mit Sakko“).
 */
export type ScentGuide = {
  character: string, purpose: string, intensity: string, timing: string, seasonText: string, pairing: string,
  occasions: string[], seasons: string[], times: string[],
}

const fold = (value: string) => value.toLocaleLowerCase('de-DE').normalize('NFD').replace(/\p{M}/gu, '')
// Bekannte Düfte, deren Produktseite keine Duftnoten liefert. Angaben nach den Herstellerpyramiden.
const knownNotes: [RegExp, string][] = [
  [/stronger with you intense/u, 'Rosa Pfeffer, Wacholder, Mandarine, Toffee, Zimt, Lavendel, Salbei, Vanille, Tonkabohne, Ambra'],
  [/stronger with you(?! intense)/u, 'Kardamom, Rosa Pfeffer, Mandarine, Salbei, Kastanie, Vanille, Zedernholz'],
  [/\bnaxos\b/u, 'Lavendel, Bergamotte, Zitrone, Honig, Zimt, Jasmin, Tabak, Tonkabohne, Vanille'],
  [/dior homme intense/u, 'Lavendel, Iris, Ambrette, Birne, Zedernholz, Vetiver'],
  [/\bimagination\b/u, 'Bergamotte, Zitrone, Orange, Neroli, Ingwer, Zimt, Schwarzer Tee, Ambroxan, Guajakholz'],
  [/sauvage(?! elixir)/u, 'Bergamotte, Pfeffer, Lavendel, Ambroxan, Zedernholz'],
  [/bleu de chanel/u, 'Grapefruit, Zitrone, Minze, Ingwer, Jasmin, Zedernholz, Sandelholz, Weihrauch'],
]
const families: Record<string, RegExp> = {
  fresh: /bergamott|zitron|grapefruit|mandarin|orange(?!nblut)|limett|apfel|birne|ambroxan|aquat|meer|minze/u,
  aromatic: /lavendel|salbei|wacholder|rosmarin|vetiver|geranie/u,
  floral: /orangenblut|jasmin|rose\b|rosen|iris|veilchen|neroli|tuberose/u,
  spicy: /pfeffer|kardamom|zimt|ingwer|nelke|muskat/u,
  sweet: /vanille|tonka|kakao|honig|toffee|karamell|kastanie|praline/u,
  woody: /zedern|sandelholz|patschuli|vetiver|holz/u,
  dark: /\boud\b|ambra|weihrauch|leder|tabak|myrrhe|harz/u,
  musk: /moschus|ambrofix|ambrette/u,
}

// Eine bekannte vollständige Herstellerpyramide hat Vorrang vor wenigen aus einer Shopseite gelesenen Noten.
export function scentNotes(fragrance: Pick<FragranceDraft, 'name' | 'brand' | 'notes' | 'description'>) {
  const key = fold(fragrance.brand + ' ' + fragrance.name)
  return knownNotes.find(([pattern]) => pattern.test(key))?.[1] ?? fragrance.notes
}

export function scentGuide(fragrance: Pick<FragranceDraft, 'name' | 'brand' | 'notes' | 'description' | 'profile'>): ScentGuide {
  // Jede Note zählt einmal. Die Beschreibung dient nur, wenn keine Noten bekannt sind.
  const list = (scentNotes(fragrance) || fragrance.description).split(/[,;·]|\s+und\s+/u).map(fold).filter(Boolean)
  const count = (family: string) => list.filter(note => families[family].test(note)).length
  const f = Object.fromEntries(Object.keys(families).map(name => [name, count(name)])) as Record<string, number>
  const name = fold(fragrance.name)
  let level = /extrait|\ble parfum\b|\belixir\b|\bparfum\b(?! de)/u.test(name) && !/eau de parfum/u.test(name) ? 3 :
    /eau de toilette|\bedt\b|cologne/u.test(name) ? 1 : 2
  if (/\bintense?\b|absolu/u.test(name)) level += 1
  if (f.dark >= 2 || f.dark >= 1 && f.sweet >= 2 || f.sweet >= 2 && level <= 1 || /\boud\b/u.test(list.join(' '))) level += 1
  if (f.fresh + f.aromatic >= 3 && f.sweet + f.dark === 0) level -= 1
  level = Math.max(1, Math.min(4, level))
  const warmth = f.sweet + f.dark + f.spicy * .5 + (fragrance.profile === 'Warm & intensiv' ? 1 : 0)
  const freshness = f.fresh + f.aromatic * .5 + (fragrance.profile === 'Frisch' ? 1 : 0)
  const powdery = /iris|veilchen/u.test(list.join(' ')) && (f.musk + f.sweet >= 1 || /intense?/u.test(name))
  const kind = f.dark >= 2 && f.sweet < 3 || f.dark >= 1 && level >= 3 && f.sweet < 2 ? 'dark' : powdery ? 'powdery' : f.sweet >= 2 && warmth > freshness ? 'gourmand' :
    (f.floral >= 2 || f.floral >= 1 && f.woody + f.musk >= 2 && f.spicy === 0) && f.floral >= f.sweet ? 'floral' :
    warmth >= freshness + 1 ? 'warm' : freshness >= warmth + 1 ? (f.spicy >= 2 ? 'spicyFresh' : 'fresh') : 'balanced'
  const profiles: Record<string, Omit<ScentGuide, 'intensity'>> = {
    dark: { character: 'Dunkel und harzig', purpose: 'Feiern und besondere Abende', timing: 'Abends, ab dem frühen Abend',
      seasonText: 'Herbst und Winter', pairing: 'Zu dunklem Strick, Leder und schweren Stoffen.',
      occasions: ['Feier', 'Date'], seasons: ['Herbst', 'Winter'], times: ['Abends'] },
    powdery: { character: 'Pudrig und elegant', purpose: 'Dinner, Dates und elegante Abende', timing: 'Ab dem Nachmittag und abends',
      seasonText: 'Herbst und Winter', pairing: 'Zu feinem Strick, Rollkragen und dunklen Tönen.',
      occasions: ['Date', 'Büro'], seasons: ['Herbst', 'Winter'], times: ['Abends'] },
    gourmand: { character: 'Süß und warm', purpose: 'Dates und gemütliche Abende', timing: 'Abends und an kalten Tagen',
      seasonText: 'Herbst und Winter', pairing: 'Zu weichem Strick und warmen Erdtönen.',
      occasions: ['Date', 'Feier'], seasons: ['Herbst', 'Winter'], times: ['Abends'] },
    floral: { character: 'Blumig-holzig und hell', purpose: 'Uni, Büro und entspannte Dates', timing: 'Tagsüber bis zum frühen Abend',
      seasonText: 'Frühling bis Herbst', pairing: 'Zu hellen Farben, Henley-Shirts und feinem Strick.',
      occasions: ['Büro', 'Date'], seasons: ['Frühling', 'Sommer', 'Herbst'], times: ['Tagsüber', 'Abends'] },
    warm: { character: 'Warm und würzig', purpose: 'Abendessen, Dates und kühle Tage', timing: 'Ab dem Nachmittag und abends',
      seasonText: 'Herbst und Winter', pairing: 'Zu Strick in Erdtönen, Wolle und Leder.',
      occasions: ['Date', 'Alltag'], seasons: ['Herbst', 'Winter'], times: ['Abends'] },
    spicyFresh: { character: 'Frisch-würzig', purpose: 'Büro, Uni und Termine am Tag', timing: 'Tagsüber',
      seasonText: 'Frühling und Sommer, auch milde Herbsttage', pairing: 'Zu Denim, hellen Basics und leichtem Strick.',
      occasions: ['Büro', 'Alltag'], seasons: ['Frühling', 'Sommer'], times: ['Tagsüber'] },
    fresh: { character: 'Frisch und sauber', purpose: 'Sport, Uni und warme Tage', timing: 'Morgens und tagsüber',
      seasonText: 'Frühling und Sommer', pairing: 'Zu hellen Basics, Baumwolle und Leinen.',
      occasions: ['Sport & Freizeit', 'Alltag'], seasons: ['Frühling', 'Sommer'], times: ['Tagsüber'] },
    balanced: { character: 'Vielseitig, fruchtig-würzig', purpose: 'Alltag, Uni und Treffen mit Freunden', timing: 'Tagsüber und am frühen Abend',
      seasonText: 'Ganzjährig, außer an heißen Sommertagen', pairing: 'Zu Henley-Shirts, Denim und schlichtem Strick.',
      occasions: ['Alltag', 'Büro'], seasons: ['Frühling', 'Herbst', 'Winter'], times: ['Tagsüber', 'Abends'] },
  }
  const intensity = ['', 'Dezent · 3–4 Sprühstöße', 'Mittel · 2–3 Sprühstöße', 'Kräftig · 2 Sprühstöße', 'Sehr kräftig · 1–2 Sprühstöße'][level]
  const guide = { ...profiles[kind], intensity }
  // Sehr kräftige Düfte gehören in die kalte Jahreszeit und nicht ins Büro.
  if (level === 4) return { ...guide, seasonText: 'Winter, an kühlen Herbstabenden', seasons: ['Herbst', 'Winter'],
    occasions: guide.occasions.filter(entry => entry !== 'Büro' && entry !== 'Sport & Freizeit').concat(guide.occasions.includes('Feier') ? [] : ['Feier']).slice(0, 2),
    times: ['Abends'], timing: 'Abends' }
  return guide
}

// Frühere Vorlagen ohne eigene Angaben des Nutzers. Solche Texte ersetzt der Duftleitfaden.
const templatePairings = new Set([
  'Zu dunklem Strick, Leder oder einem eleganten Mantel.', 'Zu hellen Basics, Leinen oder einem sportlichen Alltagslook.',
  'Zu einem schlichten Freizeitlook oder einem Hemd mit Sakko.', 'Zu frischer Baumwolle, hellen Hemden oder einem schlichten Sakko.',
])
export function scentPairing(stored: string | undefined, guide: ScentGuide) {
  if (!stored || templatePairings.has(stored)) return guide.pairing
  const kept = stored.replace(/\s*(?:,|oder|und)?\s*(?:einem|einen|einer|mit)?\s*[^,.]*\bsakko\w*/giu, '').replace(/\s*(?:,|oder|und)\s*\.$/u, '.').trim()
  return kept.length > 8 ? kept.replace(/([^.])$/u, '$1.') : guide.pairing
}
const template = (occasions: string[], seasons: string[], times: string[]) => {
  const key = [occasions, seasons, times].map(list => [...list].sort().join('+')).join('|')
  return new Set([
    'Date+Feier|Herbst+Winter|Abends', 'Alltag+Büro+Sport & Freizeit|Frühling+Sommer|Tagsüber',
    'Alltag+Büro+Date|Frühling+Herbst+Sommer+Winter|Abends+Tagsüber', 'Alltag+Büro+Date|Frühling+Herbst+Sommer|Abends+Tagsüber',
  ]).has(key)
}
/** Ersetzt Vorlagen-Tags durch die abgeleiteten Angaben. Selbst gewählte Tags bleiben erhalten. */
export function withScentGuide<T extends FragranceDraft & { tagsConfirmed?: boolean }>(fragrance: T): T & { guide: ScentGuide } {
  const guide = scentGuide(fragrance)
  const notes = scentNotes(fragrance)
  const derived = !fragrance.tagsConfirmed && template(fragrance.occasions, fragrance.seasons, fragrance.times)
  return { ...fragrance, notes, pairing: scentPairing(fragrance.pairing, guide),
    ...(derived && { occasions: guide.occasions, seasons: guide.seasons, times: guide.times }), guide }
}
