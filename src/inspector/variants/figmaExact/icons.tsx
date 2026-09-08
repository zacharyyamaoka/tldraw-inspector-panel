/**
 * Figma's OWN icon paths, transcribed verbatim from the live ui3 DOM Zach
 * pasted on 2026-09-08 (Design tab, rectangle + line + text selected).
 *
 * WHY verbatim paths and not lucide look-alikes: Zach's round-2 verdict was
 * "you currently use a different less communicative icon" about Opacity
 * specifically — Figma's opacity glyph is a SQUARE WITH A CHECKERBOARD
 * GRADIENT (a transparency checker), which reads as "alpha"; the generic
 * half-filled circle round 1 used reads as "contrast". That is a semantic
 * difference, not a style one, and the only way to be sure the semantics
 * survive is to copy the path data rather than pick something similar. Every
 * icon here is a straight copy of its `<path d="…">` out of that DOM, keyed
 * by the `aria-label`/`data-tooltip` Figma itself gives it.
 *
 * All are 24×24 viewBox. Figma paints them with `fill: var(--color-icon)`,
 * and a SECOND path at `var(--color-icon-tertiary)` on the alignment icons
 * (the thin edge rule) — that two-tone treatment is part of why its align
 * icons read instantly, so `tertiary` here is a real second path, not an
 * opacity trick.
 */

export type FigmaIconProps = { className?: string }

function Icon({ d, tertiary, evenOdd = true, className }: {
	d: string
	tertiary?: string
	evenOdd?: boolean
	className?: string
}) {
	return (
		<svg width="24" height="24" fill="none" viewBox="0 0 24 24" className={className} aria-hidden="true">
			<path fill="var(--fig-icon)" fillRule={evenOdd ? 'evenodd' : undefined} clipRule={evenOdd ? 'evenodd' : undefined} d={d} />
			{tertiary ? <path fill="var(--fig-icon-tertiary)" fillRule="evenodd" clipRule="evenodd" d={tertiary} /> : null}
		</svg>
	)
}

/* ------------------------------------------------------- Position · align */

export const AlignLeft = (p: FigmaIconProps) => <Icon {...p}
	d="M17.25 10a.75.75 0 0 0 .75-.75v-.5a.75.75 0 0 0-.75-.75h-8.5a.75.75 0 0 0-.75.75v.5c0 .414.336.75.75.75zm-4 5a.75.75 0 0 0 .75-.75v-.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0-.75.75v.5c0 .414.336.75.75.75z"
	tertiary="M6 17.5a.5.5 0 0 1-1 0v-12a.5.5 0 0 1 1 0z" />

export const AlignHorizontalCenters = (p: FigmaIconProps) => <Icon {...p}
	d="M17.25 10a.75.75 0 0 0 .75-.75v-.5a.75.75 0 0 0-.75-.75h-9.5a.75.75 0 0 0-.75.75v.5c0 .414.336.75.75.75zm-2 5a.75.75 0 0 0 .75-.75v-.5a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v.5c0 .414.336.75.75.75z"
	tertiary="M13 17.5a.5.5 0 0 1-1 0V15h1zm0-4.5v-3h-1v3zm0-7.5V8h-1V5.5a.5.5 0 0 1 1 0" />

export const AlignRight = (p: FigmaIconProps) => <Icon {...p}
	d="M6.75 10A.75.75 0 0 1 6 9.25v-.5A.75.75 0 0 1 6.75 8h8.5a.75.75 0 0 1 .75.75v.5a.75.75 0 0 1-.75.75zm4 5a.75.75 0 0 1-.75-.75v-.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v.5a.75.75 0 0 1-.75.75z"
	tertiary="M18 17.5a.5.5 0 0 0 1 0v-12a.5.5 0 0 0-1 0z" />

