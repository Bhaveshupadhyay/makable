import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { templateCatalog, type Portfolio, type TemplateMeta } from './portfolio'
import { renderPortfolioSource } from './portfolio-source'

const sample: Portfolio = {
  profile: { name: 'Ada', headline: 'Engineer', bio: 'Says "hi"', location: '', avatarUrl: '' },
  links: { github: 'https://github.com/ada', linkedin: '', x: '', website: '', email: '' },
  skills: ['TypeScript'],
  projects: [],
  template: 'terminal',
}

// One entry per distinct content file (several IDs share the React template).
const contentFiles = [
  ...new Map(Object.values(templateCatalog).map((t) => [`${t.dir}/${t.contentPath}`, t] as const)).values(),
]

test.each(contentFiles.map((t): [string, TemplateMeta] => [`${t.dir}/${t.contentPath}`, t]))(
  '%s: generated module round-trips the content',
  async (_, t) => {
    const dir = mkdtempSync(join(tmpdir(), 'portfolio-source-'))
    const file = join(dir, t.kind === 'react' ? 'portfolio.ts' : 'portfolio.js')
    writeFileSync(file, renderPortfolioSource(sample, t.kind))
    expect((await import(file)).portfolio).toEqual(sample)
  },
)

test.each(contentFiles.map((t): [string, TemplateMeta] => [`${t.dir}/${t.contentPath}`, t]))(
  '%s: generated header matches the template file it replaces',
  (path, t) => {
    const template = readFileSync(new URL(`../../templates/${path}`, import.meta.url), 'utf8')
    const header = (s: string) => s.slice(0, s.indexOf('export const'))
    expect(header(renderPortfolioSource(sample, t.kind))).toBe(header(template))
  },
)
