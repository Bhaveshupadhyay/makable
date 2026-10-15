// After an AI change is put in the preview, how did it go? The preview engine reports `loading`, then `ready` or
// `error`. The verdict waits for the reload the change starts, then for the page to finish, then a moment more for an
// error thrown once it runs.

export type PreviewStatus = { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: { title: string; message: string; path?: string; line?: number } }

export type Verdict = { ok: true } | { ok: false; error: { message: string; path?: string; line?: number } }

export type VerdictTiming = {
  /** How long to wait for the change to start a reload. Without one (nothing the page uses changed), the state now counts. */
  startMs: number
  /** How long a reload may take. Past it, the change is accepted: the server already checked its code. */
  loadMs: number
  /** How long a loaded page is watched for an error. */
  settleMs: number
}

export const VERDICT_TIMING: VerdictTiming = { startMs: 2_500, loadMs: 45_000, settleMs: 1_500 }

/** The longest preview error the server takes (makable-backend `MAX_PREVIEW_ERROR` × 4). */
const MAX_MESSAGE = 4_000
const SAFE_PATH = /^(?!.*(?:^|\/)\.{1,2}(?:\/|$))[\w.@-]+(?:\/[\w.@-]+)*$/

/**
 * Resolves with how the preview went. `subscribe` must call the listener with the current state right away (as the
 * preview engine does) and on every change after. `signal` stops waiting (resolves `ok`, unused).
 */
export function previewVerdict(
  subscribe: (listener: (state: PreviewStatus) => void) => () => void,
  timing: VerdictTiming = VERDICT_TIMING,
  signal?: AbortSignal,
): Promise<Verdict> {
  return new Promise((resolve) => {
    let current: PreviewStatus = { status: 'loading' }
    let reloading = false
    let settled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const after = (ms: number, run: () => void) => timers.push(setTimeout(run, ms))
    let unsubscribe = () => {}
    const finish = (verdict: Verdict) => {
      if (settled) return
      settled = true
      timers.forEach(clearTimeout)
      unsubscribe()
      signal?.removeEventListener('abort', onAbort)
      resolve(verdict)
    }
    const onAbort = () => finish({ ok: true })
    signal?.addEventListener('abort', onAbort)

    const onState = (state: PreviewStatus) => {
      current = state
      if (!reloading) {
        if (state.status === 'loading') reloading = true
        return
      }
      if (state.status === 'error') finish(toVerdict(state))
      else if (state.status === 'ready') after(timing.settleMs, () => current.status === 'ready' && finish({ ok: true }))
    }
    // The first call is the state from before the change: it only counts if no reload starts.
    let first = true
    unsubscribe = subscribe((state) => {
      if (first) {
        first = false
        current = state
        return
      }
      onState(state)
    })
    after(timing.startMs, () => {
      if (reloading) return
      if (current.status === 'error') finish(toVerdict(current))
      else if (current.status === 'ready') finish({ ok: true })
      else reloading = true
    })
    after(timing.startMs + timing.loadMs, () => finish({ ok: true }))
  })
}

function toVerdict(state: PreviewStatus): Verdict {
  if (state.status !== 'error') return { ok: true }
  const { title, message, path, line } = state.error
  const text = [title, message].filter(Boolean).join(': ').slice(0, MAX_MESSAGE) || 'The preview showed an error.'
  const repoPath = path?.replace(/^\/+/, '')
  return {
    ok: false,
    error: {
      message: text,
      ...(repoPath && SAFE_PATH.test(repoPath) ? { path: repoPath } : {}),
      ...(line && line >= 1 ? { line } : {}),
    },
  }
}
