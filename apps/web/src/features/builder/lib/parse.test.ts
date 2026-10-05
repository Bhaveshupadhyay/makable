import { expect, test } from 'bun:test'
import { isSkip, parseEmail, parseGithubLogin, parseLinks } from './parse'

test('parseGithubLogin', () => {
  expect(parseGithubLogin('octocat')).toBe('octocat')
  expect(parseGithubLogin(' @octo-cat ')).toBe('octo-cat')
  expect(parseGithubLogin('https://github.com/octocat?tab=repos')).toBe('octocat')
  expect(parseGithubLogin('my name is bob')).toBeNull()
  expect(parseGithubLogin('-bad')).toBeNull()
  expect(parseGithubLogin('double--dash')).toBeNull()
})

test('parseEmail', () => {
  expect(parseEmail('ada@example.com')).toBe('ada@example.com')
  expect(parseEmail('sure, use ada@example.com.')).toBe('ada@example.com')
  expect(parseEmail('ada at example dot com')).toBeNull()
})

test('parseLinks sorts LinkedIn, X and website, ignoring GitHub and emails', () => {
  expect(
    parseLinks('linkedin.com/in/ada, https://twitter.com/ada and ada.dev. Also github.com/ada, mail ada@example.com'),
  ).toEqual({ linkedin: 'https://linkedin.com/in/ada', x: 'https://twitter.com/ada', website: 'https://ada.dev' })
  expect(parseLinks('no links here')).toEqual({})
})

test('isSkip', () => {
  for (const text of ['skip', 'No.', 'none', 'Keep it', 'keep']) expect(isSkip(text)).toBe(true)
  for (const text of ['skip the intro and say hi', 'I build things']) expect(isSkip(text)).toBe(false)
})

test('parseLinks keeps a standalone domain that also appears in an earlier email', () => {
  expect(parseLinks('me@ada.dev, ada.dev')).toEqual({ website: 'https://ada.dev' })
  expect(parseLinks('ada.dev and me@ada.dev')).toEqual({ website: 'https://ada.dev' })
})
