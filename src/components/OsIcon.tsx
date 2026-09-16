import { OS_MARKS, osMark } from "@/lib/os"
import { cn } from "@/lib/utils"

/**
 * The distribution's logo, at the size a line of small text prints.
 *
 * `title` is what makes the mark carry meaning: it is the screen reader's label
 * and the native hover tooltip, which is where the version a card no longer
 * spells out ("Debian 12") stays reachable. Beside text that already names the
 * distribution the mark says nothing new, so it is passed no title and goes
 * decorative instead -- announced twice is worse than not at all. A card that
 * prints the name only where the tooltip cannot be reached keeps this title and
 * hides that copy from the screen reader, so the name is still announced once.
 */
export function OsIcon({ os, title, className }: { os: string; title?: string; className?: string }) {
  const mark = OS_MARKS[osMark(os)]
  return (
    <svg
      viewBox="0 0 24 24"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("size-3.5 shrink-0", className)}
    >
      {title && <title>{title}</title>}
      {mark.stroke ? (
        <path
          d={mark.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={mark.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path d={mark.d} fill="currentColor" />
      )}
    </svg>
  )
}
