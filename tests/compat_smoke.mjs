// The M4 journey: drive the real "Stock check" button end to end in headless
// Chrome and read its report back out of the DOM. Mirrors tests/stock_pixels.mjs's
// build-then-serve-then-drive shape (same cdp_kit.mjs, same local-.bin vite
// invocation, same reasons — see that file's own WHY comments for the npx/stdio
// pitfalls this one inherits by copying the pattern).
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  clickElement, delay, evaluate, freePort, launchChrome,
  makeChecklist, openCdpPage, waitFor,
} from './cdp_kit.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
// WHY its own subdirectory of tests/out, not tests/out itself: see the WHY at
// the top of tests/stock_pixels.mjs's own `outDir` — every journey owns
// exactly one subdirectory and clears only that one, so running this after
// (or before) the pixel gate or the Inspector journey can never delete
// either's captures.
const outDir = join(repoRoot, 'tests', 'out', 'compat_smoke')
const WIDTH = 1440
const HEIGHT = 960
const viteBin = join(repoRoot, 'node_modules', '.bin', 'vite')
const RECT_ID = 'shape:probe-rect' // createShapeId('probe-rect'), see src/board/seed.ts

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

async function screenshot(page, name) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(outDir, name), Buffer.from(shot.data, 'base64'))
}

async function readInt(page, selector, attr) {
  const value = await evaluate(page, `document.querySelector(${JSON.stringify(selector)})?.dataset.${attr}`)
  if (value === undefined || value === null) throw new Error(`missing ${attr} on ${selector}`)
  return Number(value)
}

async function textOf(page, selector) {
  return evaluate(page, `document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`)
}

async function containerCount(page) {
  return evaluate(page, `document.querySelectorAll('.tl-container').length`)
}

