import { createStore, produce, reconcile } from 'solid-js/store';

export const WORLD_W = 1400;
export const WORLD_H = 900;
export const PX_PER_M = 3;
export const DIKE_Y = 415;
export const STORAGE_KEY = 'aquafarm-layout-studio-v1';

export const SPECIES_META = {
  grass: { label: '草鱼', color: '#2563eb', soft: '#93c5fd' },
  shrimp: { label: '南美白对虾', color: '#ea580c', soft: '#fdba74' },
  bass: { label: '加州鲈', color: '#7c3aed', soft: '#c4b5fd' },
  crab: { label: '中华绒螯蟹', color: '#dc2626', soft: '#fca5a5' },
  filter: { label: '鲢鳙套养', color: '#059669', soft: '#6ee7b7' },
  mixed: { label: '草鲫混养', color: '#0891b2', soft: '#67e8f9' },
  cage: { label: '网箱分区', color: '#0891b2', soft: '#a5f3fc' },
};

export const AERATOR_CATALOG = [
  {
    id: 'wheel-15',
    vendor: '渔机目录 · 轻量型',
    model: 'YC-1.5 水车式',
    powerKw: 1.5,
    radiusM: 22,
    depthM: 1.2,
    flowM3h: 42,
  },
  {
    id: 'wheel-22',
    vendor: '厂商目录 · 主推',
    model: 'YC-2.2 水车式',
    powerKw: 2.2,
    radiusM: 28,
    depthM: 1.5,
    flowM3h: 68,
  },
  {
    id: 'wheel-30',
    vendor: '厂商目录 · 深塘型',
    model: 'YC-3.0 水车式',
    powerKw: 3.0,
    radiusM: 34,
    depthM: 1.8,
    flowM3h: 96,
  },
  {
    id: 'wheel-40',
    vendor: '厂商目录 · 宽水面',
    model: 'YC-4.0 水车式',
    powerKw: 4.0,
    radiusM: 40,
    depthM: 2.0,
    flowM3h: 128,
  },
];

export const PAGE_PRESETS = {
  A1L: { id: 'A1L', label: 'A1 横版', wMm: 841, hMm: 594, marginMm: 16, headerMm: 34, footerMm: 18 },
  A3P: { id: 'A3P', label: 'A3 竖版', wMm: 297, hMm: 420, marginMm: 9, headerMm: 25, footerMm: 13 },
};