export const AlignTop = (p: FigmaIconProps) => <Icon {...p}
	d="M10 17.25a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-8.5A.75.75 0 0 1 8.75 8h.5a.75.75 0 0 1 .75.75zm5-4a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75z"
	tertiary="M17.5 6a.5.5 0 0 0 0-1h-12a.5.5 0 0 0 0 1z" />

export const AlignVerticalCenters = (p: FigmaIconProps) => <Icon {...p}
	d="M10 6.75A.75.75 0 0 0 9.25 6h-.5a.75.75 0 0 0-.75.75v9.5c0 .414.336.75.75.75h.5a.75.75 0 0 0 .75-.75zm5 2a.75.75 0 0 0-.75-.75h-.5a.75.75 0 0 0-.75.75v5.5c0 .414.336.75.75.75h.5a.75.75 0 0 0 .75-.75z"
	tertiary="M17.5 11a.5.5 0 0 1 0 1H15v-1zM13 11h-3v1h3zm-7.5 0H8v1H5.5a.5.5 0 0 1 0-1" />

export const AlignBottom = (p: FigmaIconProps) => <Icon {...p}
	d="M10 6.75A.75.75 0 0 0 9.25 6h-.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h.5a.75.75 0 0 0 .75-.75zm5 4a.75.75 0 0 0-.75-.75h-.5a.75.75 0 0 0-.75.75v4.5c0 .414.336.75.75.75h.5a.75.75 0 0 0 .75-.75z"
	tertiary="M17.5 18a.5.5 0 0 1 0 1h-12a.5.5 0 0 1 0-1z" />

/* ---------------------------------------------------- Position · rotation */

/** The input's own leading glyph — a quarter-circle in a corner bracket. */
export const RotationGlyph = (p: FigmaIconProps) => <Icon {...p}
	d="M9 8.5a.5.5 0 0 0-1 0v7a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 0-1H13a4 4 0 0 0-4-4zM9 12v3h3a3 3 0 0 0-3-3" />

export const Rotate90Clockwise = (p: FigmaIconProps) => <Icon {...p} evenOdd={false}
	d="M11.054 9.543a1.5 1.5 0 0 1 2.007.103l3.293 3.293a1.5 1.5 0 0 1 0 2.121l-3.293 3.293a1.5 1.5 0 0 1-2.121 0L7.647 15.06a1.5 1.5 0 0 1 0-2.121l3.293-3.293zm1.3.81a.5.5 0 0 0-.707 0l-3.293 3.293a.5.5 0 0 0 0 .707l3.293 3.293a.5.5 0 0 0 .629.064l.078-.064 3.293-3.293a.5.5 0 0 0 .064-.629l-.064-.078zM9.526 5.767a3.5 3.5 0 0 1 4.949 0L16 7.292V6a.5.5 0 0 1 1 0v2.5a.5.5 0 0 1-.5.5H14a.5.5 0 0 1 0-1h1.293l-1.525-1.526a2.5 2.5 0 0 0-3.535 0l-2.38 2.379a.5.5 0 0 1-.706-.707z" />

export const FlipHorizontal = (p: FigmaIconProps) => <Icon {...p}
	d="M12 6.5a.5.5 0 0 0-1 0v11a.5.5 0 0 0 1 0zM6 9.604a.75.75 0 0 1 1.28-.53l2.22 2.219a1 1 0 0 1 0 1.414l-2.22 2.22a.75.75 0 0 1-1.28-.53zm1 4.189L8.793 12 7 10.207zm10-4.19a.75.75 0 0 0-1.28-.53l-2.22 2.22a1 1 0 0 0 0 1.414l2.22 2.22a.75.75 0 0 0 1.28-.53zm-1 4.19L14.207 12 16 10.207z" />

export const FlipVertical = (p: FigmaIconProps) => <Icon {...p}
	d="M17.5 12a.5.5 0 0 0 0-1h-11a.5.5 0 0 0 0 1zm-3.104-6a.75.75 0 0 1 .53 1.28L12.708 9.5a1 1 0 0 1-1.414 0l-2.22-2.22A.75.75 0 0 1 9.603 6zm-4.189 1L12 8.793 13.793 7zm4.19 10a.75.75 0 0 0 .53-1.28l-2.22-2.22a1 1 0 0 0-1.414 0l-2.22 2.22a.75.75 0 0 0 .53 1.28zm-4.19-1L12 14.207 13.793 16z" />

