let host: HTMLElement | null = null;

export function toast(message: string, durationMs = 2400): void {
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  host.appendChild(el);
  window.setTimeout(() => el.remove(), durationMs);
}
