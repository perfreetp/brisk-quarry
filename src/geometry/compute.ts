import type {
  AtlasIssue,
  AtlasPageInfo,
  BandQuantity,
  ComputedAtlas,
  OpeningModel,
  ProjectDocument,
  SegmentQuantityRow,
  SpeciesQuantity,
  Vec2,
} from '../types';
import {
  buildStations,
  formatChainage,
  locateAtChainage,
  locateAtDistance,
  normalAt,
  offsetPointAtDistance,
  offsetPolyline,
  polylineLength,
} from './alignment';
import { ellipsePolygon, repairPolygonWithBooleans } from './paperBooleans';
import { findSelfIntersections } from './topology';

function openingPolygon(opening: OpeningModel, doc: ProjectDocument, bandMidOffset: number): Vec2[] {
  const located = locateAtChainage(doc.alignment, opening.chainage);
  const side = doc.bands.find((b) => b.id === opening.bandId)?.side ?? 1;
  const n = normalAt(located.tangent, side);
  const absoluteOffset = bandMidOffset + opening.lateralOffset;
  const center = {
    x: located.position.x + n.x * absoluteOffset,
    y: located.position.y + n.y * absoluteOffset,
  };
  // tangent 作为沿里程轴，normal 作为横断轴
  return ellipsePolygon(center, located.tangent, n, opening.radiusAlong, opening.radiusAcross, 44);
}

type LoopGeometryLike = Pick<BandQuantity['geometry'], 'loops' | 'outerLoops' | 'holes'>;

function insideRepairedGeometry(point: Vec2, geometry: LoopGeometryLike): boolean {
  const outers = geometry.outerLoops.length ? geometry.outerLoops : geometry.loops;
  const inOuter = outers.some((loop) => pointInLoop(point, loop));
  if (!inOuter) return false;
  return !geometry.holes.some((hole) => pointInLoop(point, hole));
}

