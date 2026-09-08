# Log

## 2026-09-07 — M2: the panel on the seam, with the ported model

Landed the M2 brief: `components={{ StylePanel: Inspector }}` on the chrome
entry, the ported model/overrides/ScrubNumber/tests from SystemSketch
(`77907974`), a from-scratch shadcn/Base UI view over that model, the paint
seam + rounded rect reproduced in `src/inspector/configuredUtils.ts`, the
pixel gate extended with a DOM-read dock mask, and a 17-check real-browser
journey (`tests/inspector_smoke.mjs`) covering both routes. `npm run check`
is green: `tsc -b`, 97 vitest tests (71 new), the pixel gate (0 / 0 / 763
changed px outside a ~311–329k px² masked dock — see the table `test:pixels`
prints), and `test:inspector` (17/17).

**Field count.** `inspectorModel.ts` carries **50** `FieldSpec` entries — the
donor's 51 minus `arrowRouting` (Slant), SystemSketch's own arrow util and
not a stock tldraw capability. Confirmed by counting the file's own
`paintField`/`styleField`/`propField` calls (34) plus inline `FieldSpec`
literals (16). A default rectangle on the chrome route offers every row its
`applies` predicate admits, including the seven `paint` rows
(`fillOpacity`, exact stroke colour/width/roundness, `labelColor`,
typeface/size/line-height/padding, `textOutline`, `cornerRadius`); the same
rectangle on the stock route (`bare.html?inspector=1`) offers every style/prop
row and **none** of those seven — `paintReaches(shape, editor)` correctly
reads `false` there, because `configuredUtils.ts`'s
`CONFIGURED_SHAPE_UTILS` was never registered on that canvas.

**Ported verbatim vs. rewritten.**

| File | Verbatim from `77907974` | Rewritten here |
|---|---|---|
| `src/inspector/inspectorModel.ts` | Yes, two edits (inline `sharedValueAcross`, drop `arrowRouting` + its imports) | — |
| `src/inspector/overrides.ts` | Yes, byte-for-byte | — |
| `src/inspector/ScrubNumber.tsx` | Logic (parser, `quantize`, scrub-origin, `ENGINE_REASONS`) | Skin: Tailwind classes + shadcn `InputGroup`/`InputGroupAddon` in place of `primitive-inspector.css` classes |
| `src/inspector/glyphs.ts` | Yes, byte-for-byte (`primitiveGlyphs.ts`) | — |
| `src/inspector/inspectorModel.test.ts`, `overrides.test.ts`, `ScrubNumber.test.ts` | Yes, import paths only (plus one `erasableSyntaxOnly` fix, below) | — |
| `src/inspector/configuredUtils.ts` | No — reproduces the *paint seam* and the *rounded rect* from `stockPrimitiveVisuals.ts`/`excalidrawInterop.ts`/`systemSketchArrow.tsx` | Everything else in those three files (Excalidraw import fidelity, Block "detached composite" paint, async-edge dash cadence, the slanted arrow) is SystemSketch/Block-specific and left out |
| `src/inspector/Inspector.tsx` | No — `PrimitiveInspector.tsx` is reference-only per the brief | Whole view, shadcn/Base UI parts per §5 of the plan |

**The `react-colorful` decision.** `HexAlphaColorPicker` (MIT, ~3 kB) is the
only new dependency. The plan's §5 control-mapping table flagged Kibo's
colour picker as installing but mis-typing against Base UI's `Select` and
dragging in `radix-ui` — using the picker library underneath it directly,
as recommended, meant `react-colorful` rather than Kibo's wrapper.

**Two real bugs the journey caught, not inferred:**

1. `ScrubNumber.tsx`'s hand-styled `NumberField.Input` had no `min-w-0`. A
   native `<input>`'s intrinsic width and a flex item's default `min-width:
   auto` mean it refused to shrink inside a narrow paired grid cell — its
   overflow painted past the `InputGroup`'s own border, invisibly (no
   distinguishing background), and sat on top of the "×" clear button drawn
   immediately after it in the DOM. `elementFromPoint` at the clear button's
   own centre returned the `<input>`. shadcn's own `Input` sets `min-w-0` on
   every field for the same reason; this one is hand-styled and needed its
   own copy. Caught by `clearing fillOpacity restores the original fill`
   silently doing nothing.
