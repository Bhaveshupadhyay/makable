import { expect, test } from 'bun:test'
import { SAFE_REPO_PATH, templateCatalogSchema } from './template-catalog'

const entry = (patch: Record<string, unknown> = {}) => ({
  id: 'clean-dev',
  category: 'dev-portfolio',
  name: 'Clean Dev',
  description: 'Sidebar portfolio',
  kind: 'static',
  version: 1,
  tags: ['clean'],
  contentPath: 'content/portfolio.js',
  thumbnailUrl: 'https://example.github.io/t/clean-dev/1/thumb.webp',
  demoUrl: 'https://example.github.io/t/clean-dev/1/demo/',
  filesUrl: 'https://example.github.io/t/clean-dev/1/files.json',
  ...patch,
})

test('parses the published catalog shape', () => {
  const catalog = templateCatalogSchema.parse({
    generatedAt: '2026-10-05T09:38:23.967Z',
    categories: [{ id: 'dev-portfolio', name: 'Developer Portfolio', description: 'x', count: 1 }],
    templates: [entry(), entry({ id: 'minimal', kind: 'react', theme: 'minimal', contentPath: 'src/content/portfolio.ts' })],
  })
  expect(catalog.templates.map((t) => t.id)).toEqual(['clean-dev', 'minimal'])
  expect(catalog.templates[1].theme).toBe('minimal')
})

test('drops broken, unsafe and duplicate entries but keeps the rest', () => {
  const catalog = templateCatalogSchema.parse({
    categories: [],
    templates: [
      entry(),
      entry({ id: 'Bad ID' }),
      entry({ id: 'http-files', filesUrl: 'http://example.com/files.json' }),
      entry({ id: 'js-thumb', thumbnailUrl: 'javascript:alert(1)' }),
      entry({ id: 'escape', contentPath: '../../etc/passwd' }),
      entry({ id: 'vue', kind: 'vue' }),
      entry({ name: 'Duplicate' }),
      'not an object',
    ],
  })
  expect(catalog.templates.map((t) => t.name)).toEqual(['Clean Dev'])
})

test('SAFE_REPO_PATH accepts template paths and rejects escapes', () => {
  for (const ok of ['index.html', 'src/content/portfolio.ts', '.gitignore', 'assets/png/john-doe.png']) expect(SAFE_REPO_PATH.test(ok)).toBe(true)
  for (const bad of ['/etc/passwd', '../x', 'a/../b', 'a/./b', 'a//b', 'a\\b', '', 'a/']) expect(SAFE_REPO_PATH.test(bad)).toBe(false)
})
