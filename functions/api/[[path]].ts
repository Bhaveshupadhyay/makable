// Cloudflare Pages Function for every `/api/*` path; static files are served without it. See cloudflare/api-proxy.ts.
import { proxyToApi } from '../../cloudflare/api-proxy'

interface Env {
  API_ORIGIN?: string
}

export const onRequest = ({ request, env }: { request: Request; env: Env }): Promise<Response> =>
  proxyToApi(request, env.API_ORIGIN)
