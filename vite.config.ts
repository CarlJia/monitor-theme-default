import { spawnSync } from "node:child_process"

import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// 国旗是随包内置的静态资源，但 public/flags 是从依赖里复制来的、不进版本库。
// 同步挂成插件而不是 npm 的 predev/prebuild：vite 的每个入口（dev、build）都会
// 走到这里，绕开 npm 的 `npx vite build` 也一样有旗子——挂钩子时它会静默产出一个
// 没有旗的 dist，而 lint/test/build 全是绿的。
const syncFlags = {
  name: "sync-flags",
  buildStart() {
    // 失败就抛：宁可构建挂掉，也不要一个缺旗的包被发出去。脚本路径锚在配置文件上，
    // 从别的目录起 vite 也找得到它。
    const r = spawnSync(process.execPath, [import.meta.dirname + "/scripts/sync-flags.mjs"], { stdio: "inherit" })
    if (r.status !== 0) throw new Error("国旗同步失败，见上方输出")
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), syncFlags],
  // import.meta.dirname rather than new URL(...).pathname: the latter is
  // URL-encoded, so a checkout under a path containing a space or a non-ASCII
  // name resolves to %20 and the alias silently points nowhere.
  resolve: { alias: { "@": import.meta.dirname + "/src" } },
  // 地图懒加载块内置 110m 国家轮廓（~105 KB 源数据）；只在首次切到地图视图
  // 时下载，且改成意图触发后不再进首屏。阈值仍留着，blocked 的是其他块。
  build: { chunkSizeWarningLimit: 1000 },
  // HUB_URL 是 `npm run dev:mock` 给的：它自己起一个 mock hub 并把这里指过去，
  // 用的是当场找到的空闲端口，所以本地调试不会被另一个还占着 9911 的旧 hub
  // 静默接管。不带这个变量时仍是 README 里那个固定端口。
  server: {
    proxy: { "/api": { target: process.env.HUB_URL ?? "http://127.0.0.1:9911", ws: true } },
  },
})
