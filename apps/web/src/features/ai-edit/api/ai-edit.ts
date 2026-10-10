import type { AiEditRequest, AiEditResult } from '@makable/shared'
import { backendFetch } from '@/shared/lib/api-client'

// The browser sends only the request; the backend owns the model prompt (system prompt included).
export type AiEditResponse = AiEditResult & {
  /** Only when the backend runs with AI_DEBUG=true: the context it gave the model (not the system prompt). */
  debug?: { modelInput: string; attempts: number; model: string }
}

export function sendAiEdit({ request, signal }: { request: AiEditRequest; signal?: AbortSignal }): Promise<AiEditResponse> {
  return backendFetch<AiEditResponse>('/ai/edit', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}
