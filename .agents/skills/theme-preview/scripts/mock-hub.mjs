// Mock hub for preview generation: serves dist/, /api/me, /api/nodes,
// /api/nodes/{id}/metrics and a WebSocket /api/ws that pushes frames so the
// summary sparkline builds history.
//
//   node mock-hub.mjs [--dist ./dist] [--port 9911] [--site "Mock Monitor"]
//
// Zero dependencies. Edit the `nodes` array below to change the fleet — the
// shape must satisfy safeNodes() in src/lib/api.ts (all metric fields finite
// numbers, country ALPHA-2) or nodes get cleared to offline/unlocated.
import http from "node:http"
import crypto from "node:crypto"
import { readFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : def
}
const PORT = Number(arg("port", 9911))
const DIST = arg("dist", "./dist")
const SITE = arg("site", "Mock Monitor")

const GiB = 1024 ** 3
const TiB = 1024 ** 4
const K = 1024

// expiry exactly 77 days out (local midnight), so the card prints 77 天后到期
const expiry = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 77)
  return d.toISOString().slice(0, 10)
})()

const nodes = [
  {
    id: 1, name: "us-1", sort: 1, public: true, online: true, country: "US",
    os: "Debian 12", kernel: "6.1.0-18-amd64", arch: "x86_64", virt: "kvm",
    cpu_name: "AMD EPYC 9634 24-Core Processor", cpu_cores: 2, price: 0, currency: "USD",
    billing_cycle: "monthly", expires_at: expiry, traffic_limit: TiB, traffic_mode: "sum",
    traffic_reset_day: 1, month_start: "2026-09-01", agent_version: "1.1.2",
    last_seen: Date.now() / 1000,
    mem_total: 2 * GiB, mem_used: 800358400, swap_total: 0, swap_used: 0,
    disk_total: 40 * GiB, disk_used: 12 * GiB,
    net_rx: 2.2 * K * K, net_tx: 390.6 * K,
    total_rx: 838 * GiB, total_tx: 186 * GiB, day_rx: 20 * GiB, day_tx: 4 * GiB,
    month_rx: 200 * GiB, month_tx: 135 * GiB, tcp: 42, udp: 8, procs: 130,
  },
  {
    id: 2, name: "us-2", sort: 2, public: true, online: true, country: "US",
    os: "Debian 12", kernel: "6.1.0-18-amd64", arch: "x86_64", virt: "kvm",
    cpu_name: "AMD EPYC 9634 24-Core Processor", cpu_cores: 2, price: 0, currency: "USD",
    billing_cycle: "monthly", expires_at: expiry, traffic_limit: TiB, traffic_mode: "sum",
    traffic_reset_day: 1, month_start: "2026-09-01", agent_version: "1.1.2",
    last_seen: Date.now() / 1000,
    mem_total: 2 * GiB, mem_used: 800358400, swap_total: 0, swap_used: 0,
    disk_total: 40 * GiB, disk_used: 12 * GiB,
    net_rx: 2.2 * K * K, net_tx: 390.6 * K,
    total_rx: 838 * GiB, total_tx: 186 * GiB, day_rx: 20 * GiB, day_tx: 4 * GiB,
    month_rx: 200 * GiB, month_tx: 135 * GiB, tcp: 38, udp: 6, procs: 122,
  },
  {
    id: 3, name: "de-1", sort: 3, public: true, online: true, country: "DE",
    os: "Debian 12", kernel: "6.1.0-18-amd64", arch: "x86_64", virt: "kvm",
    cpu_name: "Intel Xeon Platinum 8260", cpu_cores: 2, price: 0, currency: "EUR",
    billing_cycle: "monthly", expires_at: expiry, traffic_limit: TiB, traffic_mode: "sum",
    traffic_reset_day: 1, month_start: "2026-09-01", agent_version: "1.1.2",
    last_seen: Date.now() / 1000,
    mem_total: 2 * GiB, mem_used: 900 * 1024 * 1024, swap_total: 0, swap_used: 0,
    disk_total: 40 * GiB, disk_used: 13.2 * GiB,
    net_rx: 2.5 * K * K, net_tx: 0.5 * K * K,
    total_rx: 1500 * GiB, total_tx: 300 * GiB, day_rx: 10 * GiB, day_tx: 2 * GiB,
    month_rx: 210 * GiB, month_tx: 128 * GiB, tcp: 30, udp: 5, procs: 118,
  },
  {
    id: 4, name: "gb-1", sort: 4, public: true, online: false, country: "GB",
    os: "Debian 12", kernel: "6.1.0-18-amd64", arch: "x86_64", virt: "kvm",
    cpu_name: "Intel Xeon E5-2680 v4", cpu_cores: 2, price: 0, currency: "GBP",
    billing_cycle: "monthly", expires_at: expiry, traffic_limit: TiB, traffic_mode: "sum",
    traffic_reset_day: 1, month_start: "2026-09-01", agent_version: "1.1.2",
    last_seen: Date.now() / 1000 - 50 * 3600,
    mem_total: 2 * GiB, mem_used: 0, swap_total: 0, swap_used: 0,
    disk_total: 40 * GiB, disk_used: 10 * GiB,
    net_rx: 0, net_tx: 0,
    total_rx: 400 * GiB, total_tx: 178 * GiB, day_rx: 0.2 * GiB, day_tx: 0.2 * GiB,
    month_rx: 90 * GiB, month_tx: 60 * GiB, tcp: 0, udp: 0, procs: 0,
  },
  {
    id: 5, name: "hk-1", sort: 5, public: true, online: true, country: "HK",
    os: "Debian 12", kernel: "6.1.0-18-amd64", arch: "x86_64", virt: "kvm",
    cpu_name: "AMD EPYC 7K62 48-Core Processor", cpu_cores: 2, price: 0, currency: "CNY",
    billing_cycle: "monthly", expires_at: expiry, traffic_limit: TiB, traffic_mode: "sum",
    traffic_reset_day: 1, month_start: "2026-09-01", agent_version: "1.1.2",
    last_seen: Date.now() / 1000,
    mem_total: 2 * GiB, mem_used: 1.24 * GiB, swap_total: 0, swap_used: 0,
    disk_total: 40 * GiB, disk_used: 24 * GiB,
    net_rx: 2.6 * K * K, net_tx: 0.4 * K * K,
    total_rx: 900 * GiB, total_tx: 200 * GiB, day_rx: 8 * GiB, day_tx: 1.5 * GiB,
    month_rx: 180 * GiB, month_tx: 150 * GiB, tcp: 88, udp: 12, procs: 210,
  },
  {
    id: 6, name: "jp-1", sort: 6, public: true, online: false, country: "JP",
    os: "Debian 12", kernel: "6.1.0-18-amd64", arch: "x86_64", virt: "kvm",
    cpu_name: "AMD EPYC 7443P 24-Core Processor", cpu_cores: 2, price: 0, currency: "JPY",
    billing_cycle: "monthly", expires_at: expiry, traffic_limit: TiB, traffic_mode: "sum",
    traffic_reset_day: 1, month_start: "2026-09-01", agent_version: "1.1.2",
    last_seen: Date.now() / 1000 - 26 * 3600,
    mem_total: 2 * GiB, mem_used: 0, swap_total: 0, swap_used: 0,
    disk_total: 40 * GiB, disk_used: 9 * GiB,
    net_rx: 0, net_tx: 0,
    total_rx: 593 * GiB, total_tx: 100 * GiB, day_rx: 2 * GiB, day_tx: 0.3 * GiB,
    month_rx: 70 * GiB, month_tx: 40 * GiB, tcp: 0, udp: 0, procs: 0,
  },
  {
    id: 7, name: "sg-1", sort: 7, public: true, online: true, country: "SG",
    os: "Debian 12", kernel: "6.1.0-18-amd64", arch: "x86_64", virt: "kvm",
    cpu_name: "AMD EPYC 9354 32-Core Processor", cpu_cores: 2, price: 0, currency: "USD",
    billing_cycle: "monthly", expires_at: expiry, traffic_limit: TiB, traffic_mode: "sum",
    traffic_reset_day: 1, month_start: "2026-09-01", agent_version: "1.1.2",
    last_seen: Date.now() / 1000,
    mem_total: 2 * GiB, mem_used: 0.6 * GiB, swap_total: 0, swap_used: 0,
    disk_total: 40 * GiB, disk_used: 8 * GiB,
    net_rx: 1.5 * K * K, net_tx: 0.25 * K * K,
    total_rx: 800 * GiB, total_tx: 150 * GiB, day_rx: 5 * GiB, day_tx: 1.0 * GiB,
    month_rx: 120 * GiB, month_tx: 95 * GiB, tcp: 25, udp: 4, procs: 96,
  },
].map((n) => ({ hostname: `${n.name}.mock.lan`, ip: "203.0.113.1", ...n }))

