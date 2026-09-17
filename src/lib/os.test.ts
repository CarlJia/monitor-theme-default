/// <reference types="node" />
// The one judgement the OS logo makes, and the table it draws from.
// Run with `npm test`: Node strips the types itself.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { OS_MARKS, osColors, osMark, type OsMark } from "./os.ts"

// The spellings the hub actually reports. "GNU/Linux" rides along on nearly all
// of them, so a rule matching on the loose word "linux" would swallow the fleet.
assert.equal(osMark("Debian GNU/Linux 12 (bookworm)"), "debian", "Debian 带代号")
assert.equal(osMark("Ubuntu 22.04.3 LTS"), "ubuntu", "Ubuntu LTS")
assert.equal(osMark("Alpine Linux v3.19"), "alpine", "Alpine 不以发行版名开头")
assert.equal(osMark("Arch Linux"), "arch", "Arch")
assert.equal(osMark("CentOS Linux 7 (Core)"), "centos", "CentOS 7")
assert.equal(osMark("Fedora Linux 39"), "fedora", "Fedora")
assert.equal(osMark("Windows Server 2022 Standard"), "windows", "Windows Server")
assert.equal(osMark("macOS 14.2 (Darwin 23.2.0)"), "macos", "macOS 连同 Darwin 内核名")

// 同一家族的不同写法收敛到同一枚图标；各家的重建版有自己的标，就各归各。
assert.equal(osMark("Red Hat Enterprise Linux 9.3"), "redhat", "RHEL 全名")
assert.equal(osMark("Rocky Linux 9.3"), "rocky", "Rocky 有自己的标")
assert.equal(osMark("AlmaLinux 9.2"), "almalinux", "AlmaLinux 有自己的标")
assert.equal(osMark("Oracle Linux Server 8.8"), "redhat", "Oracle 无标，归入 RHEL 家族")
assert.equal(osMark("Amazon Linux 2023"), "redhat", "Amazon 无标，归入 RHEL 家族")

// 每个 simple-icons 里有标的家族都要接上线：漏接的下场不是画错，而是画成兜底那枚
// 终端图——界面上看不出「没标」与「忘了接」的区别。这些名字是常用的写法。
assert.equal(osMark("openSUSE Leap 15.5"), "suse", "openSUSE 有自己的标")
assert.equal(osMark("SUSE Linux Enterprise Server 15 SP5"), "suse", "SLES 同属 SUSE")
assert.equal(osMark("Gentoo"), "gentoo", "Gentoo 有自己的标")
assert.equal(osMark("Linux Mint 21.3"), "mint", "Mint 有自己的标")
assert.equal(osMark("FreeBSD 13.2-RELEASE"), "bsd", "FreeBSD 有自己的标")

// 派生版跟随其上游：规则没接上这里就会掉进兜底。
assert.equal(osMark("Kali GNU/Linux 2023.3"), "debian", "Kali 是 Debian 系")
assert.equal(osMark("Manjaro Linux"), "arch", "Manjaro 是 Arch 系")

// 架构后缀里藏着发行版名的字母：aarch64 与 AltArch 都含 "arch"，词边界一松，
// 卡片就会给 CentOS 的机器画上 Arch 的标志，与旁边悬停提示里的名字自相矛盾。
assert.equal(osMark("CentOS Linux 7 (AltArch)"), "centos", "AltArch 里的 arch 不抢 CentOS")
assert.equal(osMark("Fedora Linux 39 (aarch64)"), "fedora", "aarch64 里的 arch 不抢 Fedora")
assert.equal(osMark("Rocky Linux 9.3 (aarch64)"), "rocky", "aarch64 里的 arch 不抢 Rocky")
assert.equal(osMark("TencentOS Server 3.1"), "generic", "TencentOS 不是 CentOS")

// 兜底不是错误：没图标也要有可画的东西。
assert.equal(osMark("Linux 5.15.0-91-generic"), "generic", "只有内核名时走兜底")
assert.equal(osMark("NixOS 23.11"), "generic", "simple-icons 里没有的发行版走兜底")
assert.equal(osMark(""), "generic", "空字符串不抛异常")
assert.equal(osMark("debian"), "debian", "大小写不敏感")

// 每个家族都得有能画出来的路径，且以正确的画法画。这两处都不会让别处的断言变红：
// 新增家族忘了配路径，或漏了 stroke 让兜底的终端框糊成实心疙瘩。除它之外全部来自
// simple-icons，都是填色路径。
const LINE_ART = new Set(["generic"])
for (const [name, mark] of Object.entries(OS_MARKS)) {
  assert.ok(mark.d.length > 0, `${name} 有路径数据`)
  assert.equal(Boolean(mark.stroke), LINE_ART.has(name), `${name} 的线稿/实心与预期一致`)
}