/* ------------------------------------------------------ Layout · sizing */

export const LockAspectRatio = (p: FigmaIconProps) => <Icon {...p}
	d="M7.5 7h9a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5M6 7.5A1.5 1.5 0 0 1 7.5 6h9A1.5 1.5 0 0 1 18 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 16.5zM9.5 9a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 1 0V10h1.5a.5.5 0 0 0 0-1zm5.5 3.5a.5.5 0 0 0-1 0V14h-1.5a.5.5 0 0 0 0 1h2a.5.5 0 0 0 .5-.5z" />

/* -------------------------------------------------------- Appearance */

/**
 * THE icon Zach called out. A rounded square filled with a diagonal
 * checkerboard of dots — the transparency checker, i.e. "alpha", not
 * "contrast". Copied character-for-character from Figma's
 * `appearance_panel--opacityIconContainer` svg.
 */
export const OpacityGlyph = (p: FigmaIconProps) => <Icon {...p}
	d="M8 7h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1M6 8a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2zm8.5 1a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1M13 10.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m-2 2a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m-2 2a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m1.5.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1m2-2a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1m.5 1.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m2-4a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m-.5 2.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1m.5 1.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0" />

/** Four corner brackets. Doubles as the "Individual corners" button icon. */
export const CornerRadiusGlyph = (p: FigmaIconProps) => <Icon {...p} evenOdd={false}
	d="M6.5 14a.5.5 0 0 1 .5.5v.6c0 .428 0 .72.019.945.017.219.05.331.09.41.096.187.249.34.437.436.078.04.19.073.41.09.224.019.516.019.944.019h.6a.5.5 0 0 1 0 1h-.621c-.402 0-.734 0-1.005-.023-.281-.022-.54-.071-.782-.195a2 2 0 0 1-.874-.874c-.124-.242-.173-.501-.196-.782A13 13 0 0 1 6 15.121V14.5a.5.5 0 0 1 .5-.5m11 0a.5.5 0 0 1 .5.5v.621c0 .402 0 .734-.023 1.005-.022.281-.071.54-.195.782a2 2 0 0 1-.874.874c-.242.124-.501.173-.782.195-.27.023-.603.023-1.005.023H14.5a.5.5 0 0 1 0-1h.6c.428 0 .72 0 .945-.019.219-.018.331-.05.41-.09a1 1 0 0 0 .436-.437c.04-.078.073-.19.09-.41.019-.224.019-.516.019-.944v-.6a.5.5 0 0 1 .5-.5m-8-8a.5.5 0 0 1 0 1h-.6c-.428 0-.719 0-.944.019-.22.017-.332.05-.41.09a1 1 0 0 0-.437.437c-.04.078-.073.19-.09.41C7 8.18 7 8.471 7 8.9v.6a.5.5 0 0 1-1 0v-.621c0-.402 0-.734.022-1.005.023-.281.072-.54.196-.782a2 2 0 0 1 .874-.874c.242-.124.501-.173.782-.196C8.144 6 8.477 6 8.88 6zm5.621 0c.402 0 .734 0 1.005.022.281.023.54.072.782.196a2 2 0 0 1 .874.874c.124.242.173.501.195.782.023.27.023.603.023 1.005V9.5a.5.5 0 0 1-1 0v-.6c0-.428 0-.72-.019-.945-.018-.219-.05-.33-.09-.41a1 1 0 0 0-.437-.436c-.078-.04-.19-.073-.41-.09A13 13 0 0 0 15.1 7h-.6a.5.5 0 0 1 0-1z" />