// per-node live figures the summary derives its headline numbers from:
// CPU of hk-1 (busiest tile), uptime strings on the cards
const CPU = { 1: 22, 2: 39, 3: 18, 5: 100, 7: 12 }
const UPTIME = { 1: 86400, 2: 86400, 3: 15 * 86400, 5: 9 * 86400, 7: 6 * 86400 }

function frame(n) {
  const jitter = (v) => (v > 0 ? Math.max(0, v * (1 + 0.04 * Math.sin(Date.now() / 900) + (Math.random() - 0.5) * 0.02)) : v)
  return {
    ...n,
    metrics: n.online
      ? {
          uptime: UPTIME[n.id] ?? 86400,
          cpu: CPU[n.id] ?? 10,
          load: n.id === 5 ? [1.8, 1.9, 2.0] : [0.1, 0.2, 0.3],
          mem_total: n.mem_total, mem_used: n.mem_used,
          swap_total: n.swap_total, swap_used: n.swap_used,
          disk_total: n.disk_total, disk_used: n.disk_used,
          net_rx: jitter(n.net_rx), net_tx: jitter(n.net_tx),
          total_rx: n.total_rx, total_tx: n.total_tx,
          month_rx: n.month_rx, month_tx: n.month_tx,
          tcp: n.tcp, udp: n.udp, procs: n.procs,
        }
      : null,
  }
}

