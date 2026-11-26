import { BaseComponent } from './base';
import { store } from '../state/store';
import { cableCode, pointCode, ventCode } from '../lib/numbering';
import { CanvasHost } from './canvas-host';
import { buildPlanScene, defaultPlanLabel } from '../lib/two-scene';
import { toast } from '../lib/toast';
import type { NumberingRules } from '../types';

export class RulesPage extends BaseComponent {
  private host: CanvasHost | null = null;

  protected template(): string {
    return `
      <div class="layout" style="overflow:auto;padding:18px;background:var(--bg)">
        <div class="page-card" style="margin-bottom:16px">
          <h3 class="panel-title">编号规则</h3>
          <p style="color:var(--muted);margin-top:0">
            规则只决定"怎么编号",实体本身靠内部 id 与标注绑定,所以重排后符号位置、引线标注、平面/剖面对应关系都不会丢。
          </p>
          <div class="form-grid" data-ref="form"></div>
          <div style="display:flex;gap:10px;margin-top:14px;align-items:center;flex-wrap:wrap">
            <button class="primary" data-action="apply">按新规则重排(重新编号并整体让一遍标注)</button>
            <span data-ref="preview" class="code-preview"></span>
          </div>
          <div class="hint">
            示例:前缀 C、起始 1、不补零、分层后缀从 1 起 → 电缆 C1,其 8 个测点 C1-1 … C1-8。<br>
            风口在全仓范围内连续编号;电缆按廒间分组、组内按"从里到外、从左到右"排序编号。
          </div>
        </div>
        <div class="page-card" style="height:360px;display:flex;flex-direction:column">
          <h3 class="panel-title">重排效果预览(平面,只读)</h3>
          <div class="canvas-wrap" data-ref="canvas" style="border:1px solid var(--line);border-radius:6px"></div>
        </div>
      </div>`;
  }

  private field(key: keyof NumberingRules, label: string, value: string | number): string {
    const isText = key.includes('Prefix');
    return `
      <div class="field">
        <label>${label}</label>
        <input type="${isText ? 'text' : 'number'}" min="0"
               data-action-input="rule:${key}" value="${value}">
      </div>`;
  }

  connectedCallback(): void {
    super.connectedCallback();
    requestAnimationFrame(() => this.mountHost());
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    // 没点"重排"就离开,草稿规则回退,避免半成品编号残留
    store.discardRuleDraft();
    this.host?.dispose();
    this.host = null;
  }

  private mountHost(): void {
    const container = this.refs.canvas;
    if (!container || this.host) return;
    this.host = new CanvasHost(container, {
      mode: 'plan',
      compartmentFilter: () => null,
      labelKey: 'label',
      build: (two, cam, project) =>
        buildPlanScene(two, cam, project, {
          labelText: defaultPlanLabel(project),
          selectedId: null
        }),
      layoutBounds: (p) => ({
        minX: -1.5,
        minY: -1.5,
        maxX: p.warehouse.width + 1.5,
        maxY: p.warehouse.depth + 1.5
      })
    });
  }

  protected onInputAction(action: string, el: HTMLInputElement): void {
    if (!action.startsWith('rule:')) return;
    const key = action.slice(5) as keyof NumberingRules;
    // 草稿态:不进撤销栈,点"重排"时合并落账
    store.setDraftRules((r) => {
      if (key.includes('Prefix')) {
        (r[key] as string) = el.value;
      } else {
        (r[key] as number) = Math.max(0, Number(el.value) || 0);
      }
    });
    this.updatePreview();
    this.host?.refresh();
  }

  protected onAction(action: string): void {
    if (action !== 'apply') return;
    // 规则草稿 + 重编号 + 解绑固定合并为一次可撤销操作,标注避让不另压栈
    store.applyRulesAndRenumber(() => {});
    this.host?.relayoutAll();
    toast('已按新规则重新编号,标注已整体重排');
    this.render();
  }

  private updatePreview(): void {
    const p = store.state;
    const firstCable = p.cables[0];
    const firstVent = p.vents[0];
    const parts: string[] = [];
    if (firstCable) {
      const last = firstCable.points[firstCable.points.length - 1];
      parts.push(
        `电缆 ${cableCode(firstCable, p.rules)}` +
          (firstCable.points[0] && last
            ? `,测点 ${pointCode(firstCable, firstCable.points[0], p.rules)}~${pointCode(
                firstCable,
                last,
                p.rules
              )}`
            : '')
      );
    }
    if (firstVent) parts.push(`风口 ${ventCode(firstVent, p.rules)}`);
    if (this.refs.preview) {
      this.refs.preview.textContent = parts.length
        ? parts.join('  |  ')
        : '暂无符号,先到数据录入页导入';
    }
  }

  protected render(): void {
    const r = store.state.rules;
    const form = this.refs.form;
    if (form) {
      form.innerHTML = [
        this.field('cablePrefix', '电缆前缀(如 C)', r.cablePrefix),
        this.field('cableStartFrom', '电缆起始序号', r.cableStartFrom),
        this.field('cablePadding', '电缆序号补零位数(1=不补零)', r.cablePadding),
        this.field('layerStartFrom', '分层后缀起始号', r.layerStartFrom),
        this.field('layerPadding', '分层后缀补零位数', r.layerPadding),
        this.field('ventPrefix', '风口前缀(如 F)', r.ventPrefix),
        this.field('ventStartFrom', '风口起始序号', r.ventStartFrom),
        this.field('ventPadding', '风口序号补零位数', r.ventPadding)
      ].join('');
    }
    this.updatePreview();
    this.host?.refresh();
  }
}
