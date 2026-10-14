/**
 * Forwards the SPA's `/api/*` requests to the backend (`API_ORIGIN`, e.g. `https://api.makable.tech`). The SPA calls
 * the API on its own origin, because the session cookies are HttpOnly, SameSite=Lax and scoped to `/api/v1`, so on
 * Cloudflare Pages this Function stands in for the Vite dev proxy.
 */

// Hop-by-hop headers describe one connection, not the request, and `host` must be the backend's.
const DROPPED_HEADERS = ['connection', 'keep-alive', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host']

/** An error in the backend's envelope (`ErrorResponse`), so `backendFetch` shows it like any other API error. */
function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ success: false, error: { code, message } }, { status })
}

export async function proxyToApi(
  request: Request,
  apiOrigin: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (!apiOrigin) {
    return errorResponse(500, 'api_not_configured', 'The site has no API_ORIGIN set, so it can’t reach the API.')
  }
  const url = new URL(request.url)
  const target = new URL(url.pathname + url.search, apiOrigin)

  const headers = new Headers(request.headers)
  for (const name of DROPPED_HEADERS) headers.delete(name)
  // The visitor's IP, for the backend's logs (Cloudflare sets cf-connecting-ip on every request).
  const clientIp = request.headers.get('cf-connecting-ip')
  if (clientIp) headers.set('x-forwarded-for', clientIp)
  headers.set('x-forwarded-host', url.host)
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''))

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  try {
    // `manual`: the OAuth routes answer with redirects that must reach the browser, with their Set-Cookie headers.
    return await fetchImpl(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: 'manual',
    })
  } catch {
    return errorResponse(502, 'api_unreachable', 'Couldn’t reach the API. Try again in a moment.')
  }
}
