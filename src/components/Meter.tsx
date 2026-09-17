import type { ReactNode } from "react"

type Props = { label: ReactNode; pct: number | null; foot: ReactNode; empty?: ReactNode }

/**
 * One metric: name and percentage on top, bar in the middle, raw numbers
 * underneath. Monochrome, since the length of the bar carries the message.
 */
export function Meter({ label, pct, foot, empty = "—" }: Props) {
  // null means the metric has no ceiling to fill, so the bar stays empty rather
  // than reporting 0%. What replaces the percentage depends on the reason:
  // unknown for a node with no metrics, ∞ for a plan with no limit.
  const filled = pct === null ? 0 : Math.min(100, Math.max(0, pct))
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        <span className="tnum text-xs font-medium">
          {pct === null ? empty : `${filled < 10 ? filled.toFixed(1) : filled.toFixed(0)}%`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {/* clip-path 而不是 width：宽度是布局属性，而这棵树每 2 秒收到一次推送，
            每张卡 4 根条、每根一个 500ms 过渡——等于让这几百个元素持续重排。inset
            只影响绘制，外观仅差填充条右端那一处圆角（6px 高的条上，直角与圆角肉眼
            分不出来），换来的是滚动与推送帧上不再有这份布局开销。 */}
        <div
          className="h-full rounded-full bg-foreground transition-[clip-path] duration-500"
          style={{ clipPath: `inset(0 ${100 - filled}% 0 0)` }}
        />
      </div>
      <div className="tnum mt-1.5 truncate text-xs text-muted-foreground">{foot}</div>
    </div>
  )
}
