/**
 * Layer 3 (see the plan's §4): the palette and typographic scalars every
 * shape's paint resolves against, app-global rather than per-shape — so it
 * gets its own tab beside the Inspect dock (`Inspector.tsx`) rather than a
 * group inside it.
 *
 * Three things this tab is honest about, each with a WHY at the point it
 * matters below:
 * - `editor.updateThemes` is not tracked by tldraw's own undo stack (themes
 *   live on a plain `Atom`, never the record store) — the header hint says
 *   so, and "Reset to tldraw defaults" is the only way back.
 * - A custom colour name is module-global (`DefaultColorStyle.addValues`)
 *   and `registerColorsFromThemes` prunes any name absent from every
 *   registered theme — so "Add colour" must call it again immediately, not
 *   wait for a remount, or the Inspect tab's swatch rows never see the name
 *   it just added.
 * - Persistence is `localStorage` (`themeStorage.ts`), not the document —
 *   see that file's own WHY.
 */
import { useMemo, useState } from 'react'
import {
	registerColorsFromThemes,
	resolveThemes,
	useValue,
	type Editor,
	type TLDefaultColor,
	type TLTheme,
} from 'tldraw'
import { ChevronRight } from 'lucide-react'
import { HexAlphaColorPicker } from 'react-colorful'

import { Button } from '@/components/ui/button'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldDescription } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { isColor } from './Inspector'
import { ScrubNumber } from './ScrubNumber'
import { customColorName, deriveThemeColorRoles } from './themeColorDerivation'
import { writeStoredThemes } from './themeStorage'
import { fieldGroupLabelClass } from './variants/kit'

type PaletteMode = 'light' | 'dark'

/** The 14 `TLDefaultColor` roles, grouped and ordered the way the brief asks
 *  for — Fill, Frame, Note, Highlight. */
const ROLE_GROUPS: Array<{ label: string; roles: Array<keyof TLDefaultColor> }> = [
	{ label: 'Fill', roles: ['solid', 'semi', 'pattern', 'fill', 'linedFill'] },
	{ label: 'Frame', roles: ['frameHeadingStroke', 'frameHeadingFill', 'frameStroke', 'frameFill', 'frameText'] },
	{ label: 'Note', roles: ['noteFill', 'noteText'] },
	{ label: 'Highlight', roles: ['highlightSrgb', 'highlightP3'] },
]

const ROLE_LABELS: Partial<Record<keyof TLDefaultColor, string>> = {
	solid: 'Solid', semi: 'Semi', pattern: 'Pattern', fill: 'Fill', linedFill: 'Lined fill',
	frameHeadingStroke: 'Heading stroke', frameHeadingFill: 'Heading fill',
	frameStroke: 'Stroke', frameFill: 'Fill', frameText: 'Heading text',
	noteFill: 'Fill', noteText: 'Text',
	highlightSrgb: 'sRGB', highlightP3: 'Display P3',
}

/** A named colour's own 14 roles, i.e. the `TLThemeDefaultColors` keys whose
 *  value is a `TLDefaultColor` object rather than a plain UI-colour string
 *  (`text`, `background`, `selectionStroke`, …). */
function namedColorKeys(colors: Record<string, unknown>): string[] {
	return Object.keys(colors).filter((key) => {
		const value = colors[key]
		return typeof value === 'object' && value !== null && 'solid' in (value as object)
	})
}

/** The same swatch+popover+hex-input control `Inspector.tsx`'s `ColorRow`
 *  draws, minus the `InspectorControl`-specific mixed/unset/clear states a
 *  theme role never has (it always holds a real colour). Kept as its own
 *  small component rather than generalizing `ColorRow` itself: the two
 *  surfaces read genuinely different shapes (a shared selection's paint vs.
 *  one theme's own record), and forcing them through one prop contract would
 *  have cost more than the ~30 lines this duplicates. */
