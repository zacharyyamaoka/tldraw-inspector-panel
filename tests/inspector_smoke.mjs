// The M2 journey: the Figma-shaped Inspector, driven in a real headless
// browser against the built app — never the panel's own DOM alone. Every
// assertion below reads either the editor's own record
// (`window.__lab.editor.getShape(id)`) or the painted canvas (an SVG
// attribute tldraw itself renders from), the same rule `tests/stock_pixels.mjs`
// already holds the app to.
//
// Ported from SystemSketch (77907974)'s `tests/primitive_inspector_smoke.mjs`
// and `tests/primitive_inspector_stock_route_smoke.mjs`, folded into one file
// against this repo's own board/routes: `index.html?seed=stock` (the chrome
// route, paint seam installed) and `stock.html?seed=stock` (the stock route —
// the Inspector on an otherwise-stock canvas, proving every `paint` row
// withholds itself). Any donor case that needed a SystemSketch-only import
// (Block scenes, the slanted arrow, the stock-compatibility exporter) has no
// analogue here and is not ported — see docs/log.md's M2 entry for the list.
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  clickElement, delay, drag, elementBox, evaluate, freePort, key, launchChrome,
  makeChecklist, openCdpPage, shortcut, typeSlowly, waitFor,
} from './cdp_kit.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
// WHY its own subdirectory of tests/out, not tests/out itself: see the WHY at
// the top of tests/stock_pixels.mjs's own `outDir` — the two journeys used to
// share one directory and delete each other's captures.
const outDir = join(repoRoot, 'tests', 'out', 'inspector_smoke')
const WIDTH = 1440
const HEIGHT = 960
const RECT_ID = 'shape:probe-rect'
const ELLIPSE_ID = 'shape:probe-ellipse'
const FRAME_ID = 'shape:probe-frame'
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
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`server never came up at ${url}`)
    await delay(150)
  }
}

/** Bring a row into view before touching it — the panel scrolls, and a
 *  pointer event dispatched at an off-screen coordinate hits nothing. */
async function reveal(page, selector) {
  await evaluate(page, `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'center' })`)
  await delay(80)
  return elementBox(page, selector)
}

/** Focus a text/number input, select everything in it, and type — CDP has no
 *  "clear field" primitive, and typing without selecting appends instead of
 *  replacing. Ctrl+A inside a native input selects its own text, not the page. */
async function replaceFieldText(page, selector, text) {
  await reveal(page, selector)
  await clickElement(page, selector)
  // WHY `shortcut`, not the plain `key` helper: Chromium's native "select all"
  // edit command on a text input is dispatched off the key event's virtual key
  // code, which a bare `Input.dispatchKeyEvent` omits — the same reason
  // `cdp_kit.mjs`'s own app-shortcut helper exists.
  await shortcut(page, 'a', 'KeyA', 2) // Ctrl+A
  await typeSlowly(page, text)
}

async function testIds(page) {
  return evaluate(page, `JSON.stringify([...document.querySelectorAll('[data-testid]')].map((e) => e.dataset.testid))`)
    .then((json) => new Set(JSON.parse(json)))
}

async function getShape(page, id) {
  return JSON.parse(await evaluate(page, `JSON.stringify(window.__lab.editor.getShape('${id}'))`))
}

async function selectShape(page, id) {
  await evaluate(page, `void window.__lab.editor.select('${id}')`)
  await delay(250)
}

/* --------------------------------------------------------------- contrast */
// WCAG 2 relative-luminance contrast, no dependency: the two `rgb(...)`/
// `rgba(...)` strings a real `getComputedStyle` read hands back are the only
// input shape this needs.
function parseRgb(value) {
  const match = /rgba?\(([^)]+)\)/.exec(value)
  if (!match) throw new Error(`not an rgb()/rgba() value: ${value}`)
  return match[1].split(',').slice(0, 3).map((part) => Number.parseFloat(part.trim()))
}
function relativeLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}
function contrastRatio(colorA, colorB) {
  const la = relativeLuminance(parseRgb(colorA))
  const lb = relativeLuminance(parseRgb(colorB))
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la]
  return (lighter + 0.05) / (darker + 0.05)
}

/** Temporarily grows the viewport to fit the dock's entire scrollable
 *  content (every group expanded, nothing clipped by `ScrollArea`), shoots
 *  the dock's own rect, then restores the normal viewport. */
