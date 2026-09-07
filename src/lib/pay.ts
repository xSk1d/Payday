import type { Shift } from './types'

/** 'HH:mm' -> minutes past midnight. */
export function toMinutes(time: string): number {
  const [h = '0', m = '0'] = time.split(':')
  const hours = Number.parseInt(h, 10)
  const mins = Number.parseInt(m, 10)
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return 0
  return hours * 60 + mins
}

/**
 * Paid minutes for a shift.
 *
 * An end time strictly earlier than the start means the shift crossed midnight,
 * so a day is added (22:00 -> 06:00 is 8 hours, not -16). An end time EQUAL to
 * the start is treated as zero, not 24 hours, because in practice that's a half-filled
 * form, and silently booking a 24-hour shift would be worse than showing zero.
 */
export function workedMinutes(
  start: string,
  end: string,
  breakMinutes: number,
): number {
  const s = toMinutes(start)
  const e = toMinutes(end)
  let span = e - s
  if (span < 0) span += 24 * 60
  const brk = Number.isFinite(breakMinutes) ? Math.max(0, breakMinutes) : 0
  return Math.max(0, span - brk)
}

export function shiftMinutes(shift: Pick<Shift, 'start' | 'end' | 'breakMinutes'>): number {
  return workedMinutes(shift.start, shift.end, shift.breakMinutes)
}

/**
 * What a shift earned, in integer cents.
 *
 * Rounded once, here, per shift. Totals are then integer sums. Summing floating
 * point dollars across a few hundred shifts drifts by cents and makes the app
 * disagree with the payslip, which defeats the point of the app.
 */
export function earningsCents(minutes: number, rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return Math.round((minutes / 60) * rate * 100)
}

export function shiftEarningsCents(
  shift: Pick<Shift, 'start' | 'end' | 'breakMinutes' | 'rate'>,
): number {
  return earningsCents(shiftMinutes(shift), shift.rate)
}

export type Totals = {
  unpaidCents: number
  paidCents: number
  totalCents: number
  minutes: number
  count: number
}

export function totals(shifts: Shift[]): Totals {
  let unpaidCents = 0
  let paidCents = 0
  let minutes = 0

  for (const shift of shifts) {
    const mins = shiftMinutes(shift)
    const cents = earningsCents(mins, shift.rate)
    minutes += mins
    if (shift.paid) paidCents += cents
    else unpaidCents += cents
  }

  return {
    unpaidCents,
    paidCents,
    totalCents: unpaidCents + paidCents,
    minutes,
    count: shifts.length,
  }
}
