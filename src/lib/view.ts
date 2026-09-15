/** 首页的三种浏览形态。默认卡片，其余两个由后续单元填充。 */
export type View = "cards" | "table" | "map"

const KEY = "view"

/**
 * 上次选中的视图，刷新后保持（与明暗主题同机制）。storage 作参数而非直接读
 * 全局：Node 直跑的测试里没有 localStorage，浏览器调用方省略即可。
 *
 * 只认三个已知值——旧版本写入或手改的乱值一律回落卡片，而不是让首页空着。
 */
export function readView(storage: Storage = globalThis.localStorage): View {
  const saved = storage.getItem(KEY)
  return saved === "table" || saved === "map" ? saved : "cards"
}

export function saveView(view: View, storage: Storage = globalThis.localStorage): void {
  storage.setItem(KEY, view)
}
