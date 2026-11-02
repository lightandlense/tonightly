import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Dev only: serves POST /api/chat from server/ with your local AWS profile. The Lambda serves it in production.
function chatApi(env: Record<string, string>): Plugin {
  return {
    name: 'tonightly-chat-api',
    configureServer(server) {
      process.env.AWS_PROFILE ??= env.AWS_PROFILE || 'tonightly'
      server.middlewares.use('/api/chat', async (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST only.' })
        let raw = ''
        for await (const chunk of req) {
          raw += chunk
          if (raw.length > 10_000) return reply(413, { ok: false, error: 'Too long.' })
        }
        let body: unknown = null
        try {
          body = JSON.parse(raw)
        } catch {
          // handleChat rejects a null body with a 400
        }
        try {
          const { handle } = await server.ssrLoadModule('/server/dev.ts')
          const out = await handle(body, env)
          reply(out.status, out.body)
        } catch (e) {
          console.error('/api/chat failed', e)
          reply(500, { ok: false, error: 'Something went wrong. Try again.' })
        }
      })
    },
  }
}

// The TMDB proxy adds the token server-side so it never reaches the browser.
// In production the Lambda serves /api/tmdb the same way.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    plugins: [react(), chatApi(env)],
    server: {
      proxy: {
        '/api/tmdb': {
          target: 'https://api.themoviedb.org/3',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/tmdb/, ''),
          headers: { Authorization: `Bearer ${env.TMDB_READ_TOKEN}` },
        },
      },
    },
    test: { environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
  }
})
