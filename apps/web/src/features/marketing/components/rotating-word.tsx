import { useEffect, useRef, useState } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * One of `words`, swapped with a slide-and-fade when `index` changes. The slot's width eases to the new word's,
 * so the text around it glides instead of jumping. Words are measured in a hidden copy that never remounts.
 */
export function RotatingWord({ words, index, className }: { words: string[]; index: number; className?: string }) {
  const sizers = useRef<(HTMLSpanElement | null)[]>([])
  const [widths, setWidths] = useState<number[]>([])
  const [shown, setShown] = useState({ index, prev: -1, turn: 0 })

  // Adjust state during render (not in an effect): remember which word is leaving.
  if (shown.index !== index) setShown({ index, prev: shown.index, turn: shown.turn + 1 })

  useEffect(() => {
    const observer = new ResizeObserver(() => setWidths(sizers.current.map((el) => el?.getBoundingClientRect().width ?? 0)))
    for (const el of sizers.current) if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [words])

  const width = widths[index]
  return (
    <span
      className="relative inline-grid grid-cols-[minmax(0,1fr)] justify-items-start whitespace-nowrap align-bottom transition-[width] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      style={width ? { width } : undefined}
    >
      <span aria-hidden className="pointer-events-none invisible absolute top-0 left-0">
        {words.map((word, i) => (
          <span
            key={word}
            ref={(el) => {
              sizers.current[i] = el
            }}
            className={cn('absolute top-0 left-0', className)}
          >
            {word}
          </span>
        ))}
      </span>
      {words.map((word, i) =>
        i === shown.index || i === shown.prev ? (
          <span
            key={`${word}-${shown.turn}`}
            className={cn(
              // Room below the line box: a gradient (bg-clip-text) is painted only inside the box, so descenders would be cut.
              '-my-[0.15em] py-[0.15em] [grid-area:1/1]',
              shown.prev >= 0 && (i === shown.index ? 'mk-word-in' : 'mk-word-out'),
              className,
            )}
          >
            {word}
          </span>
        ) : null,
      )}
    </span>
  )
}
