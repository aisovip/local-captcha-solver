import type { ImageAccessDetails } from '../../src/background/image-access';
import { IMAGE_CAPTURE_ORIGINS } from '../../src/platform/permissions';
import { resolveUiLocale, type UiLocale } from '../../src/platform/i18n';
import { sendRuntimeMessage } from '../../src/platform/runtime-messaging';
import { SETTINGS_STORAGE_KEY, isInterfaceLocale } from '../../src/platform/settings-store';

interface AccessPageAdapter {
  sendMessage(message: unknown): Promise<unknown>;
  requestPermissions(details: { origins: string[] }): Promise<boolean>;
  close(): void;
}

export async function startImageAccess(root: HTMLElement, tabId: number, adapter: AccessPageAdapter, locale: UiLocale = 'zh_CN'): Promise<void> {
  const zh = locale === 'zh_CN';
  document.documentElement.lang = zh ? 'zh-CN' : 'en';
  document.title = zh ? 'Captcha Helper · 图片访问授权' : 'Captcha Helper · Image access';
  const text = zh ? {
    title: '允许读取验证码图片',
    description: '验证码图片来自其他域名或端口。插件需要读取页面上已经显示的图片，才能继续识别。',
    page: '当前页面', image: '验证码图片',
    permission: '浏览器需要“所有网站”访问权限，才能截取当前页面。两种选择都需要此权限；下面决定插件在哪些网站自动运行。',
    site: '仅添加此网站', siteDetail: '将当前网站加入已选网站名单，使用指定网站模式。',
    all: '在所有网站启用', allDetail: '在 HTTP / HTTPS 网站自动识别，保留你已单独禁用的网站。',
    local: '截图只在本地裁出验证码区域供识别，不保存或上传页面截图。',
    cancel: '暂不授权', working: '正在授权并继续识别…', denied: '你尚未授予权限。可以重新选择，或暂不授权。',
    expired: '页面或验证码已变化，请返回原页面重新识别。', failed: '未能保存授权设置，请重试。',
  } : {
    title: 'Allow access to the CAPTCHA image',
    description: 'The CAPTCHA image comes from another domain or port. The extension needs to read the image already displayed on the page.',
    page: 'Current page', image: 'CAPTCHA image',
    permission: 'The browser requires access to all websites to capture the current page. Both choices require this permission; choose where the extension runs automatically below.',
    site: 'Add this site only', siteDetail: 'Add this site to your selected sites and use selected-site mode.',
    all: 'Enable on all websites', allDetail: 'Recognize on HTTP / HTTPS websites while keeping individually disabled sites excluded.',
    local: 'The screenshot is cropped locally to the CAPTCHA. Page screenshots are never saved or uploaded.',
    cancel: 'Not now', working: 'Authorizing and continuing recognition…', denied: 'Access was not granted. Choose again or close this window.',
    expired: 'The page or CAPTCHA changed. Return to the page and recognize again.', failed: 'Could not save access settings. Try again.',
  };
  root.innerHTML = `<header><img src="/icons/icon-48.png" width="36" height="36" alt=""><span>Captcha Helper</span></header>
    <h1>${text.title}</h1><p>${text.description}</p>
    <dl><dt>${text.page}</dt><dd data-page></dd><dt>${text.image}</dt><dd data-image></dd></dl>
    <p class="permission">${text.permission}</p>
    <div class="choices"><button type="button" data-scope="site" disabled><strong>${text.site}</strong><span>${text.siteDetail}</span></button>
    <button type="button" data-scope="all" disabled><strong>${text.all}</strong><span>${text.allDetail}</span></button></div>
    <p class="local">${text.local}</p><p role="status" aria-live="polite" data-status></p><button class="cancel" type="button" data-cancel>${text.cancel}</button>`;
  root.querySelector('[data-cancel]')!.addEventListener('click', () => adapter.close());
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  let details: ImageAccessDetails;
  try {
    const value = await adapter.sendMessage({ type: 'captcha:get-image-access-details', tabId });
    if (typeof value !== 'object' || value === null || typeof (value as ImageAccessDetails).pageUrl !== 'string' || typeof (value as ImageAccessDetails).requestId !== 'string') throw new Error('Expired request');
    details = value as ImageAccessDetails;
    root.querySelector('[data-page]')!.textContent = new URL(details.pageUrl).origin;
    root.querySelector('[data-image]')!.textContent = details.imageOrigin;
  } catch { status.textContent = text.expired; return; }
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-scope]')];
  for (const button of buttons) {
    button.disabled = false;
    button.addEventListener('click', () => {
      // Request synchronously in the click handler to preserve browser user activation.
      const permission = adapter.requestPermissions({ origins: [...IMAGE_CAPTURE_ORIGINS] });
      buttons.forEach((item) => { item.disabled = true; });
      status.textContent = text.working;
      void permission.then(async (granted) => {
        if (!granted) { status.textContent = text.denied; return; }
        const result = await adapter.sendMessage({ type: 'captcha:complete-image-access', tabId, pageUrl: details.pageUrl, requestId: details.requestId, scope: button.dataset.scope }) as { granted?: boolean; reason?: string };
        if (result?.granted) adapter.close();
        else status.textContent = result?.reason === 'stale' ? text.expired : result?.reason === 'permission' ? text.denied : text.failed;
      }).catch(() => { status.textContent = text.failed; }).finally(() => { buttons.forEach((item) => { item.disabled = false; }); });
    });
  }
}

const root = document.querySelector<HTMLElement>('#app');
if (root !== null && typeof browser !== 'undefined') {
  void browser.storage.local.get(SETTINGS_STORAGE_KEY).then((stored) => {
    const preference = (stored[SETTINGS_STORAGE_KEY] as { interfaceLocale?: unknown } | undefined)?.interfaceLocale;
    const locale = resolveUiLocale(isInterfaceLocale(preference) ? preference : 'system', browser.i18n.getUILanguage());
    return startImageAccess(root, Number(new URLSearchParams(location.search).get('tabId') ?? NaN), {
      sendMessage: (message) => sendRuntimeMessage(browser.runtime, message),
      requestPermissions: (details) => browser.permissions.request(details),
      close: () => window.close(),
    }, locale);
  });
}
