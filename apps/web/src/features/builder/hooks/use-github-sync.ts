import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/lib/api-client'
import { getLatestSession, getSession, saveSession } from '../api/workspace'
import { WORKSPACE_REPO } from '../lib/conversation'
import { fingerprint, fitsKeepalive, hasContent, nextSaveDelay, RETRY_DELAY_MS, retryAfterMs } from '../lib/github-sync'
import { parseSession, type SessionState, toSnapshot } from '../lib/session-file'
import { useBuilderStore } from '../store'
import type { Builder } from './use-builder'

export type SyncStatus =
  | { state: 'off' }
  /** Nothing to save yet (no site started). */
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved'; at: string }
  /** Saving failed; it's tried again later. */
  | { state: 'error'; message: string }
  /** Saving needs the user first (a repo makable won't touch, or GitHub must be reconnected). */
  | { state: 'blocked'; message: string }
  /** Another device saved this session since this browser last did. Nothing was overwritten. */
  | { state: 'conflict'; remoteSha: string | null; remoteSavedAt: string | null }

type Reason = 'change' | 'retry' | 'hidden' | 'close' | 'manual'
type Context = { active: boolean; account: string | null; builder: Pick<Builder, 'sync'> }

// Errors the user has to act on; retrying won't help.
const BLOCKING = new Set(['workspace_repo_taken', 'workspace_repo_public', 'github_reconnect', 'workspace_session_too_large'])

/**
 * Keeps the session saved in the user's private GitHub workspace: after a 30 s pause in changes (at
 * least every 2 min while editing nonstop), right away when the tab is hidden, and with a `keepalive`
 * request when the page closes. A GitHub rate limit pauses saving for as long as GitHub asks. On a browser with no
 * session it restores the newest one from GitHub. Only for a signed-in user, and only their own session.
 */
