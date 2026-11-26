import sharedCss from './shared.css?inline';
import { store } from '../state/store';

/**
 * Web Component 基类:Shadow DOM 样式隔离 + store 订阅自动重渲染。
 * 子类实现 render():首次连接和每次 store 变更时调用;
 * 用 this.refs 取模板内元素,事件用 data-action 委托,避免重复绑定。
 * 每次 render 后自动重新收集 refs,避免 innerHTML 重建后引用过期。
 */
export abstract class BaseComponent extends HTMLElement {
  protected root: ShadowRoot;
  private unsubscribe: (() => void) | null = null;
  protected refs: Record<string, HTMLElement> = {};

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.root.innerHTML = `<style>${sharedCss}</style>${this.template()}`;
    this.bindEvents();
    this.collectRefs(); // 首次 render 前先收集,保证 render 内可访问 this.refs
    this.render();
    this.collectRefs(); // render 可能重建 DOM,再收集一次
    this.unsubscribe = store.subscribe(() => this.rerender());
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private rerender(): void {
    this.render();
    this.collectRefs();
  }

  private collectRefs(): void {
    this.refs = {};
    this.root.querySelectorAll<HTMLElement>('[data-ref]').forEach((el) => {
      this.refs[el.dataset.ref as string] = el;
    });
  }

  private bindEvents(): void {
    this.root.addEventListener('click', (ev) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!el) return;
      this.onAction(el.dataset.action as string, el, ev);
    });
    this.root.addEventListener('change', (ev) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action-change]');
      if (!el) return;
      this.onChangeAction(el.dataset.actionChange as string, el as HTMLInputElement);
    });
    this.root.addEventListener('input', (ev) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action-input]');
      if (!el) return;
      this.onInputAction(el.dataset.actionInput as string, el as HTMLInputElement);
    });
  }

  protected abstract template(): string;
  protected abstract render(): void;
  protected onAction(_action: string, _el: HTMLElement, _ev: Event): void {}
  protected onChangeAction(_action: string, _el: HTMLInputElement): void {}
  protected onInputAction(_action: string, _el: HTMLInputElement): void {}
}
