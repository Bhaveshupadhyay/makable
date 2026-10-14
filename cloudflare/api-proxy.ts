/**
 * Forwards the SPA's `/api/*` requests to the backend (`API_ORIGIN`, e.g. `https://api.makable.tech`). The SPA calls
 * the API on its own origin, because the session cookies are HttpOnly, SameSite=Lax and scoped to `/api/v1`, so on
 * Cloudflare Pages this Function stands in for the Vite dev proxy.
 */

// Hop-by-hop headers describe one connection, not the request (RFC 9110 §7.6.1), so neither direction forwards them.
// `host` must be the backend's, and `proxy-authorization` is meant for this proxy, not the backend.
const HOP_BY_HOP_HEADERS = ['connection', 'keep-alive', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade']
const REQUEST_ONLY_DROPPED = ['host', 'proxy-authorization']

/** An error in the backend's envelope (`ErrorResponse`), so `backendFetch` shows it like any other API error. */
function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ success: false, error: { code, message } }, { status })
}

/** The fixed hop-by-hop headers and every header the `Connection` header names. */
function withoutHopByHop(source: Headers, extra: readonly string[] = []): Headers {
  const headers = new Headers(source)
  const named = (source.get('connection') ?? '').split(',').map((name) => name.trim().toLowerCase())
  for (const name of [...HOP_BY_HOP_HEADERS, ...extra, ...named]) {
    if (name) headers.delete(name)
  }
  return headers
}

/**
 * The API's origin, or null if it isn't usable. Requests carry the session cookies, so only https is accepted, except
 * for a local backend (`wrangler pages dev` against `http://localhost:8787`).
 */
export function parseApiOrigin(value: string | undefined): URL | null {
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  return url.protocol === 'https:' || (url.protocol === 'http:' && local) ? url : null
}

export async function proxyToApi(
  request: Request,
  apiOrigin: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const origin = parseApiOrigin(apiOrigin)
  if (!origin) {
    return errorResponse(500, 'api_not_configured', 'The site’s API_ORIGIN isn’t set to an https URL, so it can’t reach the API.')
  }
  const url = new URL(request.url)
  const target = new URL(url.pathname + url.search, origin)

  const headers = withoutHopByHop(request.headers, REQUEST_ONLY_DROPPED)
  // The visitor's IP, for the backend's logs (Cloudflare sets cf-connecting-ip on every request).
  const clientIp = request.headers.get('cf-connecting-ip')
  if (clientIp) headers.set('x-forwarded-for', clientIp)
  headers.set('x-forwarded-host', url.host)
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''))

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  let response: Response
  try {
    response = await fetchImpl(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // `manual`: the OAuth routes answer with redirects that must reach the browser, with their Set-Cookie headers.
      redirect: 'manual',
      // Stop in the AI box aborts the browser's request; this passes that on, so the backend stops the model call.
      signal: request.signal,
    })
  } catch (error) {
    if (request.signal.aborted) return errorResponse(499, 'client_closed_request', 'The request was cancelled.')
    console.error('API request failed', { method: request.method, path: url.pathname, target: origin.host, error: String(error) })
    return errorResponse(502, 'api_unreachable', 'Couldn’t reach the API. Try again in a moment.')
  }
  // `Headers` keeps each Set-Cookie separate, so copying them doesn't merge the cookies.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: withoutHopByHop(response.headers),
  })
}
