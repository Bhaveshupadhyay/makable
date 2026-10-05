import { expect, test } from 'bun:test'
import { portfolioSchema, type Portfolio } from './portfolio'

const sample: Portfolio = {
  profile: { name: 'Ada', headline: 'Engineer', bio: '', location: '', avatarUrl: '' },
  links: { github: 'https://github.com/ada', linkedin: '', x: '', website: '', email: '' },
  skills: [],
  projects: [],
  template: 'minimal',
}

test('URLs must be http(s)', () => {
  const withWebsite = (website: string) => portfolioSchema.safeParse({ ...sample, links: { ...sample.links, website } }).success
  expect(withWebsite('https://ada.dev')).toBe(true)
  expect(withWebsite('')).toBe(true)
  expect(withWebsite('javascript:alert(1)')).toBe(false)
  expect(withWebsite('ftp://ada.dev')).toBe(false)
})
