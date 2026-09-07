import { describe, expect, it } from 'vitest'
import { earningsCents, shiftEarningsCents, totals, workedMinutes } from './pay'
import type { Shift } from './types'

function shift(over: Partial<Shift> = {}): Shift {
  return {
    id: 'x',
    jobId: 'j',
    date: '2026-07-31',
    start: '09:00',
    end: '17:30',
    breakMinutes: 30,
    rate: 18,
    paid: false,
    createdAt: '',
    updatedAt: '',
    ...over,
  }
}

describe('workedMinutes', () => {
  it('subtracts the unpaid break from a normal shift', () => {
    expect(workedMinutes('09:00', '17:30', 30)).toBe(480) // 8h
  })

  it('handles a shift that crosses midnight', () => {
    expect(workedMinutes('22:00', '06:00', 0)).toBe(480)
  })

  it('handles crossing midnight with a break', () => {
    expect(workedMinutes('23:15', '07:45', 45)).toBe(465) // 8h30 - 45m
  })

  it('treats an end equal to the start as zero, not 24 hours', () => {
    expect(workedMinutes('09:00', '09:00', 0)).toBe(0)
  })

  it('never returns negative minutes when the break exceeds the shift', () => {
    expect(workedMinutes('09:00', '10:00', 120)).toBe(0)
  })

  it('ignores a negative break', () => {
    expect(workedMinutes('09:00', '17:00', -60)).toBe(480)
  })

  it('survives malformed times instead of producing NaN', () => {
    expect(workedMinutes('', '', 0)).toBe(0)
    expect(Number.isNaN(workedMinutes('abc', '17:00', 0))).toBe(false)
  })
})

describe('earningsCents', () => {
  it('computes a whole-dollar case exactly', () => {
    expect(earningsCents(480, 18)).toBe(14400) // 8h x $18 = $144.00
  })

  it('rounds a fractional rate to the nearest cent', () => {
    // 7h25m at $17.37: 445 x 17.37 / 60 = $128.8275 -> 12882.75c -> 12883c
    expect(earningsCents(445, 17.37)).toBe(12883)
  })

  it('rounds a half-cent up rather than truncating it', () => {
    // 30m at $10.01 = $5.005 -> 500.5c -> 501c
    expect(earningsCents(30, 10.01)).toBe(501)
  })

  it('is zero for a zero or missing rate', () => {
    expect(earningsCents(480, 0)).toBe(0)
    expect(earningsCents(480, Number.NaN)).toBe(0)
  })

  it('reads the rate off the shift, not off the job', () => {
    expect(shiftEarningsCents(shift({ rate: 25 }))).toBe(20000) // 8h x $25
  })
})

describe('totals', () => {
  it('splits paid from unpaid and sums hours', () => {
    const result = totals([
      shift({ id: 'a', paid: false }),
      shift({ id: 'b', paid: true }),
      shift({ id: 'c', paid: false, rate: 20 }),
    ])
    expect(result.unpaidCents).toBe(14400 + 16000)
    expect(result.paidCents).toBe(14400)
    expect(result.totalCents).toBe(44800)
    expect(result.minutes).toBe(1440)
    expect(result.count).toBe(3)
  })

  it('is empty-safe', () => {
    expect(totals([])).toEqual({
      unpaidCents: 0,
      paidCents: 0,
      totalCents: 0,
      minutes: 0,
      count: 0,
    })
  })

  it('does not drift when summing many awkward shifts', () => {
    // The reason money is held as integer cents: adding 0.1-style floats 200 times
    // accumulates error. Each shift rounds once, then the sum is pure integers.
    const many = Array.from({ length: 200 }, (_, i) =>
      shift({ id: String(i), start: '09:00', end: '16:20', breakMinutes: 0, rate: 17.33 }),
    )
    const perShift = earningsCents(440, 17.33) // 7h20m
    expect(totals(many).unpaidCents).toBe(perShift * 200)
    expect(Number.isInteger(totals(many).unpaidCents)).toBe(true)
  })
})
