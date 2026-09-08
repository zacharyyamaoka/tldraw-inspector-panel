# Log

## 2026-09-07 — M3: the rest of layer 2, and the Theme tab

Landed the M3 brief: a re-measured display-value census
(`src/inspector/displayValueCensus.ts` + `.test.ts`, parsing
`node_modules/tldraw` at test time), nine new `FieldSpec` rows, and a Theme
tab (`src/inspector/ThemePanel.tsx`) over `editor.getThemes()`/`updateThemes`.
`npm run check` is green: `tsc -b`, 113 vitest tests (84 baseline + 29 new: 8
added to `inspectorModel.test.ts`, 13 in the new `displayValueCensus.test.ts`,
8 in the new `themeColorDerivation.test.ts`; the frame-colour test was
rewritten in place, not added), the pixel gate (0/0/763, unchanged shape),
`test:inspector` (33/33, 10 new) and `test:theme` (12/12, all new).

**The census: 55 reached / 17 documented / 72 total**, at pinned tldraw
5.3.2 — printed by `displayValueCensus.test.ts`'s own totals check, not
hand-counted. Not the donor's 42/31/73: a different tldraw version, this
milestone's own new rows, and one real bug the sweep caught (below). Full
per-shape breakdown and every documented-unreached reason lives in
`displayValueCensus.ts`'s own `DOCUMENTED` map and README's "Everything the
canvas can render" section — not duplicated here.

**Nine new rows**, taking `inspectorModel.ts` from 50 to 59 `FieldSpec`
entries: `patternFillFallbackColor` (geo/draw/arrow, gated on `fill ===
'pattern'`), `labelEdgeMargin`/`labelMinWidth` (geo only), the frame Colour
swatch reaching real paint (via a new `styleReaches` helper —
`editor.styleProps[type]?.has(style)` — replacing a hard-coded frame
exclusion, now that `configuredUtils.ts` calls
`FrameShapeUtil.configure({ showColors: true })`), `url` (six record types),
`growY` (geo/note, the first `disabled` read-only row — new support threaded
`FieldSpec` → `InspectorControl` → `ScrubNumber`'s own `disabled` prop onto
Base UI's `NumberField.Root`), `isPen` and `scaleX`/`scaleY` (draw/highlight —
their actual resize mechanism, since neither shape has `w`/`h`), and
`altText` (image/video, its own new "Media" group).

**A real bug fixed in passing**: `arrowOverrideDisplayValues` never mapped
`fillColor` at all, even though the `fillColor` paint row already applied to
arrows — it wrote real `meta`, lit the overridden dot, and painted nothing,
silently, since M2. Found while wiring `patternFillFallbackColor` onto the
same function; fixed by generalizing `configuredUtils.ts`'s
`defaultGeoFillColor` into `defaultFillColorFor` and sharing it with arrow,
the same correction `geoOverrideDisplayValues`'s own `fillOpacity`-with-no-
`fillColor` case already needed.

**Deliberately NOT wired**: `noteBorderWidth`/`noteBorderColor`, against the
brief's literal list. Re-checked against 5.3.2's own `NoteShapeUtil.tsx` —
`hideShadows` (only true when zoomed far out) still gates the ring — a row
would be exactly the "control that does nothing is a lie" case
`inspectorModel.ts`'s own "NOT OFFERED: a sticky's ring" comment already
names. Documented unreached in the census instead of wired inert.

