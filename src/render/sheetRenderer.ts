import paper from 'paper';
import type {
  AtlasPageInfo,
  ComputedAtlas,
  ProjectDocument,
  Vec2,
} from '../types';
import {
  formatChainage,
  locateAtChainage,
  locateAtDistance,
  normalAt,
  offsetPointAtDistance,
} from '../geometry/alignment';
import { findSelfIntersections } from '../geometry/topology';
import { ellipsePolygon } from '../geometry/paperBooleans';
import { drawEngineeringText, mm, measureEngineeringTextMm } from './engineeringFont';
import { FRAME, PlanTransform, SHEET, type MmRect } from './layout';
import { circlePath, polygonPath, rectPath } from './paperDraw';
import { drawFurniture } from './furnitureRenderer';
import { drawTable, type TableColumn } from './tableRenderer';

export interface SheetRenderResult {
  mapContentBoundsMm?: MmRect;
  furnitureGroups: Map<string, paper.Group>;
}

const COLORS = {
  redline: '#c1121f',
  grassFill: 'rgba(214,178,122,0.30)',
  grassStroke: '#8a5a2b',
  grid: 'rgba(161,98,7,0.82)',
  forestFill: 'rgba(106,168,79,0.24)',
  forestStroke: '#2f7d32',
  magenta: '#d000d8',
};

export function renderSheet(
  canvas: HTMLCanvasElement,
  doc: ProjectDocument,
  computed: ComputedAtlas,
): SheetRenderResult {
  canvas.width = SHEET.widthMm * 4;
  canvas.height = SHEET.heightMm * 4;
  paper.setup(canvas);
  // 固定 Paper 用户坐标系为 4px/mm；CSS 只负责等比缩小，避免 Paper 按客户区重建分辨率。
  paper.view.viewSize = new paper.Size(SHEET.widthMm * 4, SHEET.heightMm * 4);
  paper.project.clear();

  const furnitureGroups = new Map<string, paper.Group>();

  rectPath(0, 0, SHEET.widthMm, SHEET.heightMm, { fillColor: '#ffffff', strokeColor: 'rgba(0,0,0,0)' });

  const page = computed.pages.find((item) => item.id === doc.currentPageId) ?? computed.pages[0];
  drawFrame(doc, page, computed);

  let mapBounds: MmRect | undefined;
  if (page.kind === 'plan') {
    mapBounds = drawPlanPage(doc, computed, page);
  } else {
    drawQuantityPage(doc, computed, page);
  }

  if (isLayerVisible(doc, 'layer-legend')) {
    for (const group of drawFurniture(doc, page)) {
      paper.project.activeLayer.addChild(group);
      const id = group.data.furnitureId as string;
      if (id) furnitureGroups.set(id, group);
    }
  }

  return { mapContentBoundsMm: mapBounds, furnitureGroups };
}

function isLayerVisible(doc: ProjectDocument, layerId: string): boolean {
  return doc.layers.find((layer) => layer.id === layerId)?.visible ?? true;
}

function addText(group: paper.Group | paper.Layer, text: string, x: number, y: number, size = 3, options: {
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  color?: string;
  halo?: boolean;
} = {}): paper.Item {
  const align = options.align ?? 'left';
  if (options.halo) {
    const textWidth = measureEngineeringTextMm(text, size);
    const padX = 1.15;
    const boxH = size * 1.35;
    let boxX = x - padX;
    if (align === 'center') boxX = x - textWidth / 2 - padX;
    if (align === 'right' || align === 'end') boxX = x - textWidth - padX;
    group.addChild(rectPath(boxX, y - 0.35, textWidth + padX * 2, boxH, {
      fillColor: 'rgba(255,255,255,0.9)',
      strokeColor: 'rgba(15,23,42,0.14)',
      strokeWidth: 0.15,
    }));
  }

  const item = drawEngineeringText({
    xMm: x,
    yMm: y,
    text,
    sizeMm: size,
    align,
    baseline: options.baseline ?? 'top',
    color: options.color ?? '#17212b',
  });
  group.addChild(item);
  return item;
}

