import type { AtlasFile, ComputedAtlas, ProjectDocument } from '../types';
import { createDefaultProject } from '../model/defaultProject';

const STORAGE_KEY = 'grass-forest-atlas:v1';

export function saveLocalDocument(doc: ProjectDocument, computed?: ComputedAtlas): void {
  try {
    const file: AtlasFile = {
      app: 'grass-forest-atlas-studio',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      document: doc,
      snapshot: computed
        ? {
            alignmentLengthM: computed.alignmentLengthM,
            stationCount: computed.stations.length,
            pageCount: computed.pages.length,
            grassAreaM2: computed.quantities.grassAreaM2,
            seedlingCount: computed.quantities.seedlingCount,
            issues: computed.quantities.issues.length,
            stations: computed.stations,
            pages: computed.pages,
            segments: computed.quantities.segments,
          }
        : undefined,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  } catch (error) {
    console.warn('[atlas] 自动保存失败', error);
  }
}

export function loadLocalDocument(): ProjectDocument | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseAtlasFile(raw).document;
  } catch (error) {
    console.warn('[atlas] 本地草稿读取失败', error);
    return null;
  }
}

export function parseAtlasFile(text: string): AtlasFile {
  const parsed = JSON.parse(text) as Partial<AtlasFile> | ProjectDocument;
  const maybeDocument = (parsed as AtlasFile).document ?? (parsed as ProjectDocument);
  return {
    app: 'grass-forest-atlas-studio',
    schemaVersion: 1,
    savedAt: (parsed as AtlasFile).savedAt ?? new Date().toISOString(),
    document: normalizeDocument(maybeDocument),
    snapshot: (parsed as AtlasFile).snapshot,
  };
}

export function normalizeDocument(input: unknown): ProjectDocument {
  const fallback = createDefaultProject();
  if (!input || typeof input !== 'object') return fallback;
  const raw = input as Partial<ProjectDocument>;
  const doc: ProjectDocument = {
    ...fallback,
    ...raw,
    grass: { ...fallback.grass, ...(raw.grass ?? {}) },
    forest: {
      ...fallback.forest,
      ...(raw.forest ?? {}),
      species: Array.isArray(raw.forest?.species) && raw.forest!.species.length ? raw.forest!.species : fallback.forest.species,
    },
    alignment: {
      ...fallback.alignment,
      ...(raw.alignment ?? {}),
      points: Array.isArray(raw.alignment?.points) && raw.alignment!.points.length >= 2 ? raw.alignment!.points : fallback.alignment.points,
      curveRanges: Array.isArray(raw.alignment?.curveRanges) ? raw.alignment!.curveRanges : fallback.alignment.curveRanges,
    },
    bands: Array.isArray(raw.bands) && raw.bands.length ? raw.bands : fallback.bands,
    openings: Array.isArray(raw.openings) ? raw.openings : fallback.openings,
    legend: Array.isArray(raw.legend) && raw.legend.length ? raw.legend : fallback.legend,
    furniture: Array.isArray(raw.furniture) ? raw.furniture : fallback.furniture,
    layers: Array.isArray(raw.layers) && raw.layers.length ? raw.layers : fallback.layers,
  };
  doc.schemaVersion = 'atlas.structured.v1';
  if (!doc.furniture.some((item) => item.id === 'legend-cont-k5' && item.pageId === 'plan-3')) {
    // 旧草稿缺少 K5 续图例时补回，保证“第三页继续补图例”的入口始终存在。
    if (!doc.furniture.some((item) => item.id === 'legend-cont-k5')) {
      doc.furniture.push(fallback.furniture.find((item) => item.id === 'legend-cont-k5')!);
    }
  }
  return doc;
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
