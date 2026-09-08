// The M4 stock-compatibility check — see docs/log.md's M4 entry and the plan's
// §4 "three styling layers" / §6 M4 for the brief this file implements.
//
// WHY React-free (except for calling into hiddenStockMount.tsx's mount helper):
// everything here is geometry, image decoding and pixel math — keeping it plain
// TypeScript means the diffing logic is testable and reasoned about independent
// of when/how React chooses to render the report around it.
import pixelmatch from 'pixelmatch'
import {
  Box,
  createTLSchema,
  parseTldrawJsonFile,
  serializeTldrawJson,
  type Editor,
  type TldrawFileParseError,
} from 'tldraw'
import { mountHiddenStockEditor } from './hiddenStockMount'

// WHY 0.1: the same tolerance tests/stock_pixels.mjs's sibling M1 gate uses for
// renders that ARE expected to be identical (there: threshold 0, byte-exact, a
// stricter bar this report doesn't need). M4's diffs are expected to be
// non-trivial by construction — layer 2 overrides are invisible to a schema that
// never installed them — so 0.1 exists only to absorb anti-aliasing jitter
// between two independently-rendered SVG->canvas rasterizations, not to hide a
// real divergence.
export const PIXELMATCH_THRESHOLD = 0.1

export interface ImageArtifact {
  url: string
  width: number
  height: number
}

export interface DiffArtifact extends ImageArtifact {
  changed: number
  totalPixels: number
  pct: number
}

export interface ShapeRow {
  id: string
  type: string
  lab: ImageArtifact
  stock: ImageArtifact
  diff: DiffArtifact
}

export interface UnpairedShapeRow {
  id: string
  type: string
  side: 'lab-only' | 'stock-only'
}

export interface StockCheckOk {
  ok: true
  tldrJson: string
  labShapeUtilKeys: string[]
  stockShapeUtilKeys: string[]
  wholeBoard: {
    lab: ImageArtifact
    stock: ImageArtifact
    diff: DiffArtifact
  }
  shapes: ShapeRow[]
  unpaired: UnpairedShapeRow[]
  threshold: number
}

export interface StockCheckErr {
  ok: false
  reason: string
  detail?: unknown
}

export type StockCheckResult = StockCheckOk | StockCheckErr

function describeParseError(error: TldrawFileParseError): string {
  switch (error.type) {
    case 'v1File':
      return 'this board still carries the legacy tldraw v1 document shape — stock tldraw would run it through a one-way importer, not open it as-is.'
    case 'notATldrawFile':
      return `the exported JSON does not parse as a .tldr file: ${String((error as { cause?: unknown }).cause)}`
    case 'fileFormatVersionTooNew':
      return `the file format version (${error.version}) is newer than what this stock schema understands.`
    case 'migrationFailed':
      return `a record failed migration against the stock schema (reason: ${String(error.reason)}).`
    case 'invalidRecords':
      return `one or more records are invalid against the stock schema: ${String((error as { cause?: unknown }).cause)}`
    default:
      return 'stock tldraw refused this file for an unrecognized reason.'
  }
}

async function blobToImageData(blob: Blob): Promise<{ data: ImageData; url: string }> {
  const url = URL.createObjectURL(blob)
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('stock check: could not get a 2d canvas context')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), url }
}

async function diffImages(
  labBlob: Blob,
  stockBlob: Blob,
): Promise<{ lab: ImageArtifact; stock: ImageArtifact; diff: DiffArtifact }> {
  const [lab, stock] = await Promise.all([blobToImageData(labBlob), blobToImageData(stockBlob)])
  if (lab.data.width !== stock.data.width || lab.data.height !== stock.data.height) {
    throw new Error(
      `stock check: size mismatch (${lab.data.width}x${lab.data.height} vs ` +
        `${stock.data.width}x${stock.data.height}) — the two exports used different bounds`,
    )
  }
  const { width, height } = lab.data
  const diffImageData = new ImageData(width, height)
  const changed = pixelmatch(lab.data.data, stock.data.data, diffImageData.data, width, height, {
    threshold: PIXELMATCH_THRESHOLD,
  })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('stock check: could not get a 2d canvas context for the diff image')
  ctx.putImageData(diffImageData, 0, 0)
  const diffBlob: Blob = await new Promise((resolveBlob, rejectBlob) =>
    canvas.toBlob((b) => (b ? resolveBlob(b) : rejectBlob(new Error('canvas.toBlob failed'))), 'image/png'),
  )
  const totalPixels = width * height
  return {
    lab: { url: lab.url, width, height },
    stock: { url: stock.url, width, height },
    diff: {
      url: URL.createObjectURL(diffBlob),
      width,
      height,
      changed,
      totalPixels,
      pct: totalPixels === 0 ? 0 : (changed / totalPixels) * 100,
    },
  }
}

