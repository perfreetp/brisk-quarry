# 台面丝印与灯位对齐工具

主设与运营方在同一张台面图上协作的纯前端工具：导入手绘草图 → 毫米标定 → 分区/碰撞体/丝印绘制 →
灯珠拖入与 2mm 对齐 → 角色协作批注/磨损记录 → 导出丝印 SVG 与灯位坐标 CSV。

## 技术栈

Vue 3.5 + TypeScript + Vite + Pinia + **Fabric.js v7**（pin `~7.4.0`）。无后端，
角色在应用内切换，文档存 localStorage（底图 blob 存 IndexedDB），可导出/导入工程 JSON 流转。

## 运行

```bash
npm install
npm run dev        # 开发
npm run test       # Vitest 几何/单位纯函数单测
npm run e2e        # Playwright 端到端冒烟（需系统 Chrome，用 playwright-core 不额外下载浏览器）
npm run build      # 类型检查 + 生产构建
```

端到端脚本默认连 `http://localhost:5199/`，可用 `SMOKE_URL` 覆盖；先 `npm run dev` 再跑 `npm run e2e`。

## 核心工作流

1. **导入草图**：工具条「导入草图」，图片作为底图层，blob 存 IndexedDB 避免撑爆 localStorage。
2. **标定**：输入台面实际宽高(mm)，在画布点取台面两个对角点，建立像素↔毫米比例（允许 x/y 非等比）。
   未完成标定时，笔刷/灯珠/碰撞测量工具统一禁用。
3. **分区与碰撞体**：按挡板/弹簧/靶组/轨道画分区矩形；碰撞体用矩形或逐点多边形（双击闭合）。
4. **丝印**：毫米笔宽画品牌图案（非等比标定下笔宽取几何均值，面板已注明近似）；shot 指示线用独立箭头工具。
   撤销按笔划回退（Ctrl+Z / Ctrl+Shift+Z），一笔一退。
5. **灯位**：从右侧灯位库拖入灯珠，按真实直径(mm)渲染为椭圆且禁止缩放/旋转。移动灯珠时显示十字中心线、
   最近碰撞体边界高亮与实时偏差；偏差 ≤2mm 绿色并在松手时磁吸，>2mm 红色，附近无碰撞体（>20mm）灰色未绑定。
6. **锁定与协作**：主设锁定碰撞体层（写入工程文件）；切到运营方后只能点选灯珠挂批注、在磨损层圈卡球位置。
   批注锚定灯珠 id，灯珠移动 marker 自动跟随；磨损圈按 mm 存储，标定变更后整体重建。
7. **导出**：丝印层 SVG（width/height 为 mm、viewBox 为台面像素，只含丝印对象）+
   灯位 CSV（UTF-8 BOM，含编号/X/Y/直径/绑定碰撞体/偏差/对齐状态/批注数）。工程 JSON 可重新打开继续编辑。

## 架构要点

- **扁平对象 + 图层注册表**：Fabric v7 无 Layer 类，所有对象为画布顶层对象并打 `layerId`，
  `LayerRegistry` 维护 `layerId→Set<object>` 与 `id→object` 双索引；对象进出画布只经 `LayerService` 收口，
  天然支持跨层 ActiveSelection（灯珠与碰撞体一起移动）。
- **mm 空间对齐几何**：所有距离/法向/磁吸在毫米坐标系计算（`src/geometry/distance.ts` 纯函数），
  非等比标定天然成立；px 仅用于渲染。
- **状态边界**：Fabric 对象图用 `shallowRef + markRaw` 持有，绝不进 Pinia 深响应式；Pinia 只存可序列化
  文档模型（标定、灯珠业务数据、批注、磨损、层元数据、角色、工具态）。
- **历史栈**：会话层命令栈（双快照 + 单一 restore），transform 为一个单元，联动灯珠纳入同一命令；不进工程文件。
- **蒙版**：canvas 级 `absolutePositioned` clipPath 固定在台面场景空间，对象任意变换都被同一台面边界裁切。
- **辅助渲染**：中心线/高亮/偏差文本/标定手柄走 `after:render` overlay，不进对象图、不参与序列化与命中。

## 目录

```
src/
  geometry/      units/distance 纯函数（含单测）
  fabric/        画布会话层：注册表、各业务 service、对齐引擎、历史栈、序列化、导出
  stores/        Pinia 文档模型与 UI 会话态
  components/    工具条、图层面板、标定、灯位库、批注/磨损、画布舞台
  composables/   防抖自动保存
  utils/         下载、IndexedDB 图片库、id
scripts/         Playwright 端到端冒烟与导出验证
```