/** The "Hide" toggle in the Appearance title row. */
export const EyeVisible = (p: FigmaIconProps) => <Icon {...p}
	d="M6 12c0-.066.054-.358.313-.825a5.9 5.9 0 0 1 1.12-1.414C8.443 8.816 9.956 8 12 8s3.558.816 4.566 1.76c.508.477.88.98 1.121 1.415.258.467.313.76.313.825 0 .066-.055.358-.313.825-.24.435-.613.938-1.12 1.414C15.557 15.184 14.044 16 12 16s-3.558-.816-4.566-1.76a5.9 5.9 0 0 1-1.121-1.415C6.055 12.358 6 12.065 6 12m-1 0c0-1.25 2.333-5 7-5s7 3.75 7 5-2.333 5-7 5-7-3.75-7-5m8 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0m1 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0" />

/** A teardrop — Figma's "Apply blend mode". */
export const BlendMode = (p: FigmaIconProps) => <Icon {...p} evenOdd={false}
	d="M11.353 5.623a.91.91 0 0 1 1.295 0C14 6.978 17 10.29 17 13.001c0 3.5-2.5 5-5 5s-5-1.5-5-5c0-2.711 3-6.023 4.352-7.378m.647.77c-.658.663-1.663 1.75-2.507 2.977C8.597 10.673 8 11.965 8 13.001c0 1.49.522 2.453 1.218 3.057.72.623 1.72.943 2.782.943s2.063-.32 2.782-.943C15.478 15.454 16 14.492 16 13c0-1.036-.597-2.328-1.493-3.63-.844-1.227-1.85-2.315-2.507-2.978" />

/* ------------------------------------------------------------ Paint rows */

/** Four circles — "Apply styles and variables" on Fill/Stroke/Effects. */
export const StylesAndVariables = (p: FigmaIconProps) => <Icon {...p}
	d="M8.5 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m0 1a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5m7-1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m0 1a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5M14 15.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0m-1 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0M8.5 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m0 1a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5" />

export const Plus = (p: FigmaIconProps) => <Icon {...p}
	d="M11.5 6a.5.5 0 0 1 .5.5V11h4.5a.5.5 0 0 1 0 1H12v4.5a.5.5 0 0 1-1 0V12H6.5a.5.5 0 0 1 0-1H11V6.5a.5.5 0 0 1 .5-.5" />

export const Minus = (p: FigmaIconProps) => <Icon {...p}
	d="M6 11.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5" />

/* ------------------------------------------------------------- Stroke */

export const StrokeWeightGlyph = (p: FigmaIconProps) => <Icon {...p}
	d="M6 6.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5M7 10v1h10v-1zm-.25-1a.75.75 0 0 0-.75.75v1.5c0 .414.336.75.75.75h10.5a.75.75 0 0 0 .75-.75v-1.5a.75.75 0 0 0-.75-.75zM7 17v-2h10v2zm-1-2.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-.75.75H6.75a.75.75 0 0 1-.75-.75z" />

export const AdvancedStroke = (p: FigmaIconProps) => <Icon {...p} evenOdd={false}
	d="M8.5 18a.5.5 0 0 0 .5-.5v-1.55a2.5 2.5 0 0 0 0-4.9V6.5a.5.5 0 0 0-1 0v4.55a2.501 2.501 0 0 0 0 4.9v1.55a.5.5 0 0 0 .5.5m7 0a.5.5 0 0 0 .5-.5v-4.55a2.501 2.501 0 0 0 0-4.9V6.5a.5.5 0 0 0-1 0v1.55a2.5 2.5 0 0 0 0 4.9v4.55a.5.5 0 0 0 .5.5m0-6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m-7 3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3" />

export const IndividualStrokes = (p: FigmaIconProps) => <Icon {...p}
	d="M6 7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zm3 2v6h6V9zM7.5 7H7v10h10V7zM8 9V8h8v8H8z" />

/* -------------------------------------------------------------- chrome */

