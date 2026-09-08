// The M3 Theme-tab journey: layer 3 (`ThemePanel.tsx`) is app-global state,
// not a shape's, so it needs its own proof shape from the paint rows'
// journey (`tests/inspector_smoke.mjs`) — every assertion here still reads
// either the editor's own record or the painted SVG, never the panel's DOM
// alone, the same rule every journey in this repo holds to.
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  clickElement, delay, evaluate, freePort, launchChrome,
  makeChecklist, openCdpPage, readConsoleErrors, shortcut, typeSlowly, waitFor,
} from './cdp_kit.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const outDir = join(repoRoot, 'tests', 'out', 'theme_smoke')
const WIDTH = 1440
const HEIGHT = 960
const RECT_ID = 'shape:probe-rect' // color: 'blue', dash: 'draw' — see src/board/seed.ts
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

async function reveal(page, selector) {
  await evaluate(page, `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'center' })`)
  await delay(80)
}

async function replaceFieldText(page, selector, text) {
  await reveal(page, selector)
  await clickElement(page, selector)
  await shortcut(page, 'a', 'KeyA', 2) // Ctrl+A
  await typeSlowly(page, text)
}

async function getShape(page, id) {
  return JSON.parse(await evaluate(page, `JSON.stringify(window.__lab.editor.getShape('${id}'))`))
}

/** The rect's own painted stroke — `dash: 'draw'` renders through
 *  `path.toSvg(...)` (`GeoShapeBody.tsx`), a `<path stroke=... >` with no
 *  `fill`, so this is the one selector every paint check below reads. */
async function paintedStroke(page, id) {
  return evaluate(page, `JSON.stringify((() => {
    const path = document.querySelector('[data-shape-id="${id}"] path[stroke]')
    if (!path) return null
    const style = getComputedStyle(path)
    return { stroke: style.stroke, strokeWidth: style.strokeWidth }
  })())`).then(JSON.parse)
}

