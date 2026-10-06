import { expect, test } from 'bun:test'
import { placePopover, POPOVER_HEIGHT } from './place-popover'

const bounds = { width: 800, height: 600 }

test('sits just below the element, aligned to its left edge', () => {
  expect(placePopover({ x: 100, y: 50, width: 200, height: 40 }, bounds)).toEqual({ left: 100, width: 360, side: 'below', top: 98 })
})

test('flips above an element near the bottom', () => {
  const place = placePopover({ x: 100, y: 500, width: 200, height: 60 }, bounds)
  expect(place.side).toBe('above')
  expect(place.bottom).toBe(108)
})

test('stays inside the preview horizontally', () => {
  expect(placePopover({ x: 700, y: 50, width: 80, height: 20 }, bounds).left).toBe(800 - 360 - 8)
  expect(placePopover({ x: -40, y: 50, width: 80, height: 20 }, bounds).left).toBe(8)
  expect(placePopover({ x: 0, y: 50, width: 80, height: 20 }, { width: 300, height: 600 }).width).toBe(284)
})

test('stays in view when the element is scrolled out of the preview', () => {
  expect(placePopover({ x: 10, y: -500, width: 100, height: 100 }, bounds)).toMatchObject({ side: 'below', top: 8 })
  expect(placePopover({ x: 10, y: 900, width: 100, height: 20 }, bounds)).toMatchObject({ side: 'above', bottom: 8 })
  // A tall element filling the preview: below, clamped to the bottom edge.
  expect(placePopover({ x: 10, y: 0, width: 100, height: 2000 }, bounds).top).toBe(600 - POPOVER_HEIGHT - 8)
})
