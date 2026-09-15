import { badgeVariants } from "@/components/ui/badge"
import type { Node } from "@/lib/api"
import { countryToFlag } from "@/lib/format"
import { cn } from "@/lib/utils"

function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      // badgeVariants' outline hover style targets an anchor slot; a bare button
      // needs its own hover, and the cursor so the chip reads as interactive.
      className={cn(
        badgeVariants({ variant: active ? "default" : "outline" }),
        "cursor-pointer transition-colors",
        !active && "hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  )
}

/**
 * The full fleet's country breakdown as clickable chips. Each chip carries a
 * count so the row doubles as a glanceable summary, and a single selected chip
 * narrows the grid below it; clicking the active chip or "全部" returns to the
 * unfiltered view. Hidden entirely if no node reported a country, since the
 * row would have nothing to count.
 */
export function CountryFilter({
  nodes,
  selected,
  onChange,
}: {
  nodes: Node[]
  selected: string | null
  onChange: (next: string | null) => void
}) {
  const counts = new Map<string, number>()
  for (const n of nodes) {
    if (!n.country) continue
    counts.set(n.country, (counts.get(n.country) ?? 0) + 1)
  }
  if (counts.size === 0) return null

  // Busiest first so the eye lands on the dense countries; ties break on the
  // country code itself so the row does not jitter as data shifts.
  const countries = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip active={selected === null} onClick={() => onChange(null)}>
        全部 {nodes.length}
      </Chip>
      {countries.map(([code, count]) => (
        <Chip
          key={code}
          active={selected === code}
          // Same chip again means the user wants the unfiltered view back.
          onClick={() => onChange(selected === code ? null : code)}
          title={code}
        >
          <span aria-hidden>{countryToFlag(code)}</span>
          {code} {count}
        </Chip>
      ))}
    </div>
  )
}