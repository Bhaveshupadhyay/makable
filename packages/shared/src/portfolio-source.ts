import { type Portfolio, portfolioSchema } from './portfolio'
import type { TemplateKind } from './template-catalog'

const HEADER = `// All copy on the site lives here. Components read it and tag elements with
// \`data-content="<path>"\` so the builder's visual editor can patch this file.`

/**
 * Renders a template's content file for the given portfolio: `portfolio.ts`
 * for React templates, `portfolio.js` for static ones. JSON is a valid object
 * literal in both, so the content is the JSON itself.
 */
export function renderPortfolioSource(portfolio: Portfolio, kind: TemplateKind): string {
  const json = JSON.stringify(portfolio, null, 2)
  return kind === 'react'
    ? `import type { Portfolio } from './types'\n\n${HEADER}\nexport const portfolio: Portfolio = ${json}\n`
    : `${HEADER}\nexport const portfolio = ${json}\n`
}

/**
 * Reads a content file back into a portfolio: the inverse of `renderPortfolioSource`, used when
 * an AI edit changes that file. The object literal must still be JSON and pass `portfolioSchema`.
 */
export function parsePortfolioSource(source: string): { ok: true; portfolio: Portfolio } | { ok: false; error: string } {
  const match = /export const portfolio(?:\s*:\s*Portfolio)?\s*=\s*/.exec(source)
  if (!match) return { ok: false, error: 'the content file must keep `export const portfolio = {...}`' }
  let json: unknown
  try {
    json = JSON.parse(source.slice(match.index + match[0].length).trim().replace(/;$/, ''))
  } catch {
    return { ok: false, error: 'the content object must stay valid JSON (double quotes, no trailing commas, no comments)' }
  }
  const parsed = portfolioSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: `the content is invalid at ${issue.path.join('.') || 'the top level'}: ${issue.message}` }
  }
  return { ok: true, portfolio: parsed.data }
}
