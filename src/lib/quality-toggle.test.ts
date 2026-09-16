/// <reference types="node" />
// Run with `npm test`: Node strips the types itself. localStorage does not
// exist here, so every case passes a Storage stand-in explicitly.
import assert from "node:assert/strict"

import { readQualityOn, saveQualityOn } from "./quality-toggle.ts"

function store(initial: Record<string, string> = {}): Storage {
  return {
    getItem: (k) => initial[k] ?? null,
    setItem: (k, v) => {
      initial[k] = String(v)
    },
  } as Storage
}

// 空、合法、非法：默认关闭，与视图偏好同款容错。
assert.equal(readQualityOn(store()), false, "空 localStorage 回落关闭")
assert.equal(readQualityOn(store({ quality: "true" })), true, "true 读回开")
assert.equal(readQualityOn(store({ quality: "false" })), false, "false 读回关")
assert.equal(readQualityOn(store({ quality: "1" })), false, "未知值回落关闭")
assert.equal(readQualityOn(store({ quality: "" })), false, "空串回落关闭")

for (const v of [true, false]) {
  const s = store()
  saveQualityOn(v, s)
  assert.equal(readQualityOn(s), v, `saveQualityOn(${v}) 后读回一致`)
}

console.log("质量开关读写与回落正确")
