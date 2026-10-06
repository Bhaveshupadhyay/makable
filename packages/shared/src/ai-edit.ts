import { z } from 'zod'
import { templateIdSchema } from './portfolio'
import { SAFE_REPO_PATH, templateKindSchema } from './template-catalog'

// An "Edit with AI" request: what the user asked for, what they pointed at in the preview,
// and the template source the change most likely touches. This is the contract between the
// SPA and the server: the SPA builds it, the server validates it. The model prompt (system
// prompt included) is built on the server only, never here: this package ships to the browser.

export const MAX_INSTRUCTION = 2000
export const MAX_ELEMENT_HTML = 4000
export const MAX_FILE_CHARS = 60_000
export const MAX_FILES = 6

/**
 * The element the user clicked in the preview. It's described by the page itself, so it's
 * untrusted: every field is length-capped and it only ever goes into the prompt as data.
 */
export const aiEditTargetSchema = z.object({
  tag: z.string().max(32),
  /** Visible text, whitespace-collapsed. */
  text: z.string().max(300),
  /** The nearest `data-content` path (e.g. `skills.2`), if the element shows content. */
  contentPath: z.string().max(100).nullable(),
  /** The enclosing landmark (section, header, footer, nav, aside). */
  section: z
    .object({ tag: z.string().max(32), id: z.string().max(100).nullable(), heading: z.string().max(120).nullable() })
    .nullable(),
  /** CSS-like path from <body>, e.g. `main > section#skills > ul > li:nth-of-type(3)`. */
  selector: z.string().max(500),
  /** The element's outerHTML, truncated. */
  html: z.string().max(MAX_ELEMENT_HTML),
})
export type AiEditTarget = z.infer<typeof aiEditTargetSchema>

export const aiEditFileSchema = z.object({
  path: z.string().regex(SAFE_REPO_PATH),
  content: z.string().max(MAX_FILE_CHARS),
  /** Why this file was picked, e.g. `mentions "skills"`. Helps the model and debugging. */
  reason: z.string().max(200),
})
export type AiEditFile = z.infer<typeof aiEditFileSchema>

export const aiEditRequestSchema = z.object({
  instruction: z.string().trim().min(1).max(MAX_INSTRUCTION),
  /** Null when nothing was selected: the request is about the whole page. */
  target: aiEditTargetSchema.nullable(),
  template: z.object({
    id: templateIdSchema,
    name: z.string().max(100),
    kind: templateKindSchema,
    version: z.number().int().positive(),
    /** The generated content file; all copy lives there. */
    contentPath: z.string().regex(SAFE_REPO_PATH),
  }),
  /** Every text file in the project, so the model knows the layout. */
  fileTree: z.array(z.string().regex(SAFE_REPO_PATH)).max(500),
  /** The files most likely to change, with their contents. */
  files: z.array(aiEditFileSchema).max(MAX_FILES),
})
export type AiEditRequest = z.infer<typeof aiEditRequestSchema>
