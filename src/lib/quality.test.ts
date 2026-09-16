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
  pointQuality,
  qualityReducer,
  qualityViewState,
  THRESHOLDS,
  tooltipText,
  worse,
  type Quality,
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
  probes: { 7: "home", 8: "office" },
  loss: {},
}
const grouped = groupByProbe(slice)
const home = grouped.find((s) => s.id === 7)!
const office = grouped.find((s) => s.id === 8)!
assert.equal(grouped.length, 2, "one series per probed id")
assert.deepEqual(home.points.map((p) => p.latency), [80, 200, 400, null], "probe 7 points in hub order")
assert.equal(home.loss, 0, "loss lifted from slice.loss by id, 0 when absent")
assert.equal(office.points.length, 1, "probe 8 only one sample")
assert.equal(office.name, "office")

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
assert.match(tooltipText({ task_id: 1, ts: at, latency: 42, loss: 0 }), /^\d{2}:\d{2} · 42 ms$/, "no-loss bucket -> no loss clause")
assert.match(tooltipText({ task_id: 1, ts: at, latency: null, loss: 100 }), /^\d{2}:\d{2} · 超时$/, "timeout -> 超时")
assert.match(tooltipText({ task_id: 1, ts: at, latency: 150, loss: 2.4 }), /· 丢 2%$/, "loss rounds to nearest percent")
assert.match(tooltipText({ task_id: 1, ts: at, latency: 150, loss: 0.4 }), /· 丢 <1%$/, "sub-1% loss reads as <1, not 0")
assert.match(tooltipText({ task_id: 1, ts: at, latency: 150.6, loss: 0 }), /· 151 ms$/, "latency rounds to whole ms")
// tooltipText and classifyBucket share the timeout guard — the colour and
// the label agree for the hub's negative-latency marker.
assert.match(tooltipText({ task_id: 1, ts: at, latency: -1, loss: 0 }), /· 超时$/, "-1 marker -> 超时, never \"-1 ms\"")

// batchToSeries: the tri-state vocabulary a single value carries.
assert.equal(batchToSeries(undefined), undefined, "undefined -> undefined (off)")
assert.equal(batchToSeries(null), null, "null -> null (loading)")
const ready = batchToSeries({ "7": slice, "8": { ...slice, probes: { 8: "office" } } })
assert.ok(ready instanceof Map, "Map -> Map")
assert.equal(ready!.get(7)!.length, 2, "node 7 carries its two probe series")
assert.equal(ready!.get(8)![0].points.length, 1, "node 8's single probe preserved")

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

// qualityReducer: the hook's lifecycle, without a DOM (R5/R7 testable here).
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

console.log("质量分级与批量切片解析正确")
