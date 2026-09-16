import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { Moon, Sun, Wrench } from "lucide-react"

import { CountryFilter } from "@/components/CountryFilter"
import { NodeCard } from "@/components/NodeCard"
import { Summary } from "@/components/Summary"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, useNodes, type Node } from "@/lib/api"
import { sliceToBands, useQuality, type ProbeBands } from "@/lib/quality"
import { readQualityOn, saveQualityOn } from "@/lib/quality-toggle"
import { readView, saveView, type View } from "@/lib/view"

type Me = { authed: boolean; github: boolean; site_name: string; public_page: boolean }

// Split out because recharts is most of this bundle and the list page draws no
// chart. The landing page is 242 kB rather than 629 kB (77 kB gzipped against
// 188 kB), with the rest fetched immediately after it paints.
const loadDetail = () => import("@/components/NodeDetail").then((m) => ({ default: m.NodeDetail }))
const NodeDetail = lazy(loadDetail)

// The two new views ride the same pattern: their chunks arrive after first
// paint, so the default card view keeps its current weight (R11).
const loadTable = () => import("@/components/NodeTable").then((m) => ({ default: m.NodeTable }))
const NodeTable = lazy(loadTable)
const loadMap = () => import("@/components/WorldMap").then((m) => ({ default: m.WorldMap }))
const WorldMap = lazy(loadMap)

// `/node/{id}` is a real page: it survives a reload, can be linked to, and back
// leaves the detail view rather than the site. The hub serves index.html for any
// unknown path, so no server-side route is required.
function useNodeRoute() {
  const read = () => {
    const match = location.pathname.match(/^\/node\/(\d+)/)
    return match ? Number(match[1]) : null
  }
  const [id, setId] = useState(read)
  useEffect(() => {
    const sync = () => setId(read())
    addEventListener("popstate", sync)
    return () => removeEventListener("popstate", sync)
  }, [])
  return [
    id,
    (next: number | null) => {
      history.pushState({}, "", next === null ? "/" : `/node/${next}`)
      setId(next)
      scrollTo(0, 0)
    },
  ] as const
}

const VIEWS: { key: View; label: string }[] = [
  { key: "cards", label: "卡片" },
  { key: "table", label: "表格" },
  { key: "map", label: "地图" },
]

/** Shared empty map: toggled on, but there is nothing to draw for any node. */
const EMPTY_QUALITY = new Map<number, ProbeBands[]>()

/**
 * The three browsing shapes of the fleet. The switcher sits above the country
 * chips -- both act on the list, so they belong to the same group. aria-pressed
 * follows the CountryFilter chip pattern so the current view is announced.
 */
function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="flex gap-1">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          aria-pressed={view === v.key}
          onClick={() => onChange(v.key)}
          className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
            view === v.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

/**
 * The quality band's on/off switch. Hidden by default and off on a first visit
 * (R6): turning it on is what starts the batch fetch, so an anonymous visitor
 * who never asks for it never costs the hub a query (R5). It sits with the view
 * switcher because both act on the list.
 */
function QualitySwitch({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
        on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      网络质量
    </button>
  )
}

/** Loading placeholders keep each view's shape, so the switch never jumps. */
function ViewSkeleton({ view }: { view: View }) {
  if (view === "cards")
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    )
  if (view === "table")
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    )
  return <Skeleton className="h-[480px] w-full" />
}

function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("theme")
    return saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches
  })
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem("theme", dark ? "dark" : "light")
  }, [dark])
  return [dark, () => setDark((d) => !d)] as const
}

