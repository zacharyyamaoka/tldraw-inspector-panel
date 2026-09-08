# Log

## 2026-09-07 — Round two: Figma rows, Icon strips, Summary accordions

Zach's verdict on round 1: "generally I want the inspector panel to be more
compact… Aim to match the compactness of figma. Please make your 3 variants
more orthogonal — the 3 you made last time were very similar." Round 2 is
three NEW variants — V4/V5/V6, `?variant=4|5|6` — built on `.worktrees/variants-r2`
(branch `variants-r2`, cut from `main`@1a23123, round 1's own fixes already
in). Round 1 stays reachable at `?variant=1|2|3`; the app's own default
moves to 4 (`variants/theme.ts`'s `DEFAULT_VARIANT`).

**Two new files carry the whole round**: `src/inspector/variants/figmaKit.tsx`
(shared atoms every variant composes differently — `ColorPickerPopover`,
`EyeToggle`/`MinusButton`, `WeightSelect`/`WeightWordSelect`, `DashSelect`,
`GeometrySelect`, `SegmentedIconRow`, `MorePopover`/`CornerPopover`,
`AnatomySection`/`Line` — the `[data-section]`/`[data-line]` markers the
proof reads) and `figmaVariants.tsx` (the three compositions, plus the
shared `positionLines`/`appearanceLine`/`geometryLine`/`fillLines`/
`strokeLines`/`textLines` builders V4 and V6's expanded accordion body both
call). `inspectorModel.ts` is untouched — every row below is a real
`FieldSpec` id already in the model; V4/V5/V6 read `model.groups` into a
`Map<id, InspectorControl>` (`controlsById`) and place specific ids on
specific lines, rather than iterating `model.groups` the way round 1's
`GroupSection` does. A row the model doesn't offer for the selected shape is
absent from its line, never a hole in a fixed layout — same "a control that
does nothing is a lie" rule round 1 already lived by.

### The mapping table (Figma element → tldraw prop), as built

| Figma line | tldraw control(s) | notes |
|---|---|---|
| Fill: swatch/name/alpha/eye/minus | `fillColor` (exact, paint) else `color` (named, style) resolved through the live theme at `fill`'s own style role; `fillOpacity` (paint, own scrub, not hex8-derived); eye = `fill` StyleProp `'none'` toggle, restores `lastFillStyleRef` (default `solid`); minus clears `fillColor`+`fillOpacity` | swatch/alpha logic in `effectiveColorReading`/`ColorPickerPopover` |
| Stroke line 1 (same anatomy) | `strokeColor` (exact) else `color` (named, `solid` role — stroke has no fill-style analogue); alpha from `strokeColor`'s own hex8 byte (`hexAlphaPercent`, round 1's own derivation — no `strokeOpacity` field exists); eye = `dash` `'none'` toggle, restores `lastDashStyleRef` (default `draw`); minus clears `strokeColor` | |
| Stroke line 2: dash select / weight / corner popover | `dash` (`DashSelect`, tldraw's own dash icons); `size`+`strokeWidth` (`WeightSelect` — S/M/L/XL + "Exact…" reveals the px field, mirrors `strokeWidth.overridden`); `strokeRoundness` behind a `CornerPopover` (geo+`dash==='draw'` only) | |
| Text line 1: font select + Typeface… | `font` (`CompactSelect`, tldraw's font icons) + a synthetic `Typeface…` item revealing `labelFontFamily` (paint, text) as its own line | `FontLines` |
| Text line 2: weight + size | `labelFontWeight` (`WeightWordSelect` — drawn DISABLED, never dropped, when the shape offers no row: see below) + `labelFontSize` | |
| Text line 3: line height / padding + "…" | `labelLineHeight` + `labelPadding`, captioned "Line height · Padding" (the caption is NOT a line — no `data-line`); `labelEdgeMargin`/`labelMinWidth`/`labelFontFamily` (V5 also folds `labelLineHeight`/`labelPadding` in here) behind `MorePopover` | |
| Text line 4: align / valign / halo | `align` (`SegmentedIconRow`, 3 options) + `verticalAlign` (3 options) + `textOutline` (`HaloToggle`, a `Sun` icon toggle) | |
| Text line 5: label colour (same anatomy as Fill, minus eye) | `labelColor` (exact) else `labelColorProp` (named); alpha from `labelColor`'s own hex8; minus clears `labelColor` | no eye — no style enum has a "label ink off" member to bind one to |
| Position: XY / WH / rotate+flip+flip+lock | `x`/`y`, `w`/`h`, `rotation` + `flipX`/`flipY` (`FlipHorizontal2`/`FlipVertical2`) + `isLocked` (`Lock`/`LockOpen`) | |
| Appearance: opacity + corner radius + "…" | `opacity` + `cornerRadius`; `scale`/`growY`/`url` behind `MorePopover` | |
| Geometry: one Select | `geo` — `GeometrySelect`: trigger shows the current geo's own glyph (`GEO_GLYPHS` — no tldraw asset exists for this app's geometries, same as round 1) + name, popover is the icon-tile grid | |

**Picker popover** (`ColorPickerPopover`, `figmaKit.tsx`): header (label +
close, `Popover.Close` from `@base-ui/react/popover` directly — the shadcn
wrapper has no close primitive), the fill-STYLE icon row (tldraw's own fill
values — Figma's "Solid/Gradient/Image" row, in this engine's terms; only
drawn when a `styleControl` is passed, i.e. Fill's own popover, since
stroke/label have no analogous style enum), `HexAlphaColorPicker`
(react-colorful, round 1's own choice), a hex + alpha row, and an "On this
page" strip of the 13 named tldraw colours (+ any custom ones) — clicking
one writes the NAMED colour and clears the exact override. Serves Fill,
Stroke line 1 and Text line 5 alike; only Fill passes `styleControl`.

**Deliberately not built**, same "inert control is a lie" rule round 1 used
for its own `+` button: the picker's "Custom | Libraries" header tabs and
its own `+`/"styles" grid icon — one palette, no libraries, and every real
style-preset concept (the six fill values) is already the icon row above.

### The three variants, as measured

- **V4 "Figma rows"** (`?variant=4`, new default) — every section above,
  always visible, no collapse. Measured on the seeded rectangle, BEFORE any
  interaction: Position 3, Appearance 1, Geometry 1, Fill 1, Stroke 2, Text
  5 — **13 total, exactly Zach's own target**.
- **V5 "Icon strips"** (`?variant=5`) — Position collapses to two lines (a
  4-up X/Y/W/H strip, then rotate/flip/flip/lock/opacity); Appearance and
  Geometry MERGE into one line (`geo` select + corner radius + "…"); Fill
  and Stroke each stay one line (Stroke's own line drops `strokeRoundness` —
  the brief's own literal element list for V5 never names it; still
  reachable in V4/V6); Text becomes two lines (font/size/**B** toggle/halo/"…",
  then align/valign/label swatch+hex). Measured: **7 lines total** (target
  <= 8). The **B** toggle is a real simplification, not a second field: it
  reads/writes the same `labelFontWeight` StyleProp as V4/V6's full S6-rung
  Select, collapsed to bold (>= 600) vs. regular.
- **V6 "Summary accordions"** (`?variant=6`) — every section starts CLOSED,
  one line each: a title plus right-aligned value chips read straight off
  the same `InspectorControl` the expanded body reads (`fillSummary`/
  `strokeSummary`/`textSummary`/`positionSummary`/`appearanceSummary`/
  `geometrySummary`) — never a second copy of state, so an
  `editor.updateShapes` call from OUTSIDE the row (verified in the journey)
  repaints the chip. Measured on load: **6 lines closed**, exactly the
  target. Clicking a header opens exactly that section (an accordion — any
  other open section closes); "Expand all" opens every section at once
  without closing the accordion model (`Collapsible`s stay individually
  controlled, just all `open`). The summary trigger stays mounted, chips and
  all, while its own section is open — an expanded section reads as
  "chips, then the real rows," not a swap.

### Deviations, and why

- **`labelFontWeight`'s Select is drawn DISABLED rather than dropped** on a
  shape with no weight row (every shape but `text`) — this round's own
  coordinator brief says so explicitly ("show disabled when the shape has
  no weight row"), a named exception to the model's usual "a control that
  does nothing is a lie" rule, not a lapse of it. `WeightWordSelect`'s own
  header says so.
- **The Fill/Stroke/Label alpha field was `w-14` in round 1's own `ColorRow`
  and got typed `w-12` here at first** — 48px was too narrow for "100 %" at
  11px, and it silently clipped to "10 %", a real truthful-rendering bug
  caught by LOOKING at the rendered gallery screenshot, not by any
  automated check (none of the line-count/behaviour checks assert a
  field's OWN text isn't clipped, only that rows don't overflow the dock).
  Fixed to `w-14` everywhere (6 call sites, `figmaKit.tsx`+`figmaVariants.tsx`),
  matching round 1's own measured width.
- **V5 drops `strokeRoundness`** — see above.
- **V6's accordion starts with every section closed**, not one pre-opened —
  an earlier draft defaulted Fill open (matching "one section open at a
  time" read as a starting state); re-read against the brief's own "Target
  6 lines closed," which only holds if the FRESH load has nothing open.
  "One section open at a time" describes the INTERACTION (an accordion),
  not a default.

### Coordinator add-on, mid-round: stock/inspector panel switch

Zach, via the coordinator, mid-task: "a button at the top of the dock that
switches back to tldraw's STOCK style panel for editing primitives, and,
while the stock panel is showing, a small button that switches back to the
inspector… this is exactly what the lab is for." New file
`src/inspector/variants/panelMode.ts` (`readPanelMode`/`writePanelMode`,
the same read-once/skip-under-`?seed=` contract as `getVariant`/
`readStoredDockWidth`, except `?panel=` on the URL always wins over
localStorage — load-bearing for the pixel gate's own `?panel=stock` run).
`Inspector.tsx`'s `mode === 'stock'` branch renders `<DefaultStylePanel
{...props} />` completely unmediated (no wrapper of this file's own), so
tldraw's own `Layout` wraps it exactly as a true stock deployment would.

**The "Inspector" pill only renders once a shape is selected** — gated on
`editor.getSelectedShapeIds().length > 0` — because the pixel gate's own
`?panel=stock` comparison is against the EMPTY board, where the pill would
otherwise paint pixels bare.html never does. Positioned `position: fixed`
(not `absolute`), measured off `.tlui-style-panel__wrapper`'s own
`getBoundingClientRect()` via a `ResizeObserver` — `board/mount.tsx`'s own
`<div style={{position:'fixed',inset:0}}>` already makes `.tl-container`
fill the viewport, so a fixed pill anchored to the panel's measured bottom
edge reads identically to "absolute, inside `.tl-container`" without this
file needing to establish a containing block on an ancestor it doesn't own.

**A real, unplanned finding**: `tests/stock_pixels.mjs`'s new
`?seed=stock&panel=stock` vs. `bare.html` comparison, run with NO mask,
measured **16,850 changed px**, not zero — not a bug in the switch. `bare.html`'s
own board (no selection) already shows a real `.tlui-style-panel__wrapper`
(the current tool's own style — stock tldraw's real behaviour). Every OTHER
board/panel comparison in this file never has to mask that, because
`index.html`'s normal (non-stock) `StylePanel` slot is `Inspector`'s own
`position: absolute; right:0; top:0; bottom:0` dock (M2's own load-bearing
choice) — wide and tall enough to already fully cover wherever bare's real
panel sits, so `fromBare.stylePanel` was riding inside the `inspector` mask
by geometric accident, never needing its own entry. `?panel=stock` renders
`DefaultStylePanel` UNMEDIATED and in NORMAL FLOW — the one state where
that accident doesn't apply, and where `App.tsx`'s own `SharePanel:
StockCheckButton` (mounted unconditionally since M4, outside this branch's
ownership — `src/App.tsx`/`src/compat/StockCheckButton.tsx` were not
touched) becomes a real flow SIBLING above it, pushing the whole panel down
by the button's own height. The fix is the union of both captures' own
measured `.tlui-style-panel__wrapper` rects (padded 8px for
`--tl-shadow-2`'s own blur bleed past the element's box) — 100% DOM-derived,
never hard-coded, and it brings the check to a real 0 changed px. Documented
here rather than silently widening the mask, because "no mask at all" as
literally asked is architecturally impossible while `SharePanel` stays
unconditional — a fact about M4, not about this switch.

**Journeys**: `tests/inspector_smoke.mjs` adds `runFigmaAnatomyChecks`
(line counts per section against the targets above, whole-field scrub,
click-to-edit, ink at V4/V5/V6's own `inspector-figmaseg-*` testids, no
clipping at 240px, the eye/minus/default-swatch/weight semantic checks, and
V6's live-chip-update proof) for each of 4/5/6, and
`runStockPanelSwitchChecks` (header button → stock panel present, dock
gone, the STOCK panel's own colour button writes `props.color`, the pill
switches back, persistence across a non-seed reload, a `?seed=` reload
ignoring the persisted mode) once. 167 inspector-smoke checks total, up
from 159 (round 1's own 81 unchanged, `+78` for round 2 across three
variants, `+8` for the switch). `npm run check`: `tsc -b` clean, 124 vitest
tests (unchanged — this round added no unit-tested module), the pixel gate
4/4 (0/0/763 masked on the round-1 pair, 0/0 on the new `?panel=stock` pair),
`test:compat` 14/14, `test:theme` 12/12.

**Gallery**: `docs/build_variants_gallery.mjs` gets a "Round two" section —
V4/V5/V6 × light/dark × rectangle/note at 280px, V4's picker popover open,
V6's Fill section expanded, and a measured-line-count table (per section,
V4/V5/V6 side by side) beside Zach's own Figma numbers. Regenerated
`reports/inspector-variants-2026-09-07.html`.

## 2026-09-07 — Three inspector variants (Verbatim, Canvas-native, Inline)

Zach's own words on the panel M2-M5b built: "Don't like how this inspector
looks right now at all… more closely match the open pencil UX/UI… I
particularly don't like these large buttons." This entry is three visual
directions built on `.worktrees/variants` (branch `variants`, not merged —
Zach audits and picks), sharing one skeleton and two mandatory behaviours,
against open-pencil's own MEASURED classes (the clone at
`/home/bam/.claude/jobs/c3a25911/tmp/open-pencil`), not a paraphrase of them.

**Copied verbatim, file by file, from the clone:**

- `src/theme/panel/field.ts` — `panelFieldBase`/`panelIconButtonBase`, ported
  to `kit.tsx` with every colour swapped for a `var(--v-*)` reference (the
  structure, states and sizing are copied; the colour SOURCE is this app's
  own variant palette, not open-pencil's Tailwind config).
- `src/theme/input/number-field.ts` — the root/leading/field/suffix/mixed
  class shapes, same swap.
- `src/theme/select/segmented-control.ts` — `segmentRootClass`/
  `segmentItemClass`, byte-for-byte structure (`h-[22px]`, `gap-0.5`,
  `rounded-sm`, the `data-[state=on]` pair).
- `src/theme/panel/section.ts` / `field-group.ts` / `grid.ts` / `header.ts` /
  `item-row.ts` — `sectionRootClass`, `sectionHeaderClass`,
  `fieldGroupLabelClass`, `listRowClass`.
- `src/theme/splitter.ts` — the `-mx-1 w-2 cursor-col-resize` handle
  (mirrored to `-ml-1` since this dock's handle sits on its LEFT edge, not
  the donor's right one — a right-anchored panel's splitter is the left-
  anchored donor's own shape reflected, not a new design).
- `packages/vue/src/primitives/NumberField/NumberFieldRoot.vue`'s
  `startScrub`/`finish` — the exact pointer contract `ScrubNumber.tsx` now
  runs: pointerdown on the root (never a `<button>`) with
  `preventDefault()`+`setPointerCapture`; a 2px threshold; past it, the value
  tracks `dx * step * sensitivity` and the cursor goes `ew-resize`; under it,
  release calls `startEdit()` (focus + select the input). Read straight from
  the `.vue` source in the clone, quoted in `ScrubNumber.tsx`'s own header.
- `src/app.css` — the light/dark hex tables (panel/panel-secondary/field/
  field-hover/focus/border/hover/accent/surface/muted), one set, reused by
  both V1 and V3 (the brief names a second LAYOUT for V3, never a second
  palette).
- Zach's own screenshots (`Pasted image 20260907204133.png`,
  `20260907204017.png`) for the geometry (24px fields, 22px segment items,
  32px section headers) and the drag region (whole field, not the glyph).

**What Base UI's `NumberField.ScrubArea` could not do, and why it was
dropped rather than widened:** it only wraps whatever child it is given.
Widening that child to the whole field puts the scrub surface and the
`<input>`'s own native mousedown-to-caret behaviour on the identical
element, and ScrubArea's pointer capture wins that race every time — a
plain click could never place a caret at all. `ScrubNumber.tsx` hand-rolls
the root pointer handlers instead (mirroring `NumberFieldRoot.vue` exactly,
per its own header comment), and keeps Base UI for value state, clamping and
keyboard stepping (arrow keys, alt/shift granularity via
`smallStep`/`largeStep`) — only the POINTER gesture moved out from under it.

**The three axes, genuinely different, not three palettes on one layout:**

- **V1 "Verbatim"** (`?variant=1`, default) — open-pencil's literal light/
  dark hex; captions above fields; segmented TEXT for fill/dash/size/font,
  segmented ICONS (tldraw's own SVGs, borrowed for the glyph only — not a
  palette choice) for align/verticalAlign/textAlign; geometry as a `size-6`
  icon-tile grid; colour rows as list rows (swatch, hex text, a derived
  alpha % field, clear); a per-section `↺` reset once any of its own rows is
  overridden.
- **V2 "Canvas-native"** — identical geometry and identical `kit.tsx`
  components; the palette is `.tl-container`'s OWN `--tl-color-*` tokens
  (verified against `node_modules/tldraw/tldraw.css` at grep-time by the
  pre-existing `theme_bridge.test.ts`, which needed no changes — it already
  scans every `var(--tl-*)` reference in `app.css`, this block included);
  every enum `tldrawIcons.tsx` ships an SVG for (fill, dash, size, font,
  align, verticalAlign, textAlign, spline, arrowheadStart/End) draws that
  SVG, recoloured to `currentColor` at import time. **Deviation:** `geo`
  stays the hand-drawn `GEO_GLYPHS` tile set in all three variants — the
  app's own `systemsketch-rounded-rect` has no tldraw asset to borrow, and
  splitting "most geo tiles are tldraw's own SVG, one is hand-drawn" reads
  as a bug, not a feature.
- **V3 "Inline"** — the densest: `x`/`y`/`w`/`h`/`rotation`/`opacity` print
  their letter/symbol prefix (`X`, `Y`, `W`, `H`, `°`, `%`) INSIDE the field
  (`ScrubNumber`'s new `prefixText` prop) instead of a caption row above it;
  an enum past 4 options (fill, dash, font — all 5-6 wide) collapses from a
  segmented row to a `CompactSelect` styled to `panelFieldBase`; geometry
  stays a tile grid; the per-section reset stays, same as V1.

**The mandatory behaviours, once, shared by all three:**

1. **Drag-to-resize** (`kit.tsx`'s `ResizeHandle` + `useDockWidth`): an 8px
   handle on the dock's left edge, pointer-captured, clamped 240-480px,
   double-click resets to 280, persisted to `localStorage`
   (`tldraw_styling_lab.dockWidth`) — skipped under `?seed=`, the same rule
   `persistenceKey` already follows (`mount.tsx`), so a journey run always
   starts from the documented 280 default.
2. **Whole-field scrub + click-to-edit** (`ScrubNumber.tsx`, above).
3. **Explicit ink on every control** — no button/input inherits `color`
   from an ancestor.
4. **Nothing clips at 240px** — every segment/tile/field stays inside the
   dock at the floor width.

**Two real bugs the new checks caught, not inferred, both in the mandatory
behaviours above:**

- The explicit-ink rule (`app.css`) is `:where([data-testid="inspector"]
  [data-variant]) :where(button, input) { color: var(--v-surface) }` —
  `:where()` zeroes its OWN specificity so a real utility class (like an
  unpressed segment's `text-[var(--v-muted)]`) always wins. That was not
  enough on its own: the rule sat OUTSIDE every `@layer`, and this file's
  own top-of-file import puts Tailwind's utilities INSIDE `layer(utilities)`
  — cascade layers settle precedence BEFORE specificity is ever compared, so
  an unlayered rule beats every layered one regardless of `:where()`.
  Measured: every unpressed segment read as pressed until the ink rule moved
  inside `@layer utilities` too. `:where()` and the layer are two different
  axes of the cascade; neither alone fixed it.
- `ResizeHandle` rendered BEFORE the tab bar in JSX. Both are normal-flow
  siblings with no z-index, so the LATER one (the tab bar) painted on top
  wherever their boxes overlap — which includes the handle's own inner half
  (`-ml-1 w-2` straddles the dock's left edge). Every drag on the handle
  silently produced zero width change and no console error, because the
  pointerdown never reached it. `z-10` on the handle fixed it; found by the
  new "resize to 360 survives a reload" check, not by looking.

**Registry fallout, unplanned but real:** M5b's `registry.json`/
`tests/registry.test.ts` (a shadcn registry item for the whole Inspector)
predates this branch and asserts every registered file's `target` is FLAT
under `src/inspector/` — this branch's own `variants/` subfolder (asked for
by name in its own brief) fails that regex. Loosened it to allow one
optional subdirectory level (`tests/registry.test.ts`, with a WHY pointing
here) rather than flattening the folder structure the brief explicitly
wanted; added `variants/theme.ts`/`kit.tsx`/`tldrawIcons.tsx` to
`registry.json`'s file list, `select` to `registryDependencies`, and
`@tldraw/assets` to `dependencies`, then reran `npm run registry:build`.

**Deliberately not built:**

- **A "+"/"add a fill" affordance.** Open-pencil's own screenshots show one;
  this app's `fill`/`stroke` are always-present `StyleProp`s on the model
  side, never addable/removable, so a `+` button here would control nothing
  real — exactly the "a control that does nothing is a lie" failure
  `inspectorModel.ts`'s own module comment already names.
  `inspectorModel.ts` was not touched by this branch (the frame `showColors`
  lane owns it this round; the one place variants reads it is the existing
  `control.overridden` flag, already there).
- **ThemePanel.tsx's own markup.** Its palette re-themes automatically —
  it mounts inside the same `[data-testid="inspector"][data-variant]` div
  Inspector.tsx's dock does, and every shadcn token it already reads
  (`bg-background`, `text-foreground`, `border-border`, …) is re-pointed at
  the same `--v-*` palette (see `app.css`'s own WHY) — `theme_smoke.mjs`'s
  existing 12 checks stayed green unmodified, proof the cascade actually
  reaches it. Its OWN controls (the Light/Dark mode `ToggleGroup`, the named-
  colour section headers) were not rebuilt onto `kit.tsx`'s
  `SegmentedControl`/`Section` — same visual family already, lower priority
  than the Inspect tab Zach actually rejected, and out of this pass's time
  budget. Flagged, not silently skipped.
- **Per-row "eye" visibility toggles** open-pencil's screenshot shows next to
  Fill/Stroke list rows — there is no model-side "hide this style" concept
  to wire it to; building the affordance without the behaviour is the same
  lie the `+` button would have been.

`npm run check`: `tsc -b` clean, 123 vitest tests (the existing 116 plus
`registry.test.ts`'s 7, all still green after the folder-target fix),
`test:pixels` unchanged (0/0/763 outside the same 313380/331436 masked px —
the variant/resize additions never touch anything the gate measures at its
default 280px/light state), `test:inspector` **81/81** (the original 33 plus
16 new mandatory-behaviour checks × 3 variants), `test:compat` 14/14,
`test:theme` 12/12.

## 2026-09-07 — showColors is opt-in

M3 landed `FrameShapeUtil.configure({ showColors: true })` unconditionally,
which broke the M4 compat invariant the moment the two lanes merged:
`tests/compat_smoke.mjs`'s "whole-board diff is 0 on a pure layer-1 board"
measured **83 changed px** on the seeded board — a plain `color: 'black'`
frame, no override anywhere — because `showColors` painted the lab's own
`showColorsFillColor`/`showColorsStrokeColor` derived from `props.color`
instead of stock's hard-coded black default, and those two values only
happen to agree when the frame's colour IS black.

**Fix: `showColors` is off by default, opt-in via `?frames=colors`**
(`configuredUtils.ts`'s `FRAME_COLORS_ENABLED`, read once at module scope —
a `ShapeUtil` option is fixed at `.configure()` time, the same reason
`board/mount.tsx`'s `readSeedMode()` reads `location.search` once rather
than in a hook). Stock-by-default is this lab's first rule; a frame's own
colour is a real layer-2 addition someone opts into, not something a plain
load should silently paint. `tests/compat_smoke.mjs`'s check is back to 0,
unconditionally.

**The frame Colour row is gated on the same switch, two ways.**
`inspectorModel.ts`'s `styleReaches` already asked the right question
(`editor.styleProps.frame?.has(DefaultColorStyle)`) and automatically tracks
the new default correctly, no change needed there. Added `frameShowColorsOn`
alongside it — reads `editor.getShapeUtil(shape).options.showColors` directly
— as a second, more explicit check ANDed onto the Colour row's `applies` for
frames specifically: belt-and-suspenders after a real regression, not
because `styleReaches` was wrong.

**Journeys**: `tests/inspector_smoke.mjs`'s chrome-route navigation now
carries `&frames=colors` (its frame checks need the switch on);
`tests/compat_smoke.mjs` stays on plain `?seed=stock` for checks (a)-(d) and
adds one more (e): a fresh `&frames=colors` navigation, with the frame
recoloured to `blue` (the seed's `black` is indistinguishable from stock's
own hard-coded black default and would prove nothing), asserts the
**whole-board** reading is a real, non-zero, non-refused difference — the
layer-2 floor made visible, not a bug.

**A real, separate finding along the way**: the frame's own PER-SHAPE row in
that same check reads **0**, even with the recolour — not a bug in this fix,
a floor of `runStockCheck`'s per-shape crop. A frame's heading-label geometry
is `excludeFromShapeBounds: true` (`FrameShapeUtil.getGeometry`), so the crop
`editor.getShapePageBounds(id).expandBy(8)` takes around a frame's own bounds
never includes the label pill where `showColorsHeadingFill`/
`showColorsHeadingStroke` diverge most from stock — and the body's own 1px
`showColorsStrokeColor` border is thin enough that pixelmatch's
anti-aliasing tolerance (default `includeAA: false`, `PIXELMATCH_THRESHOLD =
0.1`) absorbs nearly all of it at this shape's size, measured directly:
sampling the two rasterized crops pixel-by-pixel found a maximum channel-sum
difference of 8 anywhere in a 316×236 image. The whole-board crop is not
geometry-bounds-clipped the same way and reads the real 87px difference.
Documented in `tests/compat_smoke.mjs` at the point it's measured, not fixed
here — it's a characteristic of the existing M4 diffing tool against a thin,
near-white UI element, not something this switch caused.

**Also fixed, found while verifying the switch end to end**: the Theme
tab's `TabsList` (`Inspector.tsx`) started at the dock's own `top: 0`,
which — because the dock is `position: absolute` (M2's own load-bearing
choice for the pixel gate, kept) rather than a normal-flow flex sibling the
way stock tldraw's `.tlui-style-panel__wrapper` is — physically overlapped
the M4 `StockCheckButton`'s `.tlui-share-zone` (~32px tall, top-right) the
moment that button landed on `main`. `elementFromPoint` at the Theme tab
trigger's own center returned the Stock Check button, not the tab, so no
click ever reached it — `theme_smoke.mjs`'s very first check
("the Theme tab mounts ThemePanel") caught it. Fixed with a `mt-9` clearance
on the `<Tabs>` element (the outer `data-testid="inspector"` rect — what the
pixel gate masks — is unchanged).

`npm run check` is green on all four journeys: `tsc -b`, 115 vitest tests,
the pixel gate (0/0/763), `test:inspector` (33/33), `test:compat` (14/14,
13 + 1 new), `test:theme` (12/12).

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
## 2026-09-07 — M5b: the Inspector shipped as a shadcn registry

Landed the M5b brief on worktree `m5b-registry`: `registry.json` with one
composite item (`tldraw-inspector`), `npm run registry:build` (`shadcn
build`, committed `public/r/**`), `npm run registry:serve` (a plain Node
static server on :5182), and `tests/registry.test.ts` — the producer-side
half of the drift alarm, 7 checks, part of `npm run check` for free (it's a
vitest file; nothing to wire up).

**Item type: `registry:ui`, not `registry:component`.** The item is
consumed the way a UI primitive is — dropped into `components: { StylePanel:
Inspector }`, tldraw's own extension seam for exactly this kind of
component — even though it bundles the field model, overrides and paint
seam alongside the view. shadcn's schema lets every *file* carry its own
`type` independent of the item's; the item-level type only had to describe
"what a consumer does with this," and "mount it as a panel" is closer to
`ui` than to a page-level `component`.

**`dependencies` grew two entries past the M5b brief's literal three.** The
brief listed `tldraw@5.3.2`, `@base-ui/react@1.8.0`, `react-colorful`; the
actual grep across `src/inspector/*.ts*` also turned up `lucide-react`
(`ChevronRight`, `Inspector.tsx`) and `cn` (`Inspector.tsx`,
`ScrubNumber.tsx` — this repo generated shadcn components against the `cn`
npm package rather than a hand-rolled `@/lib/utils`, see M1's `components.json`).
Both are real runtime imports every installed copy needs; leaving them out
would have been the exact drift the sync test exists to catch, just
pre-loaded into the manifest instead of introduced later. `registry.test.ts`
enforces this generally (every non-relative, non-react/tldraw import must be
declared) rather than pinning the five names, so a future file added to the
item can't reintroduce the gap.

**`css`'s exact shape came from reading the installed `shadcn` CLI, not the
docs.** The registry-item-json reference shows `css` examples keyed by plain
selectors (`"@layer base": { "h1": {...} }`) but never a body-less directive
like `@custom-variant dark (&:is(.dark *));` — app.css's own line. Reading
`node_modules/shadcn/dist/chunk-B2MD6U5O.js`'s `update-css` postcss plugin
directly: a top-level key starting with `@` is split into `name` + `params`
by `/@([a-zA-Z-]+)\s*(.*)/`, and an **empty-object value** (`{}`) becomes a
semicolon-terminated at-rule with no body — i.e. the whole `@custom-variant
dark (...)` text is the *key*, mapped to `{}`. A non-`@` key goes through
`Ge()`, a plain CSS rule whose value is either raw decl pairs or a raw CSS
string. Shipped:
```json
"css": {
  "@custom-variant dark (&:is(.dark *, .tl-theme__dark *))": {},
  "[data-slot=\"popover-content\"], [data-slot=\"tooltip-content\"]": {
    "font-family": "var(--font-sans)"
  }
}
```
Verified empirically: `npx shadcn build` on this exact registry.json
produced the expected item JSON (checked by hand), and this is the shape
SystemSketch's `npx shadcn add` actually consumed — see its own log entry.
Kept the `tooltip-content` half of app.css's rule alongside
`popover-content` (the brief named only the popover half) — they're one CSS
rule in app.css, not two, and dropping half of it would ship the exact
font bug M2's audit fixed, just for `Tooltip` instead of `Popover`. The
`.tl-container` token bridge (`app.css`'s `.tl-container { --background:
var(--tl-color-panel); ... }` block) is deliberately NOT in `css` — a
consumer owns its own bridge onto its own theme (SystemSketch's is `--ss-*`,
not `--tl-*`); shipping this lab's copy would silently override it.

**Two peer branches (`src/inspector/**`, `src/compat/**`) were not touched.**
No change this milestone needed to touch inspector source — the registry
only describes files that already exist.

**`public/r/**` is committed, not gitignored.** See README's new "Registry"
section for the WHY (a registry has to be servable from a plain checkout;
the drift alarm is what keeps a committed build from lying).

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

---

## V7 "Figma exact" — what the journey found once it could actually run

Zach's brief: copy Figma's ui3 Design panel for a rectangle "pixel for pixel",
his worked example being Opacity — Figma writes the *word* and uses a specific
transparency-checker glyph, ours did neither. All 13 `v7:` checks now pass,
including that one; the panel's structure, metrics, icon paths and bindings are
asserted against the real Figma DOM quoted in the `figmaExact/` file headers.

Getting there surfaced four defects that had nothing to do with V7, three of
them **masked behind a single failing check**. Recording them because the
masking is the more important lesson.

**A popup could silently leave the theme scope.** Base UI captures a portal
target once per popup. `dockPortalContainer()` is a live query, so returning
`null` even momentarily — dock between mounts, a theme flip re-rendering it —
made Base UI fall back to `<body>`, which is *outside* `.tl-container` and
therefore outside everything that themes this app: the `.tl-theme__dark` class,
the `--tl-*` properties, the `--popover` bridge. Such a popup reads `:root`'s
light default and paints white in dark mode, permanently, with no error. It now
falls back to `.tl-container`, which always exists and carries both.

**A wrong explanation I published and then had to retract.** I claimed the
`--tl-*`-to-shadcn bridge was inert because Tailwind v4's `@theme` resolves
`--color-popover: var(--popover)` at `:root`, so descendants inherit an
already-resolved light value, and I re-declared 17 aliases in both scopes on
that basis. **It is false for this build.** `app.css` uses `@theme inline`,
whose entire purpose is to substitute at use time: the built rule is literally
`.bg-popover{background-color:var(--popover)}` and `--color-*` is never
consulted. A round-2 judge caught it. Worse, my OWN diagnostic had printed
`paintedBy: [".bg-popover => var(--popover)"]` and I read past it, because the
`@theme` story was more interesting than the measurement in front of me. The
aliases are reverted. Recorded rather than deleted because the failure mode —
preferring a satisfying mechanism to the evidence already on screen — is the
one worth remembering.

**Escape does not close the colour picker.** Base UI never moves focus into the
popup, so its Escape handler never fires. Left unfixed — out of scope for a
Figma-fidelity pass — but it has now caused two *test* failures by leaving the
picker open on top of whatever the next step wanted to click, so it is worth
fixing properly and is not merely cosmetic.

**V6's section header was 35px against V4/V5's 32px band** (19px title
line-height + 2×8px). A real 3px rhythm break, invisible until the check that
measures it could be reached. Fixed with `min-h-8` + `py-1.5` — `min-h` because
the summary chips beside the title wrap.

### The "unexplained failure" was my own measurement

`dark: the picker popup background matches the dock` reported the popup as
`rgb(255,255,255)` against a `rgb(42,42,42)` dock. Every other signal said dark:

    --popover        #2a2a2a   (on the popup element itself)
    paintedBy        [".bg-popover => var(--popover)"]   (the only painting rule)
    docks 1, hostIsFirstDock true, mounted 1, open 1, no inline style

Four hypotheses were raised and all four were wrong: the `@theme` alias story
(refuted by a judge using my own diagnostic output), an inline `background`
shorthand (a round-3 judge's lead — measured, absent), comparing against the
wrong dock (measured, `docks=1`), and a stale or duplicate popup (measured,
one element).

**Capturing the popup at the instant of measurement ended it in one run: it
renders correctly dark.** The pixels were never wrong. `getComputedStyle`'s
`backgroundColor` read was, and I spent roughly ten journey runs treating that
number as ground truth about the product. The check now asserts the popup
resolves the dock's own `--popover` — the real regression worth catching, since
a popup portaled out to `<body>` loses the theme scope entirely — and keeps a
rendered capture (`tests/out/inspector_smoke/dark-popover-rendered.png`) so a
human can look instead of trusting a number that has already lied once.

`checklist.known()` survives with no call sites. It is kept deliberately: the
API and its non-zero exit are correct and the next genuinely unexplained
failure should use it rather than being deleted. That it ended up unused here
is the better outcome — the exemption existed for a defect that never existed.

**Method note, worth more than the fixes.** Four hypotheses about this bug
measured plausibly and were wrong (the popup covering its own trigger; a
`data-instant:!animate-none` class blocking unmount; the `@theme` aliases; and
earlier, a bare `querySelector` matching the wrong popup — that one was real).
The recurring trap: **light mode passes by coincidence**, because `:root`'s
fallback white is exactly the colour the light panel wants, so a broken token
looks correct until dark runs. Every wrong turn came from reasoning about the
symptom instead of measuring the element; a ten-line probe ended it each time.
