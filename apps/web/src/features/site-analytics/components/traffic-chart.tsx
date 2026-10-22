import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import { useElementSize } from '@/shared/hooks/use-element-size'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { labelIndexes, nearestIndex, niceTicks } from '../lib/chart'
import { formatCount, formatDay } from '../lib/format'
import type { ChartMetric } from '../lib/metrics'
import type { AnalyticsDay } from '../types'

const HEIGHT = 240
const PAD = { top: 12, right: 12, bottom: 28, left: 44 }

/**
 * One metric day by day: a 2px line over a light wash, on hairline gridlines. Hovering (or the arrow keys, once
 * focused) shows the day's value; the table view lists every day.
 */
export function TrafficChart({ days, metric, label }: { days: AnalyticsDay[]; metric: ChartMetric; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  const size = useElementSize(box)
  const [active, setActive] = useState<number | null>(null)
  const [table, setTable] = useState(false)

  const values = days.map((d) => d[metric])
  const n = values.length
  const ticks = niceTicks(Math.max(0, ...values))
  const top = ticks[ticks.length - 1]!
  const width = size?.width ?? 0
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1))
  const y = (v: number) => PAD.top + innerH * (1 - v / top)
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = n ? `${line}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : ''
  const total = values.reduce((a, b) => a + b, 0)
  const peak = values.indexOf(Math.max(...values))
  const summary =
    n > 0
      ? `${label} per day, ${formatDay(days[0]!.date)} to ${formatDay(days[n - 1]!.date)}: ${formatCount(total)} in all, the most (${formatCount(values[peak] ?? 0)}) on ${formatDay(days[peak]!.date)}.`
      : `${label} per day: no data.`

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setActive(nearestIndex(e.clientX - rect.left - PAD.left, innerW, n))
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const moves: Record<string, (i: number) => number> = {
      ArrowLeft: (i) => i - 1,
      ArrowRight: (i) => i + 1,
      Home: () => 0,
      End: () => n - 1,
    }
    const move = moves[e.key]
    if (!move || n === 0) return
    e.preventDefault()
    setActive((i) => Math.min(n - 1, Math.max(0, move(i ?? n - 1))))
  }

  const shown = active !== null && active < n ? active : null
  const tipLeft = shown !== null ? x(shown) : 0
  const flip = tipLeft > width - 150

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{label} per day</h3>
        <Button size="sm" variant="ghost" aria-pressed={table} onClick={() => setTable((t) => !t)}>
          {table ? 'Show chart' : 'Show table'}
        </Button>
      </div>
      {/* Always mounted, so its width is measured whichever view shows. Clipped: after a resize the chart keeps its old
          width until it's measured again. */}
      <div ref={box} className="relative overflow-hidden" style={table ? undefined : { height: HEIGHT }}>
      {table ? (
        <div className="max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 text-right font-medium">{label}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {days.map((d) => (
                <tr key={d.date} className="border-t">
                  <td className="px-3 py-1.5">{formatDay(d.date, { long: true })}</td>
                  <td className="px-3 py-1.5 text-right">{formatCount(d[metric])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {width > 0 && (
            <svg
              width={width}
              height={HEIGHT}
              role="img"
              aria-label={summary}
              tabIndex={0}
              className="touch-pan-y rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onPointerMove={onPointer}
              onPointerDown={onPointer}
              onPointerLeave={() => setActive(null)}
              onKeyDown={onKey}
              onBlur={() => setActive(null)}
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} shapeRendering="crispEdges" />
                  <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                    {formatCount(t)}
                  </text>
                </g>
              ))}
              {labelIndexes(n, Math.max(2, Math.floor(innerW / 90))).map((i) => (
                <text
                  key={i}
                  x={x(i)}
                  y={HEIGHT - 8}
                  textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'}
                  className="fill-muted-foreground text-[11px]"
                >
                  {formatDay(days[i]!.date)}
                </text>
              ))}
              <path d={area} fill="var(--viz-series)" fillOpacity={0.1} />
              <path d={line} fill="none" stroke="var(--viz-series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {shown !== null && (
                <>
                  <line x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={y(0)} stroke="var(--ring)" strokeWidth={1} shapeRendering="crispEdges" />
                  <circle cx={x(shown)} cy={y(values[shown]!)} r={4} fill="var(--viz-series)" stroke="var(--background)" strokeWidth={2} />
                </>
              )}
            </svg>
          )}
          {shown !== null && (
            <div
              role="status"
              className={cn(
                'pointer-events-none absolute top-1 z-10 min-w-32 rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md',
                flip ? '-translate-x-full' : '',
              )}
              style={{ left: flip ? tipLeft - 12 : tipLeft + 12 }}
            >
              <p className="flex items-center gap-2 text-base font-semibold">
                <span aria-hidden className="h-0.5 w-3 rounded-full bg-viz-series" />
                {formatCount(values[shown]!)}
              </p>
              <p className="text-xs text-muted-foreground">
                {label} · {formatDay(days[shown]!.date, { long: true })}
              </p>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  )
}
