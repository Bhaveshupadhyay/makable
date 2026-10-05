import type { Portfolio } from '@makable/shared'
import type { GithubData } from '../api/github'

const FEATURED_PROJECTS = 4
const MAX_SKILLS = 8

/** GitHub's `blog` field is free text and often has no scheme. */
function normalizeUrl(value: string | null) {
  if (!value) return ''
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

/** Fills a portfolio from a GitHub profile. Keeps the template and anything GitHub doesn't provide. */
export function applyGithubData(portfolio: Portfolio, { profile, repos }: GithubData): Portfolio {
  const languages = [...new Set(repos.map((r) => r.language).filter((l): l is string => !!l))]
  return {
    ...portfolio,
    profile: {
      ...portfolio.profile,
      name: profile.name ?? profile.login,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio ?? portfolio.profile.bio,
      location: profile.location ?? portfolio.profile.location,
    },
    links: {
      ...portfolio.links,
      github: profile.htmlUrl,
      website: normalizeUrl(profile.blog) || portfolio.links.website,
      x: profile.twitterUsername ? `https://x.com/${profile.twitterUsername}` : portfolio.links.x,
      email: profile.email ?? portfolio.links.email,
    },
    skills: languages.slice(0, MAX_SKILLS),
    projects: repos.slice(0, FEATURED_PROJECTS),
  }
}
