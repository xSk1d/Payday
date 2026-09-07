import { useNavigate } from 'react-router'
import { formatCents, formatHours, formatTimeOfDay } from '../lib/money'
import { shiftEarningsCents, shiftMinutes } from '../lib/pay'
import type { PaymentMethod, Shift } from '../lib/types'

const METHOD_ICON: Record<PaymentMethod, string> = {
  cash: '💵',
  bank: '🏦',
  other: '•',
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Paid in cash',
  bank: 'Paid by bank transfer',
  other: 'Paid another way',
}

type Props = {
  shift: Shift
  jobName: string
  onTogglePaid: () => void
}

export default function ShiftRow({ shift, jobName, onTogglePaid }: Props) {
  const navigate = useNavigate()
  const minutes = shiftMinutes(shift)
  const cents = shiftEarningsCents(shift)
  const overnight = shift.end < shift.start

  return (
    <li className="shift-row">
      <button
        type="button"
        className="shift-main"
        onClick={() => navigate(`/shift/${shift.id}`)}
      >
        <span className="shift-times">
          {formatTimeOfDay(shift.start)} – {formatTimeOfDay(shift.end)}
          {overnight ? <span className="shift-overnight" title="Ends the next day">+1</span> : null}
        </span>
        <span className="shift-meta">
          {jobName} · {formatHours(minutes)}
          {shift.paid && shift.paymentMethod ? (
            <span className="shift-method" title={METHOD_LABEL[shift.paymentMethod]}>
              {' '}
              {METHOD_ICON[shift.paymentMethod]}
            </span>
          ) : null}
        </span>
        {shift.note ? <span className="shift-note">{shift.note}</span> : null}
      </button>

      <div className="shift-right">
        <span className="shift-amount">{formatCents(cents)}</span>
        <button
          type="button"
          className={shift.paid ? 'pill pill-paid' : 'pill pill-unpaid'}
          onClick={onTogglePaid}
          aria-label={
            shift.paid ? 'Mark this shift as unpaid' : 'Mark this shift as paid'
          }
        >
          {shift.paid ? 'Paid' : 'Unpaid'}
        </button>
      </div>
    </li>
  )
}
