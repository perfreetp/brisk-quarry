import { PIPE_CATALOG } from '../lib/pipes.js'

export default function SelectionInspector({ network, selection, dispatch }) {
  if (!selection) {
    return (
      <div className="inspector">
        <h3>对象属性</h3>
        <p className="tip">在图上点选支管或主管段，查看参数并进行手动调整。</p>
      </div>
    )
  }

  if (selection.kind === 'lateral') {
    const lat = network.laterals.find((l) => l.id === selection.id)
    if (!lat) return null
    const h = lat.hydraulic
    return (
      <div className="inspector">
        <h3>支管 {lat.id}</h3>
        <table className="kv">
          <tbody>
            <tr><td>当前位置 x</td><td>{lat.x} m {lat.manualX && <em className="tag">手动</em>}</td></tr>
            <tr><td>名义位置 x</td><td>{lat.baseX} m（苗床{lat.bedIndex + 1}中心 {lat.bedCenterX}m）</td></tr>
            <tr><td>滴头间距</td><td>{lat.emitterSpacing} m {lat.manualSpacing && <em className="tag">手动</em>}</td></tr>
            <tr><td>滴头 / 喷头数</td><td>{lat.emitters.length} / {lat.sprinklers.length}</td></tr>
            <tr><td>入流流量</td><td>{h.totalLh} L/h</td></tr>
            <tr><td>入口压力</td><td>{(lat.inletPressure * 1000).toFixed(0)} kPa</td></tr>
            <tr><td>末端压力</td><td>{(lat.endPressure * 1000).toFixed(0)} kPa</td></tr>
            <tr className={h.overDrop ? 'row-warn' : ''}>
              <td>沿程压降</td>
              <td>{(h.loss * 1000).toFixed(1)} kPa（允许 {(network.params.allowableDpLateral * 1000).toFixed(0)}kPa）</td>
            </tr>
            <tr><td>入口流速</td><td>{h.inletVelocity} m/s</td></tr>
            <tr className={lat.crossesAisle ? 'row-error' : ''}>
              <td>作业道检查</td>
              <td>{lat.crossesAisle ? '✗ 穿过作业道（红框）' : '✔ 在苗床范围内'}</td>
            </tr>
          </tbody>
        </table>
        <div className="inspector-actions">
          <button className="btn" disabled={!lat.manualX} onClick={() => dispatch({ type: 'RESET_LATERAL', id: lat.id })}>
            恢复自动位置
          </button>
          <button
            className="btn"
            disabled={!lat.manualSpacing}
            onClick={() => dispatch({ type: 'SET_LATERAL_SPACING', id: lat.id, spacing: network.params.emitterSpacing })}
          >
            恢复默认间距
          </button>
        </div>
        <p className="tip">拖三通圆点移动位置、拖首个滴头改间距；手动调整只作用于本支管，重算时保留。</p>
      </div>
    )
  }

  const seg = network.segments.find((s) => s.key === selection.id)
  if (!seg) return null
  return (
    <div className="inspector">
      <h3>主管段 {seg.key}</h3>
      <table className="kv">
        <tbody>
          <tr><td>桩号范围</td><td>{seg.x1} ~ {seg.x2} m（长 {seg.length}m）</td></tr>
          <tr><td>下游接出</td><td>{seg.lateralId || '棚尾段'}</td></tr>
          <tr><td>通过流量</td><td>{(seg.flowLps * 3600).toFixed(0)} L/h</td></tr>
          <tr><td>当前管径</td><td>DN{seg.dn}（内径 {seg.innerDiam}mm）{seg.manualDn && <em className="tag">手动</em>}</td></tr>
          <tr className={seg.overDrop ? 'row-warn' : ''}>
            <td>分段压降</td>
            <td>{(seg.loss * 1000).toFixed(1)} kPa（允许 {(network.params.allowableDpMain * 1000).toFixed(0)}kPa）</td>
          </tr>
          <tr className={seg.overVelocity ? 'row-warn' : ''}>
            <td>流速</td><td>{seg.velocity} m/s（上限 {network.params.maxVelocity}）</td></tr>
          {seg.overDrop && (
            <tr className="row-warn">
              <td>处置建议</td>
              <td>加粗到 DN{PIPE_CATALOG[seg.recommendDnIndex].dn}，或把该段缩短到 {seg.maxLengthForAllow}m 以内</td>
            </tr>
          )}
        </tbody>
      </table>
      {!network.params.autoMainDn && (
        <label className="field">
          <span className="field-label">手动改本段管径</span>
          <span className="field-input">
            <select
              value={seg.dnIndex}
              onChange={(e) =>
                dispatch({
                  type: 'SET_SEGMENT_DN',
                  segKey: seg.key,
                  dnIndex: Number(e.target.value)
                })
              }
            >
              {PIPE_CATALOG.map((c, i) => (
                <option key={c.key} value={i}>
                  {c.label}
                </option>
              ))}
            </select>
          </span>
        </label>
      )}
      <div className="inspector-actions">
        <button
          className="btn"
          disabled={!seg.manualDn}
          onClick={() => dispatch({ type: 'CLEAR_SEGMENT_DN', segKey: seg.key })}
        >
          恢复全局管径
        </button>
      </div>
      <p className="tip">改任一段管径后，下游各段流量不变、沿程压力自动重算；自动模式下由系统按压降逐段选径。</p>
    </div>
  )
}
