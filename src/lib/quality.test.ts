/// <reference types="node" />
// Run with `npm test`: Node strips the types itself.
import assert from "node:assert/strict"

import {
  bandsFor,
  batchToSeries,
  classifyBucket,
  fetchQuality,
  groupByProbe,
  isTimeout,
  lossText,
  pointQuality,
  qualityReducer,
  qualityViewState,
  startQualityPolling,
  THRESHOLDS,
  tooltipText,
  worse,
  type Quality,
  type QualityEvent,
  type QualitySlice,
  type QualityState,
} from "./quality.ts"

// classifyBucket: latency/loss -> quality tier
assert.equal(classifyBucket(50, 0), "good", "low latency + no loss -> good")
assert.equal(classifyBucket(99, 0), "good", "just under 100ms -> good")
assert.equal(classifyBucket(100, 0), "warn", "100ms boundary -> warn (KTD5: <100 绿)")
assert.equal(classifyBucket(300, 0), "warn", "300ms boundary -> warn (KTD5: 100–300 黄)")
assert.equal(classifyBucket(301, 0), "bad", "above 300ms -> bad")

assert.equal(classifyBucket(50, 0.99), "good", "just under 1% loss -> good")
assert.equal(classifyBucket(50, 1), "warn", "1% loss boundary -> warn (KTD5: <1% 绿)")
assert.equal(classifyBucket(50, 5), "warn", "5% loss boundary -> warn (KTD5: 1–5% 黄)")
assert.equal(classifyBucket(50, 5.0001), "bad", "just over 5% loss -> bad")

// Worse-of wins: high latency can rescue small loss, and vice versa.
assert.equal(classifyBucket(50, 10), "bad", "high loss dominates low latency")
assert.equal(classifyBucket(500, 0), "bad", "high latency dominates no loss")
assert.equal(classifyBucket(200, 3), "warn", "warn + warn stays warn")

// Full timeout: latency null -> timeout regardless of loss value.
assert.equal(classifyBucket(null, 0), "timeout", "null latency -> timeout")
assert.equal(classifyBucket(null, 50), "timeout", "null latency + high loss -> still timeout")
assert.equal(classifyBucket(null, null), "timeout", "null latency + null loss -> timeout")
// Hub's stored marker for a timed-out probe.
assert.equal(classifyBucket(-1, 0), "timeout", "negative latency marker -> timeout, not good")

// isTimeout keeps colour and tooltip in sync.
assert.equal(isTimeout(null), true, "null -> timeout")
assert.equal(isTimeout(-1), true, "negative -> timeout")
assert.equal(isTimeout(0), false, "zero is a real reading")
assert.equal(isTimeout(42), false, "42 is a real reading")

// Worse-of ordering check
assert.equal(worse("good", "warn"), "warn")
assert.equal(worse("warn", "good"), "warn")
assert.equal(worse("bad", "timeout"), "timeout")
assert.equal(worse("timeout", "bad"), "timeout")
assert.equal(worse("good", "good"), "good")

// Thresholds are exported and stable so future renames get caught.
assert.deepEqual(THRESHOLDS, {
  latency: { good: 100, warn: 300 },
  loss: { good: 1, warn: 5 },
} as const)

// pointQuality: raw sample -> tier (delays the band UI from re-deriving)
assert.equal(pointQuality({ task_id: 1, ts: 0, latency: 80 }), "good")
assert.equal(pointQuality({ task_id: 1, ts: 0, latency: 150 }), "warn")
assert.equal(pointQuality({ task_id: 1, ts: 0, latency: 500 }), "bad")
assert.equal(pointQuality({ task_id: 1, ts: 0, latency: null }), "timeout")
assert.equal(pointQuality({ task_id: 1, ts: 0, latency: 50, loss: 2 }), "warn", "loss can raise the tier")

// groupByProbe: the shared fold for both the band and the detail page.
const slice: QualitySlice = {
  ping: [
    { task_id: 7, ts: 100, latency: 80 }, // good
    { task_id: 7, ts: 160, latency: 200, loss: 2 }, // warn
    { task_id: 7, ts: 220, latency: 400 }, // bad
    { task_id: 7, ts: 280, latency: null }, // timeout
    { task_id: 8, ts: 100, latency: 50 }, // separate probe
  ],
  probes: { 7: "home", 8: "office", 9: "silent" },
  loss: { 7: 4.2 },
}
const grouped = groupByProbe(slice)
const home = grouped.find((s) => s.id === 7)!
const office = grouped.find((s) => s.id === 8)!
assert.equal(grouped.length, 2, "one series per probe that has samples")
assert.deepEqual(home.points.map((p) => p.latency), [80, 200, 400, null], "probe 7 points in hub order")
assert.equal(home.loss, 4.2, "loss lifted from slice.loss by id")
assert.equal(office.points.length, 1, "probe 8 only one sample")
assert.equal(office.name, "office")
assert.equal(office.loss, 0, "a probe absent from the loss map falls back to 0")
assert.equal(
  grouped.some((s) => s.id === 9),
  false,
  "a probe assigned but silent in this window contributes no series (R4's blank)",
)

