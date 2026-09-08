// The M1 pixel gate.
//
// The whole point of this lab is that the chrome stack (Tailwind + shadcn +
// Base UI) is provably inert inside tldraw's own canvas. "Provably" means a
// measurement, not an assertion: build the app, serve it, screenshot the
// identical seeded board through two entries that differ only in which CSS
// they import (bare.html: tldraw.css only; index.html: tldraw.css + the
// layers-only app.css), and diff the PNGs pixel-for-pixel. Zero pixels may
// differ. Then, as a mutation check on the gate itself, load the one CSS file
// the whole architecture exists to keep out (tailwindcss/preflight.css) behind
// index.html's `?preflight=1` switch and confirm the diff comes back > 0 — a
// gate that can't fail is not a gate.
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import {
  delay, evaluate, freePort, launchChrome, openCdpPage, waitFor,
} from './cdp_kit.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const outDir = join(repoRoot, 'tests', 'out')
const WIDTH = 1440
const HEIGHT = 960
const RECT_ID = 'shape:probe-rect' // createShapeId('probe-rect'), see src/board/seed.ts
// WHY the local .bin, not `npx vite`: npx wraps the real binary in an extra process
// that does not reliably forward SIGKILL to its child — killing the npx PID left an
// orphaned `vite preview` running (and holding this script's inherited stdout pipe
// open) the first time this ran. Invoking the binary directly means the PID we hold
// is the PID doing the listening, so killing it actually stops it.
const viteBin = join(repoRoot, 'node_modules', '.bin', 'vite')

function run(cmd, args, opts = {}) {
  return new Promise((doneRun, fail) => {
    const child = spawn(cmd, args, { cwd: repoRoot, stdio: 'inherit', ...opts })
    child.on('exit', (code) => (code === 0 ? doneRun() : fail(new Error(`${cmd} ${args.join(' ')} exited ${code}`))))
    child.on('error', fail)
  })
}

async function waitForServer(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`server never came up at ${url}`)
    await delay(150)
  }
}

function decodePng(buffer) {
  return PNG.sync.read(buffer)
}

/** pixelmatch diff, threshold 0 (byte-exact) — returns { changed, diffPng }. */
function diffPngs(aPng, bPng) {
  const { width, height } = aPng
  if (width !== bPng.width || height !== bPng.height) {
    throw new Error(`size mismatch: ${width}x${height} vs ${bPng.width}x${bPng.height}`)
  }
  const diff = new PNG({ width, height })
  const changed = pixelmatch(aPng.data, bPng.data, diff.data, width, height, { threshold: 0 })
  return { changed, diffPng: diff }
}

async function captureVariant(cdpPort, previewPort, { label, path, withPanel }) {
  const page = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
  const shots = {}
  try {
    await page.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/${path}` })
    await waitFor(page, 'window.__lab && window.__lab.ready === true', `${label} ready`, 20000)
    await delay(800) // let webfonts / layout settle

    const board = await page.send('Page.captureScreenshot', { format: 'png' })
    shots.board = Buffer.from(board.data, 'base64')
    await writeFile(join(outDir, `${label}-board.png`), shots.board)

    if (withPanel) {
      // WHY `void`: Editor#select returns `this` for chaining, and CDP's
      // `returnByValue: true` (in cdp_kit's evaluate()) tries to serialize
      // whatever the expression evaluates to — the whole circular Editor graph
      // — and fails with "Object reference chain is too long". Nothing here
      // needs the return value, so discard it before it reaches CDP.
      await evaluate(page, `void window.__lab.editor.select('${RECT_ID}')`)
      await delay(300)
      const panel = await page.send('Page.captureScreenshot', { format: 'png' })
      shots.panel = Buffer.from(panel.data, 'base64')
      await writeFile(join(outDir, `${label}-panel.png`), shots.panel)
    }
  } finally {
    page.close()
  }
  return shots
}

async function captureAll(previewPort, offline) {
  const session = await launchChrome({ label: 'stock-pixels', width: WIDTH, height: HEIGHT, offline })
  try {
    const cdpPort = await session.devToolsPort()
    const bare = await captureVariant(cdpPort, previewPort, { label: 'bare', path: 'bare.html?seed=stock', withPanel: true })
    const index = await captureVariant(cdpPort, previewPort, { label: 'index', path: 'index.html?seed=stock', withPanel: true })
    const preflight = await captureVariant(cdpPort, previewPort, {
      label: 'preflight', path: 'index.html?seed=stock&preflight=1', withPanel: false,
    })
    return { bare, index, preflight }
  } finally {
    session.kill()
  }
}

async function main() {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  console.log('[stock_pixels] building...')
  await run(viteBin, ['build'])

  const previewPort = await freePort()
  console.log(`[stock_pixels] serving dist/ on ${previewPort}...`)
  // WHY not stdio:'inherit': if this script's own output is ever piped (`| tail`,
  // a CI log capture), a child that inherits the write end keeps that pipe open
  // after this process exits, and the reader hangs waiting for EOF forever — bit
  // us once building this gate. 'ignore' means nothing to inherit.
  const preview = spawn(
    viteBin,
    ['preview', '--port', String(previewPort), '--strictPort'],
    { cwd: repoRoot, stdio: 'ignore' },
  )
  const killPreview = () => preview.kill('SIGKILL')

  const failures = []
  const rows = []
  try {
    await waitForServer(`http://127.0.0.1:${previewPort}/index.html`)

    let offline = true
    let shots
    try {
      shots = await captureAll(previewPort, true)
    } catch (err) {
      console.warn(`[stock_pixels] offline capture failed (${err.message}); retrying with network access — say so in the handoff`)
      offline = false
      shots = await captureAll(previewPort, false)
    }
    console.log(`[stock_pixels] captured with offline=${offline}`)

    for (const what of ['board', 'panel']) {
      const barePng = decodePng(shots.bare[what])
      const indexPng = decodePng(shots.index[what])
      const { changed, diffPng } = diffPngs(barePng, indexPng)
      await writeFile(join(outDir, `diff-bare-vs-index-${what}.png`), PNG.sync.write(diffPng))
      rows.push({ pair: `bare vs index (${what})`, changed, expectation: '0', pass: changed === 0 })
      if (changed !== 0) failures.push(`bare vs index ${what}: expected 0 changed px, got ${changed}`)
    }

    {
      const barePng = decodePng(shots.bare.board)
      const preflightPng = decodePng(shots.preflight.board)
      const { changed, diffPng } = diffPngs(barePng, preflightPng)
      await writeFile(join(outDir, 'diff-bare-vs-preflight-board.png'), PNG.sync.write(diffPng))
      rows.push({ pair: 'bare vs index+preflight (board, mutation check)', changed, expectation: '> 0', pass: changed > 0 })
      if (!(changed > 0)) failures.push(`mutation check: expected > 0 changed px between bare and preflight, got ${changed}`)
    }
  } finally {
    killPreview()
  }

  console.log('')
  console.table(rows.map((r) => ({ pair: r.pair, 'changed px': r.changed, expected: r.expectation, pass: r.pass ? 'PASS' : 'FAIL' })))
  console.log(`\nPNGs written to ${outDir}`)

  if (failures.length > 0) {
    console.error('\n[stock_pixels] FAILED:')
    for (const f of failures) console.error(`  - ${f}`)
    process.exitCode = 1
  } else {
    console.log('\n[stock_pixels] all checks passed')
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
