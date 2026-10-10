import { expect, test } from 'bun:test'
import { initialConversation } from './conversation'
import { fitsKeepalive, hasContent, MAX_WAIT_MS, nextSaveDelay, retryAfterMs, SAVE_DELAY_MS } from './github-sync'
import type { SessionState } from './session-file'

const portfolio = {
  profile: { name: 'Ada', headline: 'Engineer', bio: '', location: '', avatarUrl: '' },
  links: { github: '', linkedin: '', x: '', website: '', email: '' },
  skills: [],
  projects: [],
  template: 'minimal',
}
const state: Pick<SessionState, 'conversation'> = { conversation: { ...initialConversation(), portfolio } }

test('only a started site is worth saving', () => {
  expect(hasContent(state)).toBe(true)
  expect(hasContent({ conversation: initialConversation() })).toBe(false)
})

test('keepalive bodies are capped by bytes, not characters', () => {
  expect(fitsKeepalive('x'.repeat(60_000))).toBe(true)
  expect(fitsKeepalive('é'.repeat(30_001))).toBe(false)
})

test('saves wait for a pause in changes, but never longer than the maximum wait or shorter than GitHub asks', () => {
  const t = 1_000_000
  // A first change: the usual delay.
  expect(nextSaveDelay(t, t, 0)).toBe(SAVE_DELAY_MS)
  // Changes keep coming: the save can't be pushed past MAX_WAIT_MS after the first unsaved one.
  expect(nextSaveDelay(t + 100_000, t, 0)).toBe(MAX_WAIT_MS - 100_000)
  expect(nextSaveDelay(t + 200_000, t, 0)).toBe(0)
  // GitHub asked to wait: never earlier than that.
  expect(nextSaveDelay(t, t, t + 180_000)).toBe(180_000)
})

test("GitHub's wait is read from the error details", () => {
  expect(retryAfterMs({ retryAfter: 180 })).toBe(180_000)
  expect(retryAfterMs({})).toBeNull()
  expect(retryAfterMs(null)).toBeNull()
  expect(retryAfterMs({ retryAfter: 'soon' })).toBeNull()
})
