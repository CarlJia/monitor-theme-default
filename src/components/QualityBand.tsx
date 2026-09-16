import { useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import type { ProbeSeries, Quality } from "@/lib/quality"
import { pointQuality, tooltipText, rowFigures } from "@/lib/quality"
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

/**
 * The tier's colour for *text* — the row's two figures wear it. The strip's own
 * values are tuned for blocks, and a block is a graphic with no WCAG text-
 * contrast obligation; these are the same hues pressed until 12px type clears
 * 4.5:1 on the card (see `index.css`, which also carries the ratios).
 */
const INK: Record<Quality, string> = {
  good: "var(--q-good-ink)",
  warn: "var(--q-warn-ink)",
  bad: "var(--q-bad-ink)",
  timeout: "var(--q-timeout-ink)",
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
        {/* One row's worth, in a ready row's own shape and spacing: a label line
            and a full-width strip. The probe count is not knowable before the
            first frame lands, so one row is the honest placeholder; matching the
            ready height is what keeps the card from growing (and its row-mates
            from reflowing) when that frame arrives. `h-4` is the label's
            `text-xs` line box -- 12px type on 1rem leading -- not a guess. */}
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-1 h-3 w-full" />
      </div>
    )
  }
  if (quality.length === 0) return null

  return (
    // The between-row gap must stay visibly wider than the gap inside a row
    // (the strip's `mt-1`), or nothing binds a strip to the label above it and
    // the reader has to infer the pairing from order alone.
    <div className={cn("flex flex-col gap-3", className)}>
      {quality.map((probe) => {
        const figures = rowFigures(probe)
        return (
          <div key={probe.id} className="min-w-0">
            {/* Label line, then the strip across the full width beneath it -- the
                same shape as the card's own meter rows. Side by side is what the
                strip cannot afford: 60 buckets (the hub's one-hour window at a
                minute a bucket) with the 2px seam R1 asks for need ~178px, and
                three cells beside it leave the strip 87px, which spilled the
                strip past the card's edge. The two figures are fixed-width so
                they line up down the column. */}
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs text-muted-foreground" title={probe.name}>
                {probe.name}
              </span>
              {/* Each figure wears its own tier's colour, not the row's worst-of:
                  the strip folds latency and loss into one colour per bucket, so
                  these two cells are what say which of the two a run of amber
                  was. The loss cell keeps its width even when empty, or the
                  latency figures would not line up down the column. */}
              <span className="flex shrink-0 items-baseline text-xs">
                <span className="tnum w-12 text-right" style={{ color: INK[figures.latency.tier] }}>
                  {figures.latency.text}
                </span>
                <span
                  className="tnum w-14 text-right"
                  style={figures.loss ? { color: INK[figures.loss.tier] } : undefined}
                >
                  {figures.loss?.text ?? ""}
                </span>
              </span>
            </div>
            <div
              className="mt-1 flex h-3 w-full gap-[2px]"
              onMouseLeave={() => setHover(null)}
            >
              {probe.points.map((p, i) => (
                <span
                  key={i}
                  // No minimum width: a window or a card the strip does not fit
                  // should make it denser, never wider than the box it lives in.
                  className="min-w-0 flex-1"
                  style={{ background: FILL[pointQuality(p)] }}
                  onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, text: tooltipText(p) })}
                  onMouseMove={(e) =>
                    setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))
                  }
                />
              ))}
            </div>
          </div>
        )
      })}

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
