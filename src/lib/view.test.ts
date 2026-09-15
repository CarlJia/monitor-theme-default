/// <reference types="node" />
// Run with `npm test`: Node strips the types itself. localStorage does not
// exist here, so every case passes a Storage stand-in explicitly.
import assert from "node:assert/strict"
import { readView, saveView, type View } from "./view.ts"

function store(initial: Record<string, string> = {}): Storage {
  return {
    getItem: (k) => initial[k] ?? null,
    setItem: (k, v) => { initial[k] = String(v) },
  } as Storage
}

// 空、合法、非法：旧版本写入或手改的乱值都回落到默认视图，而不是让首页空着。
assert.equal(readView(store()), "cards", "空 localStorage 回落卡片")
assert.equal(readView(store({ view: "cards" })), "cards", "cards 读回")
assert.equal(readView(store({ view: "table" })), "table", "table 读回")
assert.equal(readView(store({ view: "map" })), "map", "map 读回")
assert.equal(readView(store({ view: "gallery" })), "cards", "未知值回落卡片")
assert.equal(readView(store({ view: "" })), "cards", "空串回落卡片")

for (const v of ["cards", "table", "map"] as View[]) {
  const s = store()
  saveView(v, s)
  assert.equal(readView(s), v, `saveView 后读回 ${v}`)
}

console.log("view 偏好读写与回落正确")