// --- detail-page history (/api/nodes/{id}/metrics) -------------------------
// The hub builds these from stored samples; here they are synthesised from a
// per-node baseline. `nz` is a hash rather than Math.random on purpose, so
// re-fetching the same window redraws the same line instead of reshuffling it
// every few seconds.
const HOURS_CAP = 168 // what the hub allows an anonymous caller
const METRIC_STEP = 60 // the hub's base bucket, in seconds
const PROBE_IDS = [11, 12, 13, 14, 15]
const PROBE_NAMES = { 11: "电信 上海", 12: "联通 北京", 13: "移动 广州", 14: "CN2 GIA", 15: "阿里云 香港" }
// 丢包的那个探测：窗口整体的比例，以及它偶尔丢包时一个桶长什么样。
// 其余探测不丢包，也按契约不出现在 `loss` 里。
const PROBE_LOSS = { 13: { window: 1.8, buckets: [2, 6] } }

// cpu %、mem/disk 字节、rx/tx B/s，以及五个探测各自的往返毫秒。
const HIST = {
  1: { cpu: 22, mem: 0.82 * GiB, disk: 12.0 * GiB, rx: 2.2 * K * K, tx: 390 * K, rtt: [176, 198, 231, 158, 212] },
  2: { cpu: 39, mem: 0.74 * GiB, disk: 11.4 * GiB, rx: 2.0 * K * K, tx: 356 * K, rtt: [182, 191, 224, 165, 208] },
  3: { cpu: 18, mem: 0.88 * GiB, disk: 13.1 * GiB, rx: 2.5 * K * K, tx: 512 * K, rtt: [188, 205, 240, 172, 226] },
  4: { cpu: 9, mem: 0.41 * GiB, disk: 10.0 * GiB, rx: 96 * K, tx: 42 * K, rtt: [201, 214, 248, 186, 235] },
  5: { cpu: 96, mem: 1.24 * GiB, disk: 24.0 * GiB, rx: 2.6 * K * K, tx: 410 * K, rtt: [42, 55, 38, 31, 68] },
  6: { cpu: 6, mem: 0.35 * GiB, disk: 9.0 * GiB, rx: 64 * K, tx: 28 * K, rtt: [58, 71, 52, 46, 84] },
  7: { cpu: 12, mem: 0.61 * GiB, disk: 8.0 * GiB, rx: 1.5 * K * K, tx: 256 * K, rtt: [68, 82, 61, 55, 96] },
}

const nz = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const round1 = (v) => Math.round(v * 10) / 10

/**
 * The hub's `sample_step`: 60s buckets, thinned until the window holds no more
 * than `points` of them. Mirrors the only property the theme depends on -- a
 * larger `points` never gives a denser chart.
 */
