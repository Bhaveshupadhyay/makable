interface ImportMetaEnv {
  readonly VITE_MOCK_AUTH?: string
  /** Overrides the published template catalog, e.g. a local build of the templates repo. */
  readonly VITE_TEMPLATE_CATALOG_URL?: string
  /** Mixpanel project token. Without it nothing is sent to Mixpanel. */
  readonly VITE_MIXPANEL_TOKEN?: string
  /** `true` sends events to Mixpanel from a local dev server too (off by default: only deployed builds send). */
  readonly VITE_MIXPANEL_LOCAL?: string
  /** Mixpanel API host, e.g. https://api-eu.mixpanel.com for EU data residency. */
  readonly VITE_MIXPANEL_API_HOST?: string
  /** `true` logs every analytics event to the browser console. */
  readonly VITE_ANALYTICS_DEBUG?: string
}
