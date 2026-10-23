import type { AnalyticsEvents } from '@/shared/lib/analytics'

/** The product demo, for visitors who want to see makable without signing in with GitHub first. */
export const DEMO_VIDEO_URL = 'https://pub-4a29d5bc45754e1e9ab37c133e4e92b9.r2.dev/mak.mp4'
/**
 * Its backup on Google Drive, in Drive's own player, for when R2's copy can't load or play. Drive refuses to serve the
 * file to a `<video>` on another site (a 403 for cross-site requests), so it can only be embedded this way.
 */
export const DEMO_BACKUP_EMBED_URL = 'https://drive.google.com/file/d/1Y6S0sqxlCCJJvUxavzmWfTVEvyznqkTL/preview'
/** A frame of the demo (the chat beside the site it built), shown until it plays. */
export const DEMO_POSTER_URL = '/demo-poster.jpg'

/** Where the demo plays: over the page for the resume's links, or on the landing page. */
export type DemoPlacement = AnalyticsEvents['demo_video_shown']['placement']

/** `utm_source` values whose visits open the demo: `res` and `resume` are the links on the resume. */
const DEMO_SOURCES = new Set(['res', 'resume'])

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

/** Each quarter of the video seen, reported once as it's reached. */
const PROGRESS_STEPS = [25, 50, 75, 100]
/** The last moments of a video may never count as played, so this close to the end counts as all of it. */
const END_SLACK_SECONDS = 1

/** The progress steps (percent of the video) that `seconds` of it played have reached. */
export function progressReached(seconds: number, duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || seconds <= 0) return []
  const percent = seconds >= duration - END_SLACK_SECONDS ? 100 : (seconds / duration) * 100
  return PROGRESS_STEPS.filter((step) => percent >= step)
}
