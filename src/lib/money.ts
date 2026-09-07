const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const usdWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** Money is carried around as integer cents everywhere. Format only at the edge. */
export function formatCents(cents: number): string {
  return usd.format(cents / 100)
}

/** For big headline numbers where the cents are noise. */
export function formatCentsShort(cents: number): string {
  return cents % 100 === 0 ? usdWhole.format(cents / 100) : usd.format(cents / 100)
}

/** Parses a user-typed rate like "18.50" into a number of dollars.
 *  Returns 0 for anything unparseable so the UI never shows NaN. */
export function parseRate(input: string): number {
  const n = Number.parseFloat(input.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * 'HH:mm' -> '9:00 AM'. Times are stored in 24-hour form because that sorts and
 * compares correctly; this is display only.
 */
export function formatTimeOfDay(time: string): string {
  const [rawH = '', rawM = ''] = time.split(':')
  const h = Number.parseInt(rawH, 10)
  const m = Number.parseInt(rawM, 10)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time
  const period = h < 12 ? 'AM' : 'PM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${String(hour12)}:${String(m).padStart(2, '0')} ${period}`
}

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Decimal hours, for showing "7.5 h" style totals. */
export function decimalHours(minutes: number): string {
  return (Math.round((minutes / 60) * 100) / 100).toString()
}
