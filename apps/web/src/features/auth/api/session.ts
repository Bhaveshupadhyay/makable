import { analytics } from '@/shared/lib/analytics'
import { ApiError, backendFetch } from '@/shared/lib/api-client'
import { safeReturnTo } from '../lib/safe-return-to'
import type { SessionUser } from '../types'

/** Dev only: a fake signed-in user with no backend session (so nothing that needs the backend works). */
export const MOCK_AUTH = import.meta.env.VITE_MOCK_AUTH === 'true'
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
  analytics.track('sign_in_started', { return_to: returnTo })
  markSigningIn()
  if (MOCK_AUTH) {
    localStorage.setItem(MOCK_KEY, '1')
    window.location.assign(returnTo)
    return
  }
  window.location.assign(`/api/v1/auth/github/login?returnTo=${encodeURIComponent(returnTo)}`)
}

const SIGNING_IN_KEY = 'makable:signing-in'

/** Remembers, across the GitHub redirect, that this tab started a sign-in (for `sign_in_completed`). */
function markSigningIn() {
  try {
    sessionStorage.setItem(SIGNING_IN_KEY, '1')
  } catch {
    // Storage blocked: the sign-in just isn't counted.
  }
}

/** True once after returning from a sign-in this tab started. */
export function takeSigningIn(): boolean {
  try {
    const was = sessionStorage.getItem(SIGNING_IN_KEY) === '1'
    sessionStorage.removeItem(SIGNING_IN_KEY)
    return was
  } catch {
    return false
  }
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
