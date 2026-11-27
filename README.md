# 果树逐枝修剪标注工具

使用 **SolidJS + PlayCanvas + TypeScript/Vite** 构建的果树点云枝条骨架标注工作台。技术员导入骨架 JSON 后，可在真实比例的三维场景中环绕查看、点选枝条、打修剪标签、拖动剪口并导出 CSV/GLB。

## 启动

```bash
npm install
npm run dev
```

浏览器打开终端输出的地址（默认 `http://127.0.0.1:5173`）。

生产构建：

```bash
npm run build
npm run preview
```

打开后会自动生成一棵约 3,300 根枝的示例树，用于验证数千枝规模下的清单虚拟化、合并网格渲染和射线点选。也可以通过左上角“导入骨架 JSON”导入自己的数据；`examples/sample-fruit-tree.json` 是一份小型格式示例。

## 核心操作

- **环绕查看**：左键拖动旋转，滚轮缩放，右键拖动平移；支持触屏拖动。
- **选择枝条**：单击三维枝条或左侧清单行；选中枝显示青色高亮壳。
- **聚焦枝条**：双击清单行或属性面板中的“聚焦”。
- **打标签**：右侧按钮或键盘 `1` 保留、`2` 疏除、`3` 短截、`4` 回缩。
- **剪口**：短截/回缩后出现黄色剪口环；直接在三维枝条上拖动，或使用右侧滑杆/芽位按钮。
  - 靠近芽位 22 px 内自动吸附。
  - 剪口位置始终被夹在枝条轴线内，不能拖到梢端之外。
  - 若 JSON 枝条提供 `minCutDiameter`，还会执行最小可剪枝径保护。
- **更换标签**：标注对象整体替换，旧剪口坐标和标记会一起清除。
- **疏除父枝**：若存在后代枝，会弹出确认并把全部后代一并标为疏除。
- **撤销/重做**：`Ctrl/Cmd + Z`、`Ctrl/Cmd + Shift + Z` 或 `Ctrl + Y`。刚打完短截/回缩标签后的第一次剪口拖动会与该标签合并为一次撤销，因此一次撤销即可回到改标签之前。
- **同步视图**：左侧虚拟枝条清单、三维颜色/剪口、右侧属性和正视树形预览共用同一个 Solid 状态源。

## 导出

### CSV

点击“导出 CSV”，生成带 UTF-8 BOM 的表格，Excel 可直接打开。主要字段：

- `branch_id`, `parent_id`
- `label_code`, `label_zh`
- `has_cut`
- `cut_t_0_base_to_1_tip`
- `cut_x_m`, `cut_y_m`, `cut_z_m`
- `snapped_bud_id`, `cut_diameter_mm`
- 起止点、长度、枝径、角度、芽数等骨架属性

### GLB

点击“导出 GLB”，PlayCanvas `GltfExporter` 会导出名为 `pruning-annotated-tree` 的节点：

- `merged-branch-skeleton`：按处理标签写入 `COLOR_0` 的合并枝条网格。
- `cut-markers`：所有剪口位置的黄色套环。

GLB 使用米制坐标，可直接交给科研人员或在 Blender、three.js、glTF Viewer 中查看。

## JSON 格式

最低要求是枝条数组，或包含 `branches` / `items` / `data` / `skeleton` 的对象。字段名兼容常见英文、下划线和中文键名。

```json
{
  "unit": "m",
  "upAxis": "y",
  "branches": [
    {
      "id": "B0001",
      "parentId": "B0000",
      "start": [0, 1.2, 0],
      "end": [0.2, 1.8, 0.1],
      "diameter": 0.042,
      "tipDiameter": 0.016,
      "length": 0.72,
      "angle": 48,
      "buds": [{ "id": "bud-3", "t": 0.62 }]
    }
  ]
}
```

说明：

- `unit` 支持 `m`、`cm`、`mm`；未声明时使用工具栏中的导入单位。
- `upAxis` 为 `z` 时会自动转换为 PlayCanvas/glTF 使用的 Y-up。
- `start` / `end` 支持数组、`{x,y,z}` 对象以及 `startX/startY/startZ` 等扁平字段。
- `diameter` 按导入单位换算；键名包含 `mm` 时按毫米处理。
- `buds[].t` 是从基部 `0` 到梢端 `1` 的归一化位置；也支持三维坐标或沿枝长度。
- 找不到父 ID 的枝条会按根枝显示并产生导入警告。

## 性能设计

- 所有枝条合并为单个带顶点色的索引网格，数千枝只有一个枝条主 Draw Call。
- 点选不使用物理射线组件，而是对扁平 `Float32Array` 端点/方向/半径做射线—线段最近距离计算；3,300 枝的单次拾取在常规桌面浏览器约 0.2 ms（Headless SwiftShader 环境实测）。
- 悬停拾取通过 `requestAnimationFrame` 合并，每帧最多一次。
- 左侧树使用固定行高虚拟滚动，只渲染可见行。
- 右侧树形预览使用 Canvas 2D 按颜色批量绘制 Path2D。

## 目录

```text
src/
  App.tsx                    # 布局、快捷键、导入/导出编排
  main.tsx
  types.ts                   # 枝条、标签、剪口类型与颜色
  data/sampleTree.ts         # 确定性数千枝示例树
  lib/
    math.ts                  # 向量、锥度、剪口约束等
    parseSkeleton.ts         # 宽松 JSON schema 解析与单位/轴向归一化
    exportFiles.ts           # CSV 与浏览器下载
  state/store.ts             # Solid 全局状态、级联疏除、撤销历史
  three/
    TreeViewer.ts            # PlayCanvas 场景、轨道相机、拾取、拖剪口、GLB
    geometry.ts              # 合并枝/剪口/地面/网格纹理构造
  components/
    Toolbar.tsx
    BranchList.tsx
    PropertyPanel.tsx
    TreePreview.tsx
examples/sample-fruit-tree.json
```
