// The stock `geo` and colour vocabularies a REAL, unconfigured stock tldraw
// validates records against — captured as static literals rather than read
// live off `GeoShapeGeoStyle.values` / `DefaultColorStyle.values` at check
// time, because those are mutable module-singleton arrays
// (`EnumStyleProp#addValues` in `@tldraw/tlschema` mutates in place) and
// `src/inspector/configuredUtils.ts`'s `GeoShapeUtil.configure({
// customGeoTypes })` permanently appends `'rounded-rect'` to
// `GeoShapeGeoStyle.values` the moment it is imported anywhere in this page's
// module graph — which `src/App.tsx` and `src/stock.tsx` both do before the
// Stock check button ever runs. By the time `runStockCheck` executes, the
// "live" enum in this very page already includes the app's own extras, so a
// record carrying them parses cleanly into the hidden "stock" mount too — a
// blind spot no in-browser oracle sharing this JS realm can see. These two
// lists are the out-of-band ground truth `stockCheck.ts`'s pre-flight rule
// checks against instead, and `stockEnums.test.ts` (which never imports
// `configuredUtils.ts`, even transitively) keeps them honest against a fresh,
// unmutated import of the real thing.
export const STOCK_GEO_VALUES = [
  'cloud', 'rectangle', 'ellipse', 'triangle', 'diamond', 'pentagon', 'hexagon',
  'octagon', 'star', 'rhombus', 'rhombus-2', 'oval', 'trapezoid', 'arrow-right',
  'arrow-left', 'arrow-up', 'arrow-down', 'x-box', 'check-box', 'heart',
] as const

export const STOCK_COLOR_VALUES = [
  'black', 'grey', 'light-violet', 'violet', 'blue', 'light-blue', 'yellow',
  'orange', 'green', 'light-green', 'light-red', 'red', 'white',
] as const

export type StockGeoValue = (typeof STOCK_GEO_VALUES)[number]
export type StockColorValue = (typeof STOCK_COLOR_VALUES)[number]

export function isStockGeoValue(value: unknown): value is StockGeoValue {
  return typeof value === 'string' && (STOCK_GEO_VALUES as readonly string[]).includes(value)
}

export function isStockColorValue(value: unknown): value is StockColorValue {
  return typeof value === 'string' && (STOCK_COLOR_VALUES as readonly string[]).includes(value)
}
