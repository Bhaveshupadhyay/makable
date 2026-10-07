import { z } from 'zod'
import { MAX_INSTRUCTION } from './ai-edit'
import { type Portfolio, portfolioProjectSchema, portfolioSchema } from './portfolio'

// Tier 1 AI edits: the model never writes code, it returns a few operations on the Portfolio
// data. Its output is untrusted, so every op is checked against the allow-lists below, applied
// to a copy, and the result must pass `portfolioSchema` (http(s) URLs, required fields) before
// anyone sees it. The prompt stays on the server: this package ships to the browser.

export const MAX_OPS = 20

const itemPath = z.string().regex(/^(skills|projects)\.\d+$/)

export const contentOpSchema = z.discriminatedUnion('op', [
  /** Set a text or URL field. */
  z.object({ op: z.literal('set'), path: z.string().max(100), value: z.string().max(5000) }),
  /** Remove one skill or project. Later items shift up. */
  z.object({ op: z.literal('remove'), path: itemPath }),
  /** Add a skill (a string) or a project (an object) to a list; `index` defaults to the end. */
  z.object({
    op: z.literal('insert'),
    path: z.enum(['skills', 'projects']),
    index: z.number().int().nonnegative().optional(),
    value: z.union([z.string().max(200), portfolioProjectSchema]),
  }),
  /** Move one skill or project to another position in its list. */
  z.object({ op: z.literal('move'), path: itemPath, to: z.number().int().nonnegative() }),
])
export type ContentOp = z.infer<typeof contentOpSchema>

/** What the model must return. */
export const aiOpsResponseSchema = z.object({
  /** One sentence for the user: what changed, or why nothing could. */
  summary: z.string().trim().min(1).max(500),
  ops: z.array(contentOpSchema).max(MAX_OPS),
})
export type AiOpsResponse = z.infer<typeof aiOpsResponseSchema>

/** The request body for `POST /api/ai/content`. */
export const aiContentRequestSchema = z.object({
  instruction: z.string().trim().min(1).max(MAX_INSTRUCTION),
  /** What the user clicked in the preview, if anything. */
  selection: z
    .object({
      path: z.string().max(100).nullable(),
      text: z.string().max(300),
      section: z.string().max(120).nullable(),
    })
    .nullable(),
  /** The current content: the model needs it to see what exists and to write consistent copy. */
  portfolio: portfolioSchema,
})
export type AiContentRequest = z.infer<typeof aiContentRequestSchema>

/** Text and URL fields the model may set. Not allowed: `template`, `avatarUrl`, stars and language. */
const SETTABLE_PATH =
  /^(profile\.(name|headline|bio|location)|links\.(github|linkedin|x|website|email)|skills\.\d+|projects\.\d+\.(name|description|repoUrl|homepageUrl))$/

export type ApplyOpsResult = { ok: true; portfolio: Portfolio } | { ok: false; error: string }

/**
 * Applies the ops in order to a copy of the portfolio. All or nothing: the first op that isn't
 * allowed, doesn't fit the data, or leaves the portfolio invalid fails the whole batch.
 */
export function applyContentOps(portfolio: Portfolio, ops: ContentOp[]): ApplyOpsResult {
  const next = structuredClone(portfolio)
  for (const [i, op] of ops.entries()) {
    const error = applyOne(next, op)
    if (error) return { ok: false, error: `Op ${i + 1} (${op.op} ${op.path}): ${error}` }
  }
  const parsed = portfolioSchema.safeParse(next)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: `${issue?.path.join('.') || 'portfolio'}: ${issue?.message ?? 'invalid'}` }
  }
  return { ok: true, portfolio: parsed.data }
}

type List = 'skills' | 'projects'

function applyOne(p: Portfolio, op: ContentOp): string | null {
  switch (op.op) {
    case 'set':
      return setField(p, op.path, op.value)
    case 'remove': {
      const [list, index] = splitItem(op.path)
      const items = p[list] as unknown[]
      if (index >= items.length) return 'no such item'
      items.splice(index, 1)
      return null
    }
    case 'insert': {
      const items = p[op.path] as unknown[]
      if (op.index !== undefined && op.index > items.length) return 'index is past the end of the list'
      if (typeof op.value === 'string' !== (op.path === 'skills')) {
        return op.path === 'skills' ? 'a skill is a string' : 'a project is an object'
      }
      items.splice(op.index ?? items.length, 0, op.value)
      return null
    }
    case 'move': {
      const [list, index] = splitItem(op.path)
      const items = p[list] as unknown[]
      if (index >= items.length || op.to >= items.length) return 'no such position'
      const [item] = items.splice(index, 1)
      items.splice(op.to, 0, item)
      return null
    }
  }
}

function splitItem(path: string): [List, number] {
  const [list, index] = path.split('.')
  return [list as List, Number(index)]
}

function setField(p: Portfolio, path: string, value: string): string | null {
  if (!SETTABLE_PATH.test(path)) return `"${path}" can't be set`
  const keys = path.split('.')
  const leaf = keys.pop()!
  let parent: unknown = p
  for (const key of keys) {
    if (typeof parent !== 'object' || parent === null || !Object.hasOwn(parent, key)) return 'no such field'
    parent = (parent as Record<string, unknown>)[key]
  }
  const record = parent as Record<string, unknown> | null
  if (typeof record !== 'object' || record === null || typeof record[leaf] !== 'string') return 'no such text field'
  record[leaf] = value
  return null
}
