import { defineConfig } from 'vite'

// Bundles server/lambda.ts and its dependencies into one ESM file for the Lambda (Node 22).
export default defineConfig({
  build: {
    ssr: 'server/lambda.ts',
    outDir: 'dist-lambda',
    target: 'node22',
    minify: false,
    rollupOptions: { output: { format: 'esm', entryFileNames: 'index.mjs', chunkFileNames: '[name]-[hash].mjs' } },
  },
  ssr: { noExternal: true },
})
