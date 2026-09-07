import { PERIOD_KINDS, type PeriodKind } from '../lib/period'

type Props = {
  kind: PeriodKind
  onKindChange: (kind: PeriodKind) => void
}

/** Just the segmented control. Moving between periods is a swipe, not a button. */
export default function PeriodFilter({ kind, onKindChange }: Props) {
  return (
    <div className="segmented" role="tablist" aria-label="Pay period">
      {PERIOD_KINDS.map((p) => (
        <button
          key={p.kind}
          type="button"
          role="tab"
          aria-selected={p.kind === kind}
          className={p.kind === kind ? 'seg seg-on' : 'seg'}
          onClick={() => onKindChange(p.kind)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
