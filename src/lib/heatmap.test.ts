import { describe, expect, it } from 'vitest'
import { buildHeatmap, heatmapDays } from './heatmap'
import { periodRange } from './period'
import { NOW, SETTINGS, makeShift } from '../test/helpers'

const week = periodRange('week', 0, SETTINGS, NOW) // Mon 27 Jul – Sun 2 Aug 2026
const month = periodRange('month', 0, SETTINGS, NOW) // Jul 2026

function cell(shifts: Parameters<typeof buildHeatmap>[0], date: string) {
  return buildHeatmap(shifts, month, SETTINGS)
    .weeks.flat()
    .find((c) => c.date === date)!
}

describe('day state', () => {
  it('is empty for a day with no shifts', () => {
    const c = cell([], '2026-07-15')
    expect(c.state).toBe('empty')
    expect(c.level).toBe(0)
    expect(c.cents).toBe(0)
  })

  it('is paid when every shift that day is paid', () => {
    const c = cell([makeShift({ id: 'a', date: '2026-07-15', paid: true })], '2026-07-15')
    expect(c.state).toBe('paid')
  })

  it('is unpaid when the only shift is unpaid', () => {
    const c = cell([makeShift({ id: 'a', date: '2026-07-15', paid: false })], '2026-07-15')
    expect(c.state).toBe('unpaid')
  })

  // The whole point of the colour is "does this day still owe me money".
  it('is unpaid when a day mixes paid and unpaid shifts', () => {
    const c = cell(
      [
        makeShift({ id: 'a', date: '2026-07-15', paid: true }),
        makeShift({ id: 'b', date: '2026-07-15', paid: false, start: '18:00', end: '21:00' }),
      ],
      '2026-07-15',
    )
    expect(c.state).toBe('unpaid')
  })

  it('sums hours and earnings across a day', () => {
    const c = cell(
      [
        makeShift({ id: 'a', date: '2026-07-15', start: '09:00', end: '13:00', breakMinutes: 0 }),
        makeShift({ id: 'b', date: '2026-07-15', start: '18:00', end: '21:00', breakMinutes: 0 }),
      ],
      '2026-07-15',
    )
    expect(c.minutes).toBe(420) // 4h + 3h
    expect(c.cents).toBe(7400 + 5550) // 4h and 3h at $18.50 = $74.00 + $55.50
  })
})

describe('intensity levels', () => {
  const at = (start: string, end: string) =>
    cell(
      [makeShift({ id: 'x', date: '2026-07-15', start, end, breakMinutes: 0 })],
      '2026-07-15',
    ).level

  it('steps up with hours worked', () => {
    expect(at('09:00', '11:00')).toBe(1) // 2h
    expect(at('09:00', '14:00')).toBe(2) // 5h
    expect(at('09:00', '16:00')).toBe(3) // 7h
    expect(at('09:00', '18:00')).toBe(4) // 9h
  })

  it('puts the boundaries on the right side', () => {
    expect(at('09:00', '12:59')).toBe(1) // just under 4h
    expect(at('09:00', '13:00')).toBe(2) // exactly 4h
    expect(at('09:00', '15:00')).toBe(3) // exactly 6h
    expect(at('09:00', '17:00')).toBe(4) // exactly 8h
  })
})

describe('grid shape', () => {
  it('pads to whole weeks so every column is 7 tall', () => {
    const map = buildHeatmap([], month, SETTINGS)
    expect(map.weeks.length).toBeGreaterThan(0)
    for (const w of map.weeks) expect(w).toHaveLength(7)
  })

  it('marks padding days as out of range so they can be drawn blank', () => {
    const map = buildHeatmap([], month, SETTINGS)
    const inRangeDates = map.weeks.flat().filter((c) => c.inRange)
    expect(inRangeDates).toHaveLength(31) // July
    expect(inRangeDates[0]!.date).toBe('2026-07-01')
    expect(inRangeDates.at(-1)!.date).toBe('2026-07-31')
    // 1 July 2026 is a Wednesday, so Mon and Tue before it are padding.
    expect(map.weeks[0]![0]!.inRange).toBe(false)
  })

  it('covers a whole year without losing days', () => {
    const year = periodRange('year', 0, SETTINGS, NOW)
    const days = heatmapDays(buildHeatmap([], year, SETTINGS))
    expect(days).toHaveLength(365) // 1 Aug 2025 – 31 Jul 2026
  })

  it('lays a single week out as a row rather than a lone column', () => {
    const map = buildHeatmap([], week, SETTINGS)
    expect(map.layout).toBe('row')
    expect(heatmapDays(map)).toHaveLength(7)
  })

  it('lays a month out as a grid', () => {
    expect(buildHeatmap([], month, SETTINGS).layout).toBe('grid')
  })

  it('ignores shifts outside the range', () => {
    const map = buildHeatmap([makeShift({ id: 'a', date: '2026-06-10' })], month, SETTINGS)
    expect(map.weeks.flat().every((c) => c.state === 'empty')).toBe(true)
  })
})
