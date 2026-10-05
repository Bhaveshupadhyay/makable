import { renderPortfolioSource, templateCatalog, type Portfolio } from '@makable/shared'
import type { ProjectFiles } from '../engine/types'

// Every template's source files, bundled into the SPA as raw text.
// Keys look like `<...>/packages/templates/<dir>/<path>`.
const rawTemplates = import.meta.glob(
  ['@templates/*/**/*', '!**/node_modules/**', '!**/dist/**', '!**/bun.lock'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

const filesByDir: Record<string, ProjectFiles> = {}
for (const [key, code] of Object.entries(rawTemplates)) {
  const [dir, ...rest] = key.slice(key.indexOf('templates/') + 'templates/'.length).split('/')
  ;(filesByDir[dir] ??= {})[rest.join('/')] = code
}

/** The selected template's files with its content file generated from `portfolio`. */
export function buildProjectFiles(portfolio: Portfolio): ProjectFiles {
  const template = templateCatalog[portfolio.template]
  const files = filesByDir[template.dir]
  if (!files) throw new Error(`Template folder "${template.dir}" not found in packages/templates`)
  return { ...files, [template.contentPath]: renderPortfolioSource(portfolio, template.kind) }
}
