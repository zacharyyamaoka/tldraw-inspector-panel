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
2. **The model decides, the view draws.** Live as of M2:
   `src/inspector/inspectorModel.ts` is 1,182 lines of plain TypeScript with
   no React and no tldraw-flavoured JSX — 50 `FieldSpec` entries, each with
   `applies`/`read`/`write`, answering every question of *what a shape can
   be*. `src/inspector/Inspector.tsx` renders whatever that model hands back
   and nothing else; it does not know what a rectangle is.
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

Runs `tsc -b`, the vitest suite (`theme_bridge.test.ts` plus the M2 unit
suites below), the pixel gate (`tests/stock_pixels.mjs`), and the Inspector
journey (`tests/inspector_smoke.mjs`) in sequence. `test:unit`, `test:pixels`
and `test:inspector` run any one alone.

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
`stock.html?seed=stock` (the stock route, seam withheld) — 23 checks, every
one read off the editor's own record or the painted SVG/computed style, never
off the panel's own DOM alone.

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
(`src/board/mount.tsx`), exports the live board the way a `.tldr` save would
(`serializeTldrawJson`), reparses it against a fresh, unconfigured
`createTLSchema()`, mounts that store in a second, hidden `<Tldraw>`
(`src/compat/hiddenStockMount.tsx`), and diffs what each side actually paints:
whole board first, then every shape stock tldraw can also render, ranked by
divergence (`src/compat/stockCheck.ts`, `src/compat/StockCheckReport.tsx`).
This is the instrument the plan's §4 calls for — it makes layer 2 (paint
overrides carried in `shape.meta`, `getCustomDisplayValues`) visible and
ranked, since a schema that never installed those overrides can't paint them.
A parse rejection (a board stock tldraw genuinely refuses) is reported as the
loudest possible row and nothing else runs.

Run it: click "Stock check" top-right in the running app, or drive it
headlessly with `npm run test:compat` (builds, serves `dist/` on a free port,
opens the seeded board, clicks the button, reads the report back out of the
DOM). Threshold is `pixelmatch` at `0.1` — looser than the M1 pixel gate's
byte-exact `0`, because M4's diffs are two independently-rasterized SVG→canvas
exports of shapes that render the same underlying record; `0.1` absorbs
anti-aliasing jitter between them without hiding a real divergence.

**Known blind spot:** the white text halo (`--tl-text-outline`) is a CSS
variable, not an exported property — it never shows up as a diff on either
side even where it visibly differs on-screen. Stated in the report's footer,
not silently swallowed.

**Interaction with the M1 pixel gate.** `components.SharePanel` is wired in
`src/board/mount.tsx`, the one file `bare.html` and `index.html` both build
their board from — so `bare.html` now paints the same unstyled button
`index.html` paints styled. `tests/stock_pixels.mjs`'s byte-exact gate
(threshold 0) currently fails on exactly that: ~11.5k / ~14k changed px out of
~1.4M, both from the button's pixels, nothing else. This is expected fallout
of putting a real chrome control on the one shared seam, not a regression in
what the gate was built to prove (Tailwind/shadcn/Base UI stay inert *inside
the canvas*) — `tests/stock_pixels.mjs` is out of this branch's confined edit
list (a peer is mid-flight on it for M2) and is not touched here; whoever
merges M4 needs to teach that gate about the button before `npm run check`
goes green again. See `docs/log.md`'s M4 entry.
