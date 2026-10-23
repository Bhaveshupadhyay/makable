import { type AiResult, type AiStreamEvent, aiCreateRequestSchema } from '@makable/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { type AiPausedRun, type AiThread, answerCreate, createSite, errorMessage, threadKey } from '@/features/ai-edit'
import { useSession } from '@/features/auth'
import { useModelChoice, useModelRejected } from '@/features/ai-models'
import { getSite, useSiteStore } from '@/features/site'
import { analytics } from '@/shared/lib/analytics'
import { ApiError } from '@/shared/lib/api-client'
import { assistant, user } from '../lib/chat'
import { promptProblem } from '../lib/prompt'
import { useBuilderStore } from '../store'

// Errors that mean the picked model can't be used any more.
const MODEL_ERRORS = new Set(['ai_key_invalid', 'ai_key_not_found', 'ai_model_not_enabled', 'ai_model_required'])
export const TRY_AGAIN = 'Try again'

/** A creation in progress: what was asked, and how far it got. */
export type Creating = {
  prompt: string
  /** The steps so far, newest last (e.g. "Planning the site", "Writing src/App.tsx"). */
  steps: string[]
  /** Files written of those planned, while writing. */
  written: { done: number; total: number } | null
  /** When the request went out (`performance.now()`), for the time it's taking. */
  since: number
  /** When it answers one of its questions: the paused run as it was, and what the user sent it (the chat keeps showing both). */
  answering?: { run: AiPausedRun; sent: string }
}

/**
 * Builds a site from a prompt with the create agent: the request streams progress, pauses once to ask the site's
 * name (the question is in the site's thread, so it survives a reload), and ends with the site committed to its new
 * repo. One at a time; Stop ends it.
 */
export function useCreateSite() {
  const login = useSession().data?.login
  const queryClient = useQueryClient()
  const { choice } = useModelChoice()
  const modelRejected = useModelRejected()
  const [creating, setCreating] = useState<Creating | null>(null)
  const inFlight = useRef<AbortController | null>(null)

  async function stream(
    projectId: string,
    prompt: string,
    call: (signal: AbortSignal, onEvent: (event: AiStreamEvent) => void) => Promise<AiResult>,
    answering?: Creating['answering'],
  ) {
    if (inFlight.current) return
    const controller = new AbortController()
    inFlight.current = controller
    const started = performance.now()
    setCreating({ prompt, steps: [], written: null, since: started, answering })
    // What it did, also for a creation that fails or is stopped: the message saying so keeps them.
    let done: string[] = []
    const onEvent = (event: AiStreamEvent) => {
      if (event.type !== 'progress') return
      if (done.at(-1) !== event.message) done = [...done, event.message]
      setCreating((c) => {
        if (!c) return c
        const steps = c.steps.at(-1) === event.message ? c.steps : [...c.steps, event.message]
        const written = event.stage === 'write' && event.total ? { done: event.done ?? 0, total: event.total } : c.written
        return { ...c, steps, written }
      })
    }
    try {
      const result = await call(controller.signal, onEvent)
      if (result.status === 'created') {
        useSiteStore.getState().created(result.site, result.commitSha)
        analytics.track('site_created', { duration_ms: Math.round(performance.now() - started), model: choice?.model ?? 'makable-default' })
      }
    } catch (e) {
      const say = useBuilderStore.getState().say
      if (controller.signal.aborted) {
        say(projectId, user(prompt))
        say(projectId, assistant('Stopped. Nothing was built.', { replies: [TRY_AGAIN], steps: done }))
        return
      }
      const code = e instanceof ApiError ? (e.code ?? null) : null
      analytics.track('site_create_failed', { code, message: errorMessage(e) })
      const modelError = !!code && MODEL_ERRORS.has(code)
      if (modelError) void modelRejected(choice, code)
      say(projectId, user(prompt))
      say(projectId, assistant(errorMessage(e), { tone: 'error', replies: [TRY_AGAIN], steps: done, settingsLink: modelError }))
    } finally {
      if (inFlight.current === controller) inFlight.current = null
      // The thread has the next question, or the finished creation.
      await queryClient.invalidateQueries({ queryKey: threadKey(login, projectId) })
      // A Stop once the commit had started still builds the site: the thread has it, so open it.
      const thread = queryClient.getQueryData<AiThread>(threadKey(login, projectId))
      if (!useSiteStore.getState().site && thread?.turns.some((t) => t.outcome === 'applied')) {
        const files = await getSite(projectId).catch(() => null)
        if (files && useSiteStore.getState().projectId === projectId) useSiteStore.getState().loaded(files)
      }
      setCreating(null)
    }
  }

  /**
   * Starts building from `prompt`: the current site (`projectId` in the site store), or with `fresh` a new one in place
   * of the open site, once the prompt is known to go (a refused one leaves the open site as it was). Returns false
   * when it can't go.
   */
  function start(prompt: string, { fresh = false }: { fresh?: boolean } = {}): boolean {
    if (inFlight.current) return false
    const problem = promptProblem(prompt)
    if (problem) {
      // The description stays in the chat, to shorten it.
      const { projectId } = useSiteStore.getState()
      const say = useBuilderStore.getState().say
      say(projectId, user(prompt.trim()))
      say(projectId, assistant(problem, { tone: 'error' }))
      return false
    }
    if (fresh) {
      const store = useSiteStore.getState()
      if (store.site) store.newSite()
      else useSiteStore.setState({ autoOpen: false })
    }
    const { projectId } = useSiteStore.getState()
    const request = aiCreateRequestSchema.safeParse({ projectId, prompt, ...(choice ? { model: choice } : {}) })
    if (!request.success) return false
    analytics.track('site_create_started', { prompt: request.data.prompt, model: choice?.model ?? 'makable-default' })
    void stream(projectId, request.data.prompt, (signal, onEvent) => createSite(request.data, onEvent, signal))
    return true
  }

  /** Answers the creation's question (the site's name, or one about the site); with `chat`, sends a message about it instead. */
  function answer(run: AiPausedRun, text: string, { chat = false }: { chat?: boolean } = {}) {
    if (inFlight.current || !text.trim()) return
    const { projectId } = useSiteStore.getState()
    const asked = run.question?.kind ?? 'project_name'
    if (chat) analytics.track('ai_question_chatted', { question: asked, message: text })
    else analytics.track('ai_question_answered', { question: asked, answer: text, option: run.question?.options.includes(text) ?? false })
    const call = (signal: AbortSignal, onEvent: (event: AiStreamEvent) => void) =>
      answerCreate(projectId, { runId: run.runId, answer: text.trim(), chat }, onEvent, signal)
    void stream(projectId, run.instruction, call, { run, sent: text.trim() })
  }

  function stop() {
    inFlight.current?.abort()
  }

  return { creating, start, answer, stop }
}

export type CreateSite = ReturnType<typeof useCreateSite>
