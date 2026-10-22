import { backendFetch } from '@/shared/lib/api-client'
import type { AnalyticsReport, GaAccount, GaStream, GoogleConnection, ReportRange, SiteAnalyticsLink, SiteAnalyticsStatus } from '../types'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** The id comes from the address (decoded by the router), so it's encoded again to stay one path segment. */
const sitePath = (projectId: string) => `/sites/${encodeURIComponent(projectId)}/analytics`

export function fetchConnection(): Promise<GoogleConnection> {
  return backendFetch<GoogleConnection>('/analytics/google')
}

/**
 * Google's consent page for this browser (the response also sets the state cookie its callback checks). A request
 * rather than a navigation to the backend, so an expired session is refreshed first.
 */
export function startConnect(returnTo: string): Promise<{ authorizeUrl: string }> {
  return backendFetch<{ authorizeUrl: string }>('/analytics/google/connect', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ returnTo }),
  })
}

export function disconnectGoogle(): Promise<void> {
  return backendFetch<void>('/analytics/google', { method: 'DELETE' })
}

export function fetchProperties(): Promise<GaAccount[]> {
  return backendFetch<GaAccount[]>('/analytics/google/properties')
}

export function fetchStreams(propertyId: string): Promise<GaStream[]> {
  return backendFetch<GaStream[]>(`/analytics/google/properties/${encodeURIComponent(propertyId)}/streams`)
}

export function fetchSiteAnalytics(projectId: string): Promise<SiteAnalyticsStatus> {
  return backendFetch<SiteAnalyticsStatus>(sitePath(projectId))
}

/** The backend checks the stream with Google before linking it. The next publish adds its tag to the site. */
export function linkStream(projectId: string, body: { propertyId: string; streamId: string }): Promise<SiteAnalyticsLink> {
  return backendFetch<SiteAnalyticsLink>(sitePath(projectId), {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
}

export function unlinkStream(projectId: string): Promise<void> {
  return backendFetch<void>(sitePath(projectId), { method: 'DELETE' })
}

export function fetchReport(projectId: string, range: ReportRange): Promise<AnalyticsReport> {
  return backendFetch<AnalyticsReport>(`${sitePath(projectId)}/report?range=${range}`)
}
