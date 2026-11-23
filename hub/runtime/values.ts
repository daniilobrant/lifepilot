export const utcNow = () => new Date().toISOString()
export const dateInBerlin = (instant = new Date()) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(instant)

export function shiftDay(day: string, offset: number) {
  const date = new Date(day + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

export function mondayOf(day: string) {
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay()
  return shiftDay(day, -((weekday + 6) % 7))
}

export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const instant = new Date(value)
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value
}
export function isInstant(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}
export function bounded(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value)
}
