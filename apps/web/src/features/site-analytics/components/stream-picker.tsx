import { ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/shared/ui/button'
import { useLinkStream, useProperties, useRefresh, useStreams } from '../hooks/use-analytics'
import { errorCode, errorText } from '../lib/error-text'
import type { SiteAnalyticsLink } from '../types'

/**
 * Picks the GA4 property and web stream the site reports to: the user's properties (grouped by account), then the
 * chosen property's web streams. The backend checks the pick with Google before it links it.
 */
export function StreamPicker({
  projectId,
  email,
  createUrl,
  current,
  onDone,
}: {
  projectId: string
  email: string | null
  createUrl: string
  current: SiteAnalyticsLink | null
  /** Called after linking, or to go back without changing anything (only offered when there's a current link). */
  onDone?: () => void
}) {
  const properties = useProperties(true)
  const [propertyId, setPropertyId] = useState<string | null>(current?.propertyId ?? null)
  const [streamId, setStreamId] = useState<string | null>(current?.streamId ?? null)
  const streams = useStreams(propertyId)
  const link = useLinkStream(projectId)
  const refresh = useRefresh()
  const accounts = properties.data ?? []
  const all = accounts.flatMap((a) => a.properties)

  // One property, or one web stream: picked for the user.
  const onlyProperty = all.length === 1 ? all[0]!.id : null
  if (!propertyId && onlyProperty) setPropertyId(onlyProperty)
  const webStreams = streams.data ?? []
  const onlyStream = webStreams.length === 1 ? webStreams[0]!.id : null
  if (onlyStream && streamId !== onlyStream && !webStreams.some((s) => s.id === streamId)) setStreamId(onlyStream)

  // Google refused the stored token: the page shows the connect card again.
  const failure = properties.error ?? streams.error ?? link.error
  const code = errorCode(failure)
  useEffect(() => {
    if (code === 'google_reconnect' || code === 'google_not_connected') void refresh()
  }, [code, refresh])

  const choose = (id: string) => {
    setPropertyId(id)
    setStreamId(null)
  }
  const save = () => {
    if (propertyId && streamId) link.mutate({ propertyId, streamId }, { onSuccess: () => onDone?.() })
  }

  return (
    <section aria-labelledby="picker-title" className="space-y-5 rounded-xl border p-6">
      <div className="space-y-1">
        <h2 id="picker-title" className="text-lg font-semibold">
          Pick where this site reports
        </h2>
        <p className="text-sm text-muted-foreground">
          {email ? <>Properties in {email}. </> : null}
          Use one property (and web stream) per site, so its numbers are only this site’s.
        </p>
      </div>

      {properties.isPending ? (
        <Loading label="Loading your properties" />
      ) : properties.error ? (
        <Failure error={properties.error} onRetry={() => void properties.refetch()} />
      ) : all.length === 0 ? (
        <div className="space-y-3 rounded-lg bg-muted/60 p-4 text-sm">
          <p>Your Google account has no Google Analytics 4 property yet. Create one (with a web stream for your site’s address), then refresh.</p>
          <CreateLinks createUrl={createUrl} onRefresh={() => void properties.refetch()} refreshing={properties.isFetching} />
        </div>
      ) : (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Property</legend>
          {accounts
            .filter((a) => a.properties.length > 0)
            .map((account) => (
              <div key={account.id} className="space-y-1.5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{account.name}</p>
                {account.properties.map((p) => (
                  <Choice key={p.id} name="property" checked={propertyId === p.id} onChange={() => choose(p.id)} label={p.name} hint={`Property ${p.id}`} />
                ))}
              </div>
            ))}
        </fieldset>
      )}

      {propertyId && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Web stream</legend>
          {streams.isPending ? (
            <Loading label="Loading the property’s streams" />
          ) : streams.error ? (
            <Failure error={streams.error} onRetry={() => void streams.refetch()} />
          ) : webStreams.length === 0 ? (
            <div className="space-y-3 rounded-lg bg-muted/60 p-4 text-sm">
              <p>This property has no web stream. In Google Analytics, open Admin → Data streams → Add stream → Web, enter your site’s address, then refresh.</p>
              <CreateLinks createUrl={createUrl} onRefresh={() => void streams.refetch()} refreshing={streams.isFetching} />
            </div>
          ) : (
            webStreams.map((s) => (
              <Choice
                key={s.id}
                name="stream"
                checked={streamId === s.id}
                onChange={() => setStreamId(s.id)}
                label={s.name}
                hint={[s.url, s.measurementId].filter(Boolean).join(' · ')}
              />
            ))
          )}
        </fieldset>
      )}

      {link.error && (
        <p role="alert" className="text-sm text-destructive">
          {errorText(link.error)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={!propertyId || !streamId || link.isPending}>
          {link.isPending && <LoaderCircle className="animate-spin" />}
          Use this stream
        </Button>
        {current && onDone && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </section>
  )
}

function Choice({ name, checked, onChange, label, hint }: { name: string; checked: boolean; onChange: () => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 hover:bg-accent has-[:checked]:border-foreground/40 has-[:checked]:bg-accent">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 accent-foreground" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}

function CreateLinks({ createUrl, onRefresh, refreshing }: { createUrl: string; onRefresh: () => void; refreshing: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline">
        <a href={createUrl} target="_blank" rel="noreferrer">
          <ExternalLink />
          Open Google Analytics
        </a>
      </Button>
      <Button size="sm" variant="ghost" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
        Refresh
      </Button>
    </div>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" />
      {label}…
    </div>
  )
}

function Failure({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-destructive">{errorText(error)}</span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
