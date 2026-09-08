/**
 * The producer-side drift alarm for the `tldraw-inspector` shadcn registry
 * item (M5b). Two things must never silently disagree:
 *
 *   1. registry.json's own claims about itself — every listed file exists,
 *      every `@/components/ui/<x>` import a listed file makes is declared in
 *      `registryDependencies`, and every other non-relative, non-React,
 *      non-tldraw import is declared in `dependencies`. A missing entry here
 *      is exactly the failure mode `shadcn add` cannot detect on its own: it
 *      installs whatever the JSON says and nothing else, so an import the
 *      manifest forgot becomes a silent runtime error in the consumer, not a
 *      build failure here.
 *   2. `public/r/tldraw-inspector.json` (the `shadcn build` output this repo
 *      commits, so the registry is servable from a plain checkout) must
 *      match the current working tree — the day inspectorModel.ts changes
 *      and nobody re-runs `npm run registry:build`, this test is what turns
 *      that into a red `npm run check` instead of a registry silently
 *      serving last month's file.
 *
 * See docs/log.md's M5b entry for the WHY on the registry shape itself
 * (item type, which files got explicit `dependencies` beyond the brief's
 * three, `css` vs `cssVars`).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY_JSON = join(ROOT, 'registry.json')
const BUILT_JSON = join(ROOT, 'public', 'r', 'tldraw-inspector.json')

type RegistryFile = { path: string; type: string; target?: string; content?: string }
type RegistryItem = {
  name: string
  type: string
  dependencies?: string[]
  registryDependencies?: string[]
  files: RegistryFile[]
  css?: Record<string, unknown>
}
type Registry = { items: RegistryItem[] }

function readRegistry(): Registry {
  return JSON.parse(readFileSync(REGISTRY_JSON, 'utf8')) as Registry
}

function inspectorItem(registry: Registry): RegistryItem {
  const item = registry.items.find((entry) => entry.name === 'tldraw-inspector')
  if (!item) throw new Error('registry.json has no tldraw-inspector item')
  return item
}

// A bare specifier's package name, version suffix and subpath stripped:
// `@base-ui/react/number-field` and `@base-ui/react@1.8.0` both -> `@base-ui/react`;
// `react-colorful` -> `react-colorful`. Relative and `@/...` alias imports are
// never passed in here (handled separately) so the leading `@` always means a
// scoped npm package, not the alias.
function packageNameOf(specifier: string): string {
  const withoutVersion = specifier.startsWith('@')
    ? '@' + specifier.slice(1).replace(/@[^/]*/, '')
    : specifier.replace(/@[^/]*/, '')
  const parts = withoutVersion.split('/')
  return specifier.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

// Every bare-specifier import in a TS/TSX source, as the raw specifier string
// (e.g. `@/components/ui/button`, `tldraw`, `react-colorful`).
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const importRe = /import\s+(?:type\s+)?(?:[\s\S]*?\bfrom\s+)?['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = importRe.exec(source))) {
    specifiers.push(match[1])
  }
  return specifiers
}

describe('registry.json (tldraw-inspector item)', () => {
  const registry = readRegistry()
  const item = inspectorItem(registry)

  it('lists at least one file', () => {
    expect(item.files.length).toBeGreaterThan(0)
  })

  it('every listed file exists on disk', () => {
    for (const file of item.files) {
      expect(existsSync(join(ROOT, file.path)), `${file.path} does not exist`).toBe(true)
    }
  })

  it('every listed file carries an explicit target under src/inspector/', () => {
    for (const file of item.files) {
      expect(file.type, `${file.path} should be registry:file`).toBe('registry:file')
      expect(file.target, `${file.path} has no target`).toMatch(/^~\/src\/inspector\/[^/]+$/)
    }
  })

  it('every @/components/ui/<x> import is declared in registryDependencies', () => {
    const registryDeps = new Set(item.registryDependencies ?? [])
    const missing: string[] = []
    for (const file of item.files) {
      const source = readFileSync(join(ROOT, file.path), 'utf8')
      for (const specifier of importSpecifiers(source)) {
        const uiMatch = specifier.match(/^@\/components\/ui\/(.+)$/)
        if (uiMatch && !registryDeps.has(uiMatch[1])) {
          missing.push(`${file.path}: ${specifier}`)
        }
      }
    }
    expect(missing, `imports missing from registryDependencies:\n${missing.join('\n')}`).toEqual([])
  })

  it('registryDependencies names nothing the files never import', () => {
    const used = new Set<string>()
    for (const file of item.files) {
      const source = readFileSync(join(ROOT, file.path), 'utf8')
      for (const specifier of importSpecifiers(source)) {
        const uiMatch = specifier.match(/^@\/components\/ui\/(.+)$/)
        if (uiMatch) used.add(uiMatch[1])
      }
    }
    for (const declared of item.registryDependencies ?? []) {
      expect(used.has(declared), `registryDependencies names "${declared}" but no file imports it`).toBe(true)
    }
  })

  it('every non-relative, non-alias, non-react/tldraw import is declared in dependencies', () => {
    const deps = new Set((item.dependencies ?? []).map(packageNameOf))
    const missing: string[] = []
    for (const file of item.files) {
      const source = readFileSync(join(ROOT, file.path), 'utf8')
      for (const specifier of importSpecifiers(source)) {
        if (specifier.startsWith('.') || specifier.startsWith('@/')) continue
        if (specifier === 'react' || specifier.startsWith('react/')) continue
        if (specifier === 'vitest') continue // test-only, not a runtime dependency the consumer installs
        const name = packageNameOf(specifier)
        if (!deps.has(name)) missing.push(`${file.path}: ${specifier}`)
      }
    }
    expect(missing, `imports missing from dependencies:\n${missing.join('\n')}`).toEqual([])
  })

  it('the built public/r/tldraw-inspector.json is fresh (matches the working tree)', () => {
    // Rebuild into a scratch directory rather than trusting the committed
    // public/r/ blindly — this is the actual drift alarm, not just a
    // same-file check.
    const scratchOut = join(ROOT, 'tests', 'out', 'registry-build-check')
    execFileSync('npx', ['shadcn', 'build', '-o', scratchOut], { cwd: ROOT, stdio: 'pipe' })
    const fresh = JSON.parse(readFileSync(join(scratchOut, 'tldraw-inspector.json'), 'utf8')) as RegistryItem
    expect(
      existsSync(BUILT_JSON),
      'public/r/tldraw-inspector.json is missing — run npm run registry:build',
    ).toBe(true)
    const committed = JSON.parse(readFileSync(BUILT_JSON, 'utf8')) as RegistryItem

    for (const freshFile of fresh.files) {
      const committedFile = committed.files.find((f) => f.path === freshFile.path)
      expect(committedFile, `public/r/tldraw-inspector.json is missing ${freshFile.path}`).toBeDefined()
      expect(
        committedFile!.content,
        `public/r/tldraw-inspector.json's copy of ${freshFile.path} is stale — run npm run registry:build`,
      ).toBe(freshFile.content)
    }
    expect(committed.files.length).toBe(fresh.files.length)
  })
})
