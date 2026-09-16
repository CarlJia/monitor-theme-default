import { useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import type { ProbeSeries, Quality } from "@/lib/quality"
import { pointQuality, tooltipText, latencyText, lossText, medianLatency } from "@/lib/quality"
import { cn } from "@/lib/utils"

/**
 * The hue per tier. Lightness is stepped inside each variable (see `index.css`),
 * so the tier is legible by brightness alone -- the redundant cue KTD5 requires
 * for red-green colourblind readers -- while the hue stays the primary read.
 */
const FILL: Record<Quality, string> = {
  good: "var(--q-good)",
  warn: "var(--q-warn)",
  bad: "var(--q-bad)",
  timeout: "var(--q-timeout)",
}

type Hover = { x: number; y: number; text: string }

/**
 * One node's network quality: a segmented strip per probe source, stacked
 * vertically with the probe's name leading each row (R3). Cards and the table
 * both render this (KTD4), so the two views cannot drift.
 *
 * Each row leads with the window's figures -- the median round trip and the
 * probe's loss -- because the strip folds both into a single colour per bucket:
 * the colour alone cannot say whether a run of amber was slow or lossy.
 *
 * The strip is equal-width buckets with a 2px seam (R1): tight enough to read
 * as one continuous band, distinct enough to count a rough proportion at a
 * glance. Hovering any bucket floats the sample's time, latency and loss (R13).
 *
 * The component owns its own three states, so no caller re-decodes them:
 * `undefined` (toggle off) and an empty array (nothing to draw) render nothing
 * at all, wrapper included; `null` (first fetch in flight) renders the skeleton
 * inside the wrapper; an array renders the band. `className` carries the
 * caller's layout — the card's top border and margin — so a caller that wants
 * no band gets no empty box either.
 */
export function QualitySlot({ quality, className }: { quality?: ProbeSeries[] | null; className?: string }) {
  const [hover, setHover] = useState<Hover | null>(null)

  if (quality === undefined) return null
  if (quality === null) {
    return (
      <div className={className}>
        <Skeleton className="h-3 w-full" />
      </div>
    )
  }
  if (quality.length === 0) return null

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {quality.map((probe) => (
        <div key={probe.id} className="flex min-w-0 items-center gap-2">
          {/* The name is the row's identity; it truncates rather than widening
              the band on a narrow card. */}
          <span
            className="w-20 shrink-0 truncate text-xs text-muted-foreground"
            title={probe.name}
          >
            {probe.name}
          </span>
          {/* The window in figures. A bucket's colour is the worse of its
              latency and its loss, so the two are not separable from the strip
              alone -- these cells are what says which one it was. The loss cell
              keeps its width when there is no loss, or the two rows' bands
              would not line up. */}
          <span className="tnum w-12 shrink-0 text-right text-xs text-muted-foreground">
            {latencyText(medianLatency(probe.points))}
          </span>
          <span className="tnum w-14 shrink-0 text-xs text-muted-foreground">
            {probe.loss > 0 ? lossText(probe.loss) : ""}
          </span>
          <div
            className="flex h-3 min-w-0 flex-1 gap-[2px]"
            onMouseLeave={() => setHover(null)}
          >
            {probe.points.map((p, i) => (
              <span
                key={i}
                className="min-w-[1px] flex-1"
                style={{ background: FILL[pointQuality(p)] }}
                onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, text: tooltipText(p) })}
                onMouseMove={(e) =>
                  setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))
                }
              />
            ))}
          </div>
        </div>
      ))}

      {hover && <Tip {...hover} />}
    </div>
  )
}

/** Floats near the cursor, flipping before it runs off the viewport edge. */
function Tip({ x, y, text }: Hover) {
  const PAD = 12
  const flipX = x + 220 > globalThis.innerWidth
  const flipY = y + 44 > globalThis.innerHeight
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md tnum"
      style={{
        left: flipX ? x - PAD - 210 : x + PAD,
        top: flipY ? y - PAD - 28 : y + PAD,
      }}
    >
      {text}
    </div>
  )
}
