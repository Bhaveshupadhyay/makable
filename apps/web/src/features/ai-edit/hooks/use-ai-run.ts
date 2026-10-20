import { type AiEditRequest, type AiEditTarget, type AiResult, aiEditRequestSchema, MAX_INSTRUCTION, MAX_SCREENSHOT_CHARS } from '@makable/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSession } from '@/features/auth'
import { useModelChoice, useModelRejected } from '@/features/ai-models'
import { undoChange, useSiteStore } from '@/features/site'
import { analytics } from '@/shared/lib/analytics'
import { ApiError } from '@/shared/lib/api-client'
import { type AiPausedRun, type AiThread, answerEdit, dismissRun, reportResult, sendEdit } from '../api/ai'
import { type PreviewStatus, previewVerdict } from '../lib/preview-verdict'
import { targetLabel } from '../lib/target-label'
import { threadKey, useThread } from './use-thread'

// Errors that mean the picked model can't be used any more.
const MODEL_ERRORS = new Set(['ai_key_invalid', 'ai_key_not_found', 'ai_model_not_enabled', 'ai_model_required'])
// Errors the user fixes in Settings → AI models (another key or model), so the error links there.
const SETTINGS_ERRORS = new Set([...MODEL_ERRORS, 'ai_unavailable', 'ai_rate_limited'])

/** What the AI is doing now, for the chat and the AI box. */
export type AiPending = {
  instruction: string
  target: string | null
  /** `thinking`: waiting for the AI. `checking`: its change is in the preview. `saving`: committing it. */
  phase: 'thinking' | 'checking' | 'saving'
  /** When the request went out (`performance.now()`), for the time it's taking. */
  since: number
  /** When it answers a question: the paused run as it was, and what the user sent it (the chat keeps showing both). */
  answering?: { run: AiPausedRun; sent: string }
}

type Deps = {
  /** Saves the user's own edits and gives the commit the site is at (see `useSiteSync`). */
  flush: () => Promise<string>
  /** The preview's state, now and as it changes (see `usePreviewEngine`). */
  subscribePreview: (listener: (state: PreviewStatus) => void) => () => void
  /** The preview is showing the site (its files are loaded), so a change can be tried in it. */
  previewReady: boolean
  /** A picture of the selected element, for models that read images; undefined when there's none. */
  capture: () => Promise<string | undefined>
  /** The site may have a commit this browser didn't see (a Stop while the AI committed): load it again. */
  reload: () => void
  /**
   * Adds a note to the chat for a request that ended without a turn in the thread (it failed or was stopped), or for
   * an error with no request (an Undo that failed). The server keeps only finished requests.
   */
  note: (note: AiNote) => void
}

/** A request the thread won't show (`instruction`, null for none) and what came of it. */
export type AiNote = { instruction: string | null; target: string | null; text: string; error: boolean; settings?: boolean }

/**
 * AI edits of the site, as one run at a time: the request goes out on the site's commit (the user's edits are saved
 * first), the change comes back to be tried in the preview, and how the preview went is reported, which commits it
 * (or has the AI fix it). Questions the AI asks wait in the chat. The chat itself is the site's thread on the server.
 */
