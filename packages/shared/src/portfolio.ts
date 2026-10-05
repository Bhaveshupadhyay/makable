import { z } from 'zod'

/** IDs of the site templates a user can pick. Order is the picker's display order. */
export const templateIds = ['minimal', 'terminal', 'bento', 'editorial', 'paper'] as const
export const templateIdSchema = z.enum(templateIds)
export type TemplateId = z.infer<typeof templateIdSchema>

/**
 * How a template is built and where its generated content file goes.
 * - `react`: Vite + React + TS app; content in `src/content/portfolio.ts`.
 * - `static`: plain HTML/CSS/JS served as-is; browsers can't run TS, so content is `content/portfolio.js`.
 */
export type TemplateKind = 'react' | 'static'

export type TemplateMeta = {
  id: TemplateId
  name: string
  description: string
  kind: TemplateKind
  /** Folder under `packages/templates/`. Several IDs can share one folder and differ by theme. */
  dir: string
  /** Repo-relative path of the generated content file inside the template. */
  contentPath: string
  /** Colors and layout for the picker's mock thumbnail, until real screenshots exist. */
  thumbnail: {
    background: string
    foreground: string
    accent: string
    font: 'sans' | 'mono' | 'serif'
    layout: 'stack' | 'grid' | 'columns'
  }
}

const REACT_PORTFOLIO = { kind: 'react', dir: 'portfolio', contentPath: 'src/content/portfolio.ts' } as const

export const templateCatalog: Record<TemplateId, TemplateMeta> = {
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean type and lots of whitespace.',
    ...REACT_PORTFOLIO,
    thumbnail: { background: '#ffffff', foreground: '#0a0a0a', accent: '#2563eb', font: 'sans', layout: 'stack' },
  },
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    description: 'Monospace, dark, command-line feel.',
    ...REACT_PORTFOLIO,
    thumbnail: { background: '#0b0f0c', foreground: '#c9f7d1', accent: '#39ff88', font: 'mono', layout: 'stack' },
  },
  bento: {
    id: 'bento',
    name: 'Bento',
    description: 'Bold, rounded card grid.',
    ...REACT_PORTFOLIO,
    thumbnail: { background: '#f4f1ea', foreground: '#1c1917', accent: '#ea580c', font: 'sans', layout: 'grid' },
  },
  editorial: {
    id: 'editorial',
    name: 'Editorial',
    description: 'Magazine-style serif headings.',
    ...REACT_PORTFOLIO,
    thumbnail: { background: '#fbfaf7', foreground: '#1a1a1a', accent: '#9f1239', font: 'serif', layout: 'stack' },
  },
  paper: {
    id: 'paper',
    name: 'Paper',
    description: 'Plain HTML, CSS and JS. No build step.',
    kind: 'static',
    dir: 'portfolio-static',
    contentPath: 'content/portfolio.js',
    thumbnail: { background: '#fffdf5', foreground: '#27272a', accent: '#0d9488', font: 'serif', layout: 'columns' },
  },
}

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
