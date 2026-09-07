import { eachDayOfInterval, endOfWeek, format, parseISO, startOfWeek } from 'date-fns'
import { earningsCents, shiftMinutes } from './pay'
import type { PeriodRange } from './period'
import type { Settings, Shift } from './types'

export type HeatState = 'empty' | 'paid' | 'unpaid'

/** 0 means no shifts that day; 1-4 are contribution-graph style intensity steps. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4

export type HeatCell = {
  /** 'YYYY-MM-DD' */
  date: string
  /** False for days added only to square off the grid's first and last columns. */
  inRange: boolean
  minutes: number
  cents: number
  state: HeatState
  level: HeatLevel
}

export type Heatmap = {
  /** Full weeks, each exactly 7 cells, ordered oldest first. Columns in the grid. */
  weeks: HeatCell[][]
  /** A week is a single column, which reads badly, so lay those out as one row instead. */
  layout: 'row' | 'grid'
}

const ISO = 'yyyy-MM-dd'

/** Hour thresholds for the four intensity steps. */
function levelFor(minutes: number): HeatLevel {
  if (minutes <= 0) return 0
  if (minutes < 240) return 1 // under 4h
  if (minutes < 360) return 2 // 4-6h
  if (minutes < 480) return 3 // 6-8h
  return 4 // a full day or more
}

export function buildHeatmap(
  shifts: Shift[],
  range: PeriodRange,
  settings: Settings,
): Heatmap {
  if (range.start === null || range.end === null) return { weeks: [], layout: 'grid' }

  const rangeStart = parseISO(range.start)
  const rangeEnd = parseISO(range.end)

  // Totals per day, computed once rather than re-scanning the shift list per cell.
  const byDate = new Map<string, { minutes: number; cents: number; anyUnpaid: boolean }>()
  for (const shift of shifts) {
    if (shift.date < range.start || shift.date > range.end) continue
    const minutes = shiftMinutes(shift)
    const entry = byDate.get(shift.date) ?? { minutes: 0, cents: 0, anyUnpaid: false }
    entry.minutes += minutes
    entry.cents += earningsCents(minutes, shift.rate)
    // A day with any unpaid shift reads as unpaid: money is still owed for it.
    if (!shift.paid) entry.anyUnpaid = true
    byDate.set(shift.date, entry)
  }

  const days =
    // Pad out to whole weeks so every grid column is 7 tall and the weekday rows line up.
    eachDayOfInterval({
      start: startOfWeek(rangeStart, { weekStartsOn: settings.weekStartsOn }),
      end: endOfWeek(rangeEnd, { weekStartsOn: settings.weekStartsOn }),
    })

  const cells: HeatCell[] = days.map((day) => {
    const date = format(day, ISO)
    const inRange = date >= range.start! && date <= range.end!
    const entry = inRange ? byDate.get(date) : undefined
    const minutes = entry?.minutes ?? 0
    return {
      date,
      inRange,
      minutes,
      cents: entry?.cents ?? 0,
      state: entry === undefined ? 'empty' : entry.anyUnpaid ? 'unpaid' : 'paid',
      level: levelFor(minutes),
    }
  })

  const weeks: HeatCell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return { weeks, layout: weeks.length <= 2 ? 'row' : 'grid' }
}

/** The in-range cells only, chronological. This is what the row layout renders. */
export function heatmapDays(heatmap: Heatmap): HeatCell[] {
  return heatmap.weeks.flat().filter((c) => c.inRange)
}