function drawFrame(doc: ProjectDocument, page: AtlasPageInfo, computed: ComputedAtlas): void {
  if (!isLayerVisible(doc, 'layer-frame')) return;
  const layer = paper.project.activeLayer;

  rectPath(FRAME.outer.x, FRAME.outer.y, FRAME.outer.w, FRAME.outer.h, {
    fillColor: 'rgba(0,0,0,0)',
    strokeColor: '#111827',
    strokeWidth: 0.35,
  });
  rectPath(FRAME.inner.x, FRAME.inner.y, FRAME.inner.w, FRAME.inner.h, {
    fillColor: 'rgba(0,0,0,0)',
    strokeColor: '#111827',
    strokeWidth: 0.8,
  });

  addText(layer, doc.lineName, 18, 15.5, 4.6, { color: '#111827' });
  addText(layer, doc.name, 210, 16.2, 4.1, { align: 'center', color: '#111827' });
  addText(layer, `第 ${page.index + 1} / ${computed.pages.length} 页`, 402, 16.4, 3.2, { align: 'right' });

  if (page.kind === 'plan') {
    rectPath(FRAME.map.x, FRAME.map.y, FRAME.map.w, FRAME.map.h, {
      fillColor: '#fbfcfd',
      strokeColor: '#111827',
      strokeWidth: 0.55,
    });
    addText(layer, page.title, FRAME.map.x + 3, FRAME.map.y + 2.5, 3.1);
    rectPath(FRAME.side.x, FRAME.side.y, FRAME.side.w, FRAME.side.h, {
      fillColor: '#fbfcfd',
      strokeColor: '#334155',
      strokeWidth: 0.45,
    });
  }

  drawTitleBlock(doc, page, computed);
}

function drawTitleBlock(doc: ProjectDocument, page: AtlasPageInfo, computed: ComputedAtlas): void {
  const layer = paper.project.activeLayer;
  const t = FRAME.title;
  rectPath(t.x, t.y, t.w, t.h, { fillColor: '#ffffff', strokeColor: '#111827', strokeWidth: 0.6 });
  const col1 = t.x + 168;
  const col2 = t.x + 272;
  [col1, col2].forEach((x) => {
    layer.addChild(new paper.Path.Line({ from: [mm(x), mm(t.y)], to: [mm(x), mm(t.y + t.h)], strokeColor: '#111', strokeWidth: mm(0.35) }));
  });
  [t.y + 13.5, t.y + 27].forEach((y) => {
    layer.addChild(new paper.Path.Line({ from: [mm(col1), mm(y)], to: [mm(t.x + t.w), mm(y)], strokeColor: '#111', strokeWidth: mm(0.3) }));
  });

  addText(layer, '草方格—林带防护布置图', t.x + 8, t.y + 7, 5.2);
  addText(layer, page.shortTitle.includes('材料') ? '材料数量汇总 / 续页' : '平面布置图 / 结构化图册', t.x + 8, t.y + 24, 3.4);

  addText(layer, '项目', col1 + 3, t.y + 2.5, 2.7, { color: '#64748b' });
  addText(layer, doc.sectionName, col1 + 14, t.y + 2.4, 3.1);
  addText(layer, '比例', col1 + 3, t.y + 16, 2.7, { color: '#64748b' });
  addText(layer, `1:${doc.scaleDenominator}`, col1 + 14, t.y + 15.8, 3.1);
  addText(layer, '设计', col1 + 3, t.y + 29.5, 2.7, { color: '#64748b' });
  addText(layer, doc.engineer, col1 + 14, t.y + 29.3, 3.1);

  addText(layer, '日期', col2 + 3, t.y + 2.5, 2.7, { color: '#64748b' });
  addText(layer, doc.date, col2 + 14, t.y + 2.4, 3.1);
  addText(layer, '桩号', col2 + 3, t.y + 16, 2.7, { color: '#64748b' });
  const chainText = page.startChainage !== undefined ? formatChainage((page.startChainage + page.endChainage!) / 2) : '汇总';
  addText(layer, chainText, col2 + 14, t.y + 15.8, 3.1);
  addText(layer, '页数', col2 + 3, t.y + 29.5, 2.7, { color: '#64748b' });
  addText(layer, `${page.index + 1}/${computed.pages.length}`, col2 + 14, t.y + 29.3, 3.1);
}