function ThemeColorField({
	label,
	testId,
	value,
	onChange,
}: {
	label: string
	testId: string
	value: string
	onChange(next: string): void
}) {
	const [draft, setDraft] = useState<string | null>(null)
	const hex = /^#[0-9a-f]{6,8}$/i.test(value) ? value : '#000000ff'
	const commitText = () => {
		if (draft === null) return
		const next = draft.trim()
		setDraft(null)
		if (next === '' || !isColor(next) || next === value) return
		onChange(next)
	}
	return (
		<div className="flex items-center gap-1.5">
			<span className="w-28 shrink-0 truncate text-xs text-muted-foreground" title={label}>{label}</span>
			<Popover>
				<PopoverTrigger
					render={
						<button
							type="button"
							aria-label={`${label} picker`}
							data-testid={`theme-color-${testId}`}
							className="size-6 shrink-0 rounded-md border border-border"
							style={{ background: value }}
						/>
					}
				/>
				<PopoverContent className="w-auto p-2">
					<HexAlphaColorPicker color={hex} onChange={onChange} />
				</PopoverContent>
			</Popover>
			<Input
				spellCheck={false}
				value={draft ?? value}
				aria-label={`${label} value`}
				data-testid={`theme-color-text-${testId}`}
				className="h-7 flex-1"
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commitText}
				onKeyDown={(event) => {
					if (event.key === 'Enter') commitText()
					if (event.key === 'Escape') setDraft(null)
				}}
			/>
		</div>
	)
}

/** One named colour's collapsible: its own light/dark toggle, a 14-swatch
 *  preview strip, and a colour row per role, grouped Fill/Frame/Note/Highlight. */
function NamedColorSection({
	name,
	theme,
	defaultMode,
	onEditRole,
}: {
	name: string
	theme: TLTheme
	defaultMode: PaletteMode
	onEditRole(mode: PaletteMode, role: keyof TLDefaultColor, value: string): void
}) {
	const [mode, setMode] = useState<PaletteMode>(defaultMode)
	const palette = theme.colors[mode][name as keyof typeof theme.colors.light] as unknown as TLDefaultColor | undefined
	if (!palette) return null
	return (
		<Collapsible>
			<CollapsibleTrigger
				render={
					<button
						type="button"
						data-testid={`theme-color-group-${name}`}
						className="group flex w-full appearance-none items-center justify-between gap-2 border-0 bg-transparent px-3 py-2 text-xs font-semibold text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
					/>
				}
			>
				<span className="flex min-w-0 items-center gap-2">
					<span className="size-4 shrink-0 rounded-full border border-border" style={{ background: palette.solid }} />
					<span className="truncate">{name}</span>
				</span>
				<ChevronRight
					aria-hidden="true"
					className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[panel-open]:rotate-90"
				/>
			</CollapsibleTrigger>
			<CollapsibleContent className="flex flex-col gap-2 px-3 pb-3">
				<ToggleGroup
					value={[mode]}
					onValueChange={(next) => { if (next[0]) setMode(next[0] as PaletteMode) }}
					aria-label={`${name} palette`}
					className="w-full"
				>
					<ToggleGroupItem value="light" data-testid={`theme-mode-${name}-light`} className="flex-1 text-xs">Light</ToggleGroupItem>
					<ToggleGroupItem value="dark" data-testid={`theme-mode-${name}-dark`} className="flex-1 text-xs">Dark</ToggleGroupItem>
				</ToggleGroup>
				<div className="flex flex-wrap gap-1" data-testid={`theme-swatch-strip-${name}`}>
					{Object.entries(palette).map(([role, value]) => (
						<span
							key={role}
							title={`${role}: ${value}`}
							className="size-4 rounded-sm border border-border"
							style={{ background: value }}
						/>
					))}
				</div>
				{ROLE_GROUPS.map((group) => (
					<div key={group.label} className="flex flex-col gap-0">
						<p className={fieldGroupLabelClass}>{group.label}</p>
						<div className="flex flex-col gap-1.5">
							{group.roles.map((role) => (
								<ThemeColorField
									key={role}
									label={ROLE_LABELS[role] ?? role}
									testId={`${name}-${mode}-${role}`}
									value={palette[role]}
									onChange={(value) => onEditRole(mode, role, value)}
								/>
							))}
						</div>
					</div>
				))}
			</CollapsibleContent>
		</Collapsible>
	)
}

