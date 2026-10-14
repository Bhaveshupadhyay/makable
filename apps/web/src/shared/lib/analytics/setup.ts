import { analytics } from './analytics'
import { startAutocapture } from './autocapture'
import { consoleProvider } from './providers/console'
import { mixpanelProvider } from './providers/mixpanel'

let started = false

/**
 * Registers the providers configured in the environment and starts click tracking. The one place that knows
 * which vendors exist: to add one (e.g. Google Analytics), write `providers/<name>.ts` implementing
 * `AnalyticsProvider` and add it here behind its own env variable.
 */
export function initAnalytics(env: ImportMetaEnv = import.meta.env) {
  if (started) return
  started = true

  if (env.VITE_MIXPANEL_TOKEN) {
    analytics.addProvider(
      mixpanelProvider({ token: env.VITE_MIXPANEL_TOKEN, apiHost: env.VITE_MIXPANEL_API_HOST, debug: env.VITE_ANALYTICS_DEBUG === 'true' }),
    )
  }
  if (env.VITE_ANALYTICS_DEBUG === 'true') analytics.addProvider(consoleProvider())
  if (!analytics.providers.length) return

  analytics.setContext({ app: 'makable-web', app_env: env.MODE })
  startAutocapture((props) => analytics.track('ui_click', props))
}
