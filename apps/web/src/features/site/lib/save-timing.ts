// When the user's manual edits are saved to the site's repo (see useSiteSync).

/**
 * Wait this long after the last change before saving, so a burst of edits becomes one commit. Leaving the page
 * saves right away anyway, so this only bounds what a crash or power cut could lose. It also keeps a busy user far
 * below GitHub's limit on commits (about 500 an hour per token).
 */
export const SAVE_DELAY_MS = 30_000
/** Nonstop editing still saves at least this often: changes can't push the save back forever. */
export const MAX_WAIT_MS = 120_000
/** After a failed save, try again this much later (unless the server asked for longer). */
export const RETRY_DELAY_MS = 60_000
/** Browsers cap `keepalive` bodies (the only requests that outlive a closing page) at 64 KB in total. */
export const KEEPALIVE_MAX_BYTES = 60_000

/**
 * How long until the next save after a change: `SAVE_DELAY_MS` from now, but no later than `MAX_WAIT_MS` after the
 * first unsaved change, and never before the server's wait (`notBefore`) ends.
 */
export function nextSaveDelay(now: number, firstUnsavedAt: number, notBefore: number): number {
  const due = Math.min(now + SAVE_DELAY_MS, firstUnsavedAt + MAX_WAIT_MS)
  return Math.max(0, Math.max(due, notBefore) - now)
}

/** The server's wait from a rate-limit error's details (`retryAfter`, seconds), in milliseconds. */
export function retryAfterMs(details: unknown): number | null {
  const seconds = (details as { retryAfter?: unknown } | null)?.retryAfter
  return typeof seconds === 'number' && seconds > 0 ? seconds * 1000 : null
}

/** Whether a request body can go out as a `keepalive` request while the page closes. */
export function fitsKeepalive(body: string): boolean {
  return new TextEncoder().encode(body).length <= KEEPALIVE_MAX_BYTES
}