/**
 * Export the live board the way a `.tldr` save would, reparse it against a fresh,
 * unconfigured stock schema (createTLSchema() — no shapeUtils, no components, no
 * theme overrides beyond whatever the board itself carries as data), mount that
 * store in a second hidden <Tldraw>, and diff what each side actually paints:
 * whole board first, then every shape stock tldraw can also render, ranked by
 * divergence. A parse rejection is reported as the loudest possible row and
 * nothing else runs.
 */
export async function runStockCheck(editor: Editor): Promise<StockCheckResult> {
  const tldrJson = await serializeTldrawJson(editor)

  const parsed = parseTldrawJsonFile({ json: tldrJson, schema: createTLSchema() })
  if (!parsed.ok) {
    return { ok: false, reason: describeParseError(parsed.error), detail: parsed.error }
  }

  const viewport = editor.getViewportScreenBounds()
  const hidden = await mountHiddenStockEditor(parsed.value, { w: viewport.w, h: viewport.h })

  try {
    // WHY copy the camera even though every toImage() call below passes an
    // explicit `bounds`: toImage renders shapes directly, not the viewport, so
    // this has no effect on the images diffed — it's here because the spec asks
    // for it, on the theory that a future export mode (or a stock default that
    // reads the camera, e.g. dark-mode-follows-system heuristics) could depend
    // on it, and matching costs nothing.
    hidden.editor.setCamera(editor.getCamera())

    const labShapeUtilKeys = Object.keys(editor.shapeUtils).sort()
    const stockShapeUtilKeys = Object.keys(hidden.editor.shapeUtils).sort()

    const labIds = new Set(editor.getCurrentPageShapeIds())
    const stockIds = new Set(hidden.editor.getCurrentPageShapeIds())

    const unpaired: UnpairedShapeRow[] = []
    for (const id of labIds) {
      if (!stockIds.has(id)) unpaired.push({ id, type: editor.getShape(id)?.type ?? '?', side: 'lab-only' })
    }
    for (const id of stockIds) {
      if (!labIds.has(id)) unpaired.push({ id, type: hidden.editor.getShape(id)?.type ?? '?', side: 'stock-only' })
    }

    // WHY the same explicit Box on both toImage calls: toImage's own auto-fit
    // crops each side to ITS OWN visible content, which would silently defeat
    // the comparison the moment the two sides disagree about what's visible —
    // exactly the divergence this report exists to catch.
    const pageBounds = editor.getCurrentPageBounds()
    const wholeBounds = pageBounds ? pageBounds.clone().expandBy(16) : new Box(0, 0, viewport.w, viewport.h)

    const [labWhole, stockWhole] = await Promise.all([
      editor.toImage(Array.from(labIds), {
        bounds: wholeBounds.clone(), scale: 1, pixelRatio: 1, background: true, padding: 0, format: 'png',
      }),
      hidden.editor.toImage(Array.from(stockIds), {
        bounds: wholeBounds.clone(), scale: 1, pixelRatio: 1, background: true, padding: 0, format: 'png',
      }),
    ])
    const wholeBoard = await diffImages(labWhole.blob, stockWhole.blob)

    const pairedIds = Array.from(labIds).filter((id) => stockIds.has(id))
    const shapes: ShapeRow[] = []
    for (const id of pairedIds) {
      const shapeBounds = editor.getShapePageBounds(id)
      if (!shapeBounds) continue
      const cropBounds = shapeBounds.clone().expandBy(8)
      const [labShape, stockShape] = await Promise.all([
        editor.toImage([id], {
          bounds: cropBounds.clone(), scale: 1, pixelRatio: 1, background: true, padding: 0, format: 'png',
        }),
        hidden.editor.toImage([id], {
          bounds: cropBounds.clone(), scale: 1, pixelRatio: 1, background: true, padding: 0, format: 'png',
        }),
      ])
      const diffed = await diffImages(labShape.blob, stockShape.blob)
      shapes.push({ id, type: editor.getShape(id)?.type ?? '?', lab: diffed.lab, stock: diffed.stock, diff: diffed.diff })
    }
    shapes.sort((a, b) => b.diff.pct - a.diff.pct)

    return { ok: true, tldrJson, labShapeUtilKeys, stockShapeUtilKeys, wholeBoard, shapes, unpaired, threshold: PIXELMATCH_THRESHOLD }
  } finally {
    hidden.dispose()
  }
}

/** Revokes every object URL a StockCheckOk result created. Call once the report closes. */
export function releaseStockCheckResult(result: StockCheckResult | null): void {
  if (!result || !result.ok) return
  const urls = [
    result.wholeBoard.lab.url, result.wholeBoard.stock.url, result.wholeBoard.diff.url,
    ...result.shapes.flatMap((row) => [row.lab.url, row.stock.url, row.diff.url]),
  ]
  for (const url of urls) URL.revokeObjectURL(url)
}

/** A data: URL of the exact bytes a `.tldr` export would carry — the download link is a
 * convenience, not the proof (see the button's WHY comment for the sandbox caveat). */
export function tldrDownloadUrl(tldrJson: string): string {
  return `data:application/vnd.tldraw+json;charset=utf-8,${encodeURIComponent(tldrJson)}`
}
