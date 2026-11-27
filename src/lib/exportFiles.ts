import type { BranchAnnotation } from '../types';
import { LABEL_META } from '../types';
import type { SkeletonDataset } from '../types';

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildTreatmentCsv(dataset: SkeletonDataset, annotations: Record<string, BranchAnnotation>): string {
  const header = [
    'branch_id',
    'parent_id',
    'label_code',
    'label_zh',
    'has_cut',
    'cut_t_0_base_to_1_tip',
    'cut_x_m',
    'cut_y_m',
    'cut_z_m',
    'snapped_bud_id',
    'cut_diameter_mm',
    'start_x_m',
    'start_y_m',
    'start_z_m',
    'end_x_m',
    'end_y_m',
    'end_z_m',
    'length_m',
    'base_diameter_mm',
    'tip_diameter_mm',
    'angle_deg',
    'bud_count',
  ];

  const rows = dataset.branches.map((b) => {
    const a = annotations[b.id];
    const cut = a?.cut;
    return [
      b.id,
      b.parentId ?? '',
      a?.label ?? '',
      a ? LABEL_META[a.label].label : '',
      cut ? 'yes' : 'no',
      cut ? cut.t.toFixed(6) : '',
      cut ? cut.position[0].toFixed(6) : '',
      cut ? cut.position[1].toFixed(6) : '',
      cut ? cut.position[2].toFixed(6) : '',
      cut?.snappedBudId ?? '',
      cut ? (cut.diameter * 1000).toFixed(3) : '',
      b.start[0].toFixed(6),
      b.start[1].toFixed(6),
      b.start[2].toFixed(6),
      b.end[0].toFixed(6),
      b.end[1].toFixed(6),
      b.end[2].toFixed(6),
      b.length.toFixed(6),
      (b.diameter * 1000).toFixed(3),
      (b.tipDiameter * 1000).toFixed(3),
      b.angle === null ? '' : b.angle.toFixed(2),
      b.buds.length,
    ].map(csvCell).join(',');
  });

  return `﻿${header.join(',')}\n${rows.join('\n')}`;
}

export function downloadTextFile(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function safeFileStem(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80) || 'pruning';
}
