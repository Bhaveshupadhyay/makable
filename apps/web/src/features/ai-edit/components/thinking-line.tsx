import { type HTMLAttributes, useEffect, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { MakableIcon } from '@/shared/ui/makable-logo'
import { elapsedText } from '../lib/thinking'

type ThinkingLineProps = HTMLAttributes<HTMLParagraphElement> & {
  /** What it's doing, e.g. "Thinking…". */
  label: string
  /** When the request went out (`performance.now()`): the time counts from there. */
  since: number
  /** Said after the time, e.g. "manual edits paused". */
  hint?: string
}

/**
 * The AI at work: makable's mark being made, what it's doing (shimmering) and the time it has taken so far, e.g.
 * "Thinking… (12s · manual edits paused)". Where it doesn't fit it wraps like a sentence (the time and the hint stay
 * together), so nothing is cut off. With reduced motion only the time moves. The mark and the time are hidden from
 * screen readers, so a live region around the line announces only what it's doing.
 */
export function ThinkingLine({ label, since, hint, className, ...props }: ThinkingLineProps) {
  return (
    <p className={cn('flex min-w-0 items-start gap-2 text-xs text-muted-foreground', className)} {...props}>
      <MakingMark />
      <span className="min-w-0">
        <span className="mk-shimmer">{label}</span> <Elapsed since={since} hint={hint} />
      </span>
    </p>
  )
}

/** The mark's folds unfold one after another, left to right, over a faint copy of it, then fade in the same order. */
function MakingMark() {
  return (
    // Centred on the first line of text, whatever its size.
    <span aria-hidden className="relative mt-[calc((1lh-1rem)/2)] size-4 shrink-0">
      <MakableIcon className="absolute inset-0 size-4 opacity-20" />
      <MakableIcon className="mk-making absolute inset-0 size-4" />
    </span>
  )
}

function Elapsed({ since, hint }: { since: number; hint?: string }) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(timer)
  }, [])
  const time = elapsedText((now - since) / 1000)
  return (
    <span aria-hidden data-elapsed className="whitespace-nowrap tabular-nums">
      ({hint ? `${time} · ${hint}` : time})
    </span>
  )
}
