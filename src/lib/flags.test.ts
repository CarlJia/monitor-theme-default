/// <reference types="node" />
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { COUNTRY_CODES } from "./country-codes.ts"
import { flagPath, flagSrc } from "./flags.ts"

// 这一层要能被 node 直接跑：flagPath 钉的是包内相对路径，flagSrc 的 base 由调用方
// 传进来（组件传 import.meta.env.BASE_URL）——在函数体里读 import.meta.env 的那种
// 写法在 node 下是 undefined，整个函数就没法测了，而这是唯一能测的一层。
assert.equal(flagPath("US"), "flags/us.svg", "US 归一为小写文件名")
assert.equal(flagPath("us"), "flags/us.svg", "小写输入等价")
assert.equal(flagPath(""), null, "空码不成路径")
assert.equal(flagPath("USA"), null, "三位不是 ALPHA-2")
assert.equal(flagPath("U1"), null, "非字母不成路径")
assert.equal(flagPath("gb-eng"), null, "连字符的是地区旗，不是 hub 会下发的国家码")

// base 原样拼在路径前面：不归一、不补斜杠，Vite 的 BASE_URL 自带尾斜杠。
assert.equal(flagSrc("US", "/"), "/flags/us.svg", "根路径下的地址")
assert.equal(flagSrc("us", "/theme/"), "/theme/flags/us.svg", "base 带子路径时也拼得上")
assert.equal(flagSrc("", "/theme/"), null, "非国家码没有地址")
assert.equal(flagSrc("USA", "/"), null, "三位也没有地址")

// 全量：码表里的每个国家都要有国旗文件。缺一面就是一个空徽标，而它出现在最难
// 注意到的地方——地图上有气泡、卡片上却是空的。旗子由 scripts/sync-flags.mjs
// （vite.config.ts 的 sync-flags 插件在每次构建前调它）从 flag-icons 复制进
// public/，所以这里跑脚本本体、验它的交付结果：只断言 node_modules 里躺着旗子等于
// 在测依赖——脚本换了源目录、改了落地目录，测试都会照绿，而包里的旗子一个没有。
// 路径锚在文件上而不是 cwd 上：从仓库根以外的目录跑同一个文件也得成立。
const codes = [...new Set(Object.values(COUNTRY_CODES))]
const SYNC = fileURLToPath(new URL("../../scripts/sync-flags.mjs", import.meta.url))

// 只写临时目录：public/flags 被 .gitignore 排除，干净 clone 里并不存在，断言它
// 会在别人的机器上假失败。
const tmp = mkdtempSync(join(tmpdir(), "flags-test-"))
try {
  execFileSync(process.execPath, [SYNC, "--dest", tmp], { stdio: "pipe" })

  const missing = codes.filter((c) => !existsSync(join(tmp, `${c.toLowerCase()}.svg`)))
  assert.deepEqual(missing, [], `码表里的每个国家都要有国旗文件，缺：${missing.join("、")}`)

  // 交付的是 4x3 那一套：两套旗子的文件名完全一样（都是 <code>.svg），源目录换成
  // 1x1 时文件仍在、名字仍对，所以只能看内容——4x3 的 viewBox 是 640×480。这里不再
  // 逐字节比原件：交付前 svgo 会把坐标取整（见 scripts/sync-flags.mjs）。
  const wrongRatio = codes.filter(
    (c) => !readFileSync(join(tmp, `${c.toLowerCase()}.svg`), "utf8").includes('viewBox="0 0 640 480"'),
  )
  assert.deepEqual(wrongRatio, [], `交付的旗子必须是 4x3（viewBox 640×480），不符：${wrongRatio.join("、")}`)

  // 取整那一步真的跑过。实测 246 国：取整前 1598 KB，取整后 777 KB，阈值留在两者
  // 之间——将来把 optimize 删掉、或者把 precision 调回去，都会在这里红。
  const total = codes.reduce((n, c) => n + readFileSync(join(tmp, `${c.toLowerCase()}.svg`)).length, 0)
  assert.ok(total < 1_200_000, `交付的旗子应当是取过整的（当前 ${Math.round(total / 1024)} KB）`)
} finally {
  // 断言炸了也要把临时目录收掉
  rmSync(tmp, { recursive: true, force: true })
}

console.log(`国旗码表正确（${codes.length} 国）`)
