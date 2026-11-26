import paper from 'paper';
import type { FurnitureItem, LegendBlock, LegendEntry, ProjectDocument, AtlasPageInfo } from '../types';
import { drawEngineeringText, mm } from './engineeringFont';
import { circlePath, polygonPath, rectPath } from './paperDraw';

export function legendLabel(doc: ProjectDocument, entry: LegendEntry): string {
  if (entry.bind === 'grassSpec') {
    return `草方格带 ${doc.grass.cellAlong}m×${doc.grass.cellAcross}m`;
  }
  if (entry.bind === 'forestSpec') {
    return `林带 株距${doc.forest.plantSpacing}m × 行距${doc.forest.rowSpacing}m`;
  }
  if (entry.bind === 'scale') return `比例尺 1:${doc.scaleDenominator}`;
  return entry.label;
}

function addText(group: paper.Group, text: string, x: number, y: number, size = 2.9, options: { align?: CanvasTextAlign; bold?: boolean; color?: string } = {}) {
  const item = drawEngineeringText({
    xMm: x,
    yMm: y,
    text,
    sizeMm: size,
    align: options.align ?? 'left',
    baseline: 'top',
    color: options.color ?? '#17212b',
  });
  group.addChild(item);
  return item;
}

function drawSymbol(group: paper.Group, entry: LegendEntry, x: number, y: number): void {
  const w = 10;
  const h = 4.6;
  const cy = y + 2.7;

  if (entry.symbol === 'alignment' || entry.symbol === 'redline') {
    group.addChild(
      new paper.Path.Line({ from: [mm(x), mm(cy)], to: [mm(x + w), mm(cy)], strokeColor: '#c1121f', strokeWidth: mm(0.9) }),
    );
    group.addChild(
      new paper.Path.Line({ from: [mm(x + 1), mm(cy - 1.4)], to: [mm(x + 1), mm(cy + 1.4)], strokeColor: '#111', strokeWidth: mm(0.35) }),
    );
    group.addChild(
      new paper.Path.Line({ from: [mm(x + 8), mm(cy - 1.4)], to: [mm(x + 8), mm(cy + 1.4)], strokeColor: '#111', strokeWidth: mm(0.35) }),
    );
    return;
  }

  if (entry.symbol === 'station') {
    group.addChild(
      new paper.Path.Line({ from: [mm(x + 2), mm(y + 0.4)], to: [mm(x + 2), mm(y + 5)], strokeColor: '#111', strokeWidth: mm(0.5) }),
    );
    group.addChild(polygonPath([{ x: x + 2, y: y + 0.4 }, { x: x + 7.5, y: y + 1.4 }, { x: x + 2, y: y + 2.4 }], true, { fillColor: '#111' }));
    return;
  }

  if (entry.symbol === 'grass') {
    group.addChild(rectPath(x, y + 0.4, w, h, { fillColor: 'rgba(214,178,122,0.45)', strokeColor: '#8a5a2b', strokeWidth: 0.35 }));
    for (let i = 1; i < 3; i += 1) {
      group.addChild(new paper.Path.Line({ from: [mm(x + (w * i) / 3), mm(y + 0.4)], to: [mm(x + (w * i) / 3), mm(y + 5)], strokeColor: '#8a5a2b', strokeWidth: mm(0.22) }));
      group.addChild(new paper.Path.Line({ from: [mm(x), mm(y + 0.4 + (h * i) / 2)], to: [mm(x + w), mm(y + 0.4 + (h * i) / 2)], strokeColor: '#8a5a2b', strokeWidth: mm(0.22) }));
    }
    return;
  }

  if (entry.symbol === 'grid') {
    group.addChild(rectPath(x, y + 0.4, w, h, { fillColor: '#fff8ec', strokeColor: '#a16207', strokeWidth: 0.35 }));
    for (let i = 1; i < 4; i += 1) {
      group.addChild(new paper.Path.Line({ from: [mm(x + (w * i) / 4), mm(y + 0.4)], to: [mm(x + (w * i) / 4), mm(y + 5)], strokeColor: '#a16207', strokeWidth: mm(0.25) }));
    }
    group.addChild(new paper.Path.Line({ from: [mm(x), mm(cy)], to: [mm(x + w), mm(cy)], strokeColor: '#a16207', strokeWidth: mm(0.25) }));
    return;
  }

  if (entry.symbol === 'forest') {
    group.addChild(rectPath(x, y + 0.4, w, h, { fillColor: 'rgba(106,168,79,0.35)', strokeColor: '#2f7d32', strokeWidth: 0.35 }));
    [x + 2.5, x + 5, x + 7.5].forEach((cx) => group.addChild(circlePath(cx, cy, 1.25, { fillColor: '#2f7d32' })));
    return;
  }

  if (entry.symbol === 'seedling') {
    group.addChild(circlePath(x + 5, cy, 1.7, { fillColor: '#dff0d8', strokeColor: '#2f7d32', strokeWidth: 0.45 }));
    group.addChild(new paper.Path.Line({ from: [mm(x + 5), mm(cy - 1.2)], to: [mm(x + 5), mm(cy + 1.2)], strokeColor: '#2f7d32', strokeWidth: mm(0.45) }));
    group.addChild(new paper.Path.Line({ from: [mm(x + 3.8), mm(cy)], to: [mm(x + 6.2), mm(cy)], strokeColor: '#2f7d32', strokeWidth: mm(0.45) }));
    return;
  }

  if (entry.symbol === 'hole') {
    group.addChild(circlePath(x + 5, cy, 2.2, { fillColor: '#fff', strokeColor: '#4b5563', strokeWidth: 0.45, dashArray: [mm(1.1), mm(0.8)] }));
    group.addChild(new paper.Path.Line({ from: [mm(x + 3.7), mm(cy - 1.3)], to: [mm(x + 6.3), mm(cy + 1.3)], strokeColor: '#4b5563', strokeWidth: mm(0.35) }));
    group.addChild(new paper.Path.Line({ from: [mm(x + 6.3), mm(cy - 1.3)], to: [mm(x + 3.7), mm(cy + 1.3)], strokeColor: '#4b5563', strokeWidth: mm(0.35) }));
    return;
  }

  if (entry.symbol === 'repair') {
    group.addChild(polygonPath(
      [
        { x: x + 1.2, y: y + 4.8 },
        { x: x + 4.2, y: y + 0.5 },
        { x: x + 6.2, y: y + 4.8 },
        { x: x + 8.2, y: y + 1.4 },
        { x: x + 9.2, y: y + 4.8 },
      ],
      false,
      { strokeColor: '#d000d8', strokeWidth: mm(0.55), dashArray: [mm(1.4), mm(0.8)] },
    ));
    return;
  }

  addText(group, '注', x + 3.2, y + 0.2, 3.2, { color: '#4b5563' });
}

