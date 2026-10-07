import { expect, test } from 'bun:test'
import { aiOpsResponseSchema, applyContentOps, type ContentOp } from './ai-ops'
import type { Portfolio } from './portfolio'

const project = (name: string) => ({ name, description: '', repoUrl: `https://github.com/o/${name}`, homepageUrl: '', language: null, stars: 1 })
const base: Portfolio = {
  profile: { name: 'Ada', headline: 'Engineer', bio: 'Hi', location: '', avatarUrl: '' },
  links: { github: 'https://github.com/ada', linkedin: '', x: '', website: '', email: '' },
  skills: ['TS', 'Go', 'Rust'],
  projects: [project('a'), project('b'), project('c')],
  template: 'minimal',
}
const apply = (...ops: ContentOp[]) => applyContentOps(base, ops)

test('set changes text and URL fields on a copy', () => {
  const r = apply({ op: 'set', path: 'profile.headline', value: 'Compiler hacker' }, { op: 'set', path: 'links.website', value: 'https://ada.dev' }, { op: 'set', path: 'projects.1.name', value: 'B2' })
  expect(r.ok && r.portfolio.profile.headline).toBe('Compiler hacker')
  expect(r.ok && r.portfolio.links.website).toBe('https://ada.dev')
  expect(r.ok && r.portfolio.projects[1].name).toBe('B2')
  expect(base.profile.headline).toBe('Engineer')
})

test('set rejects fields outside the allow-list and unknown or non-text paths', () => {
  for (const path of ['template', 'profile.avatarUrl', 'projects.0.stars', 'profile', '__proto__.x', 'skills.9', 'projects.5.name', 'profile.nope']) {
    expect(apply({ op: 'set', path, value: 'x' }).ok).toBe(false)
  }
})

test('the result must still be a valid portfolio', () => {
  expect(apply({ op: 'set', path: 'links.website', value: 'javascript:alert(1)' }).ok).toBe(false)
  expect(apply({ op: 'set', path: 'profile.name', value: '' }).ok).toBe(false)
  expect(apply({ op: 'set', path: 'links.email', value: 'nope' }).ok).toBe(false)
})

test('remove, insert and move on lists', () => {
  const r = apply({ op: 'remove', path: 'skills.0' }, { op: 'insert', path: 'skills', value: 'Zig' }, { op: 'insert', path: 'skills', index: 0, value: 'C' }, { op: 'move', path: 'projects.2', to: 0 })
  expect(r.ok && r.portfolio.skills).toEqual(['C', 'Go', 'Rust', 'Zig'])
  expect(r.ok && r.portfolio.projects.map((p) => p.name)).toEqual(['c', 'a', 'b'])
  expect(apply({ op: 'insert', path: 'projects', value: project('d') }).ok).toBe(true)
})

test('out-of-range and mistyped list ops fail', () => {
  expect(apply({ op: 'remove', path: 'skills.3' }).ok).toBe(false)
  expect(apply({ op: 'move', path: 'skills.0', to: 3 }).ok).toBe(false)
  expect(apply({ op: 'insert', path: 'skills', index: 9, value: 'x' }).ok).toBe(false)
  expect(apply({ op: 'insert', path: 'skills', value: project('d') }).ok).toBe(false)
  expect(apply({ op: 'insert', path: 'projects', value: 'x' }).ok).toBe(false)
})

test('a failing op rejects the whole batch', () => {
  const r = apply({ op: 'set', path: 'profile.bio', value: 'new' }, { op: 'remove', path: 'skills.7' })
  expect(r.ok).toBe(false)
  expect(!r.ok && r.error).toContain('Op 2')
})

test('the response schema caps and types ops', () => {
  expect(aiOpsResponseSchema.safeParse({ summary: 'ok', ops: [] }).success).toBe(true)
  expect(aiOpsResponseSchema.safeParse({ summary: 'ok', ops: [{ op: 'eval', path: 'x' }] }).success).toBe(false)
  expect(aiOpsResponseSchema.safeParse({ summary: 'ok', ops: Array(21).fill({ op: 'remove', path: 'skills.0' }) }).success).toBe(false)
})
