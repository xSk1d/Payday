import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import Heatmap from '../components/Heatmap'
import PeriodFilter from '../components/PeriodFilter'
import ShiftRow from '../components/ShiftRow'
import SummaryCards, { type PaidFilter } from '../components/SummaryCards'
import { buildHeatmap } from '../lib/heatmap'
import { formatCents } from '../lib/money'
import { totals } from '../lib/pay'
import {
  DEFAULT_PERIOD,
  filterShifts,
  formatDayHeading,
  groupByDate,
  periodRange,
  todayISO,
  type PeriodKind,
} from '../lib/period'
import { activeJobs, jobName, useStore } from '../lib/store'
import { applySwipe, resolveSwipe } from '../lib/swipe'

export default function ShiftsPage() {
  const shifts = useStore((s) => s.shifts)
  const jobs = useStore((s) => s.jobs)
  const settings = useStore((s) => s.settings)
  const togglePaid = useStore((s) => s.togglePaid)
  const markPaid = useStore((s) => s.markPaid)

  const [kind, setKind] = useState<PeriodKind>(DEFAULT_PERIOD)
  const [offset, setOffset] = useState(0)
  const [filter, setFilter] = useState<PaidFilter>(null)

  const range = useMemo(() => periodRange(kind, offset, settings), [kind, offset, settings])
  const inPeriod = useMemo(() => filterShifts(shifts, range), [shifts, range])
  const summary = useMemo(() => totals(inPeriod), [inPeriod])
  const heatmap = useMemo(
    () => buildHeatmap(shifts, range, settings),
    [shifts, range, settings],
  )

  const visible = useMemo(
    () =>
      filter === null ? inPeriod : inPeriod.filter((s) => (filter === 'paid' ? s.paid : !s.paid)),
    [inPeriod, filter],
  )
  const groups = useMemo(() => groupByDate(visible), [visible])

  const unpaid = inPeriod.filter((s) => !s.paid)
  const needsRate = activeJobs(jobs).every((j) => j.defaultRate <= 0)

  function changeKind(next: PeriodKind) {
    setKind(next)
    setOffset(0) // a "3 periods back" offset is meaningless once the unit changes
  }

  // --- swipe between periods -------------------------------------------------
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    dragStart.current = { x: e.clientX, y: e.clientY }
  }

  function onPointerUp(e: React.PointerEvent) {
    const start = dragStart.current
    dragStart.current = null
    if (!start) return
    const swipe = resolveSwipe(e.clientX - start.x, e.clientY - start.y)
    if (swipe) setOffset((o) => applySwipe(o, swipe))
  }

  // Keyboard equivalent, so the period is still reachable in a desktop browser
  // where there is nothing to swipe.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      if (e.key === 'ArrowLeft') setOffset((o) => o - 1)
      if (e.key === 'ArrowRight') setOffset((o) => o + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function handleSelectDay(date: string) {
    document.getElementById(`day-${date}`)?.scrollIntoView({ block: 'center' })
  }

  function handleMarkAllPaid() {
    const ok = window.confirm(
      `Mark ${String(unpaid.length)} shift${unpaid.length === 1 ? '' : 's'} as paid?\n\n` +
        `${range.label} · ${formatCents(summary.unpaidCents)}`,
    )
    if (!ok) return
    markPaid(
      unpaid.map((s) => s.id),
      todayISO(),
    )
  }

  return (
    <>
      <header className="header">
        <h1 className="header-title">Payday</h1>
        <PeriodFilter kind={kind} onKindChange={changeKind} />
      </header>

      <main className="main" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        {/* Only shown once you have swiped away from now, otherwise there is no
            way to tell which week the totals below belong to. */}
        {offset !== 0 ? (
          <button type="button" className="offperiod" onClick={() => setOffset(0)}>
            {range.label} <span className="offperiod-back">· back to now</span>
          </button>
        ) : null}

        {needsRate ? (
          <Link to="/settings" className="banner">
            <strong>Set your hourly rate</strong>
            <span>New shifts will earn $0.00 until you do.</span>
          </Link>
        ) : null}

        <Heatmap heatmap={heatmap} onSelectDay={handleSelectDay} />

        <SummaryCards totals={summary} filter={filter} onFilterChange={setFilter} />

        {unpaid.length > 0 ? (
          <button type="button" className="btn btn-wide" onClick={handleMarkAllPaid}>
            Mark {unpaid.length} shift{unpaid.length === 1 ? '' : 's'} paid ·{' '}
            {formatCents(summary.unpaidCents)}
          </button>
        ) : null}

        {groups.length === 0 ? (
          <div className="empty">
            <p className="empty-title">
              {shifts.length === 0
                ? 'No shifts yet'
                : filter !== null
                  ? `No ${filter} shifts here`
                  : 'Nothing in this period'}
            </p>
            <p className="empty-sub">
              {shifts.length === 0
                ? 'Tap + to log your first shift.'
                : filter !== null
                  ? 'Tap the card again to show everything.'
                  : 'Swipe sideways to change period.'}
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.date} id={`day-${group.date}`} className="day">
              <h2 className="day-heading">{formatDayHeading(group.date)}</h2>
              <ul className="shift-list">
                {group.shifts.map((shift) => (
                  <ShiftRow
                    key={shift.id}
                    shift={shift}
                    jobName={jobName(jobs, shift.jobId)}
                    onTogglePaid={() => togglePaid(shift.id)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      <Link to="/shift/new" className="fab" aria-label="Add a shift">
        +
      </Link>
    </>
  )
}
