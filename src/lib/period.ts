import {
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameYear,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { Settings, Shift } from './types'

export type PeriodKind = 'week' | 'month' | 'sixMonths' | 'year'

export const PERIOD_KINDS: { kind: PeriodKind; label: string }[] = [
  { kind: 'week', label: 'Week' },
  { kind: 'month', label: 'Month' },
  { kind: 'sixMonths', label: '6M' },
  { kind: 'year', label: 'Year' },
]

export const DEFAULT_PERIOD: PeriodKind = 'month'

/**
 * A period is expressed as inclusive 'YYYY-MM-DD' bounds rather than Date objects.
 * Shift dates are stored as plain calendar strings, and ISO date strings sort
 * chronologically, so comparing them as strings sidesteps every timezone and
 * daylight-saving edge case that Date comparison would introduce.
 */
export type PeriodRange = {
  start: string | null
  end: string | null
  label: string
}

const ISO = 'yyyy-MM-dd'

export function todayISO(now: Date = new Date()): string {
  return format(now, ISO)
}

function rangeLabel(start: Date, end: Date, now: Date): string {
  const sameYear = isSameYear(start, now) && isSameYear(end, now)
  const fmt = sameYear ? 'MMM d' : 'MMM d yyyy'
  return `${format(start, fmt)} – ${format(end, fmt)}`
}

/** How many months wide each multi-month period is. */
const MONTH_SPAN: Record<'sixMonths' | 'year', number> = { sixMonths: 6, year: 12 }

/**
 * @param offset 0 = the period containing `now`, -1 = the previous one, +1 = the next.
 */
export function periodRange(
  kind: PeriodKind,
  offset: number,
  settings: Settings,
  now: Date = new Date(),
): PeriodRange {
  if (kind === 'week') {
    const base = addWeeks(now, offset)
    const start = startOfWeek(base, { weekStartsOn: settings.weekStartsOn })
    const end = endOfWeek(base, { weekStartsOn: settings.weekStartsOn })
    return { start: format(start, ISO), end: format(end, ISO), label: rangeLabel(start, end, now) }
  }

  if (kind === 'month') {
    const base = addMonths(now, offset)
    const start = startOfMonth(base)
    const end = endOfMonth(base)
    const label = isSameYear(base, now) ? format(base, 'MMMM') : format(base, 'MMMM yyyy')
    return { start: format(start, ISO), end: format(end, ISO), label }
  }

  // Rolling multi-month windows: "6M" is the last six months ending with the current
  // one, not the first or second half of a calendar year. Stepping moves by a whole
  // window, so consecutive offsets tile without overlapping or leaving a gap.
  const span = MONTH_SPAN[kind]
  const end = endOfMonth(addMonths(now, offset * span))
  const start = startOfMonth(addMonths(end, -(span - 1)))
  return { start: format(start, ISO), end: format(end, ISO), label: rangeLabel(start, end, now) }
}

export function inRange(date: string, range: PeriodRange): boolean {
  if (range.start !== null && date < range.start) return false
  if (range.end !== null && date > range.end) return false
  return true
}

export function filterShifts(shifts: Shift[], range: PeriodRange): Shift[] {
  return shifts.filter((s) => inRange(s.date, range))
}

/** Groups shifts by date, newest day first, and newest-entered first within a day. */
export function groupByDate(shifts: Shift[]): { date: string; shifts: Shift[] }[] {
  const byDate = new Map<string, Shift[]>()
  for (const shift of shifts) {
    const bucket = byDate.get(shift.date)
    if (bucket) bucket.push(shift)
    else byDate.set(shift.date, [shift])
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, group]) => ({
      date,
      shifts: group.sort((a, b) => a.start.localeCompare(b.start)),
    }))
}

export function formatDayHeading(date: string, now: Date = new Date()): string {
  const d = parseISO(date)
  const diff = differenceInCalendarDays(d, now)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  return format(d, isSameYear(d, now) ? 'EEE d MMM' : 'EEE d MMM yyyy')
}
