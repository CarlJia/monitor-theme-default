import { useEffect, useState } from "react"

import { api } from "./api.ts"
import { clock } from "./format.ts"

/**
 * One probe sample in a time window: the bucket's median round trip, the
 * range its answers spanned, and the proportion that timed out. The hub
 * answers with this shape and NodeDetail parses the same fields for its
 * latency chart and loss badge.
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
export type QualitySlice = { ping: PingPoint[]; probes: Probes; loss?: Loss }

/** The whole batch response, keyed by node id. */
export type QualityBatch = Record<string, QualitySlice>

/** What `useQuality` returns to its caller. The views derive "fetch pending"
 *  from `data === null && error === null`, so no separate loading flag is needed. */
export type QualityState = {
  /** Latest batch, null until a fetch resolves. */
  data: QualityBatch | null
  /** Last fetch's error message; cleared on a successful fetch. */
  error: string | null
}

/** One probe's raw per-window data — shared shape between the band UI and the
 *  detail page's latency chart, so a payload shape change only ripples here. */
export type ProbeSeries = { id: number; name: string; points: PingPoint[]; loss: number }

/**
 * Folds one node's quality slice into per-probe series. Both consumers (the
 * card/table band and the detail page's latency chart) take this directly;
 * the band maps each point through `pointQuality` to colour the cell.
 *
 * `loss` is lifted from `slice.loss` by id (the whole-window proportion), so
 * the detail page's badge has it without re-indexing; the band does not use it.
 */
export function groupByProbe(slice: QualitySlice): ProbeSeries[] {
  return Object.keys(slice.probes).map((id) => {
    const taskId = Number(id)
    return {
      id: taskId,
      name: slice.probes[id],
      points: slice.ping.filter((p) => p.task_id === taskId),
      loss: slice.loss?.[taskId] ?? 0,
    }
  })
}

/**
 * Color-only encoding would fail red-green colourblind users, who cannot
 * distinguish good from bad on the core signal. The band distinguishes
 * `good / warn / bad / timeout` not by hue alone but also by a lightness step
 * encoded into each tier's CSS variable (see `src/index.css`).
 */
export type Quality = "good" | "warn" | "bad" | "timeout"

/**
 * Industry-standard default thresholds (RTT). A value below `good` is good, at
 * or below `warn` is warn, above is bad — so the boundaries land as the plan
 * describes them: 100ms is warn, 300ms is still warn, 301ms is bad. Knobs live
 * here, not in the renderer.
 */
export const THRESHOLDS = {
  latency: { good: 100, warn: 300 },
  loss: { good: 1, warn: 5 },
} as const

/** Lower-is-better tiering: `< good` -> good, `<= warn` -> warn, else bad. */
function tier(good: number, warn: number, value: number): Quality {
  return value < good ? "good" : value <= warn ? "warn" : "bad"
}

const ORDER: Record<Quality, number> = { good: 0, warn: 1, bad: 2, timeout: 3 }

/** Returns the worse of two qualities. `timeout` is treated as the worst. */
export function worse(a: Quality, b: Quality): Quality {
  return ORDER[a] >= ORDER[b] ? a : b
}

/**
 * A negative latency is the hub's stored marker for a timed-out probe; it can
 * only surface here for a bucket every probe missed, and would otherwise read
 * as a very fast round trip, so it takes the timeout tier.
 */
export function isTimeout(latency: number | null): boolean {
  return latency === null || latency < 0
}

/** One bucket's quality tier from its median latency and its loss percentage. */
export function classifyBucket(latency: number | null, loss: number | null): Quality {
  if (latency === null || latency < 0) return "timeout"
  const lat = tier(THRESHOLDS.latency.good, THRESHOLDS.latency.warn, latency)
  // `loss` is per bucket 0-100; null means no samples lost within the bucket.
  const los = loss === null ? "good" : tier(THRESHOLDS.loss.good, THRESHOLDS.loss.warn, loss)
  return worse(lat, los)
}

/** A raw sample's tier — the band UI calls this once per cell. */
export function pointQuality(p: PingPoint): Quality {
  return classifyBucket(p.latency, p.loss ?? null)
}

/**
 * The hover card's text: the sample's wall-clock time, its median round trip,
 * and its packet loss. Pure so `node` can exercise it without a DOM. `ts` is
 * the hub's epoch seconds, as the chart layer feeds `clock` milliseconds.
 *
 * A timeout carries no loss clause: a bucket's median is null only when every
 * probe in it timed out, so 100% is what the 超时 already says.
 */
