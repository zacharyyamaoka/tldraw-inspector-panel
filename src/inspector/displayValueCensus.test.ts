/**
 * The census's own oracle: parse the `*ShapeUtilDisplayValues` interfaces
 * straight out of `node_modules/tldraw` at test time, rather than trusting
 * `displayValueCensus.ts`'s hand-written key lists. A tldraw bump that adds,
 * renames or removes a display value shows up here as a mismatch between the
 * parsed keys and `REACHED ∪ DOCUMENTED`, before it ever reaches a person
 * clicking around the panel.
 */
// WHY a file-scoped reference rather than adding "node" to tsconfig.app.json's
// `types`: that array is what keeps the browser app project honest about
// having no Node globals in scope — this is the one file in `src/` that
// genuinely runs under Node (vitest) and reads the filesystem, so it gets its
// own ambient types instead of widening every other file's.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
	DISPLAY_VALUE_SOURCES,
	DOCUMENTED,
	REACHED,
	type DisplayValueShapeKind,
} from './displayValueCensus'

const here = dirname(fileURLToPath(import.meta.url))
const tldrawShapesRoot = join(here, '..', '..', 'node_modules', 'tldraw', 'src', 'lib', 'shapes')

/**
 * Pull the members of one `export interface Name { ... }` (or tldraw's one
 * `export type Name = object` alias, treated as zero members) out of a source
 * file's text.
 *
 * WHY a regex and not the TypeScript compiler API: every interface here is a
 * single, non-nested `{ key: type }` block — no inline object types, no
 * generics — so a line-scoped pattern is the whole grammar this needs, the
 * same trade this repo's `docs/build_font_size_type_role.py` donor precedent
 * (named in the module header) makes against tldraw's own source.
 */
function parseInterfaceKeys(source: string, interfaceName: string): string[] {
	const aliasToObject = new RegExp(`\\btype\\s+${interfaceName}\\s*=\\s*object\\b`)
	if (aliasToObject.test(source)) return []

	const header = new RegExp(`\\binterface\\s+${interfaceName}\\b[^{]*\\{`)
	const headerMatch = header.exec(source)
	if (!headerMatch) {
		throw new Error(`could not find "interface ${interfaceName}" in the given source`)
	}
	// WHY a brace-depth scan and not a `{([\s\S]*?)\n}` regex: `{}` on one
	// line (image/video's empty interfaces) has no `\n` before its close, so a
	// non-greedy regex skips straight past it to the NEXT `\n}` in the file —
	// which belongs to a wholly unrelated interface further down. Counting
	// braces from the interface's own `{` is the only thing that finds ITS
	// close reliably, empty or not.
	const bodyStart = headerMatch.index + headerMatch[0].length
	let depth = 1
	let index = bodyStart
	while (depth > 0) {
		if (index >= source.length) {
			throw new Error(`unbalanced braces reading "interface ${interfaceName}"`)
		}
		if (source[index] === '{') depth += 1
		else if (source[index] === '}') depth -= 1
		index += 1
	}
	const body = source.slice(bodyStart, index - 1)
	const keys: string[] = []
	for (const line of body.split('\n')) {
		const field = /^\s*(\w+)\s*:/.exec(line)
		if (field) keys.push(field[1])
	}
	return keys
}

function readLiveKeys(kind: DisplayValueShapeKind): string[] {
	const { file, interfaceName } = DISPLAY_VALUE_SOURCES[kind]
	const source = readFileSync(join(tldrawShapesRoot, file), 'utf8')
	return parseInterfaceKeys(source, interfaceName)
}

describe('display value census', () => {
	const kinds = Object.keys(DISPLAY_VALUE_SOURCES) as DisplayValueShapeKind[]

	for (const kind of kinds) {
		it(`${kind}: every live display-value key is reached or documented`, () => {
			const liveKeys = readLiveKeys(kind)
			const reached = REACHED[kind]
			const documented = DOCUMENTED[kind]

			const missing = liveKeys.filter((key) => !reached.has(key) && !(key in documented))
			expect(missing, `${kind} has undeclared keys: ${missing.join(', ')}`).toEqual([])

			// The other direction: a key this file claims for a shape that no
			// longer declares it (a tldraw removal) is exactly as stale as a
			// missing one, and would otherwise rot silently.
			const liveSet = new Set(liveKeys)
			const stale = [...reached, ...Object.keys(documented)].filter((key) => !liveSet.has(key))
			expect(stale, `${kind} claims keys tldraw no longer declares: ${stale.join(', ')}`).toEqual([])
		})
	}

	it('prints the totals — reached / documented / total, re-measured against the pinned tldraw', () => {
		let reachedTotal = 0
		let documentedTotal = 0
		let liveTotal = 0
		for (const kind of kinds) {
			liveTotal += readLiveKeys(kind).length
			reachedTotal += REACHED[kind].size
			documentedTotal += Object.keys(DOCUMENTED[kind]).length
		}
		console.log(`[display value census] reached ${reachedTotal} / documented ${documentedTotal} / total ${liveTotal} (tldraw@5.3.2)`)
		expect(reachedTotal + documentedTotal).toBe(liveTotal)
		// A floor, not a target: the number itself is provenance (see
		// displayValueCensus.ts's module header), but a census that quietly
		// dropped to single digits would mean the parser broke, not that
		// tldraw shrank.
		expect(liveTotal).toBeGreaterThan(40)
	})
})
