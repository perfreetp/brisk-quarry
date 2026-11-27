import * as pc from 'playcanvas';
import type { BranchAnnotation, BranchData, CutMarker, Vec3Tuple } from '../types';
import { LABEL_META, UNLABELED_COLOR } from '../types';
import { clamp, hexToRgb01, makeCut, maxCutT, mixPoint } from '../lib/math';
import { appendCutBand, appendTaperedBranch, createGroundMesh, createGridTexture, GeometryBuilder } from './geometry';

export interface ViewerCallbacks {
  onSelect: (id: string | null) => void;
  onHover?: (info: { id: string; x: number; y: number } | null) => void;
  onCutGestureStart?: (id: string) => void;
  onCutChange?: (id: string, cut: CutMarker) => void;
  onCutGestureEnd?: (id: string) => void;
  getAnnotations: () => Record<string, BranchAnnotation>;
  getMinCutDiameter?: () => number;
}

interface PickHit {
  type: 'branch' | 'cut';
  id: string;
  rayT: number;
}

interface GestureState {
  mode: 'rotate' | 'pan' | 'cut';
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  cutId?: string;
}

export class TreeViewer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private app: pc.Application;
  private callbacks: ViewerCallbacks;

  private cameraEntity!: pc.Entity;
  private treeRoot!: pc.Entity;
  private helperRoot!: pc.Entity;
  private groundEntity: pc.Entity | null = null;
  private branchEntity: pc.Entity | null = null;
  private cutEntity: pc.Entity | null = null;
  private highlightEntity: pc.Entity | null = null;
  private dragEntity: pc.Entity;

  private branchMaterial!: pc.StandardMaterial;
  private cutMaterial!: pc.StandardMaterial;
  private dragMaterial!: pc.StandardMaterial;
  private highlightMaterial!: pc.StandardMaterial;

  private branchMesh: pc.Mesh | null = null;
  private highlightMesh: pc.Mesh | null = null;
  private dragMesh: pc.Mesh | null = null;
  private branchColors: number[] = [];
  private ranges = new Map<string, { start: number; count: number }>();
  private byId = new Map<string, BranchData>();
  private pickIds: string[] = [];
  private pickData = new Float32Array(0);
  private cutItems: Array<{ id: string; cut: CutMarker }> = [];

  private orbit = {
    yaw: 0.72,
    pitch: 0.34,
    distance: 9,
    target: new pc.Vec3(0, 2.2, 0),
  };

  private gesture: GestureState | null = null;
  private resizeObserver: ResizeObserver;
  private hoverFrame = 0;
  private pendingHover: { clientX: number; clientY: number } | null = null;
  private disposed = false;

  constructor(container: HTMLElement, branches: BranchData[], callbacks: ViewerCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pc-canvas';
    this.canvas.setAttribute('aria-label', '果树枝条三维视图，拖动旋转，滚轮缩放，右键平移');
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);

    this.app = new pc.Application(this.canvas, {
      graphicsDeviceOptions: {
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      },
      devtools: false,
    });
    this.app.setCanvasFillMode(pc.FILLMODE_NONE, container.clientWidth, container.clientHeight);
    this.app.start();

    this.dragEntity = new pc.Entity('cut-drag-preview');
    this.dragEntity.enabled = false;
    this.app.root.addChild(this.dragEntity);

    this.buildScene();
    this.loadTree(branches);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
  }

  private buildScene() {
    this.app.scene.ambientLight = new pc.Color(0.58, 0.6, 0.64);

    const hemi = new pc.Entity('hemisphere-light');
    hemi.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.78, 0.86, 1),
      intensity: 0.55,
    });
    hemi.setEulerAngles(-55, -25, 0);
    this.app.root.addChild(hemi);

    const sun = new pc.Entity('key-light');
    sun.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 0.95, 0.84),
      intensity: 1.45,
    });
    sun.setEulerAngles(-38, 32, 0);
    this.app.root.addChild(sun);

    this.cameraEntity = new pc.Entity('orbit-camera');
    this.cameraEntity.addComponent('camera', {
      fov: 42,
      nearClip: 0.04,
      farClip: 250,
      clearColor: new pc.Color(0.965, 0.97, 0.945, 1),
    });
    this.app.root.addChild(this.cameraEntity);

    this.treeRoot = new pc.Entity('pruning-annotated-tree');
    this.helperRoot = new pc.Entity('viewer-helpers');
    this.app.root.addChild(this.treeRoot);
    this.app.root.addChild(this.helperRoot);

    this.branchMaterial = new pc.StandardMaterial();
    this.branchMaterial.diffuseVertexColor = true;
    this.branchMaterial.gloss = 0.12;
    this.branchMaterial.shininess = 18;
    this.branchMaterial.update();

    this.cutMaterial = new pc.StandardMaterial();
    this.cutMaterial.diffuse = new pc.Color(1, 0.82, 0.12);
    this.cutMaterial.emissive = new pc.Color(0.38, 0.22, 0.02);
    this.cutMaterial.gloss = 0.35;
    this.cutMaterial.update();

    this.dragMaterial = new pc.StandardMaterial();
    this.dragMaterial.diffuse = new pc.Color(1, 0.95, 0.35);
    this.dragMaterial.emissive = new pc.Color(0.65, 0.42, 0.02);
    this.dragMaterial.opacity = 0.92;
    this.dragMaterial.blendType = pc.BLEND_NORMAL;
    this.dragMaterial.update();

    this.highlightMaterial = new pc.StandardMaterial();
    this.highlightMaterial.diffuse = new pc.Color(0.13, 0.83, 0.93);
    this.highlightMaterial.emissive = new pc.Color(0.04, 0.48, 0.58);
    this.highlightMaterial.opacity = 0.34;
    this.highlightMaterial.blendType = pc.BLEND_NORMAL;
    this.highlightMaterial.depthWrite = false;
    this.highlightMaterial.update();

    this.rebuildGround(12);
    this.updateCamera();
  }

  private rebuildGround(size: number) {
    if (this.groundEntity) {
      this.groundEntity.destroy();
      this.groundEntity = null;
    }
    const texture = createGridTexture(this.app.graphicsDevice, size);
    const material = new pc.StandardMaterial();
    material.diffuseMap = texture;
    material.diffuse = new pc.Color(1, 1, 1);
    material.gloss = 0.05;
    material.update();

    const mesh = createGroundMesh(this.app.graphicsDevice, size);
    const meshInstance = new pc.MeshInstance(mesh, material);
    this.groundEntity = new pc.Entity('metre-grid-ground');
    this.groundEntity.addComponent('render', { meshInstances: [meshInstance] });
    this.app.root.addChild(this.groundEntity);
  }

  loadTree(branches: BranchData[]) {
    this.branches = branches;
    this.byId = new Map(branches.map((b) => [b.id, b]));
    this.pickIds = branches.map((b) => b.id);
    this.pickData = new Float32Array(branches.length * 8);
    branches.forEach((b, i) => {
      const k = i * 8;
      this.pickData[k] = b.start[0];
      this.pickData[k + 1] = b.start[1];
      this.pickData[k + 2] = b.start[2];
      this.pickData[k + 3] = b.end[0] - b.start[0];
      this.pickData[k + 4] = b.end[1] - b.start[1];
      this.pickData[k + 5] = b.end[2] - b.start[2];
      this.pickData[k + 6] = b.diameter * 0.5;
      this.pickData[k + 7] = b.tipDiameter * 0.5;
    });
    this.ranges.clear();
    this.cutItems = [];

    const oldCutMesh = this.cutEntity?.render?.meshInstances?.[0]?.mesh as pc.Mesh | undefined;
    if (this.branchEntity) {
      this.branchEntity.destroy();
      this.branchEntity = null;
    }
    this.branchMesh?.destroy();
    this.branchMesh = null;
    oldCutMesh?.destroy();
    if (this.cutEntity) {
      this.cutEntity.destroy();
      this.cutEntity = null;
    }
    this.setSelection(null);

    const g = new GeometryBuilder();
    const defaultRgb = hexToRgb01(UNLABELED_COLOR);
    for (const b of branches) {
      this.ranges.set(b.id, appendTaperedBranch(g, b, defaultRgb, 8));
    }
    this.branchColors = g.colors;
    this.branchMesh = g.toMesh(this.app.graphicsDevice, { colors: true });
    const mi = new pc.MeshInstance(this.branchMesh, this.branchMaterial);
    this.branchEntity = new pc.Entity('merged-branch-skeleton');
    this.branchEntity.addComponent('render', { meshInstances: [mi] });
    this.treeRoot.addChild(this.branchEntity);

    this.cutEntity = new pc.Entity('cut-markers');
    this.treeRoot.addChild(this.cutEntity);

    const bounds = this.computeBounds();
    const groundSize = Math.max(10, Math.ceil(Math.max(bounds.sizeX, bounds.sizeZ, bounds.sizeY * 0.7) * 1.8 / 2) * 2);
    this.rebuildGround(Math.min(100, groundSize));
    this.fitToBounds();
    this.refreshColors();
    this.rebuildCutMarkers();
  }

  private branches: BranchData[] = [];

  refreshColors() {
    if (!this.branchMesh) return;
    const annotations = this.callbacks.getAnnotations();
    for (const [id, range] of this.ranges) {
      const label = annotations[id]?.label;
      const rgb = hexToRgb01(label ? LABEL_META[label].color : UNLABELED_COLOR);
      for (let i = 0; i < range.count; i++) {
        const k = (range.start + i) * 4;
        this.branchColors[k] = rgb[0];
        this.branchColors[k + 1] = rgb[1];
        this.branchColors[k + 2] = rgb[2];
        this.branchColors[k + 3] = 1;
      }
    }
    this.branchMesh.setColors(this.branchColors, 4);
    this.branchMesh.update();
  }

  rebuildCutMarkers(excludeId?: string) {
    const annotations = this.callbacks.getAnnotations();
    this.cutItems = [];
    const g = new GeometryBuilder();
    for (const b of this.branches) {
      const cut = annotations[b.id]?.cut;
      if (!cut || b.id === excludeId) continue;
      this.cutItems.push({ id: b.id, cut });
      appendCutBand(g, b, cut);
    }

    const oldMesh = this.cutEntity?.render?.meshInstances?.[0]?.mesh as pc.Mesh | undefined;
    if (this.cutEntity) {
      this.cutEntity.destroy();
    }
    oldMesh?.destroy();
    this.cutEntity = new pc.Entity('cut-markers');
    if (this.cutItems.length) {
      const mesh = g.toMesh(this.app.graphicsDevice);
      const mi = new pc.MeshInstance(mesh, this.cutMaterial);
      this.cutEntity.addComponent('render', { meshInstances: [mi] });
    }
    this.treeRoot.addChild(this.cutEntity);
  }

  previewCut(id: string, cut: CutMarker) {
    const branch = this.byId.get(id);
    if (!branch) return;
    this.dragMesh?.destroy();
    const g = new GeometryBuilder();
    appendCutBand(g, branch, cut, 14);
    const mesh = g.toMesh(this.app.graphicsDevice);
    this.dragMesh = mesh;
    if (this.dragEntity.render) this.dragEntity.removeComponent('render');
    const mi = new pc.MeshInstance(mesh, this.dragMaterial);
    this.dragEntity.addComponent('render', { meshInstances: [mi] });
    this.dragEntity.enabled = true;
  }

  hideDragPreview() {
    this.dragEntity.enabled = false;
    this.dragMesh?.destroy();
    this.dragMesh = null;
    if (this.dragEntity.render) this.dragEntity.removeComponent('render');
  }

  setSelection(id: string | null) {
    if (this.highlightEntity) {
      this.highlightEntity.destroy();
      this.highlightEntity = null;
    }
    this.highlightMesh?.destroy();
    this.highlightMesh = null;
    if (!id) return;
    const b = this.byId.get(id);
    if (!b) return;
    const highlightBranch: BranchData = {
      ...b,
      diameter: b.diameter * 1.16,
      tipDiameter: b.tipDiameter * 1.16,
    };
    const g = new GeometryBuilder();
    appendTaperedBranch(g, highlightBranch, hexToRgb01('#22d3ee'), 12);
    const mesh = g.toMesh(this.app.graphicsDevice, { colors: true });
    this.highlightMesh = mesh;
    const mi = new pc.MeshInstance(mesh, this.highlightMaterial);
    this.highlightEntity = new pc.Entity(`selection-${id}`);
    this.highlightEntity.addComponent('render', { meshInstances: [mi] });
    this.helperRoot.addChild(this.highlightEntity);
  }

  frameBranch(id: string) {
    const b = this.byId.get(id);
    if (!b) return;
    const mid = mixPoint(b.start, b.end, 0.5);
    this.orbit.target.set(mid[0], mid[1], mid[2]);
    this.orbit.distance = clamp(Math.max(b.length * 1.7, b.diameter * 28), 0.45, 18);
    this.updateCamera();
  }

  resetView() {
    this.fitToBounds();
  }

  worldToClient(position: Vec3Tuple): { x: number; y: number } {
    const screen = this.cameraEntity.camera!.worldToScreen(
      new pc.Vec3(position[0], position[1], position[2]),
      new pc.Vec3(),
    );
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + screen.x, y: rect.top + screen.y };
  }

  private computeBounds() {
    const min = new pc.Vec3(Infinity, Infinity, Infinity);
    const max = new pc.Vec3(-Infinity, -Infinity, -Infinity);
    for (const b of this.branches) {
      for (const p of [b.start, b.end]) {
        min.x = Math.min(min.x, p[0]);
        min.y = Math.min(min.y, p[1]);
        min.z = Math.min(min.z, p[2]);
        max.x = Math.max(max.x, p[0]);
        max.y = Math.max(max.y, p[1]);
        max.z = Math.max(max.z, p[2]);
      }
    }
    if (!Number.isFinite(min.x)) {
      min.set(-1, 0, -1);
      max.set(1, 3, 1);
    }
    const center = new pc.Vec3().add2(min, max).scale(0.5);
    return {
      min,
      max,
      center,
      sizeX: max.x - min.x,
      sizeY: max.y - min.y,
      sizeZ: max.z - min.z,
      radius: Math.max(max.x - min.x, max.y - min.y, max.z - min.z) * 0.5 || 1,
    };
  }

  private fitToBounds() {
    const bounds = this.computeBounds();
    this.orbit.target.copy(bounds.center);
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const aspect = w / h;
    const fov = (this.cameraEntity?.camera?.fov ?? 42) * Math.PI / 180;
    const tanV = Math.tan(fov / 2);
    const tanFit = Math.min(tanV, tanV * aspect);
    this.orbit.distance = clamp((bounds.radius * 1.28) / tanFit, 1.2, 80);
    this.orbit.yaw = 0.72;
    this.orbit.pitch = 0.32;
    this.updateCamera();
  }

  private updateCamera() {
    if (!this.cameraEntity) return;
    const cp = Math.cos(this.orbit.pitch);
    const p = new pc.Vec3(
      this.orbit.target.x + this.orbit.distance * cp * Math.sin(this.orbit.yaw),
      this.orbit.target.y + this.orbit.distance * Math.sin(this.orbit.pitch),
      this.orbit.target.z + this.orbit.distance * cp * Math.cos(this.orbit.yaw),
    );
    this.cameraEntity.setPosition(p);
    this.cameraEntity.lookAt(this.orbit.target);
  }

  private resize() {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.app.setCanvasFillMode(pc.FILLMODE_NONE, w, h);
    this.app.resizeCanvas(w, h);
    if (this.cameraEntity?.camera) {
      this.cameraEntity.camera.aspectRatio = w / h;
    }
    this.updateCamera();
  }

  private makeRay(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const camera = this.cameraEntity.camera!;
    const origin = camera.screenToWorld(x, y, camera.nearClip, new pc.Vec3());
    const far = camera.screenToWorld(x, y, camera.farClip, new pc.Vec3());
    const direction = far.sub(origin).normalize();
    return { ox: origin.x, oy: origin.y, oz: origin.z, dx: direction.x, dy: direction.y, dz: direction.z, x, y, rectHeight: rect.height };
  }

  private pick(clientX: number, clientY: number): PickHit | null {
    const ray = this.makeRay(clientX, clientY);
    const fov = (this.cameraEntity.camera?.fov ?? 42) * Math.PI / 180;
    const tanFactor = 2 * Math.tan(fov / 2) / Math.max(1, ray.rectHeight);

    let bestCut: PickHit | null = null;
    for (const item of this.cutItems) {
      const p = item.cut.position;
      const wx = p[0] - ray.ox;
      const wy = p[1] - ray.oy;
      const wz = p[2] - ray.oz;
      const rayT = wx * ray.dx + wy * ray.dy + wz * ray.dz;
      if (rayT <= 0) continue;
      const dist2 = wx * wx + wy * wy + wz * wz - rayT * rayT;
      const screenWorld = 18 * tanFactor * rayT;
      if (dist2 <= screenWorld * screenWorld && (!bestCut || rayT < bestCut.rayT)) {
        bestCut = { type: 'cut', id: item.id, rayT };
      }
    }
    if (bestCut) return bestCut;

    let best: PickHit | null = null;
    const data = this.pickData;
    for (let i = 0, k = 0; i < this.pickIds.length; i++, k += 8) {
      const ax = data[k];
      const ay = data[k + 1];
      const az = data[k + 2];
      const ux = data[k + 3];
      const uy = data[k + 4];
      const uz = data[k + 5];
      const radius0 = data[k + 6];
      const radius1 = data[k + 7];
      const uu = ux * ux + uy * uy + uz * uz;
      if (uu < 1e-12) continue;

      const w0x = ax - ray.ox;
      const w0y = ay - ray.oy;
      const w0z = az - ray.oz;
      const bb = ux * ray.dx + uy * ray.dy + uz * ray.dz;
      const d = ux * w0x + uy * w0y + uz * w0z;
      const e = ray.dx * w0x + ray.dy * w0y + ray.dz * w0z;
      const den = uu - bb * bb;
      let t = den > 1e-10 ? (bb * e - d) / den : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;

      const cx = ax + t * ux;
      const cy = ay + t * uy;
      const cz = az + t * uz;
      const wx = cx - ray.ox;
      const wy = cy - ray.oy;
      const wz = cz - ray.oz;
      const rayT = wx * ray.dx + wy * ray.dy + wz * ray.dz;
      if (rayT <= 0.01) continue;
      const perp2 = wx * wx + wy * wy + wz * wz - rayT * rayT;
      if (perp2 < 0) continue;
      const radius = radius0 + (radius1 - radius0) * t;
      const pickWorld = 11 * tanFactor * rayT + radius * 1.15;
      if (perp2 <= pickWorld * pickWorld && (!best || rayT < best.rayT)) {
        best = { type: 'branch', id: this.pickIds[i], rayT };
      }
    }
    return best;
  }

  private dragCutPosition(id: string, clientX: number, clientY: number): CutMarker | null {
    const b = this.byId.get(id);
    if (!b) return null;
    const ray = this.makeRay(clientX, clientY);
    const ax = b.start[0];
    const ay = b.start[1];
    const az = b.start[2];
    const ux = b.end[0] - ax;
    const uy = b.end[1] - ay;
    const uz = b.end[2] - az;
    const uu = ux * ux + uy * uy + uz * uz;
    const w0x = ax - ray.ox;
    const w0y = ay - ray.oy;
    const w0z = az - ray.oz;
    const bb = ux * ray.dx + uy * ray.dy + uz * ray.dz;
    const d = ux * w0x + uy * w0y + uz * w0z;
    const e = ray.dx * w0x + ray.dy * w0y + ray.dz * w0z;
    const den = uu - bb * bb;
    let t = den > 1e-9 ? (bb * e - d) / den : this.screenSpaceT(b, ray.x, ray.y);
    t = clamp(t, 0, 1);

    const minD = this.callbacks.getMinCutDiameter?.() ?? 0;
    const legalMax = maxCutT(b, minD);
    let snappedBudId: string | null = null;
    const camera = this.cameraEntity.camera!;
    let bestBudDistance = 22;
    for (const bud of b.buds) {
      if (bud.t > legalMax + 0.01) continue;
      const s = camera.worldToScreen(new pc.Vec3(bud.position[0], bud.position[1], bud.position[2]), new pc.Vec3());
      const sx = s.x - ray.x;
      const sy = s.y - ray.y;
      const dist = Math.hypot(sx, sy);
      if (dist < bestBudDistance) {
        bestBudDistance = dist;
        snappedBudId = bud.id;
        t = bud.t;
      }
    }
    return makeCut(b, t, snappedBudId, minD);
  }

  private screenSpaceT(b: BranchData, x: number, y: number): number {
    const camera = this.cameraEntity.camera!;
    const a = camera.worldToScreen(new pc.Vec3(...b.start), new pc.Vec3());
    const e = camera.worldToScreen(new pc.Vec3(...b.end), new pc.Vec3());
    const vx = e.x - a.x;
    const vy = e.y - a.y;
    const len2 = vx * vx + vy * vy;
    if (len2 < 4) return 0.5;
    return clamp(((x - a.x) * vx + (y - a.y) * vy) / len2, 0, 1);
  }

  private handlePointerDown = (event: PointerEvent) => {
    if (this.hoverFrame) cancelAnimationFrame(this.hoverFrame);
    this.hoverFrame = 0;
    this.pendingHover = null;
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    event.preventDefault();
    this.canvas.focus();
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional */
    }

    const hit = event.button === 0 ? this.pick(event.clientX, event.clientY) : null;
    if (hit?.type === 'cut' && event.button === 0) {
      this.gesture = {
        mode: 'cut',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
        cutId: hit.id,
      };
      this.callbacks.onSelect(hit.id);
      this.callbacks.onCutGestureStart?.(hit.id);
      this.rebuildCutMarkers(hit.id);
      const cut = this.callbacks.getAnnotations()[hit.id]?.cut;
      if (cut) this.previewCut(hit.id, cut);
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    this.gesture = {
      mode: event.button === 0 ? 'rotate' : 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    this.canvas.style.cursor = 'grabbing';
  };

  private handlePointerMove = (event: PointerEvent) => {
    const g = this.gesture;
    if (!g || g.pointerId !== event.pointerId) {
      // Ray-picking thousands of branches is coalesced to one pass per frame.
      this.pendingHover = { clientX: event.clientX, clientY: event.clientY };
      if (!this.hoverFrame) {
        this.hoverFrame = requestAnimationFrame(() => {
          this.hoverFrame = 0;
          const p = this.pendingHover;
          this.pendingHover = null;
          if (!p || this.gesture) return;
          const hit = this.pick(p.clientX, p.clientY);
          this.canvas.style.cursor = hit?.type === 'cut' ? 'grab' : hit ? 'pointer' : 'grab';
          this.callbacks.onHover?.(hit ? { id: hit.id, x: p.clientX, y: p.clientY } : null);
        });
      }
      return;
    }

    const dx = event.clientX - g.lastX;
    const dy = event.clientY - g.lastY;
    if (Math.hypot(event.clientX - g.startX, event.clientY - g.startY) > 5) g.moved = true;
    g.lastX = event.clientX;
    g.lastY = event.clientY;

    if (g.mode === 'cut' && g.cutId) {
      const cut = this.dragCutPosition(g.cutId, event.clientX, event.clientY);
      if (cut) {
        this.previewCut(g.cutId, cut);
        this.callbacks.onCutChange?.(g.cutId, cut);
      }
      return;
    }

    if (g.mode === 'rotate') {
      this.orbit.yaw -= dx * 0.006;
      this.orbit.pitch = clamp(this.orbit.pitch - dy * 0.005, -1.25, 1.45);
      this.updateCamera();
    } else if (g.mode === 'pan') {
      const camera = this.cameraEntity.getPosition();
      const forward = new pc.Vec3().sub2(this.orbit.target, camera).normalize();
      const right = new pc.Vec3().cross(forward, pc.Vec3.UP).normalize();
      const up = new pc.Vec3().cross(right, forward).normalize();
      const scale = this.orbit.distance * 0.0016;
      const deltaRight = right.mulScalar(-dx * scale);
      const deltaUp = up.mulScalar(dy * scale);
      const delta = deltaRight.add(deltaUp);
      this.orbit.target.add(delta);
      this.updateCamera();
    }
  };

  private finishPointer(event: PointerEvent, cancelled = false) {
    const g = this.gesture;
    if (!g || g.pointerId !== event.pointerId) return;
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    if (g.mode === 'cut' && g.cutId) {
      this.callbacks.onCutGestureEnd?.(g.cutId);
      this.hideDragPreview();
      this.rebuildCutMarkers();
    } else if (g.mode === 'rotate' && !cancelled && !g.moved && event.type === 'pointerup') {
      const hit = this.pick(event.clientX, event.clientY);
      this.callbacks.onSelect(hit?.id ?? null);
    }

    this.gesture = null;
    this.canvas.style.cursor = 'grab';
  }

  private handlePointerUp = (event: PointerEvent) => this.finishPointer(event);
  private handlePointerCancel = (event: PointerEvent) => this.finishPointer(event, true);

  private handlePointerLeave = (event: PointerEvent) => {
    if (!this.gesture) {
      this.callbacks.onHover?.(null);
      this.canvas.style.cursor = 'grab';
    }
  };

  private handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const factor = Math.exp(event.deltaY * 0.0011);
    this.orbit.distance = clamp(this.orbit.distance * factor, 0.35, 120);
    this.updateCamera();
  };

  private handleContextMenu = (event: MouseEvent) => event.preventDefault();

  async exportGlb(): Promise<ArrayBuffer> {
    this.refreshColors();
    this.rebuildCutMarkers();
    const exporter = new pc.GltfExporter();
    return exporter.build(this.treeRoot, { stripUnusedAttributes: false });
  }

  destroy() {
    this.disposed = true;
    this.resizeObserver.disconnect();
    if (this.hoverFrame) cancelAnimationFrame(this.hoverFrame);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.app.destroy();
    this.canvas.remove();
  }
}
