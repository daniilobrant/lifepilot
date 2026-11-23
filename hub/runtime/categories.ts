export const categoryLabels = { work: 'Arbeit', university: 'Uni', leisure: 'Freizeit' } as const
export type Category = keyof typeof categoryLabels

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && Object.hasOwn(categoryLabels, value)
}

export function explicitCategory(text: string): Category | null {
  const area=/\b(?:unter|im bereich)\s+(uni|arbeit|privat)\b/iu.exec(text)?.[1]?.toLowerCase()
  if(area)return area==='uni'?'university':area==='arbeit'?'work':'leisure'
  const match = /^(?:(?:kategorie|das ist|das gehört zu)[: ]+)?(arbeit|uni|freizeit)[.!]?$/iu.exec(text.trim())
  return match ? Object.entries(categoryLabels).find(([, label]) => label.toLowerCase() === match[1]!.toLowerCase())?.[0] as Category ?? null : null
}

export function suggestCategory(title: string, detail: string): Category | null {
  const text = title + ' ' + detail
  const hits: Category[] = []
  if (/\b(?:uni|universität|hochschule|vorlesung|seminar|klausur|bachelorarbeit|bachelorseminar|campus|modul|prüfung|studium)\b/iu.test(text)) hits.push('university')
  if (/\b(?:arbeit|büro|job|dienst|schicht|kundentermin|kunde|kundin|beruf|teammeeting)\b/iu.test(text)) hits.push('work')
  if (/\b(?:freizeit|volleyball|gym|fitness|freunde|kino|urlaub|geburtstagsfeier)\b/iu.test(text)) hits.push('leisure')
  return hits.length === 1 ? hits[0]! : null
}
