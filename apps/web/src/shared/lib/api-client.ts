export class ApiError extends Error {
  readonly status: number
  /** The backend's error code (e.g. `unauthorized`), when it sent an error envelope. */
  readonly code: string | undefined

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** Fetch JSON from a same-origin `/api` route as-is. Used for the dev AI endpoint, which isn't on the backend. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    throw new ApiError(res.status, `${init?.method ?? 'GET'} /api${path} failed with ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const BACKEND = '/api/v1'
const REFRESH_PATH = '/auth/refresh'

type Envelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string }; requestId?: string }

let refreshing: Promise<boolean> | null = null

/** Refreshes the session cookies. Requests that get a 401 at the same time share one refresh, because the
 * refresh token is single-use: a second, parallel refresh would fail and sign the user out. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BACKEND}${REFRESH_PATH}`, { method: 'POST', credentials: 'same-origin' })
    .then(
      (res) => res.ok,
      () => false,
    )
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

function send(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BACKEND}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...init?.headers },
  })
}

/**
 * Calls the makable backend (`/api/v1`). The API shares the SPA's origin, so the HttpOnly session cookies are
 * sent. Unwraps the `{ success, data }` envelope and throws `ApiError` (with the server's `code`) otherwise.
 * The access token is short-lived, so on a 401 the session is refreshed once and the request retried.
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
  )
}
