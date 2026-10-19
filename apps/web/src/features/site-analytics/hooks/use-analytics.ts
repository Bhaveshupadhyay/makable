import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { MOCK_AUTH, useSession } from '@/features/auth'
import { analytics } from '@/shared/lib/analytics'
import { ApiError } from '@/shared/lib/api-client'
import {
  disconnectGoogle,
  fetchProperties,
  fetchReport,
  fetchSiteAnalytics,
  fetchStreams,
  linkStream,
  startConnect,
  unlinkStream,
} from '../api/analytics'
import { errorCode } from '../lib/error-text'
import type { ReportRange } from '../types'

/**
 * Query keys, scoped to the signed-in login: the Google connection and the sites belong to one account, so another
 * account signing in on this tab never sees the previous one's.
 */
export const analyticsKeys = {
  all: (login: string | undefined) => ['site-analytics', login] as const,
  site: (login: string | undefined, projectId: string) => ['site-analytics', login, 'site', projectId] as const,
  report: (login: string | undefined, projectId: string, range: ReportRange) =>
    ['site-analytics', login, 'site', projectId, 'report', range] as const,
  properties: (login: string | undefined) => ['site-analytics', login, 'properties'] as const,
  streams: (login: string | undefined, propertyId: string) => ['site-analytics', login, 'streams', propertyId] as const,
}

/** Errors that a retry won't fix: the user has to act (connect, pick another stream) or wait out Google's quota. */
const FINAL = new Set(['google_not_connected', 'google_reconnect', 'analytics_not_linked', 'analytics_access_denied', 'analytics_not_found', 'google_rate_limited', 'site_not_found', 'analytics_not_configured'])

function retry(failures: number, error: Error) {
  if (error instanceof ApiError && (error.status === 401 || FINAL.has(error.code ?? ''))) return false
  return failures < 2
}

/** The Google connection and the stream the site reports to. */
export function useSiteAnalytics(projectId: string) {
  const { login, signedIn } = useAccount()
  return useQuery({ queryKey: analyticsKeys.site(login, projectId), queryFn: () => fetchSiteAnalytics(projectId), enabled: signedIn, retry })
}

/** The site's traffic. A new range keeps the last one on screen while it loads. */
export function useReport(projectId: string, range: ReportRange, enabled: boolean) {
  const { login, signedIn } = useAccount()
  return useQuery({
    queryKey: analyticsKeys.report(login, projectId, range),
    queryFn: () => fetchReport(projectId, range),
    enabled: signedIn && enabled,
    placeholderData: keepPreviousData,
    // The backend keeps Google's numbers for 10 minutes (people on the site now: 1 minute).
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry,
  })
}

export function useProperties(enabled: boolean) {
  const { login, signedIn } = useAccount()
  return useQuery({ queryKey: analyticsKeys.properties(login), queryFn: fetchProperties, enabled: signedIn && enabled, staleTime: 5 * 60_000, retry })
}

export function useStreams(propertyId: string | null) {
  const { login, signedIn } = useAccount()
  return useQuery({
    queryKey: analyticsKeys.streams(login, propertyId ?? ''),
    queryFn: () => fetchStreams(propertyId!),
    enabled: signedIn && !!propertyId,
    staleTime: 5 * 60_000,
    retry,
  })
}

/** Sends the browser to Google's consent page; Google sends it back to `returnTo`. */
export function useConnectGoogle(projectId: string) {
  return useMutation({
    mutationFn: () => startConnect(`/analytics/${projectId}`),
    onMutate: () => analytics.track('analytics_connect_started', { project_id: projectId }),
    onSuccess: ({ authorizeUrl }) => window.location.assign(authorizeUrl),
    onError: (error) => analytics.track('analytics_connect_failed', { code: errorCode(error) ?? 'network' }),
  })
}

export function useDisconnectGoogle() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: disconnectGoogle,
    onSuccess: () => {
      analytics.track('analytics_disconnected', {})
      return refresh()
    },
  })
}

export function useLinkStream(projectId: string) {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (body: { propertyId: string; streamId: string }) => linkStream(projectId, body),
    onSuccess: () => {
      analytics.track('analytics_stream_linked', { project_id: projectId })
      return refresh()
    },
  })
}

export function useUnlinkStream(projectId: string) {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: () => unlinkStream(projectId),
    onSuccess: () => {
      analytics.track('analytics_stream_unlinked', { project_id: projectId })
      return refresh()
    },
  })
}

/** Refetches everything analytics shows, e.g. after the connection changed or Google refused the stored token. */
export function useRefresh() {
  const queryClient = useQueryClient()
  const { login } = useAccount()
  return useCallback(() => queryClient.invalidateQueries({ queryKey: analyticsKeys.all(login) }), [queryClient, login])
}

/** Signed in with a real session: mock sign-in has no backend. */
export function useAccount() {
  const login = useSession().data?.login
  return { login, signedIn: Boolean(login) && !MOCK_AUTH }
}
