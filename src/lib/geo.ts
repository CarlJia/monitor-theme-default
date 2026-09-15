import { geoCentroid } from "d3-geo"
import { feature } from "topojson-client"
import type { Feature, FeatureCollection, Geometry } from "geojson"
import type { Topology } from "topojson-specification"
import countries from "world-atlas/countries-50m.json" with { type: "json" }

// .ts 扩展名：本文件被 node 直跑的 geo.test.ts 导入，Node 的 ESM 解析要求
// 显式扩展名；tsc（allowImportingTsExtensions）与 Vite 都接受同一写法。
import { COUNTRY_CODES } from "./country-codes.ts"

export type CountryEntry = {
  /** 国家轮廓，喂给地图底图图层；仅有回退坐标的小属地没有。 */
  feature?: Feature<Geometry>
  /** 轮廓几何中心（纬度,经度），Leaflet 口径，气泡的落点。 */
  centroid: [number, number]
}

// 50m 数据不画的个别边缘属地（如 GF、GI）用手工坐标落点——气泡只需要
// 坐标，不需要轮廓；底图仍然只画有轮廓的国家。
const FALLBACK_CENTROIDS: Record<string, [number, number]> = {
  AD: [42.55, 1.6], AI: [18.22, -63.06], AS: [-14.27, -170.13], AX: [60.22, 19.94],
  BB: [13.18, -59.55], BH: [26.03, 50.56], BM: [32.3, -64.76], BL: [17.9, -62.85],
  BV: [-54.42, 3.36], CC: [-12.16, 96.87], CK: [-21.24, -159.78], CV: [15.12, -23.61],
  CX: [-10.42, 105.72], DM: [15.42, -61.34], FO: [62.01, -6.77], FM: [6.92, 158.16],
  GF: [3.88, -53.06], GG: [49.47, -2.59], GI: [36.14, -5.35], GP: [16.24, -61.53],
  GU: [13.42, 144.75], HK: [22.32, 114.17], HM: [-53.1, 72.6], IO: [-6.3, 71.7],
  IM: [54.24, -4.55], JE: [49.21, -2.13], KI: [1.87, -157.36], KN: [17.33, -62.75],
  KY: [19.31, -81.26], LC: [13.91, -60.98], LI: [47.15, 9.56], MC: [43.74, 7.42],
  MO: [22.2, 113.55], MQ: [14.64, -61.02], MS: [16.75, -62.22], MT: [35.9, 14.42],
  MU: [-20.35, 57.55], MV: [3.2, 73.2], MH: [7.09, 171.12], MP: [15.19, 145.75],
  NF: [-29.04, 167.96], NR: [-0.52, 166.93], NU: [-19.05, -169.87], PF: [-17.53, -149.56],
  PM: [46.88, -56.32], PN: [-25.07, -130.1], PW: [7.5, 134.62], RE: [-21.12, 55.54],
  SC: [-4.68, 55.49], SG: [1.35, 103.82], SH: [-15.97, -5.71], SJ: [77.55, 15.97],
  SM: [43.94, 12.46], ST: [0.24, 6.6], TC: [21.69, -71.8], TF: [-49.25, 69.17],
  TO: [-21.18, -175.2], TV: [-7.48, 178.68], VA: [41.9, 12.45], VG: [18.42, -64.64],
  VI: [18.34, -64.9], WF: [-13.3, -176.2], WS: [-13.72, -172.1], YT: [-12.78, 45.17],
}

/**
 * alpha-2 → 国家轮廓与中心。模块加载时构建一次：50m 数据 739 KB（gzip
 * ~227 KB，只进地图懒加载块），转换与求心各跑一遍就够，之后全是查表。
 * world-atlas 用数字码作 feature id，经 `country-codes.ts` 换成 alpha-2；
 * 缺轮廓的边缘属地落回手工坐标；两者都没有的 alpha-2 不出现——地图少一
 * 个条目比报错好。
 */
const entries = new Map<string, CountryEntry>()
{
  const topo = countries as unknown as Topology
  const world = feature(topo, topo.objects.countries) as FeatureCollection<Geometry>
  for (const f of world.features) {
    const alpha2 = COUNTRY_CODES[String(f.id)]
    if (!alpha2) continue
    // geoCentroid 返回 [经度,纬度]，统一翻转为 [纬度,经度]，与
    // FALLBACK_CENTROIDS 及 L.circleMarker 的口径一致。
    const c = geoCentroid(f)
    if (Number.isFinite(c[0]) && Number.isFinite(c[1])) {
      entries.set(alpha2, { feature: f, centroid: [c[1], c[0]] })
    }
  }
  for (const [alpha2, centroid] of Object.entries(FALLBACK_CENTROIDS)) {
    if (!entries.has(alpha2)) entries.set(alpha2, { centroid })
  }
}

export const countriesByCode: ReadonlyMap<string, CountryEntry> = entries
