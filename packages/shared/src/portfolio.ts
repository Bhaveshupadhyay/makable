import { z } from 'zod'

/**
 * A template's ID in the remote catalog (see `template-catalog.ts`). Templates are
 * published separately, so the set of IDs is open; the slug shape is what's checked.
 */
export const templateIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Invalid template ID')
export type TemplateId = z.infer<typeof templateIdSchema>

// http(s) only: these end up in `href`s on the published site, so no `javascript:` URLs.
const httpUrl = z.url({ protocol: /^https?$/, error: 'Enter an http(s) URL' })
const optionalUrl = z.union([httpUrl, z.literal('')])

export const portfolioProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  repoUrl: httpUrl,
  homepageUrl: optionalUrl,
  language: z.string().nullable(),
  stars: z.number().int().nonnegative(),
})
export type PortfolioProject = z.infer<typeof portfolioProjectSchema>

/**
 * All copy rendered by the portfolio template. The template keeps this in
 * `src/content/portfolio.ts` so visual edits can patch it by key.
 */
export const portfolioSchema = z.object({
  profile: z.object({
    name: z.string().min(1, 'Name is required'),
    headline: z.string().min(1, 'Add a short headline'),
    bio: z.string(),
    location: z.string(),
    avatarUrl: optionalUrl,
  }),
  links: z.object({
    github: httpUrl,
    linkedin: optionalUrl,
    x: optionalUrl,
    website: optionalUrl,
    email: z.union([z.email(), z.literal('')]),
  }),
  skills: z.array(z.string().min(1)),
  projects: z.array(portfolioProjectSchema),
  template: templateIdSchema,
})
export type Portfolio = z.infer<typeof portfolioSchema>
