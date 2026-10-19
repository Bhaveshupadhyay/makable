import { describe, expect, test } from 'bun:test'
import { change, formatChange, formatCount, formatDay, formatDuration, formatPercent } from './format'

describe('format', () => {
  test('counts are exact under 10,000 and compact above', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(1284)).toBe('1,284')
    expect(formatCount(12_900)).toBe('12.9K')
    expect(formatCount(4_210_000)).toBe('4.2M')
  })

  test('durations', () => {
    expect(formatDuration(44.6)).toBe('45s')
    expect(formatDuration(185)).toBe('3m 05s')
    expect(formatDuration(4321)).toBe('1h 12m')
    expect(formatDuration(-3)).toBe('0s')
  })

  test('percentages drop a trailing .0', () => {
    expect(formatPercent(0.2761)).toBe('27.6%')
    expect(formatPercent(0.5)).toBe('50%')
    expect(formatPercent(0)).toBe('0%')
  })

  test('a change needs something to compare with', () => {
    expect(change(120, 100)).toBeCloseTo(0.2)
    expect(change(0, 0)).toBe(0)
    expect(change(5, 0)).toBeNull()
    expect(formatChange(0.204)).toBe('+20%')
    expect(formatChange(-0.08)).toBe('−8%')
    expect(formatChange(0.001)).toBe('0%')
  })

  test('days are the property’s days, whatever the browser’s time zone', () => {
    expect(formatDay('2026-10-03')).toBe('Oct 3')
    expect(formatDay('2026-10-03', { long: true })).toBe('Sat, Oct 3, 2026')
  })
})
