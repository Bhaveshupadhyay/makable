import { afterEach, expect, test } from 'bun:test'
import { ApiError, backendFetch } from './api-client'

type Call = { url: string; method: string }

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Replaces fetch with `handler` and records each call. */
function mockFetch(handler: (call: Call) => Response | Promise<Response>): Call[] {
  const calls: Call[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), method: init?.method ?? 'GET' }
    calls.push(call)
    return handler(call)
  }) as typeof fetch
  return calls
}

const json = (status: number, body: unknown) => Response.json(body, { status })
const unauthorized = () => json(401, { success: false, error: { code: 'unauthorized', message: 'Not signed in' } })

test('calls /api/v1 and unwraps the envelope', async () => {
  const calls = mockFetch(() => json(200, { success: true, data: { user: { login: 'octocat' } } }))

  expect(await backendFetch('/auth/session')).toEqual({ user: { login: 'octocat' } })
  expect(calls).toEqual([{ url: '/api/v1/auth/session', method: 'GET' }])
})

test('returns undefined for 204', async () => {
  mockFetch(() => new Response(null, { status: 204 }))

  expect(await backendFetch('/auth/logout', { method: 'POST' })).toBeUndefined()
})

test('turns an error envelope into ApiError with the server code', async () => {
  mockFetch(() => json(403, { success: false, error: { code: 'forbidden', message: 'Not allowed' } }))

  const err = await backendFetch('/admin').catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect(err).toMatchObject({ status: 403, code: 'forbidden', message: 'Not allowed' })
})

test('handles errors without a JSON body', async () => {
  mockFetch(() => new Response('Bad Gateway', { status: 502 }))

  await expect(backendFetch('/auth/session')).rejects.toMatchObject({ status: 502, code: undefined })
})

test('on 401 refreshes once and retries', async () => {
  let signedIn = false
  const calls = mockFetch(({ url }) => {
    if (url === '/api/v1/auth/refresh') {
      signedIn = true
      return new Response(null, { status: 204 })
    }
    return signedIn ? json(200, { success: true, data: 'ok' }) : unauthorized()
  })

  expect(await backendFetch('/auth/session')).toBe('ok')
  expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
    'GET /api/v1/auth/session',
    'POST /api/v1/auth/refresh',
    'GET /api/v1/auth/session',
  ])
})

test('throws the 401 when the refresh fails', async () => {
  const calls = mockFetch(() => unauthorized())

  await expect(backendFetch('/auth/session')).rejects.toMatchObject({ status: 401, code: 'unauthorized' })
  expect(calls).toHaveLength(2)
})

test('parallel 401s share one refresh', async () => {
  let signedIn = false
  const calls = mockFetch(async ({ url }) => {
    if (url === '/api/v1/auth/refresh') {
      await Promise.resolve()
      signedIn = true
      return new Response(null, { status: 204 })
    }
    return signedIn ? json(200, { success: true, data: url }) : unauthorized()
  })

  const results = await Promise.all([backendFetch('/a'), backendFetch('/b')])

  expect(results).toEqual(['/api/v1/a', '/api/v1/b'])
  expect(calls.filter((c) => c.url === '/api/v1/auth/refresh')).toHaveLength(1)
})
