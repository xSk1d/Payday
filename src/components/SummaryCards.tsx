import { decimalHours, formatCents } from '../lib/money'
import type { Totals } from '../lib/pay'

/** Which paid state the list is narrowed to, or null for everything. */
export type PaidFilter = 'unpaid' | 'paid' | null

type Props = {
  totals: Totals
  filter: PaidFilter
  onFilterChange: (filter: PaidFilter) => void
}

/**
 * Unpaid gets the hero treatment because "what am I still owed?" is the question
 * this app exists to answer. The cards double as the list filter.
 *
 * The figures always describe the whole period, never the filtered subset. They
 * are what you are filtering *by*, so they must not move when tapped.
 */
export default function SummaryCards({ totals, filter, onFilterChange }: Props) {
  function toggle(next: Exclude<PaidFilter, null>) {
    onFilterChange(filter === next ? null : next)
  }

  return (
    <div className="summary">
      <button
        type="button"
        className={filter === 'unpaid' ? 'card card-hero card-on' : 'card card-hero'}
        aria-pressed={filter === 'unpaid'}
        onClick={() => toggle('unpaid')}
      >
        <span className="card-label">Unpaid{filter === 'unpaid' ? ' · filtering' : ''}</span>
        <span className="card-value">{formatCents(totals.unpaidCents)}</span>
      </button>

      <div className="summary-row">
        <button
          type="button"
          className={filter === 'paid' ? 'card card-on' : 'card'}
          aria-pressed={filter === 'paid'}
          onClick={() => toggle('paid')}
        >
          <span className="card-label">Paid{filter === 'paid' ? ' · filtering' : ''}</span>
          <span className="card-value card-value-sm card-value-paid">
            {formatCents(totals.paidCents)}
          </span>
        </button>

        <div className="card card-static">
          <span className="card-label">Hours</span>
          <span className="card-value card-value-sm">{decimalHours(totals.minutes)}</span>
        </div>
      </div>
    </div>
  )
}
