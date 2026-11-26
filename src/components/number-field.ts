const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; min-width: 0; }
    label { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: center; font-size: 12px; color: #334155; }
    .label-text { grid-column: 1 / -1; display: flex; justify-content: space-between; gap: 8px; }
    .value { color: #0f172a; font-variant-numeric: tabular-nums; font-weight: 650; }
    .control { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 46px; gap: 6px; align-items: center; }
    input[type="range"] { width: 100%; accent-color: #0f766e; }
    input[type="number"] { width: 100%; min-width: 0; border: 1px solid #cbd5e1; border-radius: 7px; padding: 5px 6px; font: inherit; font-variant-numeric: tabular-nums; background: white; }
    .unit { font-size: 11px; color: #64748b; }
  </style>
  <label>
    <span class="label-text"><slot name="label"></slot><span class="value" data-value></span></span>
    <span class="control">
      <input data-range type="range" />
      <input data-number type="number" />
    </span>
  </label>
`;

export class NumberFieldElement extends HTMLElement {
  static observedAttributes = ['label', 'value', 'unit', 'min', 'max', 'step', 'path'];

  private range!: HTMLInputElement;
  private number!: HTMLInputElement;
  private valueLabel!: HTMLSpanElement;

  connectedCallback(): void {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot!.appendChild(template.content.cloneNode(true));
    this.range = this.shadowRoot!.querySelector('[data-range]')!;
    this.number = this.shadowRoot!.querySelector('[data-number]')!;
    this.valueLabel = this.shadowRoot!.querySelector('[data-value]')!;

    const label = this.getAttribute('label') ?? '';
    const slot = document.createElement('span');
    slot.slot = 'label';
    slot.textContent = label;
    this.appendChild(slot);

    for (const input of [this.range, this.number]) {
      input.min = this.getAttribute('min') ?? '0';
      input.max = this.getAttribute('max') ?? '100';
      input.step = this.getAttribute('step') ?? '0.1';
      input.addEventListener('input', () => {
        const value = Number(input.value);
        if (!Number.isFinite(value)) return;
        this.value = value;
        this.dispatchEvent(new CustomEvent('value-change', {
          bubbles: true,
          composed: true,
          detail: { path: this.getAttribute('path'), value },
        }));
      });
    }
    this.sync();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.sync();
  }

  get value(): number {
    return Number(this.getAttribute('value') ?? '0');
  }

  set value(value: number) {
    this.setAttribute('value', String(value));
    this.sync();
  }

  private sync(): void {
    if (!this.range || !this.number) return;
    const value = this.value;
    this.range.value = String(value);
    this.number.value = String(value);
    this.valueLabel.textContent = `${value}${this.getAttribute('unit') ? ` ${this.getAttribute('unit')}` : ''}`;
  }
}

customElements.define('number-field', NumberFieldElement);
