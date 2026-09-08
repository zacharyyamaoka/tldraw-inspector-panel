# tldraw_styling_lab

A scaffold for a Figma-shaped inspector built on top of stock `tldraw` — the
question this repo answers first, before any inspector UI gets written, is
whether a modern chrome stack (Tailwind v4, shadcn on the Base UI track) can
sit around tldraw's canvas without changing a single pixel of what tldraw
itself paints. M1 (this milestone) proves that with a measured pixel gate;
later milestones build the actual inspector on top of the stack this proves
safe. Full plan and rationale:
`file:///home/bam/systemsketch/reports/tldraw-styling-lab-plan-2026-09-07.html`.

## Stack (resolved versions, `package-lock.json`)

| package | pinned | resolved |
|---|---|---|
| tldraw | 5.3.2 | **5.3.2** |
| @tldraw/assets | 5.3.2 | **5.3.2** |
| @base-ui/react | 1.8.0 | **1.8.0** |
| react / react-dom | 19 | **19.2.8** |
| tailwindcss | 4 | **4.3.3** |
| @tailwindcss/vite | 4 | **4.3.3** |
| shadcn (CLI + runtime tailwind.css) | — | **4.21.0** |
| vite | scaffold default | **8.2.2** |
| typescript | scaffold default | **~6.0.2** (tsc 6.0.3) |
| vitest / pixelmatch / pngjs | — | **5.0.0 / 7.2.0 / 7.0.0** |
| react-colorful (M2, the Inspector's colour popup) | 5.6.1 | **5.6.1** |

Zero `radix-ui` / `@radix-ui/*` anywhere in `package.json` or `src/` — every
`src/components/ui/*.tsx` file shadcn generated imports exclusively from
`@base-ui/react/*`.

## Three rules

1. **The record stays stock.** `tldraw@5.3.2`, pinned exactly, added to only
   through its own supported seams. This milestone's whole job is proving the
   chrome stack around it (Tailwind, shadcn, Base UI) is inert — see
   `tests/stock_pixels.mjs`.
2. **The model decides, the view draws.** Live as of M3:
   `src/inspector/inspectorModel.ts` is plain TypeScript with no React and no
   tldraw-flavoured JSX — 59 `FieldSpec` entries (50 in M2, +9 in M3), each
   with `applies`/`read`/`write`, answering every question of *what a shape
   can be*. `src/inspector/Inspector.tsx` renders whatever that model hands
   back and nothing else; it does not know what a rectangle is.
3. **Consumed by registry.** *(arrives in a later milestone — inspector
   panels register into a shared surface rather than being hand-wired.)*

## Run it

```
npm --prefix /home/bam/tldraw_styling_lab run dev
```

Then open <http://127.0.0.1:5180> (`--strictPort`: fails loudly instead of
drifting to another port if 5180 is taken).

## Test it

```
npm --prefix /home/bam/tldraw_styling_lab run check
```

Runs `tsc -b`, the vitest suite (`theme_bridge.test.ts` plus the M2/M3 unit
suites below), the pixel gate (`tests/stock_pixels.mjs`), the Inspector
journey (`tests/inspector_smoke.mjs`) and the Theme journey
(`tests/theme_smoke.mjs`) in sequence. `test:unit`, `test:pixels`,
`test:inspector` and `test:theme` run any one alone.

