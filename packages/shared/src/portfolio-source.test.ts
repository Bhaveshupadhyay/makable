import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Portfolio } from './portfolio'
import { parsePortfolioSource, renderPortfolioSource } from './portfolio-source'
import type { TemplateKind } from './template-catalog'

const sample: Portfolio = {
  profile: { name: 'Ada', headline: 'Engineer', bio: 'Says "hi"', location: '', avatarUrl: '' },
  links: { github: 'https://github.com/ada', linkedin: '', x: '', website: '', email: '' },
  skills: ['TypeScript'],
  projects: [],
  template: 'terminal',
}

// The template sources in this repo, one per content file format.
const contentFiles: [string, TemplateKind][] = [
  ['portfolio/src/content/portfolio.ts', 'react'],
  ['portfolio-static/content/portfolio.js', 'static'],
]

test.each(contentFiles)(
  '%s: generated module round-trips the content',
  async (_, kind) => {
    const dir = mkdtempSync(join(tmpdir(), 'portfolio-source-'))
    const file = join(dir, kind === 'react' ? 'portfolio.ts' : 'portfolio.js')
    writeFileSync(file, renderPortfolioSource(sample, kind))
    expect((await import(file)).portfolio).toEqual(sample)
  },
)

test.each(contentFiles)(
  '%s: generated header matches the template file it replaces',
  (path, kind) => {
    const template = readFileSync(new URL(`../../templates/${path}`, import.meta.url), 'utf8')
    const header = (s: string) => s.slice(0, s.indexOf('export const'))
    expect(header(renderPortfolioSource(sample, kind))).toBe(header(template))
  },
)

test.each(['react', 'static'] as const)('%s: parsePortfolioSource reads the generated file back', (kind) => {
  const source = renderPortfolioSource(sample, kind)
  expect(parsePortfolioSource(source)).toEqual({ ok: true, portfolio: sample })
  expect(parsePortfolioSource(source.replace('"Engineer"', '"Builder"'))).toMatchObject({ ok: true, portfolio: { profile: { headline: 'Builder' } } })
  expect(parsePortfolioSource(source.replace('"Engineer"', "'Engineer'"))).toMatchObject({ ok: false, error: expect.stringContaining('JSON') })
  expect(parsePortfolioSource(source.replace('"https://github.com/ada"', '"javascript:alert(1)"'))).toMatchObject({ ok: false, error: expect.stringContaining('links.github') })
  expect(parsePortfolioSource('export default {}').ok).toBe(false)
})
