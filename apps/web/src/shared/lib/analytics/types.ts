/** Event properties as handed to providers: already cleaned (no undefined, long strings and lists capped). */
export type AnalyticsProps = Record<string, unknown>

export type PageView = { path: string; url: string; title: string; referrer: string }

/**
 * One analytics backend (Mixpanel, Google Analytics, PostHog, a console logger...). The app never talks to a
 * provider directly: it calls `analytics`, which fans each call out to every registered provider. To add a new
 * one, implement this interface in `providers/` and register it in `setup.ts`.
 *
 * Methods must not throw (the core catches anyway) and may queue calls until their SDK has loaded.
 */
export interface AnalyticsProvider {
  readonly name: string
  track(event: string, props: AnalyticsProps): void
  /** A route change. Providers without page views of their own can leave it out: the core tracks `page_view`. */
  page?(page: PageView, props: AnalyticsProps): void
  /** The signed-in user. `traits` describe them (login, name, role). */
  identify?(userId: string, traits: AnalyticsProps): void
  /** Sign-out: forget the user, so the next visitor on this browser starts anonymous. */
  reset?(): void
}
