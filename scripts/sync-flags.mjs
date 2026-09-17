// 把 flag-icons 的 4x3 国旗复制进 public/，构建与开发前自动执行（package.json 的
// predev/prebuild），由 vite 原样带进 dist/。主题不发起任何外部请求（README 的主题
// 契约），国旗因此随包内置，与地图底图同一个理由。
//
// 只用 4x3：正方形那套在本主题里没有任何位置，多带一份等于把 theme.tar.gz 里的
// 640 KB 变成 1.3 MB——而 hub 是把这个包嵌进二进制里的。
//
// 复制而非在源码里维护一份码 → 文件的对应表：国旗是依赖的产物，跟着版本走，
// 升级 flag-icons 时码表与国家清单不会各自漂移。public/flags 因此不进版本库。
import { existsSync } from "node:fs"
import { cp, mkdir, readdir, rm } from "node:fs/promises"
import { relative } from "node:path"

const root = import.meta.dirname + "/.."
const src = root + "/node_modules/flag-icons/flags/4x3"

// --dest 是给测试用的：只有让脚本把旗子交到别处，测试才能验证"交付真的发生了"，
// 而不是去 node_modules 里数依赖自带的文件（那样脚本改坏也测不出来）。构建路径
// 不带参数，默认仍旧是 public/flags。
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : def
}
const dest = arg("dest", root + "/public/flags")

if (!existsSync(src)) {
  console.error(`缺少 ${src}\n请先 npm ci（flag-icons 装在 devDependencies 里）`)
  process.exit(1)
}

// 先清后建：flag-icons 升版可能去掉某个码，留着的旧文件会混进 dist/，而它们
// 已经不对应任何一版依赖。
await rm(dest, { recursive: true, force: true })
await mkdir(dest, { recursive: true })
await cp(src, dest, { recursive: true })

// 日志报 dest 本身而不是写死 public/flags：--dest 时落地处已经不是那里了。落在
// 仓库里的按仓库根截短，日常构建的输出（public/flags/）保持原样；仓库外（测试的
// 临时目录）报全路径，那里没有更有意义的短名字。
const rel = relative(root, dest)
const label = rel.startsWith("..") ? dest : rel
console.log(`✓ ${label}/（${(await readdir(dest)).length} 面国旗）`)
