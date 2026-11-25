import { Application, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type {
  AudienceType,
  FillTarget,
  PersonInfo,
  SongSegment,
  Stats,
  VenuePlan,
} from '../types';
import { VENUE_CONST, type VenueWithRows } from '../data/venue';
import { numberToHex } from '../utils/color';
import { AudienceState, Flags, fillSeats } from './audienceState';
import { makeTextures, type PersonTextures } from './textures';

export interface EngineCallbacks {
  onStats: (s: Stats) => void;
  onPick: (info: PersonInfo | null) => void;
}

interface Sprites {
  body: Sprite;
  stick: Sprite;
  glow: Sprite;
}

const LOD_DOT = 0.3; // 再远只看色块
const LOD_HIDE_GLOW = 0.6;
const LOD_HIDE_STICK = 0.42;

export class AudienceEngine {
  readonly app: Application;
  viewport!: Viewport;
  readonly state: AudienceState;
  private venue: VenueWithRows;
  private types: AudienceType[];
  private segments: SongSegment[];
  private tex!: PersonTextures;
  private cb: EngineCallbacks;

  private layers!: { glow: Container; body: Container; stick: Container; fx: Container };
  private sprites!: Sprites[];
  private selectRing!: Sprite;
  private marquee!: Graphics;
  private rowLabels: Text[] = [];
  private maskRects: Graphics[] = [];

  /** 当前框选座位 id（含未填充的空座） */
  private selectedIds = new Set<number>();
  private maskedRows = new Set<number>();
  private selectMode = false;
  private dragging = false;
  private dragStart: { x: number; y: number } | null = null;
  private downScreen: { x: number; y: number } | null = null;
  private suppressClick = false;
  private locked = false;

  private fpsAcc = 0;
  private fpsFrames = 0;
  private fps = 60;
  private statsTimer = 0;
  private pos = new Int16Array(0); // 仅用于透视预览读取
  private resizeObserver?: ResizeObserver;
  private initialized = false;

  constructor(
    host: HTMLElement,
    venue: VenuePlan,
    types: AudienceType[],
    segments: SongSegment[],
    cb: EngineCallbacks,
  ) {
    this.venue = venue as VenueWithRows;
    this.types = types;
    this.segments = segments;
    this.cb = cb;
    this.state = new AudienceState(venue.seats.length);

    this.app = new Application();
  }

  async init(): Promise<void> {
    await this.app.init({
      resizeTo: this.hostEl,
      background: '#101218',
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
      powerPreference: 'high-performance',
    });
    this.hostEl.appendChild(this.app.canvas);
    this.tex = makeTextures(this.app);

    this.viewport = new Viewport({
      events: this.app.renderer.events,
      passiveWheel: false,
    });
    this.viewport
      .drag({ mouseButtons: 'all' })
      .wheel({ percent: 0.12, smooth: 5 })
      .pinch()
      .decelerate({ friction: 0.92 })
      .clampZoom({ minScale: 0.08, maxScale: 4 });

    this.app.stage.addChild(this.viewport);
    this.buildEnvironment();
    this.buildPeople();
    this.buildFx();
    this.bindInteraction();
    this.fitView();
    this.app.canvas.style.cursor = 'grab';

    this.app.ticker.add(this.tick);
    this.resizeObserver = new ResizeObserver(() => this.app.resize());
    this.resizeObserver.observe(this.hostEl);
    this.initialized = true;

    // 调试/自动化钩子
    (window as unknown as Record<string, unknown>).__audienceEngine = this;
  }

  private hostEl!: HTMLElement;
  attachHost(el: HTMLElement) {
    this.hostEl = el;
  }

  // ---------- 静态环境层 ----------

  private buildEnvironment() {
    const env = new Container();
    this.viewport.addChild(env);
    const { seats, zones, stage, rowCount } = this.venue;

    // 外框地坪
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of seats) {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.y > maxY) maxY = s.y;
    }
    const pad = 90;
    const floor = new Graphics()
      .roundRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2, 28)
      .fill({ color: 0x1a1e28, alpha: 0.9 })
      .stroke({ width: 2, color: 0x2c3346, alpha: 0.8 });
    env.addChild(floor);

    // 三个色温区域
    for (const z of zones) {
      const y0 = stage.y + stage.height + 24 + (z.rowMin - 1) * VENUE_CONST.ROW_GAP + 60;
      const rows = z.rowMax - z.rowMin + 1;
      const h = rows * VENUE_CONST.ROW_GAP;
      const band = new Graphics()
        .roundRect(minX - pad + 10, y0, maxX - minX + pad * 2 - 20, h, 14)
        .fill({ color: z.tint, alpha: 0.07 })
        .stroke({ width: 1, color: z.tint, alpha: 0.35 });
      env.addChild(band);

      const label = new Text({
        text: `${z.name} · ${z.colorTemp}K`,
        style: new TextStyle({ fill: z.tint, fontSize: 15, fontWeight: '700' }),
      });
      label.position.set(minX - pad + 26, y0 + 8);
      env.addChild(label);
    }

    // 舞台
    const st = new Graphics()
      .roundRect(stage.x - stage.width / 2, stage.y, stage.width, stage.height, 10)
      .fill({ color: 0x2b3350 })
      .stroke({ width: 2.5, color: 0x6f86c9 });
    env.addChild(st);
    const stLabel = new Text({
      text: stage.label,
      style: new TextStyle({ fill: 0xe8ecff, fontSize: 26, fontWeight: '800', letterSpacing: 6 }),
    });
    stLabel.anchor.set(0.5, 0.5);
    stLabel.position.set(stage.x, stage.y + stage.height / 2);
    env.addChild(stLabel);

    // 过道（分区之间画浅色虚线带）
    const centerRow = this.venue.rows[30];
    const centerSeats = centerRow.map((id) => this.venue.seats[id]).filter((s) => s.sectionId === 'C');
    const wingL = centerRow.map((id) => this.venue.seats[id]).filter((s) => s.sectionId === 'L');
    const wingR = centerRow.map((id) => this.venue.seats[id]).filter((s) => s.sectionId === 'R');
    const aisleXs = [
      (Math.max(...wingL.map((s) => s.x)) + Math.min(...centerSeats.map((s) => s.x))) / 2,
      (Math.max(...centerSeats.map((s) => s.x)) + Math.min(...wingR.map((s) => s.x))) / 2,
    ];
    const aisleTop = minY - 20;
    const aisleH = maxY - minY + 40;
    for (const ax of aisleXs) {
      const aisle = new Graphics()
        .rect(ax - VENUE_CONST.AISLE_GAP / 2, aisleTop, VENUE_CONST.AISLE_GAP, aisleH)
        .fill({ color: 0x0c0e14, alpha: 0.55 });
      env.addChild(aisle);
    }

    // 每排排号（标在左右两端）
    for (let r = 1; r <= rowCount; r++) {
      const rowSeats = this.venue.rows[r - 1].map((id) => this.venue.seats[id]);
      const y = rowSeats.find((s) => s.sectionId === 'C')?.y ?? rowSeats[0].y;
      const leftX = Math.min(...rowSeats.map((s) => s.x)) - 26;
      const t = new Text({
        text: String(r),
        style: new TextStyle({ fill: 0x5d6783, fontSize: 12, fontWeight: '600' }),
      });
      t.anchor.set(1, 0.5);
      t.position.set(leftX, y);
      this.rowLabels.push(t);
      env.addChild(t);
    }
  }

  // ---------- 观众精灵 ----------

  private buildPeople() {
    const n = this.venue.seats.length;
    const glow = new Container();
    const body = new Container();
    const stick = new Container();
    this.viewport.addChild(glow, body, stick);
    this.layers = { glow, body, stick, fx: new Container() };

    this.sprites = new Array(n);
    this.pos = new Int16Array(n * 2);
    for (const seat of this.venue.seats) {
      const i = seat.id;
      this.pos[i * 2] = seat.x;
      this.pos[i * 2 + 1] = seat.y;

      const g = new Sprite({ texture: this.tex.glow, anchor: 0.5, visible: false });
      g.position.set(seat.x, seat.y);
      glow.addChild(g);

      const b = new Sprite({ texture: this.tex.bodySit, anchor: 0.5, visible: false });
      b.position.set(seat.x, seat.y);
      body.addChild(b);

      const st = new Sprite({ texture: this.tex.stick, anchor: 0.5, visible: false });
      st.position.set(seat.x + 5, seat.y - 2);
      stick.addChild(st);

      this.sprites[i] = { body: b, stick: st, glow: g };
    }
  }

  private buildFx() {
    const fx = new Container();
    this.viewport.addChild(fx);
    this.layers.fx = fx;

    this.selectRing = new Sprite({ texture: this.tex.ring, anchor: 0.5, visible: false, tint: 0xffffff });
    fx.addChild(this.selectRing);

    this.marquee = new Graphics();
    this.marquee.visible = false;
    fx.addChild(this.marquee);
  }

  // ---------- 交互 ----------

  private bindInteraction() {
    const vp = this.viewport;
    vp.on('pointerdown', (e) => {
      if (this.locked) return;
      this.downScreen = { x: e.global.x, y: e.global.y };
      this.suppressClick = false;
      const isLeft = (e.nativeEvent as MouseEvent).button === 0;
      if (!isLeft) return;
      if (this.selectMode) {
        this.viewport.plugins.pause('drag');
        const p = vp.toWorld(e.global.x, e.global.y);
        this.dragging = true;
        this.dragStart = p;
      }
    });

    vp.on('globalpointermove', (e) => {
      if (this.dragging && this.dragStart) {
        const p = vp.toWorld(e.global.x, e.global.y);
        this.drawMarquee(this.dragStart, p);
      } else {
        this.app.canvas.style.cursor = this.selectMode ? 'crosshair' : 'grab';
      }
    });

    const endDrag = (e: { global: { x: number; y: number } }) => {
      if (!this.dragging || !this.dragStart) {
        // 非框选模式下的普通抬手：平移后的 click 由 movedFar 拦截，这里清掉残留标志
        this.suppressClick = false;
        return;
      }
      const p = vp.toWorld(e.global.x, e.global.y);
      const moved =
        Math.abs(p.x - this.dragStart.x) > 8 || Math.abs(p.y - this.dragStart.y) > 8;
      this.applyMarquee(this.dragStart, p);
      if (moved) this.suppressClick = true;
      this.dragging = false;
      this.dragStart = null;
      this.marquee.visible = false;
      vp.plugins.resume('drag');
    };
    vp.on('pointerup', endDrag);
    vp.on('pointerupoutside', endDrag);

    vp.on('click', (e) => {
      if (this.locked) return;
      const movedFar =
        this.downScreen &&
        (Math.abs(e.global.x - this.downScreen.x) > 6 ||
          Math.abs(e.global.y - this.downScreen.y) > 6);
      if (this.suppressClick || movedFar) {
        this.suppressClick = false;
        return;
      }
      const id = this.hitTest(e.global.x, e.global.y);
      if (!this.selectMode) {
        this.pickOne(id);
      } else if (!this.dragging) {
        // 选择模式下单击：单点框选
        if (id >= 0) this.applySelection(new Set([id]));
        else this.applySelection(new Set());
      }
    });
  }

  private hitTest(screenX: number, screenY: number): number {
    const p = this.viewport.toWorld(screenX, screenY);
    const R = 9 / this.viewport.scale.x + 4;
    let best = -1;
    let bestD = R * R;
    for (const seat of this.venue.seats) {
      const dx = seat.x - p.x;
      const dy = seat.y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = seat.id;
      }
    }
    return best;
  }

  private drawMarquee(a: { x: number; y: number }, b: { x: number; y: number }) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x);
    const h = Math.abs(a.y - b.y);
    this.marquee.visible = true;
    this.marquee
      .clear()
      .rect(x, y, w, h)
      .fill({ color: 0x66aaff, alpha: 0.12 })
      .stroke({ width: 1.5 / this.viewport.scale.x, color: 0x88bbff, alpha: 0.9 });
  }

  private applyMarquee(a: { x: number; y: number }, b: { x: number; y: number }) {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    // 太小的拖拽视为点击
    if (x1 - x0 < 6 && y1 - y0 < 6) {
      const center = this.viewport.toScreen((x0 + x1) / 2, (y0 + y1) / 2);
      const id = this.hitTest(center.x, center.y);
      this.applySelection(id >= 0 ? new Set([id]) : new Set());
      return;
    }
    const ids = new Set<number>();
    for (const seat of this.venue.seats) {
      if (seat.x >= x0 && seat.x <= x1 && seat.y >= y0 && seat.y <= y1) ids.add(seat.id);
    }
    this.applySelection(ids);
  }

  private applySelection(ids: Set<number>) {
    for (const id of this.selectedIds) this.state.flags[id] &= ~Flags.Selected;
    this.selectedIds = ids;
    for (const id of ids) this.state.flags[id] |= Flags.Selected;
    this.emitStats(true);
  }

  private pickOne(id: number) {
    if (id < 0) {
      this.cb.onPick(null);
      this.selectRing.visible = false;
      return;
    }
    this.applySelection(new Set([id]));
    this.cb.onPick(this.getPersonInfo(id));
    const seat = this.venue.seats[id];
    this.selectRing.visible = true;
    this.selectRing.position.set(seat.x, seat.y);
  }

  // ---------- 对外操作 ----------

  setSelectMode(on: boolean) {
    this.selectMode = on;
    this.app.canvas.style.cursor = on ? 'crosshair' : 'grab';
    if (!on) {
      // 退出框选模式但保留选区，方便继续对选中座位操作或在侧栏查看
      this.selectRing.visible = this.selectedIds.size === 1;
    }
  }

  /** 形象库拖放：拖到某个世界坐标范围，按区域批量填充 */
  dropType(typeIdx: number, screenX: number, screenY: number) {
    if (this.locked) return;
    const p = this.viewport.toWorld(screenX, screenY);
    const seat = this.nearestSeat(p.x, p.y);
    if (!seat) return;
    const target: FillTarget = `zone:${seat.zoneId}`;
    fillSeats(this.state, this.venue, this.types, target, typeIdx);
    this.refreshAllSprites();
    this.emitStats(true);
  }

  fillTarget(target: FillTarget, typeIdx: number) {
    if (this.locked) return;
    fillSeats(this.state, this.venue, this.types, target, typeIdx);
    this.refreshAllSprites();
    this.emitStats(true);
  }

  fillAllMixed() {
    if (this.locked) return;
    fillSeats(this.state, this.venue, this.types, 'all', -1);
    this.refreshAllSprites();
    this.emitStats(true);
  }

  private nearestSeat(x: number, y: number) {
    let best = this.venue.seats[0];
    let bestD = Infinity;
    for (const s of this.venue.seats) {
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return bestD < 2500 ? best : null;
  }

  /** 把当前框选座位的荧光棒统一改成某颜色（赞助方应援色） */
  paintSelectedSticks(color: number) {
    if (this.locked || this.selectedIds.size === 0) return 0;
    let n = 0;
    for (const id of this.selectedIds) {
      if (!this.state.filled(id)) continue;
      this.state.stickColor[id] = color;
      const sp = this.sprites[id];
      sp.stick.tint = color;
      sp.glow.tint = color;
      n++;
    }
    this.emitStats(true);
    return n;
  }

  clearSelection() {
    this.applySelection(new Set());
    this.selectRing.visible = false;
    this.cb.onPick(null);
  }

  getSelectionCount() {
    return this.selectedIds.size;
  }

  getSelectedRows(): number[] {
    const rows = new Set<number>();
    for (const id of this.selectedIds) rows.add(this.venue.seats[id].row);
    return [...rows].sort((a, b) => a - b);
  }

  /** 选中指定排（12..18 排演示用） */
  selectRows(rowMin: number, rowMax: number) {
    const ids = new Set<number>();
    for (const seat of this.venue.seats) {
      if (seat.row >= rowMin && seat.row <= rowMax) ids.add(seat.id);
    }
    this.applySelection(ids);
  }

  setMaskedRows(rows: number[]) {
    // 先恢复旧遮罩
    for (const r of this.maskedRows) this.setRowMask(r, false);
    this.maskedRows.clear();
    for (const r of rows) {
      this.maskedRows.add(r);
      this.setRowMask(r, true);
    }
    this.refreshMaskGraphics();
    this.emitStats(true);
  }

  getMaskedRows() {
    return [...this.maskedRows].sort((a, b) => a - b);
  }

  private setRowMask(row: number, on: boolean) {
    for (const id of this.venue.rows[row - 1]) {
      if (on) this.state.flags[id] |= Flags.Masked;
      else this.state.flags[id] &= ~Flags.Masked;
      const sp = this.sprites[id];
      sp.body.visible = false;
      sp.stick.visible = false;
      sp.glow.visible = false;
    }
  }

  private refreshMaskGraphics() {
    for (const g of this.maskRects) g.destroy();
    this.maskRects = [];
    for (const r of this.maskedRows) {
      const rowSeats = this.venue.rows[r - 1].map((id) => this.venue.seats[id]);
      const x0 = Math.min(...rowSeats.map((s) => s.x)) - 14;
      const x1 = Math.max(...rowSeats.map((s) => s.x)) + 14;
      const y = rowSeats.find((s) => s.sectionId === 'C')?.y ?? rowSeats[0].y;
      const g = new Graphics()
        .roundRect(x0, y - VENUE_CONST.ROW_GAP / 2, x1 - x0, VENUE_CONST.ROW_GAP, 6)
        .fill({ color: 0x05060a, alpha: 0.82 })
        .stroke({ width: 1.5, color: 0xff5566, alpha: 0.8 });
      const label = new Text({
        text: `道具遮挡 · 第 ${r} 排`,
        style: new TextStyle({ fill: 0xff8896, fontSize: 12, fontWeight: '700' }),
      });
      label.anchor.set(0, 0.5);
      label.position.set(x0 + 8, y);
      g.addChild(label);
      this.viewport.addChild(g);
      this.maskRects.push(g);
    }
  }

  /** 曲目段落滑块：进度 0..100，按排延迟形成人浪 */
  setSongProgress(progress: number) {
    const seg =
      this.segments.find((s) => progress >= s.start && progress < s.end) ??
      this.segments[this.segments.length - 1];
    const local = (progress - seg.start) / Math.max(1e-6, seg.end - seg.start); // 段内 0..1

    for (let r = 1; r <= this.venue.rowCount; r++) {
      let ratio: number;
      if (r <= 20) ratio = seg.stand[0];
      else if (r <= 40) ratio = seg.stand[1];
      else ratio = seg.stand[2];
      // 前区先动、向后逐排延迟，形成波浪
      const wave = Math.max(0, Math.min(1, local * 1.4 - (r - 1) * 0.012));
      const rowRatio = ratio * wave;
      for (const id of this.venue.rows[r - 1]) {
        if (!this.state.filled(id) || this.state.masked(id)) continue;
        const t = this.types[this.state.typeId[id]];
        // 个人倾向 + 段落比例混合
        const personal = 0.5 + t.standChance * 0.5;
        const stand = rowRatio > 0 && hash01(id * 31 + 7) < rowRatio * personal;
        this.state.targetPose[id] = stand ? 1 : 0;
        if (stand) this.state.flags[id] |= Flags.Standing;
        else this.state.flags[id] &= ~Flags.Standing;
      }
    }
    this.emitStats(true);
  }

  getPersonInfo(id: number): PersonInfo | null {
    if (id < 0 || !this.state.filled(id)) return null;
    const seat = this.venue.seats[id];
    const t = this.types[this.state.typeId[id]];
    return {
      seatId: id,
      code: seat.code,
      sectionName: this.venue.sections.find((s) => s.id === seat.sectionId)!.name,
      row: seat.row,
      seatInRow: seat.seatInRow,
      typeName: t.name,
      bodyColor: this.state.bodyColor[id],
      stickColor: this.state.stickColor[id],
      standing: this.state.pose[id] > 0.5,
      masked: this.state.masked(id),
      sponsor: seat.sponsor,
      x: seat.x,
      y: seat.y,
    };
  }

  /** 透视预览读取数据 */
  getPreviewData() {
    return {
      seats: this.venue.seats,
      state: this.state,
      selectedIds: this.selectedIds,
      sprites: this.sprites,
    };
  }

  /** 检查是否有人被摆到过道 / 舞台边 */
  checkPlacement(): { aisle: number[]; stageEdge: number[]; masked: number } {
    const aisle: number[] = [];
    const stageEdge: number[] = [];
    const { stage } = this.venue;

    // 从中间排实测三个分区的左右边界，得到两条过道的 x 区间
    const refRow = this.venue.rows[Math.floor(this.venue.rowCount / 2)].map((id) => this.venue.seats[id]);
    const extent = (sectionId: string) => {
      const xs = refRow.filter((s) => s.sectionId === sectionId).map((s) => s.x);
      return { min: Math.min(...xs), max: Math.max(...xs) };
    };
    const c = extent('C');
    const l = extent('L');
    const r = extent('R');
    const aisleGaps = [
      { lo: l.max + 4, hi: c.min - 4 },
      { lo: c.max + 4, hi: r.min - 4 },
    ];

    for (const seat of this.venue.seats) {
      if (!this.state.filled(seat.id)) continue;
      if (aisleGaps.some((g) => seat.x > g.lo && seat.x < g.hi)) aisle.push(seat.id);
      if (seat.y < stage.y + stage.height + 46) stageEdge.push(seat.id);
    }
    return { aisle, stageEdge, masked: this.maskedRows.size };
  }

  // ---------- 方案锁定 / 导出 ----------

  lockPlan() {
    this.locked = true;
    this.viewport.plugins.pause('drag');
  }

  unlockPlan() {
    this.locked = false;
    this.viewport.plugins.resume('drag');
  }

  isLocked() {
    return this.locked;
  }

  exportPlan(): string {
    const s = this.state;
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      venue: this.venue.name,
      zones: this.venue.zones,
      types: this.types.map((t) => ({ id: t.id, name: t.name })),
      maskedRows: this.getMaskedRows(),
      lock: this.locked,
      people: Array.from({ length: s.n }, (_, i) =>
        s.filled(i)
          ? [
              i,
              s.typeId[i],
              s.bodyColor[i].toString(16),
              s.stickColor[i].toString(16),
              s.standing(i) ? 1 : 0,
            ]
          : null,
      ).filter(Boolean),
    };
    return JSON.stringify(payload);
  }

  // ---------- 每帧 ----------

  private refreshAllSprites() {
    const s = this.state;
    for (let i = 0; i < s.n; i++) {
      if (!s.filled(i)) continue;
      const sp = this.sprites[i];
      sp.body.tint = s.bodyColor[i];
      sp.stick.tint = s.stickColor[i];
      sp.glow.tint = s.stickColor[i];
    }
  }

  private tick = () => {
    const s = this.state;
    const scale = this.viewport.scale.x;
    const screen = this.app.screen;
    const tl = this.viewport.toWorld(0, 0);
    const br = this.viewport.toWorld(screen.width, screen.height);

    const showGlow = scale > LOD_HIDE_GLOW;
    const showStick = scale > LOD_HIDE_STICK;
    const dotMode = scale < LOD_DOT;
    const margin = 30;
    let drawn = 0;

    for (let i = 0; i < s.n; i++) {
      const sp = this.sprites[i];
      if (!s.filled(i) || s.masked(i)) {
        if (sp.body.visible) {
          sp.body.visible = false;
          sp.stick.visible = false;
          sp.glow.visible = false;
        }
        continue;
      }
      const x = this.pos[i * 2];
      const y = this.pos[i * 2 + 1];
      if (
        x < tl.x - margin || x > br.x + margin ||
        y < tl.y - margin || y > br.y + margin
      ) {
        if (sp.body.visible) {
          sp.body.visible = false;
          sp.stick.visible = false;
          sp.glow.visible = false;
        }
        continue;
      }

      // 姿态缓动
      const cur = s.pose[i];
      const target = s.targetPose[i];
      if (cur !== target) {
        const next = cur + (target - cur) * 0.12;
        s.pose[i] = Math.abs(target - next) < 0.01 ? target : next;
      }
      const pose = s.pose[i];

      const bodyTex = pose > 0.5 ? this.tex.bodyStand : this.tex.bodySit;
      if (sp.body.texture !== bodyTex) sp.body.texture = bodyTex;
      sp.body.visible = true;

      const press = this.types[s.typeId[i]].id === 'press';

      if (dotMode) {
        // 最远 LOD：整个人变成明显的服装色点，在远处连成应援色块
        sp.body.scale.set(1.15);
        sp.body.alpha = 0.95;
        sp.stick.visible = false;
        sp.glow.visible = false;
        drawn++;
        continue;
      }
      sp.body.alpha = 1;
      sp.body.scale.set(1 + pose * 0.22);

      sp.stick.visible = showStick && !press;
      if (sp.stick.visible) {
        sp.stick.scale.set(1, 0.7 + pose * 0.6);
        sp.stick.alpha = 0.95;
      }
      sp.glow.visible = showGlow && !press;
      if (sp.glow.visible) {
        sp.glow.scale.set(0.7 + pose * 0.25);
        sp.glow.alpha = 0.55 + pose * 0.3;
      }
      drawn++;
    }

    // 选中高亮环始终置顶
    if (this.selectedIds.size === 1 && !this.locked) {
      const id = [...this.selectedIds][0];
      if (s.filled(id) && !s.masked(id)) {
        const seat = this.venue.seats[id];
        this.selectRing.visible = true;
        this.selectRing.position.set(seat.x, seat.y);
        const pulse = 1 + Math.sin(this.app.ticker.lastTime / 180) * 0.12;
        this.selectRing.scale.set(pulse);
      } else {
        this.selectRing.visible = false;
      }
    } else if (this.selectedIds.size !== 1) {
      this.selectRing.visible = false;
    }

    // FPS + 统计节流上报
    this.fpsAcc += this.app.ticker.deltaMS;
    this.fpsFrames++;
    this.statsTimer += this.app.ticker.deltaMS;
    if (this.statsTimer > 250) {
      this.fps = Math.round(1000 / (this.fpsAcc / this.fpsFrames));
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      this.statsTimer = 0;
      this.emitStats(false, drawn);
    }
  };

  private emitStats(force: boolean, drawnOverride?: number) {
    void force;
    const s = this.state;
    let filled = 0;
    let standing = 0;
    let masked = 0;
    for (let i = 0; i < s.n; i++) {
      if (!s.filled(i)) continue;
      filled++;
      if (s.masked(i)) {
        masked++;
        continue;
      }
      if (s.pose[i] > 0.5) standing++;
    }
    this.cb.onStats({
      total: s.n,
      filled,
      selected: this.selectedIds.size,
      standing,
      masked,
      fps: this.fps,
      drawnSprites: drawnOverride ?? 0,
    });
  }

  fitView() {
    const seats = this.venue.seats;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of seats) {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.y > maxY) maxY = s.y;
    }
    // 把舞台也框进来
    minY = Math.min(minY, this.venue.stage.y);
    const padX = 80;
    const padY = 90;
    const w = maxX - minX + padX * 2;
    const h = maxY - minY + padY * 2;
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    // 场馆偏宽：在完整可见与高度撑满之间取折中，横向超出部分靠平移巡视
    const scaleByHeight = screenH / h;
    const scaleByWidth = screenW / w;
    const scale = Math.min(scaleByHeight, scaleByWidth * 1.45);
    this.viewport.setZoom(scale);
    this.viewport.moveCenter((minX + maxX) / 2, (minY + maxY) / 2);
  }

  destroy() {
    if (!this.initialized) return;
    this.resizeObserver?.disconnect();
    this.app.destroy(true, { children: true, texture: true });
  }
}

function hash01(seed: number): number {
  let h = (seed * 374761393 + 668265263) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
