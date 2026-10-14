import { expect, test } from 'bun:test'

import worker from './worker'

test('answers only /api paths (static files never reach the Worker)', async () => {
  const response = await worker.fetch(new Request('https://makable.tech/builder'), { API_ORIGIN: 'https://api.example.com' })
  expect(response.status).toBe(404)
})

test('sends /api paths to the proxy', async () => {
  const response = await worker.fetch(new Request('https://makable.tech/api/v1/health/ready'), {})
  expect(response.status).toBe(500)
  expect(await response.json()).toMatchObject({ error: { code: 'api_not_configured' } })
})
