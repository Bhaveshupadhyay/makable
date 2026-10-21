import { describe, expect, test } from 'bun:test'
import { demoSource } from './demo'

describe('demoSource', () => {
  test('the resume link opens the demo', () => {
    expect(demoSource('?utm_source=res')).toBe('res')
    expect(demoSource('?utm_medium=pdf&utm_source=res')).toBe('res')
  })

  test('ignores case and spaces', () => {
    expect(demoSource('?utm_source=RES')).toBe('res')
    expect(demoSource('?utm_source=%20res%20')).toBe('res')
  })

  test('other visits do not', () => {
    for (const search of ['', '?', '?utm_source=', '?utm_source=resume', '?utm_source=twitter', '?utm_medium=res', '?source=res']) {
      expect(demoSource(search)).toBeNull()
    }
  })
})
