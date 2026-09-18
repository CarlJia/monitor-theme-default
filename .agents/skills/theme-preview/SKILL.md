---
name: theme-preview
description: 生成/更新 monitor-theme-gymin 的 preview.png 宣传预览图。构建主题后起 mock hub、用 CDP 驱动 headless Chrome 截浅色+深色两版页面，再按黑画布对角线斜切合成。凡是用户要「生成/重做/更新 preview.png、预览图、宣传图、黑白双主题截图」，或主题 UI 改动后需要刷新预览图（哪怕没明说 preview 两个字），都用本 skill。
---

# theme-preview：生成主题预览图

最终产物是一张斜切宣传图：黑画布上内缩两张圆角截图，对角线（右上角→左下角）左上是
**浅色主题的卡片视图**，右下是**深色主题的地图视图**。规格：

- 画布 = 截图宽高 + 每边 30px 黑边（当前为 3038×1460，截图 2978×1400）；
  产物为 256 色索引 PNG，约 112 KB
- 截图：headless Chrome，视口 1489×700 CSS，deviceScaleFactor 2 → 2978×1400
- 圆角半径 32px；分割线就是画布对角线 x(y) = W·(1−y/(H−1))（从旧 preview.png 拟合证实：
  斜率 −1.7020 = −2978/1750，即旧图本来就是角对角直线，无需再拟合）
- 画布底色取深色截图左上角像素（主题的 dark 背景），深色卡片因此与画布无缝相融，
  只有浅色卡片的圆角可见——与旧图一致

## 快速路径

四条命令（仓库根目录执行；脚本在 `scripts/` 下，参数详见各文件头部注释）：

```bash
npm run build                 # 1. 构建产物到 dist/
node .agents/skills/theme-preview/scripts/mock-hub.mjs --port 9911 &   # 2. mock hub（后台）
node .agents/skills/theme-preview/scripts/capture.mjs --base http://127.0.0.1:9911 \
  --out-dir /tmp/preview-gen                                          # 3. 截 light.png / dark.png
node .agents/skills/theme-preview/scripts/compose.mjs \
  --light /tmp/preview-gen/light.png --dark /tmp/preview-gen/dark.png \
  --out preview.png                                                   # 4. 合成（最后一步才写仓库）
```

结束后 `kill %1` 停掉 hub，`file preview.png` 核对尺寸，然后按交付流程把
preview.png 交给 judge agent 做视觉验收（浅色半：摘要卡数值/卡片仪表/国旗完整；
深色半：地图气泡——在线实心绿、离线空心圈；分割线无伪影、无骨架屏、无乱码）。

## 为什么每步长这样（改代码前先读）

- **不用 `--virtual-time-budget` 截图。** 它碰上常开的 WebSocket 会让虚拟时间永远到不了
  预算，headless 挂死。所以 capture.mjs 走 CDP（Node ≥21 自带 WebSocket 客户端，无需
  playwright）：真实时间等待 + 轮询就绪条件 + `Page.captureScreenshot`。
- **headless 可能上报 `document.hidden = true`。** 应用的 WS 帧处理和兜底轮询都有
  `document.hidden` 门，被门住的话实时网速的折线永远只有 1 个采样点（画不出来）。
  mock hub 在 `/?preview=1` 的 index.html 里注入 `Object.defineProperty(document,
  "hidden", …)` 覆盖。注意必须注入到**目标页面**——seed 页设置完 localStorage 就
  跳走了，per-document 的覆盖带不过去。
- **折线需要多个采样点。** WS 每 300ms 推一帧、推 30 帧后主动关闭（应用 5s 后重连，
  循环补点）。capture 的就绪条件是数 `<polyline points>` 的坐标对数 ≥ 12。
- **视口高 700 而非更高。** 地图容器固定 h-[480px]，视口 875 时深色半下方会留 ~225 CSS px
  空黑；700 时地图刚好放满，且浅色半第二行卡片被底边截断——与旧图构图一致。改了页面
  结构（比如摘要卡变高）后按「地图框底边距视口底 ≤ 60px、浅色侧第二行被截断」重选。
- **就绪条件轮询而非固定 sleep**：地图块是懒加载 chunk，固定等待会竞态。settle 表达式
  对卡片视图数折线点、对地图视图数 `[class*='map-bubble']`（US/DE/HK/SG/JP/GB 共 6 个）。
- **合成是纯 Node PNG 编解码**（zlib 内置），无 Pillow/sharp 依赖。PNG 的 CRC 只覆盖
  chunk 的 type+data，不含长度前缀——写错过会得到 sips 都读不了的文件。
- **产物是 256 色索引 PNG（colorType 3），不是真彩。** 2x 截图的文字+渐变作为 RGB 要
  ~295 KB；同样的像素量化到 256 色只要 ~112 KB（PSNR 48 dB，肉眼无差）。逐行滤波在
  这类高熵内容上只会更大（自适应滤波反而 ~322 KB），所以量化比调滤波器划算得多。
  `--colors 0` 可退回真彩；`--colors N` 调调色板大小。
- **量化不加抖动。** Floyd–Steinberg 会把误差摊成高频噪点，既更糊又更大（256 色抖动
  实测 ~194 KB，PSNR 45 dB），UI 截图这种平坦区域本来也不会出现色带。
- **mock 节点数据要过 `safeNodes`**（src/lib/api.ts）：所有 metrics 数值字段必须是有限
  数、country 必须是 ALPHA-2，否则节点被清成离线/未定位。显示值由 1024 进制的
  bytes()/pair()/percent() 格式化——造数时用 GiB/TiB 字面量（`2*1024**3`），别用十进制
  GB，否则卡片上印出的数对不上预期。

## 改 mock 数据

节点表在 `scripts/mock-hub.mjs` 顶部的 `nodes` 数组，形状对齐 `src/lib/api.ts` 的
`Node` 类型。改完顺手核对四个摘要卡的期望值（今日流量/总流量是全节点求和，实时网速
是在线节点 net_rx/net_tx 求和——sum 对不上会在预览图里一眼看穿）。

## 若 UI 变化

- 新增/改名视图或切换控件 → 改 capture.mjs 顶部的 PASSES（seed 参数、settle 表达式、输出名）。
- 摘要卡/卡片布局变高变矮 → 重选视口高（见上）。
- 地图不再默认展示气泡 → 换就绪条件（如 `.leaflet-container` + 任一 overlay path）。
- 生成后务必真看一眼两张半图（裁开或整体 Read），数值/布局对不上就地修，别只看合成图的
  「看起来还行」。
