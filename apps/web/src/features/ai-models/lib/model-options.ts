import type { AiModelChoice } from '@makable/shared'
import type { AiModelOption } from '../types'

/** The most models a key can show in the chat's menu (makable-backend `MAX_ENABLED_MODELS`). */
export const MAX_ENABLED_MODELS = 20

/**
 * The menu entry the stored pick stands for, or null (makable's own model) when there's no pick or it's no
 * longer offered: the key was removed or refused, or the model was turned off.
 */
export function findPick(pick: AiModelChoice | null | undefined, options: AiModelOption[]): AiModelOption | null {
  if (!pick) return null
  return options.find((o) => o.keyId === pick.keyId && o.model === pick.model) ?? null
}

/** What the request sends: nothing for makable's own model. */
export function toChoice(option: AiModelOption | null): AiModelChoice | undefined {
  return option?.keyId ? { keyId: option.keyId, model: option.model } : undefined
}

/** The menu grouped by key, in the server's order, with makable's own model first. */
export function groupOptions(options: AiModelOption[]): { keyId: string | null; provider: AiModelOption['provider']; options: AiModelOption[] }[] {
  const groups = new Map<string | null, { keyId: string | null; provider: AiModelOption['provider']; options: AiModelOption[] }>()
  for (const option of options) {
    const group = groups.get(option.keyId) ?? { keyId: option.keyId, provider: option.provider, options: [] }
    group.options.push(option)
    groups.set(option.keyId, group)
  }
  return [...groups.values()].sort((a, b) => Number(a.keyId !== null) - Number(b.keyId !== null))
}

/**
 * Toggles a model in a key's enabled list, keeping the order it was turned on in. Turning one on past the
 * limit does nothing (the checkbox is disabled anyway).
 */
export function toggleModel(enabled: string[], model: string): string[] {
  if (enabled.includes(model)) return enabled.filter((m) => m !== model)
  return enabled.length >= MAX_ENABLED_MODELS ? enabled : [...enabled, model]
}

/** Models matching a search, case-insensitively, on any part of the id (OpenRouter lists hundreds). */
export function filterModels(models: string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  return q ? models.filter((m) => m.toLowerCase().includes(q)) : models
}