function drawPlanPage(doc: ProjectDocument, computed: ComputedAtlas, page: AtlasPageInfo): MmRect | undefined {
  const transform = new PlanTransform(doc, page);
  const mapGroup = new paper.Group({ name: 'map-content' });

  const startRel = (page.startChainage ?? doc.alignment.startChainage) - doc.alignment.startChainage;
  const endRel = (page.endChainage ?? startRel + doc.pageSpanM) - doc.alignment.startChainage;
  const totalLength = computed.alignmentLengthM;
  const s0 = Math.max(0, startRel - 12);
  const s1 = Math.min(totalLength, endRel + 12);

  if (isLayerVisible(doc, 'layer-grass') || isLayerVisible(doc, 'layer-forest')) {
    for (const q of computed.quantities.bands) {
      if (q.band.kind === 'grass' && !isLayerVisible(doc, 'layer-grass')) continue;
      if (q.band.kind === 'forest' && !isLayerVisible(doc, 'layer-forest')) continue;
      drawBand(mapGroup, doc, q, transform, s0, s1);
    }
  }

  if (isLayerVisible(doc, 'layer-alignment')) {
    drawAlignmentAndStations(mapGroup, doc, computed, page, transform, s0, s1);
  }

  if (isLayerVisible(doc, 'layer-grass')) {
    drawRepairMarkers(mapGroup, doc, computed, page, transform);
  }

  // 裁剪到图框，避免跨页几何溢出。必须先放裁剪路径再开启 clipped。
  const clip = rectPath(FRAME.map.x, FRAME.map.y, FRAME.map.w, FRAME.map.h, { insert: false });
  const clipped = new paper.Group();
  clipped.addChild(clip);
  clipped.addChild(mapGroup);
  clipped.clipped = true;
  paper.project.activeLayer.addChild(clipped);

  if (isLayerVisible(doc, 'layer-table')) drawPlanSideTables(doc, computed);

  return mapGroup.bounds
    ? {
        x: mapGroup.bounds.x / 4,
        y: mapGroup.bounds.y / 4,
        width: mapGroup.bounds.width / 4,
        height: mapGroup.bounds.height / 4,
      }
    : undefined;
}

function mappedLoop(transform: PlanTransform, loop: Vec2[]): Vec2[] {
  return loop.map((point) => transform.map(point));
}

function buildBandCompound(transform: PlanTransform, geometry: ComputedAtlas['quantities']['bands'][number]['geometry'], attrs: Record<string, unknown>): paper.CompoundPath {
  const compound = new paper.CompoundPath({ fillRule: 'evenodd', ...attrs });
  for (const loop of geometry.loops.length ? geometry.loops : geometry.outerLoops) {
    const mapped = mappedLoop(transform, loop);
    const path = new paper.Path({
      segments: mapped.map((p) => [mm(p.x), mm(p.y)]),
      closed: true,
    });
    compound.addChild(path);
  }
  return compound;
}

function drawBand(
  parent: paper.Group,
  doc: ProjectDocument,
  q: ComputedAtlas['quantities']['bands'][number],
  transform: PlanTransform,
  s0: number,
  s1: number,
): void {
  const isGrass = q.band.kind === 'grass';
  const fill = isGrass ? COLORS.grassFill : COLORS.forestFill;
  const stroke = isGrass ? COLORS.grassStroke : COLORS.forestStroke;

  const area = buildBandCompound(transform, q.geometry, {
    fillColor: fill,
    strokeColor: stroke,
    strokeWidth: mm(0.45),
  });
  parent.addChild(area);

  if (isGrass) {
    drawGrassGrid(parent, doc, q, transform, s0, s1, area);
  } else {
    drawForestRows(parent, doc, q, transform, s0, s1, area);
  }
}

