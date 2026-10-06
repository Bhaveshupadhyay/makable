import { fileURLToPath, URL } from 'node:url'
import { aiEditRequestSchema } from '@makable/shared'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { buildAiEditPrompt } from './dev-server/ai-edit-prompt'

const MAX_BODY = 1_000_000

/**
 * Dev stand-in for the control plane's `POST /api/ai/edit` until the Worker exists. It validates
 * the request and builds the prompt as the Worker will, but calls no model. Instead it returns,
 * as `debug`, the context it would give the model, so the builder can show it. The system prompt
 * stays on the server and is never returned. Runs before the `/api` proxy, so it works without
 * `wrangler dev`.
 */
function devAiEdit(): Plugin {
  return {
    name: 'makable-dev-ai-edit',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/ai/edit', (req, res, next) => {
        if (req.method !== 'POST') return next()
        const send = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        let raw = ''
        req.on('data', (chunk) => {
          raw += chunk
          if (raw.length > MAX_BODY) req.destroy()
        })
        req.on('end', () => {
          let json: unknown
          try {
            json = JSON.parse(raw)
          } catch {
            return send(400, { error: 'Invalid JSON' })
          }
          const request = aiEditRequestSchema.safeParse(json)
          if (!request.success) return send(400, { error: 'Invalid request', issues: request.error.issues })
          const prompt = buildAiEditPrompt(request.data)
          send(200, {
            note: 'Dev endpoint: no model was called and nothing was changed. Below is the context the server gives the model, after its own system prompt.',
            debug: { modelInput: prompt.messages.map((m) => m.content).join('\n\n') },
          })
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), devAiEdit()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // The control plane Worker (`wrangler dev`) serves the API on :8787.
    proxy: { '/api': 'http://localhost:8787' },
  },
})
