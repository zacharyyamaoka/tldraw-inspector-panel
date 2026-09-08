// WHY this file must NEVER import src/inspector/configuredUtils.ts, even
// transitively: GeoShapeGeoStyle.values and DefaultColorStyle.values are
// mutable module-singleton arrays (EnumStyleProp#addValues in
// @tldraw/tlschema mutates in place, permanently, for the life of the module
// graph). configuredUtils.ts's `GeoShapeUtil.configure({ customGeoTypes })`
// appends 'systemsketch-rounded-rect' to GeoShapeGeoStyle.values the instant
// it is imported — so the only place either enum is observable in its real,
// unmutated, stock shape is a module graph that has never touched that file.
// Vitest gives every test file its own module registry by default, which is
// what makes that guarantee real rather than aspirational; see
// src/compat/stockEnums.ts's own WHY for what this protects.
import { DefaultColorStyle, GeoShapeGeoStyle } from '@tldraw/tlschema'
import { describe, expect, it } from 'vitest'
import { STOCK_COLOR_VALUES, STOCK_GEO_VALUES } from './stockEnums'

describe('stockEnums', () => {
  it('STOCK_GEO_VALUES matches a fresh, unmutated GeoShapeGeoStyle.values', () => {
    expect([...GeoShapeGeoStyle.values]).toEqual([...STOCK_GEO_VALUES])
  })

  it('STOCK_COLOR_VALUES matches a fresh, unmutated DefaultColorStyle.values', () => {
    expect([...DefaultColorStyle.values]).toEqual([...STOCK_COLOR_VALUES])
  })
})
