export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Fetch JSON from the control plane. The API shares the SPA's origin, so the session cookie is sent. */
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
