/**
 * Which logo a machine's `os` string earns.
 *
 * The hub reports whatever the agent read from the distro, so the same family
 * arrives spelled a dozen ways -- "Debian GNU/Linux 12 (bookworm)", "Debian 12",
 * "Kali GNU/Linux 2023.3". Matching is therefore on the family word rather than
 * the whole string, and the order below is load-bearing: every RHEL rebuild
 * prints "Linux" as well, so it must be claimed before the generic rule.
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
  | "generic"

// First match wins, so this is ordered from most to least specific.
const RULES: [RegExp, OsMark][] = [
  [/windows/, "windows"],
  [/mac ?os|darwin|apple/, "macos"],
  [/ubuntu/, "ubuntu"],
  // Kali and Raspbian are Debian with a different wallpaper.
  [/debian|kali|raspbian/, "debian"],
  [/alpine/, "alpine"],
  [/arch|manjaro|endeavour/, "arch"],
  [/centos/, "centos"],
  [/fedora/, "fedora"],
  // One hat for the family, not the five near-identical logos underneath it:
  // a rebuild differs from Red Hat by name, not by anything a 14px mark can say.
  [/red ?hat|rhel|rocky|almalinux|alma|oracle|amazon|amzn/, "redhat"],
  [/linux|bsd|unix/, "generic"],
]

export function osMark(os: string): OsMark {
  const s = os.toLowerCase()
  return RULES.find(([re]) => re.test(s))?.[1] ?? "generic"
}

/**
 * A mark is one path, drawn either filled or stroked, so a whole logo set stays
 * a table of data rather than a file of components -- which is what lets the
 * test above check every family has artwork without a DOM.
 */
type Mark = {
  /** One or more subpaths. */
  d: string
  /** Stroke width. A mark without it is filled with the current colour. */
  stroke?: number
  /** For a shape whose hole its subpaths do not wind apart (the Fedora ring). */
  evenodd?: boolean
}

// Every logo is drawn on a 24x24 grid. These are simplified marks -- a 14px
// glyph admits no codename, no wordmark and no gradient -- chosen so the family
// is still recognisable at the size the card prints.
export const OS_MARKS: Record<OsMark, Mark> = {
  // Four panes, slightly skewed, as the flag is drawn.
  windows: {
    d: "M3.1 5.5 10.6 4.4v7.2H3.1zM12.4 4.1 21 2.8v8.8h-8.6zM3.1 13.4h7.5v7.2L3.1 19.5zM12.4 13.4H21v8.8l-8.6-1.3z",
  },
  // The circle of friends: a thin ring carrying three nodes. The nodes have to
  // break the ring's outline or they vanish into it -- a same-colour dot inside
  // the band is invisible -- which is why they bulge past it.
  ubuntu: {
    d: "M12 2.7a9.3 9.3 0 1 0 0 18.6 9.3 9.3 0 0 0 0-18.6z" +
      "M12 4.2a7.8 7.8 0 1 1 0 15.6 7.8 7.8 0 0 1 0-15.6z" +
      "M9.8 3.45a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 1 0-4.4 0z" +
      "M2.39 16.28a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 1 0-4.4 0z" +
      "M17.21 16.28a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 1 0-4.4 0z",
  },
  // The swirl, as four quarter arcs of shrinking radius. Each arc's centre sits
  // where the previous one left off, which is what makes it spiral in rather
  // than close into a ring -- the last, shortest arc is what reads as the curl.
  debian: { d: "M12 4A8 8 0 0 1 20 12A6 6 0 0 1 14 18A3 3 0 0 1 11 15A1.5 1.5 0 0 1 12.5 13.5", stroke: 2.5 },
  // A ridge, not one peak: two summits are what separate this from Arch.
  alpine: { d: "M3 19.5 9.3 8l2.9 5.1 2.2-3.6L21 19.5z" },
  // The mountain with the notch cut out of it.
  arch: { d: "M12 4.2 21 19.6h-4.6L12 11.4 7.6 19.6H3z" },
  // The ring in four arcs, the gaps where the wordmark's letters sit.
  centos: {
    d: "M19.26 13.41A7.4 7.4 0 0 1 13.41 19.26M10.59 19.26A7.4 7.4 0 0 1 4.74 13.41" +
      "M4.74 10.59A7.4 7.4 0 0 1 10.59 4.74M13.41 4.74A7.4 7.4 0 0 1 19.26 10.59",
    stroke: 2.6,
  },
  // Ring plus the letterform.
  fedora: {
    d: "M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6z" +
      "M12 5.8a6.2 6.2 0 1 1 0 12.4 6.2 6.2 0 0 1 0-12.4z" +
      "M11 7.6c0-1.3 1-2.3 2.3-2.3h1.5v2h-1.3c-.3 0-.5.2-.5.5v1.6h1.8v2h-1.8v6h-2z",
    evenodd: true,
  },
  // A bell crown on a brim wide enough to read as one -- a crown as wide as the
  // brim is a cloud, which is what the first draft drew.
  redhat: {
    d: "M8.6 15.2c0-5.2 1.5-9 3.4-9s3.4 3.8 3.4 9z" +
      "M4.4 15.2h15.2c1 0 1.8.8 1.8 1.8v.4c0 1-.8 1.8-1.8 1.8H4.4c-1 0-1.8-.8-1.8-1.8v-.4c0-1 .8-1.8 1.8-1.8z",
  },
  // Apple and leaf.
  macos: {
    d: "M16 12.3c0-2.2 1.8-3.3 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.6.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.4 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.5 1 8.6.7 1 1.5 2.2 2.7 2.2 1.1 0 1.5-.7 2.8-.7s1.6.7 2.8.7c1.1 0 1.9-1.1 2.6-2.2.8-1.2 1.1-2.4 1.2-2.5-.1 0-2.2-.9-2.2-3.2z" +
      "M14 6.2c.6-.7 1-1.7.9-2.7-.9.1-1.9.6-2.5 1.3-.6.7-1 1.7-.9 2.6.9.1 1.9-.5 2.5-1.2z",
  },
  // A terminal, for a Unix we have no mark for. Deliberately not a penguin:
  // Tux reads as "Linux", and this answer is also correct for BSD.
  generic: {
    d: "M4.2 5.4h15.6a1.8 1.8 0 0 1 1.8 1.8v9.6a1.8 1.8 0 0 1-1.8 1.8H4.2a1.8 1.8 0 0 1-1.8-1.8V7.2a1.8 1.8 0 0 1 1.8-1.8z" +
      "M6.6 10.2 9.3 12.9 6.6 15.6M11.4 15.6h4.8",
    stroke: 2,
  },
}
