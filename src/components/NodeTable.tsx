import { ArrowDown, ArrowUp } from "lucide-react"

import { Country, Status } from "@/components/NodeCard"
import { QualitySlot } from "@/components/QualityBand"
import type { Node } from "@/lib/api"
import { bandsFor, type ProbeSeries } from "@/lib/quality"
import { pair, rate, uptime } from "@/lib/format"
import { trafficFoot } from "@/lib/traffic"

/** The columns after identity (name/country/status) — one source for header and cells. */
type Metric = "uptime" | "cpu" | "mem" | "disk" | "traffic" | "speed"

const COLS: { key: Metric; label: string }[] = [
  { key: "uptime", label: "在线时长" },
  { key: "cpu", label: "CPU" },
  { key: "mem", label: "内存" },
  { key: "disk", label: "硬盘" },
  { key: "traffic", label: "月流量" },
  { key: "speed", label: "网速" },
]

// A cell that has nothing live to show keeps its dash rather than a stretched
// blank, mirroring the card's treatment of a disconnected node.
const Dash = () => <span className="text-muted-foreground">—</span>

function MetricCell({ node, metric }: { node: Node; metric: Metric }): React.ReactNode {
  const m = node.metrics
  switch (metric) {
    case "uptime":
      return m ? <span className="tnum">{uptime(m.uptime)}</span> : <Dash />
    case "cpu":
      return m ? <span className="tnum">{m.cpu.toFixed(1)}%</span> : <Dash />
    case "mem":
      return m ? <span className="tnum">{pair(m.mem_used, m.mem_total)}</span> : <Dash />
    case "disk":
      return m ? <span className="tnum">{pair(m.disk_used, m.disk_total)}</span> : <Dash />
    case "traffic":
      // 流量用计费口径（traffic_mode），与卡片的进度条同一规则。
      return <span className="tnum">{trafficFoot(node)}</span>
    case "speed":
      return m ? (
        <span className="tnum inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <ArrowDown className="size-3 text-muted-foreground" />
            {rate(m.net_rx)}
          </span>
          <span className="inline-flex items-center gap-1">
            <ArrowUp className="size-3 text-muted-foreground" />
            {rate(m.net_tx)}
          </span>
        </span>
      ) : (
        <Dash />
      )
  }
}

/**
 * The fleet as one row per node, for comparing machines against each other —
 * what the card grid's independent layouts make hard. Column count is fixed;
 * a phone pans horizontally rather than dropping the comparison (KTD7).
 *
 * With the quality toggle on, a band column joins the row (R2), rendering the
 * same component the cards use so the two views cannot drift (KTD4).
 */
export function NodeTable({
  nodes,
  onOpen,
  quality,
}: {
  nodes: Node[]
  onOpen: (id: number) => void
  /** Per-node series: undefined = toggle off, null = loading, Map = data ready. */
  quality?: Map<number, ProbeSeries[]> | null
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">名称</th>
            <th className="px-3 py-2 font-medium">国家</th>
            <th className="px-3 py-2 font-medium">状态</th>
            {quality !== undefined && <th className="px-3 py-2 font-medium">网络质量</th>}
            {COLS.map((col) => (
              <th key={col.key} className="px-3 py-2 font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr
              key={node.id}
              // Same affordances as the card: pointer, focus, Enter or Space.
              className="cursor-pointer border-b transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              tabIndex={0}
              onClick={() => onOpen(node.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(node.id))}
            >
              <td className="max-w-48 truncate px-3 py-2 font-medium">{node.name}</td>
              <td className="px-3 py-2">
                <Country node={node} />
              </td>
              <td className="px-3 py-2">
                <Status node={node} />
              </td>
              {/* Fixed width: every row's band spans the same track, so the
                  columns to its right stay aligned across rows. */}
              {quality !== undefined && (
                <td className="w-72 min-w-56 px-3 py-2 align-middle">
                  <QualitySlot quality={bandsFor(quality, node.id)} />
                </td>
              )}
              {COLS.map((col) => (
                <td key={col.key} className="whitespace-nowrap px-3 py-2">
                  <MetricCell node={node} metric={col.key} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
