import { z } from 'zod'
import { templateIdSchema } from './portfolio'

/**
 * How a template is built and where its generated content file goes.
 * - `react`: Vite + React + TS app; content in `src/content/portfolio.ts`.
 * - `static`: plain HTML/CSS/JS served as-is; browsers can't run TS, so content is `content/portfolio.js`.
 */
export const templateKindSchema = z.enum(['react', 'static'])
export type TemplateKind = z.infer<typeof templateKindSchema>

/** A relative path inside a template: no leading slash, no `.`/`..` segments, no backslashes. */
export const SAFE_REPO_PATH = /^(?!.*(?:^|\/)\.{1,2}(?:\/|$))[\w.@-]+(?:\/[\w.@-]+)*$/

const httpsUrl = z.url({ protocol: /^https$/ })

export const templateEntrySchema = z.object({
  id: templateIdSchema,
  category: z.string(),
  name: z.string().min(1),
  description: z.string(),
  kind: templateKindSchema,
  version: z.number().int().positive(),
  tags: z.array(z.string()).catch([]),
  /** React templates that share one codebase pick their look by theme; it becomes the content's `template`. */
  theme: z.string().optional(),
  /** Repo-relative path of the generated content file inside the template. */
  contentPath: z.string().regex(SAFE_REPO_PATH),
  thumbnailUrl: httpsUrl,
  /** The hosted demo. Its folder also serves the template's binary assets. */
  demoUrl: httpsUrl,
  /** JSON map of repo-relative path → file contents (see `parseTemplateFiles` in the SPA). */
  filesUrl: httpsUrl,
})
export type TemplateEntry = z.infer<typeof templateEntrySchema>

export const templateCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().catch(''),
})
export type TemplateCategory = z.infer<typeof templateCategorySchema>

/**
 * The published template catalog. Entries that don't parse, or repeat an earlier ID,
 * are dropped so one broken template can't hide the others.
 */
export const templateCatalogSchema = z.object({
  categories: z.array(templateCategorySchema).catch([]),
  templates: z.array(z.unknown()).transform((items) => {
    const seen = new Set<string>()
    return items.flatMap((item) => {
      const entry = templateEntrySchema.safeParse(item)
      if (!entry.success || seen.has(entry.data.id)) return []
      seen.add(entry.data.id)
      return [entry.data]
    })
  }),
})
export type TemplateCatalog = z.infer<typeof templateCatalogSchema>
