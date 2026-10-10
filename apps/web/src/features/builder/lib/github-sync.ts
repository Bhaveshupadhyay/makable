import type { SessionState } from './session-file'

// Pure helpers for saving the session to the user's private GitHub workspace (see useGithubSync).

/**
 * Wait this long after the last change before saving, so a burst of edits becomes one commit. Leaving
 * the page saves right away anyway, so this only bounds what a crash or power cut could lose. It also
 * keeps a busy user far below GitHub's limit on commits (about 500 an hour per token).
 */
export const SAVE_DELAY_MS = 30_000
/** Nonstop editing still saves at least this often: changes can't push the save back forever. */
export const MAX_WAIT_MS = 120_000
/** After a failed save, try again this much later (unless GitHub asked for longer). */
export const RETRY_DELAY_MS = 60_000

/**
 * How long until the next save after a change: `SAVE_DELAY_MS` from now, but no later than
 * `MAX_WAIT_MS` after the first unsaved change, and never before GitHub's wait (`notBefore`) ends.
 */
export function nextSaveDelay(now: number, firstUnsavedAt: number, notBefore: number): number {
  const due = Math.min(now + SAVE_DELAY_MS, firstUnsavedAt + MAX_WAIT_MS)
  return Math.max(0, Math.max(due, notBefore) - now)
}

/** GitHub's wait from a rate-limit error's details (`retryAfter`, seconds), in milliseconds. */
export function retryAfterMs(details: unknown): number | null {
  const seconds = (details as { retryAfter?: unknown } | null)?.retryAfter
  return typeof seconds === 'number' && seconds > 0 ? seconds * 1000 : null
}
/**
 * Browsers cap the bodies of `keepalive` requests (the only kind that outlives a closing page) at
 * 64 KB in total, so bigger sessions can't be saved at close and rely on the earlier saves.
 */
export const KEEPALIVE_MAX_BYTES = 60_000

/** A session worth saving: a site has been started. A fresh chat isn't saved (or restored over). */
export function hasContent(state: Pick<SessionState, 'conversation'>): boolean {
  return state.conversation.portfolio !== null
}

/**
 * A short fingerprint of what a save would write, without the save time, so an unchanged session
 * isn't committed again (after a reload, or when another tab already saved it).
 */
export function fingerprint({ projectId, conversation, fileEdits, aiHistory }: SessionState): string {
  const { step, messages, portfolio, githubLogin } = conversation
  const text = JSON.stringify([projectId, step, messages, portfolio, githubLogin ?? null, fileEdits, aiHistory])
  // FNV-1a (32-bit) plus the length: cheap, and collisions don't matter much (the next change saves anyway).
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${(hash >>> 0).toString(16)}-${text.length}`
}

/** Whether a request body can go out as a `keepalive` request while the page closes. */
export function fitsKeepalive(body: string): boolean {
  return new TextEncoder().encode(body).length <= KEEPALIVE_MAX_BYTES
}
