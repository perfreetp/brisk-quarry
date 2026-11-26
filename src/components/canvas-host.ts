import Two from 'two.js';
import type { BaseEntity, LabelState, Project, Vec } from '../types';
import {
  createCamera,
  fitCamera,
  screenToWorld,
  toScreen,
  type Camera
} from '../lib/geometry';
import { layoutLabels } from '../lib/label-layout';
import { store } from '../state/store';
import { clamp } from '../lib/util';
import { hitTest, type HitTarget } from '../lib/two-scene';

type ViewMode = 'plan' | 'section';
type ToolMode = 'select' | 'add-cable' | 'add-vent';

interface CanvasHostOptions {
  mode: ViewMode;
  compartmentFilter: () => string | null;
  build: (two: Two, cam: Camera, project: Project) => { hits: HitTarget[] };
  /** 自动避让使用的排版边界(世界坐标) */
  layoutBounds: (project: Project) => {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  /** 剖面模式下锚点取 section 语义 */
  anchorOf?: (e: BaseEntity) => Vec;
  labelKey: 'label' | 'sectionLabel';
}

const LABEL_RELAX_ITERS = 50;

/**
 * 通用图纸画布:Two.js SVG 渲染 + 指针交互。
 * 交互:左键拖符号/标注、空白平移、滚轮缩放、双击空白按当前工具新增、
 * 右键标注切换固定状态。所有几何修改经 store 持久化,符号与标注靠 id 绑定。
 */
export class CanvasHost {
  private two: Two;
  private cam: Camera;
  private container: HTMLElement;
  private opts: CanvasHostOptions;
  private hits: HitTarget[] = [];
  private resizeObserver: ResizeObserver;
  private tool: ToolMode = 'select';
  private drag:
    | {
        kind: 'pan' | 'entity' | 'label';
        pointerId: number;
        startScreen: Vec;
        camStart?: { offsetX: number; offsetY: number };
        entityId?: string;
        lastWorld?: Vec;
        moved: boolean;
        interactionBegun: boolean;
      }
    | null = null;
  private unsubscribe: () => void;
  private destroyed = false;

  constructor(container: HTMLElement, opts: CanvasHostOptions) {
    this.container = container;
    this.opts = opts;
    const rect = container.getBoundingClientRect();
    this.two = new Two({
      type: Two.Types.svg,
      width: Math.max(320, rect.width),
      height: Math.max(240, rect.height)
    }).appendTo(container);
    this.cam = createCamera(this.two.width, this.two.height);
    this.fit();

    this.unsubscribe = store.subscribe(() => this.render());
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.render();
  }

  setTool(tool: ToolMode): void {
    this.tool = tool;
    this.container.style.cursor =
      tool === 'select' ? 'default' : 'crosshair';
  }

  getTool(): ToolMode {
    return this.tool;
  }

  fit(): void {
    const p = store.state;
    fitCamera(this.cam, this.opts.layoutBounds(p));
    this.render();
  }

  zoom(factor: number): void {
    const cx = this.cam.width / 2;
    const cy = this.cam.height / 2;
    const before = screenToWorld(this.cam, { x: cx, y: cy });
    this.cam.scale = clamp(
      this.cam.scale * factor,
      2,
      400
    );
    this.cam.offsetX = cx - before.x * this.cam.scale;
    this.cam.offsetY = cy + before.y * this.cam.scale;
    this.render();
  }

  /** 整体让一遍:解除固定后重新自动避让(编号规则页"重排"也会调它) */
  relayoutAll(): void {
    const p = store.state;
    const filter = this.opts.compartmentFilter();
    const entities = [...p.cables, ...p.vents].filter(
      (e) => !filter || e.compartmentId === filter
    );
    for (const e of entities) e[this.opts.labelKey].pinned = false;
    this.runLayout(entities, 220);
  }

  /** 只对未固定标注再让一遍(不解除手动固定) */
  relayoutLoose(): void {
    const p = store.state;
    const filter = this.opts.compartmentFilter();
    const entities = [...p.cables, ...p.vents].filter(
      (e) => !filter || e.compartmentId === filter
    );
    this.runLayout(entities, LABEL_RELAX_ITERS);
  }

  private runLayout(entities: BaseEntity[], iterations: number): void {
    const p = store.state;
    layoutLabels(entities, this.opts.labelKey, {
      bounds: this.opts.layoutBounds(p),
      anchorOf: this.opts.anchorOf,
      defaultBox: { w: 1.7, h: 0.75 },
      boxOf: () => ({ w: 1.7, h: 0.75 }),
      iterations
    });
    store.notifySilently();
  }

  private handleResize(): void {
    const rect = this.container.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    this.two.width = rect.width;
    this.two.height = rect.height;
    this.two.renderer.setSize(rect.width, rect.height);
    this.cam.width = rect.width;
    this.cam.height = rect.height;
    this.render();
  }

  private render(): void {
    if (this.destroyed) return;
    const result = this.opts.build(this.two, this.cam, store.state);
    this.hits = result.hits;
  }