let idCounter = 100;
export function uid(prefix = 'id') {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function rectPoints(x, y, w, h) {
  return [
    { x: Math.round(x), y: Math.round(y) },
    { x: Math.round(x + w), y: Math.round(y) },
    { x: Math.round(x + w), y: Math.round(y + h) },
    { x: Math.round(x), y: Math.round(y + h) },
  ];
}

export function polygonAreaMu(points) {
  if (!points || points.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  const pxArea = Math.abs(twice) / 2;
  const m2 = pxArea / (PX_PER_M * PX_PER_M);
  return m2 / 666.6667;
}

export function pathLengthM(points) {
  let px = 0;
  for (let i = 1; i < points.length; i += 1) {
    px += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return px / PX_PER_M;
}

export function pointInPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function findPondAt(project, p) {
  for (let i = project.ponds.length - 1; i >= 0; i -= 1) {
    if (pointInPolygon(p, project.ponds[i].points)) return project.ponds[i];
  }
  return null;
}

export function buildPipePoints(aerator, power) {
  if (!aerator || !power) return [];
  const midY = DIKE_Y;
  const raw = [
    { x: aerator.x, y: aerator.y },
    { x: aerator.x, y: midY },
    { x: power.x, y: midY },
    { x: power.x, y: power.y },
  ];
  const out = [];
  for (const p of raw) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1) out.push(p);
  }
  return out;
}

function seedProject() {
  const pondDefs = [
    { code: '1#', x: 70, y: 130, w: 285, h: 245, species: 'grass', spec: '成鱼 1.0–1.5 kg', density: 1200, unit: '尾/亩', source: '2026 秋苗放养单' },
    { code: '2#', x: 385, y: 130, w: 270, h: 245, species: 'grass', spec: '鱼种 100–200 g', density: 2600, unit: '尾/亩', source: '草鱼苗批次 GC-1108' },
    { code: '3#', x: 685, y: 130, w: 280, h: 245, species: 'bass', spec: '标粗种 80–150 g', density: 2200, unit: '尾/亩', source: '鲈鱼台账 LU-2026Q4' },
    { code: '4#', x: 995, y: 130, w: 330, h: 245, species: 'shrimp', spec: '主养 40–60 尾/kg', density: 42000, unit: '尾/亩', source: '虾苗投放 XM-1112' },
    { code: '5#', x: 70, y: 455, w: 370, h: 285, species: 'shrimp', spec: '小棚标粗 P5–P10', density: 68000, unit: '尾/亩', source: '标粗车间转塘单' },
    { code: '6#', x: 475, y: 455, w: 290, h: 285, species: 'crab', spec: '扣蟹 120–160 只/kg', density: 1350, unit: '只/亩', source: '蟹种台账 PB-1101' },
    { code: '7#', x: 800, y: 455, w: 245, h: 285, species: 'filter', spec: '鲢鳙 1.5–2.5 kg', density: 180, unit: '尾/亩', source: '净水套养计划' },
    { code: '8#', x: 1075, y: 455, w: 250, h: 285, species: 'mixed', spec: '草鲫混养 0.5–1.0 kg', density: 1500, unit: '尾/亩', source: '冬片放养汇总' },
  ];

  const ponds = pondDefs.map((p, index) => ({
    id: `pond-${index + 1}`,
    code: p.code,
    name: `${p.code}塘口`,
    points: rectPoints(p.x, p.y, p.w, p.h),
    species: p.species,
    spec: p.spec,
    areaMu: Number(polygonAreaMu(rectPoints(p.x, p.y, p.w, p.h)).toFixed(1)),
    ledgerAreaMu: Number(polygonAreaMu(rectPoints(p.x, p.y, p.w, p.h)).toFixed(1)),
    density: p.density,
    densityUnit: p.unit,
    ledgerSource: p.source,
    stockedAt: '2026-11-18',
  }));

  const cages = [];
  const cageW = 18;
  const cageH = 18;
  const gapX = 10;
  const gapY = 12;
  const cols = 4;
  const rows = 3;
  const totalW = cols * cageW + (cols - 1) * gapX;
  const startX = 825 - totalW / 2;
  const startY = 194;
  let cageNo = 1;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      cages.push({
        id: `cage-${cageNo}`,
        pondId: 'pond-3',
        code: `W3-${String(cageNo).padStart(2, '0')}`,
        x: Math.round(startX + c * (cageW + gapX)),
        y: Math.round(startY + r * (cageH + gapY)),
        w: cageW,
        h: cageH,
        frameM: 6,
        species: 'bass',
        spec: '网箱标粗 80–150 g',
      });
      cageNo += 1;
    }
  }

  const powerPoints = [
    { id: 'power-a', code: '电源 A', x: 430, y: DIKE_Y, capacityKw: 30 },
    { id: 'power-b', code: '电源 B', x: 1010, y: DIKE_Y, capacityKw: 45 },
  ];

  const aeratorDefs = [
    { code: 'AE-01', catalogId: 'wheel-22', x: 212, y: 252, pondId: 'pond-1', powerId: 'power-a' },
    { code: 'AE-02', catalogId: 'wheel-30', x: 520, y: 252, pondId: 'pond-2', powerId: 'power-a' },
    { code: 'AE-03', catalogId: 'wheel-30', x: 1160, y: 258, pondId: 'pond-4', powerId: 'power-b' },
    { code: 'AE-04', catalogId: 'wheel-30', x: 255, y: 600, pondId: 'pond-5', powerId: 'power-a' },
    { code: 'AE-05', catalogId: 'wheel-22', x: 620, y: 600, pondId: 'pond-6', powerId: 'power-a' },
    { code: 'AE-06', catalogId: 'wheel-22', x: 1200, y: 600, pondId: 'pond-8', powerId: 'power-b' },
  ];

  const aerators = aeratorDefs.map((a) => {
    const cat = AERATOR_CATALOG.find((c) => c.id === a.catalogId);
    return {
      id: uid('aer'),
      code: a.code,
      catalogId: cat.id,
      model: cat.model,
      vendor: cat.vendor,
      powerKw: cat.powerKw,
      radiusM: cat.radiusM,
      depthM: cat.depthM,
      x: a.x,
      y: a.y,
      pondId: a.pondId,
      powerId: a.powerId,
    };
  });

  const pipes = aerators
    .filter((a) => a.powerId)
    .map((a, i) => {
      const power = powerPoints.find((p) => p.id === a.powerId);
      return {
        id: `pipe-${i + 1}`,
        code: `GL-${String(i + 1).padStart(2, '0')}`,
        aeratorId: a.id,
        powerPointId: a.powerId,
        diameterMm: 63,
        points: buildPipePoints(a, power),
      };
    });

  const routePoints = [
    { x: 100, y: DIKE_Y },
    { x: 430, y: DIKE_Y },
    { x: 700, y: DIKE_Y },
    { x: 1010, y: DIKE_Y },
    { x: 1300, y: DIKE_Y },
    { x: 1300, y: 742 },
    { x: 120, y: 742 },
    { x: 120, y: DIKE_Y },
  ];

  const feedPointDefs = [
    [210, DIKE_Y, 18, '草鱼颗粒料'],
    [520, DIKE_Y, 16, '草鱼鱼种破碎料'],
    [825, DIKE_Y, 20, '鲈鱼膨化料'],
    [1160, DIKE_Y, 15, '对虾配合料'],
    [255, 742, 22, '虾苗粉料'],
    [620, 742, 18, '河蟹颗粒料'],
    [920, 742, 14, '鲢鳙粉料'],
    [1200, 742, 16, '草鲫混养料'],
  ];

  const feedPoints = feedPointDefs.map(([x, y, durationMin, feedType], i) => ({
    id: `feed-${i + 1}`,
    order: i + 1,
    x,
    y,
    durationMin,
    feedType,
  }));

  return {
    version: 1,
    projectName: '青峰生态养殖场',
    mapTitle: '青峰生态养殖场 · 场区图则',
    mapSubtitle: '分区规划 · 增氧点位 · 投喂路线 三联出图',
    manager: '场长：周建国',
    draftsman: '制图：生产技术组',
    aerialDate: '2026-11-24 本周航拍正射',
    surveyNote: '塘埂由手持激光测距闭合量测；网箱外框 6m × 6m。',
    scaleDenominator: 2000,
    basemap: {
      dataUrl: '',
      opacity: 0.82,
      source: 'aerial-procedural',
    },
    layers: {
      basemap: true,
      ridges: true,
      ponds: true,
      cages: true,
      labels: true,
      coverage: true,
      aerators: true,
      pipes: true,
      power: true,
      route: true,
      feedPoints: true,
    },
    ridges: [
      { id: 'ridge-outer', code: '外埂闭合线', closed: true, measuredM: 2380, points: rectPoints(55, 105, 1290, 655) },
      { id: 'ridge-middle', code: '中埂测距线', closed: false, measuredM: 430, points: [{ x: 55, y: DIKE_Y }, { x: 1345, y: DIKE_Y }] },
      { id: 'ridge-r1', code: '1#–5# 隔埂', closed: false, measuredM: 112, points: [{ x: 445, y: DIKE_Y }, { x: 445, y: 740 }] },
      { id: 'ridge-r2', code: '6#–7# 隔埂', closed: false, measuredM: 108, points: [{ x: 782, y: DIKE_Y }, { x: 782, y: 740 }] },
      { id: 'ridge-r3', code: '7#–8# 隔埂', closed: false, measuredM: 108, points: [{ x: 1058, y: DIKE_Y }, { x: 1058, y: 740 }] },
    ],
    ponds,
    cages,
    powerPoints,
    aerators,
    pipes,
    feedRoute: {
      boatModel: 'FT-3.6 遥控投喂船',
      speedMmin: 42,
      points: routePoints,
    },
    feedPoints,
    layout: {
      preset: 'A1L',
      tableNX: null,
      tableNY: null,
      showLegend: true,
      showTable: true,
      showScale: true,
      showNorth: true,
    },
    updatedAt: new Date().toISOString(),
  };
}

