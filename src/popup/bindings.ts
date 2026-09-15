import { bindingScope, type BindingKind } from '../platform/binding-store';
import { originsForPage } from '../platform/permissions';
import type { UiLocale } from '../platform/i18n';
import type { PopupControllerAdapter } from './controller';

export function bindingControls(locale: UiLocale, sliderSupported: boolean): string {
  const zh = locale === 'zh_CN';
  const kinds: BindingKind[] = sliderSupported ? ['text', 'slider'] : ['text'];
  return `<details class="binding-controls" data-binding-help><summary data-binding-summary>${zh ? '找不到验证码？手动指定位置' : 'Can’t find it? Choose its location'}</summary><div class="binding-content"><p>${zh ? '先在网页中打开验证码，再选择对应的类型。' : 'Open the CAPTCHA on the page, then choose its type.'}</p>${kinds.map((kind) => `<section class="binding-choice" data-binding-controls="${kind}"><div><strong>${kind === 'text' ? zh ? '文字验证码' : 'Text CAPTCHA' : zh ? '拼图滑块' : 'Puzzle slider'}</strong><button type="button" data-remove-binding="${kind}" hidden>${zh ? '删除绑定' : 'Remove'}</button></div><p data-binding-status="${kind}" role="status">${kind === 'text' ? zh ? '选择验证码图片和要填入的输入框。' : 'Choose the CAPTCHA image and its input.' : zh ? '选择背景图片、拖动按钮和轨道。' : 'Choose the background, handle and track.'}</p><button type="button" data-bind="${kind}" disabled>${zh ? '开始绑定' : 'Start binding'}</button></section>`).join('')}</div></details>`;
}

export function startPopupBindings(root: HTMLElement, adapter: PopupControllerAdapter, locale: UiLocale, closePopup: () => void, sliderSupported: boolean): void {
  const zh = locale === 'zh_CN';
  const kinds: BindingKind[] = sliderSupported ? ['text', 'slider'] : ['text'];
  const savedKinds = new Set<BindingKind>();
  const updateSummary = () => { root.querySelector('[data-binding-summary]')!.textContent = savedKinds.size > 0 ? zh ? '已绑定当前页面' : 'This page has saved targets' : zh ? '找不到验证码？手动指定位置' : 'Can’t find it? Choose its location'; };
  for (const kind of kinds) {
    const button = root.querySelector<HTMLButtonElement>(`[data-bind="${kind}"]`)!;
    const remove = root.querySelector<HTMLButtonElement>(`[data-remove-binding="${kind}"]`)!;
    const status = root.querySelector<HTMLElement>(`[data-binding-status="${kind}"]`)!;
    let scope: string | undefined;
    let pageUrl: string | undefined;
    let tabId: number | undefined;
    const refresh = async () => {
      const [tab] = await adapter.tabs.query({ active: true, currentWindow: true });
      if (typeof tab?.url !== 'string' || typeof tab.id !== 'number') return;
      scope = bindingScope(tab.url);
      pageUrl = tab.url;
      tabId = tab.id;
      button.disabled = false;
      const value = await adapter.runtime.sendMessage({ type: 'captcha:get-bindings' }) as { scope?: string; bindings?: { kind?: string }[] } | undefined;
      const saved = value?.scope === scope && value.bindings?.some((binding) => binding.kind === kind);
      button.textContent = saved ? zh ? '重新绑定' : 'Rebind CAPTCHA' : zh ? '开始绑定' : 'Start binding';
      remove.hidden = !saved;
      if (saved) savedKinds.add(kind);
      else savedKinds.delete(kind);
      updateSummary();
      if (saved) {
        const state = await adapter.tabs.sendMessage?.(tabId, { type: 'captcha:binding-status' }).catch(() => undefined) as Record<string, string> | undefined;
        status.textContent = state?.[kind] === 'ready'
          ? zh ? '已找到本页绑定的目标。' : 'The saved targets are present.'
          : zh ? '已绑定当前路径；等待验证码出现，也可重新绑定。' : 'Saved for this path. Open the CAPTCHA or rebind its targets.';
      }
    };
    void refresh().catch(() => { button.disabled = true; status.textContent = zh ? '请在普通网页中使用绑定。' : 'Open a regular website to bind its CAPTCHA.'; });
    button.addEventListener('click', () => {
      if (tabId === undefined || pageUrl === undefined || scope === undefined) return;
      button.disabled = true;
      const expected = { tabId, scope, pageUrl };
      void (async () => {
        try {
          const origins = [...originsForPage(expected.pageUrl)];
          if (!await adapter.permissions.request({ origins })) throw new Error('Permission denied');
          const [current] = await adapter.tabs.query({ active: true, currentWindow: true });
          if (current?.id !== expected.tabId || typeof current.url !== 'string' || bindingScope(current.url) !== expected.scope) throw new Error('Page changed');
          const ready = await adapter.tabs.sendMessage?.(expected.tabId, { type: 'captcha:ping' }).catch(() => undefined);
          if (!(ready && typeof ready === 'object' && 'ok' in ready && ready.ok === true)) {
            if (!adapter.scripting) throw new Error('Content unavailable');
            await adapter.scripting.executeScript({ target: { tabId: expected.tabId }, files: ['content-scripts/content.js'] });
          }
          const result = await adapter.tabs.sendMessage?.(expected.tabId, { type: 'captcha:begin-binding', kind, scope: expected.scope });
          if (typeof result !== 'object' || result === null || (result as { started?: unknown }).started !== true) throw new Error('Picker unavailable');
          closePopup();
        } catch {
          status.textContent = zh ? '未能开始绑定，请确认网站授权并在当前操作结束后重试。' : 'Could not start. Check site access and retry after the current operation.';
          button.disabled = false;
        }
      })();
    });
    remove.addEventListener('click', () => {
      remove.disabled = true;
      void adapter.runtime.sendMessage({ type: 'captcha:remove-binding', scope, kind }).then(async (result) => {
        if (typeof result !== 'object' || result === null || (result as { ok?: unknown }).ok !== true) throw new Error('Removal failed');
        status.textContent = zh ? '已删除绑定，使用自动检测。' : 'Binding removed. Automatic detection applies.';
        await refresh();
      }).catch(() => { status.textContent = zh ? '删除失败，请重新打开扩展面板后重试。' : 'Could not remove the binding. Reopen the popup and retry.'; }).finally(() => { remove.disabled = false; });
    });
  }
}
