import { ApiError, backendFetch } from '@/shared/lib/api-client'
import { safeReturnTo } from '../lib/safe-return-to'
import type { SessionUser } from '../types'

const MOCK_AUTH = import.meta.env.VITE_MOCK_AUTH === 'true'
const MOCK_KEY = 'makable:mock-session'
const MOCK_USER: SessionUser = {
  id: 'mock-1',
  login: 'octocat',
  name: 'The Octocat',
  avatarUrl: 'https://github.com/octocat.png',
  role: 'user',
}

/** Starts GitHub sign-in. The backend runs it through Supabase Auth and redirects back to `returnTo`, with
 * `?authError=<code>` if it failed. */
export function loginWithGithub(path = '/') {
  const returnTo = safeReturnTo(path)
  if (MOCK_AUTH) {
    localStorage.setItem(MOCK_KEY, '1')
    window.location.assign(returnTo)
    return
  }
  window.location.assign(`/api/v1/auth/github/login?returnTo=${encodeURIComponent(returnTo)}`)
}

/** Returns the signed-in user, or null when there is no session (`backendFetch` already tried a refresh). */
export async function fetchSession(): Promise<SessionUser | null> {
  if (MOCK_AUTH) return localStorage.getItem(MOCK_KEY) ? MOCK_USER : null
  try {
    const { user } = await backendFetch<{ user: SessionUser }>('/auth/session')
    return user
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null
    throw err
  }
}

export async function logout(): Promise<void> {
  if (MOCK_AUTH) {
    localStorage.removeItem(MOCK_KEY)
    return
  }
  await backendFetch<void>('/auth/logout', { method: 'POST' })
}
