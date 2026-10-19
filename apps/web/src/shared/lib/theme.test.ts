import { describe, expect, test } from 'bun:test'
import { parseChoice, resolveTheme } from './theme'

describe('parseChoice', () => {
  test('keeps a saved light or dark', () => {
    expect(parseChoice('light')).toBe('light')
    expect(parseChoice('dark')).toBe('dark')
  })

  test('anything else is system', () => {
    for (const value of ['system', undefined, null, 'blue', 1, {}]) expect(parseChoice(value)).toBe('system')
  })
})

describe('resolveTheme', () => {
  test('an explicit choice wins over the system', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  test('system follows the system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})
