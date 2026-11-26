import { useEffect, useRef } from 'react'
import paper from 'paper'

const COLORS = {
  bedFill: '#eef6e8',
  main: '#1f5f8b',
  mainWarn: '#d99a1f',
  lateral: '#3f7d3f',
  lateralWarn: '#c9822d',
  emitter: '#2e7d32',
  sprinkler: '#7b3fb5',
  pressure: '#444',
  red: '#d23b3b',
  source: '#b85c00'
}

const SCALE = 11 // 1m = 11px
const MARGIN = 44

export default function PaperCanvas({ network, selection, dispatch }) {
  const canvasRef = useRef(null)
  const scopeRef = useRef(null)
  const dataRef = useRef({ network, selection, dispatch })
  dataRef.current = { network, selection, dispatch }

  // 初始化 PaperScope 一次
  useEffect(() => {
    const scope = new paper.PaperScope()
    scope.setup(canvasRef.current)
    scopeRef.current = scope
    return () => scope.remove()
  }, [])

  // 数据变化 -> 重绘
  useEffect(() => {
    const scope = scopeRef.current
    if (!scope) return
    draw(scope)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, selection])

  function draw(scope) {
    const { network: net, selection: sel, dispatch: d } = dataRef.current
    const p = net.params
    scope.project.clear()

    const point = (x, y) =>
      new scope.Point(MARGIN + x * SCALE, MARGIN + y * SCALE)

    function text(content, x, y, opts = {}) {
      return new scope.PointText({
        point: point(x, y),
        content,
        fontSize: opts.size || 10,
        fillColor: new scope.Color(opts.color || '#333333'),
        fontFamily: "'Microsoft YaHei','PingFang SC',sans-serif",
        justification: opts.just || 'left',
        fontWeight: opts.bold ? 'bold' : 'normal',
        leading: opts.leading || 12
      })
    }

    const W = p.houseWidth * SCALE + MARGIN * 2
    const H = p.houseLength * SCALE + MARGIN * 2 + 40
    scope.view.viewSize = new scope.Size(W, H)

    // ---- 棚体 ----
    new scope.Path.Rectangle({
      from: point(0, 0),
      to: point(p.houseWidth, p.houseLength),
      fillColor: '#fbfbf7',
      strokeColor: '#999',
      strokeWidth: 1.2,
      hitTest: false
    })
    text('首部侧（水源 / 首部枢纽）', 0.3, -2.0, { size: 11, bold: true, color: '#555' })
    text('棚尾', p.houseWidth - 4, p.houseLength + 2.6, { size: 10, color: '#777' })

    // ---- 苗床（床间空隙即作业道，沿棚宽贯通）----
    // 与 network.js 同公式：床 i 中心线 = spacing*(i+0.5)
    for (let b = 0; b < net.laterals.length; b++) {
      const cx = p.lateralSpacing * (b + 0.5)
      const x1 = Math.max(0, cx - p.bedWidth / 2)
      const x2 = Math.min(p.houseWidth, cx + p.bedWidth / 2)
      if (x2 <= x1) continue
      new scope.Path.Rectangle({
        from: point(x1, p.mainOffset),
        to: point(x2, p.houseLength),
        fillColor: COLORS.bedFill,
        strokeColor: '#bcd7a8',
        strokeWidth: 0.8,
        hitTest: false
      })
      text(`苗床${b + 1}`, cx, p.mainOffset - 1.0, {
        size: 9,
        color: '#7a9a6a',
        just: 'center'
      })
    }

    // ---- 主管分段（超压降段标黄）----
    for (const seg of net.segments) {
      const selected = sel && sel.kind === 'segment' && sel.id === seg.key
      new scope.Path.Line({
        from: point(seg.x1, p.mainOffset),
        to: point(seg.x2, p.mainOffset),
        strokeColor: seg.overDrop ? COLORS.mainWarn : COLORS.main,
        strokeWidth: selected ? 8 : 5,
        strokeCap: 'round',
        data: { kind: 'segment', id: seg.key }
      })
    }

    // 水源首部
    new scope.Path.Circle({
      center: point(0, p.mainOffset),
      radius: 7,
      fillColor: COLORS.source
    })
    text('水源首部', 0.2, p.mainOffset + 2.4, {
      size: 10,
      bold: true,
      color: COLORS.source
    })

    // ---- 压力分段标注：每段末端；三层轮换避免文字重叠 ----
    net.pressureNodes.forEach((node, idx) => {
      new scope.Path.Line({
        from: point(node.x, p.mainOffset - 0.55),
        to: point(node.x, p.mainOffset + 0.55),
        strokeColor: COLORS.pressure,
        strokeWidth: 1,
        hitTest: false
      })
      const layer = idx % 3 // 0/1/2 三层
      const yTxt =
        layer === 0 ? p.mainOffset - 1.25 : layer === 1 ? p.mainOffset + 1.7 : p.mainOffset + 3.0
      const col = layer === 0 ? COLORS.pressure : layer === 1 ? '#7a6a3c' : '#6a7a55'
      text(
        `${node.label}\n${(node.pressure * 1000).toFixed(0)}kPa`,
        node.x,
        yTxt,
        { size: 8, color: col, just: 'center', leading: 9.5 }
      )
    })

    // ---- 支管 / 滴头 / 喷头 ----
    for (const lat of net.laterals) {
      const selected = sel && sel.kind === 'lateral' && sel.id === lat.id
      new scope.Path.Line({
        from: point(lat.x, p.mainOffset),
        to: point(lat.x, p.houseLength),
        strokeColor: lat.hydraulic.overDrop ? COLORS.lateralWarn : COLORS.lateral,
        strokeWidth: selected ? 3.6 : 2,
        data: { kind: 'lateral', id: lat.id }
      })

      // 三通（可拖拽：整条支管沿主管移动）
      new scope.Path.Circle({
        center: point(lat.x, p.mainOffset),
        radius: 3.4,
        fillColor: '#fff',
        strokeColor: COLORS.main,
        strokeWidth: 1.5,
        data: { kind: 'lateral-drag', id: lat.id }
      })

      // 滴头：第一个放大，可拖拽改本支管间距；其余点击也能选中支管
      lat.emitters.forEach((e, idx) => {
        new scope.Path.Circle({
          center: point(lat.x, e.y),
          radius: idx === 0 ? 3.6 : 2.2,
          fillColor: COLORS.emitter,
          data: idx === 0
            ? { kind: 'emitter-drag', id: lat.id }
            : { kind: 'emitter', id: lat.id }
        })
      })

      // 喷头：三角 + 射程虚线圆（点击喷头同样选中所属支管）
      lat.sprinklers.forEach((s) => {
        const ctr = point(lat.x, s.y)
        new scope.Path.Circle({
          center: ctr,
          radius: s.throw * SCALE,
          strokeColor: new scope.Color(COLORS.sprinkler),
          strokeWidth: 0.7,
          dashArray: [3, 3],
          fillColor: null,
          opacity: 0.55,
          hitTest: false
        })
        new scope.Path.RegularPolygon({
          center: ctr,
          sides: 3,
          radius: 4.5,
          fillColor: COLORS.sprinkler,
          data: { kind: 'lateral', id: lat.id }
        })
      })

      text(
        `${lat.id} 入${(lat.inletPressure * 1000).toFixed(0)}kPa${
          lat.manualX ? ' ✋' : ''
        }${lat.manualSpacing ? ' ✂' : ''}`,
        lat.x + 0.25,
        p.mainOffset + 5.0,
        { size: 8.5, color: '#356b35' }
      )

      // 穿作业道：红框 + 角标
      if (lat.crossesAisle) {
        const r1 = point(lat.x - 0.6, p.mainOffset - 0.9)
        const r2 = point(lat.x + 0.6, p.houseLength + 0.9)
        new scope.Path.Rectangle({
          from: r1,
          to: r2,
          strokeColor: COLORS.red,
          strokeWidth: 2,
          dashArray: [6, 4],
          fillColor: new scope.Color(1, 0.9, 0.9, 0.25),
          hitTest: false
        })
        const tagPt = point(lat.x, p.mainOffset - 3.4)
        const bgW = 0.95
        new scope.Path.Rectangle({
          from: new scope.Point(tagPt.x - bgW * SCALE * 0.5, tagPt.y - 11),
          to: new scope.Point(tagPt.x + bgW * SCALE * 0.5, tagPt.y + 2),
          fillColor: COLORS.red,
          radius: 3
        })
        text('穿道', lat.x, p.mainOffset - 3.4, {
          size: 8.5,
          color: '#fff',
          just: 'center',
          bold: true
        })
      }
    }

    // ---- 图例 ----
    const legendY = p.houseLength + 4.6
    const items = [
      ['主管', COLORS.main],
      ['超压降段(标黄)', COLORS.mainWarn],
      ['支管/毛管', COLORS.lateral],
      ['滴头', COLORS.emitter],
      ['喷头(虚线=射程)', COLORS.sprinkler],
      ['穿作业道红框', COLORS.red]
    ]
    let lx = 0
    for (const [name, color] of items) {
      new scope.Path.Line({
        from: point(lx, legendY),
        to: point(lx + 1.2, legendY),
        strokeColor: color,
        strokeWidth: 3
      })
      text(name, lx + 1.5, legendY + 0.35, { size: 9, color: '#555' })
      lx += name.length * 1.55 + 3.2
    }

    // ---- 交互事件：hitTest 带容差，避免细管/小点难以点中 ----
    let pressedHit = null

    function hitAt(pt) {
      if (!pt) return null
      const n0 = dataRef.current.network
      // 1) 可拖拽手柄优先：三通圆点、首个滴头（两者在图上挨得很近）
      const handles = scope.project.getItems({}).filter((it) => {
        const k = it.data && it.data.kind
        return k === 'lateral-drag' || k === 'emitter-drag'
      })
      let best = null
      let bestDist = Infinity
      for (const h of handles) {
        const reach = h.data.kind === 'lateral-drag' ? 11 : 9
        const dist = pt.getDistance(h.position)
        if (dist <= reach && dist < bestDist) {
          best = h
          bestDist = dist
        }
      }
      if (best) return { item: best }

      // 2) 主管段带状命中：沿主管线 ±0.7m 内点击归属主管段
      if (n0) {
        const mx = (pt.x - MARGIN) / SCALE
        const my = (pt.y - MARGIN) / SCALE
        if (Math.abs(my - n0.params.mainOffset) <= 0.7 && mx >= 0 && mx <= n0.params.houseWidth) {
          const seg =
            n0.segments.find((s) => mx >= s.x1 && mx <= s.x2) || n0.segments[0]
          if (seg) return { item: { data: { kind: 'segment', id: seg.key }, position: pt } }
        }
      }
      const native = scope.project.hitTest(pt, {
        tolerance: 7,
        stroke: true,
        fill: true,
        segments: false
      })
      if (native && native.item && native.item.data && native.item.data.kind) return native
      // 兜底：细支管线条的近距离点击（图上滴头密集时原生命中容易被挡）
      // 主管附近（±1.2m）不启用，避免抢走主管段点击
      const n = dataRef.current.network
      if (n) {
        const mx = (pt.x - MARGIN) / SCALE
        const my = (pt.y - MARGIN) / SCALE
        if (my >= n.params.mainOffset + 1.2 && my <= n.params.houseLength) {
          let near = null
          let nearD = Infinity
          for (const lat of n.laterals) {
            const d = Math.abs(lat.x - mx)
            if (d < nearD) {
              nearD = d
              near = lat
            }
          }
          // 0.45m 内吸附到最近支管
          if (near && nearD <= 0.45) {
            return { item: { data: { kind: 'lateral', id: near.id }, position: pt } }
          }
        }
      }
      return native
    }

    scope.view.on('mousedown', (event) => {
      const hit = hitAt(event.point)
      pressedHit = hit
      const data = hit && hit.item && hit.item.data
      if (!data || !data.kind) {
        d({ type: 'SELECT', selection: null })
        return
      }
      if (data.kind === 'segment') {
        d({ type: 'SELECT', selection: { kind: 'segment', id: data.id } })
      } else if (data.id) {
        // 支管本身、三通、滴头、喷头点击都归属到对应支管
        d({ type: 'SELECT', selection: { kind: 'lateral', id: data.id } })
      }
    })

    scope.view.on('mousedrag', (event) => {
      const hit = pressedHit || hitAt(event.downPoint)
      const data = hit && hit.item && hit.item.data
      if (!data || !data.kind) return
      const n = dataRef.current.network
      const mx = event.point.x
      const my = event.point.y

      if (data.kind === 'lateral-drag') {
        const xM = Math.min(
          n.params.houseWidth - 0.3,
          Math.max(0.3, (mx - MARGIN) / SCALE)
        )
        d({ type: 'MOVE_LATERAL', id: data.id, x: Number(xM.toFixed(2)) })
      } else if (data.kind === 'emitter-drag') {
        const yM =
          (my - MARGIN) / SCALE - n.params.mainOffset - n.params.emitterStartMargin
        const spacing = Math.min(2, Math.max(0.1, yM))
        d({
          type: 'SET_LATERAL_SPACING',
          id: data.id,
          spacing: Number(spacing.toFixed(2))
        })
      }
    })

    scope.view.on('mouseup', () => {
      pressedHit = null
    })

    scope.view.on('mousemove', (event) => {
      const hit = hitAt(event.point)
      const data = hit && hit.item && hit.item.data
      const draggable =
        data && (data.kind === 'lateral-drag' || data.kind === 'emitter-drag')
      scope.view.element.style.cursor = draggable ? 'grab' : data && data.kind ? 'pointer' : 'default'
    })
  }

  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} />
      <div className="canvas-hint">
        操作：拖三通圆点＝移动整条支管；拖支管上第一个（放大的）滴头＝仅改本支管滴头间距；点主管段可在右侧改管径
      </div>
    </div>
  )
}
