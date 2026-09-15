import type { Node } from "./api"

export type BubbleState = "all" | "partial" | "none"

export type CountryStat = { total: number; online: number; state: BubbleState }

/**
 * Nodes folded to one stat per country — the map draws one bubble per country
 * (R6), so this is the whole transform between the live list and the map layer.
 * Nodes with an empty country cannot be placed (R10) and drop out here.
 */
export function aggregateByCountry(nodes: Node[]): Map<string, CountryStat> {
  const stats = new Map<string, CountryStat>()
  for (const n of nodes) {
    if (!n.country) continue
    const stat = stats.get(n.country) ?? { total: 0, online: 0, state: "none" as BubbleState }
    stat.total++
    if (n.online) stat.online++
    stat.state = stat.online === 0 ? "none" : stat.online === stat.total ? "all" : "partial"
    stats.set(n.country, stat)
  }
  return stats
}

/**
 * Bubble size carries the node count. Square root rather than linear: 100
 * machines must not dwarf 1 into invisibility, and area (radius squared) then
 * still tracks count. 8px keeps a single node legible against its country.
 */
export function bubbleRadius(total: number): number {
  return 8 + 4 * Math.sqrt(total)
}