export function tooltipText(p: PingPoint): string {
  const time = clock(p.ts * 1000)
  const ms = isTimeout(p.latency) ? "超时" : `${Math.round(p.latency as number)} ms`
  const loss =
    !isTimeout(p.latency) && p.loss != null && p.loss > 0
      ? ` · 丢 ${p.loss < 1 ? "<1" : Math.round(p.loss)}%`
      : ""
  return `${time} · ${ms}${loss}`
}

/**
 * Folds a batch response into a node-id -> per-probe series map. The map shape
 * (vs an array) lets both views look up a single node by id without scanning.
 *
 * Same tri-state semantics as the bands for everyone else: undefined = off
 * (the toggle is closed; nothing renders and no request runs), null = first
 * fetch in flight (a skeleton, never confused with no data), Map = ready.
 */
const EMPTY_BANDS: ProbeSeries[] = []

export function batchToSeries(batch: QualityBatch | null | undefined): Map<number, ProbeSeries[]> | null | undefined {
  if (batch === undefined) return undefined
  if (batch === null) return null
  const m = new Map<number, ProbeSeries[]>()
  for (const [id, slice] of Object.entries(batch)) m.set(Number(id), groupByProbe(slice))
  return m
}

/** Per-node lookup that goes through the same tri-state vocabulary the views read. */
export function bandsFor(
  quality: Map<number, ProbeSeries[]> | null | undefined,
  id: number,
): ProbeSeries[] | null | undefined {
  if (quality === undefined) return undefined
  if (quality === null) return null
  return quality.get(id) ?? EMPTY_BANDS
}

/**
 * Fetches the per-node batch quality summary from the hub. The hub returns the
 * same per-node shape `NodeDetail` already consumes, keyed by node id. The
 * response wraps every visible node; anonymous callers see only public nodes.
 */
export function fetchQuality(): Promise<QualityBatch> {
  return api<QualityBatch>("/nodes/quality")
}

const REFRESH_MS = 60_000

const IDLE: QualityState = { data: null, error: null }

/** A fetch outcome, folded through `qualityReducer`. */
export type QualityEvent = { kind: "ok"; data: QualityBatch } | { kind: "fail"; message: string }

/**
 * The state machine `useQuality` folds fetch outcomes through. Pure, so the
 * lifecycle it encodes is testable without a DOM (which this repo has none of):
 * success replaces the frame and clears any error, while a failure keeps the
 * last frame and records the message -- the page must not blank when one poll
 * misses.
 */
export function qualityReducer(state: QualityState, event: QualityEvent): QualityState {
  switch (event.kind) {
    case "ok":
      // A success clears any previous error, so a recovered poll stops reporting one.
      return { data: event.data, error: null }
    case "fail":
      return { data: state.data, error: event.message }
  }
}

/** The value the views read, derived from the toggle and the hook's state. */
export type QualityView = Map<number, ProbeSeries[]> | null | undefined

const NO_BANDS: Map<number, ProbeSeries[]> = new Map()

/**
 * Resolves the three-state value every view reads from the toggle and the
 * hook: `undefined` when the toggle is off (nothing renders, no request runs),
 * `null` while the first fetch is in flight (a skeleton, never confused with no
 * data), and the map once data lands. A first fetch that failed leaves nothing
 * to draw, so it reads as the empty map rather than a skeleton that never
 * resolves.
 *
 * Extracted from `App` so the resolution has one home and a test.
 */
export function qualityViewState(on: boolean, state: QualityState): QualityView {
  if (!on) return undefined
  const ready = batchToSeries(state.data)
  if (ready) return ready
  // No data yet and no error means a fetch is pending (or about to start), so
  // the views show a skeleton. A first fetch that failed leaves nothing to draw,
  // so it reads as the empty map rather than a skeleton that never resolves.
  return state.error ? NO_BANDS : null
}

/**
 * Tracks a toggle and polls quality data while it is open. Fetch on open,
 * refresh on an interval, stop on close or unmount. The interval is the
 * single knob to tune polling cadence (the plan's R7 "about 60s" default
 * lives here).
 *
 * Off derives the idle state rather than writing it back through an effect, so
 * the last frame survives a fast re-enable and a closed toggle never lets an
 * in-flight response land.
 */
export function useQuality(enabled: boolean): QualityState {
  const [state, setState] = useState<QualityState>(IDLE)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const tick = async () => {
      try {
        const next = await fetchQuality()
        if (!alive) return
        setState((s) => qualityReducer(s, { kind: "ok", data: next }))
      } catch (e) {
        // Keep the previous frame on a failed refresh, mirroring `useNodes`.
        if (alive) {
          setState((s) =>
            qualityReducer(s, { kind: "fail", message: e instanceof Error ? e.message : String(e) }),
          )
        }
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
