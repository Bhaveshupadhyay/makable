import { expect, test } from 'bun:test'
import { fitFrame } from './fit-frame'

test('scales a page wider than the pane down to fit, keeping its width', () => {
  expect(fitFrame(1280, 960, true)).toEqual({ width: 1280, scale: 0.75 })
  expect(fitFrame(768, 384)).toEqual({ width: 768, scale: 0.5 })
})

test('a growing page takes a wider pane at full size', () => {
  expect(fitFrame(1280, 1500, true)).toEqual({ width: 1500, scale: 1 })
})

test('a fixed-width page stays its width in a wider pane', () => {
  expect(fitFrame(390, 900)).toEqual({ width: 390, scale: 1 })
})

test('an unmeasured or empty pane draws at full size', () => {
  expect(fitFrame(1280, 0, true)).toEqual({ width: 1280, scale: 1 })
})

test('a scaled page is drawn at a whole number of pixels, so rounding never narrows it', () => {
  expect(fitFrame(1280, 960.6, true)).toEqual({ width: 1280, scale: 0.75 })
  expect(fitFrame(768, 500.9).scale * 768).toBe(500)
})
