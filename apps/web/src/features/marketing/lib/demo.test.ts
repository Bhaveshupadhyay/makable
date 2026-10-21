import { describe, expect, test } from 'bun:test'
import { demoSource, playedSeconds } from './demo'

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

describe('playedSeconds', () => {
  const ranges = (...spans: [number, number][]) => ({ length: spans.length, start: (i: number) => spans[i][0], end: (i: number) => spans[i][1] })

  test('nothing played', () => {
    expect(playedSeconds(ranges())).toBe(0)
  })

  test('adds up what played, leaving out what was skipped', () => {
    expect(playedSeconds(ranges([0, 12.5]))).toBe(12.5)
    expect(playedSeconds(ranges([0, 10], [40, 45]))).toBe(15)
  })
})
