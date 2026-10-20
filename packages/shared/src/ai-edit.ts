import { z } from 'zod'

// The AI contract between the SPA and makable-backend: what the SPA sends to edit a site with AI, and what comes
// back. The server reads the site's code itself (from the site's repo, at the commit the browser is at) and owns
// the model prompt: never put prompts in this package, it ships to the browser. makable-backend mirrors these
// schemas (`schemas/ai_edit.py`, `schemas/ai_create.py`).

export const MAX_INSTRUCTION = 2000
export const MAX_PROMPT = 4000
export const MAX_ANSWER = 2000
export const MAX_ELEMENT_HTML = 4000
export const MAX_TARGET_LABEL = 300
/** The picture of the selected element sent to models that read images (a data URL). */
export const MAX_SCREENSHOT_CHARS = 400_000

/** A relative path inside a site: no leading slash, no `.`/`..` segments, no backslashes. */
export const SAFE_REPO_PATH = /^(?!.*(?:^|\/)\.{1,2}(?:\/|$))[\w.@-]+(?:\/[\w.@-]+)*$/
const COMMIT_SHA = /^[0-9a-f]{40}$/
const SCREENSHOT = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/

/** Where an element is written in the site's code: the preview tags elements with `data-src="path:line:column"`. */
export const aiEditSourceSchema = z.object({
  path: z.string().regex(SAFE_REPO_PATH),
  line: z.number().int().min(1).max(1_000_000),
  column: z.number().int().min(0).max(100_000),
})
export type AiEditSource = z.infer<typeof aiEditSourceSchema>

/**
 * The element the user clicked in the preview. It's described by the page itself, so it's
 * untrusted: every field is length-capped and it only ever goes into the prompt as data.
 */
export const aiEditTargetSchema = z.object({
  tag: z.string().max(32),
  /** Visible text, whitespace-collapsed. */
  text: z.string().max(300),
  /** Its place in the code, when the preview knows it. */
  source: aiEditSourceSchema.nullable(),
  /** The enclosing landmark (section, header, footer, nav, aside). */
  section: z
    .object({ tag: z.string().max(32), id: z.string().max(100).nullable(), heading: z.string().max(120).nullable() })
    .nullable(),
  /** CSS-like path from <body>, e.g. `main > section#menu > ul > li:nth-of-type(3)`. */
  selector: z.string().max(500),
  /** The element's outerHTML, truncated. */
  html: z.string().max(MAX_ELEMENT_HTML),
})
export type AiEditTarget = z.infer<typeof aiEditTargetSchema>

/** A model id as providers write them, e.g. `gpt-4.1-mini` or `meta-llama/llama-3.3-70b:free`. makable-backend: `MODEL_ID`. */
export const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/

/** The model the user picked in the chat's menu: one of the models they turned on for their own key. */
export const aiModelChoiceSchema = z.object({ keyId: z.uuid(), model: z.string().regex(MODEL_ID) })
export type AiModelChoice = z.infer<typeof aiModelChoiceSchema>

export const aiEditRequestSchema = z.object({
  /** The site (the builder's `projectId`). */
  projectId: z.uuid(),
  /** The commit the browser's copy of the site is at: it saves its own edits first. */
  baseCommit: z.string().regex(COMMIT_SHA),
  instruction: z.string().trim().min(1).max(MAX_INSTRUCTION),
  /** Null when nothing was selected: the request is about the whole site. */
  target: aiEditTargetSchema.nullable(),
  /** A picture of the selected element, for models that read images. */
  screenshot: z.string().max(MAX_SCREENSHOT_CHARS).regex(SCREENSHOT).optional(),
  /** Left out for makable's own model. */
  model: aiModelChoiceSchema.optional(),
})
export type AiEditRequest = z.infer<typeof aiEditRequestSchema>

export const aiCreateRequestSchema = z.object({
  projectId: z.uuid(),
  prompt: z.string().trim().min(1).max(MAX_PROMPT),
  model: aiModelChoiceSchema.optional(),
})
export type AiCreateRequest = z.infer<typeof aiCreateRequestSchema>

/** A question the AI asks the user (the run waits for the answer): choices to click and/or free text. */
export type AiQuestion = {
  question: string
  options: string[]
  allowFreeText: boolean
  /** One of the create agent's questions, before the site is made: about the site (what kind it is...), or its name. */
  kind?: 'project_name' | 'site_brief' | null
}

/** Only with the backend's `AI_DEBUG`: what the model got. */
export type AiDebug = { modelInput: string; attempts: number; model: string }

/**
 * What an AI request took. Only sent for requests made with the user's own key. A token count is null when the
 * provider didn't say: `reasoningTokens` (the model's thinking, part of `outputTokens`) and `cachedTokens` (part of
 * `inputTokens`) for providers that don't report them, the others when a reply came without counts.
 * `costUsd` only comes from providers that report it (OpenRouter).
 */
export type AiUsage = {
  modelCalls: number
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  reasoningTokens: number | null
  cachedTokens: number | null
  costUsd: number | null
  /** Waiting for the model. */
  modelSeconds: number
  /** The whole request, without the time it waited for the user or the preview. */
  seconds: number
}

/**
 * How an AI request came back:
 * - `applied`: committed to the site's repo; `files` are what it changed, as they are now (null: deleted).
 * - `awaiting_result`: not committed yet. Try `files` in the preview and report how it went.
 * - `needs_input`: the AI asked the user something; answering continues the same run.
 * - `escalated`: the change needs a deeper edit than AI edits make. Nothing changed.
 * - `created`: the site was built from the prompt and committed.
 */
export type AiResult =
  | {
      status: 'applied'
      runId: string
      summary: string
      commitSha: string
      files: Record<string, string | null>
      usage?: AiUsage | null
      debug?: AiDebug
    }
  | { status: 'awaiting_result'; runId: string; summary: string; files: Record<string, string | null>; debug?: AiDebug }
  | { status: 'needs_input'; runId: string; question: AiQuestion; debug?: AiDebug }
  | { status: 'escalated'; runId: string; reason: string; usage?: AiUsage | null; debug?: AiDebug }
  | {
      status: 'created'
      runId: string
      summary: string
      commitSha: string
      site: { projectId: string; name: string; repoName: string | null; repoUrl: string | null; updatedAt: string }
      usage?: AiUsage | null
    }

/** One line of a creation's stream (`POST /ai/create`, `application/x-ndjson`). */
export type AiStreamEvent =
  | { type: 'progress'; stage: string; message: string; path?: string; done?: number; total?: number }
  | { type: 'ping' }
  | { type: 'result'; data: AiResult }
  | { type: 'error'; error: { code: string; message: string; details?: unknown } }
