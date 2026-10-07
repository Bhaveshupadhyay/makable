import type { AiEditRequest, AiEditResult } from '@makable/shared'
import { apiFetch } from '@/shared/lib/api-client'

// The browser sends only the request; the server owns the model prompt (system prompt included).
export type AiEditResponse = AiEditResult & {
  /** Dev endpoint only: the context the server gave the model (the user turn, not the system prompt). */
  debug?: { modelInput: string; attempts: number; model: string }
}

export function sendAiEdit({ request, signal }: { request: AiEditRequest; signal?: AbortSignal }): Promise<AiEditResponse> {
  return apiFetch<AiEditResponse>('/ai/edit', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}