function pointInLoop(point: Vec2, loop: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const xi = loop[i].x;
    const yi = loop[i].y;
    const xj = loop[j].x;
    const yj = loop[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function allocateSpecies(doc: ProjectDocument, seedlingTotal: number, plantTotal: number): SpeciesQuantity[] {
  let used = 0;
  return doc.forest.species.map((species, index, all) => {
    const isLast = index === all.length - 1;
    const seedlingCount = isLast ? Math.max(0, seedlingTotal - used) : Math.round(seedlingTotal * species.share);
    used += seedlingCount;
    return {
      species,
      designCount: Math.round(plantTotal * species.share),
      seedlingCount,
    };
  });
}

export function computeAtlas(doc: ProjectDocument): ComputedAtlas {
  const alignmentLengthM = polylineLength(doc.alignment.points);
  const stations = buildStations(doc.alignment);
  const issues: AtlasIssue[] = [];

  const segmentCount = Math.max(1, Math.ceil(alignmentLengthM / 100));
  const segments: SegmentQuantityRow[] = Array.from({ length: segmentCount }, (_, i) => {
    const startRel = i * 100;
    const endRel = Math.min(alignmentLengthM, (i + 1) * 100);
    const startChainage = doc.alignment.startChainage + startRel;
    const endChainage = doc.alignment.startChainage + endRel;
    return {
      id: `qseg-${i + 1}`,
      startChainage,
      endChainage,
      label: `${formatChainage(startChainage)}～${formatChainage(endChainage)}`,
      grassAreaM2: 0,
      grassCells: 0,
      grassKg: 0,
      plantCount: 0,
      seedlingCount: 0,
    };
  });

  const bandQuantities: BandQuantity[] = doc.bands.map((band) => {
    const far = band.offsetStart + band.width;
    const outer = offsetPolyline(doc.alignment.points, far, band.side, 0, alignmentLengthM, 2);
    const inner = offsetPolyline(doc.alignment.points, band.offsetStart, band.side, 0, alignmentLengthM, 2).reverse();
    const rawBoundary = outer.concat(inner);
    const intersections = findSelfIntersections(rawBoundary);

    const midOffset = band.offsetStart + band.width / 2;
    const holePolygons = doc.openings
      .filter((opening) => opening.bandId === band.id)
      .map((opening) => openingPolygon(opening, doc, midOffset));

    const repaired = repairPolygonWithBooleans(rawBoundary, holePolygons);
    const centerLine = offsetPolyline(doc.alignment.points, midOffset, band.side, 0, alignmentLengthM, 5);
    const centerLengthM = polylineLength(centerLine);

    if (intersections.length > 0) {
      const curve = doc.alignment.curveRanges[0];
      issues.push({
        id: `issue-self-${band.id}`,
        severity: 'warning',
        bandId: band.id,
        chainage: curve ? (curve.startChainage + curve.endChainage) / 2 : doc.alignment.startChainage + alignmentLengthM / 2,
        title: `${band.name}边界自交，已拆开重排`,
        detail: `识别 ${intersections.length} 处自交交点；Paper resolveCrossings + union 生成 ${repaired.outerLoops.length} 个外环、${repaired.holes.length} 个孔洞，材料量按修复后净面积 ${repaired.areaM2.toFixed(1)}㎡ 重算。`,
      });
    }

    if (!repaired.repaired) {
      issues.push({
        id: `issue-boolean-${band.id}`,
        severity: 'warning',
        bandId: band.id,
        title: `${band.name}布尔修复使用了安全回退`,
        detail: '浏览器布尔运算抛出异常，已保留原始边界，排版未中断。',
      });
    }

    let rowCount = 0;
    let plantCount = 0;

    if (band.kind === 'forest') {
      const usableWidth = Math.max(0, band.width - doc.forest.edgeMargin * 2);
      rowCount = Math.max(1, Math.floor(usableWidth / doc.forest.rowSpacing) + 1);
      const rowOffsets: number[] = [];
      if (rowCount === 1) {
        rowOffsets.push(midOffset);
      } else {
        for (let r = 0; r < rowCount; r += 1) {
          rowOffsets.push(band.offsetStart + doc.forest.edgeMargin + (usableWidth * r) / (rowCount - 1));
        }
      }

      for (const rowOffset of rowOffsets) {
        for (let s = 0; s <= alignmentLengthM + 1e-6; s += doc.forest.plantSpacing) {
          const point = offsetPointAtDistance(doc.alignment.points, s, rowOffset, band.side);
          if (insideRepairedGeometry(point, repaired)) {
            plantCount += 1;
            const segIndex = Math.min(segmentCount - 1, Math.floor(s / 100));
            segments[segIndex].plantCount += 1;
          }
        }
      }
    }

    if (band.kind === 'grass') {
      // 数值积分求每百米净面积，再用布尔净面积校准，保证分段表合计等于汇总表。
      let integratedTotal = 0;
      const integratedBySegment = new Array(segmentCount).fill(0);
      const alongStep = 2;
      const acrossStep = 1;
      for (let s = 0; s < alignmentLengthM; s += alongStep) {
        const located = locateAtDistance(doc.alignment.points, s + alongStep / 2);
        const segIndex = Math.min(segmentCount - 1, Math.floor(s / 100));
        let insideWidth = 0;
        for (let d = band.offsetStart; d <= far + 1e-6; d += acrossStep) {
          const n = normalAt(located.tangent, band.side);
          const pt = { x: located.position.x + n.x * d, y: located.position.y + n.y * d };
          if (insideRepairedGeometry(pt, repaired)) insideWidth += acrossStep;
        }
        const area = insideWidth * alongStep;
        integratedTotal += area;
        integratedBySegment[segIndex] += area;
      }
      const calibration = integratedTotal > 1e-6 ? repaired.areaM2 / integratedTotal : 1;
      integratedBySegment.forEach((rawArea, i) => {
        const area = rawArea * calibration;
        segments[i].grassAreaM2 += area;
      });
    }

    const cellCount = band.kind === 'grass'
      ? Math.max(0, Math.round(repaired.areaM2 / (doc.grass.cellAlong * doc.grass.cellAcross)))
      : 0;
    const gridLineLengthM = band.kind === 'grass'
      ? repaired.areaM2 * (1 / doc.grass.cellAlong + 1 / doc.grass.cellAcross)
      : 0;

    return {
      band,
      geometry: {
        ...repaired,
        bandId: band.id,
        centerLengthM,
        rawBoundary,
        selfIntersectionCount: intersections.length,
        booleanEngine: repaired.engine,
      },
      areaM2: repaired.areaM2,
      rowCount,
      plantCount,
      seedlingCount: Math.ceil(plantCount * (1 + doc.forest.lossRatePct / 100)),
      gridLineLengthM,
      cellCount,
    };
  });

  segments.forEach((row) => {
    row.grassCells = Math.round(row.grassAreaM2 / (doc.grass.cellAlong * doc.grass.cellAcross));
    row.grassKg = row.grassAreaM2 * (1 / doc.grass.cellAlong + 1 / doc.grass.cellAcross) * doc.grass.kgPerGridMeter;
    row.seedlingCount = Math.ceil(row.plantCount * (1 + doc.forest.lossRatePct / 100));
  });

  const grassBands = bandQuantities.filter((q) => q.band.kind === 'grass');
  const forestBands = bandQuantities.filter((q) => q.band.kind === 'forest');

  const grassAreaM2 = grassBands.reduce((sum, q) => sum + q.areaM2, 0);
  const grassLineM = grassBands.reduce((sum, q) => sum + q.gridLineLengthM, 0);
  const grassKg = grassLineM * doc.grass.kgPerGridMeter;
  const plantCount = forestBands.reduce((sum, q) => sum + q.plantCount, 0);
  const seedlingCount = Math.ceil(plantCount * (1 + doc.forest.lossRatePct / 100));
  const species = allocateSpecies(doc, seedlingCount, plantCount);

  // 平面页 + 材料表续页。首页材料表放摘要和前 15 行，续页每页 24 行且保证整行不跨页断裂。
  const planPageCount = Math.max(1, Math.ceil(alignmentLengthM / doc.pageSpanM));
  const pages: AtlasPageInfo[] = Array.from({ length: planPageCount }, (_, i) => {
    const startRel = i * doc.pageSpanM;
    const endRel = Math.min(alignmentLengthM, (i + 1) * doc.pageSpanM);
    const startChainage = doc.alignment.startChainage + startRel;
    const endChainage = doc.alignment.startChainage + endRel;
    return {
      id: `plan-${i + 1}`,
      index: i,
      kind: 'plan' as const,
      title: `平面布置图 第 ${i + 1} 页 ${formatChainage(startChainage)}～${formatChainage(endChainage)}`,
      shortTitle: `平面 ${i + 1}`,
      startChainage,
      endChainage,
    };
  });

  let rowCursor = 0;
  let tablePage = 1;
  while (rowCursor < segments.length) {
    const capacity = tablePage === 1 ? 15 : 24;
    const tableRows = Math.min(capacity, segments.length - rowCursor);
    pages.push({
      id: `quantity-${tablePage}`,
      index: pages.length,
      kind: 'quantity',
      title: tablePage === 1 ? '材料数量汇总表' : `材料数量汇总表（续 ${tablePage - 1}）`,
      shortTitle: `材料表 ${tablePage}`,
      tableStartRow: rowCursor,
      tableRows,
    });
    rowCursor += tableRows;
    tablePage += 1;
  }

  return {
    alignmentLengthM,
    stations,
    pages,
    generatedAt: new Date().toISOString(),
    quantities: {
      bands: bandQuantities,
      grassAreaM2,
      grassAreaHa: grassAreaM2 / 10000,
      grassCells: grassBands.reduce((sum, q) => sum + q.cellCount, 0),
      grassLineM,
      grassKg,
      grassT: grassKg / 1000,
      forestAreaM2: forestBands.reduce((sum, q) => sum + q.areaM2, 0),
      rowCount: forestBands.reduce((max, q) => Math.max(max, q.rowCount), 0),
      plantCount,
      seedlingCount,
      species,
      segments,
      issues,
    },
  };
}
