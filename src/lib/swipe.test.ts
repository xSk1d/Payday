import { describe, expect, it } from 'vitest'
import { SWIPE_MIN_DISTANCE, applySwipe, resolveSwipe } from './swipe'

describe('resolveSwipe', () => {
  it('maps a clear drag right to the previous period', () => {
    expect(resolveSwipe(120, 0)).toBe('previous')
  })

  it('maps a clear drag left to the next period', () => {
    expect(resolveSwipe(-120, 0)).toBe('next')
  })

  it('ignores a drag that is too short to be deliberate', () => {
    expect(resolveSwipe(SWIPE_MIN_DISTANCE - 1, 0)).toBeNull()
    expect(resolveSwipe(0, 0)).toBeNull()
    expect(resolveSwipe(-(SWIPE_MIN_DISTANCE - 1), 0)).toBeNull()
  })

  it('accepts a drag exactly on the threshold', () => {
    expect(resolveSwipe(SWIPE_MIN_DISTANCE, 0)).toBe('previous')
  })

  // The important case: the shift list scrolls vertically, so a drag that is mostly
  // downward must scroll rather than silently jump the user to another month.
  it('ignores a mostly-vertical drag', () => {
    expect(resolveSwipe(80, 200)).toBeNull()
    expect(resolveSwipe(-80, 200)).toBeNull()
  })

  it('ignores a 45-degree diagonal, which is ambiguous', () => {
    expect(resolveSwipe(120, 120)).toBeNull()
  })

  it('accepts a long drag with a little vertical wobble', () => {
    expect(resolveSwipe(150, 40)).toBe('previous')
  })

  it('is not fooled by non-finite input', () => {
    expect(resolveSwipe(Number.NaN, 0)).toBeNull()
    expect(resolveSwipe(Number.POSITIVE_INFINITY, 0)).toBeNull()
  })
})

describe('applySwipe', () => {
  it('steps the offset in the right direction', () => {
    expect(applySwipe(0, 'previous')).toBe(-1)
    expect(applySwipe(0, 'next')).toBe(1)
    expect(applySwipe(-3, 'next')).toBe(-2)
  })

  it('leaves the offset alone when the drag was not a swipe', () => {
    expect(applySwipe(-2, null)).toBe(-2)
  })
})
