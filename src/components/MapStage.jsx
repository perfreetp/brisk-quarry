import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import * as fabric from 'fabric';
import {
  WORLD_H,
  WORLD_W,
  addAerator,
  addFeedPoint,
  addPondFromRect,
  addPowerPoint,
  clearSelection,
  connectPipe,
  deleteAerator,
  deleteCage,
  deleteFeedPoint,
  deletePipe,
  deletePond,
  selectObject,
  setTool,
  saveRoute,
  state,
  updateAerator,
  updateFeedPoint,
  updatePowerPoint,
} from '../store.js';
import { ensureBasemapReady, renderScene } from '../mapScene.js';

export default function MapStage(props) {
  let hostRef;
  let canvasEl;
  let canvas = null;
  let resizeObserver = null;
  let disposed = false;
  let draftRect = null;
  let draftStart = null;
  let routePoints = [];
  let routeObjects = [];
  let pipeAeratorId = null;
  let pipeDraftLine = null;
  const [basemapTick, setBasemapTick] = createSignal(0);
  const [ready, setReady] = createSignal(false);
  const [dropError, setDropError] = createSignal('');

  const interactive = () => !props.readonly;

  function fitCanvas() {
    if (!canvas || !hostRef) return;
    const width = hostRef.clientWidth;
    const height = hostRef.clientHeight;
    if (!width || !height) return;
    canvas.setDimensions({ width, height });
    const zoom = Math.min(width / WORLD_W, height / WORLD_H);
    canvas.setViewportTransform([zoom, 0, 0, zoom, (width - zoom * WORLD_W) / 2, (height - zoom * WORLD_H) / 2]);
    canvas.requestRenderAll();
  }

  function nativePoint(event) {
    try {
      if (canvas.getScenePoint) return canvas.getScenePoint(event);
    } catch (err) {
      console.warn('scene point fallback', err);
    }
    const rect = canvas.upperCanvasEl.getBoundingClientRect();
    const v = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    const cssX = event.clientX - rect.left;
    const cssY = event.clientY - rect.top;
    const widthScale = canvas.getWidth() / rect.width;
    const heightScale = canvas.getHeight() / rect.height;
    const x = (cssX * widthScale - v[4]) / v[0];
    const y = (cssY * heightScale - v[5]) / v[3];
    return { x, y };
  }

  function eventPoint(opt) {
    return opt.scenePoint || nativePoint(opt.e);
  }

  function clearRouteDraftVisual() {
    if (!canvas) return;
    routeObjects.forEach((obj) => canvas.remove(obj));
    if (pipeDraftLine) canvas.remove(pipeDraftLine);
    routeObjects = [];
    routePoints = [];
    pipeDraftLine = null;
  }

  function finishRouteDraft() {
    if (routePoints.length >= 2) {
      const points = routePoints.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
      saveRoute(points);
    }
    clearRouteDraftVisual();
    setTool('select');
  }

  function updateRouteDraft() {
    routeObjects.forEach((obj) => canvas.remove(obj));
    routeObjects = [];
    routePoints.forEach((p, index) => {
      routeObjects.push(new fabric.Circle({
        left: p.x,
        top: p.y,
        radius: index === 0 ? 7 : 5,
        originX: 'center',
        originY: 'center',
        fill: index === 0 ? '#0f766e' : '#14b8a6',
        stroke: '#fff',
        strokeWidth: 2,
        selectable: false,
        evented: false,
      }));
    });
    if (routePoints.length > 1) {
      routeObjects.push(new fabric.Polyline(routePoints.map((p) => ({ x: p.x, y: p.y })), {
        originX: 'center',
        originY: 'center',
        stroke: '#0d9488',
        strokeWidth: 4,
        strokeDashArray: [12, 7],
        fill: 'transparent',
        selectable: false,
        evented: false,
      }));
    }
    routeObjects.forEach((o) => canvas.add(o));
    canvas.requestRenderAll();
  }

  function nearestPower(point) {
    let best = null;
    let bestDistance = 36;
    state.project.powerPoints.forEach((p) => {
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d < bestDistance) {
        best = p;
        bestDistance = d;
      }
    });
    return best;
  }

  function nearestAerator(point) {
    let best = null;
    let bestDistance = 34;
    state.project.aerators.forEach((a) => {
      const d = Math.hypot(a.x - point.x, a.y - point.y);
      if (d < bestDistance) {
        best = a;
        bestDistance = d;
      }
    });
    return best;
  }

  function bindCanvasEvents() {
    canvas.on('mouse:down', (opt) => {
      if (!interactive()) return;
      const tool = state.ui.tool;
      const point = eventPoint(opt);

      if (tool === 'draw-pond') {
        draftStart = point;
        draftRect = new fabric.Rect({
          left: point.x,
          top: point.y,
          width: 1,
          height: 1,
          fill: 'rgba(37,99,235,.18)',
          stroke: '#1d4ed8',
          strokeWidth: 2,
          strokeDashArray: [8, 5],
          selectable: false,
          evented: false,
        });
        canvas.add(draftRect);
        return;
      }

      if (tool === 'route') {
        routePoints.push(point);
        updateRouteDraft();
        return;
      }

      if (tool === 'feed-point') {
        addFeedPoint(point.x, point.y);
        return;
      }

      if (tool === 'power') {
        addPowerPoint(point.x, point.y);
        setTool('select');
        return;
      }

      if (tool === 'pipe') {
        if (!pipeAeratorId) {
          const aerator = opt.target?.kind === 'aerator'
            ? state.project.aerators.find((a) => a.id === opt.target.refId)
            : nearestAerator(point);
          if (aerator) {
            pipeAeratorId = aerator.id;
            setDropError(`已选 ${aerator.code}，请点击红色电源点`);
          } else {
            setDropError('请先点击一台增氧机');
          }
        } else {
          const power = opt.target?.kind === 'power'
            ? state.project.powerPoints.find((p) => p.id === opt.target.refId)
            : nearestPower(point);
          if (power) {
            connectPipe(pipeAeratorId, power.id);
            pipeAeratorId = null;
            setDropError('');
            setTool('select');
          } else {
            setDropError('请点中 36 图纸单位内的电源点标记');
          }
        }
        return;
      }

      if (opt.target?.kind && opt.target.refId) {
        selectObject(opt.target.kind, opt.target.refId);
      } else {
        clearSelection();
      }
    });

    canvas.on('mouse:move', (opt) => {
      const point = eventPoint(opt);
      if (draftRect && draftStart) {
        draftRect.set({
          left: Math.min(draftStart.x, point.x),
          top: Math.min(draftStart.y, point.y),
          width: Math.abs(point.x - draftStart.x),
          height: Math.abs(point.y - draftStart.y),
        });
        canvas.requestRenderAll();
      }
      if (state.ui.tool === 'pipe' && pipeAeratorId) {
        const aerator = state.project.aerators.find((a) => a.id === pipeAeratorId);
        if (aerator) {
          if (pipeDraftLine) canvas.remove(pipeDraftLine);
          const power = nearestPower(point);
          const end = power || point;
          const raw = [
            { x: aerator.x, y: aerator.y },
            { x: aerator.x, y: 415 },
            { x: end.x, y: 415 },
            { x: end.x, y: end.y },
          ];
          const xs = raw.map((p) => p.x);
          const ys = raw.map((p) => p.y);
          const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
          const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
          pipeDraftLine = new fabric.Polyline(raw.map((p) => ({ x: p.x - cx, y: p.y - cy })), {
            left: cx,
            top: cy,
            originX: 'center',
            originY: 'center',
            stroke: '#0f766e',
            strokeWidth: 3,
            strokeDashArray: [10, 6],
            fill: 'transparent',
            selectable: false,
            evented: false,
          });
          canvas.add(pipeDraftLine);
        }
      }
    });

    canvas.on('mouse:up', (opt) => {
      if (draftRect && draftStart && state.ui.tool === 'draw-pond') {
        const point = eventPoint(opt);
        const x = Math.min(draftStart.x, point.x);
        const y = Math.min(draftStart.y, point.y);
        const w = Math.abs(point.x - draftStart.x);
        const h = Math.abs(point.y - draftStart.y);
        canvas.remove(draftRect);
        draftRect = null;
        draftStart = null;
        if (w > 18 && h > 18) addPondFromRect({ x, y, w, h });
        else setTool('select');
      }
    });

    canvas.on('mouse:dblclick', () => {
      if (state.ui.tool === 'route') {
        if (routePoints.length >= 2) {
          const last = routePoints[routePoints.length - 1];
          const prev = routePoints[routePoints.length - 2];
          if (last && prev && Math.hypot(last.x - prev.x, last.y - prev.y) < 8) routePoints.pop();
        }
        finishRouteDraft();
      }
    });

    const syncSelection = () => {
      const obj = canvas.getActiveObject();
      if (obj?.kind && obj.refId) selectObject(obj.kind, obj.refId);
    };
    canvas.on('selection:created', syncSelection);
    canvas.on('selection:updated', syncSelection);
    canvas.on('selection:cleared', () => {
      if (!canvas.getActiveObject()) clearSelection();
    });

    canvas.on('object:modified', (opt) => {
      const obj = opt.target;
      if (!obj?.kind || !obj.refId) return;
      const center = obj.getCenterPoint ? obj.getCenterPoint() : { x: obj.left, y: obj.top };
      const x = Math.round(center.x);
      const y = Math.round(center.y);
      if (obj.kind === 'aerator') updateAerator(obj.refId, { x, y });
      if (obj.kind === 'power') updatePowerPoint(obj.refId, { x, y });
      if (obj.kind === 'feedPoint') updateFeedPoint(obj.refId, { x, y });
    });
  }

  function onKeyDown(event) {
    if (!interactive()) return;
    const target = event.target;
    const tag = target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
    if (event.key === 'Escape') {
      clearRouteDraftVisual();
      pipeAeratorId = null;
      setDropError('');
      setTool('select');
    }
    if (event.key === 'Enter' && state.ui.tool === 'route') finishRouteDraft();
    if ((event.key === 'Delete' || event.key === 'Backspace') && state.ui.selectedId) {
      event.preventDefault();
      const { selectedKind, selectedId } = state.ui;
      if (selectedKind === 'pond') deletePond(selectedId);
      if (selectedKind === 'cage') deleteCage(selectedId);
      if (selectedKind === 'aerator') deleteAerator(selectedId);
      if (selectedKind === 'pipe') deletePipe(selectedId);
      if (selectedKind === 'feedPoint') deleteFeedPoint(selectedId);
    }
  }

  onMount(() => {
    canvas = new fabric.Canvas(canvasEl, {
      width: hostRef.clientWidth || 800,
      height: hostRef.clientHeight || 500,
      backgroundColor: '#e8eef2',
      selection: false,
      preserveObjectStacking: true,
      enableRetinaScaling: true,
      fireRightClick: false,
    });
    fitCanvas();
    bindCanvasEvents();
    window.addEventListener('keydown', onKeyDown);
    resizeObserver = new ResizeObserver(() => fitCanvas());
    resizeObserver.observe(hostRef);
    ensureBasemapReady(state.project, () => {
      if (!disposed) setBasemapTick((v) => v + 1);
    });
    setReady(true);
  });

  createEffect(() => {
    if (!ready()) return;
    basemapTick();
    renderScene(canvas, state.project, props.mode, {
      interactive: interactive(),
      selectedId: state.ui.selectedId,
      tool: state.ui.tool,
    });
    fitCanvas();
  });

  createEffect(() => {
    const tool = state.ui.tool;
    if (tool !== 'route' && routeObjects.length) clearRouteDraftVisual();
    if (tool !== 'pipe') {
      pipeAeratorId = null;
      if (pipeDraftLine && canvas) canvas.remove(pipeDraftLine);
      pipeDraftLine = null;
    }
  });

  onCleanup(() => {
    disposed = true;
    window.removeEventListener('keydown', onKeyDown);
    resizeObserver?.disconnect();
    canvas?.dispose();
  });

  function handleDragOver(event) {
    if (props.readonly) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDrop(event) {
    if (props.readonly) return;
    event.preventDefault();
    const catalogId = event.dataTransfer.getData('text/aerator-model') || event.dataTransfer.getData('text/plain');
    if (!catalogId) return;
    if (state.ui.page !== 'aeration') return;
    const point = nativePoint(event);
    addAerator(catalogId, point.x, point.y);
  }

  const hint = () => {
    if (props.readonly) return '';
    if (state.ui.tool === 'draw-pond') return '在底图上按住拖出塘口，松开后在右侧核对台账数据';
    if (state.ui.tool === 'route') return '沿塘埂逐点单击；双击或按 Enter 完成，Esc 取消';
    if (state.ui.tool === 'feed-point') return '按投喂顺序单击堤埂/投喂点，右侧可改单次时长';
    if (state.ui.tool === 'power') return '单击放置电源点，拖动可调整位置，管路自动重算';
    if (state.ui.tool === 'pipe') return dropError() || '先点一台增氧机，再点红色电源点，生成正交管路';
    if (props.mode === 'aeration') return '从右侧厂商目录拖入增氧机；单击机器可改功率、水深和电源';
    if (props.mode === 'zone') return '可选择塘口/网箱并在右侧编辑；Delete 删除选中对象';
    return '选择投喂点后可改顺序、饲料和时长；Delete 删除';
  };

  return (
    <div class={`map-stage ${props.readonly ? 'is-readonly' : ''}`} ref={hostRef} onDragOver={handleDragOver} onDrop={handleDrop}>
      <canvas ref={canvasEl} />
      <Show when={hint()}>
        <div class={`map-hint ${state.ui.tool === 'pipe' && dropError() ? 'is-warning' : ''}`}>{hint()}</div>
      </Show>
      <Show when={!props.readonly && props.mode === 'aeration'}>
        <div class="drop-corner">可直接将目录卡片拖到塘里</div>
      </Show>
    </div>
  );
}
