import { geoCentroid } from "d3-geo"
import { feature } from "topojson-client"
import type { Feature, FeatureCollection, Geometry } from "geojson"
import type { Topology } from "topojson-specification"
import countries from "world-atlas/countries-110m.json" with { type: "json" }

// .ts 扩展名：本文件被 node 直跑的 geo.test.ts 导入，Node 的 ESM 解析要求
// 显式扩展名；tsc（allowImportingTsExtensions）与 Vite 都接受同一写法。
import { COUNTRY_CODES } from "./country-codes.ts"

export type CountryEntry = {
  /** 国家轮廓，喂给地图底图图层。 */
  feature: Feature<Geometry>
  /** 轮廓几何中心（经纬度），气泡的落点。 */
  centroid: [number, number]
}

/**
 * alpha-2 → 国家轮廓与中心。模块加载时构建一次：110m 数据 105 KB，转换与
 * 求心各跑一遍就够，之后全是查表。world-atlas 用数字码作 feature id，经
 * `country-codes.ts` 换成 alpha-2；hub 报告了而 110m 没画的国家（小岛）或
 * 数字码表未收录的 feature（如非 ISO 的 -99）在此安全消失——地图少一个
 * 气泡比报错好。
 */
const entries = new Map<string, CountryEntry>()
{
  const world = feature(
    countries as unknown as Topology,
    (countries as unknown as Topology).objects.countries,
  ) as FeatureCollection<Geometry>
  for (const f of world.features) {
    const alpha2 = COUNTRY_CODES[String(f.id)]
    if (!alpha2) continue
    const centroid = geoCentroid(f)
    if (Number.isFinite(centroid[0]) && Number.isFinite(centroid[1])) {
      entries.set(alpha2, { feature: f, centroid })
    }
  }
}

export const countriesByCode: ReadonlyMap<string, CountryEntry> = entries
