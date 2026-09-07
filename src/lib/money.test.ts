import { describe, expect, it } from 'vitest'
import { decimalHours, formatCents, formatHours, formatTimeOfDay, parseRate } from './money'

describe('formatTimeOfDay', () => {
  it('shows morning times with AM', () => {
    expect(formatTimeOfDay('09:00')).toBe('9:00 AM')
    expect(formatTimeOfDay('06:05')).toBe('6:05 AM')
    expect(formatTimeOfDay('11:59')).toBe('11:59 AM')
  })

  it('shows afternoon and evening times with PM', () => {
    expect(formatTimeOfDay('13:00')).toBe('1:00 PM')
    expect(formatTimeOfDay('17:30')).toBe('5:30 PM')
    expect(formatTimeOfDay('23:59')).toBe('11:59 PM')
  })

  it('gets the two times that trip up 12-hour clocks right', () => {
    expect(formatTimeOfDay('00:00')).toBe('12:00 AM') // midnight, not 0:00
    expect(formatTimeOfDay('12:00')).toBe('12:00 PM') // noon, not 0:00 PM
    expect(formatTimeOfDay('00:30')).toBe('12:30 AM')
    expect(formatTimeOfDay('12:30')).toBe('12:30 PM')
  })

  it('keeps the leading zero on minutes', () => {
    expect(formatTimeOfDay('14:05')).toBe('2:05 PM')
  })

  it('returns the input unchanged rather than rendering NaN', () => {
    expect(formatTimeOfDay('')).toBe('')
    expect(formatTimeOfDay('nonsense')).toBe('nonsense')
  })
})

describe('formatCents', () => {
  it('formats as US dollars', () => {
    expect(formatCents(14400)).toBe('$144.00')
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(5)).toBe('$0.05')
    expect(formatCents(123456789)).toBe('$1,234,567.89')
  })
})

describe('parseRate', () => {
  it('reads a typed rate', () => {
    expect(parseRate('18.50')).toBe(18.5)
    expect(parseRate('$18.50')).toBe(18.5)
  })

  it('falls back to zero rather than NaN', () => {
    expect(parseRate('')).toBe(0)
    expect(parseRate('abc')).toBe(0)
    expect(parseRate('-5')).toBe(5) // the minus is stripped, not negated
  })
})

describe('duration formatting', () => {
  it('reads naturally', () => {
    expect(formatHours(480)).toBe('8h')
    expect(formatHours(510)).toBe('8h 30m')
    expect(formatHours(45)).toBe('45m')
    expect(formatHours(0)).toBe('0m')
  })

  it('gives decimal hours for totals', () => {
    expect(decimalHours(1200)).toBe('20')
    expect(decimalHours(510)).toBe('8.5')
    expect(decimalHours(445)).toBe('7.42')
  })
})
