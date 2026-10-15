import { expect, test } from 'bun:test'
import { fitsKeepalive, MAX_WAIT_MS, nextSaveDelay, retryAfterMs, SAVE_DELAY_MS } from './save-timing'

test('keepalive bodies are capped by bytes, not characters', () => {
  expect(fitsKeepalive('x'.repeat(60_000))).toBe(true)
  expect(fitsKeepalive('é'.repeat(30_001))).toBe(false)
})

test('saves wait for a pause in changes, but never longer than the maximum wait or shorter than GitHub asks', () => {
  const t = 1_000_000
  expect(nextSaveDelay(t, t, 0)).toBe(SAVE_DELAY_MS)
  expect(nextSaveDelay(t + 100_000, t, 0)).toBe(MAX_WAIT_MS - 100_000)
  expect(nextSaveDelay(t + 200_000, t, 0)).toBe(0)
  expect(nextSaveDelay(t, t, t + 180_000)).toBe(180_000)
})

test("the server's wait is read from the error details", () => {
  expect(retryAfterMs({ retryAfter: 180 })).toBe(180_000)
  expect(retryAfterMs({})).toBeNull()
  expect(retryAfterMs(null)).toBeNull()
  expect(retryAfterMs({ retryAfter: 'soon' })).toBeNull()
})
