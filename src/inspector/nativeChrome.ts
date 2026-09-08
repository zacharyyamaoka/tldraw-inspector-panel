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
export const NATIVE_PANEL_CHROME = 'bg-[var(--tl-color-panel)] text-[var(--tl-color-text)] shadow-[var(--tl-shadow-2)] rounded-[var(--tl-radius-3)]'