**The census-vs-panel-row-count check, reinterpreted**: the brief asked for
the census total to match "what the panel offers on a rectangle+frame
selection." They measure different things by construction — the census
counts distinct tldraw *display-value keys*, a live selection's row count
includes every `x`/`y`/style/prop row too. `tests/inspector_smoke.mjs` prints
both numbers (55/17/72 vs. 185 testid'd elements on a rect+frame selection)
side by side as an FYI and asserts the two shapes' own rows appear together,
rather than forcing a numeric equality that would either be coincidental or
require distorting one of the two definitions to match the other.

**The Theme tab** (`src/inspector/ThemePanel.tsx`) — a second shadcn `Tabs`
tab beside Inspect, over `editor.getThemes()`/`updateThemes`/`setCurrentTheme`
(`TLTheme { fontSize, lineHeight, strokeWidth, fonts, colors: { light, dark }
}`, 13 named colours × 14 roles each). Scalars as `ScrubNumber` rows; each
named colour its own collapsible with a light/dark toggle, a 14-swatch
preview, and colour rows grouped Fill/Frame/Note/Highlight. Persisted to
`localStorage` (`src/inspector/themeStorage.ts`) — `Board` now takes `themes`
as a third pass-through prop exactly like `components`/`shapeUtils`, and
`App.tsx` is the one entry that reads the persisted value on a non-seeded
load; `stock.tsx` deliberately never does (an otherwise-completely-stock
canvas needs its palette to actually be stock too), `bare.tsx` never touches
it. "Reset to tldraw defaults" (`resolveThemes()`) is the only way back,
because `ThemeManager.ts` keeps themes on a plain `Atom` outside
`UndoManager` — the tab's header says so.

**Add colour**: `src/inspector/themeColorDerivation.ts`'s
`deriveThemeColorRoles` derives all 14 `TLDefaultColor` roles from one hex —
`solid`/`fill` are the hex itself, every wash role mixes toward white (light)
or black (dark) at a fixed ratio, the two text-on-a-wash roles mix the other
way, `highlightSrgb`/`highlightP3` share the raw hex (no P3 conversion
available here). A small, documented formula, not a reconstruction of
tldraw's own hand-tuned palette. Registers into both the live theme AND,
immediately, `DefaultColorStyle`/`DefaultLabelColorStyle` via a manual
`registerColorsFromThemes(editor.getThemes())` call — the automatic one only
fires from `TldrawEditor.tsx`'s own render, reading the `themes` REACT PROP,
which an imperative `editor.updateThemes` call never touches. Skipping this
left the Inspect tab's swatch rows blind to a colour just added, for the rest
of the session — caught by `tests/theme_smoke.mjs` before it shipped that way.

**The layer-3 floor, measured** (`tests/theme_smoke.mjs`): paint a shape with
a custom colour, persist it, reload the same non-seeded document on
`stock.html` (which never registers the custom name). At 5.3.2 the mount
**never reaches `window.__lab.ready`** — the strict `DefaultColorStyle`
validator rejects the persisted enum value outright, no fallback
substitution, no console error either. Printed in the journey's own output
rather than assumed; this is the honest floor of "a board painted with this
app's own theme, opened where the theme isn't installed."

**Deviations, and why:**

- `noteBorderWidth`/`noteBorderColor` — see above.
- The census-vs-row-count check — see above.
- `scaleX`/`scaleY` genuinely exist at 5.3.2 (on `draw` and `highlight`),
  against the brief's own expectation that they might not — verified
  directly against `TLDrawShape.ts`/`TLHighlightShape.ts` rather than
  assumed, and wired up since they're real, cheap, and were unreached.
- `ThemeColorField` (`ThemePanel.tsx`) is a deliberate ~30-line duplicate of
  `Inspector.tsx`'s `ColorRow`, not a shared abstraction: the two surfaces
  read genuinely different shapes (a selection's paint vs. one theme's own
  record) and a theme role never has `ColorRow`'s mixed/unset states: forcing
  both through one prop contract would have cost more than the duplication.
- `displayValueCensus.test.ts` needed `/// <reference types="node" />`
  (file-scoped, not added to `tsconfig.app.json`'s `types`) to read
  `node_modules` under `tsc -b` — the one file in `src/` that genuinely runs
  under Node rather than the browser.
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

## 2026-09-07 — M4: the stock-compatibility button

Built on `.worktrees/m4-compat` (branch `m4-compat`, based on M1 at 29b478d)
rather than on `main`, per this milestone's own instructions — a peer builder
is implementing M2 (the inspector) directly on `main` and touches
`src/board/mount.tsx`, `src/inspector/**`, `src/styles/app.css`,
`tests/stock_pixels.mjs` and `package.json`; this branch confines its edits to
`src/compat/**` (new), one line in `src/board/mount.tsx`, `tests/compat_smoke.mjs`
(new) and one `package.json` script line, plus this log and the README, to
stay out of the shared git index.

Landed the whole brief: "Stock check" button in tldraw's `components.SharePanel`
seam opening a shadcn `Sheet`; `serializeTldrawJson` → `parseTldrawJsonFile`
against a bare `createTLSchema()` → a hidden `<Tldraw>` mount
(`src/compat/hiddenStockMount.tsx`) with no shapeUtils/components beyond
tldraw's own defaults; whole-board and per-shape `toImage()` diffs decoded via
`createImageBitmap` + canvas (no `pngjs` — that stays a Node-only dependency
of `tests/stock_pixels.mjs`) and compared with the already-installed
`pixelmatch` at threshold 0.1 (see README's "Stock check" section for why
0.1, not the pixel gate's 0); rows ranked by divergence, whole board first,
unpaired shapes reported as their own always-rendered section, a rejected
parse as the loudest possible row one with nothing else running; a `.tldr`
download link as a stated convenience, not the proof. Journey:
`tests/compat_smoke.mjs` (`npm run test:compat`), 7/7 checks green.

### The button needs `pointer-events-auto` or it silently does nothing

First run of the journey hung on `waitFor(... stock-check-whole-board ...)`
with zero console errors and the button visibly present, in the right slot,
at the right coordinates. `document.elementFromPoint()` at the button's own
center returned `.tl-background` — the canvas, not the button.
`tldraw.css`'s `.tlui-layout` (the whole chrome overlay grid) is
`pointer-events: none` by design, so its own click-through to the canvas
never eats a real interaction; every stock tldraw control opts back in
individually (`.tlui-scrollable`, the toolbar buttons, etc. each set
`pointer-events: all`/`auto` themselves). `.tlui-share-zone` — the wrapper
`DefaultSharePanel` (and now `StockCheckButton`) renders into — sets no
pointer-events of its own, so it inherited `none` from the ancestor grid.
Fixed by adding `pointer-events-auto` to both the zone wrapper and the
`Button` itself in `src/compat/StockCheckButton.tsx`. Generalizes to any
future control mounted through a bare `components.*` override rather than
one of tldraw's own pre-wired slots — see the WHY comment at the fix.

### Interaction with the M1 pixel gate (not fixed here, by design)

`src/board/mount.tsx` is the one file `bare.html` and `index.html` both
construct their board from, and the brief calls for the `SharePanel`
override to live there ("add the key, nothing else") — so `bare.html` now
paints the same button `index.html` paints, unstyled on one side and
shadcn-styled on the other. Ran `tests/stock_pixels.mjs` on this branch to
measure the actual damage: bare-vs-index goes from 0/0 changed px to
11,512 (board) / 13,992 (panel) out of ~1.4M total — all of it the button,
confirmed by inspecting `tests/out/diff-bare-vs-index-*.png`. Left
unfixed: `tests/stock_pixels.mjs` is explicitly out of this branch's edit
list (M2's peer is mid-flight on it on `main`), and the fix is a product
decision — teach the gate to click through / mask the SharePanel zone,
seed `bare.html` a second no-button variant, or accept a non-zero floor —
that belongs to whoever reconciles M2 and M4 on `main`, not to a worktree
that isn't merging today.

### Paint-override check: SKIPPED, not faked

Item (b) of the journey brief writes a `systemSketchPrimitiveOverride` meta
key onto the probe rectangle and expects it to sort first with a non-zero
diff — but that only means something once a `ShapeUtil.configure()` reads
that key, which is M2's job. `git log main` is still at 29b478d (M1) as of
this run, and `src/inspector/configuredUtils.ts` doesn't exist yet — only
`src/inspector/inspectorModel.ts` and `overrides.ts` sit untracked on `main`.
Writing the meta key today would render on *neither* side (a null diff would
look identical to "the override worked and stock ignores it", which is
exactly the failure mode a real gate has to refuse to confuse) — so
`tests/compat_smoke.mjs` checks for `configuredUtils.ts` at run time and
marks that row `SKIPPED: ...` with the reason inline, rather than asserting
something it can't yet measure. Re-run once M2 lands the configured utils.

## 2026-09-07 — M4 integration: rebase onto M2, close the pixel-gate regression, the enum blind spot

M2 landed on `main` (`921d83c`..`96cbd35`: the Inspector, the two/three-route
split, the view audit) while M4 was in flight on `.worktrees/m4-compat`. This
entry is the integration pass: `git rebase main`, then four follow-ups the
coordinator's audit named.

**Rebase conflict: `src/board/mount.tsx`.** M2's own audit had already
corrected the exact mistake M4's first cut made — hard-coding a component
into `Board` itself, the same shape as M2's original `withInspector` boolean
that let `bare.html` grow an Inspector behind a query switch. Resolved by
taking main's `mount.tsx` untouched and moving `SharePanel: StockCheckButton`
into `src/App.tsx` and `src/stock.tsx`'s own `components` maps instead — the
stock route gets it too, since "does this board still open in real stock
tldraw" is at least as meaningful on an otherwise-completely-stock canvas.
`bare.html` passes no `components` at all, so it stops painting even an
unstyled copy of the button. Re-ran `tests/stock_pixels.mjs`: bare vs index
is back to 0/0 changed px outside the mask (313,380 / 331,436 masked px,
button rect included the same way the Inspector dock already was), matching
the numbers M2 left the gate at before M4 ever touched it.

**Journey convention: own subdirectory.** `tests/compat_smoke.mjs` now
writes to and clears only `tests/out/compat_smoke/`, per M2's "Journeys own
their output directories" fix (`03559fe`) — it was still writing straight to
`tests/out/` from before that convention existed. Added to `check`'s line,
after the Inspector journey.

**Case (b) unskipped.** `src/inspector/configuredUtils.ts` is on `main` now,
so the paint-override case runs unconditionally: writing
`meta.systemSketchPrimitiveOverride` really does put the overridden
rectangle first with a non-zero diff, and now also asserts the whole-board
row goes from 0 to non-zero alongside it.

**The enum blind spot no in-browser oracle can see, and the crash it hid.**
`configuredUtils.ts`'s `GeoShapeUtil.configure({ customGeoTypes })` calls
`GeoShapeGeoStyle.addValues('systemsketch-rounded-rect')` as a side effect —
confirmed by reading `node_modules/tldraw/src/lib/shapes/geo/GeoShapeUtil.tsx`
directly. `GeoShapeGeoStyle` is a mutable module-singleton array
(`EnumStyleProp#addValues` in `@tldraw/tlschema` mutates in place,
permanently, for the life of the module graph), and both chrome routes
import `configuredUtils.ts` before the Stock check button can ever run — so
by the time `runStockCheck` executes, the hidden "stock" mount's own schema
validates against the SAME already-mutated array, and happily accepts a
record a real, separate stock tldraw process would refuse outright. Added
`src/compat/stockEnums.ts`: static literals for the real stock `geo`
(20 values) and colour (13 values) vocabularies, checked in
`stockEnums.test.ts` against a fresh import of `GeoShapeGeoStyle`/
`DefaultColorStyle` from `@tldraw/tlschema` — a test file that must never
import `configuredUtils.ts`, even transitively, or it would only be
checking the mutated array against itself. `stockCheck.ts` walks every
exported shape record against these two lists *before any image work* and
collects violations as `RefusalRow`s.

Wiring this in surfaced a second bug, found the hard way: the journey's new
case just hung — `waitFor` timed out with no thrown error and no console
error either. Instrumenting `runStockCheck` with temporary `console.log`s
(read back via a dev-server + CDP debug harness, since `page.send` couldn't
`awaitPromise` on a promise that never resolves) traced it to
`mountHiddenStockEditor`'s own promise never settling: mounting — not merely
calling `toImage` on — a store containing a shape with an unrecognized
`props.geo` crashes deep inside a reactive geometry computed cache
(`GeoShapeUtil.getGeometry` → `getGeoShapePath` → `_getGeoPath` throws
`Unknown geo type: …`, since the hidden mount's plain `GeoShapeUtil` has no
`customGeoTypes` registered). tldraw's own `<Tldraw>` wraps this in an error
boundary that retries the mount rather than surfacing the error, so
`onMount` simply never fires and the whole check hangs forever instead of
failing loudly. Fixed by calling `parsed.value.remove(refusedIds)` on the
parsed store *before* it is ever handed to `mountHiddenStockEditor` — which
is also the more honest model, since a real stock tldraw process never
rendered those shapes either, having refused the whole file before painting
a single pixel. `stockCheck.ts`'s per-shape and whole-board loops needed no
further change once the store itself never contained the bad record.

**The report's Sheet needed the same font fix M2 made for the popover.**
Base UI's `Dialog` (shadcn's `Sheet`) portals to `<body>` by default, same as
`Popover`/`Tooltip` — the Stock check report rendered in the browser's serif
fallback until `[data-slot="sheet-content"]` joined the existing narrowly-
scoped rule in `app.css` (never `body` itself, never present during the
pixel gate's captures).

`npm run check` green: `tsc -b`, 86 vitest tests (5 files: the 4 already on
`main` plus `stockEnums.test.ts`), the pixel gate (0/0/763 outside masks,
same as M2 left it), `test:inspector` (23/23, unchanged), `test:compat`
(12/12 — the original 8 plus the 4 new refusal/whole-board-red checks).

**Aside, not this branch's to fix:** running `vitest run` from the *main
checkout's* root (rather than from inside a worktree) currently picks up
test files from sibling worktrees too (`.worktrees/m3-theme`,
`.worktrees/m5b-registry` both exist right now) — vitest's default test glob
crawls the filesystem, not git, and `.gitignore` doesn't constrain it. Noted
here because it produced a startling 353-test run while sanity-checking this
entry's numbers against main; every number actually reported above is from
running `npm run check` inside `.worktrees/m4-compat` only.