2. **The §2.2 class recurred, one layer up.** The ported model already
   fences every write to `shapeIds`, but the *view*'s `onChange`/`onClear`
   closures were rebuilt fresh on every render from the live `model` — and
   `useValue`'s external-store subscription (`tldraw`'s own reactive store,
   not React's synthetic event system) is not batched with the native
   `pointerdown` that calls `editor.select(...)`. Clicking a second shape
   re-rendered the panel with the *new* selection's model synchronously,
   **before** the browser's own focus-shift dispatched `blur` on the
   still-focused field — so the blur committed through a closure that had
   already swapped to the wrong shape. `InspectorPanel` now freezes its
   model reference in a ref while focus is inside the dock **and** the
   selection is about to change, adopting a fresh reading only once nothing
   here is focused (or the selection is unchanged, so a value that just
   committed on Enter without blurring still shows immediately). Caught by
   `opacity commits to the shape the row was showing (A), not the live
   selection`, which failed with A untouched and B silently taking the
   value — the exact defect shape the donor's own work order describes.

**Deviations, and why:**

- **Kept the donor's tab indentation in the three verbatim-ported files**
  (`inspectorModel.ts`, `overrides.ts`, `glyphs.ts`), against this repo's own
  2-space convention. The brief said "exactly two edits" to the model file
  and "byte-for-byte" for the others; a repo-wide reformat was out of scope
  and would have made future re-diffs against the donor harder to read, not
  easier.
- **`inspectorModel.test.ts`'s `FakePaintUtil` fixture** used the donor's
  constructor-parameter shorthand (`constructor(private readonly shape:
  FakeShape)`), which this repo's `tsconfig` (`erasableSyntaxOnly`, TS 6)
  forbids as non-erasable syntax. Spelled out as a field + plain assignment;
  behaviour unchanged.
