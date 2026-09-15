import { bindingScope, type BindingKind, type CaptchaBinding } from '../platform/binding-store';
import type { UiLocale } from '../platform/i18n';
import { isEligibleField } from './field-fill';
import { bindingTargetDiagnostic, inspectBindingTarget, selectorForBinding } from './binding-targets';
import type { BindingDiagnostic, BindingTargetDiagnostic } from '../platform/binding-diagnostics';
import { mountPageOverlay } from './page-overlay';
import theme from '../ui/theme.css?raw';

const TEXT = {
  zh_CN: {
    title: '绑定验证码', image: '点击验证码图片', field: '点击要填入的输入框',
    puzzle: '点击拼图背景图片', handle: '点击可以拖动的按钮', track: '点击滑动轨道的空白处',
    ready: '确认目标，保存绑定', scope: '仅用于此网站的当前页面。绑定保存在本机，自动处理遵循网站设置。',
    hint: '移动鼠标查看高亮，点击选中。按 Esc 可随时取消。', cancel: '取消', back: '上一步', save: '保存并识别', saving: '正在保存…', move: '移动引导',
    intro: '告诉我们，验证码在哪里', introBody: '依次选中网页上的目标。保存后，再次打开这个页面就能找到它们。', start: '开始选择',
    labels: ['验证码图片', '输入框', '背景图片', '拖动按钮', '滑动轨道'], invalid: '这里不是当前需要的目标。请按上方提示选择。',
    unstable: '暂时无法准确记住这个目标的位置，绑定尚未保存。', changed: '目标已变化，请重新选择。', failed: '保存失败，请重试。',
    diagnostics: '可从“设置 → 诊断”复制记录用于反馈。',
  },
  en: {
    title: 'Bind CAPTCHA', image: 'Click the CAPTCHA image', field: 'Click the input to fill',
    puzzle: 'Click the puzzle background', handle: 'Click the drag handle', track: 'Click an empty part of the track',
    ready: 'Check your targets, then save', scope: 'Saved locally for this page. Automatic handling follows your site settings.',
    hint: 'Hover to preview, click to select. Press Esc to cancel.', cancel: 'Cancel', back: 'Back', save: 'Save & recognize', saving: 'Saving…', move: 'Move guide',
    intro: 'Show us where the CAPTCHA is', introBody: 'Select the targets on this page. Once saved, we can find them when you return.', start: 'Start selecting',
    labels: ['CAPTCHA image', 'Input field', 'Background', 'Drag handle', 'Slider track'], invalid: 'Choose the target described above.',
    unstable: 'We can’t reliably remember this target’s location yet. The binding hasn’t been saved.', changed: 'The targets changed. Select them again.', failed: 'Could not save. Try again.',
    diagnostics: 'Copy a report from Settings → Diagnostics to report the problem.',
  },
} as const;

