// WHY this test exists: `.tl-container`'s token bridge in src/styles/app.css aliases
// shadcn's tokens onto tldraw's own `--tl-*` custom properties by NAME, as plain text.
// A typo or a tldraw upgrade that renames/drops one silently resolves to nothing (the
// alias falls through to `initial`/inherited, not an error) — nothing in the build
// catches that. This test is the catch: parse the real declared names out of both
// files and diff them, so a phantom variable fails loudly instead of quietly.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

const appCss = readFileSync(resolve(repoRoot, 'src/styles/app.css'), 'utf8')
const tldrawCss = readFileSync(resolve(repoRoot, 'node_modules/tldraw/tldraw.css'), 'utf8')

function referencedTlVars(css: string): string[] {
  const matches = css.matchAll(/var\((--tl-[a-z0-9-]+)/g)
  return [...new Set([...matches].map((m) => m[1]))]
}

function declaredTlVars(css: string): Set<string> {
  const matches = css.matchAll(/(--tl-[a-z0-9-]+)\s*:/g)
  return new Set([...matches].map((m) => m[1]))
}

describe('theme bridge (.tl-container -> --tl-*)', () => {
  const referenced = referencedTlVars(appCss)
  const declared = declaredTlVars(tldrawCss)

  it('finds at least one --tl-* reference in app.css', () => {
    // WHY: a passing empty-set test would be a false green if the bridge block
    // were ever accidentally deleted — assert the fixture itself is non-trivial.
    expect(referenced.length).toBeGreaterThan(0)
  })

  it.each(referenced)('%s is declared in node_modules/tldraw/tldraw.css', (name) => {
    expect(declared.has(name)).toBe(true)
  })
})
