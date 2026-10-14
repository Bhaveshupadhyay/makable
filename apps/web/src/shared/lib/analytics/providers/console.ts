import type { AnalyticsProvider } from '../types'

/** Logs every call to the browser console. For checking events locally (`VITE_ANALYTICS_DEBUG=true`). */
export function consoleProvider(): AnalyticsProvider {
  const log = (...args: unknown[]) => console.info('%c[analytics]', 'color:#8b5cf6', ...args)
  return {
    name: 'console',
    track: (event, props) => log(event, props),
    page: (page, props) => log('page_view', { ...props, ...page }),
    identify: (userId, traits) => log('identify', userId, traits),
    reset: () => log('reset'),
  }
}