export function startBindingPicker(options: {
  kind: BindingKind;
  locale: UiLocale;
  validate(binding: CaptchaBinding): Promise<boolean>;
  save(binding: CaptchaBinding): Promise<void>;
  onFinish(binding?: CaptchaBinding): void;
  record?(diagnostic: BindingDiagnostic): void;
}): () => void {
  const text = TEXT[options.locale];
  const scope = bindingScope(location.href);
  const steps = options.kind === 'text' ? ['image', 'field'] as const : ['image', 'handle', 'track'] as const;
  const selected: { element: Element; selector: string }[] = [];
  let candidate: Element | undefined;
  let saving = false;
  let closed = false;
  let started = false;
  const attemptId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const record = (event: BindingDiagnostic['event'], reason?: BindingDiagnostic['reason'], target?: BindingTargetDiagnostic) => {
    try {
      options.record?.({ ...target, attemptId, kind: options.kind, step: !started ? 'intro' : steps[selected.length] ?? 'confirm', event, ...(reason ? { reason } : {}) });
    } catch { /* Recording must not interrupt target selection. */ }
  };
  let removalObserver: MutationObserver | undefined;
  let modal: Element | null = null;
  const host = document.createElement('div');
  host.setAttribute('data-local-captcha-binding', '');
  host.style.cssText = 'all:initial;position:fixed;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;background:transparent;pointer-events:none;z-index:2147483647';
  const shadow = host.attachShadow({ mode: 'open' });
  const targetLabels = options.kind === 'text' ? text.labels.slice(0, 2) : text.labels.slice(2);
  shadow.innerHTML = `<style>${theme}
    :host{font:14px/1.5 var(--ch-font);color:var(--ch-text)}*{box-sizing:border-box}[hidden]{display:none!important}
    section{font-family:var(--ch-font);color:var(--ch-text);position:fixed;top:20px;left:50%;transform:translateX(-50%);width:min(720px,calc(100vw - 32px));padding:20px 24px;background:var(--ch-surface);border:1px solid var(--ch-line);border-radius:18px;box-shadow:var(--ch-shadow);pointer-events:auto}
    section[data-intro=false]{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 20px;padding:16px 20px}section[data-intro=false] header{grid-column:1/-1}section[data-intro=false] p[data-instruction]{font-size:18px;margin:4px 0 0}section[data-intro=false] p[data-help]{grid-column:1;font-size:11px;margin:0}section[data-intro=false] ol{grid-column:1;margin:4px 0 0}section[data-intro=false] p[data-scope],section[data-intro=false] p[data-error]{grid-column:1/-1;margin:4px 0 0}section[data-intro=false] footer{grid-column:2;grid-row:2/span 3;margin:0;align-self:center;gap:4px}section[data-intro=false] footer button{padding:8px 12px;font-size:12px}
    section[data-intro=true]{top:50%;transform:translate(-50%,-50%);max-width:480px;padding:32px}
    section[data-dock=bottom]{top:auto;bottom:20px}
    header{display:flex;justify-content:space-between;gap:16px;align-items:center;color:var(--ch-muted);font-size:12px}header strong{font-weight:600}small{font:inherit}button[data-move]{min-height:32px;padding:4px 8px;font-size:12px;background:transparent;color:var(--ch-muted)}
    p{margin:10px 0}p[data-instruction]{font-size:21px;font-weight:620;letter-spacing:-.4px;line-height:1.3}p[data-help],p[data-scope]{color:var(--ch-muted);font-size:12px}p[data-error]{color:var(--ch-danger);font-size:13px}p:empty{display:none}
    ol{display:flex;gap:8px;padding:0;margin:18px 0;list-style:none;flex-wrap:wrap}li{display:flex;gap:7px;align-items:center;color:var(--ch-muted);font-size:12px}li+li:before{content:'›';margin-right:3px}li[aria-current=step],li[data-complete=true]{color:var(--ch-accent);font-weight:600}
    footer{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:16px}button{font:600 13px var(--ch-font);white-space:nowrap;cursor:pointer;min-height:40px;padding:9px 16px;background:var(--ch-soft);color:var(--ch-text);border:0;border-radius:10px}button[data-cancel]{margin-right:auto;background:transparent;color:var(--ch-muted)}button:focus-visible{outline:2px solid var(--ch-accent);outline-offset:3px}button:disabled{opacity:.5;cursor:default}button[data-save],button[data-start]{background:var(--ch-accent);color:var(--ch-on-accent)}button:active:not(:disabled){transform:scale(.98)}
    .outline{position:fixed;border:2px solid var(--ch-accent);border-radius:5px;pointer-events:none}.hover{border-style:dashed;background:color-mix(in srgb,var(--ch-accent) 7%,transparent)}.target-label{font-family:var(--ch-font);position:absolute;max-width:calc(100vw - 24px);overflow:hidden;text-overflow:ellipsis;left:-2px;bottom:calc(100% + 6px);padding:3px 8px;border-radius:5px;color:var(--ch-on-accent);background:var(--ch-accent);font-size:12px;white-space:nowrap}
    @media(max-width:600px){section{padding:16px;top:auto;bottom:12px}section[data-dock=top]{top:12px;bottom:auto}section[data-intro=false]{display:block;padding:16px}section[data-intro=false] footer{margin-top:12px}section[data-intro=false] p[data-help]{margin-top:5px}section[data-intro=false] ol{margin:12px 0}section[data-intro=true]{padding:24px;top:50%;bottom:auto}p[data-instruction]{font-size:18px}ol{gap:5px}li{font-size:11px}}
    @media(prefers-reduced-motion:no-preference){[data-instruction]{animation:arrive 180ms ease}button{transition:transform 150ms ease}@keyframes arrive{from{opacity:.4}to{opacity:1}}}
  </style><div data-outlines></div><section role="dialog" aria-label="${text.title}" data-intro="true"><header><strong>Captcha Helper</strong><small data-kind-label>${text.title}</small><button type="button" data-move hidden>${text.move}</button></header><p data-instruction role="status" aria-live="polite"></p><p data-help></p><ol aria-label="${text.title}">${targetLabels.map((label, index) => `<li data-target-step="${index}">${label}</li>`).join('')}</ol><p data-scope>${text.scope}</p><p data-error role="alert"></p><footer><button type="button" data-cancel>${text.cancel}</button><button type="button" data-back>${text.back}</button><button type="button" data-start>${text.start}</button><button type="button" data-save>${text.save}</button></footer></section>`;
  const instruction = shadow.querySelector<HTMLElement>('[data-instruction]')!;
  const error = shadow.querySelector<HTMLElement>('[data-error]')!;
  const outlines = shadow.querySelector<HTMLElement>('[data-outlines]')!;
  const back = shadow.querySelector<HTMLButtonElement>('[data-back]')!;
  const save = shadow.querySelector<HTMLButtonElement>('[data-save]')!;
  const cancel = shadow.querySelector<HTMLButtonElement>('[data-cancel]')!;
  const start = shadow.querySelector<HTMLButtonElement>('[data-start]')!;
  const panel = shadow.querySelector<HTMLElement>('section')!;
  const paint = () => {
    outlines.replaceChildren();
    for (const element of [...selected.map((item) => item.element), ...(candidate ? [candidate] : [])]) {
      if (!element.isConnected) continue;
      const rect = element.getBoundingClientRect();
      const outline = document.createElement('div');
      outline.className = `outline${element === candidate ? ' hover' : ''}`;
      Object.assign(outline.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      const label = document.createElement('span');
      label.className = 'target-label';
      label.textContent = targetLabels[element === candidate ? selected.length : selected.findIndex((item) => item.element === element)] ?? '';
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || rect.right + 140 > innerWidth) Object.assign(label.style, { left: 'auto', right: '-2px' });
      if (rect.top < 30) Object.assign(label.style, { bottom: 'auto', top: 'calc(100% + 6px)' });
      outline.append(label);
      outlines.append(outline);
    }
  };
  const render = () => {
    const step = steps[selected.length];
    panel.dataset.intro = String(!started);
    instruction.textContent = !started ? text.intro : step === undefined ? text.ready : step === 'image' ? options.kind === 'text' ? text.image : text.puzzle : text[step];
    shadow.querySelector('[data-help]')!.textContent = !started ? text.introBody : step === undefined ? '' : text.hint;
    shadow.querySelector<HTMLElement>('[data-scope]')!.hidden = started && step !== undefined;
    shadow.querySelectorAll<HTMLElement>('[data-target-step]').forEach((element, index) => { element.dataset.complete = String(index < selected.length); if (started && index === selected.length) element.setAttribute('aria-current', 'step'); else element.removeAttribute('aria-current'); });
    start.hidden = started;
    shadow.querySelector<HTMLElement>('[data-move]')!.hidden = !started;
    shadow.querySelector<HTMLElement>('[data-kind-label]')!.hidden = started;
    back.hidden = !started;
    back.disabled = selected.length === 0 || saving;
    cancel.disabled = saving;
    save.hidden = !started || step !== undefined;
    save.disabled = saving;
    save.textContent = saving ? text.saving : text.save;
    paint();
  };
  const targetFor = (event: Event): Element | undefined => {
    if (!started || saving || selected.length === steps.length || event.composedPath().includes(host)) return undefined;
    const target = event.composedPath().find((node): node is Element => node instanceof Element);
    if (!target || target.getRootNode() !== document || target.closest('[data-local-captcha-status]')) return undefined;
    const step = steps[selected.length];
    if (step === 'field') {
      const field = target.closest('input,textarea');
      return (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && isEligibleField(field) ? field : undefined;
    }
    if (step === 'image') {
      for (let element: Element | null = target; element && element !== document.body; element = element.parentElement) {
        if (options.kind === 'text' && element instanceof HTMLImageElement) return element;
        if (options.kind === 'slider') {
          const rect = element.getBoundingClientRect();
          const raster = element instanceof HTMLImageElement || element instanceof HTMLCanvasElement || getComputedStyle(element).backgroundImage.includes('url(') || element.querySelector('img,canvas,[style*="background"]') !== null;
          if (raster && rect.width >= 160 && rect.height >= 80 && rect.width <= 600 && rect.height <= 400) {
            const parent = element.parentElement;
            const parentRect = parent?.getBoundingClientRect();
            const layered = parent && parentRect && Math.abs(parentRect.width - rect.width) <= 2 && Math.abs(parentRect.height - rect.height) <= 2 && parent.querySelectorAll('img,canvas').length > 1;
            return layered ? parent : element;
          }
        }
      }
      return undefined;
    }
    if (step === 'track') {
      const handle = selected[1]!.element;
      for (let element: Element | null = target; element && element !== document.body; element = element.parentElement) {
        if (element !== handle && element.contains(handle)) return element;
      }
      return undefined;
    }
    const control = target.closest('[role="slider"],button,[draggable="true"]');
    return control ?? target;
  };
  const move = (event: Event) => {
    candidate = targetFor(event);
    if (candidate && innerWidth > 600) {
      const rect = candidate.getBoundingClientRect();
      panel.dataset.dock = rect.top < 230 ? 'bottom' : 'top';
    }
    paint();
  };
  const intercept = (event: Event) => {
    if (event.composedPath().includes(host) || !started || saving || selected.length === steps.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== 'click') return;
    const element = targetFor(event);
    if (!element) {
      const clicked = event.composedPath().find((node): node is Element => node instanceof Element);
      record('rejected', 'ineligible-target', clicked ? bindingTargetDiagnostic(clicked) : undefined);
      error.textContent = `${text.invalid} ${text.diagnostics}`;
      return;
    }
    const { selector, diagnostic } = inspectBindingTarget(element);
    if (!selector) {
      record('rejected', 'selector-unavailable', diagnostic);
      error.textContent = `${text.unstable} ${text.diagnostics}`;
      return;
    }
    record('selected', undefined, diagnostic);
    selected.push({ element, selector });
    candidate = undefined;
    error.textContent = '';
    render();
    if (selected.length === steps.length) save.focus({ preventScroll: true });
  };
  const finish = (binding?: CaptchaBinding, reason: BindingDiagnostic['reason'] = 'interrupted') => {
    if (closed) return;
    if (!binding) record('cancelled', reason);
    closed = true;
    removalObserver?.disconnect();
    modal?.removeEventListener('close', onDialogClose);
    window.removeEventListener('mousemove', move, true);
    window.removeEventListener('scroll', paint, true);
    window.removeEventListener('resize', paint);
    window.removeEventListener('keydown', keydown, true);
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) window.removeEventListener(type, intercept, true);
    host.remove();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    options.onFinish(binding);
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || saving) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finish(undefined, 'escape');
  };
  const onDialogClose = () => finish(undefined, 'page-closed');
  const previousFocus = document.activeElement;
  shadow.querySelector('[data-move]')!.addEventListener('click', () => { panel.dataset.dock = panel.dataset.dock === 'bottom' ? 'top' : 'bottom'; });
  start.addEventListener('click', () => { started = true; record('started'); render(); cancel.focus({ preventScroll: true }); });
  back.addEventListener('click', () => { selected.pop(); candidate = undefined; error.textContent = ''; record('back'); render(); });
  cancel.addEventListener('click', () => finish(undefined, 'cancel'));
  save.addEventListener('click', () => {
    if (saving || selected.length !== steps.length) return;
    saving = true;
    render();
    const binding: CaptchaBinding = options.kind === 'text'
      ? { kind: 'text', scope, image: selected[0]!.selector, field: selected[1]!.selector }
      : { kind: 'slider', scope, image: selected[0]!.selector, handle: selected[1]!.selector, track: selected[2]!.selector };
    void (async () => {
      let failureReason: BindingDiagnostic['reason'] = 'validation-failed';
      try {
        const reason = scope !== bindingScope(location.href) ? 'page-changed'
          : selected.some(({ element, selector }) => !element.isConnected || selectorForBinding(element) !== selector) ? 'target-changed'
          : !await options.validate(binding) ? 'validation-failed' : undefined;
        if (reason) {
          record('failed', reason);
          error.textContent = `${text.changed} ${text.diagnostics}`;
          return;
        }
        failureReason = 'save-failed';
        await options.save(binding);
        record('saved');
        finish(binding);
      } catch { record('failed', failureReason); error.textContent = `${text.failed} ${text.diagnostics}`; }
      finally { saving = false; if (!closed) render(); }
    })();
  });
  mountPageOverlay(host);
  modal = host.closest('dialog');
  modal?.addEventListener('close', onDialogClose);
  removalObserver = new MutationObserver(() => { if (!host.isConnected) finish(undefined, 'page-closed'); });
  removalObserver.observe(document.documentElement, { subtree: true, childList: true });
  window.addEventListener('mousemove', move, true);
  window.addEventListener('scroll', paint, true);
  window.addEventListener('resize', paint);
  window.addEventListener('keydown', keydown, true);
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) window.addEventListener(type, intercept, true);
  render();
  start.focus({ preventScroll: true });
  return () => finish();
}