function drawGrassGrid(
  parent: paper.Group,
  doc: ProjectDocument,
  q: ComputedAtlas['quantities']['bands'][number],
  transform: PlanTransform,
  s0: number,
  s1: number,
  area: paper.CompoundPath,
): void {
  const a = Math.max(0.2, doc.grass.cellAlong);
  const b = Math.max(0.2, doc.grass.cellAcross);
  const grid = new paper.Path({
    strokeColor: COLORS.grid,
    strokeWidth: mm(Math.max(0.12, Math.min(0.55, transform.mapLength(doc.grass.ridgeWidth) * 0.75))),
  });

  // 顺里程方向的纵向格线
  for (let offset = q.band.offsetStart; offset <= q.band.offsetStart + q.band.width + 1e-6; offset += b) {
    let first = true;
    for (let s = s0; s <= s1 + 1e-6; s += 4) {
      const model = offsetPointAtDistance(doc.alignment.points, Math.min(s, s1), offset, q.band.side);
      const p = transform.map(model);
      if (first) {
        grid.moveTo([mm(p.x), mm(p.y)]);
        first = false;
      } else grid.lineTo([mm(p.x), mm(p.y)]);
    }
  }

  // 横断面方向格线，间距为纵向方格规格
  const firstS = Math.ceil(s0 / a) * a;
  for (let s = firstS; s <= s1 + 1e-6; s += a) {
    const p1 = transform.map(offsetPointAtDistance(doc.alignment.points, s, q.band.offsetStart, q.band.side));
    const p2 = transform.map(offsetPointAtDistance(doc.alignment.points, s, q.band.offsetStart + q.band.width, q.band.side));
    grid.moveTo([mm(p1.x), mm(p1.y)]);
    grid.lineTo([mm(p2.x), mm(p2.y)]);
  }

  const clipGroup = new paper.Group();
  const clipCopy = area.clone({ insert: false }) as paper.PathItem;
  clipGroup.addChild(clipCopy);
  clipGroup.addChild(grid);
  clipGroup.clipped = true;
  parent.addChild(clipGroup);
}

function pointInsideLoops(point: Vec2, loops: Vec2[][]): boolean {
  return loops.some((loop) => {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const xi = loop[i].x;
      const yi = loop[i].y;
      const xj = loop[j].x;
      const yj = loop[j].y;
      const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  });
}

function drawForestRows(
  parent: paper.Group,
  doc: ProjectDocument,
  q: ComputedAtlas['quantities']['bands'][number],
  transform: PlanTransform,
  s0: number,
  s1: number,
  area: paper.CompoundPath,
): void {
  const usableWidth = Math.max(0, q.band.width - doc.forest.edgeMargin * 2);
  const rowCount = Math.max(1, Math.floor(usableWidth / doc.forest.rowSpacing) + 1);
  const mid = q.band.offsetStart + q.band.width / 2;
  const offsets: number[] = [];
  if (rowCount === 1) offsets.push(mid);
  else {
    for (let r = 0; r < rowCount; r += 1) {
      offsets.push(q.band.offsetStart + doc.forest.edgeMargin + (usableWidth * r) / (rowCount - 1));
    }
  }

  const rowLine = new paper.Path({ strokeColor: 'rgba(47,125,50,0.35)', strokeWidth: mm(0.22), dashArray: [mm(1.2), mm(1.2)] });
  for (const offset of offsets) {
    let first = true;
    for (let s = s0; s <= s1 + 1e-6; s += 5) {
      const p = transform.map(offsetPointAtDistance(doc.alignment.points, Math.min(s, s1), offset, q.band.side));
      if (first) {
        rowLine.moveTo([mm(p.x), mm(p.y)]);
        first = false;
      } else rowLine.lineTo([mm(p.x), mm(p.y)]);
    }
  }
  const forestContent = new paper.Group();
  forestContent.addChild(rowLine);

  const byColor = new Map<string, paper.Path>();
  const spacing = Math.max(0.5, doc.forest.plantSpacing);
  const outer = q.geometry.outerLoops.length ? q.geometry.outerLoops : q.geometry.loops;

  for (let r = 0; r < offsets.length; r += 1) {
    for (let s = Math.floor(s0 / spacing) * spacing; s <= s1 + 1e-6; s += spacing) {
      const model = offsetPointAtDistance(doc.alignment.points, s, offsets[r], q.band.side);
      if (!pointInsideLoops(model, outer)) continue;
      if (q.geometry.holes.some((hole) => pointInsideLoops(model, [hole]))) continue;

      const species = doc.forest.species[(r + Math.round(s / spacing)) % Math.max(1, doc.forest.species.length)];
      const color = species?.color ?? COLORS.forestStroke;
      if (!byColor.has(color)) byColor.set(color, new paper.Path({ strokeColor: color, strokeWidth: mm(0.55), strokeCap: 'round' }));
      const symbolPath = byColor.get(color)!;
      const p = transform.map(model);
      const radius = 0.85;
      symbolPath.moveTo([mm(p.x - radius), mm(p.y)]);
      symbolPath.lineTo([mm(p.x + radius), mm(p.y)]);
      symbolPath.moveTo([mm(p.x), mm(p.y - radius)]);
      symbolPath.lineTo([mm(p.x), mm(p.y + radius)]);
    }
  }
  byColor.forEach((path) => forestContent.addChild(path));

  // 偏移线在急弯处可能折叠；与苗木点一起按布尔修复后的林带裁剪。
  const clipGroup = new paper.Group();
  const clipCopy = area.clone({ insert: false }) as paper.PathItem;
  clipGroup.addChild(clipCopy);
  clipGroup.addChild(forestContent);
  clipGroup.clipped = true;
  parent.addChild(clipGroup);
}

