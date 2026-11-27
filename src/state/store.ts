import { createStore, reconcile } from 'solid-js/store';
import type { BranchAnnotation, BranchData, PruneLabel, SkeletonDataset } from '../types';
import { createSampleTree } from '../data/sampleTree';
import { makeCut } from '../lib/math';

export type StatusFilter = PruneLabel | 'all' | 'unlabeled';
type Snapshot = Record<string, BranchAnnotation>;

function cloneAnnotations(a: Snapshot): Snapshot {
  return JSON.parse(JSON.stringify(a)) as Snapshot;
}

function buildIndex(dataset: SkeletonDataset) {
  const byId = new Map<string, BranchData>();
  const childIds = new Map<string, string[]>();
  for (const b of dataset.branches) {
    byId.set(b.id, b);
    if (b.parentId) {
      const arr = childIds.get(b.parentId) ?? [];
      arr.push(b.id);
      childIds.set(b.parentId, arr);
    }
  }
  for (const arr of childIds.values()) arr.sort();
  return { byId, childIds };
}

const initialDataset = createSampleTree();
const initialIndex = buildIndex(initialDataset);

function initialAnnotations(): Snapshot {
  const a: Snapshot = {};
  const heading = initialIndex.byId.get('B0002');
  if (heading) a[heading.id] = { label: 'heading', cut: makeCut(heading, 0.58, heading.buds[2]?.id ?? null) };
  const reduction = initialIndex.byId.get('B0003');
  if (reduction) a[reduction.id] = { label: 'reduction', cut: makeCut(reduction, 0.42, reduction.buds[1]?.id ?? null) };
  const keep = initialDataset.branches[Math.floor(initialDataset.branches.length * 0.45)];
  if (keep) a[keep.id] = { label: 'keep' };
  const remove = initialDataset.branches[initialDataset.branches.length - 2];
  if (remove) a[remove.id] = { label: 'remove' };
  return a;
}

interface AppStore {
  dataset: SkeletonDataset;
  annotations: Snapshot;
  selectedId: string | null;
  query: string;
  statusFilter: StatusFilter;
  onlyIssues: boolean;
  expanded: Record<string, boolean>;
  past: Snapshot[];
  future: Snapshot[];
  canUndo: boolean;
  canRedo: boolean;
  revision: number;
  committedRevision: number;
  pendingCascade: { id: string; descendantIds: string[]; directCount: number } | null;
  toast: { kind: 'info' | 'success' | 'error'; message: string } | null;
  hoverInfo: { id: string; x: number; y: number } | null;
  minCutDiameterMm: number;
}

export const [store, setStore] = createStore<AppStore>({
  dataset: initialDataset,
  annotations: initialAnnotations(),
  selectedId: null,
  query: '',
  statusFilter: 'all',
  onlyIssues: false,
  expanded: {},
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,
  revision: 0,
  committedRevision: 0,
  pendingCascade: null,
  toast: null,
  hoverInfo: null,
  minCutDiameterMm: 0,
});

let byId = initialIndex.byId;
let childIds = initialIndex.childIds;
let gestureBase: Snapshot | null = null;
let gesturePushed = false;
let coalesceCutForId: string | null = null;
let toastTimer: number | undefined;

export function getBranch(id: string | null | undefined): BranchData | undefined {
  return id ? byId.get(id) : undefined;
}

export function getChildIds(id: string): string[] {
  return childIds.get(id) ?? [];
}

export function getRootIds(): string[] {
  return store.dataset.branches.filter((b) => !b.parentId).map((b) => b.id);
}

export function collectDescendants(id: string): string[] {
  const out: string[] = [];
  const stack = [...(childIds.get(id) ?? [])];
  while (stack.length) {
    const current = stack.pop()!;
    out.push(current);
    for (const child of childIds.get(current) ?? []) stack.push(child);
  }
  return out;
}

export function expandAncestors(id: string) {
  let b = byId.get(id);
  const patch: Record<string, boolean> = {};
  while (b?.parentId) {
    patch[b.parentId] = true;
    b = byId.get(b.parentId);
  }
  if (Object.keys(patch).length) setStore('expanded', (old) => ({ ...old, ...patch }));
}

export function selectBranch(id: string | null, options: { expand?: boolean } = {}) {
  setStore('selectedId', id);
  if (id && options.expand !== false) expandAncestors(id);
}

export function setQuery(q: string) {
  setStore('query', q);
}
export function setStatusFilter(f: StatusFilter) {
  setStore('statusFilter', f);
}
export function toggleExpanded(id: string) {
  setStore('expanded', id, (v) => !v);
}
export function setHoverInfo(info: AppStore['hoverInfo']) {
  setStore('hoverInfo', info);
}
export function setMinCutDiameterMm(mm: number) {
  setStore('minCutDiameterMm', Math.max(0, mm));
}

export function showToast(message: string, kind: 'info' | 'success' | 'error' = 'info') {
  if (toastTimer) window.clearTimeout(toastTimer);
  setStore('toast', { message, kind });
  toastTimer = window.setTimeout(() => setStore('toast', null), 3200);
}

function pushHistory(snapshot: Snapshot = cloneAnnotations(store.annotations)) {
  setStore('past', (past) => {
    const next = [...past, snapshot];
    if (next.length > 120) next.shift();
    return next;
  });
  setStore('future', []);
  setStore('canUndo', true);
  setStore('canRedo', false);
}

