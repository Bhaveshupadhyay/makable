import type { AnalyticsEvent, AnalyticsEventName, AnalyticsEvents } from './events'
import type { AnalyticsProps, AnalyticsProvider, PageView } from './types'

/** Longest string property sent. Providers may cut further (Mixpanel keeps 255 characters per value). */
export const MAX_STRING = 2000
const MAX_LIST = 50
const MAX_DEPTH = 3

/**
 * The app's analytics, independent of any vendor: each call goes to every registered provider. With no provider
 * registered (no token configured, tests) every call is a no-op. A failing provider never breaks the app or the
 * other providers.
 */
export function createAnalytics() {
  const providers: AnalyticsProvider[] = []
  // Sent with every event (e.g. whether the visitor is signed in).
  let context: AnalyticsProps = {}

  function each(call: (provider: AnalyticsProvider) => void) {
    for (const provider of providers) {
      try {
        call(provider)
      } catch (error) {
        if (import.meta.env?.DEV) console.warn(`[analytics] ${provider.name} failed`, error)
      }
    }
  }

  function withContext(props: object): AnalyticsProps {
    return clean({ ...context, ...props }) as AnalyticsProps
  }

  function send(event: string, props: object) {
    if (!providers.length) return
    const cleaned = withContext(props)
    each((p) => p.track(event, cleaned))
  }

  return {
    addProvider(provider: AnalyticsProvider) {
      if (!providers.some((p) => p.name === provider.name)) providers.push(provider)
    },
    get providers(): readonly string[] {
      return providers.map((p) => p.name)
    },
    /** Merges properties into every later event. `undefined` removes one. */
    setContext(props: AnalyticsProps) {
      context = Object.fromEntries(Object.entries({ ...context, ...props }).filter(([, v]) => v !== undefined))
    },
    track<E extends AnalyticsEventName>(event: E, props: AnalyticsEvents[E]) {
      send(event, props)
    },
    trackEach(events: readonly AnalyticsEvent[]) {
      for (const { event, props } of events) send(event, props)
    },
    page(page: PageView) {
      if (!providers.length) return
      const cleaned = withContext({})
      each((p) => (p.page ? p.page(page, cleaned) : p.track('page_view', { ...cleaned, ...page })))
    },
    identify(userId: string, traits: AnalyticsProps = {}) {
      const cleaned = clean(traits) as AnalyticsProps
      each((p) => p.identify?.(userId, cleaned))
    },
    reset() {
      each((p) => p.reset?.())
    },
  }
}

export type Analytics = ReturnType<typeof createAnalytics>

export const analytics = createAnalytics()

/** Makes a value safe to send: drops undefined and functions, caps strings, lists and nesting. */
export function clean(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING - 1)}…` : value
  if (value instanceof Date) return value.toISOString()
  if (depth >= MAX_DEPTH) return undefined
  if (Array.isArray(value)) return value.slice(0, MAX_LIST).map((v) => clean(v, depth + 1)).filter((v) => v !== undefined)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
      const c = clean(v, depth + 1)
      if (c !== undefined) out[key] = c
    }
    return out
  }
  return undefined
}
