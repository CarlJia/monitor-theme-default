/// <reference types="node" />
// Run with `npm test`: Node strips the types itself. The JSON import needs the
// `with` attribute so the same source runs under tsc/Vite and plain node.
import assert from "node:assert/strict"
import { COUNTRY_CODES } from "./country-codes.ts"
import { countriesByCode } from "./geo.ts"

// 抽样：大国与常见 VPS 所在地的数字码必须正确，一张错键的表会在地图上把
// 整个国家画丢。
for (const [num, alpha2] of [
  ["840", "US"], ["156", "CN"], ["276", "DE"], ["702", "SG"], ["392", "JP"],
  ["826", "GB"], ["643", "RU"], ["764", "TH"], ["410", "KR"], ["360", "ID"],
] as const) {
  assert.equal(COUNTRY_CODES[num], alpha2, `数字码 ${num} 应映射 ${alpha2}`)
}

// alpha-2 值唯一且形如两个大写字母，录入笔误在这里现形。
const values = Object.values(COUNTRY_CODES)
assert.equal(new Set(values).size, values.length, "alpha-2 值不重复")
assert.ok(values.every((v) => /^[A-Z]{2}$/.test(v)), "alpha-2 均为两个大写字母")

// 轮廓中心（[纬度,经度]，Leaflet 口径）：US 中心在北半球西半边；
// 未知码安全返回 undefined 而非抛错。
const us = countriesByCode.get("US")
assert.ok(us, "US 有轮廓条目")
assert.ok(us!.centroid[0] > 25 && us!.centroid[0] < 50, "US 纬度在本土范围")
assert.ok(us!.centroid[1] < -90 && us!.centroid[1] > -130, "US 经度在西半边")
assert.equal(countriesByCode.get("XX"), undefined, "未知 alpha-2 返回 undefined")

// 全表守卫：centroid[0] 是纬度，必须落在 [-90,90]，混入 [经度,纬度] 顺序
// （d3-geo 口径）的条目会在这里现形。
for (const [code, entry] of countriesByCode) {
  assert.ok(
    Math.abs(entry.centroid[0]) <= 90,
    `${code} 的 centroid[0] 应为纬度（|值| ≤ 90），实际 ${entry.centroid[0]}`,
  )
}

// 110m 数据全集规模：掉了几十个国家说明数字码表或转换断了。
assert.ok(countriesByCode.size >= 230, `应至少 230 国，实际 ${countriesByCode.size}`)

// 换到 110m 档时最容易踩、又最难在图上发现的一处：那 9 个在 110m 有轮廓缺失、
// 坐标表也没补的国家，气泡会连位置一起消失（海岸线变粗是预期的，气泡消失不是）。
// 逐个钉住，条款见 geo.ts 坐标表末尾。
for (const code of ["AG", "AW", "CW", "GD", "GS", "KM", "MF", "SX", "VC"] as const) {
  assert.ok(countriesByCode.get(code), `${code} 有条目（110m 无轮廓，靠坐标表补）`)
}

// 边缘属地：常见 VPS 落点必须落得下来。110m 连 SG/HK 都不画，它们靠坐标表定位——
// 所以这里钉的是「有条目」而不是「有轮廓」：气泡本来就只需要坐标。
const sg = countriesByCode.get("SG")
assert.ok(sg, "SG 有条目")
assert.ok(countriesByCode.get("HK"), "HK 有条目")
const gf = countriesByCode.get("GF")
assert.ok(gf, "GF 有回退坐标条目")
assert.ok(!gf!.feature, "GF 无轮廓（110m 未收录）")
assert.ok(Math.abs(gf!.centroid[0] - 3.88) < 0.01 && Math.abs(gf!.centroid[1] + 53.06) < 0.01, "GF 坐标为手工回退值")

console.log(`国家码表与轮廓中心正确（${countriesByCode.size} 国）`)
