import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { cn } from "cn"
import { dockPortalContainer } from "./dock-portal"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <PopoverPrimitive.Portal container={dockPortalContainer()}>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        // WHY `positionMethod="fixed"`: found chasing a real, reproducible
        // "the picker's own background stays stuck light in dark mode"
        // report that turned out to not be about colour at all. Base UI's
        // default (`positionMethod: 'absolute'`, undocumented at the call
        // site — see useAnchorPositioning's own JSDoc) computes its
        // Positioner's `transform: translate(x,y)` offset ASSUMING the
        // nearest positioned ancestor sits at the document origin — true
        // when portaled to `<body>` (`position: static`), which is what
        // this assumption was built against before `container` (above)
        // existed. `dockPortalContainer()` portals into the dock's own
        // outer div instead, which is `position: absolute` itself — now
        // THAT div is the containing block, and it does NOT sit at (0,0)
        // (`top-0 right-0`, anchored to the right edge). Measured directly:
        // a fill-swatch trigger at real screen x:1013 produced a popup
        // rendered at x:1909 — the dock's own ~900px left-edge offset added
        // on top of floating-ui's already-correct-for-body math. `fixed`
        // positions relative to the viewport regardless of an ancestor's
        // own `position`, matching what worked by accident when portaled
        // to body. (A `transform` on an ancestor would still break `fixed`
        // the same way — the outer div deliberately never gets one, see
        // Inspector.tsx's own WHY on that split.)
        positionMethod="fixed"
        // `pointer-events-auto`: `container` (above) now portals this INTO
        // the dock's own outer div, which is unconditionally `pointer-
        // events: none` (Inspector.tsx's own WHY — a closed drawer must
        // never eat canvas clicks) — a property every descendant INHERITS
        // unless it sets its own value. Without this override here, the
        // popup portaled in was un-clickable too, not just correctly
        // positioned; see dock-portal.ts's own WHY for the fuller story.
        className="isolate z-[320] pointer-events-auto"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
