const commonWords = new Set([
  'synthetischer', 'test', 'bitte', 'heute', 'morgen', 'diese', 'dieser', 'einen', 'einem', 'eine',
  'meine', 'meinen', 'mein', 'dass', 'oder', 'nach', 'noch', 'wird', 'soll', 'habe', 'haben', 'wollen',
  'moechte', 'mochte', 'lieber', 'jetzt', 'neue', 'neuen', 'immer', 'ich', 'mich', 'mir', 'dir', 'fur',
  'furs', 'mit', 'und', 'aus', 'von', 'bis', 'der', 'die', 'das', 'den', 'dem', 'ist', 'auf', 'bei', 'war',
  'ein', 'hat', 'zum', 'zur', 'was', 'wie', 'uhr', 'plane', 'aufgabe', 'aufgaben', 'planen', 'termin',
  'termine', 'andere', 'anderen', 'mach', 'mache', 'welche', 'kann', 'konnen', 'sind', 'steht',
])

export function searchTerms(input: string) {
  const normalized = input.toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss')
  const words = normalized.match(/[\p{L}]+/gu) ?? []
  return [...new Set(words.filter(word => word.length >= 3 && !commonWords.has(word)))].slice(0, 100)
}

function oneTypo(a: string, b: string) {
  if (Math.min(a.length, b.length) < 8 || Math.abs(a.length - b.length) > 1 || a[0] !== b[0]) return false
  if (b.length > a.length) [a, b] = [b, a]
  let index = 0
  while (index < b.length && a[index] === b[index]) index++
  if (a.length !== b.length) return a.slice(index + 1) === b.slice(index)
  if (a.slice(index + 1) === b.slice(index + 1)) return true
  return a[index] === b[index + 1] && a[index + 1] === b[index] && a.slice(index + 2) === b.slice(index + 2)
}

export function relevance(terms: readonly string[], content: string) {
  if (!terms.length || !content) return 0
  const candidates = searchTerms(content)
  let score = 0
  for (const term of terms) {
    if (candidates.includes(term)) score += 4
    else if (term.length >= 5 && candidates.some(word => word.length >= 5 && (word.includes(term) || term.includes(word)))) score += 2
    else if (candidates.some(word => oneTypo(term, word))) score += 1
  }
  return score
}