- **`defaultGeoFillColor` in `configuredUtils.ts`** reproduces stock
  tldraw's own geo fill formula (`GeoShapeUtil.tsx`'s
  `getDefaultDisplayValues`, `getColorValue(colors, color,
  DEFAULT_FILL_COLOR_NAMES[fill])`) rather than the donor's
  `appearance/fillPaint.ts`. That donor file is a FigJam-flavoured
  *reinterpretation* of solid/semi fill (a wash, not tldraw's own pale tint)
  — a taste choice, not part of the seam — so it was left out per "keep
  only what makes the paint seam and the rounded rect work on stock
  tldraw." Without *some* resolved default, though, a `fillOpacity`-only
  override (no `fillColor` set) had nothing to composite its alpha onto and
  silently painted nothing — so this one small, generic, non-taste helper
  was added to give it real stock paint to composite over.
- **The `systemsketch-primitive-inspector` testid was renamed to
  `inspector-panel`** per the M2 brief's explicit instruction, on both the
  view and the (from-scratch, since no donor journey exists for this repo's
  own routes) `tests/inspector_smoke.mjs`.
- **No donor test needed a SystemSketch-only import to skip.** Both ported
  unit-test files (`inspectorModel.test.ts`, `ScrubNumber.test.ts`) and
  `overrides.test.ts` use only a hand-built fixture editor and pure
  functions; none referenced `SystemSketchArrowShapeUtil`, Block, or
  Excalidraw interop, so nothing was dropped from them.

## 2026-09-07 — M1: scaffold + pixel gate

Landed the whole M1 brief: Vite/React 19/TypeScript scaffold, tldraw@5.3.2 +
@tldraw/assets@5.3.2 pinned, shadcn on the Base UI track (`-b base -p nova`)
with all 16 requested primitives (+ 6 transitive deps), Tailwind v4 imported
as layers-only in `src/styles/app.css`, a `.tl-container` token bridge onto
tldraw's own `--tl-*` variables (guarded by `tests/theme_bridge.test.ts`), a
two-entry board (`index.html` chrome / `bare.html` control) sharing
`src/board/{seed,mount}`, and `tests/stock_pixels.mjs` — the byte-exact pixel
gate. `npm run check` is green: `tsc -b`, 13 vitest checks, and the pixel
gate (0 / 0 / 1486 changed px — see README's Test it section).

### Deviations from the brief, and why

**Dropped shadcn's own generated `@layer base { ... }` block from app.css.**
The brief's step 4 describes what `shadcn init` writes as `@theme inline` +
`:root`/`.dark` token blocks, based on an older shadcn version's output
(the probe in `docs/assets/tldraw-styling-lab-probe/` measured a version
without this). Today's `shadcn@4.21.0` (`nova` preset) also writes:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/geist";
...
@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; }
  html { @apply font-sans; }
}
```

The three extra `@import`s are harmless — `tw-animate-css` and
`shadcn/tailwind.css` are entirely `@utility`/`@theme inline` (Tailwind v4's
opt-in mechanisms; nothing applies globally), and `@fontsource-variable/geist`
is inert `@font-face` declarations no selector references once the block
below is gone. Kept all three.

The `@layer base` block is not harmless: it is a second, shadcn-authored
preflight. `html { @apply font-sans }` resets `html`'s font-family exactly
the way Tailwind's own preflight does — and `.tl-container` sets no
font-family of its own, so that reset cascades straight into the canvas,
reintroducing the shape-geometry drift the layers-only import exists to
prevent (see `docs/assets/tldraw-styling-lab-probe/RESULT.md` §3-4 in the
systemsketch repo for the original measurement). The brief's enumerated list
of "content to move" doesn't mention this block because it didn't exist in
the version that generated the brief; dropping it is the conservative reading
that keeps the actual measured invariant — 0 changed canvas pixels — intact.
Left a WHY comment at the point of omission in `src/styles/app.css`.

**Mirrored the `@/*` path alias into the root `tsconfig.json`, not just
`tsconfig.app.json`.** shadcn's CLI resolves the alias via the
`tsconfig-paths` package's `loadConfig()`, which reads the *root* tsconfig
file directly — it does not follow TypeScript project `references` into
`tsconfig.app.json`, where the Vite scaffold actually keeps
`compilerOptions`. Without the same paths-only, no-`baseUrl` alias also in
`tsconfig.json`, `shadcn add` silently wrote every component to a literal
`./@/components/...` directory instead of `./src/components/...` (confirmed
by direct `require('tsconfig-paths').loadConfig()` before/after). Root
`tsconfig.json` still carries `files: []`, so this changes nothing about what
`tsc -b` actually type-checks.

### Two bugs the pixel gate itself needed a fix for

Both in `tests/stock_pixels.mjs`, both caught by first-run failures rather
than assumed away — see the commit for detail: `captureVariant()` was
navigating to the CDP devtools port instead of the preview server port
(20s timeout, every time), and `editor.select(id)`'s return value (`this`,
circular) blew up CDP's `returnByValue` serialization until discarded with
`void`. Also switched the preview server spawn from `npx vite preview` to
the local `.bin/vite` directly — `npx`'s wrapper process didn't reliably
forward `SIGKILL` to its child, leaving an orphaned server (and, once,
a stdout pipe held open across the parent's exit).

### A fourth fix: `npm run dev` crashed outright

Not caught by `npm run check` (which never runs the dev server) — `npm run
dev` itself failed on first real use. Vite 8's dependency pre-bundler
(rolldown-based) cannot resolve the `?url`-suffixed imports inside
`@tldraw/assets/imports.vite.js` (`import xJsonUrl from
'./translations/x.json?url'` for every locale) even though the files are on
disk — 53 `UNLOADABLE_DEPENDENCY` errors, dev server exits. `vite build`
never hits this path (production bundling resolves the same imports
correctly), which is why the pixel gate — which only ever runs `vite build`
— didn't surface it. Fixed with `optimizeDeps.exclude: ['@tldraw/assets']`
in `vite.config.ts`, tldraw's own documented workaround for self-hosted
assets under Vite. Verified both by a plain `curl` 200 and a full headless
CDP navigation to `?seed=stock` confirming `window.__lab.ready` on the dev
server itself, not just the built app.

### Left for later milestones

- The Figma-shaped inspector itself (M2+) — this milestone only proves the
  ground it will stand on is pixel-safe.
- `docs/log.md`'s "model decides, view draws" and "consumed by registry"
  rules (README) — named now, implemented later.
- `mount-*.js` is a single ~1.9 MB chunk (tldraw); `vite build` warns about
  it. Not addressed here — code-splitting is a product decision for when
  there's a second real entry point's worth of code to split against.
