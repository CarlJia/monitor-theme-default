import {
  siAlmalinux,
  siAlpinelinux,
  siApple,
  siArchlinux,
  siCentos,
  siDebian,
  siFedora,
  siFreebsd,
  siGentoo,
  siLinuxmint,
  siOpensuse,
  siRedhat,
  siRockylinux,
  siUbuntu,
} from "simple-icons"

/**
 * Which logo a machine's `os` string earns.
 *
 * The hub reports whatever the agent read from /etc/os-release, so the same
 * family arrives spelled a dozen ways -- "Debian GNU/Linux 12 (bookworm)",
 * "Debian 12", "Kali GNU/Linux 2023.3". Matching is therefore on the family
 * word rather than the whole string, and first match wins.
 *
 * A distribution without a logo here is not an error -- it draws `generic`,
 * which is the honest answer for "some Unix we have no mark for".
 */
export type OsMark =
  | "windows"
  | "macos"
  | "ubuntu"
  | "debian"
  | "alpine"
  | "arch"
  | "centos"
  | "fedora"
  | "redhat"
  | "rocky"
  | "almalinux"
  | "suse"
  | "gentoo"
  | "mint"
  | "bsd"
  | "generic"

// First match wins; unclaimed strings fall through to `generic`.
const RULES: [RegExp, OsMark][] = [
  [/windows/, "windows"],
  [/mac ?os|darwin|apple/, "macos"],
  [/ubuntu/, "ubuntu"],
  // Kali and Raspbian are Debian with a different wallpaper.
  [/debian|kali|raspbian/, "debian"],
  [/alpine/, "alpine"],
  // `\b`: "CentOS Linux 7 (AltArch)" and every aarch64 PRETTY_NAME carry the
  // letters "arch", and a bare substring would answer Arch Linux for both --
  // the mark contradicting the name beside it. Same for TencentOS/centos.
  [/\barch|manjaro|endeavour/, "arch"],
  [/\bcentos/, "centos"],
  [/fedora/, "fedora"],
  [/rocky/, "rocky"],
  [/almalinux|alma/, "almalinux"],
  [/suse/, "suse"],
  [/gentoo/, "gentoo"],
  [/\bmint/, "mint"],
  // FreeBSD is spelled with the letters "bsd" mid-word, so the boundary cannot
  // be used here; the three names are listed instead.
  [/freebsd|openbsd|netbsd/, "bsd"],
  // One hat for the rest of the family: a rebuild differs from Red Hat by name,
  // not by anything a 14px mark can say, and simple-icons carries no mark for
  // Oracle or Amazon Linux at all.
  [/red ?hat|rhel|oracle|amazon|amzn/, "redhat"],
]

export function osMark(os: string): OsMark {
  const s = os.toLowerCase()
  return RULES.find(([re]) => re.test(s))?.[1] ?? "generic"
}

/**
 * A mark is one path, drawn either filled or stroked, so the whole logo set
 * stays a table of data rather than a file of components -- which is what lets
 * the test beside this file check every family has artwork without a DOM.
 */
type Mark = {
  /** One or more subpaths. */
  d: string
  /** Stroke width. A mark without it is filled with the mark's colour. */
  stroke?: number
  /**
   * The vendor's own colour, used as-is on the light ground. Vendors publish
   * these with their artwork, and a brand-true logo is the point of colouring
   * it at all; logos carry no WCAG text-contrast obligation, so a light green
   * like Mint's is left alone.
   */
  color: string
  /**
   * A lifted variant for the dark ground, on the brands whose own colour is
   * darker than the surface it would sit on -- CentOS's #262577 and Black
   * Apple's #000000 are simply not there against `--card`. Same hue and
   * saturation, lightness raised just past 3:1 against the dark card; the
   * test beside this file pins that floor so a new brand cannot arrive
   * invisible.
   */
  darkColor?: string
}

/**
 * The vendors' own artwork, at the 24x24 grid simple-icons standardises on, so
 * a logo is recognisable rather than merely suggestive.
 *
 * Two marks are drawn here instead, because simple-icons has no entry for
 * either: Windows (the Microsoft marks were withdrawn from the set) and the
 * generic fallback, which is deliberately a terminal rather than a penguin --
 * a distribution we have no mark for is as often a BSD as a Linux.
 */
export const OS_MARKS: Record<OsMark, Mark> = {
  // Four panes, slightly skewed, as the flag is drawn.
  windows: {
    d: "M3.1 5.5 10.6 4.4v7.2H3.1zM12.4 4.1 21 2.8v8.8h-8.6zM3.1 13.4h7.5v7.2L3.1 19.5zM12.4 13.4H21v8.8l-8.6-1.3z",
    color: "#0078D4",
  },
  // simple-icons publishes Apple's mark as black, which is exactly the colour
  // that disappears on the dark ground.
  macos: { d: siApple.path, color: "#000000", darkColor: "#707070" },
  ubuntu: { d: siUbuntu.path, color: "#E95420" },
  debian: { d: siDebian.path, color: "#A81D33", darkColor: "#D82542" },
  alpine: { d: siAlpinelinux.path, color: "#0D597F", darkColor: "#1279AD" },
  arch: { d: siArchlinux.path, color: "#1793D1" },
  centos: { d: siCentos.path, color: "#262577", darkColor: "#6766CF" },
  fedora: { d: siFedora.path, color: "#51A2DA" },
  redhat: { d: siRedhat.path, color: "#EE0000" },
  rocky: { d: siRockylinux.path, color: "#10B981" },
  // AlmaLinux's brand colour is black too.
  almalinux: { d: siAlmalinux.path, color: "#000000", darkColor: "#707070" },
  // The chameleon, which is openSUSE's mark; SLES shares the logo family.
  suse: { d: siOpensuse.path, color: "#73BA25" },
  gentoo: { d: siGentoo.path, color: "#54487A", darkColor: "#7768A6" },
  mint: { d: siLinuxmint.path, color: "#86BE43" },
  bsd: { d: siFreebsd.path, color: "#AB2B28", darkColor: "#CF3532" },
  generic: {
    d: "M4.2 5.4h15.6a1.8 1.8 0 0 1 1.8 1.8v9.6a1.8 1.8 0 0 1-1.8 1.8H4.2a1.8 1.8 0 0 1-1.8-1.8V7.2a1.8 1.8 0 0 1 1.8-1.8z" +
      "M6.6 10.2 9.3 12.9 6.6 15.6M11.4 15.6h4.8",
    stroke: 2,
    // No vendor, no brand colour: the fallback stays a slate so it reads as
    // "a Unix we have no mark for" rather than a logo we forgot to colour.
    color: "#64748B",
    darkColor: "#94A3B8",
  },
}

/**
 * 一枚标在浅色与深色两种底上各自的颜色。
 *
 * 这一对必须从同一个地方出来：缺 darkColor 的家族（16 个里有 8 个）在深色底上完全
 * 靠 `?? color` 兜底，而深色主题正是这些家族最容易被画没的场景（见上面 darkColor 的
 * 说明）。兜底写在这里、测试也断言这里，组件只负责把返回值填进 CSS 变量——否则测试
 * 只能把 `??` 重抄一遍，抄的是数据表而不是组件真正走的那条表达式，哪天兜底被删掉，
 * 8 枚标在深色卡片上一起消失，测试却仍然是绿的。
 */
export function osColors(key: OsMark): { light: string; dark: string } {
  const mark = OS_MARKS[key]
  return { light: mark.color, dark: mark.darkColor ?? mark.color }
}
