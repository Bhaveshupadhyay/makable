import { renderPortfolioSource, type Portfolio, type TemplateEntry } from '@makable/shared'
import type { ProjectFiles } from '../engine/types'

/** The template's files with its content file generated from `portfolio`. */
export function buildProjectFiles(
  files: ProjectFiles,
  template: Pick<TemplateEntry, 'kind' | 'contentPath' | 'theme'>,
  portfolio: Portfolio,
): ProjectFiles {
  // Themed React templates read their look from the content's `template` field.
  const content = template.theme ? { ...portfolio, template: template.theme } : portfolio
  return { ...files, [template.contentPath]: renderPortfolioSource(content, template.kind) }
}
