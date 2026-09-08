/**
 * The two pure pieces the field still owns.
 *
 * The pointer maths belongs to Base UI's `NumberField` now. What remains is
 * what no numeric-input library ships: the expression parser — the one place a
 * text field turns into an execution surface, so its refusals matter more than
 * its successes — and the float-dust rounding.
 */
import { describe, expect, it } from 'vitest'

import { evaluateNumericExpression, quantize } from './ScrubNumber'

describe('evaluateNumericExpression', () => {
	it('reads plain numbers, including decimals and negatives', () => {
		expect(evaluateNumericExpression('42')).toBe(42)
		expect(evaluateNumericExpression(' 3.5 ')).toBe(3.5)
		expect(evaluateNumericExpression('-8')).toBe(-8)
	})

	it('evaluates the four operators with real precedence', () => {
		expect(evaluateNumericExpression('100/2')).toBe(50)
		expect(evaluateNumericExpression('12*3')).toBe(36)
		expect(evaluateNumericExpression('2+3*4')).toBe(14)
		expect(evaluateNumericExpression('(2+3)*4')).toBe(20)
	})

	it('applies a leading operator to the value already in the field', () => {
		// Figma's `+6` / `/2`. This is most of why anyone types into these boxes.
		expect(evaluateNumericExpression('+6', 10)).toBe(16)
		expect(evaluateNumericExpression('/2', 10)).toBe(5)
		expect(evaluateNumericExpression('*3', 10)).toBe(30)
	})

	it('treats a leading minus as a negative number, not a subtraction', () => {
		expect(evaluateNumericExpression('-8', 10)).toBe(-8)
	})

	it('refuses a relative expression with nothing to be relative to', () => {
		expect(evaluateNumericExpression('+6', null)).toBeNull()
		expect(evaluateNumericExpression('+6')).toBeNull()
	})

	it('drops a trailing unit so a pasted `40%` still reads', () => {
		expect(evaluateNumericExpression('40%')).toBe(40)
	})

	it('refuses a comma rather than guessing which kind it is', () => {
		// `1,5` is a decimal comma in most of the world. Stripping it returned
		// 15 — a field that silently multiplies your input by ten is worse than
		// one that refuses it.
		expect(evaluateNumericExpression('1,5')).toBeNull()
		expect(evaluateNumericExpression('1,200')).toBeNull()
	})

	it('refuses an expression long enough to overflow the parser', () => {
		// 12 KB of parens threw an uncaught RangeError from a text field.
		expect(evaluateNumericExpression('('.repeat(6000) + '1')).toBeNull()
		expect(evaluateNumericExpression('-'.repeat(10000) + '1')).toBeNull()
	})

	it('refuses anything that is not arithmetic', () => {
		// The field must never become an execution surface: a board is a
		// document other people can send you, so this is a refusal test first
		// and a parsing test second.
		for (const input of [
			'alert(1)',
			'window',
			'1;2',
			'`x`',
			'Math.PI',
			'2**3',
			'',
			'   ',
			'--',
			'(1',
			'1/0',
			'1 2',
		]) {
			expect(evaluateNumericExpression(input), input).toBeNull()
		}
	})
})

// The shift/alt multipliers moved to Base UI's `largeStep`/`smallStep`, which
// applies them to the scrub as well as the keyboard — the thing the hand-rolled
// `stepMultiplier` existed for. There is nothing of ours left to unit test
// there; `tests/primitive_inspector_smoke.mjs` proves the real drag.

describe('quantize', () => {
	it('rounds away the float dust a multiplied step leaves behind', () => {
		expect(quantize(0.1 + 0.2, 0.1)).toBe(0.3)
		expect(quantize(1.0000000001, 1)).toBe(1)
	})

	it('keeps the precision a small step needs', () => {
		expect(quantize(0.35, 0.05)).toBe(0.35)
		expect(quantize(2.125, 0.01)).toBe(2.125)
	})
})
