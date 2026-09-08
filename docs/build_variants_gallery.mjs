// Builds reports/inspector-variants-2026-09-07.html — the visual comparison
// for the three inspector variants (docs/log.md's own entry has the prose;
// this is the media). Screenshots come from the REAL built app, driven in
// headless Chrome via the same tests/cdp_kit.mjs the journeys use — never a
// hand-styled mock — per the repo's own "run it, don't describe it" rule.
//
// WHY relative media, not inlined data URIs: this repo's own .gitignore
// already splits `reports/` (tracked) from `reports/media/` (not) — the
// convention this script follows, not the systemsketch repo's (different
// project, different size ceiling that doesn't apply here).
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  delay, drag, elementBox, evaluate, freePort, launchChrome, openCdpPage, waitFor,
} from '../tests/cdp_kit.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const mediaDir = join(repoRoot, 'reports', 'media', 'inspector-variants')
const reportPath = join(repoRoot, 'reports', 'inspector-variants-2026-09-07.html')
const WIDTH = 1440
const HEIGHT = 960
const RECT_ID = 'shape:probe-rect'
const NOTE_ID = 'shape:probe-note'
const viteBin = join(repoRoot, 'node_modules', '.bin', 'vite')

const VARIANTS = [
  { id: 1, name: 'Verbatim', tagline: "Open-pencil's own palette and geometry, ported literally — captions above fields, text segments for fill/dash/size/font, icon segments for align." },
  { id: 2, name: 'Canvas-native', tagline: "tldraw's own palette (--tl-color-* tokens) and icon set, identical geometry to Verbatim — the panel reads like tldraw drew it." },
  { id: 3, name: 'Inline', tagline: 'Letter-prefixed fields (X/Y/W/H/°/%), Selects for wide enums (font, fill, dash) — the densest of the three.' },
]

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
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`server never came up at ${url}`)
    await delay(150)
  }
}

async function selectShape(page, id) {
  await evaluate(page, `void window.__lab.editor.select('${id}')`)
  await delay(200)
}

async function setColorMode(page, mode) {
  await evaluate(page, `window.__lab.editor.user.updateUserPreferences({ colorScheme: '${mode}' })`)
  await delay(200)
}

/** Grows the viewport to the dock's full scrollable height, shoots its own
 *  rect, restores the normal viewport — same technique as
 *  tests/inspector_smoke.mjs's captureFullDock, duplicated rather than
 *  imported: that file's version is scoped to its own outDir/paths. */
async function captureDock(page, path) {
  const dims = await evaluate(page, `JSON.stringify((() => {
    const header = document.querySelector('[data-testid="inspector-panel"] header, [data-testid="theme-panel"] header')
    const viewport = document.querySelector('[data-testid="inspector"] [data-slot="scroll-area-viewport"]')
    return { header: header ? header.offsetHeight : 0, content: viewport ? viewport.scrollHeight : 600 }
  })())`).then(JSON.parse)
  const tallHeight = Math.min(2400, Math.ceil(dims.header + dims.content) + 24)
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: tallHeight, deviceScaleFactor: 1, mobile: false })
  await delay(150)
  const box = await elementBox(page, '[data-testid="inspector"]')
  const shot = await page.send('Page.captureScreenshot', {
    format: 'png', clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 },
  })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false })
  await delay(120)
}

/** A synthetic cursor dot painted into the DOM before the shot — headless
 *  `Page.captureScreenshot` renders the page only, never the OS pointer, so
 *  this is the honest way to show "where the drag is" in a still image. */
async function withCursorMarker(page, x, y, fn) {
  await evaluate(page, `(() => {
    const dot = document.createElement('div')
    dot.id = '__gallery_cursor__'
    dot.style.cssText = 'position:fixed;left:${x - 7}px;top:${y - 7}px;width:14px;height:14px;border-radius:50%;background:rgba(37,99,235,0.35);border:2px solid #2563eb;pointer-events:none;z-index:99999'
    document.body.appendChild(dot)
  })()`)
  await fn()
  await evaluate(page, `document.getElementById('__gallery_cursor__')?.remove()`)
}

