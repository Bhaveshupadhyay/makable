import type { AiEditRequest } from '@makable/shared'
import { apiFetch } from '@/shared/lib/api-client'

// The browser sends only the request; the server owns the model prompt (system prompt included).
export type AiEditResponse = {
  /** Set by the dev endpoint, which doesn't call a model yet. */
  note?: string
  /** Dev endpoint only: the context the server gives the model (the user turn, not the system prompt). */
  debug?: { modelInput: string }
}

export function sendAiEdit(request: AiEditRequest): Promise<AiEditResponse> {
  return apiFetch<AiEditResponse>('/ai/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}
