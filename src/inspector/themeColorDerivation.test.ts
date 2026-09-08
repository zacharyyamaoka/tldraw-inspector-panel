import { describe, expect, it } from 'vitest'

import { customColorName, deriveThemeColorRoles, mixHex } from './themeColorDerivation'

describe('mixHex', () => {
	it('returns the input unchanged at ratio 0', () => {
		expect(mixHex('#3366ff', 'white', 0)).toBe('#3366ff')
		expect(mixHex('#3366ff', 'black', 0)).toBe('#3366ff')
	})

	it('reaches pure white/black at ratio 1', () => {
		expect(mixHex('#3366ff', 'white', 1)).toBe('#ffffff')
		expect(mixHex('#3366ff', 'black', 1)).toBe('#000000')
	})

	it('lightens every channel monotonically toward white as the ratio grows', () => {
		const low = mixHex('#204080', 'white', 0.2)
		const high = mixHex('#204080', 'white', 0.8)
		const channel = (hex: string, index: number) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16)
		for (let index = 0; index < 3; index += 1) {
			expect(channel(high, index)).toBeGreaterThanOrEqual(channel(low, index))
		}
	})
})

describe('customColorName', () => {
	it('normalizes case and drops the leading #', () => {
		expect(customColorName('#AABBCC')).toBe('custom-aabbcc')
		expect(customColorName('aabbcc')).toBe('custom-aabbcc')
	})
})

describe('deriveThemeColorRoles', () => {
	it('carries all 14 TLDefaultColor roles', () => {
		const roles = deriveThemeColorRoles('#3366ff', 'light')
		expect(Object.keys(roles).sort()).toEqual([
			'fill', 'frameFill', 'frameHeadingFill', 'frameHeadingStroke', 'frameStroke',
			'frameText', 'highlightP3', 'highlightSrgb', 'linedFill', 'noteFill', 'noteText',
			'pattern', 'semi', 'solid',
		])
	})

	it('keeps solid and fill as the exact picked hex, in both modes', () => {
		const light = deriveThemeColorRoles('#3366ff', 'light')
		const dark = deriveThemeColorRoles('#3366ff', 'dark')
		expect(light.solid).toBe('#3366ff')
		expect(light.fill).toBe('#3366ff')
		expect(dark.solid).toBe('#3366ff')
		expect(dark.fill).toBe('#3366ff')
	})

	it('washes light-mode roles toward white and dark-mode roles toward black', () => {
		const light = deriveThemeColorRoles('#204080', 'light')
		const dark = deriveThemeColorRoles('#204080', 'dark')
		// light's frameFill is a pale tint (every channel rises toward 255);
		// dark's is a dim shade (every channel falls toward 0).
		expect(light.frameFill.toLowerCase() > '#204080').toBe(true)
		expect(dark.frameFill.toLowerCase() < '#204080').toBe(true)
	})

	it('mixes the two text-on-a-wash roles the opposite way, for contrast', () => {
		const light = deriveThemeColorRoles('#204080', 'light')
		// light mode washes toward white; its text role should darken instead.
		expect(light.frameText.toLowerCase() < '#204080').toBe(true)
		expect(light.noteText.toLowerCase() < '#204080').toBe(true)
	})
})
