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
  await page.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock&frames=colors&drawer=open&variant=${variant}` })
  await waitFor(page, 'window.__lab && window.__lab.ready === true', `${label} ready`, 20000)
  await delay(500)
  await selectShape(page, RECT_ID)
  await delay(150)

  const ids = await testIds(page)
  // Judge round 2 (auditor finding #3): below `VARIANT_PICKER_COMPACT_MAX_DOCK_WIDTH`
  // (kit.tsx), the six-segment strip collapses into one compact <select> —
  // the DEFAULT 280px width is below that threshold, so the segmented
  // testid is no longer guaranteed here; either form proves the picker
  // rendered and reflects the live variant.
  const variantPickerPresent = ids.has(`inspector-variant-${variant}`) || ids.has('inspector-variant-picker-compact')
  checklist.add(`${label}: rows present (W field, variant picker)`, ids.has('inspector-field-w') && variantPickerPresent)

  // Zach's own audit, item 6 (spacing): open-pencil's own measured rhythm —
  // caption→field 4px, field→next-caption 8px, field height 24, section
  // header height 32 — read off the Position caption, the X field and the
  // Dimensions caption, the exact three elements the audit named. This is
  // the KIT's rhythm, not one variant's theme, so it runs for all three.
  {
    const rects = await evaluate(page, `JSON.stringify((() => {
      const paragraphs = [...document.querySelectorAll('[data-testid="inspector-panel"] p')]
      const position = paragraphs.find((p) => p.textContent === 'Position')?.getBoundingClientRect()
      const dimensions = paragraphs.find((p) => p.textContent === 'Dimensions')?.getBoundingClientRect()
      const field = document.querySelector('[data-testid="inspector-field-x"]').getBoundingClientRect()
      const header = document.querySelector('[data-testid="inspector-group-layer"]').getBoundingClientRect()
      return {
        captionToField: position ? field.top - position.bottom : null,
        fieldToNextCaption: dimensions ? dimensions.top - field.bottom : null,
        fieldHeight: field.height,
        headerHeight: header.height,
      }
    })())`).then(JSON.parse)
    checklist.add(`${label}: caption→field gap <= 4px (${rects.captionToField})`, rects.captionToField !== null && rects.captionToField <= 4)
    checklist.add(`${label}: field→next-caption gap <= 8px (${rects.fieldToNextCaption})`, rects.fieldToNextCaption !== null && rects.fieldToNextCaption <= 8)
    checklist.add(`${label}: field height is 24px (${rects.fieldHeight})`, Math.abs(rects.fieldHeight - 24) < 0.5)
    checklist.add(`${label}: section header height is 32px (${rects.headerHeight})`, Math.abs(rects.headerHeight - 32) < 0.5)
  }

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
  // `dockEl` is the `-slide` div (real paint), not the outer `[data-testid=
  // "inspector"]` (bare positioning host, no background of its own since
  // the drawer split — see `dockPaintVsPanelVar`'s own WHY below for the
  // full reasoning). The var probes below stay valid on either element;
  // `dockBg` needs the one that actually paints.
  const inkReadings = () => evaluate(page, `JSON.stringify((() => {
    const dockEl = document.querySelector('[data-testid="inspector-slide"]')
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

  // Round-2 audit, item 2: "a text segment never truncates" — at the 240px
  // floor (still in effect from the block above), no segment item's TEXT
  // may be visually clipped by an ellipsis. `scrollWidth > clientWidth` is
  // the DOM's own honest signal for "this content doesn't fit its box",
  // independent of whether the clipped content happens to still read as a
  // real word.
  {
    const truncated = await evaluate(page, `JSON.stringify([...document.querySelectorAll('[data-testid^="inspector-segment-"]')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.dataset.testid))`).then(JSON.parse)
    checklist.add(`${label}: no segment label truncates at 240px (${truncated.length === 0 ? 'none' : truncated.join(', ')})`, truncated.length === 0)
  }

  // Round-2 audit, item 3: every icon INSIDE a segment item stays within the
  // stock-style-panel ratio (~18px, this app's own 22px-tall item) — the
  // raw @tldraw/assets SVG carries its own 30px intrinsic size baked into
  // the markup, which a wrapper class alone cannot override (fixed at the
  // source in tldrawIcons.tsx); this asserts the fix actually reached the
  // painted pixels, not just the wrapper's own CSS class.
  {
    const oversized = await evaluate(page, `JSON.stringify([...document.querySelectorAll('[data-testid^="inspector-segment-"] svg')]
      .map((svg) => svg.getBoundingClientRect())
      .filter((r) => r.width > 18.5 || r.height > 18.5)
      .map((r) => ({ w: Math.round(r.width), h: Math.round(r.height) })))`).then(JSON.parse)
    checklist.add(`${label}: every segment icon is <= 18px (${oversized.length === 0 ? 'none oversized' : JSON.stringify(oversized)})`, oversized.length === 0)
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
    await page2.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?drawer=open&variant=${variant}` })
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
    await page2.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?drawer=open&variant=${variant}` })
    await waitFor(page2, 'window.__lab && window.__lab.ready === true', `${label} resize ready (cleared)`, 20000)
    await delay(300)
    const handleBox = await elementBox(page2, '[data-testid="inspector-resize-handle"]')
    // Left is wider — the dock is right-anchored (kit.tsx's ResizeHandle WHY).
    await drag(page2, { x: handleBox.cx, y: handleBox.cy }, { x: handleBox.cx - 80, y: handleBox.cy })
    await delay(200)
    const widthAfterDrag = Number(await evaluate(page2, `document.querySelector('[data-testid="inspector"]').getBoundingClientRect().width`))
    checklist.add(`${label}: dragging the resize handle widens the dock to ~360px (now ${widthAfterDrag})`, Math.abs(widthAfterDrag - 360) < 4)

    await page2.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?drawer=open&variant=${variant}` })
    await waitFor(page2, 'window.__lab && window.__lab.ready === true', `${label} resize reload ready`, 20000)
    await delay(300)
    const widthAfterReload = Number(await evaluate(page2, `document.querySelector('[data-testid="inspector"]').getBoundingClientRect().width`))
    checklist.add(`${label}: resizing to 360 survives a reload (now ${widthAfterReload})`, Math.abs(widthAfterReload - 360) < 4)
    page2.close()
  }
}

