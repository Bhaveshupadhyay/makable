import type { Mixpanel, OverridedMixpanel } from 'mixpanel-browser'
import type { AnalyticsProvider } from '../types'

type MixpanelOptions = {
  token: string
  /** e.g. `https://api-eu.mixpanel.com` for EU data residency. */
  apiHost?: string
  debug?: boolean
}

/**
 * Mixpanel. The SDK is loaded on first use (a separate chunk), so it adds nothing to the main bundle, and calls
 * made before it loads are queued in order. Page views and clicks are tracked by the app itself (provider-agnostic),
 * so Mixpanel's own autocapture and page-view tracking are off.
 */
export function mixpanelProvider({ token, apiHost, debug = false }: MixpanelOptions): AnalyticsProvider {
  let sdk: Promise<Mixpanel> | null = null
  const load = () =>
    // The core build: the default one bundles session replay (~300 KB more), which isn't used.
    // (Its type file re-exports everything but the default export, hence the cast.)
    (sdk ??= import('mixpanel-browser/src/loaders/loader-module-core').then((mod) => {
      const mixpanel = (mod as unknown as { default: OverridedMixpanel }).default
      mixpanel.init(token, {
        ...(apiHost ? { api_host: apiHost } : {}),
        debug,
        autocapture: false,
        track_pageview: false,
        persistence: 'localStorage',
      })
      return mixpanel
    }))
  const run = (call: (mixpanel: Mixpanel) => void) => {
    load()
      .then(call)
      .catch((error) => debug && console.warn('[analytics] mixpanel', error))
  }

  return {
    name: 'mixpanel',
    track: (event, props) => run((m) => m.track(event, props)),
    page: (page, props) => run((m) => m.track('page_view', { ...props, ...page })),
    identify: (userId, traits) =>
      run((m) => {
        m.identify(userId)
        m.people.set(traits)
      }),
    reset: () => run((m) => m.reset()),
  }
}