function drawLegend(doc: ProjectDocument, item: LegendBlock): paper.Group {
  const group = new paper.Group({ data: { furnitureId: item.id, furnitureType: 'legend' } });
  const entries = item.entryIds
    .map((id) => doc.legend.find((entry) => entry.id === id))
    .filter((entry): entry is LegendEntry => Boolean(entry));
  const titleH = 8.5;
  const rowH = 6.3;
  const h = titleH + entries.length * rowH + 3;
  const w = item.widthMm;

  group.addChild(rectPath(item.xMm, item.yMm, w, h, {
    fillColor: 'rgba(255,255,255,0.96)',
    strokeColor: item.continuation ? '#7c3aed' : '#111827',
    strokeWidth: 0.55,
  }));
  group.addChild(rectPath(item.xMm, item.yMm, w, titleH, {
    fillColor: item.continuation ? '#f3e8ff' : '#eef2f7',
    strokeColor: 'rgba(0,0,0,0)',
  }));
  addText(group, item.title, item.xMm + w / 2, item.yMm + 2.2, 3.5, { align: 'center' });

  entries.forEach((entry, index) => {
    const y = item.yMm + titleH + index * rowH;
    drawSymbol(group, entry, item.xMm + 3, y);
    const label = legendLabel(doc, entry);
    addText(group, label, item.xMm + 15, y + 0.9, 2.75);
  });

  group.data.heightMm = h;
  group.data.widthMm = w;
  return group;
}

function drawNorth(item: Extract<FurnitureItem, { type: 'north' }>): paper.Group {
  const group = new paper.Group({ data: { furnitureId: item.id, furnitureType: 'north' } });
  const s = item.sizeMm;
  const cx = item.xMm + s / 2;
  group.addChild(circlePath(cx, item.yMm + s / 2 + 3, s / 2 + 1.5, { fillColor: 'rgba(255,255,255,0.88)', strokeColor: '#111', strokeWidth: 0.4 }));
  addText(group, 'N', cx, item.yMm - 0.5, 4, { align: 'center' });
  const cy = item.yMm + s / 2 + 3;
  group.addChild(polygonPath([
    { x: cx, y: cy - s / 2 + 1 },
    { x: cx - 3.2, y: cy + 3.5 },
    { x: cx, y: cy + 1.8 },
    { x: cx + 3.2, y: cy + 3.5 },
  ], true, { fillColor: '#111' }));
  group.addChild(new paper.Path.Line({ from: [mm(cx), mm(cy + 1.8)], to: [mm(cx), mm(cy + s / 2)], strokeColor: '#111', strokeWidth: mm(0.5) }));
  return group;
}

function drawScale(doc: ProjectDocument, item: Extract<FurnitureItem, { type: 'scale' }>): paper.Group {
  const group = new paper.Group({ data: { furnitureId: item.id, furnitureType: 'scale' } });
  addText(group, `比例尺 1:${doc.scaleDenominator}`, item.xMm, item.yMm, 2.9);
  const groundStep = 20;
  const stepW = (groundStep * 1000) / doc.scaleDenominator;
  const barY = item.yMm + 5.2;
  const barH = 2.4;
  for (let i = 0; i < 4; i += 1) {
    group.addChild(rectPath(item.xMm + i * stepW, barY, stepW, barH, {
      fillColor: i % 2 === 0 ? '#111' : '#fff',
      strokeColor: '#111',
      strokeWidth: 0.3,
    }));
    addText(group, String(i * groundStep), item.xMm + i * stepW, barY + barH + 0.7, 2.35, { align: 'center' });
  }
  addText(group, '80 m', item.xMm + 4 * stepW, barY + barH + 0.7, 2.35, { align: 'center' });
  return group;
}

export function drawFurniture(doc: ProjectDocument, page: AtlasPageInfo): paper.Group[] {
  return doc.furniture
    .filter((item) => item.pageId === page.id)
    .map((item) => {
      if (item.type === 'legend') return drawLegend(doc, item);
      if (item.type === 'north') return drawNorth(item);
      return drawScale(doc, item);
    });
}