**The pixel gate** builds the app, serves `dist/` on a free port, and drives
headless Chrome (offline, self-hosted assets — no CDN dependency) through the
identical seeded board at `bare.html` (tldraw's own CSS only) and `index.html`
(the full chrome stack). `pixelmatch` at threshold 0 must find **zero**
changed pixels between them outside the Inspector's own dock (see below), in
both the idle-board and panel-open states. It then loads
`index.html?seed=stock&preflight=1` — the one CSS file
(`tailwindcss/preflight.css`) the whole layers-only approach exists to keep
out — and asserts *that* diff comes back non-zero outside the dock too, as a
mutation check that the gate can actually fail. Captured PNGs and diff images
land in `tests/out/stock_pixels/` (gitignored).

**Each journey owns its own subdirectory of `tests/out/`, and clears only
that one.** `tests/stock_pixels.mjs` writes to `tests/out/stock_pixels/`,
`tests/inspector_smoke.mjs` to `tests/out/inspector_smoke/`. A shared
`tests/out/` used to mean either journey's own `rm(outDir, {recursive:
true})` deleted the other's captures the moment it ran second — a real
regression a review caught. A new journey follows the same rule: pick a name,
write there, `rm` only there.

**The dock mask, since M2:** `index.html` now mounts the Figma-shaped
`Inspector` (below) in place of tldraw's own style panel, so the two entries
differ inside that one 280px-wide overlay by design — it is an absolute
overlay *inside* `.tl-container`, never a layout sibling, specifically so it
never shifts the canvas's own viewport and the camera `bare.html` and
`index.html` each compute stays identical. The gate reads that rectangle
straight off the DOM on every capture (`[data-testid="inspector"]` on the
chrome route, tldraw's own `.tlui-style-panel__wrapper` on bare's once a
shape is selected) and zeroes it in **both** images before diffing, so a real
regression anywhere else on the 1440×960 canvas still fails at threshold 0.
The table it prints names the masked area on every run.

**The Inspector journey** (`tests/inspector_smoke.mjs`) drives the built app
in headless Chrome against `index.html?seed=stock` (paint seam installed) and
`stock.html?seed=stock` (the stock route, seam withheld) — 33 checks (23 from
M2, 10 added in M3 for the newly-reached rows below), every one read off the
editor's own record or the painted SVG/computed style, never off the panel's
own DOM alone.

**The Theme journey** (`tests/theme_smoke.mjs`, M3) — 12 checks: the two
scalar rows repaint the probe rectangle's stroke width, editing a named
colour's role repaints its stroke colour, a light-mode edit and a dark-mode
edit of the same role stay isolated until `colorScheme` actually switches,
Add Colour registers a new name into the live theme and survives a reload of
the persisted (non-seeded) document, and the layer-3 floor — the SAME
document opened on `stock.html`, which never registers the custom name — is
measured and printed rather than assumed. Screenshots land in
`tests/out/theme_smoke/`.

## URL switches (dev-only, read once at startup)

| switch | effect |
|---|---|
| `?seed=stock` | seeds the nine-shape probe board (fixed shape ids) instead of loading the persisted board, and skips `persistenceKey` entirely so the run never touches, or creates, real IndexedDB state |
| `?preflight=1` | (`index.html` only) dynamically imports `tailwindcss/preflight.css` — exists solely so the pixel gate's mutation check has something real to catch; never loads on a normal visit |

Every mount exposes `window.__lab = { editor, ready: true }` once tldraw is
mounted (and seeded, if `?seed=` was present) — that's what tests wait on.

## Three entries

- `index.html` → `src/main.tsx` → `src/App.tsx`: the real app, full chrome
  stack (`tldraw/tldraw.css` + `src/styles/app.css`), the Inspector AND
  `CONFIGURED_SHAPE_UTILS`, `persistenceKey: "tldraw_styling_lab"` on a plain
  load.
- `bare.html` → `src/bare.tsx`: the pixel gate's control — identical board,
  `tldraw/tldraw.css` only, no Tailwind/shadcn/Base UI anywhere, tldraw's own
  `DefaultStylePanel`. Never carries the Inspector; see the WHY in
  `src/board/mount.tsx`.
- `stock.html` → `src/stock.tsx`: the chrome stack (so the Inspector renders
  with its real styling) and the Inspector, but **no** `CONFIGURED_SHAPE_UTILS`
  — an otherwise-completely-stock canvas, which is what the stock route
  (below) needs to honestly prove.

All three mount through `src/board/mount.tsx` and seed through
`src/board/seed.ts` — the only two files any entry can construct a board
from, so they cannot silently drift apart.

## The Inspector (M2)

`src/board/mount.tsx`'s `Board` takes two plain pass-through props —
`components` and `shapeUtils`, the same names and shapes `<Tldraw>` itself
takes — and every entry states its own chrome in full: `index.html` passes
both (`{ StylePanel: Inspector }` and `CONFIGURED_SHAPE_UTILS`), `stock.html`
passes `components` alone, `bare.html` passes neither. `mount.tsx` itself
does not import `Inspector` or `CONFIGURED_SHAPE_UTILS` at all — a design
correction from M2's first cut, where `Board` picked between them on a
`withInspector` boolean and defaulted to `false`, which is exactly how
`bare.html` grew an Inspector behind a `?inspector=1` query switch. A future
entry that forgets a prop now gets tldraw's own default for it, never a
half-mounted chrome stack it didn't ask for.

- **`src/inspector/inspectorModel.ts`** (React-free) — ported verbatim from
  SystemSketch (`77907974`, `src/inspector/primitiveInspectorModel.ts`) with
  two edits: the `sharedValueAcross` fold it imported is inlined, and the
  `arrowRouting` (Slant) field — SystemSketch's own arrow util, not a stock
  tldraw capability — is dropped along with its imports. 50 fields (51 minus
  Slant).
- **`src/inspector/overrides.ts`** — ported verbatim from
  `primitiveOverrides.ts`: the `meta` contract every `paint`-sourced row
  writes through, kept under the *same* key
  (`systemSketchPrimitiveOverride`) the donor uses, so a board's overrides
  round-trip between the two apps.
- **`src/inspector/configuredUtils.ts`** — the paint seam and the rounded
  rectangle (`systemsketch-rounded-rect`, same name, same round-trip
  argument), reproduced from `stockPrimitiveVisuals.ts` /
  `excalidrawInterop.ts` / `systemSketchArrow.tsx` with every SystemSketch/
  Block-specific derived-default (the "detached composite" paint, the
  async-edge dash cadence, Excalidraw import fidelity, the slanted arrow)
  left out. One exception: `defaultGeoFillColor` reproduces stock tldraw's
  *own* geo fill formula (from `GeoShapeUtil.tsx`, not a SystemSketch taste)
  so a `fillOpacity`-only override has a real colour to composite its alpha
  onto.
- **`src/inspector/ScrubNumber.tsx`** — the expression parser, `quantize`,
  and the `auto`-from-engine-value scrub origin ported logic-verbatim onto
  Base UI's `NumberField`, re-skinned with Tailwind and shadcn's
  `InputGroup`.
- **`src/inspector/Inspector.tsx`** — the view. Renders `model.groups` in the
  model's own fixed order (Layer · Shape · Fill · Stroke · Text · Arrow ·
  Sticky · Highlighter · Frame), one shadcn `Collapsible` section per group.
  Every control kind but two is a shadcn/Base UI part — swatches (a 7-col
  grid of `Toggle`, painted from the live theme) and the number parser above
  are hand-rolled on purpose; everything else (scrub, popover, select,
  toggle group, switch, scroll area) is a package. Colour rows use
  `react-colorful`'s `HexAlphaColorPicker` — the only new dependency this
  milestone took.
- **The stock route** — `stock.html` mounts the same `Inspector` on a chrome
  -styled canvas with none of `CONFIGURED_SHAPE_UTILS` installed, so every
  `paint` row withholds itself instead of writing `meta` that changes no
  pixel (`paintReaches(shape, editor)` in `inspectorModel.ts`). One field
  list, one predicate, three routes (`bare.html` stays tldraw's own panel,
  untouched, for the pixel gate's control).

Two real bugs the Inspector journey (`tests/inspector_smoke.mjs`) caught, not
inferred: a hand-styled `NumberField.Input` missing `min-w-0` let a
193px-wide `<input>` silently overflow its own bordered box and eat clicks
meant for the "×" clear button drawn beside it (fixed at `ScrubNumber.tsx`);
and a field committing on blur could commit to the *wrong* shape when the
blur-causing click landed on a different one, because `editor.select(...)`
re-renders the panel — via `useValue`'s external-store subscription, outside
React's batching — before the browser's own focus-shift dispatches that
blur. `Inspector.tsx`'s `InspectorPanel` freezes its model reference while
focus is inside the dock and the selection is about to change, and only
adopts a fresh reading once nothing here is focused (or the selection is
unchanged) — see the `WHY` there and docs/log.md's M2 entry.

## Stock check (M4)

A "Stock check" button, mounted through tldraw's `components.SharePanel` seam
on the chrome route (`src/App.tsx`) and the stock route (`src/stock.tsx`) —
never `bare.html`, the pixel gate's control — exports the live board the way
a `.tldr` save would (`serializeTldrawJson`), reparses it against a fresh,
unconfigured `createTLSchema()`, mounts that store in a second, hidden
`<Tldraw>` (`src/compat/hiddenStockMount.tsx`), and diffs what each side
actually paints: whole board first, then every shape stock tldraw can also
render, ranked by divergence (`src/compat/stockCheck.ts`,
`src/compat/StockCheckReport.tsx`). This is the instrument the plan's §4
calls for — it makes layer 2 (paint overrides carried in `shape.meta`,
`getCustomDisplayValues`) visible and ranked, since a schema that never
installed those overrides can't paint them. A parse rejection (a board stock
tldraw genuinely refuses) is reported as the loudest possible row and nothing
else runs.

Run it: click "Stock check" top-right in the running app, or drive it
headlessly with `npm run test:compat` (builds, serves `dist/` on a free port,
opens the seeded board, clicks the button, reads the report back out of the
DOM; writes to `tests/out/compat_smoke/`, per the per-journey output-dir
convention M2 established). Threshold is `pixelmatch` at `0.1` — looser than
the M1 pixel gate's byte-exact `0`, because M4's diffs are two
independently-rasterized SVG→canvas exports of shapes that render the same
underlying record; `0.1` absorbs anti-aliasing jitter between them without
hiding a real divergence.

**Known blind spot #1:** the white text halo (`--tl-text-outline`) is a CSS
variable, not an exported property — it never shows up as a diff on either
side even where it visibly differs on-screen. Stated in the report's footer,
not silently swallowed.

**Known blind spot #2, and the pre-flight rule that covers it:**
`src/inspector/configuredUtils.ts`'s `GeoShapeUtil.configure({ customGeoTypes
})` permanently appends `'systemsketch-rounded-rect'` to `GeoShapeGeoStyle`'s
values — a mutable module-singleton array — the moment either chrome route
imports it, which happens before the button can ever run. The hidden "stock"
mount shares that same JS realm, so its schema's validator sees the mutated
enum too and accepts a record a real, separate stock tldraw process would
refuse outright. `src/compat/stockEnums.ts` holds the real stock `geo`/colour
vocabularies as static literals (checked against a fresh, never-mutated
import in `stockEnums.test.ts`) precisely so this check has ground truth the
page's own singletons can no longer provide. `stockCheck.ts` walks every
exported record against them *before any image work*, renders each violation
as its own red "Stock tldraw would refuse this record" row right after the
parse row, and forces the whole-board reading red regardless of pixel count.
One more trap this surfaced: mounting — not merely rendering — a store
carrying an unrecognized custom geo type crashes tldraw's own error boundary
inside a reactive geometry cache, which retries forever rather than
throwing, so `runStockCheck` hangs silently instead of erroring. Fixed by
deleting refused records from the parsed store before the hidden editor ever
mounts, which also happens to be the more honest model — a real stock
tldraw process never rendered them either.

**The M1 pixel gate stays byte-exact outside its masks.** `SharePanel:
StockCheckButton` lives in each chrome route's own `components` map, never in
`src/board/mount.tsx` (the one file every entry, `bare.html` included,
shares) — bare.html mounts none, so it never paints a copy of the button at
all. `tests/stock_pixels.mjs` masks the button's own DOM rect the same way it
already masks the Inspector dock: `bare vs index` is 0/0 changed px outside
313,380 / 331,436 masked px, and the `?preflight=1` mutation check still
catches 763 — the same numbers M2 left the gate at.
## Everything the canvas can render (M3)

M3's brief was "expose everything the canvas can render" split into the plan's
three styling layers — layer 2 (the renderer's display values M2 didn't yet
reach) and layer 3 (the app-global theme, which is a document/app setting,
never a shape's).

**The census** (`src/inspector/displayValueCensus.ts` +
`displayValueCensus.test.ts`) is the layer-2 half: every `*ShapeUtilDisplayValues`
interface across the 12 stock ShapeUtils this app configures or leaves stock
(geo, text, line, draw, arrow, note, highlight, frame, image, video, bookmark,
embed), parsed straight out of `node_modules/tldraw` at test time so a tldraw
bump fails the census before anyone notices a missing row. Re-measured at
5.3.2: **55 reached / 17 documented / 72 total** — not the donor's 42/31/73,
on purpose (a different tldraw version, this app's own new rows, and one real
bug the sweep caught — see Deviations). `inspectorModel.ts` carries **59**
`FieldSpec` entries now (50 in M2 + 9 here: `patternFillFallbackColor`,
`labelEdgeMargin`, `labelMinWidth`, `url`, `growY`, `isPen`, `scaleX`,
`scaleY`, `altText`).

**Rows added:**

- **`patternFillFallbackColor`** (geo/draw/arrow) — the flat colour tldraw's
  own `PatternFill` paints instead of the diagonal pattern once zoomed out
  far enough (effective zoom ≤ 0.18) that the lines would alias. Gated on
  `fill === 'pattern'`, the only state where anything reads it.
- **`labelEdgeMargin` / `labelMinWidth`** (geo only) — the margin between a
  label and the shape's edge, and the minimum width `GEO_SHAPE_MIN_WIDTHS`
  reserves for it. Both hard-coded by tldraw, both real `getDefaultDisplayValues`
  outputs.
- **The frame set** — `FrameShapeUtil.configure({ showColors })`
  (`configuredUtils.ts`) is the stock switch that makes a frame's own colour
  paint at all; without it, `props.color` exists on every frame record
  (tlschema's own migration defaults it to `'black'`) but is registered only
  as a plain validator, never a real `DefaultColorStyle` StyleProp. **Off by
  default, opt-in via `?frames=colors`** (read once at module scope,
  `FRAME_COLORS_ENABLED`) — turning it on unconditionally broke
  `tests/compat_smoke.mjs`'s "whole-board diff is 0 on a pure layer-1 board"
  the moment M3 merged with M4 (measured 83 changed px on the seeded, all-
  black-frame board); see docs/log.md's "showColors is opt-in" entry. The
  `color` swatch row's `applies` predicate calls `styleReaches`
  (`editor.styleProps[type]?.has(style)`) — which already tracks the switch
  correctly, no change needed there — AND a second, more direct
  `frameShowColorsOn` check (`util.options.showColors === true`),
  belt-and-suspenders after that regression. Once on, the row reaches
  `showColorsFillColor`, `showColorsStrokeColor` and the three heading
  variants; there is no independent "heading colour" — all five are derived
  from the same one `color` prop, so no separate rows exist for them beyond
  the swatch. The five `showColors: false` defaults (`fillColor`,
  `strokeColor`, `headingFillColor`, `headingStrokeColor`,
  `headingTextColor`) are documented unreached: with the switch on, the
  util never selects them; with it off (the default), they're what actually
  paints.
- **`url`** — an ordinary `linkUrl` prop on six record types (geo, note,
  image, bookmark, embed, video); one `propField`, `hasProp` decides where it
  applies.
- **`growY`** — read-only, disabled (geo, note): the label-overflow height
  tldraw derives and never lets you set. New `disabled` support end to end
  (`FieldSpec` → `InspectorControl` → `ScrubNumber`'s own `disabled` prop,
  onto Base UI's `NumberField.Root`) — the first field that needed it, and
  the row is still drawn rather than dropped, the same "show tldraw's own
  number" rule the `unset`/`auto` state already followed.
- **`isPen`** (draw, highlight) — set from pressure at draw time, editable
  after.
- **`scaleX` / `scaleY`** (draw, highlight) — their per-axis resize factor;
  neither shape has `w`/`h` at all, this *is* their resize mechanism (negative
  values flip, the same way tldraw's own resize handler writes them).
- **`altText`** (image, video) — its own new "Media" group, since neither
  shape's `DisplayValues` interface has anything else to expose (both are
  empty — `crop` stays a documented, deliberately-not-built rect editor).

**Deviations from the brief:**

- **`noteBorderWidth`/`noteBorderColor` stay unwired**, against the brief's
  literal list. Re-checked against 5.3.2's own `NoteShapeUtil.tsx`:
  `hideShadows ? borderBottom(...) : boxShadow(...)` still gates the ring to
  far-zoomed-out only. A row here would be exactly the "control that does
  nothing is a lie" failure `inspectorModel.ts`'s own module comment already
  names for this exact case (see its "NOT OFFERED: a sticky's ring").
  Documented unreached in the census instead.
- **A real bug fixed in passing, not asked for**: `arrowOverrideDisplayValues`
  never mapped `fillColor` at all, even though the `fillColor` paint row
  already applied to arrows (`HAS_FILL` sees their `fill` prop) — it wrote
  real `meta`, lit the overridden dot, and painted nothing, silently, since
  M2. Found while wiring `patternFillFallbackColor` onto the same function;
  fixed the same way `geoOverrideDisplayValues`'s own `fillOpacity`-with-no-
  `fillColor` case already is (`configuredUtils.ts`'s `defaultFillColorFor`,
  generalized from `defaultGeoFillColor` and shared with arrow).
- **The census counts a different thing than a live selection's row count.**
  The brief asked for the census total to match "what the panel offers on a
  rectangle+frame selection." They can't: the census counts distinct tldraw
  *display-value keys* across 12 interfaces; a live selection's row count
  includes every `x`/`y`/`rotation`/style/prop row too, and folds shared
  fields across shapes. `tests/inspector_smoke.mjs` prints both numbers side
  by side as an FYI and asserts the two shapes' rows genuinely appear
  together, not a forced equality.
- **`scaleX`/`scaleY` DO exist at 5.3.2** (on `draw` and `highlight`), against
  the brief's expectation that they might not — checked directly against
  `TLDrawShape.ts`/`TLHighlightShape.ts` rather than assumed, and wired up
  since they're real, cheap, and currently-unreached.

## The Theme tab (M3)

Layer 3: the palette and typographic scalars every shape's paint resolves
against — app-global, not a shape's, so it is a second tab
(`src/inspector/ThemePanel.tsx`) beside Inspect, via a shadcn `Tabs` wrapper
around both panels in `Inspector.tsx`'s dock. Mounted on both the chrome route
and the stock route (theme editing is a generic tldraw API, not gated by
`CONFIGURED_SHAPE_UTILS`); never on `bare.html`, which mounts no Inspector at
all.

- **Scalars** — `fontSize`, `lineHeight`, `strokeWidth`, the same
  `ScrubNumber` the Inspect tab uses, writing through `editor.updateThemes`.
- **Thirteen named colours**, each its own collapsible: a light/dark
  `ToggleGroup` choosing which palette *that section* edits, a 14-swatch
  preview strip, and a colour row per role grouped Fill (`solid`, `semi`,
  `pattern`, `fill`, `linedFill`), Frame (`frameHeadingStroke`,
  `frameHeadingFill`, `frameStroke`, `frameFill`, `frameText`), Note
  (`noteFill`, `noteText`), Highlight (`highlightSrgb`, `highlightP3`). The
  colour row itself (`ThemeColorField`) is a deliberate ~30-line duplicate of
  `Inspector.tsx`'s `ColorRow` swatch+popover+hex-input, minus the mixed/unset
  states a theme role never has — the two surfaces read different shapes
  (a shared selection's paint vs. one theme's own record), and forcing them
  through one prop contract would have cost more than the duplication does.
- **Undo does not track this.** `ThemeManager.ts` keeps themes on a plain
  `Atom`, never the record store `UndoManager` walks — the tab's header says
  so, and "Reset to tldraw defaults" (`resolveThemes()`, tldraw's own
  `DEFAULT_THEME`) is the only way back.
- **Persistence is `localStorage`** (`src/inspector/themeStorage.ts`), read
  by whichever entry decides to (see below), never by the document — the same
  category boundary `persistenceKey` already draws for a `?seed=` run. `Board`
  now takes `themes` as a third plain pass-through prop, exactly like
  `components`/`shapeUtils`: `App.tsx` reads the persisted value on a
  non-seeded load, `stock.tsx` deliberately never does — the whole point of
  that route is an otherwise-completely-stock canvas, and it needs its
  palette to actually be tldraw's own, unregistered custom names included —
  and `bare.tsx` never touches it.
- **Add colour**: one hex, `themeColorDerivation.ts`'s `deriveThemeColorRoles`
  produces all 14 roles for both palettes from one small documented formula —
  `solid`/`fill` are the picked hex; every wash role mixes toward white
  (light) or black (dark) at a fixed ratio per role; the two text-on-a-wash
  roles (`frameText`, `noteText`) mix the other way for contrast;
  `highlightSrgb`/`highlightP3` both get the raw hex (no P3-gamut conversion
  available here). Not a reconstruction of tldraw's own hand-tuned palette
  math — documented as exactly that. Registered into both the live theme
  (`editor.updateThemes`) and, immediately, `DefaultColorStyle`/
  `DefaultLabelColorStyle` via `registerColorsFromThemes` — the same call
  `TldrawEditor.tsx` makes from the `themes` *prop* at mount, run again here
  because an imperative `editor.updateThemes` doesn't re-render that
  component. Skipping this left the Inspect tab's swatch rows blind to a
  colour `theme-smoke.mjs` had just added, for the rest of that session.
- **The layer-3 floor, measured, not assumed** (`tests/theme_smoke.mjs`):
  paint a shape with a custom colour, persist it, reload the same
  (non-seeded) document on `stock.html` — which never registers the custom
  name. At 5.3.2 the mount **never reaches `window.__lab.ready`**: the strict
  `DefaultColorStyle` validator rejects the persisted enum value outright,
  with no fallback substitution and no console error either. This is the
  honest floor of "a board painted with this app's own theme, opened where
  the theme isn't installed" — worse than a silent downgrade, and stated here
  rather than discovered by someone opening a real board in stock tldraw.

Two real traps this milestone paid for, both already documented at the point
they bite: `frame`'s `color` prop existing unconditionally but not being a
real StyleProp until `showColors` is configured (`styleReaches`'s own WHY in
`inspectorModel.ts`), and `registerColorsFromThemes` needing a second, manual
call after `editor.updateThemes` because the automatic one only runs from the
`themes` React prop at mount (`ThemePanel.tsx`'s `patchTheme`).
