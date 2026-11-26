import { PIPE_CATALOG, LATERAL_DN_OPTIONS } from '../lib/pipes.js'

function NumberField({ label, value, step = 1, min, max, unit, onChange }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v)) onChange(v)
          }}
        />
        {unit && <em>{unit}</em>}
      </span>
    </label>
  )
}

function Section({ title, children }) {
  return (
    <section className="panel-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

export default function ControlPanel({ state, network, dispatch }) {
  const p = state.params
  const set = (key, value) => dispatch({ type: 'SET_PARAM', key, value })

  return (
    <div className="control-panel">
      <Section title="种子（决定整套排布）">
        <label className="field">
          <span className="field-label">管网种子</span>
          <span className="field-input">
            <input
              type="text"
              value={p.seed}
              onChange={(e) => dispatch({ type: 'SET_SEED', value: e.target.value })}
            />
          </span>
        </label>
        <div className="seed-row">
          <button
            className="btn"
            onClick={() =>
              dispatch({ type: 'SET_SEED', value: `GH-${Math.floor(Math.random() * 1e6)}` })
            }
          >
            换一个种子
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'REGENERATE' })}>
            同参数重新生成
          </button>
        </div>
        <p className="tip">同种子＋同参数 → 支管与滴头排布逐点一致。</p>
      </Section>

      <Section title="棚体与首部">
        <NumberField label="棚宽（主管长）" value={p.houseWidth} unit="m" min={10} max={300} onChange={(v) => set('houseWidth', v)} />
        <NumberField label="棚长（支管长）" value={p.houseLength} unit="m" min={10} max={300} onChange={(v) => set('houseLength', v)} />
        <NumberField label="主管距侧墙" value={p.mainOffset} step={0.5} unit="m" min={1} onChange={(v) => set('mainOffset', v)} />
        <NumberField label="放线扰动幅度" value={p.mainJitter} step={0.05} unit="m" min={0} onChange={(v) => set('mainJitter', v)} />
      </Section>

      <Section title="主管（首部 → 棚尾）">
        <label className="field">
          <span className="field-label">主管管径</span>
          <span className="field-input">
            <select
              value={p.mainDn}
              disabled={p.autoMainDn}
              onChange={(e) => set('mainDn', Number(e.target.value))}
            >
              {PIPE_CATALOG.map((c) => (
                <option key={c.key} value={c.dn}>
                  {c.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={p.autoMainDn}
            onChange={(e) => set('autoMainDn', e.target.checked)}
          />
          <span>自动按压降分段选管径（改上游后下游自动重算）</span>
        </label>
      </Section>

      <Section title="支管与苗床">
        <NumberField label="支管间距" value={p.lateralSpacing} step={0.1} unit="m" min={1} onChange={(v) => set('lateralSpacing', v)} />
        <NumberField label="苗床宽度" value={p.bedWidth} step={0.1} unit="m" min={0.5} onChange={(v) => set('bedWidth', v)} />
        <label className="field">
          <span className="field-label">支管管径</span>
          <span className="field-input">
            <select value={p.lateralDn} onChange={(e) => set('lateralDn', Number(e.target.value))}>
              {LATERAL_DN_OPTIONS.map((dn) => (
                <option key={dn} value={dn}>
                  DN{dn}
                </option>
              ))}
            </select>
          </span>
        </label>
      </Section>

      <Section title="滴头">
        <NumberField label="滴头间距" value={p.emitterSpacing} step={0.05} unit="m" min={0.1} onChange={(v) => set('emitterSpacing', v)} />
        <NumberField label="单滴头流量" value={p.emitterFlow} step={0.1} unit="L/h" min={0.1} onChange={(v) => set('emitterFlow', v)} />
        <NumberField label="首端留白" value={p.emitterStartMargin} step={0.05} unit="m" min={0} onChange={(v) => set('emitterStartMargin', v)} />
      </Section>

      <Section title="喷头区段">
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={p.sprinklerEnabled}
            onChange={(e) => set('sprinklerEnabled', e.target.checked)}
          />
          <span>启用喷头区段（支管末端换喷头）</span>
        </label>
        <NumberField label="喷头区段起点" value={p.sprinklerStart} step={0.5} unit="m" min={1} onChange={(v) => set('sprinklerStart', v)} />
        <NumberField label="喷头射程" value={p.sprinklerThrow} step={0.1} unit="m" min={0.5} onChange={(v) => set('sprinklerThrow', v)} />
        <NumberField label="单喷头流量" value={p.sprinklerFlow} step={1} unit="L/h" min={1} onChange={(v) => set('sprinklerFlow', v)} />
      </Section>

      <Section title="水力条件">
        <NumberField label="水源出口压力" value={p.sourcePressure} step={0.01} unit="MPa" min={0.05} onChange={(v) => set('sourcePressure', v)} />
        <NumberField label="主管单段允许压降" value={p.allowableDpMain} step={0.005} unit="MPa" min={0.005} onChange={(v) => set('allowableDpMain', v)} />
        <NumberField label="支管允许压降" value={p.allowableDpLateral} step={0.005} unit="MPa" min={0.005} onChange={(v) => set('allowableDpLateral', v)} />
        <NumberField label="流速上限" value={p.maxVelocity} step={0.1} unit="m/s" min={0.3} onChange={(v) => set('maxVelocity', v)} />
      </Section>

      <button className="btn btn-danger" onClick={() => dispatch({ type: 'RESET_ALL_MANUAL' })}>
        清除全部手动调整
      </button>

      <div className="summary">
        <div>总流量：<b>{network.totalFlowLh} L/h</b>（{network.totalFlowLps} L/s）</div>
        <div>棚尾压力：<b>{(network.endPressure * 1000).toFixed(0)} kPa</b></div>
        <div>主管总损失：<b>{(network.totalLoss * 1000).toFixed(1)} kPa</b></div>
        <div>支管数：<b>{network.laterals.length}</b> 条</div>
      </div>
    </div>
  )
}