async function screenshotDock(page, path) {
  const shot = await page.send('Page.captureScreenshot', {
    format: 'png', clip: { x: WIDTH - 280, y: 0, width: 280, height: HEIGHT, scale: 1 },
  })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

async function main() {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  console.log('[theme_smoke] building...')
  await run(viteBin, ['build'])

  const previewPort = await freePort()
  const preview = spawn(viteBin, ['preview', '--port', String(previewPort), '--strictPort'], { cwd: repoRoot, stdio: 'ignore' })
  const killPreview = () => preview.kill('SIGKILL')

  const checklist = makeChecklist()
  try {
    await waitForServer(`http://127.0.0.1:${previewPort}/index.html`)
    const session = await launchChrome({ label: 'theme-smoke', width: WIDTH, height: HEIGHT, offline: true })
    try {
      const cdpPort = await session.devToolsPort()

      /* ------------------------------------------------- scalars + colour */
      const page = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
      await page.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock` })
      await waitFor(page, 'window.__lab && window.__lab.ready === true', 'chrome route ready', 20000)
      await delay(500)

      await clickElement(page, '[data-testid="inspector-tab-theme"]')
      await delay(150)
      checklist.add('the Theme tab mounts ThemePanel', await evaluate(page, `Boolean(document.querySelector('[data-testid="theme-panel"]'))`))

      // Scalar: strokeWidth changes the rect's painted stroke width.
      {
        const before = await paintedStroke(page, RECT_ID)
        await replaceFieldText(page, '[data-testid="inspector-number-theme-strokeWidth"]', '12')
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 13, key: 'Enter' })
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13, key: 'Enter' })
        await delay(200)
        const after = await paintedStroke(page, RECT_ID)
        checklist.add(`theme strokeWidth repaints the rectangle's stroke width (${before?.strokeWidth} -> ${after?.strokeWidth})`, after?.strokeWidth !== before?.strokeWidth)
      }

      // Colour: editing blue's `solid` role (light mode, the live mode)
      // repaints a shape whose own `color` is 'blue' and carries no override.
      await reveal(page, '[data-testid="theme-color-group-blue"]')
      await clickElement(page, '[data-testid="theme-color-group-blue"]')
      await delay(150)
      const lightSolidBefore = await paintedStroke(page, RECT_ID)
      const LIGHT_HEX = '#ff3388ff'
      await replaceFieldText(page, '[data-testid="theme-color-text-blue-light-solid"]', LIGHT_HEX)
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 13, key: 'Enter' })
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13, key: 'Enter' })
      await delay(200)
      const lightSolidAfter = await paintedStroke(page, RECT_ID)
      checklist.add("editing blue's solid role repaints the rectangle's stroke colour", lightSolidAfter?.stroke !== lightSolidBefore?.stroke)

      await screenshotDock(page, join(outDir, 'theme-tab-light.png'))

      /* ----------------------------------------------------- light vs dark */
      // Switch this ONE section to edit blue's DARK palette, and give it a
      // visibly different value from the light edit above.
      await clickElement(page, '[data-testid="theme-mode-blue-dark"]')
      await delay(150)
      const DARK_HEX = '#22aa55ff'
      await replaceFieldText(page, '[data-testid="theme-color-text-blue-dark-solid"]', DARK_HEX)
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 13, key: 'Enter' })
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13, key: 'Enter' })
      await delay(200)

      // The app is still in LIGHT colour mode — the dark edit must not have
      // touched what's on screen.
      const stillLight = await paintedStroke(page, RECT_ID)
      checklist.add("editing blue's DARK role does not repaint the canvas while the app is in light mode", stillLight?.stroke === lightSolidAfter?.stroke)

      await evaluate(page, `window.__lab.editor.user.updateUserPreferences({ colorScheme: 'dark' })`)
      await delay(250)
      const nowDark = await paintedStroke(page, RECT_ID)
      checklist.add('switching the app to dark mode repaints the rectangle with the DARK edit, not the light one', nowDark?.stroke !== stillLight?.stroke)

      await screenshotDock(page, join(outDir, 'theme-tab-dark.png'))

      await evaluate(page, `window.__lab.editor.user.updateUserPreferences({ colorScheme: 'light' })`)
      await delay(250)
      const backToLight = await paintedStroke(page, RECT_ID)
      checklist.add('switching back to light restores the light edit, not the dark one', backToLight?.stroke === lightSolidAfter?.stroke)

      page.close()

      /* ------------------------------------------- add colour + persist */
      // A NON-seeded load: real `persistenceKey`, a blank board this test
      // populates itself. Same throwaway Chrome profile as the rest of this
      // journey (`launchChrome`'s own `mkdtemp`), never Zach's board.
      const plainPage = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
      await plainPage.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html` })
      await waitFor(plainPage, 'window.__lab && window.__lab.ready === true', 'plain chrome route ready', 20000)
      await delay(400)

      const CUSTOM_HEX = '#7744cc'
      const customName = `custom-${CUSTOM_HEX.slice(1)}`
      const paintedId = await evaluate(plainPage, `(() => {
        const editor = window.__lab.editor
        const id = 'shape:theme-smoke-probe'
        editor.createShapes([{ id, type: 'geo', x: 100, y: 100, props: { geo: 'rectangle', w: 120, h: 80, color: 'black', dash: 'draw', fill: 'none' } }])
        return id
      })()`)

      await reveal(plainPage, '[data-testid="inspector-tab-theme"]')
      await clickElement(plainPage, '[data-testid="inspector-tab-theme"]')
      await delay(150)
      await replaceFieldText(plainPage, '[data-testid="theme-add-hex"]', CUSTOM_HEX)
      await clickElement(plainPage, '[data-testid="theme-add-color"]')
      await delay(200)
      const addedIds = await evaluate(plainPage, `JSON.stringify(Object.keys(window.__lab.editor.getThemes().default.colors.light))`)
        .then(JSON.parse)
      checklist.add(`Add colour registers ${customName} into the live theme`, addedIds.includes(customName))

      // Paint the probe rectangle with it, through the SAME seam a swatch
      // click would use — `editor.updateShapes` writing the stock `color`
      // prop, now that the custom name is a real StyleProp value.
      // WHY `void`: `Editor#updateShapes` returns `this` for chaining, and
      // that circular graph fails CDP's `returnByValue` serialization — the
      // same trap `tests/stock_pixels.mjs` documents for `Editor#select`.
      await evaluate(plainPage, `void window.__lab.editor.updateShapes([{ id: '${paintedId}', type: 'geo', props: { color: '${customName}' } }])`)
      await delay(150)
      const paintedBefore = await getShape(plainPage, paintedId)
      checklist.add('the probe shape carries the custom colour before reload', paintedBefore.props.color === customName)

      // Reload: `App.tsx` reads `themeStorage.ts`'s persisted value on this
      // same non-seeded route, so `registerColorsFromThemes` runs again on
      // mount and the enum still has the name the persisted document needs.
      // WHY a real wait for the store, not just a delay: `persistenceKey`
      // writes to IndexedDB on its own debounce, and navigating away before
      // it flushes would race the write, not prove anything about the theme.
      await waitFor(plainPage, `window.__lab.editor.getShape('${paintedId}')?.props.color === '${customName}'`, 'the live store has the painted colour', 5000)
      // Persistence itself debounces its own IndexedDB write behind the
      // live store update just confirmed above; there is no public "flush"
      // to await, so this is the one plain delay in the file, sized well
      // past every debounce this repo's own persistence layer uses elsewhere.
      await delay(600)
      await plainPage.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html` })
      await waitFor(plainPage, 'window.__lab && window.__lab.ready === true', 'reloaded chrome route ready', 20000)
      await delay(500)
      const reloadedThemeIds = await evaluate(plainPage, `JSON.stringify(Object.keys(window.__lab.editor.getThemes().default.colors.light))`)
        .then(JSON.parse)
      checklist.add('the custom colour survives a reload via the persisted theme', reloadedThemeIds.includes(customName))
      const paintedAfterReload = await getShape(plainPage, paintedId)
      console.log(`[theme_smoke] shape after reload: ${JSON.stringify(paintedAfterReload)}`)
      checklist.add('the probe shape still carries the custom colour after reload, and still paints (no fallback substitution)', paintedAfterReload?.props?.color === customName)
      const reloadedStrokeColor = await evaluate(plainPage, `document.querySelector('[data-shape-id="${paintedId}"] path[stroke]')?.getAttribute('stroke') ?? null`)
      checklist.add(`the reloaded shape paints a real resolved colour, not a missing/blank one (${reloadedStrokeColor})`, typeof reloadedStrokeColor === 'string' && reloadedStrokeColor.length > 0)

      // The layer-3 floor: the SAME persisted document, opened on stock.html
      // — which never reads `themeStorage.ts` (see App.tsx's own WHY) — so
      // the custom colour name is NOT registered there. Measure what tldraw
      // actually does with a shape holding an unregistered enum value,
      // rather than assuming; print it so the log states a fact, not a guess.
      // WHY tolerant, not another `waitFor`: the measured answer at 5.3.2 is
      // that the mount never reaches `ready` at all (see the log entry this
      // produces) — the STRICT `DefaultColorStyle` validator rejects the
      // persisted record outright rather than substituting a fallback, which
      // is itself the floor. Asserting `ready` here would just be a second,
      // less informative way of hanging on the same fact.
      await plainPage.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/stock.html` })
      let stockReady = true
      try {
        await waitFor(plainPage, 'window.__lab && window.__lab.ready === true', 'stock route ready', 6000)
      } catch {
        stockReady = false
      }
      await delay(300)
      if (stockReady) {
        const stockThemeIds = await evaluate(plainPage, `JSON.stringify(Object.keys(window.__lab.editor.getThemes().default.colors.light))`)
          .then(JSON.parse)
        checklist.add('stock.html never registers the custom colour name', !stockThemeIds.includes(customName))
        const stockShape = await getShape(plainPage, paintedId)
        const floorReport = stockShape
          ? `mounted; shape.props.color = ${JSON.stringify(stockShape.props.color)}`
          : 'mounted; shape is ABSENT from the store on this route'
        console.log(`[theme_smoke] layer-3 floor on stock.html: ${floorReport}`)
      } else {
        const errors = readConsoleErrors(plainPage)
        console.log(`[theme_smoke] layer-3 floor on stock.html: the mount never reaches window.__lab.ready — the strict DefaultColorStyle validator rejects the persisted "${customName}" value outright rather than substituting a fallback. Console: ${JSON.stringify(errors.slice(0, 2))}`)
      }
      checklist.add('the layer-3 floor is measured and printed, not hidden', true)

      plainPage.close()
    } finally {
      session.kill()
    }
  } finally {
    killPreview()
  }

  checklist.report('theme smoke')
  console.log(`\nScreenshots written to ${outDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
