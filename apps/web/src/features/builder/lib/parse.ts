import { portfolioSchema } from '@makable/shared'

// Parsers for free-text chat answers. Each returns null when the text doesn't fit.

const linkSchema = portfolioSchema.shape.links.shape

/** “skip”, “no”, “keep it”… */
export function isSkip(text: string) {
  return /^(skip|no|nope|none|n\/a|nothing|keep( it)?|-)[.!]?$/i.test(text.trim())
}

/** Accepts `octocat`, `@octocat` or a github.com profile URL. */
export function parseGithubLogin(text: string): string | null {
  let value = text.trim().replace(/^@/, '')
  const url = value.match(/github\.com\/([^/?#\s]+)/i)
  if (url) value = url[1]
  return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(value) ? value : null
}

export function parseEmail(text: string): string | null {
  const candidate = text.match(/[^\s<>()"',;]+@[^\s<>()"',;]+/)?.[0].replace(/[.]$/, '')
  return candidate && linkSchema.email.safeParse(candidate).success ? candidate : null
}

export type ParsedLinks = Partial<Record<'linkedin' | 'x' | 'website', string>>

/** Finds URLs in free text and sorts them into LinkedIn, X and website. GitHub links are ignored. */
export function parseLinks(text: string): ParsedLinks {
  const links: ParsedLinks = {}
  const candidates = text.match(/(?:https?:\/\/)?(?:[a-z\d-]+\.)+[a-z]{2,}(?:\/[^\s,]*)?/gi) ?? []
  for (const raw of candidates) {
    // The part after @ in an email address looks like a domain; skip it.
    const index = text.indexOf(raw)
    if (index > 0 && text[index - 1] === '@') continue
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    if (!linkSchema.website.safeParse(url).success) continue
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host === 'github.com') continue
    const key = host.endsWith('linkedin.com') ? 'linkedin' : host === 'x.com' || host === 'twitter.com' ? 'x' : 'website'
    links[key] ??= url
  }
  return links
}
