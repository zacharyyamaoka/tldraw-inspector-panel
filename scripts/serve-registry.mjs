#!/usr/bin/env node
/**
 * Plain static server for public/r/ — the built registry — on a fixed port,
 * for a consumer to `npx shadcn add http://127.0.0.1:<port>/r/<item>.json`
 * against when `npm run dev` (which already serves public/ at :5180) is not
 * running. `npm run dev` and this script serve the identical directory;
 * this one exists only for the case where nobody wants a dev server up.
 *
 * WHY plain http.server semantics and not another vite instance: the
 * registry is static JSON, generated once by `npm run registry:build` — a
 * second bundler process to serve files that never change is pure overhead.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public')
const PORT = Number(process.env.SYSTEMSKETCH_REGISTRY_PORT ?? 5182)
const HOST = '127.0.0.1'

const MIME = { '.json': 'application/json', '.css': 'text/css', '.js': 'text/javascript' }

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]))
  const filePath = join(ROOT, path)
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden')
    return
  }
  try {
    const s = await stat(filePath)
    if (!s.isFile()) throw new Error('not a file')
    const body = await readFile(filePath)
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
})

// WHY exit loudly on a taken port rather than drifting to the next free one:
// same --strictPort convention as vite.config.ts's dev server (5180) — a
// silent port drift here would mean a consumer's `shadcn add` command quietly
// points at nothing.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`port ${PORT} is already in use — set SYSTEMSKETCH_REGISTRY_PORT to override`)
    process.exit(1)
  }
  throw err
})

server.listen(PORT, HOST, () => {
  console.log(`registry served: http://${HOST}:${PORT}/r/tldraw-inspector.json`)
})
