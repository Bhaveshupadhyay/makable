import { useEffect, useState } from 'react'
import { analytics } from '@/shared/lib/analytics'
import { ApiError } from '@/shared/lib/api-client'
import { getSite, type SiteFiles, saveBody, saveFiles } from '../api/sites'
import { fitsKeepalive, nextSaveDelay, RETRY_DELAY_MS, retryAfterMs } from '../lib/save-timing'
import { type Changes, savePlan } from '../lib/working-copy'
import { useSiteStore } from '../store'

export type SyncStatus =
  /** The site's files are loading from GitHub. */
  | { state: 'loading' }
  | { state: 'load-failed'; message: string }
  | { state: 'saved'; at: string | null }
  /** Edits wait for a pause before they're saved. */
  | { state: 'pending' }
  | { state: 'saving' }
  /** Saving failed; it's tried again later. */
  | { state: 'error'; message: string }
  /** Saving needs the user first (GitHub must be reconnected, the site is gone). */
  | { state: 'blocked'; message: string }
  /** The site changed on GitHub (another tab or device) since this browser's edits were based on it. */
  | { state: 'conflict' }

type Reason = 'change' | 'retry' | 'hidden' | 'close' | 'manual' | 'flush'

// Answers that say how long to wait (`details.retryAfter`), and what to tell the user meanwhile.
const SLOW_DOWN: Record<string, string> = {
  github_rate_limited: 'GitHub asked makable to slow down.',
  service_busy: 'The makable server is busy.',
  too_many_requests: 'Saving too often.',
}

// Errors the user has to act on; retrying won't help.
const BLOCKING = new Set(['github_reconnect', 'site_not_found', 'site_repo_missing', 'site_invalid'])

/**
 * Keeps the site's files: loads them from its repo when the page opens, and saves the user's own edits there as
 * commits after a 30 s pause in changes (at least every 2 min while editing nonstop), right away when the tab is
 * hidden, and with a `keepalive` request when the page closes. `flush` saves now and gives the commit, for AI
 * requests and publishing, which work on the site as it is on GitHub.
 */
