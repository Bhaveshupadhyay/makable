import { expect, test } from 'bun:test'
import { type AiEditRequest, type Portfolio, renderPortfolioSource } from '@makable/shared'
import { applyEditResult } from './apply-edit-result'

const portfolio: Portfolio = {
  profile: { name: 'Ada', headline: 'Engineer', bio: '', location: '', avatarUrl: '' },
  links: { github: 'https://github.com/ada', linkedin: '', x: '', website: '', email: '' },
  skills: ['TypeScript'],
  projects: [],
  template: 'terminal',
}
const contentPath = 'src/content/portfolio.ts'
// Themed templates render their theme into the content file.
const content = renderPortfolioSource({ ...portfolio, template: 'terminal-theme' }, 'react')
const projectFiles = { 'src/Hero.tsx': '<a className="bg-blue-600">Hi</a>', [contentPath]: content }
const request = {
  instruction: 'x',
  target: null,
  template: { id: 'terminal', name: 'Terminal', kind: 'react', version: 1, contentPath },
  fileTree: Object.keys(projectFiles),
  files: Object.entries(projectFiles).map(([path, text]) => ({ path, content: text, reason: '' })),
} satisfies AiEditRequest
const draft = { portfolio, files: {} }

test('code edits become AI-edited files; the portfolio object is kept', () => {
  const result = applyEditResult(request, [{ path: 'src/Hero.tsx', search: 'blue', replace: 'green' }], projectFiles, draft)
  expect(result).toEqual({ ok: true, draft: { portfolio, files: { 'src/Hero.tsx': '<a className="bg-green-600">Hi</a>' } }, changed: ['src/Hero.tsx'] })
  if (result.ok) expect(result.draft.portfolio).toBe(portfolio)
})

test('content file edits become the portfolio, keeping the template id; files are kept', () => {
  const result = applyEditResult(request, [{ path: contentPath, search: '"Engineer"', replace: '"Builder"' }], projectFiles, draft)
  expect(result.ok && result.draft.portfolio).toEqual({ ...portfolio, profile: { ...portfolio.profile, headline: 'Builder' } })
  if (result.ok) expect(result.draft.files).toBe(draft.files)
})

test('rejects stale requests, bad edits, invalid content and no-ops', () => {
  expect(applyEditResult(request, [], { ...projectFiles, 'src/Hero.tsx': 'changed' }, draft)).toEqual({ ok: false, reason: 'the site changed while the AI was working' })
  expect(applyEditResult(request, [{ path: 'src/Hero.tsx', search: 'nope', replace: '' }], projectFiles, draft).ok).toBe(false)
  expect(applyEditResult(request, [{ path: contentPath, search: '"Engineer"', replace: 'Engineer' }], projectFiles, draft)).toMatchObject({ ok: false, reason: expect.stringContaining('JSON') })
  expect(applyEditResult(request, [], projectFiles, draft)).toEqual({ ok: false, reason: 'no changes' })
})