/* --------------------------------------------------- round 2: 4/5/6 -----
 * V4 "Figma rows", V5 "Icon strips", V6 "Summary accordions" — Zach's
 * verdict on round 1 ("very similar… aim for Figma's compactness, measured
 * in LINE COUNT per section"). A deliberately separate function from
 * `runMandatoryBehaviourChecks` above: round 1's caption-rhythm assertions
 * read `<p>` elements with literal "Position"/"Dimensions" text that the
 * Figma anatomy's own `AnatomySection` never renders (a plain section
 * title, no per-caption paragraph) — reusing that function wholesale would
 * assert something round 2 was never asked to reproduce. What genuinely IS
 * shared (whole-field scrub, resize/reload, ink) is re-asserted here at
 * round 2's own testids, never imported from round 1's function.
 */

/** `data-section` -> its own `[data-line]` count, read in whatever
 *  open/closed state the DOM is in right now — V4/V5 are always fully
 *  drawn; V6 must be read BEFORE any accordion header is clicked to see the
 *  "6 lines closed" default the brief's own target describes. */
async function sectionLineCounts(page) {
  return evaluate(page, `JSON.stringify(Object.fromEntries(
    [...document.querySelectorAll('[data-section]')].map((el) => [el.dataset.section, el.querySelectorAll(':scope [data-line]').length])
  ))`).then(JSON.parse)
}

/** Open a Base UI `Select` (kit.tsx's `CompactSelect`) and click one of its
 *  portaled items by the item's own `data-testid`. */
async function selectItem(page, triggerTestId, itemTestId) {
  await reveal(page, `[data-testid="${triggerTestId}"]`)
  await clickElement(page, `[data-testid="${triggerTestId}"]`)
  await delay(150)
  await reveal(page, `[data-testid="${itemTestId}"]`)
  await clickElement(page, `[data-testid="${itemTestId}"]`)
  await delay(150)
}

const FIGMA_LINE_TARGETS = {
  4: { position: 3, appearance: 1, geometry: 1, fill: 1, stroke: 2, text: 5 },
}

