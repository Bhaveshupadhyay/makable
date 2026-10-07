import { z } from 'zod'
import { MAX_FILE_CHARS } from './ai-edit'
import { SAFE_REPO_PATH } from './template-catalog'

// Tier 1 AI edits: the model returns search/replace edits on the files it was sent. Its output
// is untrusted, so the server and the browser both apply it with `applyFileEdits`, which only
// touches files it was given and only replaces text that matches exactly once.

export const MAX_EDITS = 10

export const fileEditSchema = z.object({
  path: z.string().regex(SAFE_REPO_PATH),
  /** Existing text to replace. Must be found exactly once in the file. */
  search: z.string().min(1).max(20_000),
  replace: z.string().max(40_000),
})
export type FileEdit = z.infer<typeof fileEditSchema>

/** What the model must return: edits, or a reason the change needs a deeper (Tier 2) edit. */
export const aiFileEditsResponseSchema = z.union([
  z.object({
    /** One sentence for the user: what changed. */
    summary: z.string().trim().min(1).max(500),
    edits: z.array(fileEditSchema).max(MAX_EDITS),
  }),
  z.object({ escalate: z.string().trim().min(1).max(500) }),
])
export type AiFileEditsResponse = z.infer<typeof aiFileEditsResponseSchema>

/** What `POST /api/ai/edit` answers: Tier 1 edits to apply, or a hand-off to Tier 2. */
export type AiEditResult = { tier: 1; summary: string; edits: FileEdit[] } | { tier: 2; reason: string }

export type ApplyFileEditsResult = { ok: true; files: Record<string, string>; changed: string[] } | { ok: false; error: string }

/**
 * Applies edits in order (later edits see earlier ones) to a copy of `files`. All or nothing.
 * An exact match comes first; otherwise the search is compared line by line ignoring leading
 * and trailing whitespace, because models often get indentation wrong. Either way the match
 * must be unique, so an edit can never land in the wrong place.
 */
export function applyFileEdits(files: Record<string, string>, edits: FileEdit[]): ApplyFileEditsResult {
  const next = { ...files }
  const changed = new Set<string>()
  for (const [i, edit] of edits.entries()) {
    const where = `edit ${i + 1} (${edit.path})`
    if (!Object.hasOwn(next, edit.path)) return { ok: false, error: `${where}: that file wasn't sent, so it can't be edited` }
    const result = replaceOnce(next[edit.path], edit.search, edit.replace)
    if (!result.ok) return { ok: false, error: `${where}: ${result.error}` }
    if (result.text.length > MAX_FILE_CHARS) return { ok: false, error: `${where}: the file would be too large` }
    if (result.text !== files[edit.path]) changed.add(edit.path)
    next[edit.path] = result.text
  }
  return { ok: true, files: next, changed: [...changed] }
}

type ReplaceResult = { ok: true; text: string } | { ok: false; error: string }

function replaceOnce(text: string, search: string, replace: string): ReplaceResult {
  const first = text.indexOf(search)
  if (first !== -1) {
    if (text.indexOf(search, first + 1) !== -1) return { ok: false, error: 'the search text appears more than once; include more surrounding lines' }
    return { ok: true, text: text.slice(0, first) + replace + text.slice(first + search.length) }
  }
  // Line-based fallback: whole lines, compared trimmed. Blank edge lines in the search are ignored.
  const want = trimBlankEdges(search.split('\n')).map((l) => l.trim())
  if (want.length === 0) return { ok: false, error: 'the search text is empty' }
  const lines = text.split('\n')
  const starts: number[] = []
  for (let s = 0; s + want.length <= lines.length; s++) {
    if (want.every((w, k) => lines[s + k].trim() === w)) starts.push(s)
  }
  if (starts.length === 0) return { ok: false, error: 'the search text was not found; copy it exactly from the file' }
  if (starts.length > 1) return { ok: false, error: 'the search text appears more than once; include more surrounding lines' }
  const s = starts[0]
  const out = [...lines.slice(0, s), ...trimBlankEdges(replace.split('\n')), ...lines.slice(s + want.length)]
  return { ok: true, text: out.join('\n') }
}

function trimBlankEdges(lines: string[]): string[] {
  let a = 0
  let b = lines.length
  while (a < b && lines[a].trim() === '') a++
  while (b > a && lines[b - 1].trim() === '') b--
  return lines.slice(a, b)
}