// The fold takes the union of named probes and the samples' own task ids, so a
// sample the hub sent without a matching name still draws rather than vanishing.
const unnamed: QualitySlice = {
  ping: [{ task_id: 42, ts: 1, latency: 90 }],
  probes: {},
  loss: {},
}
const orphan = groupByProbe(unnamed)
assert.equal(orphan.length, 1, "an unnamed sample still yields a series")
assert.equal(orphan[0].name, "探测 42", "and is named the way the detail page names one")

// A payload with no probes field at all must not throw.
assert.deepEqual(
  groupByProbe({ ping: [{ task_id: 1, ts: 1, latency: 10 }] } as QualitySlice),
  [{ id: 1, name: "探测 1", points: [{ task_id: 1, ts: 1, latency: 10 }], loss: 0 }],
  "a missing probes/loss field degrades to the unnamed fallback, not a crash",
)

// Empty slice: no probes -> no series.
assert.deepEqual(groupByProbe({ ping: [], probes: {}, loss: {} }), [])

// Bucket with latency but no loss -> 0% loss assumed, tier from latency alone.
const noLoss: QualitySlice = {
  ping: [{ task_id: 1, ts: 1, latency: 50 }],
  probes: { 1: "p1" },
  loss: {},
}
assert.deepEqual(groupByProbe(noLoss)[0].points.map((p) => p.loss), [undefined])

// All-timeout bucket: latency null -> its own grey tier, not a blank slot.
const timeoutBucket: QualitySlice = {
  ping: [{ task_id: 1, ts: 1, latency: null, loss: 100 }],
  probes: { 1: "p1" },
  loss: {},
}
assert.equal(groupByProbe(timeoutBucket)[0].points[0].latency, null, "raw latency preserved")

// tooltipText: time + ms/loss, loss only when it happened. The time part is
// locale/timezone-dependent, so it is matched as a pattern, not a literal.
const at = 1_700_000_000
assert.match(tooltipText({ task_id: 1, ts: at, latency: 42, loss: 0 }), /^\d{2}:\d{2} · 42 ms$/, "0% loss -> no loss clause")
// No loss key at all is the other half of that: the hub omits it when nothing
// was lost, so this is the branch the 0% case cannot reach.
assert.match(tooltipText({ task_id: 1, ts: at, latency: 42 }), /^\d{2}:\d{2} · 42 ms$/, "absent loss -> no loss clause")
assert.match(tooltipText({ task_id: 1, ts: at, latency: null, loss: 100 }), /^\d{2}:\d{2} · 超时$/, "timeout -> 超时")
assert.match(tooltipText({ task_id: 1, ts: at, latency: 150, loss: 2.4 }), /· 丢 2%$/, "loss rounds to nearest percent")
assert.match(tooltipText({ task_id: 1, ts: at, latency: 150, loss: 0.4 }), /· 丢 <1%$/, "sub-1% loss reads as <1, not 0")
assert.match(tooltipText({ task_id: 1, ts: at, latency: 150.6, loss: 0 }), /· 151 ms$/, "latency rounds to whole ms")
// tooltipText and classifyBucket share the timeout guard — the colour and
// the label agree for the hub's negative-latency marker.
assert.match(tooltipText({ task_id: 1, ts: at, latency: -1, loss: 0 }), /· 超时$/, "-1 marker -> 超时, never \"-1 ms\"")

// lossText: the same figure the detail page's badge shows.
assert.equal(lossText(4.2), "丢 4%", "rounds to the nearest percent")
assert.equal(lossText(0.4), "丢 <1%", "sub-1% is not rounded to the 0 that means none")
assert.equal(lossText(1), "丢 1%", "1% is a whole percent")
assert.equal(lossText(100), "丢 100%", "a full timeout reads as 100%")

// batchToSeries: the tri-state vocabulary a single value carries.
assert.equal(batchToSeries(undefined), undefined, "undefined -> undefined (off)")
assert.equal(batchToSeries(null), null, "null -> null (loading)")
const ready = batchToSeries({ "7": slice, "8": { ...slice, probes: { 8: "office" } } })
assert.ok(ready instanceof Map, "Map -> Map")
assert.equal(ready!.get(7)!.length, 2, "node 7 carries its two probe series")
// Node 8's entry names only probe 8 but still carries probe 7's samples, so the
// union keeps both — the unnamed one gets the fallback name.
assert.equal(ready!.get(8)!.length, 2, "the fold takes named probes and samples together")
assert.equal(ready!.get(8)!.find((s) => s.id === 7)!.name, "探测 7", "an unnamed sample is still labelled")

