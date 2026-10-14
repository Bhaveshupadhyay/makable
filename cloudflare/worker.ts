// The Cloudflare Worker for the SPA (wrangler.jsonc). Static files and the SPA fallback are served from
// apps/web/dist without running this code; only `/api/*` (`run_worker_first`) gets here, and goes to the backend.
import { proxyToApi } from './api-proxy'

interface Env {
  API_ORIGIN?: string
}

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    if (!new URL(request.url).pathname.startsWith('/api/')) return new Response('Not found', { status: 404 })
    return proxyToApi(request, env.API_ORIGIN)
  },
}
