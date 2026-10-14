import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { takeSigningIn, useSession } from '@/features/auth'
import { analytics } from '@/shared/lib/analytics'

/** Page views on every route change, and who the visitor is once the session is known. Renders nothing. */
export function AnalyticsTracker() {
  const { pathname } = useLocation()
  const session = useSession()
  const user = session.data
  // Page views wait for the session check (signed in or not), so even the first one carries who's viewing.
  const settled = !session.isPending

  const identified = useRef<string | null>(null)
  // Declared before the page view effect: effects run in order, so the context is set first.
  useEffect(() => {
    if (!session.isSuccess) return
    analytics.setContext({ signed_in: !!user, login: user?.login })
    // Back as a guest: the sign-in was cancelled or failed, so it mustn't count later.
    if (!user) takeSigningIn()
    if (user && identified.current !== user.id) {
      identified.current = user.id
      analytics.identify(user.id, { login: user.login, name: user.name, role: user.role, avatar: user.avatarUrl })
      // After identify, so the event belongs to the user.
      if (takeSigningIn()) analytics.track('sign_in_completed', { method: 'github' })
    } else if (!user && identified.current) {
      // Signed out: the next visitor on this browser starts anonymous.
      identified.current = null
      analytics.reset()
    }
  }, [session.isSuccess, user])

  // The query string is left out on purpose: it can carry sign-in details. No route depends on it.
  useEffect(() => {
    if (!settled) return
    analytics.page({ path: pathname, url: `${window.location.origin}${pathname}`, title: document.title, referrer: document.referrer })
  }, [pathname, settled])

  return null
}