function drawAlignmentAndStations(
  parent: paper.Group,
  doc: ProjectDocument,
  computed: ComputedAtlas,
  page: AtlasPageInfo,
  transform: PlanTransform,
  s0: number,
  s1: number,
): void {
  const redLine = new paper.Path({ strokeColor: COLORS.redline, strokeWidth: mm(0.85) });
  let first = true;
  for (let s = s0; s <= s1 + 1e-6; s += 4) {
    const p = transform.map(locateAtDistance(doc.alignment.points, Math.min(s, s1)).position);
    if (first) {
      redLine.moveTo([mm(p.x), mm(p.y)]);
      first = false;
    } else redLine.lineTo([mm(p.x), mm(p.y)]);
  }
  parent.addChild(redLine);

  const startChainage = page.startChainage ?? doc.alignment.startChainage;
  const endChainage = page.endChainage ?? startChainage;
  for (const station of computed.stations) {
    if (station.chainage < startChainage - 1 || station.chainage > endChainage + 1) continue;
    const p = transform.map(station.position);
    const tv = transform.mapVector(station.tangent);
    const len = Math.hypot(tv.x, tv.y) || 1;
    const tn = { x: tv.x / len, y: tv.y / len };
    const perp = { x: -tn.y, y: tn.x };
    const tick = station.kind === 'km' ? 2.8 : station.kind === 'hm' ? 2.1 : 1.5;
    parent.addChild(new paper.Path.Line({
      from: [mm(p.x - perp.x * tick), mm(p.y - perp.y * tick)],
      to: [mm(p.x + perp.x * tick), mm(p.y + perp.y * tick)],
      strokeColor: station.kind === 'curve' ? '#7c3aed' : '#111827',
      strokeWidth: mm(station.kind === 'km' ? 0.65 : 0.4),
    }));

    const labelOffset = station.kind === 'km' ? 4.2 : 3.4;
    const lx = p.x + perp.x * labelOffset;
    const ly = p.y + perp.y * labelOffset;
    const text = addText(parent as unknown as paper.Layer, station.label, lx, ly - 1.4, station.kind === 'km' ? 3.2 : 2.55, {
      align: 'center',
      color: station.kind === 'curve' ? '#6d28d9' : '#111827',
      halo: true,
    });
    text.data.stationId = station.id;
  }
}

function drawRepairMarkers(
  parent: paper.Group,
  doc: ProjectDocument,
  computed: ComputedAtlas,
  page: AtlasPageInfo,
  transform: PlanTransform,
): void {
  const startChainage = page.startChainage ?? doc.alignment.startChainage;
  const endChainage = page.endChainage ?? startChainage;

  for (const q of computed.quantities.bands) {
    if (!q.geometry.selfIntersectionCount) continue;
    const hits = findSelfIntersections(q.geometry.rawBoundary);
    for (const hit of hits.slice(0, 14)) {
      const p = transform.map(hit.point);
      if (p.x < FRAME.map.x || p.x > FRAME.map.x + FRAME.map.w || p.y < FRAME.map.y || p.y > FRAME.map.y + FRAME.map.h) continue;
      parent.addChild(circlePath(p.x, p.y, 0.72, { fillColor: 'rgba(208,0,216,0.12)', strokeColor: COLORS.magenta, strokeWidth: 0.32 }));
    }
  }

  const issue = computed.quantities.issues.find((item) => item.severity === 'warning' && item.chainage && item.chainage >= startChainage && item.chainage <= endChainage);
  if (issue?.chainage) {
    const model = locateAtChainage(doc.alignment, issue.chainage).position;
    const p = transform.map(model);
    const x = Math.min(Math.max(p.x + 8, FRAME.map.x + 4), FRAME.map.x + FRAME.map.w - 42);
    const y = Math.min(Math.max(p.y - 20, FRAME.map.y + 4), FRAME.map.y + FRAME.map.h - 18);
    parent.addChild(rectPath(x, y, 39, 13.5, { fillColor: 'rgba(253, 244, 255, 0.94)', strokeColor: COLORS.magenta, strokeWidth: 0.5 }));
    addText(parent as unknown as paper.Layer, '自交处已拆开', x + 19.5, y + 2, 2.9, { align: 'center', color: '#86198f' });
    addText(parent as unknown as paper.Layer, '布尔重排/面积重算', x + 19.5, y + 6.2, 2.45, { align: 'center', color: '#86198f' });
  }
}

