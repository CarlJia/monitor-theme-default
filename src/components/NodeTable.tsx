import { ArrowDown, ArrowUp } from "lucide-react"

import { Country, Status } from "@/components/NodeCard"
import type { Node } from "@/lib/api"
import { bytes, FOREVER, pair, rate, uptime } from "@/lib/format"
import { monthUsage } from "@/lib/traffic"

const COLS = ["名称", "国家", "状态", "uptime", "CPU", "内存", "硬盘", "月流量", "网速"] as const

// A cell that has nothing live to show keeps its dash rather than a stretched
// blank, mirroring the card's treatment of a disconnected node.
const Dash = () => <span className="text-muted-foreground">—</span>

function Cell({ node, metric }: { node: Node; metric: string }): React.ReactNode {
  const m = node.metrics
  switch (metric) {
    case "CPU":
      return m ? <span className="tnum">{m.cpu.toFixed(1)}%</span> : <Dash />
    case "内存":
      return m ? <span className="tnum">{pair(m.mem_used, m.mem_total)}</span> : <Dash />
    case "硬盘":
      return m ? <span className="tnum">{pair(m.disk_used, m.disk_total)}</span> : <Dash />
    case "uptime":
      return m ? <span className="tnum">{uptime(m.uptime)}</span> : <Dash />
    case "月流量": {
      // 流量用计费口径（traffic_mode），与卡片的进度条同一规则。
      const used = monthUsage(node)
      return (
        <span className="tnum">
          {node.traffic_limit > 0 ? pair(used, node.traffic_limit) : `${bytes(used)} / ${FOREVER}`}
        </span>
      )
    }
    case "网速":
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
    default:
      return null
  }
}

/**
 * The fleet as one row per node, for comparing machines against each other —
 * what the card grid's independent layouts make hard. Column count is fixed;
 * a phone pans horizontally rather than dropping the comparison (KTD7).
 */
export function NodeTable({ nodes, onOpen }: { nodes: Node[]; onOpen: (id: number) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            {COLS.map((col) => (
              <th key={col} className="px-3 py-2 font-medium">
                {col}
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
              {["uptime", "CPU", "内存", "硬盘", "月流量", "网速"].map((metric) => (
                <td key={metric} className="whitespace-nowrap px-3 py-2">
                  <Cell node={node} metric={metric} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
