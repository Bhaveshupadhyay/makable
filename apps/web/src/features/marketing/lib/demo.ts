/** The product demo, for visitors who want to see makable without signing in with GitHub first. */
export const DEMO_VIDEO_URL = 'https://pub-4a29d5bc45754e1e9ab37c133e4e92b9.r2.dev/mak.mp4'

/** `utm_source` values whose visits open the demo: `res` is the link on the resume. */
const DEMO_SOURCES = new Set(['res'])

/** The visit's `utm_source` when it should open the demo, else null. */
export function demoSource(search: string): string | null {
  const source = new URLSearchParams(search).get('utm_source')?.trim().toLowerCase()
  return source && DEMO_SOURCES.has(source) ? source : null
}
