import { describe, expect, it } from 'vitest'
import { filterShifts, groupByDate, inRange, periodRange } from './period'
import type { Settings, Shift } from './types'

// Friday 31 July 2026. Fortnight anchor is Monday 27 July 2026.
const NOW = new Date(2026, 6, 31, 12, 0, 0)

const settings: Settings = {
  currency: 'USD',
  weekStartsOn: 1,
}

function shift(date: string, over: Partial<Shift> = {}): Shift {
  return {
    id: date,
    jobId: 'j',
    date,
    start: '09:00',
    end: '17:00',
    breakMinutes: 0,
    rate: 20,
    paid: false,
    createdAt: '',
    updatedAt: '',
    ...over,
  }
}

describe('periodRange - week', () => {
  it('runs Monday to Sunday around today', () => {
    const r = periodRange('week', 0, settings, NOW)
    expect(r.start).toBe('2026-07-27')
    expect(r.end).toBe('2026-08-02')
  })

  it('steps backwards and forwards a week at a time', () => {
    expect(periodRange('week', -1, settings, NOW).start).toBe('2026-07-20')
    expect(periodRange('week', 1, settings, NOW).start).toBe('2026-08-03')
  })

  it('respects a Sunday week start', () => {
    const r = periodRange('week', 0, { ...settings, weekStartsOn: 0 }, NOW)
    expect(r.start).toBe('2026-07-26')
    expect(r.end).toBe('2026-08-01')
  })
})

describe('periodRange - month', () => {
  it('covers the whole calendar month', () => {
    const r = periodRange('month', 0, settings, NOW)
    expect(r.start).toBe('2026-07-01')
    expect(r.end).toBe('2026-07-31')
  })

  it('rolls over the year boundary going back', () => {
    const jan = new Date(2026, 0, 15, 12, 0, 0)
    expect(periodRange('month', -1, settings, jan).start).toBe('2025-12-01')
    expect(periodRange('month', -1, settings, jan).end).toBe('2025-12-31')
  })
})

describe('periodRange - rolling multi-month windows', () => {
  it('makes 6M the last six months ending with this one', () => {
    const r = periodRange('sixMonths', 0, settings, NOW)
    expect(r.start).toBe('2026-02-01')
    expect(r.end).toBe('2026-07-31')
  })

  it('makes Year the last twelve months ending with this one', () => {
    const r = periodRange('year', 0, settings, NOW)
    expect(r.start).toBe('2025-08-01')
    expect(r.end).toBe('2026-07-31')
  })

  it('steps a whole window at a time, so periods tile without gap or overlap', () => {
    const current = periodRange('sixMonths', 0, settings, NOW)
    const previous = periodRange('sixMonths', -1, settings, NOW)
    expect(previous.start).toBe('2025-08-01')
    expect(previous.end).toBe('2026-01-31')
    // The day after the previous window ends is the day the current one starts.
    expect(previous.end! < current.start!).toBe(true)
    expect(new Date(previous.end! + 'T00:00:00Z').getTime() + 86400000).toBe(
      new Date(current.start! + 'T00:00:00Z').getTime(),
    )
  })

  it('handles a month-end start date without slipping a month', () => {
    const jan31 = new Date(2026, 0, 31, 12, 0, 0)
    const r = periodRange('sixMonths', 0, settings, jan31)
    expect(r.start).toBe('2025-08-01')
    expect(r.end).toBe('2026-01-31')
  })
})

describe('inRange / filterShifts', () => {
  it('includes both boundary days', () => {
    const r = periodRange('week', 0, settings, NOW)
    expect(inRange('2026-07-27', r)).toBe(true)
    expect(inRange('2026-08-02', r)).toBe(true)
    expect(inRange('2026-07-26', r)).toBe(false)
    expect(inRange('2026-08-03', r)).toBe(false)
  })

  it('treats an unbounded range as containing everything', () => {
    const unbounded = { start: null, end: null, label: '' }
    expect(inRange('1999-01-01', unbounded)).toBe(true)
  })

  it('puts each shift in exactly one of two adjacent weeks', () => {
    const shifts = [shift('2026-07-26'), shift('2026-07-27'), shift('2026-08-02'), shift('2026-08-03')]
    const thisWeek = filterShifts(shifts, periodRange('week', 0, settings, NOW))
    const nextWeek = filterShifts(shifts, periodRange('week', 1, settings, NOW))
    const prevWeek = filterShifts(shifts, periodRange('week', -1, settings, NOW))

    expect(thisWeek.map((s) => s.date)).toEqual(['2026-07-27', '2026-08-02'])
    expect(nextWeek.map((s) => s.date)).toEqual(['2026-08-03'])
    expect(prevWeek.map((s) => s.date)).toEqual(['2026-07-26'])
    expect(thisWeek.length + nextWeek.length + prevWeek.length).toBe(shifts.length)
  })
})

describe('groupByDate', () => {
  it('groups by day, newest day first, earliest shift first within a day', () => {
    const groups = groupByDate([
      shift('2026-07-30', { id: 'a', start: '14:00' }),
      shift('2026-07-31', { id: 'b', start: '09:00' }),
      shift('2026-07-30', { id: 'c', start: '08:00' }),
    ])
    expect(groups.map((g) => g.date)).toEqual(['2026-07-31', '2026-07-30'])
    expect(groups[1]!.shifts.map((s) => s.id)).toEqual(['c', 'a'])
  })
})
