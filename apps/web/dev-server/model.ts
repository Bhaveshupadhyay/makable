// Server-only: a minimal OpenAI-compatible chat call (OmniRoute locally). Never import this from
// src/ or @makable/shared, which ship to the browser. Moves to the Worker.

export type ModelConfig = { baseUrl: string; apiKey?: string; model: string; timeoutMs?: number }
export type Message = { role: 'user' | 'assistant'; content: string }

export class ModelError extends Error {}

export async function callModel(config: ModelConfig, messages: Message[], fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<string> {
  let res: Response
  try {
    res = await fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
      body: JSON.stringify({ model: config.model, messages, temperature: 0.2, stream: false }),
      // Gives up on a timeout, or when the caller goes away (the user pressed Stop).
      signal: AbortSignal.any([AbortSignal.timeout(config.timeoutMs ?? 90_000), ...(signal ? [signal] : [])]),
    })
  } catch (e) {
    throw new ModelError(`Couldn't reach the model at ${config.baseUrl}: ${e instanceof Error ? e.message : e}`)
  }
  const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null
  const content = body?.choices?.[0]?.message?.content
  if (!res.ok || typeof content !== 'string') throw new ModelError(body?.error?.message ?? `The model answered HTTP ${res.status}`)
  return content
}

/** Pulls the JSON object out of a reply that may be wrapped in fences or prose. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('The model did not return JSON')
  return JSON.parse(text.slice(start, end + 1))
}
