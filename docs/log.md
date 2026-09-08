# Log

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

### Left for later milestones

- The Figma-shaped inspector itself (M2+) — this milestone only proves the
  ground it will stand on is pixel-safe.
- `docs/log.md`'s "model decides, view draws" and "consumed by registry"
  rules (README) — named now, implemented later.
- `mount-*.js` is a single ~1.9 MB chunk (tldraw); `vite build` warns about
  it. Not addressed here — code-splitting is a product decision for when
  there's a second real entry point's worth of code to split against.
