import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { formatCents, formatHours, parseRate } from '../lib/money'
import { earningsCents, workedMinutes } from '../lib/pay'
import { todayISO } from '../lib/period'
import { activeJobs, useStore } from '../lib/store'
import type { PaymentMethod } from '../lib/types'

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'other', label: 'Other' },
]

export default function ShiftEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const shifts = useStore((s) => s.shifts)
  const jobs = useStore((s) => s.jobs)
  const addShift = useStore((s) => s.addShift)
  const updateShift = useStore((s) => s.updateShift)
  const deleteShift = useStore((s) => s.deleteShift)

  const existing = id ? shifts.find((s) => s.id === id) : undefined
  const selectable = activeJobs(jobs)
  // An archived job still has to appear in its own shift's picker, or editing
  // that shift would silently reassign it to a different job on save.
  const jobOptions =
    existing && !selectable.some((j) => j.id === existing.jobId)
      ? [...selectable, ...jobs.filter((j) => j.id === existing.jobId)]
      : selectable
  const firstJob = jobOptions[0]

  const [date, setDate] = useState(existing?.date ?? todayISO())
  const [start, setStart] = useState(existing?.start ?? '09:00')
  const [end, setEnd] = useState(existing?.end ?? '17:00')
  const [breakMins, setBreakMins] = useState(String(existing?.breakMinutes ?? 0))
  const [jobId, setJobId] = useState(existing?.jobId ?? firstJob?.id ?? '')
  const [rate, setRate] = useState(String(existing?.rate ?? firstJob?.defaultRate ?? 0))
  const [paid, setPaid] = useState(existing?.paid ?? false)
  const [paidDate, setPaidDate] = useState(existing?.paidDate ?? todayISO())
  const [method, setMethod] = useState<PaymentMethod>(existing?.paymentMethod ?? 'bank')
  const [note, setNote] = useState(existing?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const breakValue = Math.max(0, Number.parseInt(breakMins, 10) || 0)
  const rateValue = parseRate(rate)
  const minutes = workedMinutes(start, end, breakValue)
  const cents = earningsCents(minutes, rateValue)
  const overnight = end < start

  function pickJob(nextId: string) {
    setJobId(nextId)
    const job = jobs.find((j) => j.id === nextId)
    if (job) setRate(String(job.defaultRate))
  }

  function handleSave() {
    if (!jobId) {
      setError('Add a job in Settings first.')
      return
    }
    if (minutes === 0) {
      setError('Check the times, this shift works out as zero hours.')
      return
    }
    if (rateValue <= 0) {
      setError('Enter an hourly rate above $0.')
      return
    }

    const input = {
      jobId,
      date,
      start,
      end,
      breakMinutes: breakValue,
      rate: rateValue,
      paid,
      paidDate: paid ? paidDate : undefined,
      paymentMethod: paid ? method : undefined,
      note: note.trim() || undefined,
    }

    if (existing) updateShift(existing.id, input)
    else addShift(input)
    navigate('/', { replace: true })
  }

  function handleDelete() {
    if (!existing) return
    if (!window.confirm('Delete this shift? This cannot be undone.')) return
    deleteShift(existing.id)
    navigate('/', { replace: true })
  }

  return (
    <>
      <header className="header header-edit">
        <button type="button" className="link-btn" onClick={() => navigate(-1)}>
          Cancel
        </button>
        <h1 className="header-title-sm">{existing ? 'Edit shift' : 'New shift'}</h1>
        <button type="button" className="link-btn link-btn-strong" onClick={handleSave}>
          Save
        </button>
      </header>

      <main className="main">
        <div className="live">
          <span className="live-amount">{formatCents(cents)}</span>
          <span className="live-hours">
            {formatHours(minutes)}
            {overnight ? ' · ends next day' : ''}
          </span>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="field">
          <label htmlFor="date">Date</label>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="start">Start</label>
            <input
              id="start"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="end">End</label>
            <input id="end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="break">Unpaid break (min)</label>
            <input
              id="break"
              type="number"
              inputMode="numeric"
              min="0"
              value={breakMins}
              onChange={(e) => setBreakMins(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="rate">Rate ($/hr)</label>
            <input
              id="rate"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="job">Job</label>
          <select id="job" value={jobId} onChange={(e) => pickJob(e.target.value)}>
            {jobOptions.length === 0 ? <option value="">No jobs yet</option> : null}
            {jobOptions.map((job) => (
              <option key={job.id} value={job.id}>
                {job.name}
                {job.archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="field field-inline">
          <label htmlFor="paid">Paid</label>
          <input
            id="paid"
            type="checkbox"
            className="switch"
            checked={paid}
            onChange={(e) => setPaid(e.target.checked)}
          />
        </div>

        {paid ? (
          <>
            <div className="field">
              <label htmlFor="paidDate">Date paid</label>
              <input
                id="paidDate"
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
              />
            </div>
            <div className="field">
              <span className="label">How</span>
              <div className="segmented segmented-full">
                {METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    className={m.value === method ? 'seg seg-on' : 'seg'}
                    onClick={() => setMethod(m.value)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}

        <div className="field">
          <label htmlFor="note">Note (optional)</label>
          <input
            id="note"
            type="text"
            value={note}
            placeholder="Covered for Sam"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {existing ? (
          <button type="button" className="btn btn-danger btn-wide" onClick={handleDelete}>
            Delete shift
          </button>
        ) : null}
      </main>
    </>
  )
}