/** The reactive adapter — nothing above this line reads the editor. */
export function ThemePanel({ editor }: { editor: Editor }) {
	const theme = useValue('tldraw styling lab theme', () => editor.getCurrentTheme(), [editor])
	const liveMode = useValue('tldraw styling lab theme colour mode', () => editor.getColorMode(), [editor])
	const [addHex, setAddHex] = useState('#3366ff')

	const colorNames = useMemo(() => namedColorKeys(theme.colors.light), [theme])

	/** Every edit goes through this one path: patch the live theme, re-run the
	 *  registration tldraw's own `<Tldraw themes>` prop would otherwise run on
	 *  the NEXT mount (see the file header), and persist the result. */
	const patchTheme = (patch: (next: TLTheme) => TLTheme) => {
		let patched: TLTheme | undefined
		editor.updateThemes((themes) => {
			patched = patch(themes.default)
			return { ...themes, default: patched }
		})
		const themes = editor.getThemes()
		registerColorsFromThemes(themes)
		writeStoredThemes(themes)
	}

	const setScalar = (key: 'fontSize' | 'lineHeight' | 'strokeWidth', value: number) => {
		patchTheme((next) => ({ ...next, [key]: value }))
	}

	const editRole = (name: string, mode: PaletteMode, role: keyof TLDefaultColor, value: string) => {
		patchTheme((next) => ({
			...next,
			colors: {
				...next.colors,
				[mode]: {
					...next.colors[mode],
					[name]: { ...(next.colors[mode] as unknown as Record<string, TLDefaultColor>)[name], [role]: value },
				},
			},
		}))
	}

	const resetToDefaults = () => {
		editor.updateThemes(() => resolveThemes())
		const themes = editor.getThemes()
		registerColorsFromThemes(themes)
		writeStoredThemes(themes)
	}

	const addColor = () => {
		if (!isColor(addHex) || !/^#[0-9a-f]{6}$/i.test(addHex)) return
		const name = customColorName(addHex)
		patchTheme((next) => ({
			...next,
			colors: {
				light: { ...next.colors.light, [name]: deriveThemeColorRoles(addHex, 'light') },
				dark: { ...next.colors.dark, [name]: deriveThemeColorRoles(addHex, 'dark') },
			},
		}))
	}

	return (
		<div data-testid="theme-panel" className="flex h-full flex-col">
			<header className="flex flex-col gap-1 border-b border-border px-3 py-2.5">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-semibold text-foreground">Theme</h2>
					<Button size="xs" variant="ghost" data-testid="theme-reset" onClick={resetToDefaults}>
						Reset to tldraw defaults
					</Button>
				</div>
				{/* WHY this hint is here and not just in a code comment: `updateThemes`
				    writes to a plain Atom the record store's UndoManager never walks
				    (ThemeManager.ts), so Ctrl+Z after a theme edit undoes the LAST
				    document change instead — a person needs to see that before they
				    lean on undo and lose nothing, or reach for undo and get confused
				    when a shape edit reverts instead. */}
				<p className="text-[11px] text-muted-foreground">
					Theme edits are not undo-tracked — they are app settings, not part of the document. Use Reset to go back.
				</p>
			</header>
			<ScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-0 px-3 py-3">
					<p className={fieldGroupLabelClass}>Scale</p>
					<div className="grid grid-cols-3 gap-1.5">
						<ScrubNumber
							value={theme.fontSize} min={4} max={64} step={1} unit="px" glyph="type"
							label="Font size" testId="theme-fontSize" title="Base font size — every shape's font size is a multiple of this."
							onChange={(value) => setScalar('fontSize', value)}
						/>
						<ScrubNumber
							value={theme.lineHeight} min={0.8} max={3} step={0.05} glyph="lineHeight"
							label="Line height" testId="theme-lineHeight" title="Base line-height multiplier."
							onChange={(value) => setScalar('lineHeight', value)}
						/>
						<ScrubNumber
							value={theme.strokeWidth} min={0.25} max={24} step={0.25} unit="px" glyph="weight"
							label="Stroke width" testId="theme-strokeWidth" title="Base outline width — every shape's stroke width is a multiple of this."
							onChange={(value) => setScalar('strokeWidth', value)}
						/>
					</div>
				</div>
				<Separator />
				<div className="flex flex-col">
					{colorNames.map((name) => (
						<NamedColorSection
							key={name}
							name={name}
							theme={theme}
							defaultMode={liveMode}
							onEditRole={(mode, role, value) => editRole(name, mode, role, value)}
						/>
					))}
				</div>
				<Separator />
				<Field className="gap-2 p-3">
					<FieldDescription>
						Add colour — one hex, both palettes, 14 roles derived (see themeColorDerivation.ts).
					</FieldDescription>
					<div className="flex items-center gap-1.5">
						<span
							className="size-6 shrink-0 rounded-md border border-border"
							style={{ background: /^#[0-9a-f]{6}$/i.test(addHex) ? addHex : 'transparent' }}
						/>
						<Input
							spellCheck={false}
							value={addHex}
							placeholder="#3366ff"
							aria-label="New colour hex"
							data-testid="theme-add-hex"
							className="h-7 flex-1"
							onChange={(event) => setAddHex(event.target.value)}
						/>
						<Button size="xs" variant="outline" data-testid="theme-add-color" onClick={addColor}>
							Add
						</Button>
					</div>
				</Field>
			</ScrollArea>
		</div>
	)
}
