import { describe, expect, test } from 'bun:test'
import { labelIndexes, nearestIndex, niceTicks } from './chart'

describe('chart', () => {
  test('ticks are round and reach the top', () => {
    expect(niceTicks(0)).toEqual([0, 1])
    expect(niceTicks(3)).toEqual([0, 1, 2, 3])
    expect(niceTicks(17)).toEqual([0, 5, 10, 15, 20])
    expect(niceTicks(1840)).toEqual([0, 500, 1000, 1500, 2000])
    expect(niceTicks(1)).toEqual([0, 1])
  })

  test('x labels are spread out and keep both ends', () => {
    expect(labelIndexes(5)).toEqual([0, 1, 2, 3, 4])
    expect(labelIndexes(28)).toEqual([0, 6, 12, 18, 27])
    expect(labelIndexes(90)).toEqual([0, 18, 36, 54, 72, 89])
    expect(labelIndexes(0)).toEqual([])
  })

  test('the pointer snaps to the nearest day', () => {
    expect(nearestIndex(0, 300, 7)).toBe(0)
    expect(nearestIndex(149, 300, 7)).toBe(3)
    expect(nearestIndex(900, 300, 7)).toBe(6)
    expect(nearestIndex(10, 300, 1)).toBe(0)
  })
})
