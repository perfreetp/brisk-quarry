import type { ProjectDocument, Vec2 } from '../types';

function arcPoints(center: Vec2, radius: number, from: number, to: number, segments: number): Vec2[] {
  const result: Vec2[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = from + ((to - from) * i) / segments;
    result.push({ x: center.x + Math.cos(t) * radius, y: center.y + Math.sin(t) * radius });
  }
  return result;
}

export function createDefaultProject(): ProjectDocument {
  const points: Vec2[] = [];
  // K4+000 ~ K4+960 直线
  for (let x = 0; x <= 960; x += 10) points.push({ x, y: 0 });

  // K4+960 处 R=25m 急弯。内侧草方格远边偏距 27m > R，
  // 故意形成偏移边界自交，用于验证拆分和布尔收束。
  const radius = 25;
  const center = { x: 960, y: radius };
  const arc = arcPoints(center, radius, -Math.PI / 2, 0, 28).slice(1);
  points.push(...arc);

  const arcLength = (Math.PI / 2) * radius;
  const totalLength = 2600;
  const postLength = totalLength - 960 - arcLength;
  const endY = radius + postLength;
  for (let y = radius + 10; y <= endY; y += 10) {
    const last = points[points.length - 1];
    if (Math.hypot(last.x - 985, last.y - y) > 0.1) points.push({ x: 985, y });
  }
  points.push({ x: 985, y: endY });

  const planPageCount = Math.ceil(totalLength / 380);
  const furniture = [] as ProjectDocument['furniture'];

  furniture.push({
    id: 'legend-main',
    type: 'legend',
    pageId: 'plan-1',
    xMm: 22,
    yMm: 42,
    widthMm: 68,
    title: '图例',
    entryIds: ['leg-align', 'leg-station', 'leg-grass', 'leg-forest', 'leg-seedling'],
  });

  furniture.push({
    id: 'legend-cont-k5',
    type: 'legend',
    pageId: 'plan-3',
    xMm: 200,
    yMm: 42,
    widthMm: 64,
    title: '图例（续）',
    continuation: true,
    entryIds: ['leg-hole', 'leg-repair', 'leg-note'],
  });

  for (let i = 1; i <= planPageCount; i += 1) {
    furniture.push({ id: `north-${i}`, type: 'north', pageId: `plan-${i}`, xMm: 270, yMm: 42, sizeMm: 13 });
    furniture.push({ id: `scale-${i}`, type: 'scale', pageId: `plan-${i}`, xMm: 23, yMm: 232, widthMm: 52 });
  }

  return {
    schemaVersion: 'atlas.structured.v1',
    id: 'atlas-demo-k5',
    name: 'K4+000～K6+600 风沙防护布置图册',
    lineName: '某铁路防风固沙工程',
    sectionName: 'K5 弯道试验段',
    engineer: '防护设计组',
    date: new Date().toISOString().slice(0, 10),
    scaleDenominator: 1500,
    pageSpanM: 380,
    currentPageId: 'plan-3',
    autoAvoidLegend: true,
    alignment: {
      startChainage: 4000,
      points,
      curveRanges: [
        {
          startChainage: 4960,
          endChainage: 4960 + arcLength,
          radius,
          direction: 'right',
        },
      ],
    },
    bands: [
      { id: 'grass-left', kind: 'grass', name: '左侧草方格带（内弯）', side: 1, offsetStart: 3, width: 24 },
      { id: 'grass-right', kind: 'grass', name: '右侧草方格带', side: -1, offsetStart: 3, width: 24 },
      { id: 'forest-left', kind: 'forest', name: '左侧林带（内弯）', side: 1, offsetStart: 29, width: 18 },
      { id: 'forest-right', kind: 'forest', name: '右侧林带', side: -1, offsetStart: 29, width: 18 },
    ],
    openings: [
      {
        id: 'opening-k4-420',
        bandId: 'grass-right',
        chainage: 4420,
        lateralOffset: 0,
        radiusAlong: 9,
        radiusAcross: 4.5,
        label: '检修井预留孔',
      },
    ],
    grass: {
      cellAlong: 1,
      cellAcross: 1,
      ridgeWidth: 0.35,
      kgPerGridMeter: 0.48,
    },
    forest: {
      rowSpacing: 3,
      plantSpacing: 2,
      edgeMargin: 1,
      lossRatePct: 8,
      species: [
        { id: 'species-shaliu', name: '沙柳', share: 0.5, color: '#2f7d32', specification: '1-2年生壮苗，地径≥0.4cm' },
        { id: 'species-shatiao', name: '花棒/柠条', share: 0.3, color: '#6aa84f', specification: '裸根苗，苗高≥40cm' },
        { id: 'species-shaji', name: '沙棘', share: 0.2, color: '#b6d7a8', specification: '容器苗，冠形完整' },
      ],
    },
    legend: [
      { id: 'leg-align', symbol: 'alignment', label: '铁路红线 / 控制中线' },
      { id: 'leg-station', symbol: 'station', label: '里程桩、百米桩及曲线加密桩' },
      { id: 'leg-grass', symbol: 'grass', label: '草方格带', bind: 'grassSpec' },
      { id: 'leg-grid', symbol: 'grid', label: '草方格网格（随规格重画）' },
      { id: 'leg-forest', symbol: 'forest', label: '灌木林带', bind: 'forestSpec' },
      { id: 'leg-seedling', symbol: 'seedling', label: '苗木定位点（株行距联动）' },
      { id: 'leg-hole', symbol: 'hole', label: '预留孔洞，布尔扣除面积' },
      { id: 'leg-repair', symbol: 'repair', label: '自交边界拆分重排范围' },
      { id: 'leg-note', symbol: 'note', label: '注：工程量以布尔修复后的净面积为准。' },
    ],
    furniture,
    layers: [
      { id: 'layer-frame', name: '00 图框标题栏', visible: true, locked: false, opacity: 1 },
      { id: 'layer-alignment', name: '01 铁路红线与桩号', visible: true, locked: false, opacity: 1 },
      { id: 'layer-grass', name: '02 草方格带与网格', visible: true, locked: false, opacity: 1 },
      { id: 'layer-forest', name: '03 林带与苗木', visible: true, locked: false, opacity: 1 },
      { id: 'layer-table', name: '04 材料表/苗木表', visible: true, locked: false, opacity: 1 },
      { id: 'layer-legend', name: '05 图例/指北针/比例尺', visible: true, locked: false, opacity: 1 },
    ],
  };
}
