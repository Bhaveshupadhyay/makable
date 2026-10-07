import { type AiEditRequest, applyFileEdits, type FileEdit, parsePortfolioSource } from '@makable/shared'
import type { SiteDraft } from '@/features/visual-edit'

export type ApplyEditResult = { ok: true; draft: SiteDraft; changed: string[] } | { ok: false; reason: string }

/**
 * Applies Tier 1 edits to the draft. The edits were written for the files as they were sent,
 * so they're rejected if any of those changed meanwhile. An edited content file becomes the new
 * portfolio (so text editing keeps working on it); other files become AI-edited files.
 */
export function applyEditResult(request: AiEditRequest, edits: FileEdit[], projectFiles: Record<string, string>, draft: SiteDraft): ApplyEditResult {
  if (request.files.some((f) => projectFiles[f.path] !== f.content)) return { ok: false, reason: 'the site changed while the AI was working' }
  const applied = applyFileEdits(Object.fromEntries(request.files.map((f) => [f.path, f.content])), edits)
  if (!applied.ok) return { ok: false, reason: applied.error }
  if (applied.changed.length === 0) return { ok: false, reason: 'no changes' }

  let { portfolio } = draft
  const files = { ...draft.files }
  for (const path of applied.changed) {
    if (path === request.template.contentPath) {
      const parsed = parsePortfolioSource(applied.files[path])
      if (!parsed.ok) return { ok: false, reason: parsed.error }
      // Themed templates write their theme into the file; the draft keeps the template id.
      portfolio = { ...parsed.portfolio, template: draft.portfolio.template }
    } else {
      files[path] = applied.files[path]
    }
  }
  const filesChanged = applied.changed.some((path) => path !== request.template.contentPath)
  return { ok: true, draft: { portfolio, files: filesChanged ? files : draft.files }, changed: applied.changed }
}