async function captureFullDock(page, path) {
  const dims = await evaluate(page, `JSON.stringify((() => {
    const header = document.querySelector('[data-testid="inspector-panel"] header')
    const viewport = document.querySelector('[data-testid="inspector"] [data-slot="scroll-area-viewport"]')
    return { header: header.offsetHeight, content: viewport.scrollHeight }
  })())`).then(JSON.parse)
  const tallHeight = Math.ceil(dims.header + dims.content) + 24
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: tallHeight, deviceScaleFactor: 1, mobile: false })
  await delay(200)
  const box = await elementBox(page, '[data-testid="inspector"]')
  const shot = await page.send('Page.captureScreenshot', {
    format: 'png', clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 },
  })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false })
  await delay(150)
}

/**
 * The variants brief's four mandatory-behaviour checks, plus the "core
 * subset" it names for re-running under every variant: rows present, scrub
 * W by dragging the MIDDLE of the field (not the glyph), click-without-move
 * puts the caret in the input, resize to 360 survives a reload, and the
 * explicit-ink/no-clip assertions. Run once per variant (1 default, 2, 3)
 * against fresh pages so a failure in one variant's layout (a Select instead
 * of a segmented row, say) can't be masked by state left over from another.
 */
async function runMandatoryBehaviourChecks(cdpPort, previewPort, checklist, variant) {
  const label = `variant ${variant}`
  const page = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
  await page.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock&frames=colors&variant=${variant}` })
  await waitFor(page, 'window.__lab && window.__lab.ready === true', `${label} ready`, 20000)
  await delay(500)
  await selectShape(page, RECT_ID)
  await delay(150)

  const ids = await testIds(page)
  checklist.add(`${label}: rows present (W field, variant picker)`, ids.has('inspector-field-w') && ids.has(`inspector-variant-${variant}`))

  // Mandatory #2: the WHOLE field scrubs, not just its glyph — drag starting
  // at the field's own centre, well clear of the leading glyph/prefix.
  {
    const before = await getShape(page, RECT_ID)
    const box = await reveal(page, '[data-testid="inspector-field-w"]')
    await drag(page, { x: box.cx, y: box.cy }, { x: box.cx + 60, y: box.cy })
    await delay(150)
    const after = await getShape(page, RECT_ID)
    checklist.add(`${label}: dragging the MIDDLE of the W field scrubs it`, after.props.w !== before.props.w)
    await evaluate(page, 'void window.__lab.editor.undo()')
    await delay(150)
  }

  // Same contract's other half: a click that never crosses the 2px
  // threshold is `startEdit()`, not a scrub — the caret lands in the input.
  {
    await evaluate(page, 'document.activeElement && document.activeElement.blur()')
    await delay(80)
    await clickElement(page, '[data-testid="inspector-field-x"]')
    await delay(150)
    const active = await evaluate(page, `document.activeElement && document.activeElement.dataset && document.activeElement.dataset.testid`)
    checklist.add(`${label}: click without drag puts the caret in the input (active: ${active})`, active === 'inspector-number-x')
    await evaluate(page, 'document.activeElement && document.activeElement.blur()')
    await delay(80)
  }

  // Mandatory #3: explicit ink. `align` is the one segmented row every
  // variant keeps as a segmented control (3 options never clears V3's
  // Select threshold), so it is the one cross-variant place to read an
  // UNPRESSED segment's colour.
  const inkReadings = () => evaluate(page, `JSON.stringify((() => {
    const dockEl = document.querySelector('[data-testid="inspector"]')
    function probe(cssVar) {
      const el = document.createElement('span')
      el.style.color = cssVar
      dockEl.appendChild(el)
      const value = getComputedStyle(el).color
      el.remove()
      return value
    }
    const unpressedSegment = document.querySelector('[data-testid^="inspector-segment-align-"][data-state="off"]')
    const swatch = document.querySelector('[data-testid="inspector-swatch-color-black"]')
    const numberInput = document.querySelector('[data-testid="inspector-number-w"]')
    const textInput = document.querySelector('[data-testid="inspector-text-url"]')
    const header = document.querySelector('[data-testid="inspector-group-layer"]')
    return {
      surface: probe('var(--v-surface)'),
      muted: probe('var(--v-muted)'),
      segment: unpressedSegment ? getComputedStyle(unpressedSegment).color : null,
      swatch: swatch ? getComputedStyle(swatch).color : null,
      numberInput: numberInput ? getComputedStyle(numberInput).color : null,
      textInput: textInput ? getComputedStyle(textInput).color : null,
      headerText: header ? getComputedStyle(header).color : null,
      dockBg: getComputedStyle(dockEl).backgroundColor,
    }
  })())`).then(JSON.parse)

  for (const mode of ['light', 'dark']) {
    if (mode === 'dark') {
      await evaluate(page, `window.__lab.editor.user.updateUserPreferences({ colorScheme: 'dark' })`)
      await delay(200)
    }
    const r = await inkReadings()
    // The theme table's own rule (kit.tsx's segmentItemClass): unpressed is
    // muted, everything else drawing text/glyphs is the dock's surface ink.
    checklist.add(`${label} ${mode}: unpressed segment ink equals --v-muted (${r.segment})`, r.segment === r.muted)
    checklist.add(`${label} ${mode}: swatch button ink equals --v-surface`, r.swatch === r.surface)
    checklist.add(`${label} ${mode}: number input ink equals --v-surface`, r.numberInput === r.surface)
    checklist.add(`${label} ${mode}: text input ink equals --v-surface`, r.textInput === r.surface)
    const ratio = contrastRatio(r.headerText, r.dockBg)
    checklist.add(`${label} ${mode}: section header contrast ${ratio.toFixed(2)}:1 (>= 4.5:1)`, ratio >= 4.5)
  }
  await evaluate(page, `window.__lab.editor.user.updateUserPreferences({ colorScheme: 'light' })`)
  await delay(150)

  // Mandatory #4: nothing clips at the 240px floor. Drag the resize handle
  // down to 240 first (default 280 on a fresh, `?seed=`-skipped-persistence
  // load — theme.ts's own WHY) then re-measure every row.
  {
    const handleBox = await elementBox(page, '[data-testid="inspector-resize-handle"]')
    await drag(page, { x: handleBox.cx, y: handleBox.cy }, { x: handleBox.cx + 40, y: handleBox.cy })
    await delay(200)
    const width = await evaluate(page, `document.querySelector('[data-testid="inspector"]').getBoundingClientRect().width`)
    const overflow = await evaluate(page, `JSON.stringify((() => {
      const dock = document.querySelector('[data-testid="inspector"]').getBoundingClientRect()
      const rows = [...document.querySelectorAll('[data-testid^="inspector-segment-"], [data-testid^="inspector-tile-"], [data-testid^="inspector-field-"]')]
      return rows
        .map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.testid, right: r.right } })
        .filter((r) => r.right > dock.right + 0.5)
    })())`).then(JSON.parse)
    checklist.add(
      `${label}: nothing clips at ${Math.round(Number(width))}px width (${overflow.length === 0 ? 'none clipped' : overflow.map((r) => r.id).join(', ')})`,
      overflow.length === 0,
    )
  }
  page.close()

  // Mandatory #1: drag-to-resize, persisted across a reload. Run on a PLAIN
  // (non-seeded) load — theme.ts's `readStoredDockWidth`/`writeStoredDockWidth`
  // are no-ops under `?seed=`, on purpose, the same rule `persistenceKey`
  // already follows (mount.tsx) — so persistence can only be observed here.
  // Safe against "never point a test at Zach's real board": this whole
  // journey runs its own throwaway Chrome profile against a `vite preview`
  // it started itself, never Zach's browser or `npm run dev`.
  {
    const page2 = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
    await page2.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?variant=${variant}` })
    await waitFor(page2, 'window.__lab && window.__lab.ready === true', `${label} resize ready`, 20000)
    await delay(300)
    // WHY clear + reload before dragging: this whole block runs on a
    // non-seeded, persistence-ON route (see the comment above), and this
    // one Chrome profile/session is shared across every variant in the
    // `for (const variant of [1, 2, 3])` loop below — an EARLIER variant's
    // own drag-to-360 would otherwise still be sitting in localStorage,
    // making this variant's drag start from 360 instead of the documented
    // 280 default (measured: variant 2 read 440, exactly 360 + this
    // gesture's own +80).
    await evaluate(page2, `localStorage.removeItem('tldraw_styling_lab.dockWidth')`)
    await page2.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?variant=${variant}` })
    await waitFor(page2, 'window.__lab && window.__lab.ready === true', `${label} resize ready (cleared)`, 20000)
    await delay(300)
    const handleBox = await elementBox(page2, '[data-testid="inspector-resize-handle"]')
    // Left is wider — the dock is right-anchored (kit.tsx's ResizeHandle WHY).
    await drag(page2, { x: handleBox.cx, y: handleBox.cy }, { x: handleBox.cx - 80, y: handleBox.cy })
    await delay(200)
    const widthAfterDrag = Number(await evaluate(page2, `document.querySelector('[data-testid="inspector"]').getBoundingClientRect().width`))
    checklist.add(`${label}: dragging the resize handle widens the dock to ~360px (now ${widthAfterDrag})`, Math.abs(widthAfterDrag - 360) < 4)

    await page2.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?variant=${variant}` })
    await waitFor(page2, 'window.__lab && window.__lab.ready === true', `${label} resize reload ready`, 20000)
    await delay(300)
    const widthAfterReload = Number(await evaluate(page2, `document.querySelector('[data-testid="inspector"]').getBoundingClientRect().width`))
    checklist.add(`${label}: resizing to 360 survives a reload (now ${widthAfterReload})`, Math.abs(widthAfterReload - 360) < 4)
    page2.close()
  }
}