async function captureRegion(page, selector, path, pad = 12) {
  const box = await elementBox(page, selector)
  const shot = await page.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2, scale: 1 },
  })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

async function setWidth(page, target) {
  const handle = await elementBox(page, '[data-testid="inspector-resize-handle"]')
  const current = Number(await evaluate(page, `document.querySelector('[data-testid="inspector"]').getBoundingClientRect().width`))
  // ResizeHandle's own formula (kit.tsx): next = startWidth - dragDx, dragDx
  // = toX - fromX. Solving for the toX that lands exactly on `target`.
  const dragDx = current - target
  if (Math.abs(dragDx) < 1) return
  await drag(page, { x: handle.cx, y: handle.cy }, { x: handle.cx + dragDx, y: handle.cy })
  await delay(150)
  const after = Number(await evaluate(page, `document.querySelector('[data-testid="inspector"]').getBoundingClientRect().width`))
  if (Math.abs(after - target) > 4) throw new Error(`setWidth(${target}) landed at ${after}`)
}

async function main() {
  await mkdir(mediaDir, { recursive: true })

  console.log('[variants gallery] building...')
  await run(viteBin, ['build'])

  const previewPort = await freePort()
  const preview = spawn(viteBin, ['preview', '--port', String(previewPort), '--strictPort'], { cwd: repoRoot, stdio: 'ignore' })
  const killPreview = () => preview.kill('SIGKILL')

  const shots = {} // variant -> { key: relative path }

  try {
    await waitForServer(`http://127.0.0.1:${previewPort}/index.html`)
    const session = await launchChrome({ label: 'variants-gallery', width: WIDTH, height: HEIGHT, offline: true })
    try {
      const cdpPort = await session.devToolsPort()

      for (const { id: variant } of VARIANTS) {
        shots[variant] = {}
        const page = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
        await page.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock&frames=colors&variant=${variant}` })
        await waitFor(page, 'window.__lab && window.__lab.ready === true', `variant ${variant} ready`, 20000)
        await delay(400)

        // light/rect @280, light/note @280
        await selectShape(page, RECT_ID)
        await captureDock(page, join(mediaDir, `v${variant}-light-rect-280.png`))
        shots[variant].lightRect280 = `v${variant}-light-rect-280.png`
        await selectShape(page, NOTE_ID)
        await captureDock(page, join(mediaDir, `v${variant}-light-note-280.png`))
        shots[variant].lightNote280 = `v${variant}-light-note-280.png`

        // dark/rect @280, dark/note @280
        await setColorMode(page, 'dark')
        await selectShape(page, RECT_ID)
        await captureDock(page, join(mediaDir, `v${variant}-dark-rect-280.png`))
        shots[variant].darkRect280 = `v${variant}-dark-rect-280.png`
        await selectShape(page, NOTE_ID)
        await captureDock(page, join(mediaDir, `v${variant}-dark-note-280.png`))
        shots[variant].darkNote280 = `v${variant}-dark-note-280.png`
        await setColorMode(page, 'light')

        // width comparison: rect + note @240
        await setWidth(page, 240)
        await selectShape(page, RECT_ID)
        await captureDock(page, join(mediaDir, `v${variant}-light-rect-240.png`))
        shots[variant].lightRect240 = `v${variant}-light-rect-240.png`
        await selectShape(page, NOTE_ID)
        await captureDock(page, join(mediaDir, `v${variant}-light-note-240.png`))
        shots[variant].lightNote240 = `v${variant}-light-note-240.png`
        await setWidth(page, 280)

        // close-up: drag the middle of the W field, cursor marker mid-gesture
        await selectShape(page, RECT_ID)
        await delay(150)
        {
          await evaluate(page, `document.querySelector('[data-testid="inspector-field-w"]').scrollIntoView({block:'center'})`)
          await delay(100)
          const fresh = await elementBox(page, '[data-testid="inspector-field-w"]')
          await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fresh.cx, y: fresh.cy })
          await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fresh.cx, y: fresh.cy, button: 'left', buttons: 1 })
          await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fresh.cx + 45, y: fresh.cy, buttons: 1 })
          await delay(80)
          await withCursorMarker(page, fresh.cx + 45, fresh.cy, async () => {
            await captureRegion(page, '[data-testid="inspector-field-w"]', join(mediaDir, `v${variant}-scrub-closeup.png`), 20)
          })
          await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fresh.cx + 45, y: fresh.cy, button: 'left' })
          await delay(150)
          await evaluate(page, 'void window.__lab.editor.undo()')
          shots[variant].scrubCloseup = `v${variant}-scrub-closeup.png`
        }

        // close-up: the segmented control (align, present + a real segmented
        // row in every variant regardless of the Select-collapse threshold).
        // WHY scrollIntoView first: getBoundingClientRect ignores the
        // ScrollArea ancestor's own clipping, so an off-screen-but-scrolled-
        // past row still reports a "real" rect — Page.captureScreenshot then
        // clips to whatever IS actually painted there (nothing), producing a
        // blank image with no error. Measured, not assumed.
        await evaluate(page, `document.querySelector('[data-testid^="inspector-segment-align-"]')?.scrollIntoView({ block: 'center' })`)
        await delay(100)
        await captureRegion(page, '[data-testid^="inspector-segment-align-"]', join(mediaDir, `v${variant}-segment-closeup.png`), 16)
        shots[variant].segmentCloseup = `v${variant}-segment-closeup.png`

        page.close()
      }
    } finally {
      session.kill()
    }
  } finally {
    killPreview()
  }

  // Baseline (rejected panel): captured once, out-of-band, from the
  // pre-variants commit (06bf557) — see docs/log.md. Copied in by hand
  // rather than re-derived on every gallery build, since that commit is not
  // this build's own tree.
  const baselineSrc = '/tmp/gallery-media/baseline-rejected-panel.png'
  const baselineDest = join(mediaDir, 'baseline-rejected-panel.png')
  await writeFile(baselineDest, await readFile(baselineSrc))

  const html = buildHtml(shots)
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, html)
  console.log(`[variants gallery] wrote ${reportPath}`)
}

function img(rel, alt) {
  // WHY no `loading="lazy"`: a headless full-page capture (or a print) never
  // scrolls, so a lazy image below the fold never triggers its own load at
  // all — round-2 audit: "only the first four V1 tiles loaded." Every image
  // here is already local and small; eager loading costs nothing real.
  return `<img src="media/inspector-variants/${rel}" alt="${alt}">`
}

function variantSection(v, shots) {
  return `
  <section class="variant">
    <h2>V${v.id} — ${v.name}</h2>
    <p class="tagline">${v.tagline}</p>
    <div class="row">
      <figure>${img(shots.lightRect280, `V${v.id} light, rectangle, 280px`)}<figcaption>light · rectangle · 280px</figcaption></figure>
      <figure>${img(shots.lightNote280, `V${v.id} light, note, 280px`)}<figcaption>light · note · 280px</figcaption></figure>
      <figure>${img(shots.darkRect280, `V${v.id} dark, rectangle, 280px`)}<figcaption>dark · rectangle · 280px</figcaption></figure>
      <figure>${img(shots.darkNote280, `V${v.id} dark, note, 280px`)}<figcaption>dark · note · 280px</figcaption></figure>
    </div>
    <div class="row">
      <figure>${img(shots.lightRect240, `V${v.id} light, rectangle, 240px`)}<figcaption>light · rectangle · 240px (floor width)</figcaption></figure>
      <figure>${img(shots.lightNote240, `V${v.id} light, note, 240px`)}<figcaption>light · note · 240px (floor width)</figcaption></figure>
      <figure class="closeup">${img(shots.scrubCloseup, `V${v.id} scrub close-up`)}<figcaption>whole-field scrub — dragging the MIDDLE of W (synthetic cursor marker; headless capture has no OS pointer)</figcaption></figure>
      <figure class="closeup">${img(shots.segmentCloseup, `V${v.id} segmented control close-up`)}<figcaption>the segmented control (Align) — the "large buttons" this replaces</figcaption></figure>
    </div>
  </section>`
}

function buildHtml(shots) {
  const sections = VARIANTS.map((v) => variantSection(v, shots[v.id])).join('\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Inspector variants — Verbatim, Canvas-native, Inline</title>
<style>
  :root { color-scheme: light dark; --bg:#f7f7f8; --fg:#1f2328; --muted:#6b7280; --card:#fff; --border:#e2e4e8; }
  @media (prefers-color-scheme: dark) { :root { --bg:#17181a; --fg:#f0f0f0; --muted:#9aa0a6; --card:#202124; --border:#33353a; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font: 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
  header { padding: 32px 24px 8px; max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .lede { color: var(--muted); max-width: 760px; }
  main { max-width: 1100px; margin: 0 auto; padding: 8px 24px 64px; }
  section.variant { margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--border); }
  h2 { font-size: 18px; margin: 0 0 4px; }
  .tagline { color: var(--muted); margin: 0 0 16px; }
  .row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
  figure { margin: 0; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
  figure img { width: 100%; display: block; border-radius: 4px; background: #fff; }
  figure.closeup img { background: transparent; }
  figcaption { font-size: 11px; color: var(--muted); margin-top: 6px; text-align: center; }
  .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
  .compare figure img { max-height: 480px; object-fit: contain; }
  .deviations { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; margin-top: 32px; }
  .deviations h2 { margin-top: 0; }
  .deviations li { margin-bottom: 8px; }
  code { background: rgba(127,127,127,0.15); padding: 1px 5px; border-radius: 4px; }
</style>
</head>
<body>
<header>
  <h1>Inspector variants — three visual directions</h1>
  <p class="lede">Zach rejected the shipped panel outright ("don't like these large buttons — more closely match the open pencil UX/UI"). These three variants share one skeleton (<code>src/inspector/variants/kit.tsx</code>) and two mandatory behaviours (drag-to-resize, whole-field scrub) and differ on theme + a few layout decisions. Full rationale and every deviation from the measured open-pencil reference: <code>docs/log.md</code>'s "Three inspector variants" entry. Screenshots below are from the real built app, driven headlessly — never a mock.</p>
</header>
<main>
  <section class="deviations">
    <h2>What changed vs. the rejected panel</h2>
    <div class="compare">
      <figure><img src="media/inspector-variants/baseline-rejected-panel.png" alt="the panel before this branch, captured from commit 06bf557"><figcaption>Before (commit 06bf557) — shadcn ToggleGroup buttons, swatch+popover colour rows, fixed 280px, glyph-only scrub</figcaption></figure>
      <figure><img src="media/inspector-variants/v1-light-rect-280.png" alt="V1 Verbatim, light, rectangle"><figcaption>After — V1 "Verbatim": 22px segmented controls, list-row colours, resizable, whole-field scrub</figcaption></figure>
    </div>
  </section>
${sections}
  <section class="deviations">
    <h2>Deliberately not built (this pass)</h2>
    <ul>
      <li>A <code>+</code>/"add a fill" affordance open-pencil's own screenshots show — this app's fill/stroke are always-present StyleProps, never addable/removable, so the control would govern nothing real.</li>
      <li>Per-row "eye" visibility toggles — no model-side "hide this style" concept exists to wire one to.</li>
      <li><code>ThemePanel.tsx</code>'s own controls (the light/dark ToggleGroup, colour-section headers) rebuilt onto <code>kit.tsx</code>'s <code>SegmentedControl</code>/<code>Section</code> — its palette already re-themes automatically (same token cascade), the controls themselves were lower priority than the Inspect tab Zach actually named.</li>
      <li>The full shape × width × mode cross-product in this gallery — dark mode is shown at 280px only, not also at 240px, to keep the gallery to a legible size; the 240px no-clip guarantee itself is proven for every combination by <code>tests/inspector_smoke.mjs</code>, not by this gallery.</li>
    </ul>
  </section>
</main>
</body>
</html>`
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