// 反过来也要成立：枚枚可画还不够，得枚枚可达。类型系统只能保证「规则的指向是合法
// 家族、家族都配了路径」，管不了一个家族谁也指不到——那枚标白画，永远不出现。
const SAMPLE: Record<OsMark, string> = {
  windows: "Windows Server 2022 Standard",
  macos: "macOS 14.2",
  ubuntu: "Ubuntu 22.04.3 LTS",
  debian: "Debian GNU/Linux 12 (bookworm)",
  alpine: "Alpine Linux v3.19",
  arch: "Arch Linux",
  centos: "CentOS Linux 7 (Core)",
  fedora: "Fedora Linux 39",
  redhat: "Red Hat Enterprise Linux 9.3",
  rocky: "Rocky Linux 9.3",
  almalinux: "AlmaLinux 9.2",
  suse: "openSUSE Leap 15.5",
  gentoo: "Gentoo",
  mint: "Linux Mint 21.3",
  bsd: "FreeBSD 13.2-RELEASE",
  generic: "NixOS 23.11",
}
for (const [family, sample] of Object.entries(SAMPLE)) {
  assert.equal(osMark(sample), family, `${family} 有规则指向它`)
}

// 彩色标的可读性。品牌原色在浅色底上够用（logo 本就不受 WCAG 文本对比约束，
// 所以这里只挡「白底上看不见」这一种），真正会踩的是深色主题：CentOS 的 #262577
// 与 Apple / AlmaLinux 的 #000000 在黑卡片上等于没画图标。深底这条线是硬要求。
//
// 底色从 index.css 现场读，不抄常数：抄一份的话量的是抄下来的那个值，`--card`
// 一改守卫就跟界面脱钩、却仍然全绿——而它正是为了挡住「图标在卡片上消失」。
const CSS = readFileSync(new URL("../index.css", import.meta.url), "utf8")

/** oklch -> sRGB 十六进制（D65，不做色域映射）。只用来量对比度，够用。 */
function oklchHex(L: number, C: number, H: number): string {
  const rad = (H * Math.PI) / 180
  const a = C * Math.cos(rad)
  const b = C * Math.sin(rad)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ]
  return (
    "#" +
    channels
      .map((v) => {
        const c = Math.max(0, Math.min(1, v))
        const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
        return Math.round(encoded * 255).toString(16).padStart(2, "0")
      })
      .join("")
  )
}

/** 从 index.css 的 `:root` / `.dark` 规则里读出一枚 oklch token 并换算成 sRGB。
 *  规则本身用正则定位：文件顶部还有一条 `@custom-variant dark (&:is(.dark *))`，
 *  按子串找 `.dark` 会先命中它。 */
function cardGround(selector: RegExp): string {
  const at = CSS.search(selector)
  if (at < 0) throw new Error(`index.css 里找不到 ${selector}`)
  const block = CSS.slice(at, CSS.indexOf("}", at))
  const found = block.match(/--card:\s*oklch\(([^)]*)\)/)
  if (!found) throw new Error(`index.css 的 ${selector} 块里找不到 --card`)
  const [L, C = "0", H = "0"] = found[1].trim().split(/\s+/)
  return oklchHex(Number(L), Number(C), Number(H))
}
const CARD = { light: cardGround(/^\s*:root\s*\{/m), dark: cardGround(/^\s*\.dark\s*\{/m) }

const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const HEX = /^#[0-9a-f]{6}$/i

// 深浅两色这一对由 osColors 统一给出，组件只把它填进 CSS 变量，自己不再做任何取色。
// 所以这里断言的是那对返回值本身：有暗色变体的家族用它，没有的（16 个里 8 个）必须
// 回落到品牌原色而非 undefined——深色卡片上那 8 枚标全靠这条兜底才留得下来。
assert.deepEqual(osColors("ubuntu"), { light: "#E95420", dark: "#E95420" }, "无暗色变体时回落到品牌原色")
assert.deepEqual(osColors("macos"), { light: "#000000", dark: "#707070" }, "有暗色变体时用它")

for (const [name, mark] of Object.entries(OS_MARKS)) {
  assert.match(mark.color, HEX, `${name} 配了品牌色`)
  if (mark.darkColor) assert.match(mark.darkColor, HEX, `${name} 的暗色变体是合法色值`)
  // 对比度走 osColors 而不是就地再写一遍 `?? color`：写一遍等于断言数据表而不是组件
  // 真正走的那条表达式，兜底哪天被删，8 枚标在深色卡片上一起消失，这里仍然是绿的。
  const { light, dark } = osColors(name as OsMark)
  assert.ok(contrast(dark, CARD.dark) >= 3, `${name} 在深色卡片上看得见（>=3:1）`)
  assert.ok(contrast(light, CARD.light) >= 2, `${name} 在白色卡片上不是一片留白`)
}

console.log("os 校验通过")
