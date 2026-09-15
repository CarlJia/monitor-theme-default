import "leaflet/dist/leaflet.css"
import { useEffect, useRef, useState } from "react"
import L from "leaflet"

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
  const map = useRef<L.Map | null>(null)
  const bubbles = useRef<L.LayerGroup | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  // 地图只建一次：底图轮廓来自内置数据（R11 同源约束，无任何瓦片请求），
  // 清理函数保证严格模式双挂载安全。relative z-0 把 Leaflet 内部 200–1000
  // 的 z-index 关进容器自己的层叠上下文，滚动时不会浮到吸顶头部上。
  useEffect(() => {
    if (!host.current) return
    const m = L.map(host.current, {
      attributionControl: false,
      minZoom: 2,
      maxZoom: 8,
      worldCopyJump: true,
    })
    L.geoJSON(
      [...countriesByCode.values()].map((e) => e.feature),
      { style: { className: "map-land", weight: 1 } },
    ).addTo(m)
    m.fitWorld()
    bubbles.current = L.layerGroup().addTo(m)
    map.current = m
    return () => {
      m.remove()
      map.current = null
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
      marker.bindTooltip(`${countryToFlag(code)} ${code} · ${stat.online}/${stat.total} 在线`)
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
