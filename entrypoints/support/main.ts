import { createExtensionBrowserAdapter, type ExtensionBrowserStoragePermissions } from '../../src/background/extension-browser';
import { createTranslator, resolveUiLocale } from '../../src/platform/i18n';
import { createSettingsStore } from '../../src/platform/settings-store';
import { pageHeaderMarkup } from '../../src/ui/page-header';
import { bindLanguageSwitch } from '../../src/ui/language-switch';

interface SupportBrowser extends ExtensionBrowserStoragePermissions {
  i18n?: { getUILanguage(): string };
}

export async function startSupport(root: HTMLElement, extension: SupportBrowser): Promise<void> {
  const store = createSettingsStore(createExtensionBrowserAdapter(extension));
  const render = async (): Promise<void> => {
    const settings = await store.read();
    const locale = resolveUiLocale(settings.interfaceLocale, extension.i18n?.getUILanguage() ?? navigator.language);
    const zh = locale === 'zh_CN';
    const t = createTranslator(locale);
    const words = (cn: string, en: string) => zh ? cn : en;
    document.documentElement.lang = zh ? 'zh-CN' : 'en';
    document.title = `${words('请我喝杯咖啡', 'Buy me a coffee')} · Captcha Helper`;
    root.innerHTML = `
      <a class="skip-link" href="#support-content">${words('跳到正文', 'Skip to content')}</a>
      <div class="support-page">
        ${pageHeaderMarkup(locale, t)}
        <main id="support-content" class="support-content" tabindex="-1">
          <div class="support-letter">
            <h1>${words('请我喝杯咖啡。', 'Buy me a coffee.')}</h1>
            <p class="support-intro">${words('如果 Captcha Helper 帮你省了些时间，欢迎请我喝杯咖啡，支持我继续维护。', 'If Captcha Helper saves you time, a coffee is a lovely way to support its development.')}</p>
            <a class="support-kofi" href="https://ko-fi.com/hongshuowang" target="_blank" rel="noopener noreferrer">${words('通过 Ko-fi 支持', 'Support on Ko-fi')}<span aria-hidden="true">↗</span></a>
            <p class="support-thanks">${words('谢谢你的使用、反馈和支持。', 'Thank you for using it, sharing feedback, and supporting the project.')}<span>Hongshuo Wang</span></p>
          </div>
          <figure class="support-payment">
            <figcaption><h2>${words('微信扫一扫', 'Scan with WeChat')}</h2><p>${words('金额随心，感谢支持。', 'Any amount is appreciated.')}</p></figcaption>
            <img class="support-qr" src="/support/wechat.png" width="448" height="484" alt="${words('Hongshuo Wang 的微信收款二维码', 'WeChat collection QR code for Hongshuo Wang')}" />
            <a class="save-qr" href="/support/wechat.png" download="captcha-helper-wechat.png">${words('保存收款码', 'Save QR code')}</a>
            <p class="support-scan-hint">${words('也可保存图片，在微信扫一扫中从相册选取。', 'You can also save the image and choose it from your album in WeChat’s scanner.')}</p>
          </figure>
        </main>
        <footer class="support-footer"><p>${words('自愿支持 · 所有功能免费使用', 'Optional support · All features are free')}</p><nav aria-label="${words('项目信息', 'Project information')}"><a class="icon-control" href="options.html#about" aria-label="${words('关于插件', 'About the extension')}" title="${words('关于插件', 'About the extension')}"><span class="page-icon icon-info" aria-hidden="true"></span></a><a class="icon-control" href="https://github.com/hongshuo-wang/local-captcha-solver" target="_blank" rel="noopener noreferrer" aria-label="${words('GitHub 开源仓库', 'GitHub repository')}" title="${words('GitHub 开源仓库', 'GitHub repository')}"><span class="page-icon icon-github" aria-hidden="true"></span></a></nav></footer>
      </div>`;
    bindLanguageSwitch(root, async (value) => {
      await store.setInterfaceLocale(value);
      await render();
    });
  };
  await render();
}

const extension = (globalThis as { browser?: SupportBrowser; chrome?: SupportBrowser }).browser
  ?? (globalThis as { chrome?: SupportBrowser }).chrome;
const root = document.querySelector<HTMLElement>('#app');
if (extension && root) void startSupport(root, extension);
