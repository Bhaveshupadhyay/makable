import type { AiEditRequest, AiEditTarget, TemplateEntry } from '@makable/shared'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { type AiEditResponse, sendAiEdit } from '../api/ai-edit'
import { buildAiEditRequest, targetLabel } from '../lib/build-request'

type UseAiEditOptions = {
  template: TemplateEntry
  /** The project as the preview runs it. */
  files: Record<string, string>
  /** After a request went through, e.g. to log it in the chat. */
  onSent?: (instruction: string, target: string | null) => void
}

/** Sends AI edit requests and keeps the last one, so the inspector can show what was sent. */
export function useAiEdit({ template, files, onSent }: UseAiEditOptions) {
  const [last, setLast] = useState<{ request: AiEditRequest; response: AiEditResponse } | null>(null)
  const mutation = useMutation({ mutationFn: sendAiEdit })

  function send(instruction: string, target: AiEditTarget | null, onDone?: () => void) {
    let request: AiEditRequest
    try {
      request = buildAiEditRequest({ instruction, target, template, files })
    } catch {
      return
    }
    mutation.mutate(request, {
      onSuccess: (response) => {
        setLast({ request, response })
        onSent?.(request.instruction, target && targetLabel(target))
        onDone?.()
      },
    })
  }

  return {
    send,
    pending: mutation.isPending,
    error: mutation.error,
    last,
    closeLast: () => setLast(null),
  }
}

export type AiEdit = ReturnType<typeof useAiEdit>
