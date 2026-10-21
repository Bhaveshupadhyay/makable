import { describe, expect, test } from 'bun:test'
import { demoSource, playedSeconds, progressReached } from './demo'

describe('demoSource', () => {
  test('the resume links open the demo', () => {
    expect(demoSource('?utm_source=res')).toBe('res')
    expect(demoSource('?utm_source=resume')).toBe('resume')
    expect(demoSource('?utm_medium=pdf&utm_source=res')).toBe('res')
  })

  test('ignores case and spaces', () => {
    expect(demoSource('?utm_source=RES')).toBe('res')
    expect(demoSource('?utm_source=Resume')).toBe('resume')
    expect(demoSource('?utm_source=%20res%20')).toBe('res')
  })

  test('other visits do not', () => {
    for (const search of ['', '?', '?utm_source=', '?utm_source=resumes', '?utm_source=twitter', '?utm_medium=res', '?utm_medium=resume', '?source=res']) {
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

describe('progressReached', () => {
  test('nothing before a quarter has played', () => {
    expect(progressReached(0, 60)).toEqual([])
    expect(progressReached(14.9, 60)).toEqual([])
  })

  test('each quarter reached', () => {
    expect(progressReached(15, 60)).toEqual([25])
    expect(progressReached(31, 60)).toEqual([25, 50])
    expect(progressReached(45, 60)).toEqual([25, 50, 75])
  })

  test('within a second of the end counts as all of it', () => {
    expect(progressReached(59.2, 60)).toEqual([25, 50, 75, 100])
    expect(progressReached(60, 60)).toEqual([25, 50, 75, 100])
    expect(progressReached(58.5, 60)).toEqual([25, 50, 75])
  })

  test('nothing while the length is unknown', () => {
    expect(progressReached(10, Number.NaN)).toEqual([])
    expect(progressReached(10, Number.POSITIVE_INFINITY)).toEqual([])
    expect(progressReached(10, 0)).toEqual([])
  })
})
