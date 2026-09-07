import type { Debt, DebtDirection } from './types'

export function paidOffCents(debt: Pick<Debt, 'payments'>): number {
  return debt.payments.reduce((sum, p) => sum + p.amountCents, 0)
}

/**
 * What is still outstanding, in cents.
 *
 * Clamped at zero: overpaying a debt means it is settled, not that the other
 * person now owes you the difference. Turning an overpayment into a negative
 * balance would silently corrupt the "you're owed" total.
 */
export function debtBalanceCents(debt: Pick<Debt, 'amountCents' | 'payments'>): number {
  return Math.max(0, debt.amountCents - paidOffCents(debt))
}

/**
 * A debt is settled once its payments cover it, so a final part payment clears it
 * without needing a second, separate action. An explicit `settledAt` also counts,
 * which is how a debt gets written off without money changing hands.
 */
export function isSettled(debt: Pick<Debt, 'amountCents' | 'payments' | 'settledAt'>): boolean {
  return debt.settledAt !== undefined || debtBalanceCents(debt) === 0
}

/** 0-1, for a progress bar. A zero-amount debt counts as fully paid rather than NaN. */
export function debtProgress(debt: Pick<Debt, 'amountCents' | 'payments'>): number {
  if (debt.amountCents <= 0) return 1
  return Math.min(1, paidOffCents(debt) / debt.amountCents)
}

export type DebtTotals = {
  owedToMeCents: number
  iOweCents: number
  /** Positive means you are up overall. */
  netCents: number
  outstandingCount: number
}

/** Totals across outstanding debts only, because settled ones must not inflate the figures. */
export function debtTotals(debts: Debt[]): DebtTotals {
  let owedToMeCents = 0
  let iOweCents = 0
  let outstandingCount = 0

  for (const debt of debts) {
    if (isSettled(debt)) continue
    const balance = debtBalanceCents(debt)
    if (balance === 0) continue
    outstandingCount += 1
    if (debt.direction === 'owed_to_me') owedToMeCents += balance
    else iOweCents += balance
  }

  return {
    owedToMeCents,
    iOweCents,
    netCents: owedToMeCents - iOweCents,
    outstandingCount,
  }
}

export function outstandingDebts(debts: Debt[], direction: DebtDirection): Debt[] {
  return debts
    .filter((d) => !isSettled(d) && d.direction === direction)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function settledDebts(debts: Debt[]): Debt[] {
  return debts.filter(isSettled).sort((a, b) => (a.date < b.date ? 1 : -1))
}

export const DIRECTION_LABEL: Record<DebtDirection, string> = {
  owed_to_me: "They owe me",
  i_owe: 'I owe them',
}
