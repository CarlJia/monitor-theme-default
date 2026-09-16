/// <reference types="node" />
// Run with `npm test`: Node strips the types itself.
import assert from "node:assert/strict"

import {
  classifyBucket,
  fetchQuality,
  sliceToBands,
  THRESHOLDS,
  tooltipText,
  worse,
  type Quality,
  type QualitySlice,
} from "./quality.ts"

// classifyBucket: latency/loss → quality tier
assert.equal(classifyBucket(50, 0), "good", "low latency + no loss → good")
assert.equal(classifyBucket(99, 0), "good", "just under 100ms → good")
assert.equal(classifyBucket(100, 0), "warn", "100ms boundary → warn (KTD5: <100 绿)")
assert.equal(classifyBucket(300, 0), "warn", "300ms boundary → warn (KTD5: 100–300 黄)")
assert.equal(classifyBucket(301, 0), "bad", "above 300ms → bad")

assert.equal(classifyBucket(50, 0.99), "good", "just under 1% loss → good")
assert.equal(classifyBucket(50, 1), "warn", "1% loss boundary → warn (KTD5: <1% 绿)")
assert.equal(classifyBucket(50, 5), "warn", "5% loss boundary → warn (KTD5: 1–5% 黄)")
assert.equal(classifyBucket(50, 5.0001), "bad", "just over 5% loss → bad")

// Worse-of wins: high latency can rescue small loss, and vice versa.
assert.equal(classifyBucket(50, 10), "bad", "high loss dominates low latency")
assert.equal(classifyBucket(500, 0), "bad", "high latency dominates no loss")
assert.equal(classifyBucket(200, 3), "warn", "warn + warn stays warn")

// Full timeout: null latency → timeout regardless of loss value.
assert.equal(classifyBucket(null, 0), "timeout", "null latency → timeout")
assert.equal(classifyBucket(null, 50), "timeout", "null latency + high loss → still timeout")
assert.equal(classifyBucket(null, null), "timeout", "null latency + null loss → timeout")
// The hub's stored marker for a timed-out probe; must not read as a fast RTT.
assert.equal(classifyBucket(-1, 0), "timeout", "negative latency marker → timeout, not good")

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

// sliceToBands: per-probe folding, each bucket carrying its raw sample
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
const bands = sliceToBands(slice)
const home = bands.find((b) => b.taskId === 7)!
const office = bands.find((b) => b.taskId === 8)!
assert.deepEqual(home.buckets.map((b) => b.quality), ["good", "warn", "bad", "timeout"], "probe 7 tiers ordered")
assert.equal(home.buckets[0].ts, 100, "bucket carries its ts")
assert.equal(home.buckets[0].latency, 80, "bucket carries its latency")
assert.equal(home.buckets[1].loss, 2, "bucket carries its loss")
assert.deepEqual(office.buckets.map((b) => b.quality), ["good"], "probe 8 only has one bucket")
assert.equal(home.name, "home")
assert.equal(office.name, "office")

// Empty slice: no probes → no bands.
assert.deepEqual(sliceToBands({ ping: [], probes: {}, loss: {} }), [], "empty slice → empty bands")

// Bucket with latency but no loss → 0% loss assumed, tier from latency alone.
const noLoss: QualitySlice = {
  ping: [{ task_id: 1, ts: 1, latency: 50 }],
  probes: { 1: "p1" },
  loss: {},
}
assert.deepEqual(sliceToBands(noLoss)[0].buckets.map((b) => b.quality), ["good"], "no-loss bucket uses 0% loss")

// All-timeout bucket: latency null → its own grey tier, not a blank slot.
const timeoutBucket: QualitySlice = {
  ping: [{ task_id: 1, ts: 1, latency: null, loss: 100 }],
  probes: { 1: "p1" },
  loss: {},
}
assert.deepEqual(sliceToBands(timeoutBucket)[0].buckets.map((b) => b.quality), ["timeout"], "all-timeout bucket → timeout tier")

// tooltipText: time + ms/loss, loss only when it happened. The time part is
// locale/timezone-dependent, so it is matched as a pattern, not a literal.
const at = 1_700_000_000
assert.match(tooltipText({ quality: "good", ts: at, latency: 42, loss: null }), /^\d{2}:\d{2} · 42 ms$/, "no loss → no loss clause")
assert.match(tooltipText({ quality: "good", ts: at, latency: 42, loss: 0 }), /^\d{2}:\d{2} · 42 ms$/, "0% loss → no loss clause")
assert.match(tooltipText({ quality: "timeout", ts: at, latency: null, loss: 100 }), /^\d{2}:\d{2} · 超时$/, "timeout → 超时")
assert.match(tooltipText({ quality: "warn", ts: at, latency: 150, loss: 2.4 }), /· 丢 2%$/, "loss rounds to nearest percent")
assert.match(tooltipText({ quality: "warn", ts: at, latency: 150, loss: 0.4 }), /· 丢 <1%$/, "sub-1% loss reads as <1, not 0")
assert.match(tooltipText({ quality: "warn", ts: at, latency: 150.6, loss: null }), /· 151 ms$/, "latency rounds to whole ms")

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

// Anchor the Quality union so a future rename breaks the test.
const q: Quality = "good"
assert.ok(["good", "warn", "bad", "timeout"].includes(q))

console.log("质量分级与批量切片解析正确")
