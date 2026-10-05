import { expect, test } from 'bun:test'
import { safeReturnTo } from './safe-return-to'

const origin = 'https://makable.dev'

test('keeps same-origin paths', () => {
  expect(safeReturnTo('/', origin)).toBe('/')
  expect(safeReturnTo('/projects/1?tab=preview#top', origin)).toBe('/projects/1?tab=preview#top')
})

test('falls back to / for missing, absolute and cross-origin values', () => {
  for (const value of [null, '', 'projects', 'https://evil.com', '//evil.com', '/\\evil.com', '/\\/evil.com', 'javascript:alert(1)']) {
    expect(safeReturnTo(value, origin)).toBe('/')
  }
})
