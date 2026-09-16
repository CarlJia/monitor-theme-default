import { useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import type { ProbeBands, Quality } from "@/lib/quality"
import { tooltipText } from "@/lib/quality"

/**
 * The hue per tier. Lightness is stepped inside each variable (see `index.css`),
 * so the tier is legible by brightness alone — the redundant cue KTD5 requires
 * for red-green colourblind readers — while the hue stays the primary read.
 */
const FILL: Record<Quality, string> = {
  good: "var(--q-good)",
  warn: "var(--q-warn)",
  bad: "var(--q-bad)",
  timeout: "var(--q-timeout)",
}

type Hover = { x: number; y: number; text: string }

/**
 * The band's three states in one place, so both views agree on them:
 * `undefined` is the toggle off (nothing renders), `null` is the first fetch in
 * flight (a skeleton, never confused with the no-data blank), and an array is
 * the data — possibly empty, which draws nothing (R4).
 */
export function QualitySlot({ quality }: { quality?: ProbeBands[] | null }) {
  if (quality === undefined) return null
  if (quality === null) return <Skeleton className="h-3 w-full" />
  return <QualityBand probes={quality} />
}

/**
 * One node's network quality: a segmented strip per probe source, stacked
 * vertically with the probe's name leading each row (R3). Cards and the table
 * both render this (KTD4), so the two views cannot drift.
 *
 * The strip is equal-width buckets with a 2px seam (R1): tight enough to read
 * as one continuous band, distinct enough to count a rough proportion at a
 * glance. Hovering any bucket floats the sample's time, latency and loss (R13).
 */
export function QualityBand({ probes }: { probes: ProbeBands[] }) {
  const [hover, setHover] = useState<Hover | null>(null)

  // No probes at all: nothing to draw, so the caller's layout is unchanged (R4).
  if (probes.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      {probes.map((probe) => (
        <div key={probe.taskId} className="flex min-w-0 items-center gap-2">
          {/* The name is the row's identity; it truncates rather than widening
              the band on a narrow card. */}
          <span
            className="w-20 shrink-0 truncate text-xs text-muted-foreground"
            title={probe.name}
          >
            {probe.name}
          </span>
          <div
            className="flex h-3 min-w-0 flex-1 gap-[2px]"
            onMouseLeave={() => setHover(null)}
          >
            {probe.buckets.map((bucket, i) => (
              <span
                key={i}
                className="min-w-[1px] flex-1"
                style={{ background: FILL[bucket.quality] }}
                onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, text: tooltipText(bucket) })}
                onMouseMove={(e) => setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))}
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
