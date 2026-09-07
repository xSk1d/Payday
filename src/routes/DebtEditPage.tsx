import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { format, parseISO } from 'date-fns'
import { debtBalanceCents, isSettled, paidOffCents } from '../lib/debt'
import { formatCents, parseRate } from '../lib/money'
import { todayISO } from '../lib/period'
import { useStore } from '../lib/store'
import type { DebtDirection } from '../lib/types'

const DIRECTIONS: { value: DebtDirection; label: string }[] = [
  { value: 'owed_to_me', label: 'They owe me' },
  { value: 'i_owe', label: 'I owe them' },
]

/** Dollars typed by a user -> integer cents, rounded once. */
function toCents(input: string): number {
  return Math.round(parseRate(input) * 100)
}

export default function DebtEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const debts = useStore((s) => s.debts)
  const addDebt = useStore((s) => s.addDebt)
  const updateDebt = useStore((s) => s.updateDebt)
  const deleteDebt = useStore((s) => s.deleteDebt)
  const addPayment = useStore((s) => s.addPayment)
  const removePayment = useStore((s) => s.removePayment)
  const setDebtSettled = useStore((s) => s.setDebtSettled)

  const existing = id ? debts.find((d) => d.id === id) : undefined

  const [person, setPerson] = useState(existing?.person ?? '')
  const [direction, setDirection] = useState<DebtDirection>(existing?.direction ?? 'owed_to_me')
  const [amount, setAmount] = useState(
    existing ? (existing.amountCents / 100).toFixed(2) : '',
  )
  const [date, setDate] = useState(existing?.date ?? todayISO())
  const [note, setNote] = useState(existing?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(todayISO())

  const amountCents = toCents(amount)
  const balance = existing ? debtBalanceCents(existing) : amountCents
  const settled = existing ? isSettled(existing) : false

  function handleSave() {
    if (!person.trim()) {
      setError('Who is this with?')
      return
    }
    if (amountCents <= 0) {
      setError('Enter an amount above $0.')
      return
    }
    const input = { person: person.trim(), direction, amountCents, date, note: note.trim() || undefined }
    if (existing) updateDebt(existing.id, input)
    else addDebt(input)
    navigate('/debts', { replace: true })
  }

  function handleDelete() {
    if (!existing) return
    if (!window.confirm('Delete this debt? This cannot be undone.')) return
    deleteDebt(existing.id)
    navigate('/debts', { replace: true })
  }

  function handleAddPayment() {
    if (!existing) return
    const cents = toCents(payAmount)
    if (cents <= 0) {
      setError('Enter a payment above $0.')
      return
    }
    setError(null)
    addPayment(existing.id, { date: payDate, amountCents: cents })
    setPayAmount('')
  }

  /** Records a payment for exactly what is left, clearing the debt in one tap. */
  function handleSettleUp() {
    if (!existing || balance <= 0) return
    addPayment(existing.id, { date: todayISO(), amountCents: balance })
  }

  return (
    <>
      <header className="header header-edit">
        <button type="button" className="link-btn" onClick={() => navigate(-1)}>
          Cancel
        </button>
        <h1 className="header-title-sm">{existing ? 'Edit debt' : 'New debt'}</h1>
        <button type="button" className="link-btn link-btn-strong" onClick={handleSave}>
          Save
        </button>
      </header>

      <main className="main">
        <div className="live">
          <span className="live-amount">{formatCents(balance)}</span>
          <span className="live-hours">
            {settled
              ? 'Settled'
              : existing && existing.payments.length > 0
                ? `${formatCents(paidOffCents(existing))} of ${formatCents(existing.amountCents)} paid`
                : 'Outstanding'}
          </span>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="field">
          <span className="label">Direction</span>
          <div className="segmented segmented-full">
            {DIRECTIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                className={d.value === direction ? 'seg seg-on' : 'seg'}
                onClick={() => setDirection(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="person">Person</label>
          <input
            id="person"
            type="text"
            value={person}
            placeholder="Alex"
            onChange={(e) => setPerson(e.target.value)}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="amount">Amount ($)</label>
            <input
              id="amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="debtDate">Date</label>
            <input
              id="debtDate"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="debtNote">Note (optional)</label>
          <input
            id="debtNote"
            type="text"
            value={note}
            placeholder="Petrol money"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {existing ? (
          <section className="group">
            <h2 className="group-title">Payments</h2>

            {existing.payments.length === 0 ? (
              <p className="group-hint">Nothing paid back yet.</p>
            ) : (
              <ul className="payment-list">
                {existing.payments.map((p) => (
                  <li key={p.id} className="payment">
                    <span>{format(parseISO(p.date), 'd MMM yyyy')}</span>
                    <span className="payment-amount">{formatCents(p.amountCents)}</span>
                    <button
                      type="button"
                      className="link-btn link-btn-danger"
                      onClick={() => removePayment(existing.id, p.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="field-row">
              <div className="field">
                <label htmlFor="payAmount">Add payment ($)</label>
                <input
                  id="payAmount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="payDate">On</label>
                <input
                  id="payDate"
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </div>
            </div>
            <button type="button" className="btn btn-wide" onClick={handleAddPayment}>
              Record payment
            </button>

            {balance > 0 ? (
              <button type="button" className="btn btn-wide" onClick={handleSettleUp}>
                Settle up · {formatCents(balance)}
              </button>
            ) : null}

            {existing.settledAt !== undefined ? (
              <button
                type="button"
                className="btn btn-wide"
                onClick={() => setDebtSettled(existing.id, false)}
              >
                Reopen debt
              </button>
            ) : balance > 0 ? (
              <button
                type="button"
                className="btn btn-wide"
                onClick={() => setDebtSettled(existing.id, true)}
              >
                Write off without payment
              </button>
            ) : null}

            <button type="button" className="btn btn-danger btn-wide" onClick={handleDelete}>
              Delete debt
            </button>
          </section>
        ) : null}
      </main>
    </>
  )
}