  private localPoint(ev: PointerEvent | WheelEvent | MouseEvent): Vec {
    const rect = this.container.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  private bindEvents(): void {
    const el = this.container;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('dblclick', this.onDblClick);
    el.addEventListener('contextmenu', this.onContextMenu);
  }

  private onContextMenu = (ev: MouseEvent): void => {
    const rect = this.container.getBoundingClientRect();
    const hit = hitTest(this.hits, ev.clientX - rect.left, ev.clientY - rect.top);
    if (hit?.part === 'label') {
      ev.preventDefault();
      const e = store.getEntity(hit.id);
      if (e) {
        const key = this.opts.labelKey;
        store.updateEntity(hit.id, () => {
          e[key].pinned = !e[key].pinned;
        });
      }
    }
  };

  private onDblClick = (ev: MouseEvent): void => {
    if (this.opts.mode !== 'plan' || this.tool === 'select') return;
    const sp = this.localPoint(ev);
    const wp = screenToWorld(this.cam, sp);
    const p = store.state;
    const filter = this.opts.compartmentFilter();
    const comp =
      p.compartments.find((c) => c.id === filter) ??
      p.compartments.find((c) =>
        wp.x >= c.rect.x &&
        wp.x <= c.rect.x + c.rect.w &&
        wp.y >= c.rect.y &&
        wp.y <= c.rect.y + c.rect.h
      );
    if (!comp) return;
    const clamped: Vec = {
      x: clamp(wp.x, comp.rect.x + 0.2, comp.rect.x + comp.rect.w - 0.2),
      y: clamp(wp.y, comp.rect.y + 0.2, comp.rect.y + comp.rect.h - 0.2)
    };
    if (this.tool === 'add-cable') store.addCable(comp.id, clamped);
    else store.addVent(comp.id, clamped);
    this.relayoutLoose();
  };

  private onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    const sp = this.localPoint(ev);
    const before = screenToWorld(this.cam, sp);
    const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.cam.scale = clamp(this.cam.scale * factor, 2, 400);
    this.cam.offsetX = sp.x - before.x * this.cam.scale;
    this.cam.offsetY = sp.y + before.y * this.cam.scale;
    this.render();
  };

  private onPointerDown = (ev: PointerEvent): void => {
    const sp = this.localPoint(ev);
    // 中键或右键:平移画布
    if (ev.button === 1 || ev.button === 2) {
      this.startPan(ev, sp);
      return;
    }
    if (ev.button !== 0) return;
    const hit = hitTest(this.hits, sp.x, sp.y);

    if (!hit) {
      store.select(null);
      this.startPan(ev, sp);
      return;
    }

    store.select(hit.id);
    this.container.setPointerCapture(ev.pointerId);
    // 快照延迟到真正发生移动时再压,避免纯点击产生空撤销记录
    this.drag = {
      kind: hit.part === 'label' ? 'label' : 'entity',
      pointerId: ev.pointerId,
      startScreen: sp,
      entityId: hit.id,
      lastWorld: screenToWorld(this.cam, sp),
      moved: false,
      interactionBegun: false
    };
  };

  private startPan(ev: PointerEvent, sp: Vec): void {
    this.container.setPointerCapture(ev.pointerId);
    this.drag = {
      kind: 'pan',
      pointerId: ev.pointerId,
      startScreen: sp,
      camStart: { offsetX: this.cam.offsetX, offsetY: this.cam.offsetY },
      moved: false,
      interactionBegun: false
    };
  }

  private beginDragOnce(d: NonNullable<CanvasHost['drag']>): void {
    if (d.interactionBegun) return;
    d.interactionBegun = true;
    store.beginInteraction();
  }

  private onPointerMove = (ev: PointerEvent): void => {
    const d = this.drag;
    if (!d || d.pointerId !== ev.pointerId) return;
    const sp = this.localPoint(ev);
    const dx = sp.x - d.startScreen.x;
    const dy = sp.y - d.startScreen.y;
    if (Math.hypot(dx, dy) > 3) d.moved = true;

    if (d.kind === 'pan' && d.camStart) {
      this.cam.offsetX = d.camStart.offsetX + dx;
      this.cam.offsetY = d.camStart.offsetY + dy;
      this.render();
      return;
    }

    const entity = store.getEntity(d.entityId ?? null);
    if (!entity) return;
    if (!d.moved) return;
    this.beginDragOnce(d);
    const wp = screenToWorld(this.cam, sp);

    if (d.kind === 'entity') {
      if (this.opts.mode === 'plan') {
        store.moveEntity(entity.id, wp);
      } else if (entity.type === 'vent') {
        // 剖面里风口横移与平面联动,高程按拖到的 y 改写风道标高
        entity.ductElevation = clamp(
          wp.y,
          -1,
          store.state.warehouse.grainHeight
        );
      }
      store.liveUpdate();
    } else if (d.kind === 'label') {
      const label: LabelState = entity[this.opts.labelKey];
      label.pos =
        this.opts.mode === 'section' && entity.type === 'cable'
          ? { x: entity.pos.x, y: wp.y }
          : wp;
      label.pinned = true; // 手动拖过即固定,自动避让不再动它
      store.liveUpdate();
      this.relayoutLoose();
    }
    d.lastWorld = wp;
  };

  private onPointerUp = (ev: PointerEvent): void => {
    const d = this.drag;
    if (!d || d.pointerId !== ev.pointerId) return;
    if (d.interactionBegun) {
      store.endInteraction();
    }
    this.drag = null;
  };

  /** 供"适应窗口"按钮及外部调用 */
  refresh(): void {
    this.render();
  }

  screenPointOfWorld(p: Vec): Vec {
    return toScreen(this.cam, p);
  }

  dispose(): void {
    this.destroyed = true;
    this.unsubscribe();
    this.resizeObserver.disconnect();
    const el = this.container;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('dblclick', this.onDblClick);
    el.removeEventListener('contextmenu', this.onContextMenu);
    this.two.clear();
    el.innerHTML = '';
  }
}