async function main() {
  const checks = makeChecklist()
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  console.log('[compat_smoke] building...')
  await run(viteBin, ['build'])

  const previewPort = await freePort()
  console.log(`[compat_smoke] serving dist/ on ${previewPort}...`)
  const preview = spawn(viteBin, ['preview', '--port', String(previewPort), '--strictPort'], {
    cwd: repoRoot, stdio: 'ignore',
  })
  const killPreview = () => preview.kill('SIGKILL')

  const session = await launchChrome({ label: 'compat-smoke', width: WIDTH, height: HEIGHT, offline: true })
  let page
  try {
    await waitForServer(`http://127.0.0.1:${previewPort}/index.html`)
    const cdpPort = await session.devToolsPort()
    page = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })

    await page.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock` })
    await waitFor(page, 'window.__lab && window.__lab.ready === true', 'lab board ready', 20000)
    await delay(500)

    checks.add('exactly one .tl-container before opening the report', (await containerCount(page)) === 1)

    await screenshot(page, 'compat-button-idle.png')

    // ---- (a) pure layer-1 board: whole-board diff must be zero ----
    await clickElement(page, '[data-testid="stock-check-button"]')
    await waitFor(page, `document.querySelector('[data-testid="stock-check-whole-board"]') || document.querySelector('[data-testid="stock-check-refused"]')`, 'stock check report', 20000)
    await delay(400)

    const refused = await evaluate(page, `Boolean(document.querySelector('[data-testid="stock-check-refused"]'))`)
    checks.add('stock tldraw did not refuse the pure layer-1 export', !refused)

    const wholeBoardChanged = await readInt(page, '[data-testid="stock-check-whole-board"]', 'changed')
    checks.add(`whole-board diff is 0 on a pure layer-1 board (got ${wholeBoardChanged})`, wholeBoardChanged === 0)

    const unpairedText = await textOf(page, '[data-testid="stock-check-unpaired"]')
    checks.add('unpaired section renders empty on the seeded board', unpairedText.includes('None'))

    await screenshot(page, 'compat-report-whole-board.png')

    checks.add('exactly one .tl-container after the first run finishes (hidden editor disposed)', (await containerCount(page)) === 1)

    // ---- (b) paint-override contract: src/inspector/configuredUtils.ts (M2) is
    // on main now, so this is no longer conditional — writing the meta key really
    // does reach real pixels through getCustomDisplayValues, on the lab side only.
    await evaluate(page, `void window.__lab.editor.updateShapes([{
      id: '${RECT_ID}', type: 'geo',
      meta: { systemSketchPrimitiveOverride: { fillColor: '#ff0000', fillOpacity: 1 } },
    }])`)
    await clickElement(page, '[data-slot="sheet-close"]')
    await delay(300)
    await clickElement(page, '[data-testid="stock-check-button"]')
    await waitFor(page, `document.querySelector('[data-testid="stock-check-whole-board"]')`, 'stock check re-run report', 20000)
    await delay(400)

    const firstRowId = await evaluate(page, `document.querySelector('[data-testid="stock-check-shape-row"]')?.dataset.shapeId`)
    const firstRowChanged = await readInt(page, '[data-testid="stock-check-shape-row"]', 'changed')
    const overriddenWholeBoardChanged = await readInt(page, '[data-testid="stock-check-whole-board"]', 'changed')
    checks.add(`the overridden rectangle (${RECT_ID}) sorts first`, firstRowId === RECT_ID)
    checks.add(`the overridden rectangle has > 0 changed px (got ${firstRowChanged})`, firstRowChanged > 0)
    checks.add(`the whole-board row is now > 0 too (got ${overriddenWholeBoardChanged})`, overriddenWholeBoardChanged > 0)
    await screenshot(page, 'compat-report-override.png')

    // ---- (c) the enum blind spot: a value only valid because configuredUtils.ts
    // mutated GeoShapeGeoStyle for this whole page must still read as a real
    // stock-tldraw refusal, per stockEnums.ts's static ground truth. Written
    // directly via updateShapes (equivalent record to what raising the
    // Inspector's cornerRadius field above 0 produces — inspector_smoke.mjs
    // already exercises that UI path end to end; this journey's job is the
    // refusal rule, not a second copy of that interaction test).
    await clickElement(page, '[data-slot="sheet-close"]')
    await delay(300)
    // WHY clear the meta override first: leaving it on would ALSO force the
    // whole-board reading red via a large pixel diff, which would make "red
    // because of the refusal" unfalsifiable against "red because of paint".
    // Clearing it isolates the assertion to the refusal path alone.
    await evaluate(page, `void window.__lab.editor.updateShapes([{
      id: '${RECT_ID}', type: 'geo',
      meta: { systemSketchPrimitiveOverride: null },
      props: { geo: 'systemsketch-rounded-rect' },
    }])`)
    await clickElement(page, '[data-testid="stock-check-button"]')
    await waitFor(page, `document.querySelector('[data-testid="stock-check-whole-board"]')`, 'stock check refusal report', 20000)
    await delay(400)

    const refusalCount = await evaluate(page, `Number(document.querySelector('[data-testid="stock-check-refusals"]')?.dataset.count ?? 0)`)
    checks.add(`a refusal row appears for the mutated geo enum (got ${refusalCount})`, refusalCount > 0)
    const refusalField = await evaluate(page, `document.querySelector('[data-testid="stock-check-refusal-row"]')?.dataset.field`)
    const refusalShapeId = await evaluate(page, `document.querySelector('[data-testid="stock-check-refusal-row"]')?.dataset.shapeId`)
    checks.add(`the refusal row names the geo field on ${RECT_ID}`, refusalField === 'geo' && refusalShapeId === RECT_ID)
    const wholeBoardRedOnRefusal = await evaluate(page, `document.querySelector('[data-testid="stock-check-whole-board"] span')?.className.includes('red')`)
    checks.add('the whole-board reading is forced red when a refusal exists', wholeBoardRedOnRefusal === true)
    await screenshot(page, 'compat-report-refusal.png')

    // ---- (d) leak check: closing the sheet must not leave a second .tl-container ----
    await clickElement(page, '[data-slot="sheet-close"]')
    await delay(500)
    checks.add('exactly one .tl-container after the sheet closes', (await containerCount(page)) === 1)

    checks.report('compat_smoke')
  } finally {
    page?.close()
    session.kill()
    killPreview()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