function drawPlanSideTables(doc: ProjectDocument, computed: ComputedAtlas): void {
  const q = computed.quantities;
  const layer = paper.project.activeLayer;
  addText(layer, '材料 / 苗木同步表', FRAME.side.x + 4, FRAME.side.y + 3, 3.4);

  const summaryColumns: TableColumn[] = [
    { key: 'name', title: '项目', widthMm: 52, align: 'left' },
    { key: 'value', title: '数量', widthMm: 53, align: 'right' },
  ];
  drawTable(FRAME.side.x + 3, FRAME.side.y + 10, summaryColumns, [
    { name: '草方格净面积', value: `${q.grassAreaM2.toFixed(0)} ㎡` },
    { name: '折合公顷', value: `${q.grassAreaHa.toFixed(2)} ha` },
    { name: '方格数量', value: q.grassCells.toLocaleString('zh-CN') },
    { name: '草料用量', value: `${q.grassT.toFixed(2)} t` },
    { name: '林带净面积', value: `${q.forestAreaM2.toFixed(0)} ㎡` },
    { name: '设计株数', value: q.plantCount.toLocaleString('zh-CN') },
    { name: '需苗量', value: q.seedlingCount.toLocaleString('zh-CN') },
  ], { rowHeightMm: 5.7, headerHeightMm: 6.2, fontSizeMm: 2.55 });

  const seedY = FRAME.side.y + 64;
  addText(layer, '苗木表', FRAME.side.x + 4, seedY, 3.2);
  const speciesColumns: TableColumn[] = [
    { key: 'name', title: '树种', widthMm: 39, align: 'left' },
    { key: 'design', title: '设计', widthMm: 29, align: 'right' },
    { key: 'seed', title: '需苗', widthMm: 37, align: 'right' },
  ];
  drawTable(FRAME.side.x + 3, seedY + 6, speciesColumns, q.species.map((s) => ({
    name: s.species.name,
    design: s.designCount.toLocaleString('zh-CN'),
    seed: s.seedlingCount.toLocaleString('zh-CN'),
  })), { rowHeightMm: 5.8, headerHeightMm: 6.2, fontSizeMm: 2.5 });

  const issueY = seedY + 34;
  rectPath(FRAME.side.x + 3, issueY, FRAME.side.w - 6, 55, {
    fillColor: q.issues.length ? '#fff7ed' : '#f0fdf4',
    strokeColor: q.issues.length ? '#f97316' : '#16a34a',
    strokeWidth: 0.4,
  });
  addText(layer, q.issues.length ? `约束检查（${q.issues.length}）` : '约束检查通过', FRAME.side.x + 6, issueY + 2.5, 3, {
    color: q.issues.length ? '#9a3412' : '#166534',
  });
  const lines = q.issues.length
    ? wrapChinese(`${q.issues[0].title}；${q.issues[0].detail}`, 27).slice(0, 11)
    : ['无未闭合路径；图例避让与表格分页约束正常。'] ;
  lines.forEach((line, i) => addText(layer, line, FRAME.side.x + 6, issueY + 9 + i * 4.05, 2.35, { color: '#431407' }));
}

function wrapChinese(text: string, maxChars: number): string[] {
  const result: string[] = [];
  let line = '';
  for (const char of text) {
    line += char;
    if (line.length >= maxChars) {
      result.push(line);
      line = '';
    }
  }
  if (line) result.push(line);
  return result;
}