function history(node, hours, points, series) {
  const h = HIST[node.id]
  const step = Math.max(METRIC_STEP, Math.ceil((hours * 3600) / points / METRIC_STEP) * METRIC_STEP)
  // Stamped with the bucket's own start, as the hub stamps samples. An offline
  // node's history stops where its agent did, which is what leaves the
  // right-hand gap on its charts.
  const now = Math.floor(Date.now() / 1000 / step) * step
  const last = node.online ? now : Math.floor(node.last_seen / step) * step
  const from = now - hours * 3600 + step
  const count = Math.max(0, Math.floor((last - from) / step) + 1)
  const metrics = []
  const ping = []
  for (let i = 0; i < count; i++) {
    const ts = from + i * step
    const t = ts / 3600 // hours since the epoch; every wave phase rides on it
    // Disk only fills, so its growth is the window's own progress rather than a
    // wave that would have to be clipped at the top to stay monotonic.
    const grow = count > 1 ? i / (count - 1) : 1
    if (series !== "ping") {
      const wave = (period, phase) => Math.sin((t / period) * Math.PI * 2 + phase + node.id)
      metrics.push({
        ts,
        cpu: round1(clamp(h.cpu * (1 + 0.4 * wave(5.4, 0.1) + 0.3 * (nz(ts + node.id * 7) - 0.5)), 0, 100)),
        mem_used: Math.round(clamp(h.mem * (1 + 0.06 * wave(19, 0.4) + 0.04 * (nz(ts + node.id * 13) - 0.5)), 0, node.mem_total)),
        disk_used: Math.round(h.disk * (0.965 + 0.035 * grow + 0.006 * (nz(ts + node.id * 17) - 0.5))),
        net_rx: Math.round(Math.max(0, h.rx * (1 + 0.55 * wave(3.1, 0.7) + 0.5 * (nz(ts + node.id * 19) - 0.5)))),
        net_tx: Math.round(Math.max(0, h.tx * (1 + 0.55 * wave(2.6, 0.2) + 0.5 * (nz(ts + node.id * 23) - 0.5)))),
      })
    }
    // Probes only report while the agent does; an offline node keeps its
    // resource history and loses its latency one. All five share the bucket the
    // hub stamped them with, so a window of them is `count` rows, not five.
    if (series !== "metrics" && node.online) {
      for (const [k, task_id] of PROBE_IDS.entries()) {
        // Roughly one bucket in eighty answers nothing: the hub stores that as
        // -1, and it is what the chart has to draw across.
        if (nz(ts * 1.7 + task_id * 31) < 0.012) {
          ping.push({ task_id, ts, latency: -1 })
          continue
        }
        const latency = clamp(h.rtt[k] * (1 + 0.18 * Math.sin((t / 2.3) * Math.PI * 2 + k * 0.9)
          + 0.14 * (nz(ts * 3 + k * 41) - 0.5)), 1, 999)
        const spread = latency * (0.06 + 0.05 * nz(ts * 5 + task_id))
        const point = {
          task_id,
          ts,
          latency: round1(latency),
          band: [round1(latency - spread), round1(latency + spread)],
        }
        const loss = PROBE_LOSS[task_id]
        if (loss && nz(ts / step + task_id * 7) < 0.12) {
          point.loss = round1(loss.buckets[0] + (loss.buckets[1] - loss.buckets[0]) * nz(ts + task_id * 3))
        }
        ping.push(point)
      }
    }
  }
  // `series` halves the response: the half nobody asked for is a third to two
  // thirds of every payload, exactly as the hub has it.
  if (series === "metrics") return { metrics, ping: [], probes: {}, loss: {} }
  const loss = {}
  for (const [id, l] of Object.entries(PROBE_LOSS)) loss[id] = l.window
  if (series === "ping") return { metrics: [], ping, probes: PROBE_NAMES, loss }
  return { metrics, ping, probes: PROBE_NAMES, loss }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  res.setHeader("cache-control", "no-store")

  // Sets theme/view localStorage, then lands on the real page. The ?preview=1
  // flag triggers the visibility override injection below.
  if (url.pathname === "/seed") {
    const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light"
    const view = ["cards", "table", "map"].includes(url.searchParams.get("view")) ? url.searchParams.get("view") : "cards"
    res.setHeader("content-type", "text/html; charset=utf-8")
    res.end(`<!doctype html><script>
localStorage.setItem("theme", ${JSON.stringify(theme)});
localStorage.setItem("view", ${JSON.stringify(view)});
localStorage.removeItem("quality");
location.replace("/?preview=1");
</script>`)
    return
  }

  if (url.pathname === "/api/me") {
    res.setHeader("content-type", "application/json")
    res.end(JSON.stringify({ authed: false, github: false, site_name: SITE, public_page: true }))
    return
  }
  if (url.pathname === "/api/nodes") {
    res.setHeader("content-type", "application/json")
    res.end(JSON.stringify({ nodes: nodes.map(frame) }))
    return
  }
  if (url.pathname === "/api/nodes/quality") {
    // The band's window is the hub's fixed one hour at a minute a bucket, drawn
    // for every node that is reporting. An offline node has no probes running,
    // so it contributes nothing rather than an hour of blanks.
    res.setHeader("content-type", "application/json")
    const batch = {}
    for (const n of nodes) {
      if (!n.online) continue
      const { ping, probes, loss } = history(n, 1, 60, "ping")
      batch[n.id] = { ping, probes, loss }
    }
    res.end(JSON.stringify(batch))
    return
  }
  const detail = /^\/api\/nodes\/(\d+)\/metrics$/.exec(url.pathname)
  if (detail) {
    const node = nodes.find((n) => n.id === Number(detail[1]))
    res.setHeader("content-type", "application/json")
    if (!node) {
      res.statusCode = 404
      res.end("{}")
      return
    }
    // The three query parameters are all optional and all silently clamped, per
    // the theme contract: `hours` to what an anonymous caller gets, `points` to
    // a sane request, and an unknown `series` to both halves.
    const hours = clamp(Number(url.searchParams.get("hours")) || 24, 1, HOURS_CAP)
    const points = clamp(Number(url.searchParams.get("points")) || 240, 10, 5000)
    const series = url.searchParams.get("series") ?? ""
    res.end(JSON.stringify(history(node, hours, points, series)))
    return
  }
  if (url.pathname.startsWith("/api/")) {
    res.statusCode = 404
    res.setHeader("content-type", "application/json")
    res.end("{}")
    return
  }

  // static from dist/, unknown paths fall back to index.html like the hub does.
  // With ?preview=1 the page gets a head-start script: headless Chrome may
  // report the tab hidden, which would gate both the WS frames and the fallback
  // poll (the sparkline would never fill). The override must live on the target
  // page itself — it cannot survive the seed page's navigation.
  let path = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "")
  if (path === "/" || path === "\\") path = "/index.html"
  const file = join(DIST, path)
  try {
    let data = await readFile(file)
    if (url.searchParams.has("preview") && path === "/index.html") {
      data = Buffer.from(
        data.toString().replace(
          "<head>",
          `<head><script>
Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
Object.defineProperty(document, "visibilityState", { get: () => "visible", configurable: true });
</script>`,
        ),
      )
    }
    res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream")
    res.end(data)
  } catch {
    try {
      const data = await readFile(join(DIST, "index.html"))
      res.setHeader("content-type", MIME[".html"])
      res.end(data)
    } catch {
      res.statusCode = 404
      res.end("not found")
    }
  }
})