function afterMutation(committed = false) {
  setStore('revision', (v) => v + 1);
  if (committed) setStore('committedRevision', (v) => v + 1);
}

export function requestSetLabel(id: string, label: PruneLabel) {
  const current = store.annotations[id]?.label;
  if (current === label) return;
  if (label === 'remove') {
    const descendants = collectDescendants(id);
    if (descendants.length) {
      const directCount = getChildIds(id).length;
      setStore('pendingCascade', { id, descendantIds: descendants, directCount });
      return;
    }
  }
  applyLabel(id, label);
}

export function applyLabel(id: string, label: PruneLabel, extraIds: string[] = []) {
  pushHistory();
  const ids = [id, ...extraIds];
  const minD = store.minCutDiameterMm / 1000;
  for (const branchId of ids) {
    const branch = byId.get(branchId);
    if (!branch) continue;
    if (label === 'heading' || label === 'reduction') {
      const preferredT = label === 'heading' ? 0.62 : 0.46;
      const bud = branch.buds.find((bud) => Math.abs(bud.t - preferredT) < 0.12);
      setStore('annotations', branchId, {
        label,
        cut: makeCut(branch, bud?.t ?? preferredT, bud?.id ?? null, minD),
      });
    } else {
      // Replacing the whole annotation deliberately discards any old cut marker.
      setStore('annotations', branchId, { label, cut: undefined });
    }
  }
  setStore('pendingCascade', null);
  // A drag immediately after assigning a cut label is part of that label edit:
  // one undo returns to the state before the label was chosen.
  coalesceCutForId = extraIds.length === 0 && (label === 'heading' || label === 'reduction') ? id : null;
  afterMutation(true);
}

export function confirmCascade() {
  const pending = store.pendingCascade;
  if (!pending) return;
  applyLabel(pending.id, 'remove', pending.descendantIds);
  showToast(`已将 ${pending.id} 及 ${pending.descendantIds.length} 个后代枝一并标为疏除`, 'success');
}

export function cancelCascade() {
  setStore('pendingCascade', null);
}

export function beginCutGesture(id?: string) {
  if (id && coalesceCutForId === id) {
    // The pre-label snapshot is already on the undo stack.
    gestureBase = null;
    gesturePushed = true;
    return;
  }
  if (!gestureBase) {
    gestureBase = cloneAnnotations(store.annotations);
    gesturePushed = false;
  }
}

/** Ensure a keyboard-initiated adjustment also has a pre-change snapshot. */
export function ensureCutGesture(id?: string) {
  beginCutGesture(id);
}

/** Live update while dragging. The first actual movement creates one undo entry. */
export function updateCutLive(id: string, cut: BranchAnnotation['cut']) {
  if (!gesturePushed) {
    pushHistory(gestureBase ?? cloneAnnotations(store.annotations));
    gesturePushed = true;
  }
  setStore('annotations', id, 'cut', cut ? { ...cut } : undefined);
  afterMutation(false);
}

export function endCutGesture() {
  gestureBase = null;
  gesturePushed = false;
  coalesceCutForId = null;
  afterMutation(true);
}

export function undo() {
  const previous = store.past[store.past.length - 1];
  if (!previous) return;
  gestureBase = null;
  gesturePushed = false;
  coalesceCutForId = null;
  pushFuture(cloneAnnotations(store.annotations));
  setStore('past', (p) => p.slice(0, -1));
  setStore('annotations', reconcile(cloneAnnotations(previous)));
  setStore('canUndo', store.past.length > 0);
  afterMutation(true);
}

export function redo() {
  const next = store.future[store.future.length - 1];
  if (!next) return;
  gestureBase = null;
  gesturePushed = false;
  coalesceCutForId = null;
  setStore('past', (p) => [...p, cloneAnnotations(store.annotations)]);
  setStore('future', (f) => f.slice(0, -1));
  setStore('annotations', reconcile(cloneAnnotations(next)));
  setStore('canUndo', true);
  setStore('canRedo', store.future.length > 0);
  afterMutation(true);
}

function pushFuture(snapshot: Snapshot) {
  setStore('future', (f) => [...f, snapshot]);
  setStore('canRedo', true);
}

export function loadDataset(dataset: SkeletonDataset) {
  const index = buildIndex(dataset);
  byId = index.byId;
  childIds = index.childIds;
  gestureBase = null;
  gesturePushed = false;
  coalesceCutForId = null;
  setStore({
    dataset,
    annotations: {},
    selectedId: null,
    query: '',
    statusFilter: 'all',
    expanded: {},
    past: [],
    future: [],
    canUndo: false,
    canRedo: false,
    revision: (store.revision ?? 0) + 1,
    committedRevision: (store.committedRevision ?? 0) + 1,
    pendingCascade: null,
  });
}

export function annotationList(): Array<{ branch: BranchData; annotation?: BranchAnnotation }> {
  return store.dataset.branches.map((branch) => ({ branch, annotation: store.annotations[branch.id] }));
}

export function labelCounts(): Record<PruneLabel | 'unlabeled', number> {
  const counts = { keep: 0, remove: 0, heading: 0, reduction: 0, unlabeled: 0 };
  for (const b of store.dataset.branches) {
    const label = store.annotations[b.id]?.label;
    if (label) counts[label]++;
    else counts.unlabeled++;
  }
  return counts;
}
