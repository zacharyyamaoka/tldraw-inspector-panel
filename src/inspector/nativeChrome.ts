// WHY this exists as its own tiny module rather than living inline in
// Inspector.tsx: StockCheckButton.tsx needs the same chrome and imports
// FROM Inspector.tsx's own file would be circular (Inspector.tsx renders
// StockCheckButton). One shared constant, two call sites.
//
// Zach's own feedback, live, looking at the running app next to the real
// stock style panel: "make the stock check and drawer button better match
// the stock menu next to it." Measured against tldraw.css's own
// `.tlui-style-panel__wrapper` rule — `background-color: var(--tl-color-
// panel); box-shadow: var(--tl-shadow-2); border-radius: var(--tl-radius-
// 3);`, no border — rather than shadcn's own Button/border chrome either
// control had been using before. Both the drawer tab and the Stock check
// button now share this so the pair reads as one native-feeling unit next
// to the panel, not two different UI kits sitting side by side.
// WHY `appearance-none border-0 font-sans text-[11px] leading-none` leads the
// list: this project loads Tailwind v4 LAYERS ONLY, with no preflight (see
// app.css's own WHY — preflight resets the canvas out from under tldraw), so a
// raw <button> keeps every UA default. Measured on both controls: Chromium was
// painting `border: 2px outset` and sizing text at its own 13.333px. That
// border is the heavy dark ring around each button in light mode AND the pale
// halo in dark — an `outset` border derives its colour from `color-scheme`, so
// it flips light on a dark background — and the UA font size is why the drawer
// glyph rendered 8x14 instead of square. Nothing here is a style choice; it is
// the reset preflight would have done, applied to the two raw buttons that
// need it. The shadow/radius/background below were already right: they are
// tldraw's own `.tlui-style-panel__wrapper` values, verified identical.
export const NATIVE_PANEL_CHROME = 'appearance-none border-0 font-sans text-[11px] leading-none bg-[var(--tl-color-panel)] text-[var(--tl-color-text)] shadow-[var(--tl-shadow-2)] rounded-[var(--tl-radius-3)]'