export function useGithubSync(builder: Pick<Builder, 'sync' | 'status'>) {
  const { account, enabled } = builder.sync
  const active = !!account && enabled && builder.status === 'ready'
  const [status, setStatus] = useState<SyncStatus>({ state: 'idle' })
  const [sync] = useState(() => createGithubSync({ active, account, builder }, setStatus))
  // The controller runs later (timers, window events): keep it on the newest context.
  useEffect(() => {
    sync.update({ active, account, builder })
  })

  // Save after a pause in changes (and once on start, for changes from a past visit).
  useEffect(() => {
    if (!active) return
    sync.changed()
    const unsubscribe = useBuilderStore.subscribe((s, prev) => {
      if (s.conversation !== prev.conversation || s.fileEdits !== prev.fileEdits || s.aiHistory !== prev.aiHistory || s.projectId !== prev.projectId) {
        sync.changed()
      }
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

  // A browser with no session (new device, cleared data): bring back the newest one from GitHub.
  useEffect(() => {
    if (active && account) void sync.restoreLatest(account)
  }, [active, account, sync])

  return {
    status: active ? status : ({ state: 'off' } as const),
    enabled,
    setEnabled: builder.sync.setEnabled,
    saveNow: () => void sync.save('manual'),
    /** Resolves a conflict: keep this browser's version (overwrite GitHub's) or load GitHub's (replace this one). */
    resolve: (choice: 'keep' | 'load') => void sync.resolve(choice),
    repoUrl: builder.sync.synced?.repoUrl ?? (account ? `https://github.com/${account}/${WORKSPACE_REPO}` : null),
  }
}

export type GithubSync = ReturnType<typeof useGithubSync>

/** The saving logic, outside React so timers and window events always act on the newest state. */
function createGithubSync(initial: Context, onStatus: (status: SyncStatus) => void) {
  let context = initial
  let status: SyncStatus = { state: 'idle' }
  let timer: ReturnType<typeof setTimeout> | undefined
  let saving = false
  let again = false
  // When the oldest change not yet saved happened (for the maximum wait), and GitHub's wait after a rate limit.
  let firstUnsavedAt: number | null = null
  let notBefore = 0
  const restored = new Set<string>()

  const set = (next: SyncStatus) => {
    status = next
    onStatus(next)
  }

  function schedule(delay: number, reason: Reason) {
    clearTimeout(timer)
    timer = setTimeout(() => void save(reason), Math.max(delay, notBefore - Date.now()))
  }

  /** The session changed: save after a pause, but within the maximum wait of the first unsaved change. */
  function changed() {
    const now = Date.now()
    firstUnsavedAt ??= now
    schedule(nextSaveDelay(now, firstUnsavedAt, notBefore), 'change')
  }

  function cancel() {
    clearTimeout(timer)
  }

  async function save(reason: Reason, baseOverride?: string | null): Promise<void> {
    const { active, account, builder } = context
    if (!active || !account) return
    if (saving) {
      again = true
      return
    }
    // A conflict or a blocked save waits for the user; only their own action retries it.
    if ((status.state === 'conflict' || status.state === 'blocked') && reason !== 'manual') return
    // GitHub asked to wait: the retry timer is already set for when it's over.
    if (Date.now() < notBefore) return
    firstUnsavedAt = null
    const store = useBuilderStore.getState()
    // Never save another account's session (it's hidden until the store is reset for this one).
    if (store.login !== account) return
    if (!hasContent(store)) return set({ state: 'idle' })
    const print = fingerprint(store)
    const baseSha = baseOverride !== undefined ? baseOverride : (store.synced?.sha ?? null)
    if (baseOverride === undefined && store.synced?.fingerprint === print) return set({ state: 'saved', at: store.synced.at })

    const snapshot = toSnapshot(store, account, new Date())
    const keepalive = reason === 'close' && fitsKeepalive(JSON.stringify({ snapshot, baseSha }))
    saving = true
    set({ state: 'saving' })
    try {
      const saved = await saveSession(snapshot, baseSha, { keepalive })
      useBuilderStore.getState().markSynced({ sha: saved.sha, repoUrl: saved.repoUrl, fingerprint: print, at: snapshot.exportedAt })
      set({ state: 'saved', at: snapshot.exportedAt })
      builder.sync.announce()
    } catch (e) {
      failed(e, baseSha)
    } finally {
      saving = false
    }
    if (again) {
      again = false
      await save('change')
    }
  }

  function failed(e: unknown, baseSha: string | null) {
    if (e instanceof ApiError && e.code === 'workspace_conflict') {
      // Another tab of this browser saved meanwhile: its version is this one's past, so save over it.
      if ((useBuilderStore.getState().synced?.sha ?? null) !== baseSha) {
        again = true
        return
      }
      const details = (e.details ?? {}) as { sha?: string; exportedAt?: string }
      return set({ state: 'conflict', remoteSha: details.sha ?? null, remoteSavedAt: details.exportedAt ?? null })
    }
    if (e instanceof ApiError && (e.status === 401 || (e.code && BLOCKING.has(e.code)))) {
      return set({ state: 'blocked', message: e.code === 'unauthorized' ? 'Connect GitHub again to keep saving.' : e.message })
    }
    const wait = e instanceof ApiError && e.code === 'github_rate_limited' ? retryAfterMs(e.details) : null
    if (wait !== null) {
      notBefore = Date.now() + wait
      const at = new Date(notBefore).toLocaleTimeString(undefined, { timeStyle: 'short' })
      set({ state: 'error', message: `GitHub asked makable to slow down. Saving again at ${at}.` })
      return schedule(wait, 'retry')
    }
    set({ state: 'error', message: e instanceof ApiError && e.code ? e.message : "Couldn't reach GitHub. Trying again soon." })
    schedule(RETRY_DELAY_MS, 'retry')
  }

  function apply(state: SessionState, snapshot: { exportedAt: string; login: string | null }, sha: string) {
    context.builder.sync.restore(state, snapshot, { sha, repoUrl: null, fingerprint: fingerprint(state), at: snapshot.exportedAt })
    set({ state: 'saved', at: snapshot.exportedAt })
  }

  async function restoreLatest(account: string) {
    if (restored.has(account)) return
    restored.add(account)
    const store = useBuilderStore.getState()
    if (store.login !== account || hasContent(store) || store.synced) return
    try {
      const found = await getLatestSession()
      const now = useBuilderStore.getState()
      // The user started a site while this loaded: keep theirs.
      if (!found || hasContent(now) || now.login !== account) return
      const read = parseSession(found.snapshot)
      if (read.ok) apply(read.state, read.snapshot, found.sha)
    } catch {
      // Restoring is a convenience: on failure the user starts fresh, and saving reports its own errors.
    }
  }

  async function resolve(choice: 'keep' | 'load') {
    if (status.state !== 'conflict') return
    const { remoteSha } = status
    const projectId = useBuilderStore.getState().projectId
    try {
      if (choice === 'keep') return await save('manual', remoteSha ?? (await getSession(projectId))?.sha ?? null)
      const found = await getSession(projectId)
      const read = found && parseSession(found.snapshot)
      if (!found || !read?.ok) return set({ state: 'error', message: "Couldn't load the version on GitHub." })
      apply(read.state, read.snapshot, found.sha)
    } catch (e) {
      failed(e, null)
    }
  }

  function update(next: Context) {
    context = next
  }

  return { update, changed, cancel, save, restoreLatest, resolve }
}