// --- minimal RFC6455 server: enough to push JSON frames and answer ping/close
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

function encodeText(str) {
  const payload = Buffer.from(str)
  const len = payload.length
  let header
  if (len < 126) {
    header = Buffer.from([0x81, len])
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2)
  }
  return Buffer.concat([header, payload])
}

server.on("upgrade", (req, socket) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (url.pathname !== "/api/ws" || !req.headers["sec-websocket-key"]) { socket.destroy(); return }
  const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + GUID).digest("base64")
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  )

  let open = true
  socket.on("data", (buf) => {
    // client frames are masked; only opcode matters here (ping/close)
    const op = buf[0] & 0x0f
    if (op === 0x8) { open = false; socket.end() }
    if (op === 0x9) socket.write(Buffer.from([0x8a, 0x00]))
  })
  socket.on("error", () => { open = false })

  // Push for ~9s then close: the app re-polls every 5s afterwards and reconnects
  // 5s later, so the sparkline keeps filling across cycles either way.
  let budget = 30
  const push = setInterval(() => {
    if (!open || --budget <= 0) {
      clearInterval(push)
      if (open) socket.end()
      return
    }
    try { socket.write(encodeText(JSON.stringify({ nodes: nodes.map(frame) }))) } catch { clearInterval(push) }
  }, 300)
})

server.listen(PORT, "127.0.0.1", () => console.log(`mock hub on http://127.0.0.1:${PORT} (dist: ${DIST})`))
