import { Problem } from './settings.ts'

import { currencyNames } from './currency-codes.ts'
export { currencyNames, destinationCurrency } from './currency-codes.ts'

type Rate = { from: string, to: string, rate: number, date: string, source: string, fetched: string }
const cache = new Map<string, Rate>()
const code = (value: unknown) => {
  if (typeof value !== 'string' || !Object.hasOwn(currencyNames, value)) throw new Problem(400, 'Wähle eine bekannte Währung.')
  return value
}
// Nur Währungskürzel verlassen den Mac. Erst die EZB-Referenzkurse, bei fehlender Währung ein offener Tageskurs.
export async function exchangeRate(rawFrom: unknown, rawTo: unknown, refresh = false): Promise<Rate> {
  const from = code(rawFrom), to = code(rawTo)
  if (from === to) return { from, to, rate: 1, date: new Date().toISOString().slice(0, 10), source: 'identisch', fetched: new Date().toISOString() }
  const key = from + to
  const cached = cache.get(key)
  if (cached && !refresh && Date.now() - Date.parse(cached.fetched) < 6 * 3_600_000) return cached
  const sources: [string, (data: Record<string, unknown>) => { rate?: number, date?: string }][] = [
    [`https://api.frankfurter.app/latest?from=${from}&to=${to}`, data => ({ rate: Number((data.rates as Record<string, unknown> | undefined)?.[to]), date: String(data.date ?? '') })],
    [`https://open.er-api.com/v6/latest/${from}`, data => ({ rate: Number((data.rates as Record<string, unknown> | undefined)?.[to]),
      date: typeof data.time_last_update_utc === 'string' ? new Date(data.time_last_update_utc).toISOString().slice(0, 10) : '' })],
  ]
  for (const [address, read] of sources) {
    try {
      const response = await fetch(address, { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } })
      if (!response.ok) continue
      const { rate, date } = read(await response.json() as Record<string, unknown>)
      if (!rate || !Number.isFinite(rate) || rate <= 0) continue
      const result = { from, to, rate, date: date || new Date().toISOString().slice(0, 10), source: new URL(address).hostname, fetched: new Date().toISOString() }
      cache.set(key, result)
      return result
    } catch { /* Nächste Quelle versuchen. */ }
  }
  if (cached) return cached
  throw new Problem(502, 'Der Wechselkurs ist gerade nicht abrufbar. Versuche es gleich erneut.')
}
