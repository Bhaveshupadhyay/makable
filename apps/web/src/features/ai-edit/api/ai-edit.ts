import type { AiContentRequest, AiOpsResponse } from '@makable/shared'
import { apiFetch } from '@/shared/lib/api-client'

// The browser sends only the request; the server owns the model prompt (system prompt included).
export type AiContentResponse = AiOpsResponse & {
  /** Dev endpoint only: the context the server gave the model (the user turn, not the system prompt). */
  debug?: { modelInput: string; attempts: number; model: string }
}

export function sendAiContent(request: AiContentRequest): Promise<AiContentResponse> {
  return apiFetch<AiContentResponse>('/ai/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}
