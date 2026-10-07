import { type AiEditRequest, type AiEditTarget, MAX_INSTRUCTION, type TemplateEntry } from '@makable/shared'
import { useIsMutating, useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { SiteDraft } from '@/features/visual-edit'
import { type AiEditResponse, sendAiEdit } from '../api/ai-edit'
import { applyEditResult } from '../lib/apply-edit-result'
import { buildEditRequest, targetLabel } from '../lib/build-edit-request'

const MUTATION_KEY = ['ai-edit']

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
}

type AiOutcome = { applied: true; changed: string[] } | { applied: false; reason: string }

/** Sends AI edit requests and applies the returned file edits. */
export function useAiEdit({ template, files, draft, onApply, onUndo, previewError, onSent }: UseAiEditOptions) {
  const mutation = useMutation({ mutationKey: MUTATION_KEY, mutationFn: sendAiEdit })
  // Set when the request fails validation before sending, so Send never silently does nothing.
  const [invalid, setInvalid] = useState<string | null>(null)
  // The response arrives later: apply it to the files and draft as they are then.
  const latest = useRef({ files, draft, onUndo, onSent })
  useEffect(() => {
    latest.current = { files, draft, onUndo, onSent }
  })
  const applied = useRef<{ draft: SiteDraft; at: number; instruction: string; target: string | null } | null>(null)
  // The pending request, so Stop can abort it.
  const inFlight = useRef<{ controller: AbortController; instruction: string; target: string | null } | null>(null)

  function send(instruction: string, target: AiEditTarget | null, onDone?: () => void) {
    let request: AiEditRequest
    try {
      request = buildEditRequest(instruction, target, template, files)
    } catch {
      setInvalid(`This request can't be sent. Keep the instruction under ${MAX_INSTRUCTION} characters.`)
      return
    }
    setInvalid(null)
    const controller = new AbortController()
    const label = target && targetLabel(target)
    inFlight.current = { controller, instruction: request.instruction, target: label }
    mutation.mutate({ request, signal: controller.signal }, {
      onSettled: () => {
        if (inFlight.current?.controller === controller) inFlight.current = null
      },
      onSuccess: (response) => {
        const outcome = settle(request, response)
        if (outcome.applied) applied.current = { draft: latest.current.draft, at: Date.now(), instruction: request.instruction, target: label }
        onSent?.(request.instruction, label, message(response, outcome))
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
    log?.(change.instruction, change.target, `That change broke the preview, so I undid it. Try rephrasing the request.`)
  }, [previewError])

  /** Stops the pending request. Nothing is changed, and the chat says so. */
  function stop() {
    const request = inFlight.current
    if (!request) return
    inFlight.current = null
    request.controller.abort()
    // Detaches this request from the hook, so its abort error isn't shown and nothing is applied.
    mutation.reset()
    onSent?.(request.instruction, request.target, 'Stopped. Nothing was changed.')
  }

  return {
    send,
    stop,
    pending: mutation.isPending,
    error: mutation.error,
    invalid,
  }
}

function message(response: AiEditResponse, outcome: AiOutcome): string {
  if (response.tier === 2) return `That needs a deeper edit across the site (${response.reason}), which isn't available yet. Try a smaller change to the selected element.`
  if (outcome.applied) return `${response.summary} Press ⌘Z to undo.`
  if (outcome.reason === 'no changes') return response.summary
  return `I couldn't apply that: ${outcome.reason}. Nothing was changed, so try rephrasing.`
}

export type AiEdit = ReturnType<typeof useAiEdit>
