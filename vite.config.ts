import { defineConfig, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

// Baked in via `define`: a build has nothing to configure at runtime. Fields: src/lib/config.ts.
const konfiguration = () => ({
  exportSize: 800,
  faceShare: 0.6,
  hair: 1.35,
  eyesAboveCentre: 0.1,
})

// Dev server workaround: Vite appends `?import` to ONNX's dynamic import from public/onnx/ and
// answers 500 (the build leaves it alone, ONNX marks it `@vite-ignore`). `optimizeDeps.exclude`
// doesn't help: the query comes from import analysis.
const onnxImDev: Plugin = {
  name: 'blitzpose:onnx-ohne-query',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      if (request.url?.startsWith('/onnx/')) request.url = request.url.split('?')[0]
      next()
    })
  },
}

// Legal pages only in `--mode public` (`npm run deploy`): an intranet build has its own operator.
export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    svelte(),
    onnxImDev,
  ],
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  define: { __CONFIG__: JSON.stringify(konfiguration()) },
  build: {
    rollupOptions: {
      input: ['index.html', ...(mode === 'public' ? ['imprint.html', 'privacy.html'] : [])],
    },
  },
}))
