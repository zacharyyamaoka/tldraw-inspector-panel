# Log

## 2026-09-07 — Onlook desktop as an input donor: read, measured, closed

Onlook's right-hand styles inspector **is** public — it is the Electron desktop
app, not the hosted product an earlier reconnaissance claimed. It lives at
`github.com/onlook-dev/desktop` (HEAD `a3685a49` = v0.2.31, 2025-07-17), cloned
here to `/home/bam/onlook-desktop`; in `onlook-dev/onlook` it is any tag up to
**v0.2.29** or sha `f05a4640`, deleted by `f7a8060c` "Migrate to web version
(#1837)" on 2025-05-14. The panel is `apps/studio/src/routes/editor/EditPanel/`
(22 files / 3,856 lines in `StylesTab/`), driven by
`lib/editor/styles/group.ts` — 292 lines declaring 47 `SingleStyleImpl` fields
in 7 `CompoundStyleImpl` clusters over 4 groups.

The plan report proposed mining four of its inputs. Read against what M2
already landed, **none of them transfers**, and two are places this lab is
ahead. Recorded so nobody re-opens it:

| Onlook desktop | What this lab already has | Verdict |
|---|---|---|
| `single/NumberUnitInput.tsx` (167) — value + a unit `<select>` | `src/inspector/ScrubNumber.tsx` (269) on Base UI `NumberField`: expression parser, `value: number \| null` as a real mixed state, alt/shift changing granularity mid-drag, `onValueCommitted` as the one-gesture-one-undo seam, Pointer Lock with teleport. Every numeric field declares its own `unit` (`px`, `°`, `%`) in the model. | **Ahead** — porting would regress |
| `single/ColorInput/` — hand-rolled picker (112) + row (238) + brand palette + image + popover | `ColorRow` in `Inspector.tsx`: Base UI `Popover` + `react-colorful`, plus a text field that accepts any CSS colour the engine takes (`rgba()`, `color-mix()`), where an emptied field *clears the override* instead of storing `""` | **Ahead** |
| `single/AutoLayoutInput.tsx` (162) — Fill / Hug / Fixed / Rel | tldraw has no auto-layout; `LayoutMode` is a CSS box-model idea. The nearest props are text `autoSize` and geo `growY`, neither of which is a sizing *mode* a user picks | **Does not apply** |
| `compound/NestedInputs.tsx` (135) — one head value expanding to four sides | No tldraw prop has per-side parts: no margin, no padding, a single `cornerRadius` rather than four. Its other half — the 2-up grid — is already the model's `paired: true` + shared `caption` (Position, Dimensions, Route) | **Does not apply** |
| `compound/DisplayInput.tsx` (123) — head *value* decides which children render, via a hand-written `DisplayTypeMap` | Already declarative and per-field: `applies(shape)` reads sibling prop values — `bend` applies when `kind !== 'elbow'`, `elbowMidPoint` when `kind === 'elbow'` (`inspectorModel.ts:885`, `:910`) | **Solved, better factored** |

Two things worth carrying out of the read:

- `CompoundStyleImpl` is 14 lines — `{key, head, children}` plus one predicate —
  and that predicate is **inverted relative to its name**:
  `isHeadSameAsChildren` returns `!childrenValues.every(v => v === headValue)`,
  i.e. `true` when they *differ*. If a compound row is ever wanted here, do not
  carry the name. The one speculative tldraw use is `arrowheadStart` /
  `arrowheadEnd` under a single "Arrowheads" head — currently unexposed, and in
  M3's scope, not M2's.
- The *web* app's top `editor-bar` (56 files, 5,800 lines) is still the right
  donor for a contextual top bar. That is a different feature and not this lab.

**How the first read went wrong, so it does not repeat:** the reconnaissance
clone was `--depth 1`. A `git log -S` sweep over a single commit reports "never
happened" for everything, which is exactly how the panel was declared to have
never existed. The full clone is 1,640 commits and 169 tags. Never reconnoitre a
repository's history from a shallow clone.

## 2026-09-07 — M2 view audit: five required fixes, all real bugs

An independent audit of `tests/out/inspector-dock-{light,dark,stock-route}.png`
rejected the M2 view on five points. All five turned out to be real defects,
not taste calls — `npm run check` (tsc, 97 vitest, the pixel gate, 23/23
`test:inspector`) is green with the fixes in.

**1. Section headers.** The Collapsible trigger was a raw `<button>` with no
background/border/padding reset. This lab's `app.css` deliberately imports
Tailwind WITHOUT preflight (see its own top-of-file WHY), so nothing strips
the browser's own button chrome — measured before the fix:
`background-color: rgb(239, 239, 239)`, `border: 2px outset rgb(0, 0, 0)`,
`padding: 1px 6px`, all straight from Chromium's UA stylesheet. The label's
`text-foreground` colour was correct throughout (measured `rgb(249, 250,
251)` in dark mode, matching `--foreground` exactly) — the bug was purely the
untouched grey fill making light text on light grey unreadable. Fixed with an
explicit reset (`border-0 bg-transparent p-0 appearance-none`) on the one raw
button left, sentence-case labels (removed a stray `uppercase` class — the
model's `GROUP_LABELS` were already "Layer"/"Shape"/"Fill" etc., never
actually uppercase), a `lucide-react` `ChevronRight` that rotates via Base
UI's `data-panel-open` attribute, `hover:bg-accent`, and a `Separator`
between groups (not after the last one). Journey measures real contrast:
**light 20.47:1, dark 15.52:1** (both ≥ 4.5:1), read from `getComputedStyle`
on the header button and the dock's own background, converted with a small
WCAG relative-luminance helper (`parseRgb`/`relativeLuminance`/
`contrastRatio` in `tests/inspector_smoke.mjs`, no dependency).

**2. Segments clipping.** `SegmentGroup`'s `ToggleGroup` had no `flex-wrap`,
so a 6-option row (Fill style: none/semi/solid/pattern/fill/lined-fill) ran
off the 280px dock. Fixed with `flex-wrap` on the group and `min-w-fit
flex-1` on each item — chosen over a fixed-column grid because the model
draws rows from 3 options (Align) to 6 (Fill style), and one column count
cannot fit both without a ragged or squeezed grid. Journey asserts every
`inspector-segment-*`/`inspector-tile-*` element's `getBoundingClientRect()`
stays within the dock's own rect on the rectangle — 0 clipped.

**3. Tile ink.** Geometry tiles painted black glyphs in dark mode. Root
cause: a `<button>` does not inherit `color` from its DOM ancestor the way
ordinary elements do (the UA stylesheet gives it its own `ButtonText` system
colour) — measured `rgb(0, 0, 0)` on an unclassed tile in dark mode, against
`--foreground: #f9fafb`. Fixed with an explicit `text-foreground` on
`TileGroup`'s `ToggleGroupItem`, letting the SVG's existing `fill-current`/
`stroke-current` (`Glyph`) resolve it. No separate pressed colour — shadcn's
own `Toggle` only changes the background (`data-[state=on]:bg-muted`) and
leaves text colour alone, so matching that is "whatever the shadcn toggle
already does," not a third scheme. Journey confirms an unpressed tile's
`color` equals `--foreground` in both themes.

**4. The stock route gets its own entry.** `bare.html?inspector=1` mounted
the Inspector with zero stylesheet — raw unstyled inputs, a full-width black
SVG triangle, `Times New Roman` throughout. Root cause of *that* rendering
(distinct from bugs 1-3): `bare.html` never loads `app.css`, so a
chrome-dependent component has nothing to draw itself with — mounting the
Inspector there was never going to look right, and doing it via a query
switch also meant `bare.html`, the pixel gate's control, could silently gain
chrome behind a flag nobody audits by default. Fixed structurally: `bare.tsx`
reverted byte-for-byte to its M1 state (no switch, no Board props at all);
new `stock.html` → `src/stock.tsx` loads the full chrome stack AND the
Inspector but not `CONFIGURED_SHAPE_UTILS` — the actual "otherwise-stock
canvas" the paint-withholding claim needs to be honestly tested against.
`src/board/mount.tsx`'s `Board` no longer imports `Inspector`/
`CONFIGURED_SHAPE_UTILS` or picks between them on a boolean at all; it takes
plain `components`/`shapeUtils` pass-through props matching `<Tldraw>`'s own
prop names, and every entry (`App.tsx`, `stock.tsx`, `bare.tsx`) states its
own chrome in full. `stock.html` added to `vite.config.ts`'s rollup inputs.
`tests/inspector_smoke.mjs`'s stock-route checks now navigate to
`stock.html?seed=stock`.

**5. Journeys own their output directories.** `tests/stock_pixels.mjs`'s
`rm(outDir, {recursive: true})` targeted the shared `tests/out/`, so running
it after `tests/inspector_smoke.mjs` deleted the Inspector's own captures —
exactly what happened to produce the audited screenshots being stale by the
time they were reviewed a second time. Fixed: `stock_pixels.mjs` writes to
`tests/out/stock_pixels/`, `inspector_smoke.mjs` to
`tests/out/inspector_smoke/`, each `rm`+`mkdir`s only its own subdirectory.
Verified by running both back-to-back in each order and confirming neither's
captures vanish. Convention documented in README's "Test it" section.

**Also (small):** the header sits above `ScrollArea` as a separate flex item
(`flex h-full flex-col`), never `position: sticky` inside the scrolling
content, so there was nothing to cover the first group on scroll — confirmed
by inspection, no code change needed. And a real, separate bug the "add
font-sans" request surfaced: the dock itself had **no** font-family set
anywhere — measured `Times New Roman` on `[data-testid="inspector"]` before
the fix, because M1 deliberately drops shadcn's `@layer base { html { @apply
font-sans } }` block (protecting the pixel gate) and M2 never added `font-
sans` anywhere in its place. Fixed with `font-sans` on the dock root, which
fixes every actual DOM descendant of it. That does NOT reach a `Popover`'s
content — Base UI's `PopoverPortal` appends to `<body>` by default (its own
`.d.ts`: "By default, the portal element is appended to `<body>`"), a
sibling of `#root` rather than a descendant of the dock, confirmed by walking
`parentElement` from the popup to `<body>` directly. Setting `body`'s font
globally was rejected — that is exactly the mechanism M1's own layers-only
architecture exists to avoid (a global font change cascading into
`.tl-container` and shifting canvas text geometry). Instead, `app.css` gets
one narrowly-scoped rule targeting the portal's own `data-slot` attribute
(`[data-slot="popover-content"], [data-slot="tooltip-content"] { font-family:
var(--font-sans) }`), which can never match anything present during
`tests/stock_pixels.mjs`'s captures. Journey opens the stroke-colour popover
and asserts its computed `font-family` contains "Geist" (not merely "not
serif" — the correct stack's own generic fallback, `sans-serif`, contains the
literal substring "serif").

**Screenshots** (all in `tests/out/inspector_smoke/`, full dock height —
`captureFullDock()` temporarily grows the viewport to fit every group
expanded, screenshots, then restores it):
`inspector-dock-light.png`, `inspector-dock-dark.png`,
`inspector-dock-stock-route.png`, `inspector-color-popover-open.png` (full
page, light theme, stroke-colour popover open).

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
