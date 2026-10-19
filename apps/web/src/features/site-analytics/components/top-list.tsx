import { formatCount } from '../lib/format'
import type { AnalyticsCount } from '../types'

/** A ranked list (top pages, sources...) with a bar for each row's share of the largest. */
export function TopList({ title, unit, rows, format = (name) => name }: { title: string; unit: string; rows: AnalyticsCount[]; format?: (name: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <section aria-label={title} className="rounded-xl border p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No data for these days yet.</p>
      ) : (
        <ol className="space-y-2.5">
          {rows.map((row) => {
            const name = format(row.name)
            return (
              <li key={row.name} title={`${name}: ${formatCount(row.value)} ${unit.toLowerCase()}`}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{formatCount(row.value)}</span>
                </div>
                <div className="mt-1 h-1.5">
                  <div className="h-full rounded-r-[4px] bg-viz-series" style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} />
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
