import "leaflet/dist/leaflet.css"
import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import { geoGraticule10 } from "d3-geo"

import { Status } from "@/components/NodeCard"
import type { Node } from "@/lib/api"
import { countryToFlag } from "@/lib/format"
import { countriesByCode } from "@/lib/geo"
import { aggregateByCountry, bubbleRadius } from "@/lib/map-aggregate"

// 气泡三态的视觉通道（KTD6）：在线用既有的例外绿，部分在线用前景色，
// 全离线空心。类名而非内联色，明暗主题切换即时生效。
const BUBBLE_CLASS = {
  all: "map-bubble-all",
  partial: "map-bubble-partial",
  none: "map-bubble-none",
} as const

// 底图特征一次展开：切回地图视图（含严格模式双挂载）不再重算两百多条。
// 110m 轮廓 + 经纬网，全部内置，零外部请求（R11 同源约束）。
const LAND_FEATURES = [...countriesByCode.values()].flatMap((e) => (e.feature ? [e.feature] : []))
const GRATICULE = geoGraticule10()

export function WorldMap({
  nodes,
  onOpen,
  country,
}: {
  nodes: Node[]
  onOpen: (id: number) => void
  /** 当前选中的国家过滤；变化时收起展开的列表（KTD8）。 */
  country: string | null
}) {
  const host = useRef<HTMLDivElement>(null)
  const bubbles = useRef<L.LayerGroup | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  // 地图只建一次：底图为内置 110m 轮廓与经纬网，无任何瓦片请求（R11）。
  // relative z-0 把 Leaflet 内部 200–1000 的 z-index 关进容器自己的层叠上
  // 下文，滚动时不会浮到吸顶头部上；清理函数保证严格模式双挂载安全。
  useEffect(() => {
    if (!host.current) return
    const m = L.map(host.current, {
      attributionControl: false,
      minZoom: 2,
      maxZoom: 8,
      worldCopyJump: true,
    })
    L.geoJSON(GRATICULE, { style: { className: "map-graticule", weight: 0.5, fill: false } }).addTo(m)
    L.geoJSON(LAND_FEATURES, { style: { className: "map-land", weight: 1 } }).addTo(m)
    m.fitWorld()
    bubbles.current = L.layerGroup().addTo(m)
    return () => {
      m.remove()
      bubbles.current = null
    }
  }, [])

  // 过滤切换收起展开的列表；视图切换经卸载同样丢弃（KTD8）。
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setExpanded(null)
  }, [country])

  // 实时数据：气泡数量至多等于国家数，每 2 秒全量重建的代价可忽略，
  // 换来在线状态与计数的即时刷新。
  useEffect(() => {
    const group = bubbles.current
    if (!group) return
    group.clearLayers()
    for (const [code, stat] of aggregateByCountry(nodes)) {
      const entry = countriesByCode.get(code)
      if (!entry) continue
      const marker = L.circleMarker(entry.centroid, {
        radius: bubbleRadius(stat.total),
        weight: 1.5,
        className: BUBBLE_CLASS[stat.state],
        fillOpacity: stat.state === "none" ? 0 : 0.9,
      })
      // 文本节点而非字符串：Leaflet 的 setContent 对字符串走 innerHTML，对节点走
      // appendChild（dist/leaflet-src.js 的 DivOverlay._updateContent）。上面
      // `countriesByCode.get(code)` 那道查表已经把 code 限成两个大写字母，所以现在
      // 也没有可利用的输入；但「不注入」不该是这个查表的副产品——主题与 /admin/ 同源，
      // 这里的一次注入等于拿到后台的登录会话，值得单独堵死。
      const tip = document.createElement("span")
      tip.textContent = `${countryToFlag(code)} ${code} · ${stat.online}/${stat.total} 在线`
      marker.bindTooltip(tip)
      // 再点同一气泡是收起，点另一气泡是切换（同一时刻至多一个展开国）。
      marker.on("click", () => setExpanded((current) => (current === code ? null : code)))
      marker.addTo(group)
    }
  }, [nodes])

  const expandedNodes = expanded ? nodes.filter((n) => n.country === expanded) : []

  return (
    <div className="space-y-3">
      <div ref={host} className="relative z-0 h-[480px] w-full overflow-hidden rounded-lg border" />
      {expanded && (
        <div>
          <h3 className="mb-2 text-sm font-medium">
            <span aria-hidden>{countryToFlag(expanded)}</span> {expanded} · {expandedNodes.length} 台
          </h3>
          <ul className="divide-y rounded-lg border">
            {expandedNodes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                  onClick={() => onOpen(n.id)}
                >
                  <span className="min-w-0 truncate">{n.name}</span>
                  <Status node={n} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
