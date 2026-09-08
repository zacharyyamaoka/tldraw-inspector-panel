// The M1 pixel gate, extended in M2 for the Inspector dock.
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
//
// WHY the M2 mask, and why it does not weaken the gate: index.html now mounts
// the Figma-shaped `Inspector` in place of tldraw's `DefaultStylePanel` — by
// design (src/board/mount.tsx, `components={{ StylePanel: Inspector }}`), so
// the two entries differ INSIDE that one rectangle on purpose. The dock is an
// overlay `position:absolute` INSIDE `.tl-container` rather than a layout
// sibling specifically so this is possible: it never changes the canvas's own
// viewport width, so the camera bare.html and index.html each compute is
// identical, and the only pixels a real regression could touch outside the
// dock are still compared byte-for-byte at threshold 0. The mask is read from
// the DOM on every capture (`[data-testid="inspector"]` on the chrome route,
// `.tlui-style-panel__wrapper` on bare's own panel once a shape is selected)
// rather than hard-coded, so a future dock resize cannot silently widen the
// unchecked area without the gate's own printed "masked area" changing too.
//
// WHY the M4 mask: index.html's `components.SharePanel` is now
// `StockCheckButton` (src/App.tsx) — a real control bare.html never mounts,
// since bare passes no `components` at all (src/board/mount.tsx's WHY). Same
// shape as the Inspector dock: differs on purpose, inside a DOM-read
// rectangle, not a second gate.
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import {
  delay, elementBox, evaluate, freePort, launchChrome, openCdpPage, waitFor,
} from './cdp_kit.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
// WHY its own subdirectory of tests/out, not tests/out itself: every journey
// used to share one directory and clear all of it on every run, so this
// gate's own `rm(outDir, {recursive:true})` deleted another journey's
// captures (tests/inspector_smoke.mjs's) the moment either ran after the
// other. Each journey now owns exactly one subdirectory and clears only
// that one — see the README's testing section for the convention.
const outDir = join(repoRoot, 'tests', 'out', 'stock_pixels')
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

/** Zero one rectangular region (RGBA -> opaque black) in place, clipped to the
 *  image bounds. Used on BOTH images of a pair so whatever either one painted
 *  there — a real dock, nothing at all — reads as identical to pixelmatch. */
function maskRegion(png, rect) {
  const x0 = Math.max(0, Math.floor(rect.x))
  const y0 = Math.max(0, Math.floor(rect.y))
  const x1 = Math.min(png.width, Math.ceil(rect.x + rect.width))
  const y1 = Math.min(png.height, Math.ceil(rect.y + rect.height))
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (png.width * y + x) << 2
      png.data[i] = 0
      png.data[i + 1] = 0
      png.data[i + 2] = 0
      png.data[i + 3] = 255
    }
  }
}

/** pixelmatch diff, threshold 0 (byte-exact) outside `masks` — returns
 *  { changed, diffPng, maskedArea }. `masks` is a list of DOM rects (CSS px,
 *  device-scale-factor 1 so they line up with screenshot pixels 1:1). */
function diffPngs(aPng, bPng, masks = []) {
  const { width, height } = aPng
  if (width !== bPng.width || height !== bPng.height) {
    throw new Error(`size mismatch: ${width}x${height} vs ${bPng.width}x${bPng.height}`)
  }
  let maskedArea = 0
  for (const rect of masks) {
    maskRegion(aPng, rect)
    maskRegion(bPng, rect)
    maskedArea += Math.round(rect.width) * Math.round(rect.height)
  }
  const diff = new PNG({ width, height })
  const changed = pixelmatch(aPng.data, bPng.data, diff.data, width, height, { threshold: 0 })
  return { changed, diffPng: diff, maskedArea }
}

/** The rects a capture might carry: the chrome route's Inspector overlay
 *  (`inspector`, always present on index.html), bare's own stock style panel
 *  (`stylePanel`, present only once a shape with styles is selected), and
 *  M4's "Stock check" button (`stockCheckButton`, present on index.html's
 *  SharePanel slot, absent on bare.html — see src/App.tsx's WHY for why that
 *  slot is index-only). Each is absent — not zero-sized — where its route
 *  never draws it; `elementBox` throwing on a missing selector is what tells
 *  them apart. */
