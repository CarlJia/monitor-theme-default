/// <reference types="node" />
import assert from "node:assert/strict"
import { aggregateByCountry, bubbleRadius } from "./map-aggregate.ts"
import type { Node } from "./api.ts"

const node = (id: number, country: string, online: boolean): Node =>
  ({ id, country, online }) as Node

// 聚合：按国家计数并分在线状态；空 country（hub 无法定位）不产生地图条目。
const nodes = [
  node(1, "US", true), node(2, "US", true), node(3, "US", false),
  node(4, "DE", true), node(5, "DE", true),
  node(6, "", true),
]
const agg = aggregateByCountry(nodes)
assert.equal(agg.size, 2, "两个国家 + 空 country 不入结果")
assert.deepEqual(agg.get("US"), { total: 3, online: 2, state: "partial" }, "US: 3 台 2 在线 → partial")
assert.deepEqual(agg.get("DE"), { total: 2, online: 2, state: "all" }, "DE: 全在线 → all")
assert.equal(agg.get(""), undefined, "空 country 无条目")

// 三态判定（AE6）：全在线 / 部分离线 / 全离线互不相同。
assert.equal(aggregateByCountry([node(7, "FR", false), node(8, "FR", false)]).get("FR")!.state, "none", "全离线 → none")
assert.notEqual(agg.get("US")!.state, agg.get("DE")!.state, "partial 与 all 可区分")
assert.notEqual(agg.get("US")!.state, "none", "partial 与 none 可区分")

// 半径映射：节点数 1 与 50 都在区间内，且单调不减。
assert.ok(bubbleRadius(1) >= 8 && bubbleRadius(1) <= 16, "1 台的半径在 [8,16]")
assert.ok(bubbleRadius(50) >= 16 && bubbleRadius(50) <= 40, "50 台的半径在 [16,40]")
let prev = 0
for (const n of [0, 1, 2, 5, 10, 25, 50, 100, 1000]) {
  const r = bubbleRadius(n)
  assert.ok(r >= prev, `半径单调不减（n=${n}）`)
  prev = r
}

// 空列表与全空 country：聚合结果为空 Map，不抛错。
assert.equal(aggregateByCountry([]).size, 0, "空列表")
assert.equal(aggregateByCountry([node(9, "", false)]).size, 0, "全空 country")

console.log("地图国家聚合与气泡半径正确")
