import type { AiModelOption, AiProviderId } from '../types'

// Names for the menu, so it needs no providers request. The settings page uses the server's list.
const PROVIDER_NAMES: Record<AiProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  deepseek: 'DeepSeek',
  groq: 'Groq',
  mistral: 'Mistral',
  xai: 'xAI',
  openrouter: 'OpenRouter',
}

export const DEFAULT_MODEL_LABEL = 'makable default'

export function providerName(provider: AiProviderId | null): string {
  return provider ? (PROVIDER_NAMES[provider] ?? provider) : 'makable'
}

export function optionLabel(option: AiModelOption | null): string {
  return option?.keyId ? option.model : DEFAULT_MODEL_LABEL
}
