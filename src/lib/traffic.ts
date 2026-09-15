import type { Node } from "./api.ts"
import { bytes, FOREVER, pair } from "./format.ts"

/** Which direction the plan meters, matching the node's traffic_mode. */
export function monthUsage(node: Pick<Node, "month_rx" | "month_tx" | "traffic_mode">): number {
  const { month_rx: rx, month_tx: tx } = node
  switch (node.traffic_mode) {
    case "up":
      return tx
    case "down":
      return rx
    case "max":
      return Math.max(rx, tx)
    default:
      return rx + tx
  }
}

/** Traffic uses the plan's own counting rule, so the figure matches the quota the node is billed against. */
export function trafficFoot(node: Pick<Node, "month_rx" | "month_tx" | "traffic_mode" | "traffic_limit">): string {
  return node.traffic_limit > 0
    ? pair(monthUsage(node), node.traffic_limit)
    : `${bytes(monthUsage(node))} / ${FOREVER}`
}
