import { describe, expect, it } from 'vitest'
import {
  debtBalanceCents,
  debtProgress,
  debtTotals,
  isSettled,
  outstandingDebts,
  paidOffCents,
  settledDebts,
} from './debt'
import { makeDebt } from '../test/helpers'

const pay = (amountCents: number, id = 'p1') => ({ id, date: '2026-07-25', amountCents })

describe('balance', () => {
  it('is the full amount before anything is repaid', () => {
    expect(debtBalanceCents(makeDebt({ amountCents: 20000 }))).toBe(20000)
  })

  it('drops by each part payment', () => {
    const debt = makeDebt({ amountCents: 20000, payments: [pay(5000), pay(2500, 'p2')] })
    expect(paidOffCents(debt)).toBe(7500)
    expect(debtBalanceCents(debt)).toBe(12500)
  })

  // Overpaying means the debt is done, not that the debt reversed direction.
  it('clamps at zero when overpaid rather than going negative', () => {
    const debt = makeDebt({ amountCents: 10000, payments: [pay(15000)] })
    expect(debtBalanceCents(debt)).toBe(0)
  })
})

describe('settled', () => {
  it('is not settled while money is outstanding', () => {
    expect(isSettled(makeDebt({ amountCents: 20000, payments: [pay(5000)] }))).toBe(false)
  })

  // A final part payment should close the debt on its own, with no second action.
  it('settles automatically once payments cover the amount', () => {
    expect(isSettled(makeDebt({ amountCents: 20000, payments: [pay(20000)] }))).toBe(true)
  })

  it('settles when written off without payment', () => {
    expect(isSettled(makeDebt({ amountCents: 20000, settledAt: '2026-07-30' }))).toBe(true)
  })
})

describe('progress', () => {
  it('tracks the fraction repaid', () => {
    expect(debtProgress(makeDebt({ amountCents: 20000, payments: [pay(5000)] }))).toBe(0.25)
  })

  it('never exceeds 1, and never divides by zero', () => {
    expect(debtProgress(makeDebt({ amountCents: 10000, payments: [pay(50000)] }))).toBe(1)
    expect(debtProgress(makeDebt({ amountCents: 0 }))).toBe(1)
  })
})

describe('totals', () => {
  it('splits the two directions and nets them off', () => {
    const t = debtTotals([
      makeDebt({ id: 'a', direction: 'owed_to_me', amountCents: 20000 }),
      makeDebt({ id: 'b', direction: 'owed_to_me', amountCents: 5000, payments: [pay(1000)] }),
      makeDebt({ id: 'c', direction: 'i_owe', amountCents: 7000 }),
    ])
    expect(t.owedToMeCents).toBe(20000 + 4000)
    expect(t.iOweCents).toBe(7000)
    expect(t.netCents).toBe(17000)
    expect(t.outstandingCount).toBe(3)
  })

  it('goes negative when you owe more than you are owed', () => {
    const t = debtTotals([makeDebt({ direction: 'i_owe', amountCents: 9000 })])
    expect(t.netCents).toBe(-9000)
  })

  // Settled debts staying in the totals would be the obvious way to get this wrong.
  it('excludes settled and fully-repaid debts', () => {
    const t = debtTotals([
      makeDebt({ id: 'a', amountCents: 20000, payments: [pay(20000)] }),
      makeDebt({ id: 'b', amountCents: 5000, settledAt: '2026-07-30' }),
    ])
    expect(t.owedToMeCents).toBe(0)
    expect(t.outstandingCount).toBe(0)
  })

  it('is empty-safe', () => {
    expect(debtTotals([])).toEqual({
      owedToMeCents: 0,
      iOweCents: 0,
      netCents: 0,
      outstandingCount: 0,
    })
  })
})

describe('grouping', () => {
  const debts = [
    makeDebt({ id: 'a', direction: 'owed_to_me', date: '2026-07-01' }),
    makeDebt({ id: 'b', direction: 'owed_to_me', date: '2026-07-20' }),
    makeDebt({ id: 'c', direction: 'i_owe' }),
    makeDebt({ id: 'd', direction: 'owed_to_me', settledAt: '2026-07-28' }),
  ]

  it('lists outstanding debts by direction, newest first', () => {
    expect(outstandingDebts(debts, 'owed_to_me').map((d) => d.id)).toEqual(['b', 'a'])
    expect(outstandingDebts(debts, 'i_owe').map((d) => d.id)).toEqual(['c'])
  })

  it('keeps settled debts in their own group rather than dropping them', () => {
    expect(settledDebts(debts).map((d) => d.id)).toEqual(['d'])
  })
})
