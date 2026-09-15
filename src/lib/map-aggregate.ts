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
    const stat = stats.get(n.country)
    if (stat) {
      stat.total++
      if (n.online) stat.online++
    } else {
      stats.set(n.country, { total: 1, online: n.online ? 1 : 0, state: "none" })
    }
    const s = stats.get(n.country)!
    s.state = s.online === 0 ? "none" : s.online === s.total ? "all" : "partial"
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
