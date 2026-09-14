// Package the build output as an installable theme bundle. The layout
// (dist/ + theme.json + optional preview.png) matches what release.yml
// archives and what the hub expects under <themes>/<short>/.
import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { create } from "tar"

const root = import.meta.dirname + "/.."
const tarball = resolve(root, "theme.tar.gz")

// Check the build artefact, not the directory: dist/index.html exists means
// vite build ran. Pass the whole `dist/` directory to tar so it recurses into
// dist/assets/ (the actual JS/CSS chunks). Passing a single file would only
// archive that one literal path.
const required = ["dist/index.html", "theme.json"]
const optional = ["preview.png"]

const missing = required.filter((p) => !existsSync(resolve(root, p)))
if (missing.length) {
  console.error(`缺少构建产物：${missing.join("、")}\n请先 npm run build`)
  process.exit(1)
}

const entries = [
  "dist",
  "theme.json",
  ...optional.filter((p) => existsSync(resolve(root, p))),
]

// portable: drop uid/gid/mtime so the same source produces the same archive
// regardless of which machine ran it -- mirrors what release.yml asks tar for.
// Drop Finder/Win explorer metadata so local archives match what CI emits.
await create(
  {
    gzip: true,
    file: tarball,
    cwd: root,
    portable: true,
    filter: (path) => {
      const base = path.split("/").pop()
      return base !== ".DS_Store" && base !== "Thumbs.db" && base !== "desktop.ini"
    },
  },
  entries,
)

const bytes = readFileSync(tarball)
const sha256 = createHash("sha256").update(bytes).digest("hex")
writeFileSync(`${tarball}.sha256`, `${sha256}  theme.tar.gz\n`)

console.log(`✓ theme.tar.gz (${(bytes.length / 1024).toFixed(1)} KB)`)
console.log(`✓ sha256 ${sha256.slice(0, 12)}… → theme.tar.gz.sha256`)
