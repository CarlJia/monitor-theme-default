/// <reference types="node" />
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { COUNTRY_CODES } from "./country-codes.ts"
import { flagPath } from "./flags.ts"

// 这一层要能被 node 直接跑，所以它不知道 Vite 的 base：钉的是包内相对路径，
// 前缀由组件补（import.meta.env.BASE_URL）。
assert.equal(flagPath("US"), "flags/us.svg", "US 归一为小写文件名")
assert.equal(flagPath("us"), "flags/us.svg", "小写输入等价")
assert.equal(flagPath(""), null, "空码不成路径")
assert.equal(flagPath("USA"), null, "三位不是 ALPHA-2")
assert.equal(flagPath("U1"), null, "非字母不成路径")
assert.equal(flagPath("gb-eng"), null, "连字符的是地区旗，不是 hub 会下发的国家码")

// 全量：码表里的每个国家都要有国旗文件。缺一面就是一个空徽标，而它出现在最难
// 注意到的地方——地图上有气泡、卡片上却是空的。旗子由 scripts/sync-flags.mjs
// （package.json 的 predev/prebuild 调它）从 flag-icons 复制进 public/，所以这里
// 跑脚本本体、验它的交付结果：只断言 node_modules 里躺着旗子等于在测依赖——脚本
// 换了源目录、改了落地目录，或者钩子被删掉，测试都会照绿，而包里的旗子一个没有。
// 路径锚在文件上而不是 cwd 上：从仓库根以外的目录跑同一个文件也得成立。
const codes = [...new Set(Object.values(COUNTRY_CODES))]
const SYNC = fileURLToPath(new URL("../../scripts/sync-flags.mjs", import.meta.url))
const SOURCE = fileURLToPath(new URL("../../node_modules/flag-icons/flags/4x3/", import.meta.url))

// 只写临时目录：public/flags 被 .gitignore 排除，干净 clone 里并不存在，断言它
// 会在别人的机器上假失败。
const tmp = mkdtempSync(join(tmpdir(), "flags-test-"))
try {
  execFileSync(process.execPath, [SYNC, "--dest", tmp], { stdio: "pipe" })

  const missing = codes.filter((c) => !existsSync(join(tmp, `${c.toLowerCase()}.svg`)))
  assert.deepEqual(missing, [], `码表里的每个国家都要有国旗文件，缺：${missing.join("、")}`)

  // 逐字节对回 4x3 原件。两套旗子的文件名完全一样（都是 <code>.svg），所以只有
  // 内容能钉住脚本读的是哪个源目录：src 若被换成 1x1，文件仍在、名字仍对，这里红。
  const drifted = codes.filter((c) => {
    const name = `${c.toLowerCase()}.svg`
    return !readFileSync(join(tmp, name)).equals(readFileSync(join(SOURCE, name)))
  })
  assert.deepEqual(drifted, [], `交付的旗子必须与 flag-icons 的 4x3 原件一致，不符：${drifted.join("、")}`)
} finally {
  // 断言炸了也要把临时目录收掉
  rmSync(tmp, { recursive: true, force: true })
}

console.log(`国旗码表正确（${codes.length} 国）`)