async function main() {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  console.log('[inspector_smoke] building...')
  await run(viteBin, ['build'])

  const previewPort = await freePort()
  const preview = spawn(viteBin, ['preview', '--port', String(previewPort), '--strictPort'], { cwd: repoRoot, stdio: 'ignore' })
  const killPreview = () => preview.kill('SIGKILL')

  const checklist = makeChecklist()
  try {
    await waitForServer(`http://127.0.0.1:${previewPort}/index.html`)
    const session = await launchChrome({ label: 'inspector-smoke', width: WIDTH, height: HEIGHT, offline: true })
    try {
      const cdpPort = await session.devToolsPort()

      /* --------------------------------------------------------- chrome route */
      // WHY `&frames=colors` here: `showColors` is off by default
      // (configuredUtils.ts — see its own WHY, and docs/log.md's "showColors
      // is opt-in" entry) because it is a real paint change from stock, not
      // something a plain load should silently do. This journey's own frame
      // checks below need it on; `tests/compat_smoke.mjs` is what proves the
      // DEFAULT (no switch) stays a zero-diff, pure-record board.
      const page = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
      await page.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock&frames=colors` })
      await waitFor(page, 'window.__lab && window.__lab.ready === true', 'chrome route ready', 20000)
      await delay(500)

      await selectShape(page, RECT_ID)
      const ids = await testIds(page)
      checklist.add(
        'rectangle shows Layer/Shape/Fill/Stroke/Label groups',
        ids.has('inspector-field-x') && ids.has('inspector-tile-geo-rectangle')
          && ids.has('inspector-segment-fill-solid') && ids.has('inspector-color-strokeColor')
          && ids.has('inspector-text-labelFontFamily'),
      )

      // Scrub W: drag the scrub handle, then undo ONCE and confirm a full revert.
      {
        const before = await getShape(page, RECT_ID)
        const box = await reveal(page, '[data-testid="inspector-scrub-w"]')
        await drag(page, { x: box.cx, y: box.cy }, { x: box.cx + 60, y: box.cy })
        await delay(150)
        const dragged = await getShape(page, RECT_ID)
        checklist.add('scrub on W changes props.w', dragged.props.w !== before.props.w)
        // WHY `void`: Editor#undo returns `this` for chaining, and that
        // circular graph fails CDP's `returnByValue` serialization — the same
        // trap `tests/stock_pixels.mjs` documents for `Editor#select`.
        await evaluate(page, 'void window.__lab.editor.undo()')
        await delay(150)
        const undone = await getShape(page, RECT_ID)
        checklist.add('one scrub gesture is one undo step', undone.props.w === before.props.w)
      }

      // Typing +10 into X.
      {
        const before = await getShape(page, RECT_ID)
        await replaceFieldText(page, '[data-testid="inspector-number-x"]', '+10')
        await key(page, 'Enter', 'Enter')
        await delay(150)
        const after = await getShape(page, RECT_ID)
        checklist.add('typing +10 into X adds 10', Math.round(after.x) === Math.round(before.x + 10))
      }

      // Rotate turns the shape about its centre, like the canvas handle — not
      // about its top-left origin (Zach, 2026-09-07).
      {
        const centreOf = async () => JSON.parse(await evaluate(page, `(() => { const b = window.__lab.editor.getShapePageBounds(${JSON.stringify(RECT_ID)}); return JSON.stringify({ x: b.midX, y: b.midY }) })()`))
        const before = await centreOf()
        await replaceFieldText(page, '[data-testid="inspector-number-rotation"]', '45')
        await key(page, 'Enter', 'Enter')
        await delay(200)
        const rotated = await getShape(page, RECT_ID)
        const after = await centreOf()
        checklist.add('typing 45 into Rotate sets 45°', Math.abs((rotated.rotation * 180) / Math.PI - 45) < 0.01)
        checklist.add(`Rotate keeps the shape's centre fixed (moved ${Math.hypot(after.x - before.x, after.y - before.y).toFixed(2)}px)`, Math.hypot(after.x - before.x, after.y - before.y) < 0.5)
        await replaceFieldText(page, '[data-testid="inspector-number-rotation"]', '0')
        await key(page, 'Enter', 'Enter')
        await delay(200)
      }

      // Fill style segment writes the StyleProp.
      {
        await reveal(page, '[data-testid="inspector-segment-fill-pattern"]')
        await clickElement(page, '[data-testid="inspector-segment-fill-pattern"]')
        await delay(150)
        const shape = await getShape(page, RECT_ID)
        checklist.add('Fill style segment writes props.fill', shape.props.fill === 'pattern')
        // put it back to solid so the fill-alpha checks below have a real base
        await clickElement(page, '[data-testid="inspector-segment-fill-solid"]')
        await delay(150)
      }

      // A swatch writes color.
      {
        await reveal(page, '[data-testid="inspector-swatch-color-green"]')
        await clickElement(page, '[data-testid="inspector-swatch-color-green"]')
        await delay(150)
        const shape = await getShape(page, RECT_ID)
        checklist.add('a swatch writes props.color', shape.props.color === 'green')
      }

      // Fill alpha 0.3 changes the painted fill; clearing restores it.
      {
        const fillPath = () => evaluate(page, `document.querySelector('[data-shape-id="${RECT_ID}"] path[fill]')?.getAttribute('fill')`)
        const before = await fillPath()
        await replaceFieldText(page, '[data-testid="inspector-number-fillOpacity"]', '0.3')
        await key(page, 'Enter', 'Enter')
        await delay(200)
        const withAlpha = await fillPath()
        checklist.add('Fill alpha 0.3 changes the painted fill', withAlpha !== before && /color-mix/.test(withAlpha ?? ''))
        await reveal(page, '[data-testid="inspector-clear-fillOpacity"]')
        await clickElement(page, '[data-testid="inspector-clear-fillOpacity"]')
        await delay(200)
        const cleared = await fillPath()
        checklist.add('clearing fillOpacity restores the original fill', cleared === before)
      }

      // Corner radius > 0 switches geo to the rounded rect and back at 0.
      {
        await replaceFieldText(page, '[data-testid="inspector-number-cornerRadius"]', '20')
        await key(page, 'Enter', 'Enter')
        await delay(150)
        const rounded = await getShape(page, RECT_ID)
        checklist.add('corner radius > 0 switches to the rounded geo', rounded.props.geo === 'systemsketch-rounded-rect')
        await replaceFieldText(page, '[data-testid="inspector-number-cornerRadius"]', '0')
        await key(page, 'Enter', 'Enter')
        await delay(150)
        const flat = await getShape(page, RECT_ID)
        checklist.add('corner radius back to 0 switches back to rectangle', flat.props.geo === 'rectangle')
      }

      // §2.2 fence: select A, edit Opacity, click B — A changes, B does not.
      {
        await selectShape(page, RECT_ID)
        await delay(150)
        const bBefore = await getShape(page, ELLIPSE_ID)
        await replaceFieldText(page, '[data-testid="inspector-number-opacity"]', '20')
        // Click straight onto the ellipse shape on canvas — this both blurs the
        // opacity field (committing it) AND moves the selection, which is
        // exactly the race `shapeIds` fencing exists to survive.
        await clickElement(page, `[data-shape-id="${ELLIPSE_ID}"]`)
        await delay(250)
        const aAfter = await getShape(page, RECT_ID)
        const bAfter = await getShape(page, ELLIPSE_ID)
        checklist.add('opacity commits to the shape the row was showing (A), not the live selection', Math.round(aAfter.opacity * 100) === 20)
        checklist.add('the shape fence leaves the other shape untouched (B)', bAfter.opacity === bBefore.opacity)
      }

      // Paint rows exist on the chrome route.
      const idsAfter = await testIds(page)
      checklist.add(
        'paint rows (fillOpacity, exact stroke/fill, corner radius, halo) exist on the chrome route',
        idsAfter.has('inspector-number-fillOpacity') && idsAfter.has('inspector-color-strokeColor')
          && idsAfter.has('inspector-number-cornerRadius') && idsAfter.has('inspector-toggle-textOutline'),
      )

      // Segments/tiles must never clip: every one of them stays inside the
      // dock's own rect, however many options its row holds (Fill style used
      // to cut off at "fill|" with `lined-fill` pushed off-screen entirely).
      {
        const overflow = await evaluate(page, `JSON.stringify((() => {
          const dock = document.querySelector('[data-testid="inspector"]').getBoundingClientRect()
          const rows = [...document.querySelectorAll('[data-testid^="inspector-segment-"], [data-testid^="inspector-tile-"]')]
          return rows
            .map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.testid, left: r.left, right: r.right } })
            .filter((r) => r.right > dock.right + 0.5 || r.left < dock.left - 0.5)
        })())`).then(JSON.parse)
        checklist.add(`every segment/tile stays inside the dock (${overflow.length === 0 ? 'none clipped' : overflow.map((r) => r.id).join(', ')})`, overflow.length === 0)
      }

      // Reads the dock's actual painted background, and separately what
      // `--v-panel` resolves to right now — normalized to the same
      // `rgb(...)` shape by painting it onto a throwaway element, since the
      // custom property can be a raw hex string while `getComputedStyle`
      // always answers in `rgb(...)`.
      //
      // WHY `--v-panel`, not `--tl-color-panel` (this checked before the
      // variants babble): `--tl-color-panel` is only ONE variant's actual
      // panel source now — V2 "Canvas-native" points `--v-panel` straight at
      // it (see app.css's `[data-variant='2']` block), but V1 "Verbatim" and
      // V3 "Inline" point it at open-pencil's own literal hex BY DESIGN — the
      // whole brief for those two variants. `--v-panel` is the one name every
      // variant defines, so probing it is "does the dock paint what its own
      // variant declares", the same invariant this check always meant, one
      // level of indirection later. The probe is appended INSIDE the dock
      // (not `.tl-container`) because `--v-panel` is scoped to
      // `[data-testid="inspector"][data-variant]`, one level more specific
      // than the M1-era bridge this replaces — see app.css's own WHY.
      const dockPaintVsPanelVar = () => evaluate(page, `JSON.stringify((() => {
        const dockEl = document.querySelector('[data-testid="inspector"]')
        const probe = document.createElement('span')
        probe.style.background = 'var(--v-panel)'
        dockEl.appendChild(probe)
        const panel = getComputedStyle(probe).backgroundColor
        probe.remove()
        const dock = getComputedStyle(dockEl).backgroundColor
        return { dock, panel }
      })())`).then(JSON.parse)

      // The Layer section header's own text colour against the dock's actual
      // background — read fresh in whichever theme is live when called.
      const headerContrast = () => evaluate(page, `JSON.stringify((() => {
        const trigger = document.querySelector('[data-testid="inspector-group-layer"]')
        return { text: getComputedStyle(trigger).color, bg: getComputedStyle(document.querySelector('[data-testid="inspector"]')).backgroundColor }
      })())`).then(JSON.parse)

      // One UNPRESSED geometry tile's ink, and the dock's own `--foreground` —
      // both read fresh in whichever theme is live when called. Probed
      // INSIDE the dock, same reason as `dockPaintVsPanelVar` above:
      // `--foreground` is re-pointed at `--v-surface` one level more
      // specific than `.tl-container`'s own bridge, per variant.
      const tileInk = () => evaluate(page, `JSON.stringify((() => {
        const dockEl = document.querySelector('[data-testid="inspector"]')
        const tile = document.querySelector('[data-testid="inspector-tile-geo-ellipse"]')
        const probe = document.createElement('span')
        probe.style.color = 'var(--foreground)'
        dockEl.appendChild(probe)
        const foreground = getComputedStyle(probe).color
        probe.remove()
        return { tile: getComputedStyle(tile).color, foreground }
      })())`).then(JSON.parse)

      // Light-mode: header contrast, tile ink, and its background for the
      // light-vs-dark comparison below.
      const lightValues = await dockPaintVsPanelVar()
      {
        const { text, bg } = await headerContrast()
        const ratio = contrastRatio(text, bg)
        checklist.add(`light mode: section header contrast ${ratio.toFixed(2)}:1 (>= 4.5:1)`, ratio >= 4.5)

        const ink = await tileInk()
        checklist.add('light mode: an unpressed tile\'s ink equals --foreground', ink.tile === ink.foreground)

        await captureFullDock(page, join(outDir, 'inspector-dock-light.png'))
      }

      // Dark mode: the dock's own background follows its variant's `--v-panel`
      // exactly, differs from the light-mode reading above, the header stays
      // readable, and the tile ink follows the theme instead of painting
      // black on dark grey.
      {
        await evaluate(page, `window.__lab.editor.user.updateUserPreferences({ colorScheme: 'dark' })`)
        await delay(200)
        const darkValues = await dockPaintVsPanelVar()
        checklist.add(
          "dark mode: the dock background equals this variant's own --v-panel and differs from light",
          darkValues.dock === darkValues.panel && darkValues.dock !== lightValues.dock,
        )

        const { text, bg } = await headerContrast()
        const ratio = contrastRatio(text, bg)
        checklist.add(`dark mode: section header contrast ${ratio.toFixed(2)}:1 (>= 4.5:1)`, ratio >= 4.5)

        const ink = await tileInk()
        checklist.add('dark mode: an unpressed tile\'s ink equals --foreground', ink.tile === ink.foreground)

        await captureFullDock(page, join(outDir, 'inspector-dock-dark.png'))

        await evaluate(page, `window.__lab.editor.user.updateUserPreferences({ colorScheme: 'light' })`)
        await delay(200)
        const lightAgain = await dockPaintVsPanelVar()
        checklist.add('switching back to light restores the light dock background', lightAgain.dock === lightValues.dock)
      }

      /* --------------------------------------------------------- M3 rows */
      // Frame: colour swatch row exists once showColors is configured, and
      // actually paints the frame body/heading — not just writes a prop.
      {
        await selectShape(page, FRAME_ID)
        await delay(150)
        const ids = await testIds(page)
        checklist.add('a frame offers the Colour swatch row now that showColors is configured', ids.has('inspector-swatch-color-red'))
        const bodyFill = () => evaluate(page, `document.querySelector('[data-shape-id="${FRAME_ID}"] .tl-frame__body')?.getAttribute('fill')`)
        const before = await bodyFill()
        await reveal(page, '[data-testid="inspector-swatch-color-red"]')
        await clickElement(page, '[data-testid="inspector-swatch-color-red"]')
        await delay(150)
        const after = await bodyFill()
        checklist.add('clicking the frame Colour swatch repaints the frame body (not just props.color)', after !== before)
        const shape = await getShape(page, FRAME_ID)
        checklist.add('the frame Colour swatch wrote the stock props.color, no meta override', shape.props.color === 'red')
        // put it back so a later re-run of this journey starts from the seed's own colour
        await clickElement(page, '[data-testid="inspector-swatch-color-black"]')
        await delay(150)
        // WHY blur here: `InspectorPanel` freezes its model reference while
        // focus sits inside the dock AND the selection is about to change
        // (see its own WHY) — built to survive a real user's blur-vs-select
        // race. A `selectShape` call below is `editor.select(...)` run
        // straight from the test script, which changes the LIVE selection
        // but fires no real DOM blur on the swatch button this click just
        // focused, so the panel kept showing the frame's reading through the
        // next `selectShape` until this. A real user's next action (clicking
        // canvas, or a field that blurs on commit) does this for free.
        await evaluate(page, 'document.activeElement && document.activeElement.blur()')
        await delay(80)
      }

      // patternFillFallbackColor only shows up where fill is actually 'pattern'.
      {
        await selectShape(page, RECT_ID) // fill: solid
        await delay(150)
        checklist.add('patternFillFallbackColor is absent on a solid fill', !(await testIds(page)).has('inspector-color-patternFillFallbackColor'))
        await selectShape(page, ELLIPSE_ID) // fill: pattern
        await delay(150)
        checklist.add('patternFillFallbackColor appears once fill is pattern', (await testIds(page)).has('inspector-color-patternFillFallbackColor'))
      }

      // labelEdgeMargin/labelMinWidth: geo-only paint rows, round-trip into meta.
      {
        await selectShape(page, RECT_ID)
        await delay(150)
        await replaceFieldText(page, '[data-testid="inspector-number-labelEdgeMargin"]', '30')
        await key(page, 'Enter', 'Enter')
        await delay(150)
        const shape = await getShape(page, RECT_ID)
        checklist.add('labelEdgeMargin commits into the override bag', shape.meta.systemSketchPrimitiveOverride?.labelEdgeMargin === 30)
        checklist.add('labelMinWidth row exists alongside it', (await testIds(page)).has('inspector-number-labelMinWidth'))
        await reveal(page, '[data-testid="inspector-clear-labelEdgeMargin"]')
        await clickElement(page, '[data-testid="inspector-clear-labelEdgeMargin"]')
        await delay(150)
      }

      // url: an ordinary prop, round-trips on a geo.
      {
        await replaceFieldText(page, '[data-testid="inspector-text-url"]', 'https://example.com')
        await key(page, 'Enter', 'Enter')
        await delay(150)
        const shape = await getShape(page, RECT_ID)
        checklist.add('url round-trips on a geo', shape.props.url === 'https://example.com')
        await replaceFieldText(page, '[data-testid="inspector-text-url"]', '')
        await key(page, 'Enter', 'Enter')
        await delay(150)
      }

      // growY: read-only, disabled, still drawn with tldraw's own number.
      {
        const disabled = await evaluate(page, `document.querySelector('[data-testid="inspector-number-growY"]')?.disabled`)
        checklist.add('growY is drawn as a disabled, read-only field', disabled === true)
      }

      // The census (displayValueCensus.test.ts) counts distinct tldraw
      // DISPLAY-VALUE KEYS reached across 12 shape interfaces; this counts
      // FieldSpec ROWS a live two-shape selection offers (x/y/rotation and
      // every style/prop row included, not just paint). They are different
      // metrics by construction — printed side by side as an FYI, not
      // asserted equal.
      {
        // See the WHY on the earlier blur — the url field above is still
        // focused from its own commit, and a programmatic `select` fires no
        // DOM blur to release the panel's frozen reading.
        await evaluate(page, 'document.activeElement && document.activeElement.blur()')
        await delay(80)
        await evaluate(page, `void window.__lab.editor.select('${RECT_ID}', '${FRAME_ID}')`)
        await delay(150)
        const idsAtOnce = await testIds(page)
        console.log(`[inspector_smoke] rect+frame selection offers ${idsAtOnce.size} testid'd elements (not the same metric as the census's reached/documented/total — see displayValueCensus.test.ts)`)
        checklist.add(
          'a rect+frame selection offers both the frame-only row and the geo-only rows together',
          idsAtOnce.has('inspector-text-frameName') && idsAtOnce.has('inspector-number-labelMinWidth'),
        )
      }

      // The colour popup lands in a Base UI portal appended to <body>, a
      // sibling of the dock rather than a descendant of it — app.css's
      // `[data-slot="popover-content"]` rule is what has to carry the app
      // font there, not the dock's own `font-sans`. Screenshot the whole
      // page (light theme) so the open popup and the dock are both visible,
      // and assert its font isn't the browser's serif fallback.
      {
        await reveal(page, '[data-testid="inspector-color-strokeColor"]')
        await clickElement(page, '[data-testid="inspector-color-strokeColor"]')
        await delay(250)
        const popupFont = await evaluate(page, `getComputedStyle(document.querySelector('[data-slot="popover-content"]'))?.fontFamily`)
        // WHY "Geist", not "not serif": the app's own declared stack ends in
        // the generic `sans-serif`, whose name literally contains "serif" —
        // asserting its ABSENCE would fail on the correct value. The browser's
        // actual fallback (unset `font-family`) is `Times New Roman`, which
        // this positively rules out by requiring the real face name instead.
        checklist.add(`the portaled colour popup uses the app font, not the browser's serif fallback (${popupFont})`, typeof popupFont === 'string' && /Geist/i.test(popupFont))
        const popoverShot = await page.send('Page.captureScreenshot', { format: 'png' })
        await writeFile(join(outDir, 'inspector-color-popover-open.png'), Buffer.from(popoverShot.data, 'base64'))
        await key(page, 'Escape', 'Escape')
        await delay(150)
      }

      page.close()

      /* ----------------------------------------------------------- stock route */
      const stockPage = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
      await stockPage.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/stock.html?seed=stock` })
      await waitFor(stockPage, 'window.__lab && window.__lab.ready === true', 'stock route ready', 20000)
      await delay(500)
      await selectShape(stockPage, RECT_ID)
      const stockIds = await testIds(stockPage)
      checklist.add(
        'paint rows are ABSENT on the stock route (stock.html)',
        !stockIds.has('inspector-number-fillOpacity') && !stockIds.has('inspector-color-strokeColor')
          && !stockIds.has('inspector-number-cornerRadius') && !stockIds.has('inspector-toggle-textOutline'),
      )
      checklist.add(
        'the stock route still offers style/prop rows',
        stockIds.has('inspector-field-x') && stockIds.has('inspector-segment-fill-solid')
          && stockIds.has('inspector-swatch-color-black'),
      )
      await captureFullDock(stockPage, join(outDir, 'inspector-dock-stock-route.png'))
      stockPage.close()

      /* ---------------------------------------- mandatory behaviours × variants */
      for (const variant of [1, 2, 3]) {
        await runMandatoryBehaviourChecks(cdpPort, previewPort, checklist, variant)
      }
    } finally {
      session.kill()
    }
  } finally {
    killPreview()
  }

  checklist.report('inspector smoke')
  console.log(`\nScreenshots written to ${outDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
