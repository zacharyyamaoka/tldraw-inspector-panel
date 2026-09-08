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
// route, paint seam installed) and `bare.html?seed=stock&inspector=1` (the
// stock route — the Inspector on a bare canvas, proving every `paint` row
// withholds itself). Any donor case that needed a SystemSketch-only import
// (Block scenes, the slanted arrow, the stock-compatibility exporter) has no
// analogue here and is not ported — see docs/log.md's M2 entry for the list.
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  clickElement, delay, drag, elementBox, evaluate, freePort, key, launchChrome,
  makeChecklist, openCdpPage, shortcut, typeSlowly, waitFor,
} from './cdp_kit.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const outDir = join(repoRoot, 'tests', 'out')
const WIDTH = 1440
const HEIGHT = 960
const RECT_ID = 'shape:probe-rect'
const ELLIPSE_ID = 'shape:probe-ellipse'
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

async function main() {
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
      const page = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
      await page.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/index.html?seed=stock` })
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

      // Reads the dock's actual painted background, and separately what
      // `--tl-color-panel` resolves to right now — normalized to the same
      // `rgb(...)` shape by painting it onto a throwaway element, since the
      // custom property can be a raw hex string while `getComputedStyle`
      // always answers in `rgb(...)`.
      const dockPaintVsPanelVar = () => evaluate(page, `JSON.stringify((() => {
        const probe = document.createElement('span')
        probe.style.background = 'var(--tl-color-panel)'
        document.querySelector('.tl-container').appendChild(probe)
        const panel = getComputedStyle(probe).backgroundColor
        probe.remove()
        const dock = getComputedStyle(document.querySelector('[data-testid="inspector"]')).backgroundColor
        return { dock, panel }
      })())`).then(JSON.parse)

      // Light-mode screenshot of the dock, and its background for the
      // light-vs-dark comparison below.
      const lightValues = await dockPaintVsPanelVar()
      {
        const dockBox = await elementBox(page, '[data-testid="inspector"]')
        const shot = await page.send('Page.captureScreenshot', {
          format: 'png', clip: { x: dockBox.x, y: dockBox.y, width: dockBox.width, height: dockBox.height, scale: 1 },
        })
        await writeFile(join(outDir, 'inspector-dock-light.png'), Buffer.from(shot.data, 'base64'))
      }

      // Dark mode: the dock's own background follows `--tl-color-panel`
      // exactly, and differs from the light-mode reading above.
      {
        await evaluate(page, `window.__lab.editor.user.updateUserPreferences({ colorScheme: 'dark' })`)
        await delay(200)
        const darkValues = await dockPaintVsPanelVar()
        const dockBoxDark = await elementBox(page, '[data-testid="inspector"]')
        const shotDark = await page.send('Page.captureScreenshot', {
          format: 'png', clip: { x: dockBoxDark.x, y: dockBoxDark.y, width: dockBoxDark.width, height: dockBoxDark.height, scale: 1 },
        })
        await writeFile(join(outDir, 'inspector-dock-dark.png'), Buffer.from(shotDark.data, 'base64'))
        checklist.add(
          'dark mode: the dock background equals --tl-color-panel and differs from light',
          darkValues.dock === darkValues.panel && darkValues.dock !== lightValues.dock,
        )

        await evaluate(page, `window.__lab.editor.user.updateUserPreferences({ colorScheme: 'light' })`)
        await delay(200)
        const lightAgain = await dockPaintVsPanelVar()
        checklist.add('switching back to light restores the light dock background', lightAgain.dock === lightValues.dock)
      }

      page.close()

      /* ----------------------------------------------------------- stock route */
      const stockPage = await openCdpPage(cdpPort, { width: WIDTH, height: HEIGHT })
      await stockPage.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/bare.html?seed=stock&inspector=1` })
      await waitFor(stockPage, 'window.__lab && window.__lab.ready === true', 'stock route ready', 20000)
      await delay(500)
      await selectShape(stockPage, RECT_ID)
      const stockIds = await testIds(stockPage)
      checklist.add(
        'paint rows are ABSENT on the stock route (bare.html?inspector=1)',
        !stockIds.has('inspector-number-fillOpacity') && !stockIds.has('inspector-color-strokeColor')
          && !stockIds.has('inspector-number-cornerRadius') && !stockIds.has('inspector-toggle-textOutline'),
      )
      checklist.add(
        'the stock route still offers style/prop rows',
        stockIds.has('inspector-field-x') && stockIds.has('inspector-segment-fill-solid')
          && stockIds.has('inspector-swatch-color-black'),
      )
      const stockDockBox = await elementBox(stockPage, '[data-testid="inspector"]')
      const stockShot = await stockPage.send('Page.captureScreenshot', {
        format: 'png', clip: { x: stockDockBox.x, y: stockDockBox.y, width: stockDockBox.width, height: stockDockBox.height, scale: 1 },
      })
      await writeFile(join(outDir, 'inspector-dock-stock-route.png'), Buffer.from(stockShot.data, 'base64'))
      stockPage.close()
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
