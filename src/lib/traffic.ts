import type { Node } from "./api"

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
