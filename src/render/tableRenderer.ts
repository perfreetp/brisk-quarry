import paper from 'paper';
import { drawEngineeringText } from './engineeringFont';
import { rectPath } from './paperDraw';

export interface TableColumn {
  key: string;
  title: string;
  widthMm: number;
  align?: CanvasTextAlign;
}

export interface DrawTableOptions {
  rowHeightMm?: number;
  headerHeightMm?: number;
  fontSizeMm?: number;
  headerFontSizeMm?: number;
  headerFill?: string;
  borderColor?: string;
  headerTextColor?: string;
  zebra?: boolean;
  boldHeader?: boolean;
}

export interface DrawnTable {
  group: paper.Group;
  heightMm: number;
  rowRects: Array<{ key: string; x: number; y: number; w: number; h: number }>;
}

export function drawTable(
  xMm: number,
  yMm: number,
  columns: TableColumn[],
  rows: Array<Record<string, string | number>>,
  options: DrawTableOptions = {},
): DrawnTable {
  const rowH = options.rowHeightMm ?? 6;
  const headerH = options.headerHeightMm ?? 7;
  const fontSize = options.fontSizeMm ?? 2.8;
  const headerFontSize = options.headerFontSizeMm ?? 2.9;
  const borderColor = options.borderColor ?? '#263238';
  const width = columns.reduce((sum, col) => sum + col.widthMm, 0);
  const height = headerH + rows.length * rowH;
  const group = new paper.Group({ insert: true });

  const bg = rectPath(xMm, yMm, width, height, {
    fillColor: '#ffffff',
    strokeColor: borderColor,
    strokeWidth: 0.55,
  });
  group.addChild(bg);

  const headerBg = rectPath(xMm, yMm, width, headerH, {
    fillColor: options.headerFill ?? '#e8eef5',
    strokeColor: borderColor,
    strokeWidth: 0.45,
  });
  group.addChild(headerBg);

  let cx = xMm;
  columns.forEach((col, index) => {
    if (index > 0) {
      const line = new paper.Path.Line({
        from: [cx * 4, yMm * 4],
        to: [cx * 4, (yMm + height) * 4],
        strokeColor: borderColor,
        strokeWidth: 0.35 * 4,
      });
      group.addChild(line);
    }
    const title = drawEngineeringText({
      xMm: cx + col.widthMm / 2,
      yMm: yMm + headerH / 2,
      text: col.title,
      sizeMm: headerFontSize,
      align: 'center',
      baseline: 'middle',
      color: '#17212b',
    });
    group.addChild(title);
    cx += col.widthMm;
  });

  const rowRects: DrawnTable['rowRects'] = [];
  rows.forEach((row, rowIndex) => {
    const rowY = yMm + headerH + rowIndex * rowH;
    rowRects.push({ key: String(row.__key ?? rowIndex), x: xMm, y: rowY, w: width, h: rowH });

    if (options.zebra !== false && rowIndex % 2 === 1) {
      const zebra = rectPath(xMm + 0.2, rowY + 0.2, width - 0.4, rowH - 0.4, {
        fillColor: '#f7f9fb',
        strokeColor: 'rgba(0,0,0,0)',
      });
      group.addChild(zebra);
    }

    const hLine = new paper.Path.Line({
      from: [xMm * 4, rowY * 4],
      to: [(xMm + width) * 4, rowY * 4],
      strokeColor: borderColor,
      strokeWidth: 0.25 * 4,
    });
    group.addChild(hLine);

    let cellX = xMm;
    columns.forEach((col) => {
      const raw = row[col.key] ?? '';
      const text = String(raw);
      const align = col.align ?? 'center';
      const textX = align === 'left' ? cellX + 2 : align === 'right' ? cellX + col.widthMm - 2 : cellX + col.widthMm / 2;
      const item = drawEngineeringText({
        xMm: textX,
        yMm: rowY + rowH / 2,
        text,
        sizeMm: fontSize,
        align,
        baseline: 'middle',
        color: '#1f2933',
      });
      group.addChild(item);
      cellX += col.widthMm;
    });
  });

  const bottom = new paper.Path.Line({
    from: [xMm * 4, (yMm + height) * 4],
    to: [(xMm + width) * 4, (yMm + height) * 4],
    strokeColor: borderColor,
    strokeWidth: 0.55 * 4,
  });
  group.addChild(bottom);

  return { group, heightMm: height, rowRects };
}