function readInitialProject() {
  const base = seedProject();
  try {
    const storage = globalThis.localStorage;
    const raw = storage?.getItem?.(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    const data = parsed.project || parsed;
    if (!data || !Array.isArray(data.ponds)) return base;
    return normalizeProject(data, base);
  } catch (err) {
    console.warn('读取本机草稿失败，使用示例场区。', err);
    return base;
  }
}

export function normalizeProject(data, base = seedProject()) {
  return {
    ...base,
    ...data,
    basemap: { ...base.basemap, ...(data.basemap || {}) },
    layers: { ...base.layers, ...(data.layers || {}) },
    feedRoute: { ...base.feedRoute, ...(data.feedRoute || {}) },
    layout: { ...base.layout, ...(data.layout || {}) },
    ponds: Array.isArray(data.ponds) ? data.ponds : base.ponds,
    cages: Array.isArray(data.cages) ? data.cages : base.cages,
    ridges: Array.isArray(data.ridges) ? data.ridges : base.ridges,
    aerators: Array.isArray(data.aerators) ? data.aerators : base.aerators,
    pipes: Array.isArray(data.pipes) ? data.pipes : base.pipes,
    powerPoints: Array.isArray(data.powerPoints) ? data.powerPoints : base.powerPoints,
    feedPoints: Array.isArray(data.feedPoints) ? data.feedPoints : base.feedPoints,
  };
}

const initialUi = {
  page: 'zone',
  tool: 'select',
  selectedKind: null,
  selectedId: null,
  saveState: '示例数据已载入',
};

const [state, setState] = createStore({
  project: readInitialProject(),
  ui: initialUi,
});

function mutateProject(fn) {
  setState(produce((root) => fn(root.project)));
}

export { state, setState };

export function setPage(page) {
  setState('ui', { page, tool: 'select', selectedKind: null, selectedId: null });
}

export function setTool(tool) {
  setState('ui', { tool });
}

export function selectObject(kind, id) {
  setState('ui', { selectedKind: kind, selectedId: id, tool: 'select' });
}

export function clearSelection() {
  setState('ui', { selectedKind: null, selectedId: null });
}

export function updateProject(patch) {
  setState('project', produce((p) => Object.assign(p, patch)));
}

export function updateLayout(patch) {
  setState('project', 'layout', produce((l) => Object.assign(l, patch)));
}

export function setLayer(key, value) {
  setState('project', 'layers', key, value);
}

export function updatePond(id, patch) {
  mutateProject((p) => {
    const pond = p.ponds.find((x) => x.id === id);
    if (pond) Object.assign(pond, patch);
  });
}

export function recalcPondArea(id) {
  const pond = state.project.ponds.find((p) => p.id === id);
  if (!pond) return;
  const areaMu = Number(polygonAreaMu(pond.points).toFixed(1));
  updatePond(id, { areaMu, ledgerAreaMu: areaMu });
  setState('ui', 'saveState', '面积已按测距坐标重算');
}

export function addPondFromRect(rect) {
  const maxNo = state.project.ponds.reduce((max, p) => {
    const n = Number.parseInt(String(p.code).replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, state.project.ponds.length);
  const code = `${maxNo + 1}#`;
  const pond = {
    id: uid('pond'),
    code,
    name: `${code}塘口`,
    points: rectPoints(rect.x, rect.y, rect.w, rect.h),
    species: 'grass',
    spec: '待登记规格',
    areaMu: Number(polygonAreaMu(rectPoints(rect.x, rect.y, rect.w, rect.h)).toFixed(1)),
    ledgerAreaMu: 0,
    density: 1000,
    densityUnit: '尾/亩',
    ledgerSource: '新划区，待关联台账',
    stockedAt: '',
  };
  setState('project', 'ponds', (ponds) => [...ponds, pond]);
  selectObject('pond', pond.id);
  setState('ui', { tool: 'select', saveState: `已新增 ${code}，请核对台账数据` });
  return pond;
}

export function deletePond(id) {
  mutateProject((p) => {
    p.ponds = p.ponds.filter((x) => x.id !== id);
    const removedAeratorIds = p.aerators.filter((a) => a.pondId === id).map((a) => a.id);
    p.aerators = p.aerators.filter((a) => a.pondId !== id);
    p.cages = p.cages.filter((c) => c.pondId !== id);
    p.pipes = p.pipes.filter((pipe) => !removedAeratorIds.includes(pipe.aeratorId));
  });
  clearSelection();
}

export function addCageGrid(pondId, options = {}) {
  const pond = state.project.ponds.find((p) => p.id === pondId);
  if (!pond) return;
  const cols = options.cols ?? 4;
  const rows = options.rows ?? 3;
  const frameM = options.frameM ?? 6;
  const cell = frameM * PX_PER_M;
  const gap = 9;
  const xs = pond.points.map((p) => p.x);
  const ys = pond.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const totalW = cols * cell + (cols - 1) * gap;
  const totalH = rows * cell + (rows - 1) * gap;
  const startX = (minX + maxX) / 2 - totalW / 2;
  const startY = (minY + maxY) / 2 - totalH / 2;
  const existing = state.project.cages.length;
  const cages = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const n = existing + cages.length + 1;
      cages.push({
        id: uid('cage'),
        pondId,
        code: `WX-${String(n).padStart(2, '0')}`,
        x: Math.round(startX + c * (cell + gap)),
        y: Math.round(startY + r * (cell + gap)),
        w: cell,
        h: cell,
        frameM,
        species: options.species || pond.species,
        spec: options.spec || pond.spec,
      });
    }
  }
  setState('project', 'cages', (items) => [...items, ...cages]);
  setState('ui', 'saveState', `已在 ${pond.code} 生成 ${cages.length} 个网箱框架`);
}

export function deleteCage(id) {
  setState('project', 'cages', (items) => items.filter((c) => c.id !== id));
  clearSelection();
}

export function addAerator(catalogId, x, y) {
  const cat = AERATOR_CATALOG.find((c) => c.id === catalogId) || AERATOR_CATALOG[1];
  const pond = findPondAt(state.project, { x, y });
  const count = state.project.aerators.length + 1;
  const aerator = {
    id: uid('aer'),
    code: `AE-${String(count).padStart(2, '0')}`,
    catalogId: cat.id,
    model: cat.model,
    vendor: cat.vendor,
    powerKw: cat.powerKw,
    radiusM: cat.radiusM,
    depthM: cat.depthM,
    x: Math.round(x),
    y: Math.round(y),
    pondId: pond?.id || null,
    powerId: state.project.powerPoints[0]?.id || null,
  };
  setState('project', 'aerators', (items) => [...items, aerator]);
  if (aerator.powerId) {
    const power = state.project.powerPoints.find((p) => p.id === aerator.powerId);
    const pipe = {
      id: uid('pipe'),
      code: `GL-${String(state.project.pipes.length + 1).padStart(2, '0')}`,
      aeratorId: aerator.id,
      powerPointId: aerator.powerId,
      diameterMm: 63,
      points: buildPipePoints(aerator, power),
    };
    setState('project', 'pipes', (items) => [...items, pipe]);
  }
  selectObject('aerator', aerator.id);
  setState('ui', 'saveState', `已放入 ${cat.model}，覆盖半径 ${cat.radiusM}m`);
  return aerator;
}

export function updateAerator(id, patch) {
  mutateProject((p) => {
    const aerator = p.aerators.find((a) => a.id === id);
    if (!aerator) return;
    Object.assign(aerator, patch);
    const pipe = p.pipes.find((x) => x.aeratorId === id);
    const power = p.powerPoints.find((x) => x.id === (patch.powerId || aerator.powerId || pipe?.powerPointId));
    if (pipe && power) {
      pipe.powerPointId = power.id;
      pipe.points = buildPipePoints(aerator, power);
    } else if (!pipe && power) {
      p.pipes.push({
        id: uid('pipe'),
        code: `GL-${String(p.pipes.length + 1).padStart(2, '0')}`,
        aeratorId: aerator.id,
        powerPointId: power.id,
        diameterMm: 63,
        points: buildPipePoints(aerator, power),
      });
    }
  });
}

export function deleteAerator(id) {
  mutateProject((p) => {
    p.aerators = p.aerators.filter((a) => a.id !== id);
    p.pipes = p.pipes.filter((pipe) => pipe.aeratorId !== id);
  });
  clearSelection();
}

export function addPowerPoint(x, y) {
  const n = state.project.powerPoints.length + 1;
  const point = {
    id: uid('power'),
    code: `电源 ${String.fromCharCode(64 + n)}`,
    x: Math.round(x),
    y: Math.round(y),
    capacityKw: 40,
  };
  setState('project', 'powerPoints', (items) => [...items, point]);
  selectObject('power', point.id);
  return point;
}

export function updatePowerPoint(id, patch) {
  mutateProject((p) => {
    const power = p.powerPoints.find((x) => x.id === id);
    if (!power) return;
    Object.assign(power, patch);
    p.pipes
      .filter((pipe) => pipe.powerPointId === id)
      .forEach((pipe) => {
        const aerator = p.aerators.find((a) => a.id === pipe.aeratorId);
        if (aerator) pipe.points = buildPipePoints(aerator, power);
      });
  });
}

export function connectPipe(aeratorId, powerPointId) {
  const aerator = state.project.aerators.find((a) => a.id === aeratorId);
  const power = state.project.powerPoints.find((p) => p.id === powerPointId);
  if (!aerator || !power) return null;
  let pipeId = null;
  mutateProject((p) => {
    const aerator = p.aerators.find((a) => a.id === aeratorId);
    const power = p.powerPoints.find((x) => x.id === powerPointId);
    if (!aerator || !power) return;
    const points = buildPipePoints(aerator, power);
    const existing = p.pipes.find((x) => x.aeratorId === aeratorId);
    if (existing) {
      existing.powerPointId = powerPointId;
      existing.points = points;
      pipeId = existing.id;
    } else {
      const pipe = {
        id: uid('pipe'),
        code: `GL-${String(p.pipes.length + 1).padStart(2, '0')}`,
        aeratorId,
        powerPointId,
        diameterMm: 63,
        points,
      };
      p.pipes.push(pipe);
      pipeId = pipe.id;
    }
    aerator.powerId = powerPointId;
  });
  return pipeId;
}

export function deletePipe(id) {
  setState('project', 'pipes', (items) => items.filter((p) => p.id !== id));
  clearSelection();
}

export function saveRoute(points) {
  setState('project', 'feedRoute', 'points', points);
  setState('ui', 'saveState', `投喂路线已保存，共 ${points.length} 个堤埂转折点`);
}

export function addFeedPoint(x, y) {
  const order = state.project.feedPoints.length + 1;
  const point = {
    id: uid('feed'),
    order,
    x: Math.round(x),
    y: Math.round(y),
    durationMin: 15,
    feedType: '配合饲料',
  };
  setState('project', 'feedPoints', (items) => [...items, point]);
  selectObject('feedPoint', point.id);
  return point;
}

export function updateFeedPoint(id, patch) {
  mutateProject((p) => {
    const point = p.feedPoints.find((x) => x.id === id);
    if (point) Object.assign(point, patch);
  });
}

export function deleteFeedPoint(id) {
  setState(
    'project',
    produce((p) => {
      p.feedPoints = p.feedPoints.filter((x) => x.id !== id);
      p.feedPoints.forEach((fp, i) => {
        fp.order = i + 1;
      });
    }),
  );
  clearSelection();
}

export function moveFeedPointOrder(id, direction) {
  const sorted = [...state.project.feedPoints].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((p) => p.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sorted.length) return;
  const a = sorted[index];
  const b = sorted[target];
  mutateProject((p) => {
    const pa = p.feedPoints.find((x) => x.id === a.id);
    const pb = p.feedPoints.find((x) => x.id === b.id);
    const order = pa.order;
    pa.order = pb.order;
    pb.order = order;
  });
}

export function exportEditableDraft() {
  const payload = {
    app: 'aquafarm-layout-studio',
    format: 'editable-aquafarm-draft',
    version: 1,
    savedAt: new Date().toISOString(),
    project: state.project,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.project.projectName}-可再编辑图稿-${new Date().toISOString().slice(0, 10)}.aquafarm.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  setState('ui', 'saveState', '可编辑稿子已导出；下周可用“打开稿子”拆回三张图层');
}

export function importEditableDraft(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const data = normalizeProject(parsed.project || parsed);
        setState('project', reconcile(data));
        setState('ui', {
          page: 'layout',
          tool: 'select',
          selectedKind: null,
          selectedId: null,
          saveState: '稿子已打开：分区、增氧管路和投喂路线均可继续编辑',
        });
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ app: 'aquafarm-layout-studio', project: data }));
        } catch {
          /* 大图可能超过本机存储配额，文件稿仍可继续编辑 */
        }
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function persistLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ app: 'aquafarm-layout-studio', project: state.project }));
    setState('ui', 'saveState', `本机自动保存于 ${new Date().toLocaleTimeString('zh-CN')}`);
    return true;
  } catch (err) {
    console.warn(err);
    setState('ui', 'saveState', '本机存储不足，请导出 .aquafarm.json 稿子');
    return false;
  }
}
