import { expect, test } from 'bun:test'
import { clean, createAnalytics, MAX_STRING } from './analytics'
import type { AnalyticsProps, AnalyticsProvider } from './types'

function recorder(name = 'test') {
  const calls: [string, ...unknown[]][] = []
  const provider: AnalyticsProvider = {
    name,
    track: (event, props) => calls.push(['track', event, props]),
    identify: (id, traits) => calls.push(['identify', id, traits]),
    reset: () => calls.push(['reset']),
  }
  return { provider, calls }
}

test('sends each event to every provider, with the context merged in', () => {
  const analytics = createAnalytics()
  const a = recorder('a')
  const b = recorder('b')
  analytics.addProvider(a.provider)
  analytics.addProvider(b.provider)
  analytics.setContext({ app: 'makable-web' })
  analytics.track('ai_edit_invalid', { length: 3 })
  for (const { calls } of [a, b]) expect(calls).toEqual([['track', 'ai_edit_invalid', { app: 'makable-web', length: 3 }]])
})

test('does nothing without providers, and registers a provider once', () => {
  const analytics = createAnalytics()
  analytics.track('signed_out', {})
  const a = recorder()
  analytics.addProvider(a.provider)
  analytics.addProvider(a.provider)
  expect(analytics.providers).toEqual(['test'])
  analytics.track('signed_out', {})
  expect(a.calls).toHaveLength(1)
})

test('a failing provider never breaks the others or the caller', () => {
  const analytics = createAnalytics()
  analytics.addProvider({
    name: 'broken',
    track: () => {
      throw new Error('boom')
    },
  })
  const ok = recorder()
  analytics.addProvider(ok.provider)
  expect(() => analytics.track('signed_out', {})).not.toThrow()
  expect(ok.calls).toHaveLength(1)
})

test('page views fall back to a page_view event for providers without page()', () => {
  const analytics = createAnalytics()
  const a = recorder()
  analytics.addProvider(a.provider)
  analytics.page({ path: '/about', url: 'https://makable.dev/about', title: 'About', referrer: '' })
  expect(a.calls[0]).toEqual(['track', 'page_view', { path: '/about', url: 'https://makable.dev/about', title: 'About', referrer: '' }])
})

test('setContext removes keys set to undefined; identify and reset reach providers', () => {
  const analytics = createAnalytics()
  const a = recorder()
  analytics.addProvider(a.provider)
  analytics.setContext({ login: 'octocat', signed_in: true })
  analytics.setContext({ login: undefined })
  analytics.track('signed_out', {})
  expect(a.calls[0][2]).toEqual({ signed_in: true })
  analytics.identify('u1', { login: 'octocat' })
  analytics.reset()
  expect(a.calls.slice(1)).toEqual([['identify', 'u1', { login: 'octocat' }], ['reset']])
})

test('clean caps strings and lists and drops empty values and what providers cannot take', () => {
  const props = clean({
    long: 'x'.repeat(MAX_STRING + 10),
    list: Array.from({ length: 80 }, (_, i) => i),
    skip: undefined,
    none: null,
    fn: () => 1,
    nan: Number.NaN,
    when: new Date('2026-01-02T03:04:05Z'),
    deep: { a: { b: { c: 1 } } },
  }) as AnalyticsProps
  expect((props.long as string).length).toBe(MAX_STRING)
  expect((props.long as string).endsWith('…')).toBe(true)
  expect(props.list).toHaveLength(50)
  expect(['skip', 'none', 'fn', 'nan'].some((key) => key in props)).toBe(false)
  expect(props.when).toBe('2026-01-02T03:04:05.000Z')
  expect(props.deep).toEqual({ a: {} })
})
