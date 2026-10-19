import { Ellipsis, ExternalLink, LoaderCircle, Rocket } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { useDisconnectGoogle, useRefresh, useReport, useUnlinkStream } from '../hooks/use-analytics'
import { errorCode, errorText } from '../lib/error-text'
import { formatCount } from '../lib/format'
import { type ChartMetric, METRIC_LABELS } from '../lib/metrics'
import { REPORT_RANGES, type ReportRange, type SiteAnalyticsLink } from '../types'
import { StatTiles } from './stat-tiles'
import { TopList } from './top-list'
import { TrafficChart } from './traffic-chart'

const RANGE_DAYS: Record<ReportRange, number> = { '7d': 7, '28d': 28, '90d': 90 }
const time = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' })

/** A linked site's traffic: the range, the headline numbers, the days, and where visitors go and come from. */
export function AnalyticsDashboard({
  projectId,
  link,
  email,
  onChange,
}: {
  projectId: string
  link: SiteAnalyticsLink
  email: string | null
  /** Pick another stream. */
  onChange: () => void
}) {
  const [range, setRange] = useState<ReportRange>('28d')
  const [metric, setMetric] = useState<ChartMetric>('users')
  const [confirming, setConfirming] = useState<'unlink' | 'disconnect' | null>(null)
  const report = useReport(projectId, range, true)
  const unlink = useUnlinkStream(projectId)
  const disconnect = useDisconnectGoogle()
  const refresh = useRefresh()
  const data = report.data
  const code = errorCode(report.error)

  // Google refused the stored token (it's forgotten now): the page asks to connect again.
  useEffect(() => {
    if (code === 'google_reconnect' || code === 'google_not_connected') void refresh()
  }, [code, refresh])

  return (
    <div className="space-y-6">
      <section aria-label="Where this site reports" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {link.propertyName} <span className="text-muted-foreground">›</span> {link.streamName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[link.streamUrl, link.measurementId, email].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={onChange}>
            Change
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="More analytics options" className="size-8">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Google Analytics</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <a href={`https://analytics.google.com/analytics/web/#/p${link.propertyId}/reports/intelligenthome`} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Open in Google Analytics
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setConfirming('unlink')}>Stop analytics for this site</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setConfirming('disconnect')}>Disconnect Google</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {confirming && (
          <div role="alertdialog" aria-label="Confirm" className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/60 p-3 text-sm">
            <p>
              {confirming === 'unlink'
                ? 'Stop counting visits for this site? Google’s tag comes off with your next publish. Your data stays in Google Analytics.'
                : `Disconnect ${email ?? 'your Google account'}? makable stops reading your Analytics for every site. The tag stays on your published sites.`}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={unlink.isPending || disconnect.isPending}
                onClick={() => (confirming === 'unlink' ? unlink.mutate() : disconnect.mutate())}
              >
                {(unlink.isPending || disconnect.isPending) && <LoaderCircle className="animate-spin" />}
                {confirming === 'unlink' ? 'Stop analytics' : 'Disconnect'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      {!link.tagPublished && (
        <div role="note" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-viz-series/40 bg-viz-series/5 p-4 text-sm">
          <p>
            <span className="font-medium">Publish your site to start counting visits.</span>{' '}
            <span className="text-muted-foreground">makable adds Google’s tag to your pages when you publish. The builder’s preview is never counted.</span>
          </p>
          <Button asChild size="sm">
            <Link to="/">
              <Rocket />
              Go to Publish
            </Link>
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Days" className="inline-flex rounded-lg border p-0.5">
          {REPORT_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={range === r}
              onClick={() => setRange(r)}
              className={cn(
                'rounded-md px-3 py-1 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                range === r ? 'bg-accent font-medium' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Last {RANGE_DAYS[r]} days
            </button>
          ))}
        </div>
        {data && (
          <p className="flex items-center gap-2 text-sm">
            <span aria-hidden className={cn('size-2 rounded-full', data.activeNow > 0 ? 'bg-viz-good' : 'bg-muted-foreground/40')} />
            <span className="font-medium">{formatCount(data.activeNow)}</span>
            <span className="text-muted-foreground">on the site in the last 30 minutes</span>
          </p>
        )}
        {report.isFetching && <LoaderCircle aria-label="Updating" className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {report.isPending ? (
        <div role="status" aria-label="Loading the report" className="flex justify-center py-16">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <div role="alert" className="space-y-3 rounded-xl border p-6 text-center">
          <p className="text-sm text-destructive">{report.error ? errorText(report.error) : 'No report.'}</p>
          {code === 'analytics_access_denied' || code === 'analytics_not_found' ? (
            <Button size="sm" variant="outline" onClick={onChange}>
              Pick another stream
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => void report.refetch()}>
              Try again
            </Button>
          )}
        </div>
      ) : (
        // A new range keeps the last report on screen, dimmed, until it's in.
        <div className={cn('space-y-6 transition-opacity', report.isPlaceholderData && 'opacity-60')}>
          {report.error && (
            <p role="alert" className="text-sm text-destructive">
              {errorText(report.error)}
            </p>
          )}
          <StatTiles totals={data.totals} previous={data.previous} days={RANGE_DAYS[data.range]} metric={metric} onMetric={setMetric} />
          <section aria-label="Day by day" className="rounded-xl border p-4">
            <TrafficChart days={data.daily} metric={metric} label={METRIC_LABELS[metric]} />
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            <TopList title="Top pages" unit="Views" rows={data.topPages} />
            <TopList title="Traffic sources" unit="Sessions" rows={data.sources} />
            <TopList title="Countries" unit="Visitors" rows={data.countries} />
            <TopList title="Devices" unit="Visitors" rows={data.devices} format={capitalize} />
          </div>
          <p className="text-xs text-muted-foreground">
            From Google Analytics, updated {time.format(new Date(data.fetchedAt))}. New visits can take a few hours to show up; the last 30
            minutes are live.
          </p>
        </div>
      )}
    </div>
  )
}

function capitalize(name: string): string {
  return name ? name[0]!.toUpperCase() + name.slice(1) : name
}