/** 24px chevron, used inside Select triggers. */
export const ChevronDown = (p: FigmaIconProps) => <Icon {...p}
	d="M9.146 11.146a.5.5 0 0 1 .708 0l1.646 1.647 1.646-1.647a.5.5 0 0 1 .708.708l-2 2a.5.5 0 0 1-.708 0l-2-2a.5.5 0 0 1 0-.708" />

/** 16px chevron on a section title — Figma rotates THIS one, not a 24. */
export const SectionChevron = ({ className }: FigmaIconProps) => (
	<svg width="16" height="16" fill="none" viewBox="0 0 16 16" className={className} aria-hidden="true">
		<path fill="var(--fig-icon)" d="M6.768 5.525a.5.5 0 0 1 .707 0l2.121 2.121a.5.5 0 0 1 0 .707l-2.121 2.122a.5.5 0 0 1-.707-.708L8.535 8 6.768 6.232a.5.5 0 0 1 0-.707" />
	</svg>
)

/* --------------------------------------------------- selection actions */

export const CreateComponent = (p: FigmaIconProps) => <Icon {...p}
	d="M11.116 13.592a1.25 1.25 0 0 1 1.768 0l1.637 1.637a1.25 1.25 0 0 1 0 1.768l-1.637 1.638-.095.085a1.25 1.25 0 0 1-1.578 0l-.095-.085-1.638-1.64a1.25 1.25 0 0 1-.085-1.672l.085-.095zm1.06.707a.25.25 0 0 0-.353 0l-1.638 1.636a.25.25 0 0 0 0 .354l1.638 1.639a.25.25 0 0 0 .354 0l1.637-1.638a.25.25 0 0 0 0-.354zm3.053-4.82a1.25 1.25 0 0 1 1.767 0l1.639 1.637a1.25 1.25 0 0 1 0 1.768l-1.639 1.638-.095.086a1.25 1.25 0 0 1-1.578 0l-.095-.086-1.637-1.637a1.25 1.25 0 0 1-.086-1.673l.086-.095zm-8.226 0a1.25 1.25 0 0 1 1.767 0l1.64 1.638a1.25 1.25 0 0 1 0 1.768L8.77 14.52a1.25 1.25 0 0 1-1.672.086l-.095-.086-1.638-1.637a1.25 1.25 0 0 1-.086-1.673l.086-.095zm9.286.706a.25.25 0 0 0-.354 0l-1.637 1.64a.25.25 0 0 0 0 .353l1.637 1.637a.25.25 0 0 0 .354 0l1.639-1.638a.25.25 0 0 0 0-.354zm-8.226 0a.25.25 0 0 0-.353 0l-1.637 1.638a.25.25 0 0 0 0 .354l1.638 1.637a.25.25 0 0 0 .353 0l1.638-1.636a.25.25 0 0 0 0-.354zm3.053-4.819a1.25 1.25 0 0 1 1.768 0l1.637 1.638a1.25 1.25 0 0 1 0 1.767l-1.637 1.639-.095.085a1.25 1.25 0 0 1-1.578 0l-.095-.085-1.639-1.639a1.25 1.25 0 0 1-.085-1.673l.085-.094zm1.06.707a.25.25 0 0 0-.353 0l-1.639 1.638a.25.25 0 0 0 0 .353l1.64 1.639a.25.25 0 0 0 .353 0l1.637-1.639a.25.25 0 0 0 0-.353z" />

export const EditObject = (p: FigmaIconProps) => <Icon {...p}
	d="M8 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2m1 .732A2 2 0 0 0 9.732 9h4.536c.175.304.428.557.732.732v4.536a2 2 0 0 0-.732.732H9.732A2 2 0 0 0 9 14.268zM16 14a2 2 0 1 1-2 2h-4a2 2 0 1 1-2-2v-4a2 2 0 1 1 2-2h4a2 2 0 1 1 2 2zm0-5a1 1 0 1 0 0-2 1 1 0 0 0 0 2m0 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2m-8 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2" />
