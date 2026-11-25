const STEPS = [
  ['1. 导入音频清单', '把音频组给的环境音、音效、3D 信标清单放入 audio-manifest.json；时间轴只引用 assetId 和交付文件路径。'],
  ['2. 建立双轨', '每个提示物生成一条音频片段和一条视觉片段，两条轨道共享秒级时间坐标。'],
  ['3. 双向联动起落点', '拖动提示音起点/终点，高亮块同步移动；拖动闪烁块边缘，音频包络也同步改变。'],
  ['4. 对齐起音/亮起、衰减/熄灭', '内部锚点可微调；偏差超过 35ms 标红，点击偏差徽章可让画面对齐声音，或在检查器选择反向对齐。'],
  ['5. 编组与整体拖动', 'Ctrl/Shift 多选提示点后编组；拖动编组条，组内所有片段和关键帧保持相对时间整体移动。'],
  ['6. 缓动重排关键帧', '关键帧保存曲线 U 坐标；切换缓动后，已排关键帧按新曲线重新计算时间位置。'],
  ['7. 框选循环验收', '选择“框选循环”，在空白时间格拖一段；播放头会在区间内循环，Pixi 高亮和 WebAudio 包络同步回放。'],
  ['8. 交付音/画/触发条件', '导出 JSON，音频组拿到素材、声像、包络和声音信标；UI 组拿到目标、闪烁关键帧、缓动和字幕。'],
];

const CHECKLIST = [
  '第5个门高亮太短，听障玩家没看到',
  '亮起提前 0.50s：11.00s → 10.50s',
  '熄灭延后 0.50s：12.20s → 12.70s',
  '衰减/熄灭锚点对齐，切换更舒展的缓出曲线',
  '波纹顺移后面 C06–C08 的关键帧',
  '在 10.25–13.15s 区间循环，确认音画同步',
];

export function GuidePanel({ onRunAcceptance }: { onRunAcceptance: () => void }) {
  return (
    <div className="guide-panel">
      <section className="inspector-section acceptance-card">
        <h4>听障反馈验收剧本</h4>
        <p>复现“第5个门高亮太短”的反馈。按钮会修改真实工程并启动循环预览，不是静态演示。</p>
        <button type="button" className="primary-btn wide" onClick={onRunAcceptance}>
          一键应用：第5门提前/延后并循环回放
        </button>
        <ul>
          {CHECKLIST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="inspector-section">
        <h4>一步步搭建说明</h4>
        <ol className="steps-list">
          {STEPS.map(([title, body]) => (
            <li key={title}>
              <strong>{title}</strong>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
