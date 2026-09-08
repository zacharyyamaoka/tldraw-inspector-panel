import {
  compressLegacySegments,
  createShapeId,
  getIndices,
  toRichText,
  type Editor,
  type TLShapeId,
} from 'tldraw'

const [lineIndexA, lineIndexB] = getIndices(2)

// WHY fixed ids: the pixel gate (tests/stock_pixels.mjs) diffs bare.html against
// index.html byte-for-byte inside the canvas, so both entries must produce
// byte-identical shape records — ported verbatim from the probe's App.tsx (see
// docs/assets/tldraw-styling-lab-probe/probe/src/App.tsx in the systemsketch repo).
export const seedShapeIds = {
  rect: createShapeId('probe-rect'),
  ellipse: createShapeId('probe-ellipse'),
  arrow: createShapeId('probe-arrow'),
  text: createShapeId('probe-text'),
  note: createShapeId('probe-note'),
  draw: createShapeId('probe-draw'),
  line: createShapeId('probe-line'),
  frame: createShapeId('probe-frame'),
  highlight: createShapeId('probe-highlight'),
} satisfies Record<string, TLShapeId>

/** Seeds one of every shape kind the probe measured, at a fixed camera. */
export function seedStockBoard(editor: Editor) {
  const ids = seedShapeIds
  editor.createShapes([
    {
      id: ids.frame,
      type: 'frame',
      x: 20,
      y: 20,
      props: { w: 300, h: 220, name: 'Frame', color: 'black' },
    },
    {
      id: ids.rect,
      type: 'geo',
      x: 360,
      y: 40,
      props: {
        geo: 'rectangle',
        w: 160,
        h: 100,
        fill: 'solid',
        dash: 'draw',
        size: 'm',
        color: 'blue',
        richText: toRichText('Label'),
      },
    },
    {
      id: ids.ellipse,
      type: 'geo',
      x: 560,
      y: 40,
      props: {
        geo: 'ellipse',
        w: 140,
        h: 100,
        fill: 'pattern',
        dash: 'solid',
        size: 'm',
        color: 'green',
      },
    },
    {
      id: ids.arrow,
      type: 'arrow',
      x: 360,
      y: 180,
      props: {
        start: { x: 0, y: 0 },
        end: { x: 160, y: 60 },
        richText: toRichText('arrow'),
      },
    },
    {
      id: ids.text,
      type: 'text',
      x: 560,
      y: 180,
      props: { richText: toRichText('Hello'), w: 140, autoSize: false },
    },
    {
      id: ids.note,
      type: 'note',
      x: 40,
      y: 280,
      props: { richText: toRichText('note'), color: 'yellow' },
    },
    {
      id: ids.draw,
      type: 'draw',
      x: 240,
      y: 280,
      props: {
        segments: compressLegacySegments([
          {
            type: 'free',
            points: [
              { x: 0, y: 0, z: 0.5 },
              { x: 20, y: 40, z: 0.5 },
              { x: 45, y: 10, z: 0.5 },
              { x: 70, y: 50, z: 0.5 },
              { x: 100, y: 0, z: 0.5 },
            ],
          },
        ]),
        isComplete: true,
        isClosed: false,
        color: 'red',
        fill: 'none',
        dash: 'draw',
        size: 'm',
      },
    },
    {
      id: ids.line,
      type: 'line',
      x: 360,
      y: 300,
      props: {
        color: 'black',
        dash: 'solid',
        size: 'm',
        spline: 'line',
        points: {
          a1: { id: 'a1', index: lineIndexA, x: 0, y: 0 },
          a2: { id: 'a2', index: lineIndexB, x: 140, y: 60 },
        },
      },
    },
    {
      id: ids.highlight,
      type: 'highlight',
      x: 560,
      y: 300,
      props: {
        color: 'yellow',
        size: 'm',
        isComplete: true,
        isPen: false,
        segments: compressLegacySegments([
          {
            type: 'straight',
            points: [
              { x: 0, y: 0, z: 0.5 },
              { x: 120, y: 40, z: 0.5 },
            ],
          },
        ]),
      },
    },
  ])

  editor.selectNone()
  editor.setCamera({ x: 0, y: 0, z: 1 })
  editor.updateInstanceState({ isDebugMode: false })
}
