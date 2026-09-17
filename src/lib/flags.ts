/**
 * 国家码（hub 下发的 ALPHA-2）→ 包内国旗路径。
 *
 * 国旗是随包内置的矢量图，不走外部请求——与地图底图同一个理由，见 README 的
 * 主题契约。这里只认两个字母：hub 的 country 就是这个形状（api.ts 的 safeNodes），
 * 而 flag-icons 里那些带连字符的（gb-eng、es-ct）只可能来自用户输入，不是国家。
 *
 * 返回值是相对路径而非完整 URL：Vite 的 base 只在组件那一层出现，这个函数因此
 * 能被 node 直接跑（见同目录的 flags.test.ts）。
 */

// 比 api.ts 的 ALPHA2 松一档：那边是数据入界的严格校验（不是 ALPHA-2 一律清空），
// 这里多认小写，调用方不必先自己归一。
const TWO_LETTERS = /^[A-Za-z]{2}$/

export function flagPath(code: string): string | null {
  if (!TWO_LETTERS.test(code)) return null
  return `flags/${code.toLowerCase()}.svg`
}

/**
 * 国旗的完整地址：路径前面接上调用方的 base。
 *
 * base 是参数而不是在这里读 `import.meta.env`：`import.meta.env` 在 node 下是
 * undefined，读它的函数没法被测——而这层「码 → 地址」正是唯一能测的那层。
 */
export function flagSrc(code: string, base: string): string | null {
  const path = flagPath(code)
  return path ? base + path : null
}
