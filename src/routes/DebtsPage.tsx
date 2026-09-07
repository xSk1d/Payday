import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  DIRECTION_LABEL,
  debtBalanceCents,
  debtProgress,
  debtTotals,
  outstandingDebts,
  settledDebts,
} from '../lib/debt'
import { formatCents } from '../lib/money'
import { useStore } from '../lib/store'
import type { Debt } from '../lib/types'

function DebtRow({ debt, onOpen }: { debt: Debt; onOpen: () => void }) {
  const balance = debtBalanceCents(debt)
  const progress = debtProgress(debt)
  const partPaid = debt.payments.length > 0 && balance > 0

  return (
    <li className="debt-row">
      <button type="button" className="debt-main" onClick={onOpen}>
        <span className="debt-top">
          <span className="debt-person">{debt.person || 'Someone'}</span>
          <span className="debt-amount">{formatCents(balance)}</span>
        </span>
        {debt.note ? <span className="debt-note">{debt.note}</span> : null}
        {partPaid ? (
          <>
            <span className="debt-progress" aria-hidden="true">
              <span className="debt-progress-fill" style={{ width: `${String(progress * 100)}%` }} />
            </span>
            <span className="debt-sub">
              {formatCents(debt.amountCents - balance)} of {formatCents(debt.amountCents)} paid
            </span>
          </>
        ) : null}
      </button>
    </li>
  )
}

export default function DebtsPage() {
  const debts = useStore((s) => s.debts)
  const navigate = useNavigate()

  const totals = useMemo(() => debtTotals(debts), [debts])
  const theyOwe = useMemo(() => outstandingDebts(debts, 'owed_to_me'), [debts])
  const iOwe = useMemo(() => outstandingDebts(debts, 'i_owe'), [debts])
  const settled = useMemo(() => settledDebts(debts), [debts])

  return (
    <>
      <header className="header">
        <h1 className="header-title">Debts</h1>
      </header>

      <main className="main">
        <div className="summary">
          <div className="summary-row">
            <div className="card card-static">
              <span className="card-label">You're owed</span>
              <span className="card-value card-value-sm card-value-paid">
                {formatCents(totals.owedToMeCents)}
              </span>
            </div>
            <div className="card card-static">
              <span className="card-label">You owe</span>
              <span className="card-value card-value-sm card-value-owe">
                {formatCents(totals.iOweCents)}
              </span>
            </div>
          </div>
          <p className="net">
            Net{' '}
            <strong className={totals.netCents < 0 ? 'net-down' : 'net-up'}>
              {formatCents(totals.netCents)}
            </strong>
          </p>
        </div>

        {debts.length === 0 ? (
          <div className="empty">
            <p className="empty-title">No debts tracked</p>
            <p className="empty-sub">Tap + to record money you lent or borrowed.</p>
          </div>
        ) : null}

        {theyOwe.length > 0 ? (
          <section className="day">
            <h2 className="day-heading">{DIRECTION_LABEL.owed_to_me}</h2>
            <ul className="shift-list">
              {theyOwe.map((debt) => (
                <DebtRow key={debt.id} debt={debt} onOpen={() => navigate(`/debt/${debt.id}`)} />
              ))}
            </ul>
          </section>
        ) : null}

        {iOwe.length > 0 ? (
          <section className="day">
            <h2 className="day-heading">{DIRECTION_LABEL.i_owe}</h2>
            <ul className="shift-list">
              {iOwe.map((debt) => (
                <DebtRow key={debt.id} debt={debt} onOpen={() => navigate(`/debt/${debt.id}`)} />
              ))}
            </ul>
          </section>
        ) : null}

        {settled.length > 0 ? (
          <section className="day">
            <h2 className="day-heading">Settled</h2>
            <ul className="shift-list settled-list">
              {settled.map((debt) => (
                <DebtRow key={debt.id} debt={debt} onOpen={() => navigate(`/debt/${debt.id}`)} />
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <Link to="/debt/new" className="fab" aria-label="Add a debt">
        +
      </Link>
    </>
  )
}
