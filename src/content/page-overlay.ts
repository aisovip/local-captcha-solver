export function mountPageOverlay(host: HTMLElement, anchor?: Element): void {
  const modal = anchor?.closest('dialog[open]') ?? document.querySelector('dialog:modal');
  (modal ?? document.body).append(host);
  if (!modal || typeof host.showPopover !== 'function') return;
  Object.assign(host.style, { margin: '0', padding: '0', border: '0', background: 'transparent', overflow: 'visible' });
  host.setAttribute('popover', 'manual');
  host.showPopover();
}
