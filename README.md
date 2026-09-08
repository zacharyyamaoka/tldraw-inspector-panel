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

Zero `radix-ui` / `@radix-ui/*` anywhere in `package.json` or `src/` — every
`src/components/ui/*.tsx` file shadcn generated imports exclusively from
`@base-ui/react/*`.

## Three rules

1. **The record stays stock.** `tldraw@5.3.2`, pinned exactly, added to only
   through its own supported seams. This milestone's whole job is proving the
   chrome stack around it (Tailwind, shadcn, Base UI) is inert — see
   `tests/stock_pixels.mjs`.
2. **The model decides, the view draws.** *(arrives in a later milestone —
   the Figma-shaped inspector's state lives outside its React components.)*
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

Runs `tsc -b`, the vitest suite (`theme_bridge.test.ts` — every `--tl-*` name
`src/styles/app.css` references is checked against `node_modules/tldraw/
tldraw.css`), and the pixel gate (`tests/stock_pixels.mjs`, see below) in
sequence. `test:unit` and `test:pixels` run the vitest suite / the pixel gate
alone.

**The pixel gate** builds the app, serves `dist/` on a free port, and drives
headless Chrome (offline, self-hosted assets — no CDN dependency) through the
identical seeded board at `bare.html` (tldraw's own CSS only) and `index.html`
(the full chrome stack). `pixelmatch` at threshold 0 must find **zero**
changed pixels between them, in both the idle-board and style-panel-open
states. It then loads `index.html?seed=stock&preflight=1` — the one CSS file
(`tailwindcss/preflight.css`) the whole layers-only approach exists to keep
out — and asserts *that* diff comes back non-zero, as a mutation check that
the gate can actually fail. Captured PNGs and diff images land in
`tests/out/` (gitignored).

## URL switches (dev-only, read once at startup)

| switch | effect |
|---|---|
| `?seed=stock` | seeds the nine-shape probe board (fixed shape ids) instead of loading the persisted board, and skips `persistenceKey` entirely so the run never touches, or creates, real IndexedDB state |
| `?preflight=1` | (`index.html` only) dynamically imports `tailwindcss/preflight.css` — exists solely so the pixel gate's mutation check has something real to catch; never loads on a normal visit |

Every mount exposes `window.__lab = { editor, ready: true }` once tldraw is
mounted (and seeded, if `?seed=` was present) — that's what tests wait on.

## Two entries

- `index.html` → `src/main.tsx` → `src/App.tsx`: the real app, full chrome
  stack (`tldraw/tldraw.css` + `src/styles/app.css`), `persistenceKey:
  "tldraw_styling_lab"` on a plain load.
- `bare.html` → `src/bare.tsx`: the pixel gate's control — identical board,
  `tldraw/tldraw.css` only, no Tailwind/shadcn/Base UI anywhere.

Both mount through `src/board/mount.tsx` and seed through
`src/board/seed.ts` — the only two files either entry can construct a board
from, so they cannot silently drift apart.