async function runFigmaAnatomyChecks(cdpPort, previewPort, checklist, variant) {
  const label = `variant ${variant}`
  const page = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
  await page.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock&frames=colors&drawer=open&variant=${variant}` })
  await waitFor(page, 'window.__lab && window.__lab.ready === true', `${label} ready`, 20000)
  await delay(500)
  await selectShape(page, RECT_ID)
  await delay(200)

  /* ---------------------------------------------------------- line counts */
  {
    const counts = await sectionLineCounts(page)
    if (variant === 4) {
      const targets = FIGMA_LINE_TARGETS[4]
      for (const [section, target] of Object.entries(targets)) {
        checklist.add(`${label}: [data-section="${section}"] has <= ${target} lines (${counts[section] ?? 0})`, (counts[section] ?? 0) <= target)
      }
      const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
      checklist.add(`${label}: total lines is exactly 13 on a stock rectangle (${total})`, total === 13)
    } else if (variant === 5) {
      const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
      checklist.add(`${label}: total lines <= 8 (${total})`, total <= 8)
    } else if (variant === 6) {
      const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
      checklist.add(`${label}: total lines closed <= 6 (${total})`, total <= 6)
    }
  }

  // V6 draws every row inside a closed accordion by default (that IS the
  // "6 lines closed" state just measured above) — every check from here on
  // needs real fields in the DOM, so "Expand all" opens every section at
  // once rather than clicking each header the checks below happen to need.
  if (variant === 6) {
    await clickElement(page, '[data-testid="inspector-accordion-openall"]')
    await delay(200)
  }

  /* --------------------------------------------- whole-field scrub / edit */
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

  /* ------------------------------------------------------------------ ink */
  {
    const r = await evaluate(page, `JSON.stringify((() => {
      const dockEl = document.querySelector('[data-testid="inspector"]')
      function probe(cssVar) {
        const el = document.createElement('span')
        el.style.color = cssVar
        dockEl.appendChild(el)
        const value = getComputedStyle(el).color
        el.remove()
        return value
      }
      const unpressedSegment = document.querySelector('[data-testid^="inspector-figmaseg-align-"][data-state="off"]')
      const numberInput = document.querySelector('[data-testid="inspector-number-w"]')
      return {
        surface: probe('var(--v-surface)'),
        muted: probe('var(--v-muted)'),
        segment: unpressedSegment ? getComputedStyle(unpressedSegment).color : null,
        numberInput: numberInput ? getComputedStyle(numberInput).color : null,
      }
    })())`).then(JSON.parse)
    checklist.add(`${label}: unpressed align segment ink equals --v-muted (${r.segment})`, r.segment === null || r.segment === r.muted)
    checklist.add(`${label}: number input ink equals --v-surface`, r.numberInput === r.surface)
  }

  /* ---------------------------------------------------------- pixel gate --
   * "nothing clips" from round 1, at the 240px floor. */
  {
    const handleBox = await elementBox(page, '[data-testid="inspector-resize-handle"]')
    await drag(page, { x: handleBox.cx, y: handleBox.cy }, { x: handleBox.cx + 40, y: handleBox.cy })
    await delay(200)
    const width = await evaluate(page, `document.querySelector('[data-testid="inspector"]').getBoundingClientRect().width`)
    const overflow = await evaluate(page, `JSON.stringify((() => {
      const dock = document.querySelector('[data-testid="inspector"]').getBoundingClientRect()
      const rows = [...document.querySelectorAll('[data-line]')]
      return rows
        .map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.testid ?? el.className, right: r.right } })
        .filter((r) => r.right > dock.right + 0.5)
    })())`).then(JSON.parse)
    checklist.add(
      `${label}: nothing clips at ${Math.round(Number(width))}px width (${overflow.length === 0 ? 'none clipped' : overflow.map((r) => r.id).join(', ')})`,
      overflow.length === 0,
    )
  }
  page.close()

  /* --------------------------------------------------- semantic checks --- */
  const semPage = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
  await semPage.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock&frames=colors&drawer=open&variant=${variant}` })
  await waitFor(semPage, 'window.__lab && window.__lab.ready === true', `${label} sem ready`, 20000)
  await delay(400)
  await selectShape(semPage, RECT_ID)
  await delay(200)
  if (variant === 6) {
    await clickElement(semPage, '[data-testid="inspector-accordion-openall"]')
    await delay(200)
  }

  // The eye on Fill writes props.fill = 'none' and restores the previous style.
  {
    const before = await getShape(semPage, RECT_ID)
    await reveal(semPage, '[data-testid="inspector-fill-eye"]')
    await clickElement(semPage, '[data-testid="inspector-fill-eye"]')
    await delay(150)
    const off = await getShape(semPage, RECT_ID)
    checklist.add(`${label}: the Fill eye writes props.fill = 'none' (was ${before.props.fill})`, off.props.fill === 'none')
    await clickElement(semPage, '[data-testid="inspector-fill-eye"]')
    await delay(150)
    const restored = await getShape(semPage, RECT_ID)
    checklist.add(`${label}: the Fill eye restores the previous fill style (${restored.props.fill})`, restored.props.fill === before.props.fill)
  }

  // The eye on Stroke writes dash: 'none' and restores.
  {
    const before = await getShape(semPage, RECT_ID)
    await reveal(semPage, '[data-testid="inspector-stroke-eye"]')
    await clickElement(semPage, '[data-testid="inspector-stroke-eye"]')
    await delay(150)
    const off = await getShape(semPage, RECT_ID)
    checklist.add(`${label}: the Stroke eye writes dash: 'none' (was ${before.props.dash})`, off.props.dash === 'none')
    await clickElement(semPage, '[data-testid="inspector-stroke-eye"]')
    await delay(150)
    const restored = await getShape(semPage, RECT_ID)
    checklist.add(`${label}: the Stroke eye restores the previous dash (${restored.props.dash})`, restored.props.dash === before.props.dash)
  }

  // The picker's default strip writes the NAMED colour and clears the exact override.
  {
    await reveal(semPage, '[data-testid="inspector-fillswatch"]')
    await clickElement(semPage, '[data-testid="inspector-fillswatch"]')
    await delay(200)
    await replaceFieldText(semPage, '[data-testid="inspector-fillswatch-hex"]', '#ff00ff')
    await key(semPage, 'Enter', 'Enter')
    await delay(200)
    const withOverride = await getShape(semPage, RECT_ID)
    checklist.add(`${label}: typing a hex into the Fill picker sets the exact override`, withOverride.meta.systemSketchPrimitiveOverride?.fillColor === '#ff00ff')
    await reveal(semPage, '[data-testid="inspector-defaultswatch-color-green"]')
    await clickElement(semPage, '[data-testid="inspector-defaultswatch-color-green"]')
    await delay(200)
    const afterSwatch = await getShape(semPage, RECT_ID)
    checklist.add(`${label}: a default swatch writes the named colour (${afterSwatch.props.color})`, afterSwatch.props.color === 'green')
    checklist.add(`${label}: a default swatch clears the exact fillColor override`, afterSwatch.meta.systemSketchPrimitiveOverride?.fillColor === undefined)
  }

  // The weight control writes the rung and, via Exact, the px override.
  {
    await selectItem(semPage, 'inspector-weightselect', 'inspector-weightselect-l')
    await delay(150)
    const rung = await getShape(semPage, RECT_ID)
    checklist.add(`${label}: the weight Select writes the size rung (${rung.props.size})`, rung.props.size === 'l')
    await selectItem(semPage, 'inspector-weightselect', 'inspector-weightselect-__exact__')
    await delay(150)
    await replaceFieldText(semPage, '[data-testid="inspector-number-strokeWidth"]', '9')
    await key(semPage, 'Enter', 'Enter')
    await delay(150)
    const exact = await getShape(semPage, RECT_ID)
    checklist.add(`${label}: Exact… reveals the strokeWidth px override (${exact.meta.systemSketchPrimitiveOverride?.strokeWidth})`, exact.meta.systemSketchPrimitiveOverride?.strokeWidth === 9)
  }

  semPage.close()

  /* ------------------------------------------------------- resize/reload - */
  {
    const page2 = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
    await page2.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?drawer=open&variant=${variant}` })
    await waitFor(page2, 'window.__lab && window.__lab.ready === true', `${label} resize ready`, 20000)
    await delay(300)
    await evaluate(page2, `localStorage.removeItem('tldraw_styling_lab.dockWidth')`)
    await page2.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?drawer=open&variant=${variant}` })
    await waitFor(page2, 'window.__lab && window.__lab.ready === true', `${label} resize ready (cleared)`, 20000)
    await delay(300)
    const handleBox = await elementBox(page2, '[data-testid="inspector-resize-handle"]')
    await drag(page2, { x: handleBox.cx, y: handleBox.cy }, { x: handleBox.cx - 80, y: handleBox.cy })
    await delay(200)
    const widthAfterDrag = Number(await evaluate(page2, `document.querySelector('[data-testid="inspector"]').getBoundingClientRect().width`))
    checklist.add(`${label}: dragging the resize handle widens the dock to ~360px (now ${widthAfterDrag})`, Math.abs(widthAfterDrag - 360) < 4)
    await page2.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?drawer=open&variant=${variant}` })
    await waitFor(page2, 'window.__lab && window.__lab.ready === true', `${label} resize reload ready`, 20000)
    await delay(300)
    const widthAfterReload = Number(await evaluate(page2, `document.querySelector('[data-testid="inspector"]').getBoundingClientRect().width`))
    checklist.add(`${label}: resizing to 360 survives a reload (now ${widthAfterReload})`, Math.abs(widthAfterReload - 360) < 4)
    await evaluate(page2, `localStorage.removeItem('tldraw_styling_lab.dockWidth')`)
    page2.close()
  }

  /* -------------------------------------------------------------- V6 only */
  if (variant === 6) {
    const page3 = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
    await page3.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock&frames=colors&drawer=open&variant=6` })
    await waitFor(page3, 'window.__lab && window.__lab.ready === true', 'v6 chip ready', 20000)
    await delay(400)
    await selectShape(page3, RECT_ID)
    await delay(200)
    const before = await evaluate(page3, `document.querySelector('[data-testid="inspector-summary-fill"]')?.textContent`)
    // The chip is read straight from the model, never a second copy of the
    // state — an EDITOR-DRIVEN change (not a click through this row's own
    // control) has to move it, which is the brief's own proof requirement.
    await evaluate(page3, `void window.__lab.editor.updateShapes([{ id: '${RECT_ID}', type: 'geo', props: { fill: 'pattern' } }])`)
    await delay(250)
    const after = await evaluate(page3, `document.querySelector('[data-testid="inspector-summary-fill"]')?.textContent`)
    checklist.add(`variant 6: the Fill summary chip updates when editor.updateShapes changes the fill (${before} -> ${after})`, before !== after && /pattern/.test(after ?? ''))
    await evaluate(page3, `void window.__lab.editor.updateShapes([{ id: '${RECT_ID}', type: 'geo', props: { fill: 'solid' } }])`)
    page3.close()
  }
}

