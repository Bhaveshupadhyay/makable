// Mirrors `Portfolio` in @makable/shared (packages/shared/src/portfolio.ts).
// The builder checks at compile time that the two stay identical.

/** All catalog IDs. This template renders minimal, terminal, bento and editorial (see index.css). */
export type TemplateId = 'minimal' | 'terminal' | 'bento' | 'editorial' | 'paper'

export type PortfolioProject = {
  name: string
  description: string
  repoUrl: string
  homepageUrl: string
  language: string | null
  stars: number
}

export type Portfolio = {
  profile: {
    name: string
    headline: string
    bio: string
    location: string
    avatarUrl: string
  }
  links: {
    github: string
    linkedin: string
    x: string
    website: string
    email: string
  }
  skills: string[]
  projects: PortfolioProject[]
  template: TemplateId
}