async function readDockRects(page) {
  const rects = {}
  try { rects.inspector = await elementBox(page, '[data-testid="inspector"]') } catch { /* not this route */ }
  try { rects.stylePanel = await elementBox(page, '.tlui-style-panel__wrapper') } catch { /* nothing selected, or not bare */ }
  try { rects.stockCheckButton = await elementBox(page, '[data-testid="stock-check-button"]') } catch { /* bare.html never mounts it */ }
  return rects
}

async function captureVariant(cdpPort, previewPort, { label, path, withPanel }) {
  const page = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
  const shots = {}
  const rects = {}
  try {
    await page.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/${path}` })
    await waitFor(page, 'window.__lab && window.__lab.ready === true', `${label} ready`, 20000)
    await delay(800) // let webfonts / layout settle

    const board = await page.send('Page.captureScreenshot', { format: 'png' })
    shots.board = Buffer.from(board.data, 'base64')
    await writeFile(join(outDir, `${label}-board.png`), shots.board)
    rects.board = await readDockRects(page)

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
      rects.panel = await readDockRects(page)
    }
  } finally {
    page.close()
  }
  return { shots, rects }
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

/** The rects to zero for one comparison: the chrome route's dock (always, it
 *  never disappears — see Inspector.tsx) and its Stock check button (always,
 *  same reason) plus bare's own stock panel where that capture has one (only
 *  the `panel` state; `board` has nothing selected so bare draws no panel at
 *  all, and there is nothing there to mask). */
function masksFor(bareVariant, indexVariant, what) {
  const rects = []
  const fromIndex = indexVariant.rects[what] ?? {}
  const fromBare = bareVariant.rects[what] ?? {}
  if (fromIndex.inspector) rects.push(fromIndex.inspector)
  if (fromIndex.stockCheckButton) rects.push(fromIndex.stockCheckButton)
  if (fromBare.stylePanel) rects.push(fromBare.stylePanel)
  return rects
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
      const barePng = decodePng(shots.bare.shots[what])
      const indexPng = decodePng(shots.index.shots[what])
      const masks = masksFor(shots.bare, shots.index, what)
      const { changed, diffPng, maskedArea } = diffPngs(barePng, indexPng, masks)
      await writeFile(join(outDir, `diff-bare-vs-index-${what}.png`), PNG.sync.write(diffPng))
      rows.push({
        pair: `bare vs index (${what})`, changed, expectation: '0', pass: changed === 0,
        'masked px': maskedArea,
      })
      if (changed !== 0) failures.push(`bare vs index ${what}: expected 0 changed px outside the dock (masked ${maskedArea}px), got ${changed}`)
    }

    {
      const barePng = decodePng(shots.bare.shots.board)
      const preflightPng = decodePng(shots.preflight.shots.board)
      // WHY the same mask applies here: index.html (and its ?preflight=1
      // variant) both always mount the Inspector, so this pair carries the
      // identical dock-shaped difference the two checks above already accept.
      // The mutation this check exists to catch — tailwindcss/preflight.css's
      // global reset — reaches the canvas itself (fonts, spacing), which sits
      // entirely outside the masked column, so masking here does not risk
      // swallowing the one difference this check must still find.
      const masks = masksFor(shots.bare, shots.preflight, 'board')
      const { changed, diffPng, maskedArea } = diffPngs(barePng, preflightPng, masks)
      await writeFile(join(outDir, 'diff-bare-vs-preflight-board.png'), PNG.sync.write(diffPng))
      rows.push({
        pair: 'bare vs index+preflight (board, mutation check)', changed, expectation: '> 0', pass: changed > 0,
        'masked px': maskedArea,
      })
      if (!(changed > 0)) failures.push(`mutation check: expected > 0 changed px between bare and preflight outside the dock (masked ${maskedArea}px), got ${changed}`)
    }
  } finally {
    killPreview()
  }

  console.log('')
  console.table(rows.map((r) => ({
    pair: r.pair, 'changed px': r.changed, 'masked px': r['masked px'] ?? 0, expected: r.expectation, pass: r.pass ? 'PASS' : 'FAIL',
  })))
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
