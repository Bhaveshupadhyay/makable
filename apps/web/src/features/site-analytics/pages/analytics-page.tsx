import { ArrowLeft, CircleCheck, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { loginWithGithub, MOCK_AUTH, useSession } from '@/features/auth'
import { useSiteStore } from '@/features/site'
import { analytics } from '@/shared/lib/analytics'
import { Button } from '@/shared/ui/button'
import { GithubIcon } from '@/shared/ui/github-icon'
import { AnalyticsDashboard } from '../components/analytics-dashboard'
import { ConnectCard } from '../components/connect-card'
import { StreamPicker } from '../components/stream-picker'
import { useConnectGoogle, useSiteAnalytics } from '../hooks/use-analytics'
import { connectErrorText, errorCode, errorText } from '../lib/error-text'

/**
 * A site's analytics (`/analytics/:projectId`): connect Google Analytics, pick the stream the site reports to, then
 * its traffic. Google sends the browser back here with `?analytics=connected` or `?analyticsError=<code>`.
 */
export function AnalyticsPage() {
  const { projectId = '' } = useParams()
  const session = useSession()
  const status = useSiteAnalytics(projectId)
  const connect = useConnectGoogle(projectId)
  const siteName = useSiteStore((s) => (s.site?.projectId === projectId ? s.site.name : null))
  const [params, setParams] = useSearchParams()
  // What Google's redirect said, kept after it's taken out of the address.
  const [returned] = useState(() => ({ connected: params.get('analytics') === 'connected', error: params.get('analyticsError') }))
  const [changing, setChanging] = useState(false)

  useEffect(() => {
    if (!params.has('analytics') && !params.has('analyticsError')) return
    if (returned.connected) analytics.track('analytics_connected', {})
    if (returned.error) analytics.track('analytics_connect_failed', { code: returned.error })
    setParams(
      (p) => {
        p.delete('analytics')
        p.delete('analyticsError')
        return p
      },
      { replace: true },
    )
    // Runs again once the address is clean, and stops there: each redirect is tracked once.
  }, [params, returned, setParams])

  const body = () => {
    if (session.isPending) return <Spinner label="Loading" />
    if (!session.data) {
      return (
        <div className="space-y-3 rounded-xl border p-6 text-center">
          <p className="text-sm text-muted-foreground">Connect GitHub to see your sites’ analytics.</p>
          <Button onClick={() => loginWithGithub(`/analytics/${projectId}`)}>
            <GithubIcon />
            Connect GitHub
          </Button>
        </div>
      )
    }
    if (MOCK_AUTH) {
      return <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Mock sign-in has no backend to read analytics from.</p>
    }
    if (status.isPending) return <Spinner label="Loading" />
    if (status.error) {
      return (
        <div role="alert" className="space-y-3 rounded-xl border p-6 text-center">
          <p className="text-sm text-destructive">
            {errorCode(status.error) === 'site_not_found' ? 'This site isn’t in your makable account.' : errorText(status.error)}
          </p>
          <Button variant="outline" size="sm" onClick={() => void status.refetch()}>
            Try again
          </Button>
        </div>
      )
    }
    const { connection, link, createUrl } = status.data
    if (!connection.configured) {
      return (
        <p className="rounded-xl border p-6 text-sm text-muted-foreground">
          Google Analytics isn’t set up on this makable server yet (it needs a Google OAuth client).
        </p>
      )
    }
    if (!connection.connected) {
      const error = connect.error ? errorText(connect.error) : returned.error ? connectErrorText(returned.error) : null
      return <ConnectCard onConnect={() => connect.mutate()} pending={connect.isPending || connect.isSuccess} error={error} reconnect={!!link} />
    }
    if (!link || changing) {
      return <StreamPicker projectId={projectId} email={connection.email} createUrl={createUrl} current={link} onDone={() => setChanging(false)} />
    }
    return <AnalyticsDashboard projectId={projectId} link={link} email={connection.email} onChange={() => setChanging(true)} />
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Back to the builder
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics{siteName ? <span className="text-muted-foreground"> · {siteName}</span> : null}</h1>
        {returned.connected && status.data?.connection.connected && (
          <p role="status" className="flex items-center gap-1.5 text-sm">
            <CircleCheck className="size-4 text-viz-good" aria-hidden />
            Google Analytics is connected{status.data.connection.email ? ` (${status.data.connection.email})` : ''}.
          </p>
        )}
      </div>
      {body()}
    </main>
  )
}

function Spinner({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex justify-center py-10">
      <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}
