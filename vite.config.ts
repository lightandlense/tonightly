import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev only: the proxy adds the TMDB token server-side so it never reaches the browser.
// In production the Lambda serves /api/tmdb the same way.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    plugins: [react()],
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
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  }
})
