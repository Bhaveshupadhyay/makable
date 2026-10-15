import type { AiCreateRequest, AiEditRequest, AiQuestion, AiResult, AiStreamEvent } from '@makable/shared'
import { ApiError, backendFetch, backendStream } from '@/shared/lib/api-client'
import { readJsonLines } from '../lib/json-lines'

// AI requests through makable-backend. The browser sends the request and the site's commit; the server reads the
// code from the site's repo, runs the agent, and keeps the chat (the thread). Prompts never leave the server.

export type AiTurn = {
  instruction: string
  target: string | null
  /** `applied`, `escalated`, `failed`, `cancelled`, `skipped`... (makable-backend `AiEditOutcome`). */
  outcome: string
  reply: string
  questions: { question: string; answer: string }[]
  commitSha?: string | null
  createdAt: string
}

/** A run waiting for the user (its question) or for the preview (the edits to try). */
export type AiPausedRun = {
  runId: string
  mode: 'edit' | 'create'
  instruction: string
  target: string | null
  question?: AiQuestion | null
  preview?: { summary: string; files: Record<string, string | null> } | null
}

export type AiThread = { projectId: string; status: 'idle' | 'needs_input' | 'awaiting_result'; turns: AiTurn[]; run?: AiPausedRun | null }

const json = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: 'POST',
  signal,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function sendEdit(request: AiEditRequest, signal?: AbortSignal): Promise<AiResult> {
  return backendFetch<AiResult>('/ai/edit', json(request, signal))
}

export function answerEdit(
  projectId: string,
  body: { runId: string; answer: string; baseCommit: string; screenshot?: string },
  signal?: AbortSignal,
): Promise<AiResult> {
  return backendFetch<AiResult>(`/ai/edit/${projectId}/answer`, json(body, signal))
}

/** How the preview went with a run's edits: `ok` commits them; an error goes back to the AI to fix. */
export function reportResult(
  projectId: string,
  body: { runId: string; ok: boolean; error?: { message: string; path?: string; line?: number } },
  signal?: AbortSignal,
): Promise<AiResult> {
  return backendFetch<AiResult>(`/ai/edit/${projectId}/result`, json(body, signal))
}

export function getThread(projectId: string): Promise<AiThread> {
  return backendFetch<AiThread>(`/ai/threads/${projectId}`)
}

/** Ends the run that's waiting for the user's answer, without a change. */
export function dismissRun(projectId: string): Promise<void> {
  return backendFetch<void>(`/ai/threads/${projectId}/run`, { method: 'DELETE' })
}

/** Builds a site from a prompt, reporting progress as it goes. Resolves with how it ended. */
export function createSite(request: AiCreateRequest, onEvent: (event: AiStreamEvent) => void, signal?: AbortSignal): Promise<AiResult> {
  return stream('/ai/create', request, onEvent, signal)
}

/** Answers the creation's question (the site's name), streamed like `createSite`. */
export function answerCreate(
  projectId: string,
  body: { runId: string; answer: string },
  onEvent: (event: AiStreamEvent) => void,
  signal?: AbortSignal,
): Promise<AiResult> {
  return stream(`/ai/create/${projectId}/answer`, body, onEvent, signal)
}

async function stream(path: string, body: unknown, onEvent: (event: AiStreamEvent) => void, signal?: AbortSignal): Promise<AiResult> {
  const init = json(body, signal)
  const res = await backendStream(path, { ...init, headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' } })
  // How the stream ended. An object, since the reader's callback sets it.
  const end: { result: AiResult | null; error: ApiError | null } = { result: null, error: null }
  await readJsonLines(res.body!, (line) => {
    const event = line as AiStreamEvent
    if (event.type === 'result') end.result = event.data
    else if (event.type === 'error') end.error = new ApiError(res.status, event.error.message, event.error.code, event.error.details)
    else onEvent(event)
  })
  if (end.error) throw end.error
  if (!end.result) throw new ApiError(0, 'The connection to the makable server was lost.', 'stream_ended')
  return end.result
}
