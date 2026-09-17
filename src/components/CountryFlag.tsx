import { flagPath } from "@/lib/flags"

// 1em 高、4:3 宽，跟着所在文字的字号走——徽标、列表、地图浮层三处字号各不相同。
// 单独拎出来是给 flagImage 用的：Leaflet 的浮层不在 React 树里，那里要手工建节点，
// 两处必须是同一份尺寸，否则地图上的旗会和列表里的不一样大。
const FLAG_SIZE = "inline-block h-[1em] w-[1.333em] shrink-0 align-middle"

/** 国旗的地址。Vite 的 base 只在这里出现一次；null 表示这段码不是国家码。 */
function flagSrc(code: string): string | null {
  const path = flagPath(code)
  return path ? import.meta.env.BASE_URL + path : null
}

/**
 * 国旗，用 flag-icons 的 4x3 矢量图（scripts/sync-flags.mjs 随构建复制进 public/），
 * 而不是区域指示符拼出的 emoji：后者在 Windows 上根本没有字形，一整排徽标会退化成
 * 「US」两个字母。
 *
 * alt 留空是有意的：筛选芯片、地图里展开国的表头、Leaflet 浮层都把国家码写在旗子
 * 旁边，读屏再念一遍「美国国旗」只是噪音，旗子纯粹是给眼睛看的。NodeCard 的 Country
 * 徽标是例外——那里除了这面旗什么都没有，所以由徽标自己用 aria-label 报出国码。
 */
export function CountryFlag({ code }: { code: string }) {
  const src = flagSrc(code)
  if (!src) return null
  return <img src={src} alt="" className={FLAG_SIZE} />
}

/**
 * 同一面旗的 DOM 版：Leaflet 的 tooltip 由它自己挂到地图 pane 上，不在 React 树里，
 * 只能手工建节点。样式与 CountryFlag 共用上面那一份。
 */
export function flagImage(code: string): HTMLImageElement | null {
  const src = flagSrc(code)
  if (!src) return null
  const img = document.createElement("img")
  img.src = src
  img.alt = ""
  img.className = FLAG_SIZE
  return img
}