export function useSiteSync(active: boolean) {
  const [status, setStatus] = useState<SyncStatus>({ state: 'loading' })
  const [sync] = useState(() => createSiteSync(setStatus))
  const projectId = useSiteStore((s) => s.projectId)
  const repoName = useSiteStore((s) => s.site?.repoName ?? null)
  const hasBase = useSiteStore((s) => s.base !== null)

  // Load the files whenever there are none (the page opened, another tab moved the site, a conflict was resolved).
  useEffect(() => {
    if (active && repoName && !hasBase) void sync.load(projectId)
  }, [active, projectId, repoName, hasBase, sync])

  // Save after a pause in changes (and once on start, for edits from a past visit).
  useEffect(() => {
    if (!active) return
    sync.changed()
    const unsubscribe = useSiteStore.subscribe((s, prev) => {
      if (s.dirty !== prev.dirty || s.projectId !== prev.projectId) sync.changed()
    })
    return () => {
      unsubscribe()
      sync.cancel()
    }
  }, [active, sync])

  // The last chances before the page goes away: hidden tab (switching apps, locking the phone), then close.
  useEffect(() => {
    if (!active) return
    const onVisibility = () => document.visibilityState === 'hidden' && void sync.save('hidden')
    const onPageHide = () => void sync.save('close')
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [active, sync])

  return {
    status,
    saveNow: () => void sync.save('manual'),
    /**
     * Saves the user's edits now and resolves with the commit the site is at: what AI requests and Publish build on.
     * Throws an `ApiError` when it can't (`site_conflict`, a rate limit, or why the save failed).
     */
    flush: () => sync.flush(),
    /** Resolves a conflict: keep this browser's edits (on top of GitHub's version) or drop them. */
    resolve: (choice: 'keep' | 'load') => void sync.resolve(choice),
    /** Loads the files again from GitHub (after a failed load, or a commit this browser didn't see). */
    reload: () => void sync.load(projectId, true),
  }
}

export type SiteSync = ReturnType<typeof useSiteSync>

/** The saving logic, outside React so timers and window events always act on the newest state. */
function createSiteSync(onStatus: (status: SyncStatus) => void) {
  let status: SyncStatus = { state: 'loading' }
  let timer: ReturnType<typeof setTimeout> | undefined
  let saving: Promise<void> | null = null
  let again = false
  let loading: string | null = null
  // When the oldest change not yet saved happened (for the maximum wait), and the server's wait after a rate limit.
  let firstUnsavedAt: number | null = null
  let notBefore = 0
  let lastSavedAt: string | null = null
  let lastError: ApiError | null = null
  // GitHub's version, while it conflicts with this browser's edits.
  let remote: SiteFiles | null = null

  const set = (next: SyncStatus) => {
    if ((next.state === 'error' || next.state === 'blocked' || next.state === 'conflict') && next.state !== status.state) {
      analytics.track('site_save_problem', { state: next.state, message: 'message' in next ? next.message : null })
    }
    status = next
    onStatus(next)
  }

  const store = () => useSiteStore.getState()
  const isDirty = () => Object.keys(store().dirty).length > 0

  function schedule(delay: number, reason: Reason) {
    clearTimeout(timer)
    timer = setTimeout(() => void save(reason), Math.max(delay, notBefore - Date.now()))
  }

  async function load(projectId: string, force = false): Promise<void> {
    if (loading === projectId && !force) return
    loading = projectId
    set({ state: 'loading' })
    try {
      const files = await getSite(projectId)
      if (store().projectId !== projectId) return
      if (!files) return set({ state: 'blocked', message: "This site isn't on makable any more. Start a new one." })
      const { commitSha } = store()
      // Edits made on top of an older commit than GitHub's: the user decides which version wins.
      if (isDirty() && commitSha && commitSha !== files.commitSha) {
        remote = files
        return set({ state: 'conflict' })
      }
      store().loaded(files)
      set(isDirty() ? { state: 'pending' } : { state: 'saved', at: lastSavedAt })
      if (isDirty()) changed()
    } catch (e) {
      set({ state: 'load-failed', message: e instanceof ApiError && e.code ? e.message : "Couldn't load your site from GitHub." })
    } finally {
      if (loading === projectId) loading = null
    }
  }

  /** The edits changed: save after a pause, but within the maximum wait of the first unsaved change. */
  function changed() {
    if (!isDirty()) {
      firstUnsavedAt = null
      if (status.state === 'pending') set({ state: 'saved', at: lastSavedAt })
      return
    }
    if (status.state === 'saved') set({ state: 'pending' })
    const now = Date.now()
    firstUnsavedAt ??= now
    schedule(nextSaveDelay(now, firstUnsavedAt, notBefore), 'change')
  }

  function cancel() {
    clearTimeout(timer)
  }

  function save(reason: Reason): Promise<void> {
    if (saving) {
      again = true
      return saving
    }
    saving = run(reason).finally(() => {
      saving = null
    })
    return saving.then(() => {
      if (!again) return
      again = false
      return save('change')
    })
  }

  async function run(reason: Reason): Promise<void> {
    // A conflict or a blocked save waits for the user; only their own action retries it.
    if ((status.state === 'conflict' || status.state === 'blocked') && reason !== 'manual') return
    if (status.state === 'loading' || status.state === 'load-failed') return
    // The server asked to wait: the retry timer is already set for when it's over.
    if (Date.now() < notBefore) return
    const { projectId, commitSha, dirty, base } = store()
    if (!commitSha || !base || Object.keys(dirty).length === 0) return
    firstUnsavedAt = null
    lastError = null
    const sent: Changes = { ...dirty }
    const body = { baseCommit: commitSha, ...savePlan(sent) }
    // A hidden tab may be closing: the request has to outlive the page (the close save would wait behind it).
    const keepalive = (reason === 'close' || reason === 'hidden') && fitsKeepalive(saveBody(body))
    set({ state: 'saving' })
    try {
      const saved = await saveFiles(projectId, body, { keepalive })
      if (store().projectId !== projectId) return
      store().saved(saved.commitSha, sent)
      lastSavedAt = new Date().toISOString()
      set(isDirty() ? { state: 'pending' } : { state: 'saved', at: lastSavedAt })
      if (isDirty()) changed()
    } catch (e) {
      failed(e)
    }
  }

  function failed(e: unknown) {
    lastError = e instanceof ApiError ? e : new ApiError(0, "Couldn't reach the makable server. Trying again soon.", 'save_failed')
    if (e instanceof ApiError && e.code === 'site_conflict') {
      remote = null
      return set({ state: 'conflict' })
    }
    if (e instanceof ApiError && (e.status === 401 || (e.code && BLOCKING.has(e.code)))) {
      return set({ state: 'blocked', message: e.status === 401 ? 'Connect GitHub again to keep saving.' : e.message })
    }
    const slowDown = e instanceof ApiError && e.code ? SLOW_DOWN[e.code] : undefined
    const wait = slowDown && e instanceof ApiError ? retryAfterMs(e.details) : null
    if (slowDown && wait !== null) {
      notBefore = Date.now() + wait
      const at = new Date(notBefore).toLocaleTimeString(undefined, { timeStyle: 'short' })
      set({ state: 'error', message: `${slowDown} Saving again at ${at}.` })
      return schedule(wait, 'retry')
    }
    set({ state: 'error', message: e instanceof ApiError && e.code ? e.message : "Couldn't reach GitHub. Trying again soon." })
    schedule(RETRY_DELAY_MS, 'retry')
  }

  async function resolve(choice: 'keep' | 'load') {
    if (status.state !== 'conflict') return
    const { projectId } = store()
    try {
      const files = remote ?? (await getSite(projectId))
      remote = null
      if (!files) return set({ state: 'blocked', message: "This site isn't on makable any more. Start a new one." })
      if (choice === 'load') store().discard()
      // Keeping: the edits go on top of GitHub's version, replacing those files there.
      store().loaded(files)
      analytics.track('site_conflict_resolved', { choice: choice === 'keep' ? 'keep-local' : 'load-remote' })
      set(isDirty() ? { state: 'pending' } : { state: 'saved', at: lastSavedAt })
      if (isDirty()) await save('manual')
    } catch (e) {
      remote = null
      set({ state: 'conflict' })
      lastError = e instanceof ApiError ? e : null
    }
  }

  async function flush(): Promise<string> {
    await saving
    const conflict = () => new ApiError(409, 'This site was changed somewhere else. Choose which version to keep first.', 'site_conflict')
    if (status.state === 'conflict') throw conflict()
    const wait = notBefore - Date.now()
    if (wait > 0) {
      throw new ApiError(429, `Saving has to wait ${Math.ceil(wait / 60_000)} min more.`, 'github_rate_limited', { retryAfter: Math.ceil(wait / 1000) })
    }
    if (isDirty()) {
      clearTimeout(timer)
      await save('flush')
    }
    const after = status as SyncStatus
    if (after.state === 'conflict') throw conflict()
    const { commitSha, base } = store()
    if (isDirty() || !commitSha || !base) {
      throw lastError ?? new ApiError(0, after.state === 'loading' ? 'Your site is still loading.' : "Couldn't save your site to GitHub first.", 'save_failed')
    }
    return commitSha
  }

  return { load, changed, cancel, save, flush, resolve }
}
