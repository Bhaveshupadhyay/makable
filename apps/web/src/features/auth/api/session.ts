import { ApiError, apiFetch } from '@/shared/lib/api-client'
import { safeReturnTo } from '../lib/safe-return-to'
import type { SessionUser } from '../types'

const MOCK_AUTH = import.meta.env.VITE_MOCK_AUTH === 'true'
const MOCK_KEY = 'makable:mock-session'
const MOCK_USER: SessionUser = {
  id: 'mock-1',
  login: 'octocat',
  name: 'The Octocat',
  avatarUrl: 'https://github.com/octocat.png',
}

/** Starts the GitHub App OAuth flow. The Worker redirects back to `returnTo` when done. */
export function loginWithGithub(path = '/') {
  const returnTo = safeReturnTo(path)
  if (MOCK_AUTH) {
    localStorage.setItem(MOCK_KEY, '1')
    window.location.assign(returnTo)
    return
  }
  window.location.assign(`/api/auth/github/login?returnTo=${encodeURIComponent(returnTo)}`)
}

/** Returns the signed-in user, or null when there is no session. */
export async function fetchSession(): Promise<SessionUser | null> {
  if (MOCK_AUTH) return localStorage.getItem(MOCK_KEY) ? MOCK_USER : null
  try {
    const { user } = await apiFetch<{ user: SessionUser }>('/auth/session')
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
  await apiFetch<void>('/auth/logout', { method: 'POST' })
}
