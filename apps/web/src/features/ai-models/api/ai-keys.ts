import { backendFetch } from '@/shared/lib/api-client'
import type { AiKey, AiKeyChecked, AiModelOption, AiProvider, AiProviderId } from '../types'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export function fetchProviders(): Promise<AiProvider[]> {
  return backendFetch<AiProvider[]>('/ai/providers')
}

export function fetchKeys(): Promise<AiKey[]> {
  return backendFetch<AiKey[]>('/ai/keys')
}

/** The server checks the key with the provider before keeping it (422 `ai_key_invalid` if it's refused). */
export function addKey(body: { provider: AiProviderId; apiKey: string }): Promise<AiKeyChecked> {
  return backendFetch<AiKeyChecked>('/ai/keys', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) })
}

export function setKeyModels({ keyId, models }: { keyId: string; models: string[] }): Promise<AiKey> {
  return backendFetch<AiKey>(`/ai/keys/${encodeURIComponent(keyId)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ models }),
  })
}

export function checkKey(keyId: string): Promise<AiKeyChecked> {
  return backendFetch<AiKeyChecked>(`/ai/keys/${encodeURIComponent(keyId)}/check`, { method: 'POST' })
}

export function deleteKey(keyId: string): Promise<void> {
  return backendFetch<void>(`/ai/keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' })
}

export function fetchModelOptions(): Promise<AiModelOption[]> {
  return backendFetch<AiModelOption[]>('/ai/models')
}
