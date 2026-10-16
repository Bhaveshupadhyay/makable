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
export function initAnalytics(env: ImportMetaEnv = import.meta.env, hostname = globalThis.location?.hostname ?? '') {
  if (started) return
  started = true

  if (env.VITE_MIXPANEL_TOKEN && (isDeployed(env, hostname) || env.VITE_MIXPANEL_LOCAL === 'true')) {
    analytics.addProvider(
      mixpanelProvider({ token: env.VITE_MIXPANEL_TOKEN, apiHost: env.VITE_MIXPANEL_API_HOST, debug: env.VITE_ANALYTICS_DEBUG === 'true' }),
    )
  }
  if (env.VITE_ANALYTICS_DEBUG === 'true') analytics.addProvider(consoleProvider())
  if (!analytics.providers.length) return

  analytics.setContext({ app: 'makable-web', app_env: env.MODE })
  startAutocapture((props) => analytics.track('ui_click', props))
}

// Testing on this machine (the dev server, or `vite preview` on localhost) must not pollute the real Mixpanel project.
function isDeployed(env: ImportMetaEnv, hostname: string) {
  return env.PROD && !LOCAL_HOSTS.has(hostname)
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0', ''])
