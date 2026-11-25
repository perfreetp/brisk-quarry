# 双提示时间轴工作台

一套面向听障辅助场景的**视觉高亮 + 音频信标双提示时间轴**。使用 React 18、TypeScript、PixiJS 8 和 WebAudio 构建：策划/音频/UI 可以在同一条时间坐标上调整提示音、画面闪烁、同步偏差、编组、缓动关键帧和循环区间，并导出包含触发条件的交付 JSON。

## 启动

```powershell
npm install
npm run dev
```

打开终端输出的 `http://127.0.0.1:5173/`。

生产构建：

```powershell
npm run build
npm run preview
```

浏览器交互冒烟测试（需要本机安装 Chrome；会检查 Pixi 画布、第 5 门验收动作、交付 JSON 和片段拖动）：

```powershell
npm run build
npm run preview   # 另一个终端
npm run smoke
```

## 已实现的验收点

- **音频组清单导入**：`src/data/audio-manifest.json` 包含环境音、门音效、UI/信标素材、交付文件路径和合成预览参数。
- **双轨时间轴**：每个提示物在音频轨和视觉轨各有一块，两条轨道共享秒级时间坐标和缩放。
- **起落点双向联动**：拖动任意一条块的主体或左右边缘，另一条块使用同一个 `start/end`，不存在两套会漂移的时间。
- **起音/衰减 ↔ 亮起/熄灭**：
  - 音频内部锚点：起音峰 `start + audio.attack`、衰减起点 `end - audio.decay`。
  - 视觉内部锚点：全亮 `start + visual.rise`、熄灭起点 `end - visual.fade`。
  - 偏差超过 35ms 时在轨道连接处显示红色 `Δ` 徽章；检查器可执行“画→音 / 音→画”对齐。
- **编组**：`Ctrl/Shift` 多选后可编组；拖动编组条会整体平移组内所有提示点和关键帧。
- **拖动即最终结果**：Pointer Events 直接修改唯一工程状态，Pixi、时间轴、检查器和回放都读取同一状态；没有“拖动幽灵位置 + 松手二次换算”。
- **缓动重排关键帧**：关键帧保存基础曲线坐标 `u`。切换缓动时按 `time = start + ease(newCurve, u) × duration` 重算已有关键帧。
- **框选循环回放**：选择“框选循环”后在空白时间区拖出区间；播放头在区间内循环，Pixi 高亮、字幕和 WebAudio 合成提示音同步触发。
- **交付 JSON**：“交付”页可复制/下载 `dual-cue-timeline-handoff.json`，其中包含：
  - 每个提示点的共享时间、音频包络、视觉关键帧和缓动；
  - 同步偏差检查；
  - 触发事件与前置条件；
  - 给音频组的素材、声像、声音信标说明；
  - 给 UI 组的目标节点、闪烁参数、字幕和无障碍要求。
- **第 5 个门复测剧本**：点击右上角或“步骤”页中的“听障验收：修复第5门”，会自动：
  1. 将亮起从 `11.00s` 提前到 `10.50s`；
  2. 将熄灭从 `12.20s` 延后到 `12.70s`；
  3. 对齐起音峰/全亮、衰减/熄灭；
  4. 切换为 `easeOutCubic` 并重排 C05 关键帧；
  5. 在波纹模式下把后面的 C06–C08 顺移 `+0.50s`；
  6. 设置 `10.25–13.15s` 循环并开始音画回放。

## 一步步搭建思路

1. **先定唯一时间模型**：所有位置都由秒和 `pxPerSecond` 计算，避免音频轨和视觉轨各自保存像素。
2. **导入音频清单**：清单只描述素材和交付路径；在真实 `.ogg/.wav` 到位前，`AudioEngine` 用 WebAudio 合成门轴、噪声、chime/beacon 和环境底噪，保证工作台可交互。
3. **建立提示点工程**：`Cue` 同时持有 `audio`、`visual`、`trigger`，并使用共享 `start/end` 保证起落点联动。
4. **画 React 时间轴**：标尺、编组轨、音频轨、视觉轨、循环区、播放头和偏差层全部按同一时间比例尺绝对定位。
5. **接入 Pointer Events**：片段、边缘、关键帧、同步锚点、编组条和循环区间分别有显式 drag state；移动时基于起始值 + 像素增量计算，避免增量累积误差。
6. **接入 PixiJS**：React 只负责挂载 `Application` 和传 ref；Pixi ticker 每帧从 `transport.time` 与 `projectRef` 采样关键帧强度，绘制门、高亮边框、扩散闪烁带和信标菱形。
7. **接入回放和音频**：`Transport` 用 `requestAnimationFrame` 推进时间并处理循环；React 订阅帧事件，在播放头跨过 `cue.start` 时触发 WebAudio 包络。
8. **标记并消除同步偏差**：纯函数 `getDeviations()` 输出音画锚点差值，时间轴和检查器都消费同一结果。
9. **支持编组和波纹**：编组保存 cue id；移动时对每个成员调用同一个 `shiftCue()`。波纹边缘拖动保存后续片段初始快照，移动中直接应用总位移，因此预览和松手一致。
10. **生成交付物**：`buildHandoff()` 输出音频组视图、UI 组视图和完整机器可读 JSON。

## 关键目录

```text
src/
  App.tsx                     # 状态、Transport、音频触发、整体布局
  types.ts                    # Cue / Group / Loop / AudioAsset 等模型
  data/
    audio-manifest.json       # 音频组环境音与音效清单
    initialProject.ts         # 8 个示例提示点和两个编组
    targets.ts                # Pixi 场景中的门/终端/舱门坐标
  timeline/Timeline.tsx       # React 双轨时间轴和全部拖动
  pixi/StageCanvas.tsx        # PixiJS 场景与高亮闪烁
  audio/AudioEngine.ts         # WebAudio 合成预览与包络
  transport/Transport.ts     # rAF 播放头和循环
  lib/easing.ts               # 缓动、反解、关键帧重排和强度采样
  lib/projectOps.ts           # 拖动、编组、偏差、波纹、交付 JSON
  panels/                     # 检查器、音频清单、交付页、步骤页
scripts/smoke.mjs             # Puppeteer Core 浏览器冒烟测试
```

## 说明

- 清单中的 `audio/cues/*.ogg` 是交给音频组放置/替换的交付路径。当前没有二进制音频素材时，浏览器预览使用合成声音，不会因为 404 导致时间轴失效。
- 闪烁频率在交付 JSON 中标注 `maxFlashHz: 3`，避免光敏风险；实际评审时仍应结合无障碍标准验证。
- 快捷键：`Space` 播放/暂停，`L` 开关循环；拖动时按住 `Alt` 可临时关闭吸附，`Ctrl/Shift + 点击` 可多选提示点。
