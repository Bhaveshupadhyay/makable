import { fileURLToPath, URL } from 'node:url'
import { aiContentRequestSchema, aiEditRequestSchema } from '@makable/shared'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import { type ModelConfig, ModelError, runAiContent } from './dev-server/ai-content'
import { buildAiEditPrompt } from './dev-server/ai-edit-prompt'

const MAX_BODY = 1_000_000

type Handler = (json: unknown, send: (status: number, body: unknown) => void) => void | Promise<void>

/** A POST-only JSON middleware: reads the body (capped), parses it, and hands it to `handle`. */
function jsonEndpoint(server: ViteDevServer, route: string, handle: Handler) {
  server.middlewares.use(route, (req, res, next) => {
    if (req.method !== 'POST') return next()
    const send = (status: number, body: unknown) => {
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
      Promise.resolve(handle(json, send)).catch(() => send(500, { error: 'Unexpected error' }))
    })
  })
}

/**
 * Dev stand-ins for the control plane's AI endpoints until the Worker exists. They validate and
 * build prompts as the Worker will, and run before the `/api` proxy, so they work without
 * `wrangler dev`. System prompts stay on the server and are never returned.
 *
 * - `POST /api/ai/edit` (code edits, Tier 2): calls no model; returns the context it would send.
 * - `POST /api/ai/content` (content ops, Tier 1): calls an OpenAI-compatible model (OmniRoute by
 *   default) set by AI_BASE_URL / AI_API_KEY / AI_MODEL in `.env.local`.
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
      jsonEndpoint(server, '/api/ai/edit', (json, send) => {
        const request = aiEditRequestSchema.safeParse(json)
        if (!request.success) return send(400, { error: 'Invalid request', issues: request.error.issues })
        const prompt = buildAiEditPrompt(request.data)
        send(200, {
          note: 'Dev endpoint: no model was called and nothing was changed. Below is the context the server gives the model, after its own system prompt.',
          debug: { modelInput: prompt.messages.map((m) => m.content).join('\n\n') },
        })
      })

      jsonEndpoint(server, '/api/ai/content', async (json, send) => {
        const request = aiContentRequestSchema.safeParse(json)
        if (!request.success) return send(400, { error: 'Invalid request', issues: request.error.issues })
        try {
          const { response, modelInput, attempts } = await runAiContent(request.data, model)
          send(200, { ...response, debug: { modelInput, attempts, model: model.model } })
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
