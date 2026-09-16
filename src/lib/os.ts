import {
  siAlmalinux,
  siAlpinelinux,
  siApple,
  siArchlinux,
  siCentos,
  siDebian,
  siFedora,
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
 * word rather than the whole string, and the order below is load-bearing: every
 * RHEL rebuild prints "Linux" as well, so it must be claimed before the generic
 * rule.
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
  | "generic"

// First match wins, so this is ordered from most to least specific.
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
  // One hat for the rest of the family: a rebuild differs from Red Hat by name,
  // not by anything a 14px mark can say, and simple-icons carries no mark for
  // Oracle or Amazon Linux at all.
  [/red ?hat|rhel|oracle|amazon|amzn/, "redhat"],
  [/linux|bsd|unix/, "generic"],
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
  /** Stroke width. A mark without it is filled with the current colour. */
  stroke?: number
}

/**
 * The vendors' own artwork, at the 24x24 grid simple-icons standardises on, so
 * a logo is recognisable rather than merely suggestive.
 *
 * Two marks are drawn here instead, because simple-icons has no entry for
 * either: Windows (the Microsoft marks were withdrawn from the set) and the
 * generic fallback, which is deliberately a terminal rather than a penguin --
 * that answer is also the correct one for a BSD.
 */
export const OS_MARKS: Record<OsMark, Mark> = {
  // Four panes, slightly skewed, as the flag is drawn.
  windows: {
    d: "M3.1 5.5 10.6 4.4v7.2H3.1zM12.4 4.1 21 2.8v8.8h-8.6zM3.1 13.4h7.5v7.2L3.1 19.5zM12.4 13.4H21v8.8l-8.6-1.3z",
  },
  macos: { d: siApple.path },
  ubuntu: { d: siUbuntu.path },
  debian: { d: siDebian.path },
  alpine: { d: siAlpinelinux.path },
  arch: { d: siArchlinux.path },
  centos: { d: siCentos.path },
  fedora: { d: siFedora.path },
  redhat: { d: siRedhat.path },
  rocky: { d: siRockylinux.path },
  almalinux: { d: siAlmalinux.path },
  generic: {
    d: "M4.2 5.4h15.6a1.8 1.8 0 0 1 1.8 1.8v9.6a1.8 1.8 0 0 1-1.8 1.8H4.2a1.8 1.8 0 0 1-1.8-1.8V7.2a1.8 1.8 0 0 1 1.8-1.8z" +
      "M6.6 10.2 9.3 12.9 6.6 15.6M11.4 15.6h4.8",
    stroke: 2,
  },
}
