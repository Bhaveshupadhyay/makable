import { type AiEditRequest, type AiEditTarget, type AiEditTurn, MAX_INSTRUCTION, type TemplateEntry } from '@makable/shared'
import { useIsMutating, useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useModelChoice, useModelRejected } from '@/features/ai-models'
import type { SiteDraft } from '@/features/visual-edit'
import { analytics } from '@/shared/lib/analytics'
import { ApiError } from '@/shared/lib/api-client'
import { type AiEditResponse, sendAiEdit } from '../api/ai-edit'
import { applyEditResult } from '../lib/apply-edit-result'
import { buildEditRequest, targetLabel } from '../lib/build-edit-request'

const MUTATION_KEY = ['ai-edit']
// Errors that mean the picked model can't be used any more.
const MODEL_ERRORS = new Set(['ai_key_invalid', 'ai_key_not_found', 'ai_model_not_enabled', 'ai_model_required'])
// Errors the user fixes in Settings → AI models (another key or model), so the box links there.
const SETTINGS_ERRORS = new Set([...MODEL_ERRORS, 'ai_unavailable', 'ai_rate_limited'])

/**
 * True while an AI request is pending. Usable before `useAiEdit` in the same component, so other
 * editors can lock themselves while it runs.
 */
export function useAiEditPending() {
  return useIsMutating({ mutationKey: MUTATION_KEY }) > 0
}

// A preview error this soon after an AI change is blamed on it.
const ROLLBACK_WINDOW_MS = 15_000

type UseAiEditOptions = {
  template: Pick<TemplateEntry, 'id' | 'name' | 'kind' | 'version' | 'contentPath'>
  /** The project files the preview shows (template files + content file + AI-edited files). */
  files: Record<string, string>
  draft: SiteDraft
  /** Takes the edited draft. Pass the visual editor's `applyDraft` so the change can be undone. */
  onApply: (draft: SiteDraft) => void
  /** Undoes the last change. Used to roll back an AI change that broke the preview. */
  onUndo: () => void
  /** The preview's current error. A new object for each error, so a repeated message still counts. */
  previewError: { message: string } | null
  /** After a request finished, with the message to show in the chat. */
  onSent?: (instruction: string, target: string | null, result: string) => void
  /** Earlier requests in this project, oldest first. The latest go with each request as context. */
  history: AiEditTurn[]
  /** Stores a finished request in the history, under the template that sent it. */
  onRecord: (turn: AiHistoryTurn) => void
  /** Rewrites the reply of a history entry (its change was undone). */
  onAmend: (id: string, reply: string) => void
}

/** A history entry as stored: the turn plus an id, so a rollback can update the right one. */
export type AiHistoryTurn = AiEditTurn & { id: string }

type AiOutcome = { applied: true; changed: string[] } | { applied: false; reason: string }

