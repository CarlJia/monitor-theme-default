/// <reference types="node" />
import assert from "node:assert/strict"
import { monthUsage } from "./traffic.ts"

type Shape = { month_rx: number; month_tx: number; traffic_mode: string }
const node = (mode: string, rx = 300, tx = 100): Shape =>
  ({ month_rx: rx, month_tx: tx, traffic_mode: mode }) as Shape

// 流量按计费口径计量，bar 才对得上账单：四个 traffic_mode 分支。
assert.equal(monthUsage(node("sum")), 400, "sum 口径上下行合计")
assert.equal(monthUsage(node("up")), 100, "up 口径只计上行")
assert.equal(monthUsage(node("down")), 300, "down 口径只计下行")
assert.equal(monthUsage(node("max")), 300, "max 口径取大者")
assert.equal(monthUsage(node("其他/未知")), 400, "未知口径回落合计")

console.log("月流量计费口径正确")
