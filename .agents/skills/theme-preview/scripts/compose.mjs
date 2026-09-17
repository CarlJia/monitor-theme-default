// Compose the diagonal-split promo image in the repo's established style:
// black canvas (sampled from the dark capture's background), both captures
// inset on rounded-corner cards, dark layer revealed right of the canvas's
// corner-to-corner diagonal.
//
//   node compose.mjs --light light.png --dark dark.png --out preview.png
//                    [--margin 30] [--radius 32]
//
// Zero dependencies — PNG decode/encode via node:zlib. Geometry facts pinned
// while recreating the original preview.png: the seam is the canvas diagonal
// itself (fit of the old image: slope -1.7020 = -2978/1750 = -W/H), and the
// frame colour equals the dark theme background so the dark card melts into
// the canvas and only the light card's rounded corners read.
import { readFileSync, writeFileSync } from "node:fs"
import { inflateSync, deflateSync, crc32 } from "node:zlib"

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : def
}
const LIGHT = arg("light", null)
const DARK = arg("dark", null)
const OUT = arg("out", null)
const M = Number(arg("margin", 30))
const R = Number(arg("radius", 32))
if (!LIGHT || !DARK || !OUT) {
  console.error("usage: compose.mjs --light L.png --dark D.png --out OUT.png [--margin 30] [--radius 32]")
  process.exit(1)
}

// --- PNG decode (8-bit, colorType 2/6, non-interlaced) -----------------------
function decodePNG(buf) {
  let pos = 8, w = 0, h = 0, colorType = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString("ascii", pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9] }
    else if (type === "IDAT") idat.push(data)
    else if (type === "IEND") break
    pos += 12 + len
  }
  const channels = { 2: 3, 6: 4 }[colorType]
  if (!channels) throw new Error(`colorType ${colorType} unsupported`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * channels
  const out = new Uint8Array(w * h * 3)
  let prev = new Uint8Array(stride)
  for (let y = 0; y < h; y++) {
    const off = y * (stride + 1)
    const filter = raw[off]
    const line = raw.subarray(off + 1, off + 1 + stride)
    const cur = new Uint8Array(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[i] = v & 0xff
    }
    prev = cur
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3, s = x * channels
      out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]
    }
  }
  return { w, h, rgb: out }
}

// --- PNG encode (8-bit RGB, filter 0) ----------------------------------------
// CRC covers the chunk's type+data only — NOT the length prefix. Getting this
// wrong yields a file nothing can open.
function encodePNG(w, h, rgb) {
  const stride = w * 3
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write(type, 4, "ascii")
    const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]))
    return Buffer.concat([head, data, Buffer.from([(crc >> 24) & 0xff, (crc >> 16) & 0xff, (crc >> 8) & 0xff, crc & 0xff])])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ])
}

const light = decodePNG(readFileSync(LIGHT))
const dark = decodePNG(readFileSync(DARK))
if (light.w !== dark.w || light.h !== dark.h) throw new Error("layer size mismatch")
const { w: LW, h: LH, rgb: LR } = light
const DR = dark.rgb

const W = LW + 2 * M, H = LH + 2 * M
const bg = [DR[0], DR[1], DR[2]] // dark capture's top-left pixel = theme background
console.log(`canvas ${W}x${H}, frame rgb(${bg.join(",")})`)

// signed distance to the inset rounded rect -> 0..1 coverage (1.5px ramp)
function rectAlpha(x, y) {
  const cx = W / 2, cy = H / 2, hx = W / 2 - M, hy = H / 2 - M
  const qx = Math.abs(x - cx) - (hx - R), qy = Math.abs(y - cy) - (hy - R)
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0)
  const dist = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - R
  return Math.min(1, Math.max(0, 0.5 - dist / 1.5))
}
// corner-to-corner diagonal: line x at row y (top-right -> bottom-left)
const xline = (y) => W * (1 - y / (H - 1))

const out = new Uint8Array(W * H * 3)
for (let y = 0; y < H; y++) {
  const xl = xline(y)
  for (let x = 0; x < W; x++) {
    const la = rectAlpha(x, y)
    const da = la * Math.min(1, Math.max(0, (x - xl + 1) / 2))
    const o = (y * W + x) * 3
    const inL = x >= M && x < M + LW && y >= M && y < M + LH
    const so = ((y - M) * LW + (x - M)) * 3
    for (let c = 0; c < 3; c++) {
      const base = bg[c]
      const li = inL ? LR[so + c] : base
      const di = inL ? DR[so + c] : base
      out[o + c] = Math.round(li * la * (1 - da) + di * da + base * (1 - la) * (1 - da))
    }
  }
}
writeFileSync(OUT, encodePNG(W, H, out))
console.log(`${OUT}: ${W}x${H}`)
