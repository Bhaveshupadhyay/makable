import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { change, formatChange, formatCount, formatDuration, formatPercent } from '../lib/format'
import { type ChartMetric, METRIC_LABELS } from '../lib/metrics'
import type { AnalyticsTotals } from '../types'

type Tile = { label: string; value: string; delta: number | null; upIsGood: boolean; metric?: ChartMetric }

/**
 * The range's headline numbers, each against the same number of days before. Visitors, page views and sessions also
 * pick what the chart below shows.
 */
export function StatTiles({
  totals,
  previous,
  days,
  metric,
  onMetric,
}: {
  totals: AnalyticsTotals
  previous: AnalyticsTotals
  days: number
  metric: ChartMetric
  onMetric: (metric: ChartMetric) => void
}) {
  const tiles: Tile[] = [
    { label: METRIC_LABELS.users, value: formatCount(totals.users), delta: change(totals.users, previous.users), upIsGood: true, metric: 'users' },
    { label: METRIC_LABELS.pageViews, value: formatCount(totals.pageViews), delta: change(totals.pageViews, previous.pageViews), upIsGood: true, metric: 'pageViews' },
    { label: METRIC_LABELS.sessions, value: formatCount(totals.sessions), delta: change(totals.sessions, previous.sessions), upIsGood: true, metric: 'sessions' },
    {
      label: 'Avg. session',
      value: formatDuration(totals.averageSessionSeconds),
      delta: change(totals.averageSessionSeconds, previous.averageSessionSeconds),
      upIsGood: true,
    },
    { label: 'Bounce rate', value: formatPercent(totals.bounceRate), delta: change(totals.bounceRate, previous.bounceRate), upIsGood: false },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => {
        const body = <TileBody tile={tile} days={days} />
        const selected = tile.metric === metric
        return tile.metric ? (
          <button
            key={tile.label}
            type="button"
            aria-pressed={selected}
            title={`Show ${tile.label.toLowerCase()} per day`}
            onClick={() => onMetric(tile.metric!)}
            className={cn(
              'rounded-xl border p-4 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
              selected && 'border-viz-series/60 bg-accent',
            )}
          >
            {body}
          </button>
        ) : (
          <div key={tile.label} className="rounded-xl border p-4">
            {body}
          </div>
        )
      })}
    </div>
  )
}

function TileBody({ tile, days }: { tile: Tile; days: number }) {
  return (
    <>
      <p className="text-xs font-medium text-muted-foreground">{tile.label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{tile.value}</p>
      <Delta delta={tile.delta} upIsGood={tile.upIsGood} days={days} />
    </>
  )
}

/** The change against the days before: an arrow and a signed percentage, green when it's good news, red when not. */
function Delta({ delta, upIsGood, days }: { delta: number | null; upIsGood: boolean; days: number }) {
  const period = `vs previous ${days} days`
  if (delta === null) return <p className="mt-1 text-xs text-muted-foreground">No visits the {days} days before</p>
  if (Math.round(delta * 100) === 0) return <p className="mt-1 text-xs text-muted-foreground">No change {period}</p>
  const up = delta > 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs">
      <span className={cn('inline-flex items-center gap-0.5 font-medium', up === upIsGood ? 'text-viz-good' : 'text-viz-bad')}>
        <Arrow className="size-3.5" aria-hidden />
        {formatChange(delta)}
      </span>
      <span className="whitespace-nowrap text-muted-foreground">{period}</span>
    </p>
  )
}
