import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // WHY: matches the paths-only `@/*` alias in tsconfig.app.json (no baseUrl —
    // see the WHY there). shadcn's CLI requires this exact alias shape to exist
    // before `init` will proceed ("Validating import alias").
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // WHY a fixed, strict port: this lab shares the box with SystemSketch's
    // 4321-4323 and its review-runtime pool 4600-4898; 5180 is this repo's own
    // reserved slot, and --strictPort-equivalent (server.strictPort) makes a
    // collision fail loudly instead of silently drifting to the next free port.
    port: 5180,
    strictPort: true,
  },
  optimizeDeps: {
    // WHY: `npm run dev`'s dependency-prebundle scan cannot resolve the `?url`
    // imports inside @tldraw/assets/imports.vite.js (every `import xJsonUrl from
    // './translations/x.json?url'`) even though the files are on disk — it fails
    // with 53 UNLOADABLE_DEPENDENCY errors and crashes the dev server outright.
    // `vite build` (the pixel gate's own path) never hits this — the production
    // bundler resolves the same imports fine. Excluding the package from
    // pre-bundling is tldraw's own documented workaround for self-hosted assets.
    exclude: ['@tldraw/assets'],
  },
  build: {
    rollupOptions: {
      // WHY a second HTML entry: the pixel gate (tests/stock_pixels.mjs) needs a
      // built, servable page that mounts the identical board with only tldraw's
      // own CSS — see the WHY at the top of src/bare.tsx.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        bare: fileURLToPath(new URL('./bare.html', import.meta.url)),
      },
    },
  },
})
