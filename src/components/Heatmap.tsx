import { format, parseISO } from 'date-fns'
import { formatCents, formatHours } from '../lib/money'
import { heatmapDays, type HeatCell, type Heatmap as HeatmapData } from '../lib/heatmap'

type Props = {
  heatmap: HeatmapData
  onSelectDay: (date: string) => void
}

function cellTitle(cell: HeatCell): string {
  const day = format(parseISO(cell.date), 'EEE d MMM yyyy')
  if (cell.state === 'empty') return `${day}: no shifts`
  return `${day}: ${formatHours(cell.minutes)}, ${formatCents(cell.cents)} ${
    cell.state === 'paid' ? 'paid' : 'unpaid'
  }`
}

function Square({ cell, onSelectDay }: { cell: HeatCell; onSelectDay: (d: string) => void }) {
  if (!cell.inRange) return <span className="heat-cell heat-pad" aria-hidden="true" />

  const className = `heat-cell heat-${cell.state} heat-l${String(cell.level)}`
  if (cell.state === 'empty') {
    return <span className={className} title={cellTitle(cell)} />
  }
  return (
    <button
      type="button"
      className={className}
      title={cellTitle(cell)}
      aria-label={cellTitle(cell)}
      onClick={() => onSelectDay(cell.date)}
    />
  )
}

export default function Heatmap({ heatmap, onSelectDay }: Props) {
  if (heatmap.weeks.length === 0) return null

  if (heatmap.layout === 'row') {
    const days = heatmapDays(heatmap)
    return (
      <div className="heat heat-row">
        {days.map((cell) => (
          <div key={cell.date} className="heat-day">
            <span className="heat-day-letter">{format(parseISO(cell.date), 'EEEEE')}</span>
            <Square cell={cell} onSelectDay={onSelectDay} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="heat heat-grid-wrap">
      <div className="heat-grid">
        {heatmap.weeks.map((week) => (
          <div key={week[0]!.date} className="heat-week">
            {week.map((cell) => (
              <Square key={cell.date} cell={cell} onSelectDay={onSelectDay} />
            ))}
          </div>
        ))}
      </div>
      <div className="heat-legend">
        <span className="heat-cell heat-unpaid heat-l3" aria-hidden="true" />
        <span>Unpaid</span>
        <span className="heat-cell heat-paid heat-l3" aria-hidden="true" />
        <span>Paid</span>
      </div>
    </div>
  )
}
