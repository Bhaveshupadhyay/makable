import { expect, test } from 'bun:test'
import { ApiError } from '@/shared/lib/api-client'
import { createGithubReconnect, needsGithubReconnect, RECONNECT_COOLDOWN_MS } from './github-reconnect'

/** A reconnect over a fake tab: `tab.storage` survives "reloads" (new reconnects), `tab.trips` counts redirects. */
function fakeTab(start = 1_000_000) {
  const items = new Map<string, string>()
  const tab = {
    time: start,
    hidden: false,
    blocked: false,
    trips: 0,
    storage: {
      getItem: (key: string) => {
        if (tab.blocked) throw new Error('blocked')
        return items.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        if (tab.blocked) throw new Error('blocked')
        items.set(key, value)
      },
    },
    /** The page as it loads: a fresh reconnect over the same tab. */
    load: () =>
      createGithubReconnect({
        storage: () => tab.storage,
        now: () => tab.time,
        hidden: () => tab.hidden,
        go: () => {
          tab.trips += 1
        },
      }),
  }
  return tab
}

test('tells the GitHub token refusal from other errors', () => {
  expect(needsGithubReconnect(new ApiError(401, 'Your GitHub connection has expired.', 'github_reconnect'))).toBe(true)
  expect(needsGithubReconnect(new ApiError(401, 'Not signed in', 'unauthorized'))).toBe(false)
  expect(needsGithubReconnect(new ApiError(403, 'Missing scope', 'github_missing_scope'))).toBe(false)
  expect(needsGithubReconnect(new Error('github_reconnect'))).toBe(false)
})

test('signs in again once per page, and every later call in it says the browser is on its way', () => {
  const tab = fakeTab()
  const reconnect = tab.load()
  expect(reconnect('site')).toBe(true)
  expect(reconnect('ai')).toBe(true)
  expect(tab.trips).toBe(1)
})

test('a refusal right after coming back shows the error instead of looping', () => {
  const tab = fakeTab()
  expect(tab.load()('site')).toBe(true)
  tab.time += 5_000
  expect(tab.load()('site')).toBe(false)
  tab.time += RECONNECT_COOLDOWN_MS
  expect(tab.load()('publish')).toBe(true)
  expect(tab.trips).toBe(2)
})

test('a clock set back since the last reconnect does not hold it back', () => {
  const tab = fakeTab()
  expect(tab.load()('site')).toBe(true)
  tab.time -= 60_000
  expect(tab.load()('site')).toBe(true)
})

test('waits while the tab is hidden, without using up its reconnect', () => {
  const tab = fakeTab()
  const reconnect = tab.load()
  tab.hidden = true
  expect(reconnect('site')).toBe(false)
  tab.hidden = false
  expect(reconnect('site')).toBe(true)
  expect(tab.trips).toBe(1)
})

test('never redirects when storage is blocked, since it could not stop a loop', () => {
  const tab = fakeTab()
  tab.blocked = true
  expect(tab.load()('site')).toBe(false)
  expect(tab.trips).toBe(0)
})
