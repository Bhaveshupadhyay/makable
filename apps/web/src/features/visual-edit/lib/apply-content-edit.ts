import { portfolioSchema, type Portfolio } from '@makable/shared'

/**
 * Paths the templates render as plain text (`data-content`). URLs and the
 * template ID are deliberately excluded: they aren't edited as text.
 */
const EDITABLE_PATH = /^(profile\.(name|headline|bio|location)|links\.email|skills\.\d+|projects\.\d+\.(name|description))$/

export type ContentEditResult = { ok: true; portfolio: Portfolio } | { ok: false; error: string }

/**
 * Sets the text at a `data-content` path (e.g. `projects.2.name`) and
 * re-validates. Only existing string fields can change: the path comes from
 * the preview iframe, so it is untrusted.
 */
export function applyContentEdit(portfolio: Portfolio, path: string, value: string): ContentEditResult {
  if (!EDITABLE_PATH.test(path)) return { ok: false, error: `"${path}" isn't editable text` }
  const keys = path.split('.')
  const next = structuredClone(portfolio)
  let parent: unknown = next
  for (const key of keys.slice(0, -1)) {
    if (!isContainer(parent) || !Object.hasOwn(parent, key)) return { ok: false, error: `Unknown content path "${path}"` }
    parent = parent[key]
  }
  const leaf = keys.at(-1)!
  if (!isContainer(parent) || !Object.hasOwn(parent, leaf) || typeof parent[leaf] !== 'string') {
    return { ok: false, error: `"${path}" isn't editable text` }
  }
  parent[leaf] = value

  const parsed = portfolioSchema.safeParse(next)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid value' }
  return { ok: true, portfolio: parsed.data }
}

function isContainer(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
