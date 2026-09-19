// 一条命令起本地调试环境：mock hub（合成数据）+ vite dev server（现编页面）。
//
// 端口是当场找的空闲端口，而不是固定的 9911。上一次调试留下的 hub 常还占着
// 9911，固定端口时新进程 EADDRINUSE 直接退出、vite 却照常起来，请求于是被旧
// 进程处理——症状是代码改了、接口还回旧的 404，正是这个脚本要杜绝的那种排查。
// 随机端口让每次 `npm run dev:mock` 都对着一个新起的 hub；vite 通过 HUB_URL
// 知道它在哪（见 vite.config.ts 的代理目标）。
import { spawn } from "node:child_process"
import { createServer } from "node:net"

const root = import.meta.dirname + "/.."

// 让内核挑一个空闲端口：listen(0) 后读回来。到 vite 去连它之间有个理论上的
// 竞态窗口，对本机调试足够。
const port = await new Promise((resolve, reject) => {
  const probe = createServer()
  probe.on("error", reject)
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address()
    probe.close(() => resolve(address.port))
  })
})

const hub = spawn(
  process.execPath,
  [`${root}/.agents/skills/theme-preview/scripts/mock-hub.mjs`, "--port", String(port)],
  { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
)

let vite = null
const startVite = () => {
  if (vite) return
  vite = spawn(process.execPath, [`${root}/node_modules/vite/bin/vite.js`], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, HUB_URL: `http://127.0.0.1:${port}` },
  })
  vite.on("exit", (code) => {
    hub.kill()
    process.exit(code ?? 0)
  })
}

// hub 打出那一行 `mock hub on ...`（listen 回调里）之后才起 vite，否则首屏那次
// /api/nodes 会打在一个还没监听的端口上，页面带着一条错误横幅开屏。
hub.stdout.setEncoding("utf8")
hub.stdout.on("data", (text) => {
  process.stdout.write(text)
  startVite()
})

// 一行都没打就退了：脚本报错、或端口在探测与 listen 之间被抢。要说清楚，别让
// vite 起来对着空气发请求。
hub.on("exit", (code) => {
  if (vite) return
  console.error(`mock hub 启动失败（退出码 ${code}）`)
  process.exit(code || 1)
})

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    hub.kill()
    vite?.kill()
  })
}
