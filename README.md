# 换乘流线走查动画工作台

原生 TypeScript + Web Components + Konva 实现的地铁站换乘流线走查原型。打开页面后会先铺出站厅层、站台层、楼扶梯、通道和闸机位置，再根据内置的交通咨询高峰小时换乘量与流向生成早高峰、晚高峰两组流线轨道。

## 启动

```bash
npm install
npm run dev
```

浏览器打开 Vite 输出的地址（默认 <http://127.0.0.1:5173>）。

生产构建：

```bash
npm run build
npm run preview
```

## 已实现的走查能力

- **双层平面与设备位置**：Konva 绘制站厅层 B1、站台层 B2、站台/列车、立柱、设备用房、西楼扶梯组、中楼扶梯组、东楼扶梯组、中央双向通道和 G1–G6 闸机。
- **咨询流量建轨**：内置脱敏的高峰小时换乘量和 OD 流向。早、晚高峰各有上行、下行一条轨道，共 4 条；每条轨道由 10–11 个关键帧组成。
- **关键帧语义**：每个关键帧保存时刻、平面坐标、累计换乘距离和位置名称。时间轴圆点的悬停提示和点击后的详情条会显示“哪个时刻、客流在哪个位置、距起点多少米”。
- **早晚高峰共用时间轴**：两组轨道在同一时间域内上下对齐，画布默认“早晚叠加”，也可切换仅看早峰或晚峰。
- **晚高峰挪半格**：默认把晚高峰组整体右移 `0.5` 个时间格（1 格 = 1 分钟），可用“晚高峰整体挪半格 / 复位半格”按钮切换。时间轴中的紫色区间为中央通道主次流向反转对位窗。
- **拖帧与回放一致**：拖动时间轴会暂停并 seek；播放始终从当前预览时刻继续。画布、时间轴播放头和时钟读取同一个 `timeMin` 状态。
- **双向通道嵌套组**：中央通道在 Konva 中按  
  `fit-root → #passage-central → #passage-lanes → .nested-flow-lane`  
  嵌套，早晚、上下行子层均使用通道组本地坐标。检查器中的“校验拖帧后嵌套层是否跑位”会读取绝对变换并给出偏差。
- **流量变化自动重排关键帧**：在检查器选择“西楼梯口 MOUTH-W”，修改早/晚高峰流量或点击“早高峰大客流 3720”，关键帧 ID 和平面点位不变，后续时间间距按流量/能力比重新计算；粒子间距也随 headway 变化。
- **闸机卡顿与上一帧叠层**：选择 G3（或任意 G 闸机），点击“在当前走查点记录卡顿”，再点“翻回上一帧叠着看”。蓝色点为上一帧人数，红色半透明点为卡顿帧幽灵层，检查器和画布顶部会显示两帧人数差。
- **定稿确认与交接**：右上角“定稿与运营确认”中可填写业主、运营方代表和结论，并导出：
  - JSON 确认包：早晚两组轨道、全部关键帧、分段、距离、流量修订、卡顿对比、自检和会签信息；
  - HTML 会签确认单：可打印/另存 PDF；
  - 当前 Konva 画布 PNG；
  - 早晚叠加动画 WebM（通过 `canvas.captureStream()` + `MediaRecorder`，Chromium/Edge/Chrome 支持较好）。

## 代码结构

```text
index.html
src/
├─ main.ts                         # 入口，挂载全局 store 便于调试
├─ store.ts                        # 单一状态、seek/播放/流量修订/卡顿/会签
├─ types.ts                        # 领域模型
├─ data/station.ts                 # 平面坐标、设施、咨询流量、路线节点
├─ engine/flowEngine.ts            # 建轨、关键帧重排、插值、闸机人数、自检
├─ exporter.ts                     # JSON / HTML 确认包
└─ components/
   ├─ station-app.ts               # <station-app> 布局与 requestAnimationFrame
   ├─ plan-canvas.ts               # <plan-canvas> Konva 平面、流线、嵌套组、叠帧
   ├─ timeline-panel.ts            # <timeline-panel> 共用时间轴和关键帧
   ├─ inspector-panel.ts           # <inspector-panel> 流量/卡顿/距离/自检
   └─ review-dialog.ts             # <review-dialog> 定稿、会签、导出和 WebM 录制
```

## 替换为真实项目数据

主要修改 `src/data/station.ts`：

1. 调整 `FLOORS`、`FACILITIES` 和 `COLUMNS` 以匹配实际 CAD 简化坐标；
2. 用真实咨询表替换 `CONSULTING_FLOWS` 中的 OD、方向和 `volumePaxH`；
3. 按实际走行节点修改 `ROUTES`，每个节点的 `distanceM` 为累计真实换乘距离；
4. 设施能力填写在 `FACILITIES[].capacityPaxH` 和路线节点的 `outCapacityPaxH`。

当前坐标是示意化走查底图，不代表具体车站尺寸。
