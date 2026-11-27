import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { LABEL_META, type PruneLabel } from '../types';
import {
  getChildIds,
  getRootIds,
  labelCounts,
  selectBranch,
  setQuery,
  setStatusFilter,
  store,
  toggleExpanded,
  type StatusFilter,
} from '../state/store';

const ROW_H = 34;

interface Row {
  id: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  subtitle?: string | null;
}

export default function BranchList(props: { onFocusBranch: (id: string) => void }) {
  let scrollRef: HTMLDivElement | undefined;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportH, setViewportH] = createSignal(600);
  let observer: ResizeObserver | undefined;

  onMount(() => {
    if (scrollRef) {
      setViewportH(scrollRef.clientHeight);
      observer = new ResizeObserver(() => setViewportH(scrollRef!.clientHeight));
      observer.observe(scrollRef);
    }
  });
  onCleanup(() => observer?.disconnect());

  const counts = createMemo(() => {
    store.revision;
    return labelCounts();
  });

  const rows = createMemo<Row[]>(() => {
    store.revision;
    const q = store.query.trim().toLowerCase();
    const filter = store.statusFilter;
    const searching = Boolean(q) || filter !== 'all';

    const matches = (id: string) => {
      const b = store.dataset.branches.find((x) => x.id === id);
      if (!b) return false;
      if (q && !`${b.id} ${b.parentId ?? ''}`.toLowerCase().includes(q)) return false;
      if (filter === 'unlabeled' && store.annotations[id]) return false;
      if (filter !== 'all' && filter !== 'unlabeled' && store.annotations[id]?.label !== filter) return false;
      return true;
    };

    if (searching) {
      return store.dataset.branches.filter((b) => matches(b.id)).map((b) => ({
        id: b.id,
        depth: 0,
        hasChildren: getChildIds(b.id).length > 0,
        expanded: false,
        subtitle: b.parentId ? `父枝 ${b.parentId}` : '根枝',
      }));
    }

    const out: Row[] = [];
    const walk = (id: string, depth: number) => {
      const children = getChildIds(id);
      const expanded = !!store.expanded[id];
      out.push({ id, depth, hasChildren: children.length > 0, expanded });
      if (expanded) for (const child of children) walk(child, depth + 1);
    };
    for (const root of getRootIds()) walk(root, 0);
    return out;
  });

  createEffect(() => {
    const id = store.selectedId;
    if (!id || !scrollRef) return;
    const index = rows().findIndex((r) => r.id === id);
    if (index < 0) return;
    const top = index * ROW_H;
    const bottom = top + ROW_H;
    const viewTop = scrollRef.scrollTop;
    const viewBottom = viewTop + scrollRef.clientHeight;
    if (top < viewTop + 4) scrollRef.scrollTo({ top: Math.max(0, top - ROW_H * 2), behavior: 'smooth' });
    else if (bottom > viewBottom - 4) scrollRef.scrollTo({ top: bottom - scrollRef.clientHeight + ROW_H * 2, behavior: 'smooth' });
  });

  const visible = createMemo(() => {
    const all = rows();
    const start = Math.max(0, Math.floor(scrollTop() / ROW_H) - 12);
    const visibleCount = Math.ceil(viewportH() / ROW_H) + 24;
    return all.slice(start, start + visibleCount).map((row, i) => ({ row, index: start + i }));
  });

  const filters: Array<{ key: StatusFilter; label: string; count?: number; color?: string }> = [
    { key: 'all', label: '全部' },
    { key: 'unlabeled', label: '未标', count: counts().unlabeled, color: '#8d7d68' },
    ...(['keep', 'remove', 'heading', 'reduction'] as PruneLabel[]).map((key) => ({
      key,
      label: LABEL_META[key].label,
      count: counts()[key],
      color: LABEL_META[key].color,
    })),
  ];

  return (
    <aside class="left-panel panel">
      <div class="panel-head">
        <div>
          <h2>枝条清单</h2>
          <p>{rows().length.toLocaleString()} 行 · 共 {store.dataset.branches.length.toLocaleString()} 枝</p>
        </div>
      </div>

      <div class="list-controls">
        <div class="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            value={store.query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="搜索枝 ID / 父枝 ID"
            aria-label="搜索枝条"
          />
          <Show when={store.query}>
            <button class="ghost-mini" onClick={() => setQuery('')} title="清空搜索">
              ×
            </button>
          </Show>
        </div>
        <div class="filter-chips">
          <For each={filters}>
            {(f) => (
              <button
                class="chip"
                classList={{ active: store.statusFilter === f.key }}
                onClick={() => setStatusFilter(f.key)}
                title={f.label}
              >
                <Show when={f.color}>
                  <i class="chip-dot" style={{ background: f.color }} />
                </Show>
                <span>{f.label}</span>
                <Show when={f.count !== undefined}>
                  <em>{f.count!.toLocaleString()}</em>
                </Show>
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="branch-scroll" ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        <div style={{ height: `${rows().length * ROW_H}px`, position: 'relative' }}>
          <For each={visible()}>
            {({ row, index }) => {
              const ann = () => store.annotations[row.id];
              const branch = () => store.dataset.branches.find((b) => b.id === row.id);
              return (
                <div
                  class="branch-row"
                  classList={{ selected: store.selectedId === row.id, labeled: !!ann() }}
                  style={{ transform: `translateY(${index * ROW_H}px)`, 'padding-left': `${8 + row.depth * 14}px` }}
                  onClick={() => selectBranch(row.id)}
                  onDblClick={() => props.onFocusBranch(row.id)}
                  title={`${row.id}｜双击聚焦枝条`}
                >
                  <Show
                    when={row.hasChildren}
                    fallback={<span class="expand-placeholder" />}
                  >
                    <button
                      class="expand-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(row.id);
                      }}
                      aria-label={row.expanded ? '折叠' : '展开'}
                    >
                      {row.expanded ? '▾' : '▸'}
                    </button>
                  </Show>
                  <i
                    class="status-dot"
                    style={{ background: ann() ? LABEL_META[ann()!.label].color : '#b7ad9d' }}
                  />
                  <span class="row-id">{row.id}</span>
                  <Show when={row.subtitle}>
                    <span class="row-subtitle">{row.subtitle}</span>
                  </Show>
                  <Show when={ann()}>
                    <span
                      class="row-badge"
                      style={{ background: LABEL_META[ann()!.label].color, color: LABEL_META[ann()!.label].text }}
                    >
                      {LABEL_META[ann()!.label].short}
                    </span>
                  </Show>
                  <Show when={ann()?.cut}>
                    <span class="cut-mini" title="含剪口坐标">
                      ✂
                    </span>
                  </Show>
                  <Show when={branch()?.parentId && !row.subtitle}>
                    <span class="row-parent">{branch()!.parentId}</span>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
        <Show when={rows().length === 0}>
          <div class="empty-list">没有匹配的枝条，试试清空搜索或筛选。</div>
        </Show>
      </div>
      <div class="list-foot">单击选择 · 双击在三维中聚焦 · 虚拟列表支持数千枝</div>
    </aside>
  );
}
