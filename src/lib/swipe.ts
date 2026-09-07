/**
 * Deciding whether a drag was a sideways swipe or the beginning of a vertical
 * scroll is the only genuinely tricky part of gesture handling, so it lives here
 * as a pure function that can be tested without a touchscreen.
 */

/** Minimum horizontal travel, in px, before a drag counts as a swipe at all. */
export const SWIPE_MIN_DISTANCE = 60

/**
 * How much more horizontal than vertical the drag must be. A diagonal drag on a
 * scrolling list should scroll, not change period, so horizontal has to clearly win.
 */
export const SWIPE_RATIO = 1.5

export type SwipeResult = 'previous' | 'next' | null

/**
 * @param dx pointer travel on the x axis (positive = moved right)
 * @param dy pointer travel on the y axis
 * @returns which period to move to, or null if the drag was not a swipe
 *
 * Dragging right reveals what came before, matching how paged content behaves
 * everywhere else on a phone.
 */
export function resolveSwipe(dx: number, dy: number): SwipeResult {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return null
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return null
  return dx > 0 ? 'previous' : 'next'
}

/** Applies a swipe to the current period offset. */
export function applySwipe(offset: number, swipe: SwipeResult): number {
  if (swipe === 'previous') return offset - 1
  if (swipe === 'next') return offset + 1
  return offset
}