/** Sends AI edit requests and applies the returned file edits. */
export function useAiEdit({ template, files, draft, onApply, onUndo, previewError, onSent, history, onRecord, onAmend }: UseAiEditOptions) {
  const { choice } = useModelChoice()
  const modelRejected = useModelRejected()
  const mutation = useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: sendAiEdit,
    onError: (error, { request }) => {
      // The picked key was refused or removed, or the model turned off: the menu drops it and falls back.
      if (error instanceof ApiError && MODEL_ERRORS.has(error.code ?? '')) void modelRejected(request.model, error.code ?? '')
    },
  })
  // Set when the request fails validation before sending, so Send never silently does nothing.
  const [invalid, setInvalid] = useState<string | null>(null)
  // The response arrives later: apply it to the files and draft as they are then.
  const latest = useRef({ templateId: template.id, files, draft, onUndo, onSent })
  useEffect(() => {
    latest.current = { templateId: template.id, files, draft, onUndo, onSent }
  })
  const applied = useRef<{
    draft: SiteDraft
    at: number
    instruction: string
    target: string | null
    turn: AiHistoryTurn
    amend: UseAiEditOptions['onAmend']
  } | null>(null)
  // The pending request, so Stop can abort it.
  const inFlight = useRef<{ controller: AbortController; instruction: string; target: string | null; requestId: string; elapsed: () => number } | null>(null)

  function send(instruction: string, target: AiEditTarget | null, onDone?: () => void) {
    let request: AiEditRequest
    try {
      request = buildEditRequest(instruction, target, template, files, history, choice)
    } catch {
      analytics.track('ai_edit_invalid', { length: instruction.length })
      setInvalid(`This request can't be sent. Keep the instruction under ${MAX_INSTRUCTION} characters.`)
      return
    }
    setInvalid(null)
    const controller = new AbortController()
    const label = target && targetLabel(target)
    // The history callbacks of the template this request is for, even if the user switches templates meanwhile.
    const record = onRecord
    const amend = onAmend
    const sentFor = template.id
    const requestId = crypto.randomUUID()
    const elapsed = stopwatch()
    const model = modelName(request)
    analytics.track('ai_edit_requested', {
      request_id: requestId,
      instruction: request.instruction,
      template_id: request.template.id,
      model,
      model_key: request.model?.keyId ?? null,
      target_label: label,
      target_tag: target?.tag ?? null,
      target_text: target?.text ?? null,
      target_content_path: target?.contentPath ?? null,
      target_section: target?.section ? (target.section.heading ?? target.section.id ?? target.section.tag) : null,
      target_selector: target?.selector ?? null,
      file_paths: request.files.map((f) => f.path),
      history_turns: request.history.length,
    })
    inFlight.current = { controller, instruction: request.instruction, target: label, requestId, elapsed }
    mutation.mutate({ request, signal: controller.signal }, {
      onError: (error) => {
        // Stopped by the user: tracked as `ai_edit_stopped`.
        if (controller.signal.aborted) return
        analytics.track('ai_edit_failed', {
          request_id: requestId,
          instruction: request.instruction,
          code: error instanceof ApiError ? (error.code ?? null) : null,
          status: error instanceof ApiError ? error.status : null,
          message: errorMessage(error),
          model,
          duration_ms: elapsed(),
        })
      },
      onSettled: () => {
        if (inFlight.current?.controller === controller) inFlight.current = null
      },
      onSuccess: (response) => {
        // The edits are for the files that were sent: don't apply them to another template's.
        const outcome: AiOutcome =
          latest.current.templateId === sentFor ? settle(request, response) : { applied: false, reason: 'the template was changed while the AI worked' }
        const turn = { id: crypto.randomUUID(), instruction: request.instruction, target: label, reply: historyReply(response, outcome) }
        const edits = response.tier === 1 ? response.edits : []
        analytics.track('ai_edit_response', {
          request_id: requestId,
          instruction: request.instruction,
          tier: response.tier,
          summary: response.tier === 1 ? response.summary : '',
          edits_count: edits.length,
          edited_paths: [...new Set(edits.map((e) => e.path))],
          edits: JSON.stringify(edits),
          applied: outcome.applied,
          not_applied_reason: outcome.applied ? null : outcome.reason,
          escalation_reason: response.tier === 2 ? response.reason : null,
          reply: message(response, outcome),
          model,
          duration_ms: elapsed(),
        })
        record(turn)
        if (outcome.applied) applied.current = { draft: latest.current.draft, at: Date.now(), instruction: request.instruction, target: label, turn, amend }
        latest.current.onSent?.(request.instruction, label, message(response, outcome))
        onDone?.()
      },
    })
  }

  function settle(request: AiEditRequest, response: AiEditResponse): AiOutcome {
    if (response.tier === 2) return { applied: false, reason: 'needs a deeper edit' }
    const result = applyEditResult(request, response.edits, latest.current.files, latest.current.draft)
    if (!result.ok) return { applied: false, reason: result.reason }
    onApply(result.draft)
    // onApply updates the draft synchronously (Zustand); remember the one this change produced.
    latest.current.draft = result.draft
    return { applied: true, changed: result.changed }
  }

  // Roll back an AI change that broke the preview, unless something else changed since.
  useEffect(() => {
    const change = applied.current
    if (!previewError || !change) return
    applied.current = null
    const { draft: now, onUndo: undo, onSent: log } = latest.current
    if (Date.now() - change.at > ROLLBACK_WINDOW_MS || now.portfolio !== change.draft.portfolio || now.files !== change.draft.files) return
    undo()
    analytics.track('ai_edit_rolled_back', { instruction: change.instruction, error: previewError.message })
    change.amend(change.turn.id, `${change.turn.reply} This broke the preview, so it was undone.`)
    log?.(change.instruction, change.target, `That change broke the preview, so I undid it. Try rephrasing the request.`)
  }, [previewError])

  /** Stops the pending request. Nothing is changed, and the chat says so. */
  function stop() {
    const request = inFlight.current
    if (!request) return
    inFlight.current = null
    request.controller.abort()
    analytics.track('ai_edit_stopped', { request_id: request.requestId, instruction: request.instruction, duration_ms: request.elapsed() })
    // Detaches this request from the hook, so its abort error isn't shown and nothing is applied.
    mutation.reset()
    onSent?.(request.instruction, request.target, 'Stopped. Nothing was changed.')
  }

  return {
    send,
    stop,
    pending: mutation.isPending,
    error: mutation.error && errorMessage(mutation.error),
    /** The error is about the model or key, so Settings → AI models can fix it. */
    errorInSettings: mutation.error instanceof ApiError && SETTINGS_ERRORS.has(mutation.error.code ?? ''),
    invalid,
  }
}

/** Milliseconds since it was started, for analytics. */
function stopwatch(): () => number {
  const start = performance.now()
  return () => Math.round(performance.now() - start)
}

/** The model a request went to, for analytics. */
function modelName(request: AiEditRequest): string {
  return request.model?.model ?? 'makable-default'
}

/** What the history remembers about a finished request: what changed, or why nothing did. */
function historyReply(response: AiEditResponse, outcome: AiOutcome): string {
  if (response.tier === 2) return `Not done: it needs a deeper edit (${response.reason}).`
  if (outcome.applied || outcome.reason === 'no changes') return response.summary
  return `Not done: the edits couldn't be applied (${outcome.reason}).`
}

/** The backend's messages are written for users; anything else means the request never got an answer. */
export function errorMessage(error: Error): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Connect GitHub again to use AI edits.'
    if (error.code) return error.message
  }
  return "Couldn't reach the server. Check your connection and try again."
}

function message(response: AiEditResponse, outcome: AiOutcome): string {
  if (response.tier === 2) return `That needs a deeper edit across the site (${response.reason}), which isn't available yet. Try a smaller change to the selected element.`
  if (outcome.applied) return `${response.summary} Press ⌘Z to undo.`
  if (outcome.reason === 'no changes') return response.summary
  return `I couldn't apply that: ${outcome.reason}. Nothing was changed, so try rephrasing.`
}

export type AiEdit = ReturnType<typeof useAiEdit>
