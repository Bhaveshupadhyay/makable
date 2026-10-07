import { fileURLToPath, URL } from 'node:url'
import { aiEditRequestSchema } from '@makable/shared'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import { runAiEdit } from './dev-server/ai-edit'
import { type ModelConfig, ModelError } from './dev-server/model'

const MAX_BODY = 1_000_000

/** `signal` aborts when the client goes away (e.g. the user pressed Stop), so upstream work can stop. */
type Handler = (json: unknown, send: (status: number, body: unknown) => void, signal: AbortSignal) => void | Promise<void>

/** A POST-only JSON middleware: reads the body (capped), parses it, and hands it to `handle`. */
function jsonEndpoint(server: ViteDevServer, route: string, handle: Handler) {
  server.middlewares.use(route, (req, res, next) => {
    if (req.method !== 'POST') return next()
    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })
    const send = (status: number, body: unknown) => {
      if (res.writableEnded || controller.signal.aborted) return
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    }
    // Past the limit, keep draining without buffering, so the client gets a 413 instead of a reset.
    let raw = ''
    let tooLarge = false
    req.on('data', (chunk) => {
      if (tooLarge) return
      raw += chunk
      if (raw.length > MAX_BODY) {
        tooLarge = true
        raw = ''
      }
    })
    req.on('end', () => {
      if (tooLarge) return send(413, { error: 'Request too large' })
      let json: unknown
      try {
        json = JSON.parse(raw)
      } catch {
        return send(400, { error: 'Invalid JSON' })
      }
      Promise.resolve(handle(json, send, controller.signal)).catch(() => send(500, { error: 'Unexpected error' }))
    })
  })
}

/**
 * Dev stand-in for the control plane's `POST /api/ai/edit` until the Worker exists. It runs
 * before the `/api` proxy, so it works without `wrangler dev`. Tier 1 calls an OpenAI-compatible
 * model (OmniRoute by default) set by AI_BASE_URL / AI_API_KEY / AI_MODEL in `.env.local`.
 * Tier 2 (GitHub Actions) isn't built: those requests come back as `{ tier: 2, reason }`. The
 * system prompt stays on the server and is never returned.
 */
function devAi(env: Record<string, string>): Plugin {
  const model: ModelConfig = {
    baseUrl: env.AI_BASE_URL || 'http://localhost:20128/v1',
    apiKey: env.AI_API_KEY || undefined,
    model: env.AI_MODEL || 'auto',
  }
  return {
    name: 'makable-dev-ai',
    apply: 'serve',
    configureServer(server) {
      jsonEndpoint(server, '/api/ai/edit', async (json, send, signal) => {
        const request = aiEditRequestSchema.safeParse(json)
        if (!request.success) return send(400, { error: 'Invalid request', issues: request.error.issues })
        try {
          const { result, modelInput, attempts } = await runAiEdit(request.data, model, fetch, signal)
          send(200, { ...result, debug: { modelInput, attempts, model: model.model } })
        } catch (e) {
          if (e instanceof ModelError) return send(502, { error: e.message })
          throw e
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), devAi(loadEnv(mode, process.cwd(), ''))],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // The control plane Worker (`wrangler dev`) serves the API on :8787.
    proxy: { '/api': 'http://localhost:8787' },
  },
}))
