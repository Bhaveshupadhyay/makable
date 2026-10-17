import { expect, test } from 'bun:test'
import { fitFrame, frameScaleStyle } from './fit-frame'

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

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'
const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1'
const FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0'

test('draws a scaled page with zoom, except in WebKit, which zooms an iframe twice', () => {
  expect(frameScaleStyle(0.5, CHROME)).toEqual({ height: '100%', zoom: 0.5 })
  expect(frameScaleStyle(0.5, FIREFOX)).toEqual({ height: '100%', zoom: 0.5 })
  expect(frameScaleStyle(0.5, SAFARI)).toEqual({ height: '200%', transform: 'scale(0.5)', transformOrigin: '0 0' })
  expect(frameScaleStyle(0.5, IOS_CHROME)).toEqual({ height: '200%', transform: 'scale(0.5)', transformOrigin: '0 0' })
})

test('a page at full size gets no scaling', () => {
  expect(frameScaleStyle(1, SAFARI)).toEqual({ height: '100%' })
  expect(frameScaleStyle(1, CHROME)).toEqual({ height: '100%' })
})
