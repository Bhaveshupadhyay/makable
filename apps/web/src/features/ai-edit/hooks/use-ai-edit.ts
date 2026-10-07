import { type AiContentRequest, type AiEditTarget, applyContentOps, MAX_INSTRUCTION, type Portfolio } from '@makable/shared'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { type AiContentResponse, sendAiContent } from '../api/ai-edit'
import { buildContentRequest, targetLabel } from '../lib/build-content-request'

type UseAiEditOptions = {
  portfolio: Portfolio
  /** Takes the edited portfolio. Pass the visual editor's `applyPortfolio` so the change can be undone. */
  onApply: (portfolio: Portfolio) => void
  /** After a request finished, with the message to show in the chat. */
  onSent?: (instruction: string, target: string | null, result: string) => void
}

export type AiOutcome = { applied: true } | { applied: false; reason: string }
export type AiLast = { request: AiContentRequest; response: AiContentResponse; outcome: AiOutcome }

/** Sends AI content requests, applies the returned ops, and keeps the last one for the inspector. */
export function useAiEdit({ portfolio, onApply, onSent }: UseAiEditOptions) {
  const [last, setLast] = useState<AiLast | null>(null)
  const mutation = useMutation({ mutationFn: sendAiContent })
  // Set when the request fails validation before sending, so Send never silently does nothing.
  const [invalid, setInvalid] = useState<string | null>(null)
  // The response arrives later: judge it against the portfolio as it is then.
  const latest = useRef(portfolio)
  useEffect(() => {
    latest.current = portfolio
  })

  function send(instruction: string, target: AiEditTarget | null, onDone?: () => void) {
    let request: AiContentRequest
    try {
      request = buildContentRequest(instruction, target, portfolio)
    } catch {
      setInvalid(`This request can't be sent. Keep the instruction under ${MAX_INSTRUCTION} characters.`)
      return
    }
    const sentFrom = portfolio
    setInvalid(null)
    mutation.mutate(request, {
      onSuccess: (response) => {
        const outcome = settle(response, sentFrom)
        setLast({ request, response, outcome })
        onSent?.(request.instruction, target && targetLabel(target), message(response, outcome))
        onDone?.()
      },
    })
  }

  function settle(response: AiContentResponse, sentFrom: Portfolio): AiOutcome {
    if (response.ops.length === 0) return { applied: false, reason: 'no changes' }
    // Ops address items by index, so they only make sense on the content they were written for.
    if (latest.current !== sentFrom) return { applied: false, reason: 'the content changed while the AI was working' }
    const result = applyContentOps(sentFrom, response.ops)
    if (!result.ok) return { applied: false, reason: result.error }
    onApply(result.portfolio)
    return { applied: true }
  }

  return {
    send,
    pending: mutation.isPending,
    error: mutation.error,
    invalid,
    last,
    closeLast: () => setLast(null),
  }
}

function message(response: AiContentResponse, outcome: AiOutcome): string {
  if (outcome.applied) return `${response.summary} Press ⌘Z to undo.`
  if (response.ops.length === 0) return response.summary
  return `I couldn't apply that: ${outcome.reason}. Nothing was changed, so try rephrasing.`
}

export type AiEdit = ReturnType<typeof useAiEdit>
