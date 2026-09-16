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
 * Folds one node's quality slice into per-probe series — the one place the
 * payload's per-probe shape is interpreted. Both consumers (the card/table band
 * and the detail page's latency chart) take this directly; the band maps each
 * point through `pointQuality` to colour the cell.
 *
 * Two contract decisions live here rather than at the call sites:
 *
 * - **Enumerate the union** of the named probes and the samples' own `task_id`s.
 *   The hub names every probe it assigned, so in practice they coincide; taking
 *   the union means a sample that arrives without a matching name still draws
 *   (named `探测 N`, as the detail page always named one) instead of vanishing.
 * - **Drop silent series.** A probe assigned but with no sample in this window
 *   contributes nothing to that window — an empty strip carries no information
 *   and would otherwise render as a bare name. This is what R4's blank means.
 *
 * `loss` is lifted from `slice.loss` by id (the whole-window proportion) so both
 * readers get it without re-indexing their own copy: the detail page's badge and
 * the band row's loss cell. That whole-window scope is therefore shared -- moving
 * it (say, to the chart's visible range) would change both figures at once.
 */
export function groupByProbe(slice: QualitySlice): ProbeSeries[] {
  const ids = new Set<number>()
  for (const id of Object.keys(slice.probes ?? {})) ids.add(Number(id))
  for (const p of slice.ping) ids.add(p.task_id)
  return [...ids]
    .map((taskId) => ({
      id: taskId,
      name: slice.probes?.[String(taskId)] ?? `探测 ${taskId}`,
      points: slice.ping.filter((p) => p.task_id === taskId),
      loss: slice.loss?.[String(taskId)] ?? 0,
    }))
    .filter((s) => s.points.length > 0)
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
  // Loss is only worth naming when it happened, and never for a timeout (whose
  // 100% is what the 超时 already says).
  const loss = !isTimeout(p.latency) && p.loss != null && p.loss > 0 ? ` · ${lossText(p.loss)}` : ""
  return `${time} · ${ms}${loss}`
}

/**
 * The "丢 N%" figure, shared by the band's hover card and the detail page's
 * per-probe badge. Sub-1% reads as `<1`: rounding it to 0 would render a real
 * loss as the 0 that denotes none.
 */
export function lossText(pct: number): string {
  return `丢 ${pct < 1 ? "<1" : Math.round(pct)}%`
}

/**
 * A probe's typical round trip over the window: the median of its buckets.
 * Buckets where every probe timed out are dropped rather than counted as slow,
 * so the figure describes the strip instead of the gaps in it. A window that
 * never answered has no median -- the row prints that as 超时.
 *
 * The band's cells carry latency and loss folded into one colour, so the raw
 * result of that fold needs a number beside it: a yellow bucket does not say
 * whether the window was slow or lossy.
 */
export function medianLatency(points: PingPoint[]): number | null {
  const answered = points.map((p) => p.latency).filter((v): v is number => !isTimeout(v))
  if (answered.length === 0) return null
  answered.sort((a, b) => a - b)
  const mid = answered.length >> 1
  return answered.length % 2 === 1 ? answered[mid] : (answered[mid - 1] + answered[mid]) / 2
}

/** The band row's latency cell. Compact, since it sits inside a card. */
export function latencyText(ms: number | null): string {
  return ms === null ? "超时" : `${Math.round(ms)}ms`
}

/** One figure a band row prints, and the tier it wears. */
export type RowCell = { text: string; tier: Quality }

/** A lone latency reading's tier — the window median, so a window that never
 *  answered lands in `timeout` exactly as its cell's 超时 does. The check is
 *  spelled out rather than routed through `isTimeout`, which is not a type
 *  guard and would leave `ms` nullable at the `tier` call. */
function latencyTier(ms: number | null): Quality {
  if (ms === null || ms < 0) return "timeout"
  return tier(THRESHOLDS.latency.good, THRESHOLDS.latency.warn, ms)
}

/** A lone loss reading's tier. 0% is good, which is what keeps a clean probe's
 *  (absent) cell out of the warning colour. */
function lossTier(pct: number): Quality {
  return tier(THRESHOLDS.loss.good, THRESHOLDS.loss.warn, pct)
}

/**
 * What one band row prints: the window's median round trip and the probe's loss,
 * each with the tier it wears so the figures can be coloured like the strip
 * beside them (a figure's colour describes that figure -- the strip's own rule
 * is worse-of-the-two, which would make a 20ms reading amber for someone else's
 * packet loss).
 *
 * Extracted from the JSX so the "a probe that lost nothing prints no loss cell"
 * branch is pinned by a test: `lossText(0)` reads 丢 <1%, a *has-loss* string,
 * so dropping the guard would label a clean probe as lossy -- and no rendering
 * test exists to catch it, since this repo has no DOM. Hence `loss` being null
 * rather than an empty string: the caller cannot print a figure that is not
 * there, and the cell reserves its width for the column instead.
 *
 * `probe.loss` is the whole window's proportion while `medianLatency` summarises
 * the points; both therefore describe the same window, which is what lets the
 * row's two cells sit beside one strip.
 */
export function rowFigures(probe: ProbeSeries): { latency: RowCell; loss: RowCell | null } {
  const median = medianLatency(probe.points)
  return {
    latency: { text: latencyText(median), tier: latencyTier(median) },
    loss: probe.loss > 0 ? { text: lossText(probe.loss), tier: lossTier(probe.loss) } : null,
  }
}

/**
 * Folds a batch response into a node-id -> per-probe series map. The map shape
 * (vs an array) lets both views look up a single node by id without scanning.
 *
 * The tri-state mirrors the views': undefined = off (the toggle is closed;
 * nothing renders and no request runs), null = first fetch in flight (a
 * skeleton, never confused with no data), Map = ready.
 */
export function batchToSeries(batch: QualityBatch | null | undefined): Map<number, ProbeSeries[]> | null | undefined {
  if (batch === undefined) return undefined
  if (batch === null) return null
  const m = new Map<number, ProbeSeries[]>()
  for (const [id, slice] of Object.entries(batch)) m.set(Number(id), groupByProbe(slice))
  return m
}

/**
 * Shared empty values, handed out rather than allocated per call so that a
 * view re-rendering every push keeps the same reference and skips work. Nothing
 * may mutate them.
 */
const NO_SERIES: ProbeSeries[] = []
const NO_VIEW: Map<number, ProbeSeries[]> = new Map()

/** Per-node lookup that goes through the same tri-state vocabulary the views read. */
export function bandsFor(
  quality: Map<number, ProbeSeries[]> | null | undefined,
  id: number,
): ProbeSeries[] | null | undefined {
  if (quality === undefined) return undefined
  if (quality === null) return null
  return quality.get(id) ?? NO_SERIES
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
  return state.error ? NO_VIEW : null
}

/**
 * What `startQualityPolling` needs from its environment. The scheduler is
 * injected so the loop can be driven by a fake in a test -- this repo has no
 * jsdom, so a real `useEffect` + `setInterval` pair cannot be exercised.
 */
export type QualityPollDeps<H> = {
  fetch: () => Promise<QualityBatch>
  onEvent: (event: QualityEvent) => void
  schedule: (tick: () => void, ms: number) => H
  cancel: (handle: H) => void
  intervalMs?: number
}

/**
 * The polling loop `useQuality` runs: fetch once immediately, then every
 * `intervalMs` until the returned stop function runs. Fetching on open and
 * stopping on close is what R5 and R7 promise.
 *
 * A response that lands after `stop` is dropped, so closing the toggle (or
 * unmounting) cannot write into state nobody is reading.
 */
export function startQualityPolling<H>(deps: QualityPollDeps<H>): () => void {
  const { fetch, onEvent, schedule, cancel } = deps
  let alive = true
  const tick = () => {
    fetch().then(
      (data) => {
        if (alive) onEvent({ kind: "ok", data })
      },
      (e: unknown) => {
        if (alive) onEvent({ kind: "fail", message: e instanceof Error ? e.message : String(e) })
      },
    )
  }
  tick()
  const handle = schedule(tick, deps.intervalMs ?? REFRESH_MS)
  return () => {
    alive = false
    cancel(handle)
  }
}

/**
 * Tracks a toggle and polls quality data while it is open. The loop itself
 * lives in `startQualityPolling`; this hook only wires it to React state.
 *
 * Off derives the idle state rather than writing it back through an effect, so
 * the last frame survives a fast re-enable, and the effect's cleanup stops the
 * loop so a closed toggle never lets an in-flight response land.
 */
export function useQuality(enabled: boolean): QualityState {
  const [state, setState] = useState<QualityState>(IDLE)

  useEffect(() => {
    if (!enabled) return
    return startQualityPolling({
      fetch: fetchQuality,
      onEvent: (event) => setState((s) => qualityReducer(s, event)),
      schedule: (tick, ms) => setInterval(tick, ms),
      cancel: (handle) => clearInterval(handle),
    })
  }, [enabled])

  return enabled ? state : IDLE
}
