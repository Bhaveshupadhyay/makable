import { describe, expect, test } from 'bun:test'

import { proxyToApi } from './api-proxy'

const API = 'https://api.example.com'

function recordingFetch(response = new Response('{}', { status: 200 })) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return response
  }) as typeof fetch
  return { calls, fetchImpl }
}

describe('proxyToApi', () => {
  test('forwards the path and query to the API origin', async () => {
    const { calls, fetchImpl } = recordingFetch()
    await proxyToApi(new Request('https://makable.tech/api/v1/publish/p1/status?since=2026-10-14T07:00:00Z'), API, fetchImpl)
    expect(calls[0]?.url).toBe('https://api.example.com/api/v1/publish/p1/status?since=2026-10-14T07:00:00Z')
  })

  test('keeps cookies, sets forwarded headers and drops the host', async () => {
    const { calls, fetchImpl } = recordingFetch()
    const request = new Request('https://makable.tech/api/v1/auth/me', {
      headers: { cookie: 'access=abc', 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4', host: 'makable.tech' },
    })
    await proxyToApi(request, API, fetchImpl)
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get('cookie')).toBe('access=abc')
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7')
    expect(headers.get('x-forwarded-host')).toBe('makable.tech')
    expect(headers.get('x-forwarded-proto')).toBe('https')
    expect(headers.has('host')).toBe(false)
  })

  test('sends the body of a POST and none for a GET', async () => {
    const { calls, fetchImpl } = recordingFetch()
    await proxyToApi(new Request('https://makable.tech/api/v1/ai/edit', { method: 'POST', body: '{"a":1}' }), API, fetchImpl)
    await proxyToApi(new Request('https://makable.tech/api/v1/ai/models'), API, fetchImpl)
    expect(calls[0]?.init.method).toBe('POST')
    expect(await new Response(calls[0]?.init.body).text()).toBe('{"a":1}')
    expect(calls[1]?.init.body).toBeUndefined()
  })

  test('passes redirects and their cookies back instead of following them', async () => {
    const redirect = new Response(null, {
      status: 302,
      headers: [
        ['location', 'https://makable.tech/builder'],
        ['set-cookie', 'access=a; Path=/api/v1; HttpOnly'],
        ['set-cookie', 'refresh=r; Path=/api/v1/auth; HttpOnly'],
      ],
    })
    const { calls, fetchImpl } = recordingFetch(redirect)
    const response = await proxyToApi(new Request('https://makable.tech/api/v1/auth/github/callback?code=x'), API, fetchImpl)
    expect(calls[0]?.init.redirect).toBe('manual')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://makable.tech/builder')
    expect(response.headers.getSetCookie()).toHaveLength(2)
  })

  test('answers in the error envelope when the API is unreachable or not configured', async () => {
    const failing = (async () => {
      throw new TypeError('network')
    }) as unknown as typeof fetch
    const unreachable = await proxyToApi(new Request('https://makable.tech/api/v1/auth/me'), API, failing)
    expect(unreachable.status).toBe(502)
    expect(await unreachable.json()).toMatchObject({ success: false, error: { code: 'api_unreachable' } })

    const missing = await proxyToApi(new Request('https://makable.tech/api/v1/auth/me'), undefined)
    expect(missing.status).toBe(500)
    expect(await missing.json()).toMatchObject({ success: false, error: { code: 'api_not_configured' } })
  })
})
