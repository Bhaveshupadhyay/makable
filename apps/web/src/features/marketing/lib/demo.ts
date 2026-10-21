/** The product demo, for visitors who want to see makable without signing in with GitHub first. */
export const DEMO_VIDEO_URL = 'https://pub-4a29d5bc45754e1e9ab37c133e4e92b9.r2.dev/mak.mp4'

/** `utm_source` values whose visits open the demo: `res` is the link on the resume. */
const DEMO_SOURCES = new Set(['res'])

/** The visit's `utm_source` when it should open the demo, else null. */
export function demoSource(search: string): string | null {
  const source = new URLSearchParams(search).get('utm_source')?.trim().toLowerCase()
  return source && DEMO_SOURCES.has(source) ? source : null
}

/** Seconds of the video seen: what has played, without the parts skipped over or counting the parts seen twice. */
export function playedSeconds(played: Pick<TimeRanges, 'length' | 'start' | 'end'>): number {
  let seconds = 0
  for (let i = 0; i < played.length; i++) seconds += played.end(i) - played.start(i)
  return seconds
}
