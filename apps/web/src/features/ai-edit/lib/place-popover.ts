export type Box = { x: number; y: number; width: number; height: number }

/** Space the popover keeps from the element and from the edges of the preview. */
const GAP = 8
const MAX_WIDTH = 360
/** Roughly the popover's height (label + one-line input). Used to choose a side and keep it in view. */
export const POPOVER_HEIGHT = 112

export type Placement = { left: number; width: number; side: 'below' | 'above'; top?: number; bottom?: number }

/**
 * Where to put the prompt popover for an element (`anchor`, in the overlay's coordinates) inside
 * a `bounds`-sized overlay. Below the element if it fits (or fits better), otherwise above, and
 * always inside the overlay, even when the element is scrolled partly out of view or fills it.
 * Above is expressed as `bottom`, so the popover's real height never needs measuring.
 */
export function placePopover(anchor: Box, bounds: { width: number; height: number }): Placement {
  const width = Math.max(0, Math.min(MAX_WIDTH, bounds.width - 2 * GAP))
  const left = clamp(anchor.x, GAP, bounds.width - width - GAP)
  const below = anchor.y + anchor.height + GAP
  const spaceBelow = bounds.height - below
  const spaceAbove = anchor.y - GAP
  // An element filling the preview leaves no room either side: overlap its visible part, at the bottom.
  const fitsNeither = spaceBelow < POPOVER_HEIGHT && spaceAbove < POPOVER_HEIGHT
  if (fitsNeither || spaceBelow >= POPOVER_HEIGHT || spaceBelow >= spaceAbove) {
    return { left, width, side: 'below', top: clamp(below, GAP, bounds.height - POPOVER_HEIGHT - GAP) }
  }
  const bottom = bounds.height - anchor.y + GAP
  return { left, width, side: 'above', bottom: clamp(bottom, GAP, bounds.height - POPOVER_HEIGHT - GAP) }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)))