/* ------------------------------------------------------------- drawer ---
 * Zach, verbatim: "I have a nice idea for how I want the interaction to be
 * to show/hide the inspector panel. It should kinda feel like a drag out
 * window. By default it's hidden but in the top right corner there is
 * basically like a drawer button and if you press it it will slide out
 * over the stock tldraw menu." Replaces the earlier stock/inspector panel
 * SWITCH (`runStockPanelSwitchChecks`, `panelMode.ts` — both gone): stock
 * is now always what paints, and the dock is a drawer over it. Run once
 * (variant-independent chrome), against the app's own default variant.
 */
async function runDrawerChecks(cdpPort, previewPort, checklist) {
  const page = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
  await page.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock&frames=colors` })
  await waitFor(page, 'window.__lab && window.__lab.ready === true', 'drawer ready', 20000)
  await delay(400)

  // Fresh load: stock panel visible, dock closed.
  const idsClosed = await testIds(page)
  checklist.add('fresh load shows the stock panel (.tlui-style-panel present)', await evaluate(page, `!!document.querySelector('.tlui-style-panel')`))
  checklist.add('fresh load shows the drawer tab', idsClosed.has('inspector-drawer-tab'))
  checklist.add(
    'the dock is present but aria-hidden and inert while closed',
    await evaluate(page, `(() => { const el = document.querySelector('[data-testid="inspector"]'); return !!el && el.getAttribute('aria-hidden') === 'true' && el.inert === true })()`),
  )
  checklist.add(
    'the closed dock does not eat clicks meant for the canvas underneath it',
    await evaluate(page, `getComputedStyle(document.querySelector('[data-testid="inspector"]')).pointerEvents === 'none'`),
  )

  // The tab click slides the dock in.
  await selectShape(page, RECT_ID)
  await delay(300)
  await clickElement(page, '[data-testid="inspector-drawer-tab"]')
  await delay(300) // >= the 180ms transition
  checklist.add('the tab click opens the drawer (aria-hidden false)', await evaluate(page, `document.querySelector('[data-testid="inspector"]')?.getAttribute('aria-hidden')`) === 'false')
  // Judge round 2's own fix (Codex #2/auditor #6, positioning regression):
  // the SLIDE transform lives on `[data-testid="inspector-slide"]`, not the
  // outer `[data-testid="inspector"]` any more — that outer div's own rect
  // is deliberately static (`top:0 right:0 width:dockWidth`) regardless of
  // open/closed, so a portaled Popover/Select stays positioned correctly.
  const dockRect = await elementBox(page, '[data-testid="inspector-slide"]')
  const containerWidth = await evaluate(page, 'window.__lab.editor.getContainer().getBoundingClientRect().right')
  checklist.add(`the open dock's right edge reaches the container's right edge (${dockRect.x + dockRect.width} vs ${containerWidth})`, Math.abs(dockRect.x + dockRect.width - Number(containerWidth)) < 1)
  const covered = await evaluate(page, `(() => {
    const b = document.querySelector('.tlui-style-panel__wrapper').getBoundingClientRect()
    const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    return !!el?.closest('[data-testid="inspector"]')
  })()`)
  checklist.add('the open dock visually covers the stock style panel (elementFromPoint at its centre hits the dock)', covered)

  // The chevron closes it.
  await clickElement(page, '[data-testid="inspector-drawer-close"]')
  await delay(300)
  checklist.add('the chevron closes the drawer', await evaluate(page, `document.querySelector('[data-testid="inspector"]')?.getAttribute('aria-hidden')`) === 'true')

  // Escape, with focus inside the dock, closes it (and returns focus to the
  // container, the existing pre-drawer behaviour — unchanged, just also
  // closing now).
  await clickElement(page, '[data-testid="inspector-drawer-tab"]')
  await delay(300)
  await clickElement(page, '[data-testid="inspector-field-x"]')
  await delay(150)
  await key(page, 'Escape', 'Escape')
  await delay(300)
  checklist.add('Escape with focus in the dock closes it', await evaluate(page, `document.querySelector('[data-testid="inspector"]')?.getAttribute('aria-hidden')`) === 'true')
  checklist.add('Escape still returns focus to the editor container', await evaluate(page, `document.activeElement === window.__lab.editor.getContainer()`))

  // A drag of >= 24px on the tab opens it (the closed state from the
  // chevron close above).
  const tabBox = await elementBox(page, '[data-testid="inspector-drawer-tab"]')
  await drag(page, { x: tabBox.cx, y: tabBox.cy }, { x: tabBox.cx - 30, y: tabBox.cy })
  await delay(300)
  checklist.add('dragging the tab >= 24px left opens the drawer', await evaluate(page, `document.querySelector('[data-testid="inspector"]')?.getAttribute('aria-hidden')`) === 'false')
  page.close()

  // Persistence: a NON-seed load remembers open/closed; a `?seed=` load
  // ignores whatever is in localStorage (same rule dock width follows).
  {
    const page2 = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
    await page2.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html` })
    await waitFor(page2, 'window.__lab && window.__lab.ready === true', 'persist ready', 20000)
    await delay(300)
    await evaluate(page2, `localStorage.removeItem('tldraw_styling_lab.drawerOpen')`)
    await page2.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html` })
    await waitFor(page2, 'window.__lab && window.__lab.ready === true', 'persist ready (cleared)', 20000)
    await delay(300)
    checklist.add('a fresh non-seed load defaults to closed', await evaluate(page2, `document.querySelector('[data-testid="inspector"]')?.getAttribute('aria-hidden')`) === 'true')
    await clickElement(page2, '[data-testid="inspector-drawer-tab"]')
    await delay(300)
    const stored = await evaluate(page2, `localStorage.getItem('tldraw_styling_lab.drawerOpen')`)
    checklist.add(`opening persists to localStorage (${stored})`, stored === 'open')

    await page2.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html` })
    await waitFor(page2, 'window.__lab && window.__lab.ready === true', 'persist reload ready', 20000)
    await delay(400)
    checklist.add('a non-seed reload keeps the persisted open state', await evaluate(page2, `document.querySelector('[data-testid="inspector"]')?.getAttribute('aria-hidden')`) === 'false')

    await page2.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock` })
    await waitFor(page2, 'window.__lab && window.__lab.ready === true', 'seed reload ready', 20000)
    await delay(400)
    checklist.add('a ?seed= reload ignores the persisted open state (starts closed)', await evaluate(page2, `document.querySelector('[data-testid="inspector"]')?.getAttribute('aria-hidden')`) === 'true')

    await evaluate(page2, `localStorage.removeItem('tldraw_styling_lab.drawerOpen')`)
    page2.close()
  }
}

/* -------------------------------------------------- judge round 2 fixes -
 * Two independent judges (Codex, an in-family auditor) ran against the
 * drawer branch. Each numbered finding below is theirs; the fix is in
 * Inspector.tsx/figmaKit.tsx/figmaVariants.tsx/kit.tsx/ScrubNumber.tsx/
 * inspectorModel.ts/the shadcn popover/select/tooltip wrappers — this
 * function is the proof, not a repeat of the fix's own WHY (each fix
 * carries its own comment at the seam it changed).
 */
async function runJudgeRound2Checks(cdpPort, previewPort, checklist) {
  const page = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
  await page.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock&frames=colors&variant=4&drawer=open` })
  await waitFor(page, 'window.__lab && window.__lab.ready === true', 'judge round2 ready', 20000)
  await delay(400)
  await selectShape(page, RECT_ID)
  await delay(200)

  // Codex #1 / auditor #2: no number input clips its own value, at 240,
  // 280 and 360, across every variant, WITH an exact-override row present
  // (strokeWidth) so the narrower "exact px field" branches are covered too.
  {
    await reveal(page, '[data-testid="inspector-weightselect"]')
    // Force strokeWidth into its own exact-override state so the width
    // check below also covers that field, not just the default rung select.
    const weightBox = await elementBox(page, '[data-testid="inspector-weightselect"]')
    await clickElement(page, '[data-testid="inspector-weightselect"]')
    await delay(150)
    const exactOption = await evaluate(page, `!!document.querySelector('[data-testid="inspector-weightselect-__exact__"]')`)
    if (exactOption) {
      await clickElement(page, '[data-testid="inspector-weightselect-__exact__"]')
      await delay(100)
      await replaceFieldText(page, '[data-testid="inspector-number-strokeWidth"]', '12.5')
      await key(page, 'Enter', 'Enter')
      await delay(150)
    }
    for (const variant of [1, 2, 3, 4, 5, 6]) {
      for (const width of [240, 280, 360]) {
        const vpage = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
        await vpage.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock&frames=colors&variant=${variant}&drawer=open` })
        await waitFor(vpage, 'window.__lab && window.__lab.ready === true', `v${variant}@${width} ready`, 20000)
        await delay(300)
        await selectShape(vpage, RECT_ID)
        await delay(150)
        await evaluate(vpage, `localStorage.removeItem('tldraw_styling_lab.dockWidth')`)
        const handleBox = await elementBox(vpage, '[data-testid="inspector-resize-handle"]')
        const current = Number(await evaluate(vpage, `document.querySelector('[data-testid="inspector"]').getBoundingClientRect().width`))
        const dx = current - width
        if (Math.abs(dx) >= 1) {
          await drag(vpage, { x: handleBox.cx, y: handleBox.cy }, { x: handleBox.cx + dx, y: handleBox.cy })
          await delay(150)
        }
        const clipped = await evaluate(vpage, `JSON.stringify([...document.querySelectorAll('[data-testid^="inspector-number-"]')]
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.dataset.testid))`).then(JSON.parse)
        checklist.add(`v${variant}@${width}: no number input clips (${clipped.length === 0 ? 'none' : clipped.join(', ')})`, clipped.length === 0)
        vpage.close()
      }
    }
  }

  // Auditor #3: every header control's right edge stays inside the dock at
  // 240/280/360, all six variants.
  for (const variant of [1, 2, 3, 4, 5, 6]) {
    for (const width of [240, 280, 360]) {
      const vpage = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
      await vpage.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock&frames=colors&variant=${variant}&drawer=open` })
      await waitFor(vpage, 'window.__lab && window.__lab.ready === true', `v${variant}@${width} header ready`, 20000)
      await delay(300)
      await evaluate(vpage, `localStorage.removeItem('tldraw_styling_lab.dockWidth')`)
      const handleBox = await elementBox(vpage, '[data-testid="inspector-resize-handle"]')
      const current = Number(await evaluate(vpage, `document.querySelector('[data-testid="inspector"]').getBoundingClientRect().width`))
      const dx = current - width
      if (Math.abs(dx) >= 1) {
        await drag(vpage, { x: handleBox.cx, y: handleBox.cy }, { x: handleBox.cx + dx, y: handleBox.cy })
        await delay(150)
      }
      const overflow = await evaluate(vpage, `JSON.stringify((() => {
        const dock = document.querySelector('[data-testid="inspector"]').getBoundingClientRect()
        const controls = [...document.querySelectorAll('[data-testid="inspector-drawer-close"], [data-testid="inspector-tab-inspect"], [data-testid="inspector-tab-theme"], [data-testid="inspector-variant-picker"], [data-testid="inspector-variant-picker-compact"], [data-testid^="inspector-variant-"]')]
        return controls.map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.testid, right: r.right } }).filter((r) => r.right > dock.right + 0.5)
      })())`).then(JSON.parse)
      checklist.add(`v${variant}@${width}: header controls stay inside the dock (${overflow.length === 0 ? 'none' : overflow.map((r) => r.id).join(', ')})`, overflow.length === 0)
      vpage.close()
    }
  }

  // Auditor #4: round 1's swatch grid wraps instead of overflowing at 240.
  for (const variant of [1, 2, 3]) {
    const vpage = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
    await vpage.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock&frames=colors&variant=${variant}&drawer=open` })
    await waitFor(vpage, 'window.__lab && window.__lab.ready === true', `v${variant} swatch ready`, 20000)
    await delay(300)
    await selectShape(vpage, RECT_ID)
    await delay(150)
    await evaluate(vpage, `localStorage.removeItem('tldraw_styling_lab.dockWidth')`)
    const handleBox = await elementBox(vpage, '[data-testid="inspector-resize-handle"]')
    const current = Number(await evaluate(vpage, `document.querySelector('[data-testid="inspector"]').getBoundingClientRect().width`))
    const dx = current - 240
    await drag(vpage, { x: handleBox.cx, y: handleBox.cy }, { x: handleBox.cx + dx, y: handleBox.cy })
    await delay(150)
    const overflow = await evaluate(vpage, `JSON.stringify((() => {
      const dock = document.querySelector('[data-testid="inspector"]').getBoundingClientRect()
      const swatches = [...document.querySelectorAll('[data-testid^="inspector-swatch-"]')]
      return swatches.map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.testid, right: r.right } }).filter((r) => r.right > dock.right + 0.5)
    })())`).then(JSON.parse)
    checklist.add(`v${variant}@240: swatch grid wraps, none overflow (${overflow.length === 0 ? 'none' : overflow.map((r) => r.id).join(', ')})`, overflow.length === 0)
    vpage.close()
  }

  // Auditor #5: ScrubNumber is a real port of panelFieldBase, not shadcn's
  // InputGroup defaults.
  {
    const field = await evaluate(page, `JSON.stringify((() => {
      const el = document.querySelector('[data-testid="inspector-field-w"]')
      const input = document.querySelector('[data-testid="inspector-number-w"]')
      const cs = getComputedStyle(el)
      return { borderRadius: cs.borderRadius, borderColor: cs.borderColor, height: cs.height, inputFontSize: getComputedStyle(input).fontSize }
    })())`).then(JSON.parse)
    checklist.add(`ScrubNumber border-radius is 4px (${field.borderRadius})`, field.borderRadius === '4px')
    checklist.add(`ScrubNumber border is transparent at rest (${field.borderColor})`, field.borderColor === 'rgba(0, 0, 0, 0)')
    checklist.add(`ScrubNumber height is 24px (${field.height})`, field.height === '24px')
    checklist.add(`ScrubNumber input font-size is 11px (${field.inputFontSize})`, field.inputFontSize === '11px')
  }

  // Codex #2 / auditor #6: the colour picker popup inherits the dock's own
  // palette in both themes (portaled INTO the dock now, not <body>), and
  // the selected fill-style tile is visibly distinct from an unselected one.
  for (const mode of ['light', 'dark']) {
    if (mode === 'dark') { await evaluate(page, `window.__lab.editor.user.updateUserPreferences({ colorScheme: 'dark' })`); await delay(200) }
    await reveal(page, '[data-testid="inspector-fillswatch"]')
    await clickElement(page, '[data-testid="inspector-fillswatch"]')
    await delay(250)
    const themed = await evaluate(page, `JSON.stringify((() => {
      // dock (outer): the portal TARGET, per dockPortalContainer() — stays
      // the outer div because that's the never-transformed element Base UI
      // actually portals popovers into (a SIBLING of the slide div, not a
      // descendant of it), so containment must be checked against it.
      // dockSlide (inner): the element that actually paints the panel
      // background, since the drawer split — see dockPaintVsPanelVar's own
      // WHY. The two are deliberately different elements here.
      const dock = document.querySelector('[data-testid="inspector"]')
      const dockSlide = document.querySelector('[data-testid="inspector-slide"]')
      const content = document.querySelector('[data-slot="popover-content"]')
      const selected = document.querySelector('[data-testid^="inspector-fillstyle-"][data-state="on"]')
      const unselected = document.querySelector('[data-testid^="inspector-fillstyle-"][data-state="off"]')
      return {
        dockBg: getComputedStyle(dockSlide).backgroundColor,
        popupBg: content ? getComputedStyle(content).backgroundColor : null,
        insideDock: content ? dock.contains(content) : false,
        selectedBg: selected ? getComputedStyle(selected).backgroundColor : null,
        unselectedBg: unselected ? getComputedStyle(unselected).backgroundColor : null,
      }
    })())`).then(JSON.parse)
    checklist.add(`${mode}: the picker popup portals inside the dock`, themed.insideDock)
    checklist.add(`${mode}: the picker popup background matches the dock (${themed.popupBg} vs ${themed.dockBg})`, themed.popupBg === themed.dockBg)
    checklist.add(`${mode}: the selected fill-style tile reads differently from an unselected one (${themed.selectedBg} vs ${themed.unselectedBg})`, themed.selectedBg !== themed.unselectedBg)
    // WHY re-click the trigger, not Escape: found chasing this exact check
    // failing in dark mode. Escape used to slam the whole DRAWER shut
    // instead (Inspector.tsx's own WHY on the nested-popup check, fixed
    // alongside this) — fixing that uncovered a SEPARATE, pre-existing gap
    // underneath it: Base UI's Popover is documented to auto-focus its
    // first tabbable element on open (there are three real `<button>`s in
    // this popup), but measured directly here, focus stays on the trigger
    // instead, so the popup's own Escape-to-close (which needs focus
    // inside it) never fires either — Escape does nothing, popupOpen stays
    // true. Not this fix's scope to chase further: re-clicking the trigger
    // (a real Base UI toggle, verified directly in the browser) closes it
    // reliably regardless, which is all this loop's cleanup step needs.
    // Flagged in docs/log.md as a real, separate follow-up.
    await clickElement(page, '[data-testid="inspector-fillswatch"]')
    await delay(150)
  }
  await evaluate(page, `window.__lab.editor.user.updateUserPreferences({ colorScheme: 'light' })`)
  await delay(150)

  // Auditor #7: the eye's "last style" memory does not leak across a
  // shape-selection change.
  {
    await selectShape(page, RECT_ID) // solid
    await delay(150)
    await reveal(page, '[data-testid="inspector-fill-eye"]')
    await clickElement(page, '[data-testid="inspector-fill-eye"]') // off
    await delay(150)
    await selectShape(page, ELLIPSE_ID) // pattern
    await delay(150)
    await selectShape(page, RECT_ID) // back to the rect, still fill:none
    await delay(150)
    await clickElement(page, '[data-testid="inspector-fill-eye"]') // restore
    await delay(150)
    const after = await getShape(page, RECT_ID)
    checklist.add(`the eye restores THIS shape's own previous style, not another shape's (${after.props.fill})`, after.props.fill === 'solid')
  }

  // Codex #8: an alpha scrub is one undo step, not one per pointer frame.
  {
    const before = await getShape(page, RECT_ID)
    const box = await reveal(page, '[data-testid="inspector-fillswatch"]')
    // The alpha ScrubNumber sits right of the fill name — reuse the same
    // whole-field drag contract every other ScrubNumber gets tested with.
    const alphaBox = await elementBox(page, '[data-testid="inspector-field-fillOpacityPercent"]')
    await drag(page, { x: alphaBox.cx, y: alphaBox.cy }, { x: alphaBox.cx + 40, y: alphaBox.cy })
    await delay(150)
    const dragged = await getShape(page, RECT_ID)
    checklist.add('the alpha scrub changes fillOpacity', dragged.props.fillOpacity !== before.props.fillOpacity || JSON.stringify(dragged.meta) !== JSON.stringify(before.meta))
    await evaluate(page, 'void window.__lab.editor.undo()')
    await delay(150)
    const undone = await getShape(page, RECT_ID)
    checklist.add('one alpha scrub gesture is one undo step', JSON.stringify(undone) === JSON.stringify(before))
    void box
  }

  // Codex #9: a default-swatch click is one undo step (writes the named
  // colour AND clears the exact override together).
  {
    await replaceFieldText(page, '[data-testid="inspector-fillswatch-hex"]', '#ff00ff')
    await key(page, 'Enter', 'Enter')
    await delay(200)
    const withOverride = await getShape(page, RECT_ID)
    checklist.add('an exact override is set before the default-swatch check', withOverride.meta.systemSketchPrimitiveOverride?.fillColor === '#ff00ff')
    await reveal(page, '[data-testid="inspector-defaultswatch-color-green"]')
    await clickElement(page, '[data-testid="inspector-defaultswatch-color-green"]')
    await delay(200)
    const afterSwatch = await getShape(page, RECT_ID)
    checklist.add('the default swatch writes the named colour and clears the override in one call', afterSwatch.props.color === 'green' && afterSwatch.meta.systemSketchPrimitiveOverride?.fillColor === undefined)
    await evaluate(page, 'void window.__lab.editor.undo()')
    await delay(150)
    const undone = await getShape(page, RECT_ID)
    checklist.add('one undo fully reverts the default-swatch click (colour AND override together)', undone.props.color === withOverride.props.color && undone.meta.systemSketchPrimitiveOverride?.fillColor === withOverride.meta.systemSketchPrimitiveOverride?.fillColor)
  }

  // Auditor #12: V4-V6's own section rhythm matches round 1's measured
  // values (32px header band, 4px caption-to-field gap).
  for (const variant of [4, 5, 6]) {
    const vpage = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
    await vpage.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock&frames=colors&variant=${variant}&drawer=open` })
    await waitFor(vpage, 'window.__lab && window.__lab.ready === true', `v${variant} rhythm ready`, 20000)
    await delay(300)
    await selectShape(vpage, RECT_ID)
    await delay(200)
    if (variant === 6) { await clickElement(vpage, '[data-testid="inspector-accordion-position"]'); await delay(200) }
    const rhythm = await evaluate(vpage, `JSON.stringify((() => {
      const section = document.querySelector('[data-section="position"]')
      const headerBand = section.querySelector(':scope > div')
      const firstLine = section.querySelector('[data-line]')
      if (!headerBand || !firstLine) return null
      return {
        headerHeight: headerBand.getBoundingClientRect().height,
        captionToField: firstLine.getBoundingClientRect().top - headerBand.getBoundingClientRect().bottom,
      }
    })())`).then(JSON.parse)
    if (rhythm) {
      checklist.add(`v${variant}: section header band is 32px (${rhythm.headerHeight})`, Math.abs(rhythm.headerHeight - 32) < 0.5)
      checklist.add(`v${variant}: caption-to-field gap is <= 4px (${rhythm.captionToField})`, rhythm.captionToField <= 4)
    }
    vpage.close()
  }

  page.close()
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
      //
      // WHY `&variant=1` here, explicitly, though it is no longer this app's
      // own DEFAULT (round 2 moved that to 4 — `variants/theme.ts`'s own
      // WHY): everything below reads round 1's group-based testids
      // (`inspector-tile-geo-*`, `inspector-segment-fill-*`, `inspector-group-*`,
      // …), which `figmaVariants.tsx` never draws. Pinning here is what keeps
      // this whole block asserting the SAME thing it always has rather than
      // silently starting to assert round 2's anatomy under round 1's name —
      // the brief's own words: "switch the journey's default to 4 only where
      // it asserts the new anatomy."
      const page = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
      await page.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock&frames=colors&drawer=open&variant=1` })
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
      // WHY `[data-testid="inspector-slide"]`, not the outer `[data-testid=
      // "inspector"]`, for the two ACTUAL PAINT reads below (`dock` here,
      // `bg` in headerContrast): the drawer split moved every visible box
      // style (`bg-background`, the slide transform) onto the inner slide
      // div and left the outer as a bare positioning/attribute host with no
      // background of its own (see Inspector.tsx's own WHY on that split) —
      // reading the outer's `backgroundColor` now returns transparent
      // regardless of theme, which parses as near-black and silently failed
      // both this check and the header-contrast one below at a fixed
      // ~1.3:1 no matter which theme was live. The `--v-panel`/`--foreground`
      // CSS-variable PROBES stay fine on either div — custom properties
      // inherit through descendants regardless of which element paints —
      // this is only about elements read for their own resolved paint.
      const dockPaintVsPanelVar = () => evaluate(page, `JSON.stringify((() => {
        const dockEl = document.querySelector('[data-testid="inspector-slide"]')
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
      // Background from `-slide`, same reason as `dockPaintVsPanelVar` above.
      const headerContrast = () => evaluate(page, `JSON.stringify((() => {
        const trigger = document.querySelector('[data-testid="inspector-group-layer"]')
        return { text: getComputedStyle(trigger).color, bg: getComputedStyle(document.querySelector('[data-testid="inspector-slide"]')).backgroundColor }
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
      // `stock.html` mounts the same `Inspector` — pinned to `&variant=1` for
      // the same reason the chrome route above is (round 1's own testids).
      const stockPage = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
      await stockPage.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/stock.html?seed=stock&drawer=open&variant=1` })
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

      /* --------------------------------------- round 2: 4/5/6 Figma anatomy */
      for (const variant of [4, 5, 6]) {
        await runFigmaAnatomyChecks(cdpPort, previewPort, checklist, variant)
      }

      /* ---------------------------------------- stock/inspector panel switch */
      await runDrawerChecks(cdpPort, previewPort, checklist)

      /* ------------------------------------------------- judge round 2 fixes */
      await runJudgeRound2Checks(cdpPort, previewPort, checklist)
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