// bandsFor: per-node view on the same map, same tri-state vocabulary.
assert.equal(bandsFor(undefined, 1), undefined, "off map -> undefined for any id")
assert.equal(bandsFor(null, 1), null, "loading map -> null for any id")
assert.deepEqual(bandsFor(ready!, 1), [], "missing id -> empty array, not null")
const homeBands = bandsFor(ready!, 7)
assert.ok(homeBands && homeBands.length === 2, "id present -> its series")
assert.equal(homeBands![0].name, "home", "name preserved")

// fetchQuality exists and calls the expected path (smoke check; no network).
const originalFetch = globalThis.fetch
let called = ""
globalThis.fetch = ((input: RequestInfo | URL) => {
  called = String(input)
  return Promise.resolve(
    new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
  )
}) as typeof fetch
try {
  await fetchQuality()
  assert.ok(called.endsWith("/api/nodes/quality"), `hits /nodes/quality, got ${called}`)
} finally {
  globalThis.fetch = originalFetch
}

// Anchors the Quality union so a future rename breaks the test -- every
// tier is reachable from a real input.
for (const [latency, loss, expected] of [
  [50, 0, "good"],
  [200, 0, "warn"],
  [400, 0, "bad"],
  [null, 0, "timeout"],
] as [number | null, number | null, Quality][]) {
  assert.equal(classifyBucket(latency, loss), expected, `${latency}/${loss} -> ${expected}`)
}

// qualityReducer: the state machine the polling loop folds outcomes through
// (the loop itself is exercised below, with a fake scheduler).
const idle: QualityState = { data: null, error: null }
const batch = { "7": slice, "8": slice }

const loaded = qualityReducer(idle, { kind: "ok", data: batch })
assert.equal(loaded.data, batch, "ok sets the frame")
assert.equal(loaded.error, null, "ok leaves no error")

// A failed refresh keeps the frame it already had, so the page does not blank
// when one poll misses.
const failed = qualityReducer(loaded, { kind: "fail", message: "boom" })
assert.equal(failed.data, batch, "fail keeps the last frame")
assert.equal(failed.error, "boom", "fail records the message")

const recovered = qualityReducer(failed, { kind: "ok", data: batch })
assert.equal(recovered.error, null, "a later success clears the error")

// qualityViewState: the tri-state every view reads (R4/R5).
assert.equal(qualityViewState(false, loaded), undefined, "toggle off -> undefined, even with data held")
assert.equal(qualityViewState(true, idle), null, "on, no data yet -> null (skeleton)")
// A failed first fetch reads as the empty map, not a skeleton that never resolves.
const failedView = qualityViewState(true, { data: null, error: "hub 503" })
assert.ok(failedView instanceof Map, "a failed first fetch reads as the empty map, not null")
assert.equal(failedView!.size, 0, "and it holds nothing")
const readyView = qualityViewState(true, loaded)
assert.ok(readyView instanceof Map, "ready -> the map")
assert.equal(readyView!.size, 2, "both nodes in the batch")
// A failure after data landed keeps showing the stale frame.
assert.equal(qualityViewState(true, failed)!.size, 2, "a failed refresh still shows the last frame")

// startQualityPolling: R5 (fetch only while open) and R7 (about 60s) driven by
// a fake scheduler -- the effect itself is unreachable without a DOM, so the
// loop was split out to be testable at all.
async function drain() {
  // Two microtask turns let a resolved/rejected fetch reach its callbacks.
  await Promise.resolve()
  await Promise.resolve()
}

const events: QualityEvent[] = []
let scheduled: { tick: () => void; ms: number } | null = null
let cancelled = 0
const stop = startQualityPolling({
  fetch: () => Promise.resolve(batch),
  onEvent: (e) => events.push(e),
  schedule: (tick, ms) => {
    scheduled = { tick, ms }
    return 7
  },
  cancel: (h) => {
    assert.equal(h, 7, "the handle the scheduler returned is what gets cancelled")
    cancelled++
  },
})
await drain()
assert.equal(events.length, 1, "fetches once as soon as it starts")
assert.equal(events[0].kind, "ok", "and reports the frame")
assert.equal(scheduled!.ms, 60_000, "schedules the next poll at the documented interval")

scheduled!.tick()
await drain()
assert.equal(events.length, 2, "polls again on the interval")

// A response landing after stop must not write into state nobody reads.
stop()
assert.equal(cancelled, 1, "stop cancels the scheduled tick")
scheduled!.tick()
await drain()
assert.equal(events.length, 2, "a late tick after stop emits nothing")

// A rejection is reported as a fail event, not swallowed and not thrown.
const failEvents: QualityEvent[] = []
startQualityPolling({
  fetch: () => Promise.reject(new Error("hub 503")),
  onEvent: (e) => failEvents.push(e),
  schedule: () => 0,
  cancel: () => {},
})
await drain()
assert.deepEqual(failEvents, [{ kind: "fail", message: "hub 503" }], "a rejected fetch becomes a fail event")

console.log("质量分级与批量切片解析正确")
