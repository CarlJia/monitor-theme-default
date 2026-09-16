/// <reference types="node" />
// The one judgement the OS logo makes, and the table it draws from.
// Run with `npm test`: Node strips the types itself.
import assert from "node:assert/strict"

import { OS_MARKS, osMark, type OsMark } from "./os.ts"

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

console.log("os 校验通过")
