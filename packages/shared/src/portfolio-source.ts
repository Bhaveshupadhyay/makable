import type { Portfolio } from './portfolio'
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
