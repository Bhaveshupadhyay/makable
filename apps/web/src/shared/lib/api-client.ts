export class ApiError extends Error {
  readonly status: number
  /** The backend's error code (e.g. `unauthorized`), when it sent an error envelope. */
  readonly code: string | undefined
  /** Extra data the backend sent with the error (e.g. the current version on a conflict). */
  readonly details: unknown

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** Same-origin JSON request options. `Headers` accepts every `HeadersInit` form; the caller's `Accept` wins. */
function jsonInit(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  return { ...init, credentials: 'same-origin', headers }
}

const BACKEND = '/api/v1'
const REFRESH_PATH = '/auth/refresh'

type Envelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown }; requestId?: string }

let refreshing: Promise<boolean> | null = null

/**
 * Refreshes the session cookies. Resolves `false` only when the backend says the session is over (401). Any
 * other failure (network, 5xx) throws, so callers treat it as "couldn't reach the server", not "signed out".
 *
 * The refresh token is single-use, so refreshes must not overlap. Requests in this tab that get a 401 at the
 * same time share one refresh, and a Web Lock serializes refreshes across tabs: a tab that waited sends the
 * cookie the previous tab just received.
 */
function refreshSession(): Promise<boolean> {
  refreshing ??= withRefreshLock(async () => {
    const res = await fetch(`${BACKEND}${REFRESH_PATH}`, { method: 'POST', credentials: 'same-origin' })
    if (res.ok) return true
    if (res.status === 401) return false
    throw new ApiError(res.status, `POST ${BACKEND}${REFRESH_PATH} failed with ${res.status}`)
  }).finally(() => {
    refreshing = null
  })
  return refreshing
}

function withRefreshLock<T>(run: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  return locks ? locks.request('makable:session-refresh', run) : run()
}

function send(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BACKEND}${path}`, jsonInit(init))
}

/**
 * Calls the makable backend (`/api/v1`). The API shares the SPA's origin, so the HttpOnly session cookies are
 * sent. Unwraps the `{ success, data }` envelope and throws `ApiError` (with the server's `code`) otherwise.
 * The access token is short-lived, so on a 401 the session is refreshed once and the request retried. If the
 * refresh itself fails for any reason but a 401, that error is thrown instead of the original 401.
 */
export async function backendFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await send(path, init)
  if (res.status === 401 && path !== REFRESH_PATH && (await refreshSession())) {
    res = await send(path, init)
  }
  if (res.status === 204) return undefined as T

  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (res.ok && body?.success) return body.data
  const error = body && !body.success ? body.error : undefined
  throw new ApiError(
    res.status,
    error?.message ?? `${init?.method ?? 'GET'} ${BACKEND}${path} failed with ${res.status}`,
    error?.code,
    error?.details,
  )
}
