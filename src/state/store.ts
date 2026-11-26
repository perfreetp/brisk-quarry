import type { AtlasFile, ComputedAtlas, ProjectDocument } from '../types';
import { computeAtlas } from '../geometry/compute';
import { createDefaultProject } from '../model/defaultProject';
import { loadLocalDocument, saveLocalDocument } from './persistence';

export interface AtlasChangeDetail {
  reason: string;
  recomputed: boolean;
}

export class AtlasStore extends EventTarget {
  doc: ProjectDocument;
  computed: ComputedAtlas;
  lastReason = '初始化';
  lastSavedAt: string | null = null;

  constructor(initial?: ProjectDocument | null) {
    super();
    this.doc = initial ?? loadLocalDocument() ?? createDefaultProject();
    this.computed = computeAtlas(this.doc);
    this.ensurePageAndFurniture();
  }

  update(reason: string, mutator: (doc: ProjectDocument) => void, recompute = true): void {
    mutator(this.doc);
    if (recompute) this.computed = computeAtlas(this.doc);
    this.ensurePageAndFurniture();
    this.lastReason = reason;
    this.lastSavedAt = new Date().toISOString();
    saveLocalDocument(this.doc, this.computed);
    this.dispatchEvent(new CustomEvent<AtlasChangeDetail>('change', { detail: { reason, recomputed: recompute } }));
  }

  replaceDocument(doc: ProjectDocument, reason = '打开图册'): void {
    this.doc = doc;
    this.computed = computeAtlas(this.doc);
    this.ensurePageAndFurniture();
    this.lastReason = reason;
    this.lastSavedAt = new Date().toISOString();
    saveLocalDocument(this.doc, this.computed);
    this.dispatchEvent(new CustomEvent<AtlasChangeDetail>('change', { detail: { reason, recomputed: true } }));
  }

  private ensurePageAndFurniture(): void {
    if (!this.computed.pages.some((page) => page.id === this.doc.currentPageId)) {
      this.doc.currentPageId = this.computed.pages[0]?.id ?? 'plan-1';
    }

    for (const page of this.computed.pages.filter((page) => page.kind === 'plan')) {
      const index = page.index + 1;
      const ensure = (item: ProjectDocument['furniture'][number]) => {
        if (!this.doc.furniture.some((existing) => existing.id === item.id)) this.doc.furniture.push(item);
      };
      ensure({ id: `north-${index}`, type: 'north', pageId: page.id, xMm: 270, yMm: 42, sizeMm: 13 });
      ensure({ id: `scale-${index}`, type: 'scale', pageId: page.id, xMm: 23, yMm: 232, widthMm: 52 });
    }
  }

  buildFile(): AtlasFile {
    return {
      app: 'grass-forest-atlas-studio',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      document: structuredClone(this.doc),
      snapshot: {
        alignmentLengthM: this.computed.alignmentLengthM,
        stationCount: this.computed.stations.length,
        pageCount: this.computed.pages.length,
        grassAreaM2: this.computed.quantities.grassAreaM2,
        seedlingCount: this.computed.quantities.seedlingCount,
        issues: this.computed.quantities.issues.length,
        stations: structuredClone(this.computed.stations),
        pages: structuredClone(this.computed.pages),
        segments: structuredClone(this.computed.quantities.segments),
      },
    };
  }
}
