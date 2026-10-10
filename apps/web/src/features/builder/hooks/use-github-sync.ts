import { useEffect, useState } from 'react'
import { workspaceStateSchema } from '@makable/shared'
import { ApiError } from '@/shared/lib/api-client'
import { getLatestState, getPart, getState, type SavedState, saveBatch, saveBody } from '../api/workspace'
import { WORKSPACE_REPO } from '../lib/conversation'
import { fitsKeepalive, hasContent, nextSaveDelay, RETRY_DELAY_MS, retryAfterMs } from '../lib/github-sync'
import { fromWorkspaceFiles, hashFiles, listedParts, planSave, toWorkspaceFiles } from '../lib/workspace-files'
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

// Answers that say how long to wait (`details.retryAfter`), and what to tell the user meanwhile.
const SLOW_DOWN: Record<string, string> = {
  github_rate_limited: 'GitHub asked makable to slow down.',
  service_busy: 'The makable server is busy.',
  too_many_requests: 'Saving too often.',
}

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

    saving = true
    // Data saved in an older format has no hashes: start over as if never saved from here.
    const synced = store.synced?.hashes ? store.synced : null
    // Keeping this browser's version over another device's sends everything, on top of theirs.
    const keepOver = baseOverride !== undefined
    let baseSha = keepOver ? baseOverride : (synced?.sha ?? null)
    try {
      const files = toWorkspaceFiles(store, account, new Date())
      const hashes = await hashFiles(files)
      const batches = planSave(files, hashes, keepOver ? null : (synced?.hashes ?? null))
      if (!batches) return set({ state: 'saved', at: synced?.at ?? files.state.savedAt })
      set({ state: 'saving' })
      let repoUrl = synced?.repoUrl ?? null
      for (const batch of batches) {
        // Only a small, single-batch save can go out as the page closes (browsers cap keepalive bodies).
        const keepalive = reason === 'close' && batches.length === 1 && fitsKeepalive(saveBody(batch, baseSha))
        const saved = await saveBatch(store.projectId, batch, baseSha, { keepalive })
        baseSha = saved.sha
        repoUrl = saved.repoUrl
      }
      useBuilderStore.getState().markSynced({ sha: baseSha, repoUrl, hashes, at: files.state.savedAt })
      set({ state: 'saved', at: files.state.savedAt })
      builder.sync.announce()
    } catch (e) {
      failed(e, keepOver ? undefined : (synced?.sha ?? null))
    } finally {
      saving = false
    }
    if (again) {
      again = false
      await save('change')
    }
  }

  /** `baseSha` is the saved state the failed save built on (undefined when it overrode a conflict). */
  function failed(e: unknown, baseSha?: string | null) {
    if (e instanceof ApiError && e.code === 'workspace_conflict') {
      // Another tab of this browser saved meanwhile: its version is this one's past, so save over it.
      if (baseSha !== undefined && (useBuilderStore.getState().synced?.sha ?? null) !== baseSha) {
        again = true
        return
      }
      const details = (e.details ?? {}) as { sha?: string; savedAt?: string }
      return set({ state: 'conflict', remoteSha: details.sha ?? null, remoteSavedAt: details.savedAt ?? null })
    }
    if (e instanceof ApiError && (e.status === 401 || (e.code && BLOCKING.has(e.code)))) {
      return set({ state: 'blocked', message: e.code === 'unauthorized' ? 'Connect GitHub again to keep saving.' : e.message })
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

  /**
   * Downloads a saved session (its state, then each file the state lists) and makes it the current one.
   * `isStillWanted` is checked before replacing anything, since the download takes a moment.
   */
  async function load(saved: SavedState, isStillWanted: () => boolean): Promise<boolean> {
    const state = workspaceStateSchema.safeParse(saved.state)
    if (!state.success) return false
    const parts: Record<string, string> = {}
    const paths = listedParts(state.data)
    // A few at a time: a long chat is many small files.
    for (let i = 0; i < paths.length; i += 4) {
      const batch = paths.slice(i, i + 4)
      const contents = await Promise.all(batch.map((path) => getPart(state.data.projectId, path)))
      batch.forEach((path, k) => (parts[path] = contents[k]))
    }
    const read = fromWorkspaceFiles({ state: state.data, parts })
    if (!read.ok || !isStillWanted()) return false
    // Hashed as this browser will write them, so the next save sends only real changes.
    const hashes = await hashFiles(toWorkspaceFiles(read.state, state.data.login, new Date(state.data.savedAt)))
    context.builder.sync.restore(read.state, read.snapshot, { sha: saved.sha, repoUrl: null, hashes, at: state.data.savedAt })
    set({ state: 'saved', at: state.data.savedAt })
    return true
  }

  async function restoreLatest(account: string) {
    if (restored.has(account)) return
    restored.add(account)
    const store = useBuilderStore.getState()
    if (store.login !== account || hasContent(store) || store.synced) return
    try {
      const found = await getLatestState()
      // The user started a site while this loaded: keep theirs.
      const untouched = () => {
        const now = useBuilderStore.getState()
        return !hasContent(now) && now.login === account
      }
      if (found && untouched()) await load(found, untouched)
    } catch {
      // Restoring is a convenience: on failure the user starts fresh, and saving reports its own errors.
    }
  }

  async function resolve(choice: 'keep' | 'load') {
    if (status.state !== 'conflict') return
    const { remoteSha } = status
    const projectId = useBuilderStore.getState().projectId
    try {
      if (choice === 'keep') return await save('manual', remoteSha ?? (await getState(projectId))?.sha ?? null)
      const found = await getState(projectId)
      if (!found || !(await load(found, () => true))) set({ state: 'error', message: "Couldn't load the version on GitHub." })
    } catch (e) {
      failed(e)
    }
  }

  function update(next: Context) {
    context = next
  }

  return { update, changed, cancel, save, restoreLatest, resolve }
}
