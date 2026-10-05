/**
 * A same-origin path to return to after login, or `/`. `returnTo` comes from
 * the URL, so it's untrusted: `//evil.com` and `/\evil.com` (browsers treat `\`
 * like `/`) would otherwise be open redirects.
 */
export function safeReturnTo(value: string | null, origin = window.location.origin): string {
  if (!value?.startsWith('/')) return '/'
  try {
    const url = new URL(value, origin)
    return url.origin === origin ? url.pathname + url.search + url.hash : '/'
  } catch {
    return '/'
  }
}
