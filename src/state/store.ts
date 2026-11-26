import type {
  Cable,
  Compartment,
  LabelState,
  NumberingRules,
  Project,
  Vec,
  Vent,
  VentKind,
} from '../types';
import { createEmptyProject } from '../lib/sample';
import { renumber } from '../lib/numbering';
import { uid } from '../lib/util';

const STORAGE_KEY = 'granary-layout/project/v1';
const HISTORY_LIMIT = 60;

type Listener = () => void;

class Store {
  private project: Project = createEmptyProject();
  private undoStack: Project[] = [];
  private redoStack: Project[] = [];
  private listeners = new Set<Listener>();
  private suppressHistory = false;
  selectedId: string | null = null;
  /** 局部放大页聚焦的廒间 */
  focusedCompartmentId: string | null = null;
  /** 编号规则草稿的"编辑前"副本,用于让重排成为一次可撤销操作 */
  private rulesBaseline: NumberingRules | null = null;

  get state(): Project {
    return this.project;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** 结构性/语义性修改前压入历史快照 */
  private snapshot(): void {
    if (this.suppressHistory) return;
    this.undoStack.push(cloneProject(this.project));
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  private commit(): void {
    this.persist();
    this.emit();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(cloneProject(this.project));
    this.project = prev;
    this.selectedId = null;
    this.commit();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(cloneProject(this.project));
    this.project = next;
    this.selectedId = null;
    this.commit();
  }

  /** 高频拖动:先 begin() 一次,中间用 live() 不压栈,end() 压一次合并快照 */
  beginInteraction(): Project {
    this.snapshot();
    this.suppressHistory = true;
    return this.project;
  }

  liveUpdate(): void {
    this.persist();
    this.emit();
  }

  endInteraction(): void {
    this.suppressHistory = false;
    this.persist();
    this.emit();
  }

  // ---------- 工程级 ----------

  loadProject(next: Project, remember = true): void {
    if (remember) this.snapshot();
    this.project = migrate(next);
    this.selectedId = null;
    this.focusedCompartmentId = this.project.compartments[0]?.id ?? null;
    this.commit();
  }

  updateProject(mut: (p: Project) => void): void {
    this.snapshot();
    mut(this.project);
    this.commit();
  }

  /** 编号规则页开始编辑:记录编辑前规则(只记一次,重复调用不覆盖) */
  beginRuleDraft(): void {
    if (!this.rulesBaseline) {
      this.rulesBaseline = JSON.parse(
        JSON.stringify(this.project.rules)
      ) as NumberingRules;
    }
  }

  /** 编号规则页的草稿:未点"重排"前不进撤销栈,只随自动保存持久化 */
  setDraftRules(mut: (r: NumberingRules) => void): void {
    this.beginRuleDraft();
    mut(this.project.rules);
    this.persist();
    this.emit();
  }

  /** 放弃草稿,回到编辑前规则 */
  discardRuleDraft(): void {
    if (this.rulesBaseline) {
      this.project.rules = JSON.parse(
        JSON.stringify(this.rulesBaseline)
      ) as NumberingRules;
      this.rulesBaseline = null;
      this.persist();
      this.emit();
    }
  }

  /**
   * 应用规则:把"编辑前规则"作为撤销快照压栈,再落草稿 + 重编号 + 解绑固定。
   * 这样一次 Ctrl+Z 即可整体回到旧编号。
   */
  applyRulesAndRenumber(mut: (r: NumberingRules) => void): void {
    if (this.rulesBaseline) {
      // 用编辑前的完整工程压快照
      const baselineProject = cloneProject(this.project);
      baselineProject.rules = JSON.parse(
        JSON.stringify(this.rulesBaseline)
      ) as NumberingRules;
      this.undoStack.push(baselineProject);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
      this.rulesBaseline = null;
    } else {
      this.snapshot();
    }
    mut(this.project.rules);
    renumber(this.project);
    for (const e of [...this.project.cables, ...this.project.vents]) {
      e.label.pinned = false;
      e.sectionLabel.pinned = false;
    }
    this.commit();
  }

  /** 只持久化与广播,不进撤销栈(标注避让这类派生性修改使用) */
  notifySilently(): void {
    this.persist();
    this.emit();
  }

  /** 记录批量导入前快照,返回当前工程供解析函数就地追加 */
  beginBulkImport(): Project {
    this.snapshot();
    return this.project;
  }

  /** 批量导入结束:持久化并广播 */
  endBulkImport(): void {
    this.commit();
  }

  // ---------- 廒间 ----------

  addCompartment(): Compartment {
    this.snapshot();
    const p = this.project;
    const n = p.compartments.length + 1;
    const w = Math.max(4, p.warehouse.width / Math.max(1, n));
    const comp: Compartment = {
      id: uid('comp'),
      name: `${n}号廒间`,
      rect: { x: 0, y: 0, w, h: p.warehouse.depth }
    };
    p.compartments.push(comp);
    this.commit();
    return comp;
  }

  updateCompartment(id: string, mut: (c: Compartment) => void): void {
    const comp = this.project.compartments.find((c) => c.id === id);
    if (!comp) return;
    this.snapshot();
    mut(comp);
    this.commit();
  }

  removeCompartment(id: string): void {
    this.snapshot();
    const p = this.project;
    p.compartments = p.compartments.filter((c) => c.id !== id);
    p.cables = p.cables.filter((c) => c.compartmentId !== id);
    p.vents = p.vents.filter((v) => v.compartmentId !== id);
    if (this.focusedCompartmentId === id) {
      this.focusedCompartmentId = p.compartments[0]?.id ?? null;
    }
    this.commit();
  }

  // ---------- 实体 ----------

  getEntity(id: string | null): Cable | Vent | undefined {
    if (!id) return undefined;
    return (
      this.project.cables.find((c) => c.id === id) ??
      this.project.vents.find((v) => v.id === id)
    );
  }

  addCable(compartmentId: string, pos: Vec): Cable {
    this.snapshot();
    const cable: Cable = {
      id: uid('cable'),
      type: 'cable',
      compartmentId,
      pos: { ...pos },
      seq: this.project.cables.length + 1,
      points: [
        { layer: 1, depth: 1 },
        { layer: 2, depth: 2.5 }
      ],
      label: { pos: { ...pos }, pinned: false },
      sectionLabel: { pos: { x: pos.x, y: 0 }, pinned: false }
    };
    this.project.cables.push(cable);
    renumber(this.project);
    this.selectedId = cable.id;
    this.commit();
    return cable;
  }

  addVent(compartmentId: string, pos: Vec): Vent {
    this.snapshot();
    const vent: Vent = {
      id: uid('vent'),
      type: 'vent',
      compartmentId,
      pos: { ...pos },
      seq: this.project.vents.length + 1,
      kind: '地槽',
      ductElevation: -0.5,
      angle: 0,
      label: { pos: { ...pos }, pinned: false },
      sectionLabel: { pos: { x: pos.x, y: 0 }, pinned: false }
    };
    this.project.vents.push(vent);
    renumber(this.project);
    this.selectedId = vent.id;
    this.commit();
    return vent;
  }

  updateEntity(id: string, mut: (e: Cable | Vent) => void): void {
    const e = this.getEntity(id);
    if (!e) return;
    this.snapshot();
    mut(e);
    this.commit();
  }

  removeEntity(id: string): void {
    this.snapshot();
    const p = this.project;
    p.cables = p.cables.filter((c) => c.id !== id);
    p.vents = p.vents.filter((v) => v.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    this.commit();
  }

  moveEntity(id: string, pos: Vec): void {
    const e = this.getEntity(id);
    if (!e) return;
    e.pos = { ...pos };
  }

  setLabel(
    id: string,
    where: 'label' | 'sectionLabel',
    label: LabelState
  ): void {
    const e = this.getEntity(id);
    if (!e) return;
    e[where] = label;
  }

  unpinAllLabels(where: 'label' | 'sectionLabel'): void {
    this.snapshot();
    for (const e of [...this.project.cables, ...this.project.vents]) {
      e[where].pinned = false;
    }
    this.commit();
  }

  setVentKind(id: string, kind: VentKind): void {
    this.updateEntity(id, (e) => {
      if (e.type === 'vent') e.kind = kind;
    });
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.emit();
  }

  // ---------- 持久化 ----------

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
    } catch {
      /* 隐私模式等场景下静默失败 */
    }
  }

  restore(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      this.project = migrate(JSON.parse(raw) as Project);
      this.focusedCompartmentId = this.project.compartments[0]?.id ?? null;
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  exportJSON(): string {
    return JSON.stringify(this.project, null, 2);
  }

  exportFile(): void {
    const blob = new Blob([this.exportJSON()], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.project.name || '布点工程'}.layout.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importJSON(text: string): void {
    const data = JSON.parse(text) as Project;
    this.loadProject(migrate(data));
  }
}

export function cloneProject(p: Project): Project {
  return JSON.parse(JSON.stringify(p)) as Project;
}

/** 旧版本数据向前兼容(目前只有 v1,预留迁移位) */
function migrate(raw: Project): Project {
  const p = raw as Project;
  if (!p.version) p.version = 1;
  // 兜底:保证每条实体都带双视图标注
  for (const e of [...p.cables, ...p.vents]) {
    if (!e.label) e.label = { pos: { ...e.pos }, pinned: false };
    if (!e.sectionLabel) {
      e.sectionLabel = { pos: { x: e.pos.x, y: 0 }, pinned: false };
    }
  }
  return p;
}

export const store = new Store();