export default function App() {
  const [dark, toggleTheme] = useTheme()
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState("")
  const { nodes, error, closed } = useNodes()
  const [open, go] = useNodeRoute()
  const [country, setCountry] = useState<string | null>(null)
  const [view, setView] = useState(readView)
  const switchView = useCallback((next: View) => {
    saveView(next)
    setView(next)
  }, [])

  const [qualityOn, setQualityOn] = useState(readQualityOn)
  const switchQuality = useCallback((next: boolean) => {
    saveQualityOn(next)
    setQualityOn(next)
  }, [])
  // The hook only fetches while the toggle is on, so off costs the hub nothing
  // (R5). `data` is held across refreshes, so a slow poll never blanks the bands.
  const { data: qualityData, loading: qualityLoading, error: qualityError } = useQuality(qualityOn)
  const qualityByNode = useMemo(() => {
    if (!qualityData) return null
    const m = new Map<number, ProbeBands[]>()
    for (const [id, slice] of Object.entries(qualityData)) m.set(Number(id), sliceToBands(slice))
    return m
  }, [qualityData])
  // One value, three meanings the band component reads directly:
  // undefined = toggle off, null = first fetch in flight, Map = data ready.
  // A first fetch that failed leaves nothing to draw, so it reads as "no bands"
  // rather than a skeleton that never resolves.
  const quality = !qualityOn
    ? undefined
    : qualityByNode ?? (qualityLoading && !qualityError ? null : EMPTY_QUALITY)

  const loadMe = useCallback(() => {
    // `|| "..."` because an empty message reads as no error: api() falls back to
    // res.statusText, which HTTP/2 and HTTP/3 removed, so a bodiless 502 from a
    // proxy arrives as "". The check below would then take the loading branch and
    // the retry button would never render.
    return api<Me>("/me")
      .then((next) => { setMe(next); setMeError("") })
      .catch((e: Error) => setMeError(e.message || "网络错误"))
  }, [])

  useEffect(() => {
    loadMe()
    // Warmed here rather than left to Suspense, which requests the chunk only
    // once a render reaches the detail view, itself waiting on /me. Without this
    // the split trades its first paint for a full-page skeleton over the first
    // node opened: 2.6s click-to-chart on 4G against 1.4s unsplit, 1.7s warm.
    void loadDetail()
    // The map chunk is the heaviest new view (Leaflet + country outlines);
    // warming it after paint keeps the first switch off the critical path
    // without adding to the landing page's weight (R11).
    void loadMap()
  }, [loadMe])

  // The status page was closed while this tab was open. `me` holds whatever it
  // reported at load, so it is re-queried; the effect below then directs an
  // anonymous visitor to the panel rather than leaving them on a list that
  // stopped updating with only a red line to explain it.
  useEffect(() => {
    if (closed) void loadMe()
  }, [closed, loadMe])

  useEffect(() => {
    if (me && !me.public_page && !me.authed) location.href = "/admin/"
  }, [me])

  const sorted = [...(nodes ?? [])].sort((a, b) => a.sort - b.sort || a.id - b.id)
  // null = unfiltered; a country code narrows the grid but not the summary,
  // which keeps reporting on the whole fleet.
  const visible = country ? sorted.filter((n) => n.country === country) : sorted
  const selected = sorted.find((n) => n.id === open)

  // `/node/{id}` is a page people bookmark and share, so the tab needs the node's
  // name. The site name rather than a fixed string, since the hub lets an operator
  // rename the site.
  useEffect(() => {
    document.title = [selected?.name, me?.site_name || "Monitor"].filter(Boolean).join(" · ")
  }, [selected?.name, me?.site_name])

  // Only while there is nothing else to show. Once `me` has loaded, a later
  // failure belongs beside the page rather than over it.
  if (!me) return (
    <div className="grid min-h-svh place-items-center p-6 text-sm text-muted-foreground">
      {meError ? <div className="space-y-3 text-center"><p role="alert">加载失败：{meError}</p><Button onClick={loadMe}>重试</Button></div> : "加载中…"}
    </div>
  )

  // The status page is closed and nobody is signed in: redirect to the panel.
  if (!me.public_page && !me.authed) return null

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          {/* The site name is the way back to the list, so a node page needs
              no back button of its own. */}
          <button className="font-semibold transition-opacity hover:opacity-70" onClick={() => go(null)}>
            {me.site_name || "Monitor"}
          </button>
          <div className="flex-1" />
          {/* The panel is a separate app built into the hub, not part of this
              theme, so this is a navigation rather than a route. */}
          <Button variant="ghost" size="sm" asChild>
            <a href="/admin/">
              <Wrench /> {me.authed ? "进入后台" : "登录"}
            </a>
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleTheme} title="切换主题">
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-4 sm:px-6">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {open !== null ? (
          !nodes ? (
            <Skeleton className="h-96" />
          ) : selected ? (
            <Suspense fallback={<Skeleton className="h-96" />}>
              <NodeDetail node={selected} />
            </Suspense>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">
              节点不存在或未公开。<button className="underline" onClick={() => go(null)}>返回列表</button>
            </p>
          )
        ) : !nodes ? (
          <ViewSkeleton view={view} />
        ) : (
          <>
            <Summary nodes={sorted} />
            <div className="flex flex-wrap items-center gap-2">
              <CountryFilter nodes={sorted} selected={country} onChange={setCountry} />
              {/* ml-auto 而非 justify-between：chip 行换行或过滤器缺席（无国家
                  数据时渲染 null）时，切换控件仍钉在右侧。 */}
              <div className="ml-auto flex items-center gap-1">
                <QualitySwitch on={qualityOn} onChange={switchQuality} />
                <ViewSwitch view={view} onChange={switchView} />
              </div>
            </div>
            {sorted.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">还没有节点</p>
            ) : visible.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                该国家没有节点。<button className="underline" onClick={() => setCountry(null)}>查看全部</button>
              </p>
            ) : view === "table" ? (
              <Suspense fallback={<ViewSkeleton view="table" />}>
                <NodeTable nodes={visible} onOpen={go} quality={quality} />
              </Suspense>
            ) : view === "map" ? (
              <Suspense fallback={<ViewSkeleton view="map" />}>
                <WorldMap nodes={visible} onOpen={go} country={country} />
              </Suspense>
            ) : (
              <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visible.map((n: Node) => (
                  <NodeCard
                    key={n.id}
                    node={n}
                    onOpen={() => go(n.id)}
                    quality={
                      quality === undefined
                        ? undefined
                        : quality === null
                          ? null
                          : (quality.get(n.id) ?? [])
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