export function useAiRun(deps: Deps) {
  const login = useSession().data?.login
  const projectId = useSiteStore((s) => s.projectId)
  const queryClient = useQueryClient()
  const { choice, acceptsImages } = useModelChoice()
  const modelRejected = useModelRejected()
  const thread = useThread(projectId)
  const [pending, setPending] = useState<AiPending | null>(null)
  const [error, setError] = useState<{ message: string; inSettings: boolean } | null>(null)
  // The run in progress: Stop aborts it. `phase` says what stopping it means.
  const inFlight = useRef<{ controller: AbortController; phase: AiPending['phase']; started: number; instruction: string; target: string | null } | null>(null)
  const latest = useRef(deps)
  useEffect(() => {
    latest.current = deps
  })

  const refreshThread = () => queryClient.invalidateQueries({ queryKey: threadKey(login, projectId) })

  /** Runs one request (and its preview rounds) to the end. */
  async function run(
    instruction: string,
    target: string | null,
    start: (signal: AbortSignal) => Promise<AiResult>,
    model: string,
    answering?: AiPending['answering'],
  ) {
    if (inFlight.current) return
    const controller = new AbortController()
    const started = performance.now()
    inFlight.current = { controller, phase: 'thinking', started, instruction, target }
    setError(null)
    setPending({ instruction, target, phase: 'thinking', since: started, answering })
    const phase = (next: AiPending['phase']) => {
      if (inFlight.current?.controller === controller) inFlight.current.phase = next
      setPending((p) => p && { ...p, phase: next })
    }
    const site = useSiteStore.getState()
    try {
      let result = await start(controller.signal)
      for (let round = 0; result.status === 'awaiting_result' && round < 5; round++) {
        phase('checking')
        site.setTrying(result.files)
        const verdict = await previewVerdict(latest.current.subscribePreview, undefined, controller.signal)
        if (controller.signal.aborted) return
        phase(verdict.ok ? 'saving' : 'thinking')
        result = await reportResult(projectId, { runId: result.runId, ...verdict }, controller.signal)
      }
      useSiteStore.getState().setTrying(null)
      if (result.status === 'applied' || result.status === 'created') useSiteStore.getState().committed(result.commitSha, 'files' in result ? result.files : {})
      analytics.track('ai_edit_finished', {
        instruction,
        status: result.status,
        summary: 'summary' in result ? result.summary : '',
        changed_paths: 'files' in result ? Object.keys(result.files) : [],
        model,
        duration_ms: Math.round(performance.now() - started),
      })
    } catch (e) {
      useSiteStore.getState().setTrying(null)
      if (controller.signal.aborted) return
      const code = e instanceof ApiError ? (e.code ?? null) : null
      analytics.track('ai_edit_failed', {
        instruction,
        code,
        status: e instanceof ApiError ? e.status : null,
        message: errorMessage(e),
        model,
        duration_ms: Math.round(performance.now() - started),
      })
      if (code && MODEL_ERRORS.has(code)) void modelRejected(choice, code)
      // The site moved on GitHub (another device, or a change this tab missed): load it, and the user sends again.
      if (code === 'site_conflict') latest.current.reload()
      const inSettings = !!code && SETTINGS_ERRORS.has(code)
      setError({ message: errorMessage(e), inSettings })
      latest.current.note({ instruction, target, text: errorMessage(e), error: true, settings: inSettings })
    } finally {
      if (inFlight.current?.controller === controller) inFlight.current = null
      // The chat shows the request as pending until the thread has it.
      await refreshThread()
      setPending(null)
    }
  }

  /** Sends a request about the selected element (or, without one, the whole site). Returns false if it can't go. */
  async function send(instruction: string, target: AiEditTarget | null): Promise<boolean> {
    if (inFlight.current) return false
    const label = target && targetLabel(target)
    let baseCommit: string
    try {
      baseCommit = await latest.current.flush()
    } catch (e) {
      setError({ message: errorMessage(e), inSettings: false })
      latest.current.note({ instruction, target: label, text: errorMessage(e), error: true })
      return false
    }
    const screenshot = target && acceptsImages ? await latest.current.capture() : undefined
    const parsed = aiEditRequestSchema.safeParse({
      projectId,
      baseCommit,
      instruction,
      target,
      ...(screenshot && screenshot.length <= MAX_SCREENSHOT_CHARS ? { screenshot } : {}),
      ...(choice ? { model: choice } : {}),
    })
    if (!parsed.success) {
      analytics.track('ai_edit_invalid', { length: instruction.length })
      setError({ message: `This request can't be sent. Keep it under ${MAX_INSTRUCTION} characters.`, inSettings: false })
      return false
    }
    const request: AiEditRequest = parsed.data
    const model = choice?.model ?? 'makable-default'
    analytics.track('ai_edit_requested', {
      instruction: request.instruction,
      model,
      model_key: choice?.keyId ?? null,
      target_label: label,
      target_tag: target?.tag ?? null,
      target_text: target?.text ?? null,
      target_source: target?.source ? `${target.source.path}:${target.source.line}` : null,
      target_selector: target?.selector ?? null,
      screenshot: !!request.screenshot,
    })
    void run(request.instruction, label, (signal) => sendEdit(request, signal), model)
    return true
  }

  /** Answers the question the paused run asked; with `chat`, sends a message about it instead (the AI replies and asks again). */
  async function answer(text: string, { chat = false }: { chat?: boolean } = {}): Promise<boolean> {
    const paused = thread.data?.run
    if (inFlight.current || !paused?.question || paused.mode !== 'edit') return false
    let baseCommit: string
    try {
      baseCommit = await latest.current.flush()
    } catch (e) {
      setError({ message: errorMessage(e), inSettings: false })
      latest.current.note({ instruction: null, target: null, text: errorMessage(e), error: true })
      return false
    }
    if (chat) analytics.track('ai_question_chatted', { question: paused.question.question, message: text })
    else analytics.track('ai_question_answered', { question: paused.question.question, answer: text, option: paused.question.options.includes(text) })
    const model = choice?.model ?? 'makable-default'
    const answering = { run: paused, sent: text }
    void run(paused.instruction, paused.target, (signal) => answerEdit(projectId, { runId: paused.runId, answer: text, baseCommit, chat }, signal), model, answering)
    return true
  }

  /** Dismisses the paused run's question without a change. */
  async function skip() {
    if (inFlight.current) return
    try {
      await dismissRun(projectId)
    } catch (e) {
      latest.current.note({ instruction: null, target: null, text: errorMessage(e), error: true })
    }
    await refreshThread()
  }

  /** Stops the request in progress. A change being committed may still land; the site is loaded again to see. */
  function stop() {
    const current = inFlight.current
    if (!current) return
    inFlight.current = null
    current.controller.abort()
    useSiteStore.getState().setTrying(null)
    analytics.track('ai_edit_stopped', { instruction: current.instruction, phase: current.phase, duration_ms: Math.round(performance.now() - current.started) })
    latest.current.note({
      instruction: current.instruction,
      target: current.target,
      text: current.phase === 'saving' ? 'Stopped. The change was already being saved, so it may be in your site.' : 'Stopped. Nothing was changed.',
      error: false,
    })
    // Waiting for the preview: the run is paused on the server, so end it there too.
    if (current.phase === 'checking') void dismissRun(projectId).catch(() => {}).finally(refreshThread)
    if (current.phase === 'saving') latest.current.reload()
  }

  /** Undoes an AI change (its commit) with a new commit. Resolves whether it was undone. */
  async function undo(commitSha: string): Promise<boolean> {
    if (inFlight.current) return false
    setError(null)
    try {
      const baseCommit = await latest.current.flush()
      const undone = await undoChange(projectId, commitSha, baseCommit)
      useSiteStore.getState().committed(undone.commitSha, undone.files)
      analytics.track('ai_edit_undone', { commit_sha: commitSha })
      return true
    } catch (e) {
      latest.current.note({ instruction: null, target: null, text: errorMessage(e), error: true })
      return false
    }
  }

  // A run left waiting for the preview (the tab closed while it checked): try its change now. Once per run.
  const resumed = useRef(new Set<string>())
  const runLatest = useRef(run)
  useEffect(() => {
    runLatest.current = run
  })
  const waiting = thread.data?.status === 'awaiting_result' ? thread.data.run : null
  const model = choice?.model ?? 'makable-default'
  const { previewReady } = deps
  useEffect(() => {
    if (!previewReady || !waiting?.preview || waiting.mode !== 'edit' || inFlight.current || resumed.current.has(waiting.runId)) return
    resumed.current.add(waiting.runId)
    const { runId, preview } = waiting
    void runLatest.current(waiting.instruction, waiting.target, async () => ({ status: 'awaiting_result', runId, summary: preview.summary, files: preview.files }), model)
  }, [waiting, model, previewReady])

  const question = thread.data?.status === 'needs_input' && thread.data.run?.mode === 'edit' ? thread.data.run : null

  return {
    thread: thread.data ?? null,
    threadLoading: thread.isPending,
    pending,
    /** True while a request runs: the user's own editing waits, since the AI's answer is for the site as it was. */
    busy: pending !== null,
    /** The paused run's question, when one waits for the user. */
    question,
    error,
    clearError: () => setError(null),
    send,
    answer,
    skip,
    stop,
    undo,
  }
}

export type AiRun = ReturnType<typeof useAiRun>

/** The backend's messages are written for users; anything else means the request never got an answer. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Connect GitHub again to use AI.'
    if (error.code === 'site_conflict') return 'Your site was changed somewhere else, so I loaded the latest version. Send your request again.'
    if (error.code) return error.message
  }
  return "Couldn't reach the server. Check your connection and try again."
}

export type { AiThread }
