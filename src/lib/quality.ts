import { useEffect, useState } from "react"

import { api } from "./api.ts"
import { clock } from "./format.ts"

/**
 * One probe sample in a time window: the bucket's median round trip, the range
 * its answers spanned, and the proportion that timed out. Mirrors the shape
 * `NodeDetail` already consumes (`src/components/NodeDetail.tsx`), so the
 * theme reuses its parsing logic.
 */
export type PingPoint = {
  task_id: number
  ts: number
  /** Bucket's median round trip; null when every probe in it timed out. */
  latency: number | null
  band?: [number, number]
  /** Proportion lost within this bucket. */
  loss?: number
}

/** Probe names keyed by id, sent alongside the samples they label. */
export type Probes = Record<string, string>

/** Proportion of the whole window each probe lost, by id. */
export type Loss = Record<string, number>

/** One node's slice of the batch quality response. */
export type QualitySlice = { ping: PingPoint[]; probes: Probes; loss: Loss }

/** The whole batch response, keyed by node id. */
export type QualityBatch = Record<string, QualitySlice>

/** What `useQuality` returns to its caller. */
export type QualityState = {
  /** Latest batch, null when no fetch has resolved yet or the toggle is off. */
  data: QualityBatch | null
  /** True while a fetch is in flight (initial load or refresh). */
  loading: boolean
  /** Last fetch's error message; cleared on a successful fetch. */
  error: string | null
}

/**
 * Fetches the per-node batch quality summary from the hub. The hub returns the
 * same per-node shape `NodeDetail` already consumes, keyed by node id. The
 * response wraps every visible node; anonymous callers see only public nodes.
 */
export function fetchQuality(): Promise<QualityBatch> {
  return api<QualityBatch>("/nodes/quality")
}

/**
 * The four tiers a bucket can take. Colour alone would fail red-green
 * colourblind readers on the core good/bad signal, so each tier's colour also
 * carries a lightness step — bright for good, dark for timeout — defined with
 * the tier variables in `src/index.css` (KTD5's redundant cue).
 */
export type Quality = "good" | "warn" | "bad" | "timeout"

/**
 * Industry-standard default thresholds (RTT). A value below `good` is good, at
 * or below `warn` is warn, above is bad — so the boundaries land as KTD5
 * describes them: 100ms is warn, 300ms is still warn, 301ms is bad. Knobs live
 * here, not in the renderer.
 */
export const THRESHOLDS = {
  latency: { good: 100, warn: 300 },
  loss: { good: 1, warn: 5 },
} as const

/** Lower-is-better tiering: `< good` → good, `<= warn` → warn, else bad. */
function tier(good: number, warn: number, value: number): Quality {
  return value < good ? "good" : value <= warn ? "warn" : "bad"
}

const ORDER: Record<Quality, number> = { good: 0, warn: 1, bad: 2, timeout: 3 }

/** Returns the worse of two qualities. `timeout` is treated as the worst. */
export function worse(a: Quality, b: Quality): Quality {
  return ORDER[a] >= ORDER[b] ? a : b
}

/**
 * One bucket's quality tier from its median latency and its loss percentage.
 *
 * A negative latency is the hub's stored marker for a timed-out probe; it can
 * only surface here for a bucket every probe missed, and would otherwise read
 * as a very fast round trip, so it takes the timeout tier.
 */
export function classifyBucket(latency: number | null, loss: number | null): Quality {
  if (latency === null || latency < 0) return "timeout"
  const lat = tier(THRESHOLDS.latency.good, THRESHOLDS.latency.warn, latency)
  // `loss` is per bucket 0-100; null means no samples lost within the bucket.
  const los = loss === null ? "good" : tier(THRESHOLDS.loss.good, THRESHOLDS.loss.warn, loss)
  return worse(lat, los)
}

/** One bucket as the band renders it: its tier plus the raw sample the
 *  tooltip reads. Every bucket carries a tier — a full timeout is its own
 *  grey tier, not a blank slot. */
export type BandBucket = {
  quality: Quality
  ts: number
  latency: number | null
  loss: number | null
}

/** One probe's colour sequence, one entry per bucket in window order. */
export type ProbeBands = { taskId: number; name: string; buckets: BandBucket[] }

/**
 * Folds a slice into per-probe bucket sequences. A bucket with no `loss`
 * field and a numeric latency is treated as zero loss; a bucket with neither
 * latency nor loss (a timeout with no other sample) still carries a tier —
 * `timeout` — so it renders as its own colour rather than a blank slot.
 */
export function sliceToBands(slice: QualitySlice): ProbeBands[] {
  return Object.keys(slice.probes).map((id) => {
    const taskId = Number(id)
    const samples = slice.ping.filter((p) => p.task_id === taskId)
    return {
      taskId,
      name: slice.probes[id],
      buckets: samples.map((p) => ({
        quality: classifyBucket(p.latency, p.loss ?? null),
        ts: p.ts,
        latency: p.latency,
        loss: p.loss ?? null,
      })),
    }
  })
}

/**
 * The hover card's text: the sample's wall-clock time, its median round trip,
 * and its packet loss. Pure so `node` can exercise it without a DOM. `ts` is
 * the hub's epoch seconds, as the chart layer feeds `clock` milliseconds.
 *
 * A timeout carries no loss clause: a bucket's median is null only when every
 * probe in it timed out, so 100% is what the 超时 already says.
 */
export function tooltipText(b: BandBucket): string {
  const time = clock(b.ts * 1000)
  const ms = b.latency === null ? "超时" : `${Math.round(b.latency)} ms`
  const loss =
    b.latency !== null && b.loss !== null && b.loss > 0
      ? ` · 丢 ${b.loss < 1 ? "<1" : Math.round(b.loss)}%`
      : ""
  return `${time} · ${ms}${loss}`
}

/**
 * Tracks a toggle and polls quality data while it is open. Fetch on open,
 * refresh on an interval, stop on close or unmount. The interval is the
 * single knob to tune polling cadence (the plan's R7 "about 60s" default
 * lives here).
 */
const REFRESH_MS = 60_000

const IDLE: QualityState = { data: null, loading: false, error: null }

export function useQuality(enabled: boolean): QualityState {
  const [state, setState] = useState<QualityState>(IDLE)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const tick = async () => {
      setState((s) => ({ ...s, loading: true }))
      try {
        const next = await fetchQuality()
        if (!alive) return
        setState({ data: next, loading: false, error: null })
      } catch (e) {
        // Keep the previous frame on a failed refresh, mirroring `useNodes`;
        // the page does not blank when one poll misses.
        if (alive) setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }))
      }
    }
    void tick()
    const id = setInterval(tick, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [enabled])

  // Off derives the idle state rather than writing it back through an effect:
  // the last frame stays in `state` for a fast re-enable, but while the toggle
  // is off the caller sees nothing and no request runs (R5).
  return enabled ? state : IDLE
}