function drawQuantityPage(doc: ProjectDocument, computed: ComputedAtlas, page: AtlasPageInfo): void {
  const layer = paper.project.activeLayer;
  addText(layer, page.title, 210, 27, 6, { align: 'center' });
  addText(layer, `${doc.lineName} · ${doc.sectionName} · 规格 ${doc.grass.cellAlong}×${doc.grass.cellAcross}m / 株距${doc.forest.plantSpacing}m / 行距${doc.forest.rowSpacing}m`, 210, 37, 3.1, { align: 'center' });

  const q = computed.quantities;
  const metrics = [
    ['草方格面积', `${q.grassAreaM2.toFixed(0)}㎡`],
    ['草料', `${q.grassT.toFixed(2)}t`],
    ['方格数', q.grassCells.toLocaleString('zh-CN')],
    ['设计株数', q.plantCount.toLocaleString('zh-CN')],
    ['需苗量', q.seedlingCount.toLocaleString('zh-CN')],
    ['图册页数', `${computed.pages.length}页`],
  ];
  const cardW = 62;
  metrics.forEach(([label, value], i) => {
    const x = 18 + i * (cardW + 2.4);
    rectPath(x, 45, cardW, 15, { fillColor: '#f1f5f9', strokeColor: '#94a3b8', strokeWidth: 0.35 });
    addText(layer, label, x + cardW / 2, 47.2, 2.7, { align: 'center', color: '#475569' });
    addText(layer, value, x + cardW / 2, 52.7, 3.7, { align: 'center' });
  });

  const columns: TableColumn[] = [
    { key: 'label', title: '里程区间', widthMm: 90, align: 'center' },
    { key: 'area', title: '草方面积㎡', widthMm: 62, align: 'right' },
    { key: 'cells', title: '方格数量', widthMm: 55, align: 'right' },
    { key: 'kg', title: '草料kg', widthMm: 65, align: 'right' },
    { key: 'plants', title: '设计株数', widthMm: 52, align: 'right' },
    { key: 'seedlings', title: '需苗量', widthMm: 60, align: 'right' },
  ];

  const start = page.tableStartRow ?? 0;
  const count = page.tableRows ?? 0;
  const rows = q.segments.slice(start, start + count).map((row) => ({
    __key: row.id,
    label: row.label,
    area: row.grassAreaM2.toFixed(1),
    cells: row.grassCells.toLocaleString('zh-CN'),
    kg: row.grassKg.toFixed(1),
    plants: row.plantCount.toLocaleString('zh-CN'),
    seedlings: row.seedlingCount.toLocaleString('zh-CN'),
  }));

  const firstPage = start === 0;
  const tableY = firstPage ? 68 : 66;
  const rowH = firstPage ? 8.2 : 7.1;
  drawTable(18, tableY, columns, rows, { rowHeightMm: rowH, headerHeightMm: 8, fontSizeMm: 2.8, headerFontSizeMm: 3 });

  const endsAllRows = start + count >= q.segments.length;
  if (endsAllRows) {
    const totalY = tableY + 8 + rows.length * rowH;
    drawTable(18, totalY, columns, [{
      label: '合计（布尔净面积）',
      area: q.grassAreaM2.toFixed(1),
      cells: q.grassCells.toLocaleString('zh-CN'),
      kg: q.grassKg.toFixed(1),
      plants: q.plantCount.toLocaleString('zh-CN'),
      seedlings: q.seedlingCount.toLocaleString('zh-CN'),
    }], { rowHeightMm: 8, headerHeightMm: 0.1, fontSizeMm: 2.9, zebra: false, headerFill: '#dbeafe' });
  }

  addText(layer, '说明：本表按完整百米桩段汇总；表行作为最小排版单元整体移至续页，不允许跨页断行。路径自交时先拆分外环，再执行 union/subtract 布尔并按孔洞后净面积计量。', 18, 232, 3.1);
  addText(layer, `导出时间 ${computed.generatedAt} · 结构版本 ${doc.schemaVersion}`, 18, 240, 2.8, { color: '#64748b' });
}

/** 供拖拽结束后使用 Paper 命中测试找到家具 ID。 */
export function findFurnitureIdAt(canvas: HTMLCanvasElement, point: { x: number; y: number }): string | null {
  paper.setup(canvas);
  const hit = paper.project.hitTest(new paper.Point(point.x * 4, point.y * 4), {
    fill: true,
    stroke: true,
    tolerance: 6,
  });
  let item: paper.Item | null = hit?.item ?? null;
  while (item) {
    if (item.data?.furnitureId) return String(item.data.furnitureId);
    item = item.parent;
  }
  return null;
}
