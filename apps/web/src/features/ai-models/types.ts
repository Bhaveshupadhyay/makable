// makable-backend's `/ai` contract (`schemas/ai_key.py`).

export type AiProviderId = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'groq' | 'mistral' | 'xai' | 'openrouter'

export type AiProvider = { id: AiProviderId; name: string; keysUrl: string }

export type AiKey = {
  id: string
  provider: AiProviderId
  /** The key's last 4 characters. The key itself never comes back from the server. */
  keyHint: string
  /** `invalid`: the provider refused it, on a check or during an AI edit. */
  status: 'valid' | 'invalid'
  checkedAt: string
  /** The models shown in the chat's menu. */
  models: string[]
  createdAt: string
}

/** A key after the server checked it with the provider, with every chat model it can use (empty if refused). */
export type AiKeyChecked = { key: AiKey; availableModels: string[] }

/** One entry in the chat's model menu. `keyId` is null for makable's own model. */
export type AiModelOption = {
  keyId: string | null
  provider: AiProviderId | null
  model: string
  /** The model reads pictures: AI edits send it one of the selected element. */
  acceptsImages?: boolean
}
