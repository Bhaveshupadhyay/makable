import { analytics } from '@/shared/lib/analytics'
import { ApiError } from '@/shared/lib/api-client'
import { loginWithGithub } from '../api/session'

/** What found that makable's GitHub token stopped working (for analytics). */
export type ReconnectSource = 'site' | 'ai' | 'create' | 'publish'

const RECONNECT_KEY = 'makable:github-reconnect'
/** How long after a reconnect another refusal is shown instead of redirecting again (a loop otherwise). */
export const RECONNECT_COOLDOWN_MS = 10 * 60_000

/**
 * Whether the backend refused because makable's GitHub token stopped working (`github_reconnect`: revoked on GitHub,
 * or none stored). Only signing in again fixes it, since that's when the backend gets a new token.
 */
export function needsGithubReconnect(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'github_reconnect'
}

type Deps = {
  /** Where the time of the last reconnect is kept: per tab, across the redirect (`sessionStorage`). Throws when blocked. */
  storage: () => Pick<Storage, 'getItem' | 'setItem'>
  now: () => number
  hidden: () => boolean
  /** Signs in again, coming back to the page the user is on. */
  go: () => void
}

/** The reconnect, outside the browser's globals so it can be tested. See `reconnectGithub`. */
export function createGithubReconnect({ storage, now, hidden, go }: Deps): (source: ReconnectSource) => boolean {
  let going = false
  return (source) => {
    if (going) return true
    // A hidden tab may be closing or leaving for another page: redirecting would get in the way. It waits to be seen.
    if (hidden()) return false
    const at = now()
    let redirected = false
    try {
      const last = Number(storage().getItem(RECONNECT_KEY) ?? Number.NaN)
      // A clock set back since then doesn't keep the user waiting.
      if (Number.isNaN(last) || at - last >= RECONNECT_COOLDOWN_MS || at < last) {
        storage().setItem(RECONNECT_KEY, String(at))
        redirected = true
      }
    } catch {
      // Storage blocked: a refusal after the redirect would look like the first one, so no automatic redirect at all.
    }
    analytics.track('github_reconnect_needed', { source, redirected })
    if (!redirected) return false
    going = true
    go()
    return true
  }
}

/**
 * Gets makable a new GitHub token by signing in again, back to the page the user is on. GitHub doesn't ask again for
 * an app the user has already allowed, so it's a quick round trip. At most once every 10 min per tab, so a token
 * GitHub keeps refusing shows the error and **Connect GitHub again** instead of a redirect loop; never from a hidden
 * tab. Returns whether the browser is on its way (also when an earlier call in this page sent it), so the caller says
 * so instead of showing the error.
 */
export const reconnectGithub = createGithubReconnect({
  storage: () => sessionStorage,
  now: () => Date.now(),
  hidden: () => document.visibilityState === 'hidden',
  go: () => loginWithGithub(window.location.pathname + window.location.search),
})
