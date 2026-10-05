import { expect, test } from 'bun:test'
import type { Portfolio } from '@makable/shared'
import { applyContentEdit } from './apply-content-edit'

const portfolio: Portfolio = {
  profile: { name: 'Ada', headline: 'Engineer', bio: '', location: '', avatarUrl: '' },
  links: { github: 'https://github.com/ada', linkedin: '', x: '', website: '', email: '' },
  skills: ['TypeScript', 'Go'],
  projects: [
    { name: 'engine', description: 'Old', repoUrl: 'https://github.com/ada/engine', homepageUrl: '', language: null, stars: 1 },
  ],
  template: 'minimal',
}

test('edits nested object and array fields without mutating the input', () => {
  const name = applyContentEdit(portfolio, 'profile.name', 'Ada Lovelace')
  const project = applyContentEdit(portfolio, 'projects.0.description', 'New')
  const skill = applyContentEdit(portfolio, 'skills.1', 'Rust')
  expect(name.ok && name.portfolio.profile.name).toBe('Ada Lovelace')
  expect(project.ok && project.portfolio.projects[0].description).toBe('New')
  expect(skill.ok && skill.portfolio.skills).toEqual(['TypeScript', 'Rust'])
  expect(portfolio.profile.name).toBe('Ada')
})

test('rejects values the schema rejects', () => {
  expect(applyContentEdit(portfolio, 'links.email', 'not an email').ok).toBe(false)
  expect(applyContentEdit(portfolio, 'profile.name', '').ok).toBe(false)
  expect(applyContentEdit(portfolio, 'skills.0', '').ok).toBe(false)
})

test('rejects unknown, non-text and prototype paths', () => {
  for (const path of ['profile.nope', 'projects.5.name', 'projects.0.stars', 'profile', 'template.length', '__proto__.x', 'constructor', 'template', 'links.github', 'projects.0.repoUrl']) {
    expect(applyContentEdit(portfolio, path, 'x').ok).toBe(false)
  }
})
