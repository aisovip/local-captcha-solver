import { createExtensionBrowserAdapter, type ExtensionBrowserStoragePermissions } from '../../src/background/extension-browser';
import { GLOBAL_HTTP_ORIGINS } from '../../src/platform/permissions';
import { createTranslator, resolveUiLocale } from '../../src/platform/i18n';
import { createSettingsStore, isAccessMode, isRecognitionShortcut, type AccessMode } from '../../src/platform/settings-store';
import { sendRuntimeMessage } from '../../src/platform/runtime-messaging';
import { supportsPuzzleSliders } from '../../src/platform/extension-capabilities';
import { parseArithmetic } from '../../src/core/arithmetic';
import { releases, releaseUrl } from '../../src/releases/catalog';
import { releaseHistoryMarkup, releaseIntroductionMarkup } from '../../src/releases/view';
import { pageHeaderMarkup } from '../../src/ui/page-header';
import { bindLanguageSwitch } from '../../src/ui/language-switch';
import { bindScrollJourney } from '../../src/ui/scroll-journey';

const DEMO_ORIGINS = ['http://2captcha.com/*', 'https://2captcha.com/*'];
type Flow = 'welcome' | 'upgrade' | 'history' | 'slider';
type Stage = 'setup' | 'complete' | 'slider' | 'slider-complete';

export interface OnboardingBrowser extends ExtensionBrowserStoragePermissions {
  permissions: ExtensionBrowserStoragePermissions['permissions'] & { contains(details: { origins?: string[]; permissions?: string[] }): Promise<boolean> };
  tabs?: { create(details: { url: string }): Promise<unknown> };
  runtime: { sendMessage(message: unknown): Promise<unknown>; getURL(path: string): string; getManifest(): { version?: string; permissions?: readonly string[] } };
  i18n?: { getUILanguage(): string };
}

function switchRow(id: string, checked: boolean, label: string, description: string): string {
  return `<div class="preference-row"><div><label for="${id}">${label}</label><p>${description}</p></div><label class="switch"><input id="${id}" type="checkbox" ${checked ? 'checked' : ''} /><span aria-hidden="true"></span></label></div>`;
}

function drawDemo(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#f7f9f7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#a5b4aa';
  ctx.beginPath(); ctx.moveTo(8, 23); ctx.lineTo(229, 43); ctx.moveTo(12, 64); ctx.lineTo(221, 52); ctx.stroke();
  ctx.fillStyle = '#243c2e'; ctx.font = '40px Georgia, serif'; ctx.fillText('20+22', 42, 55);
}

export async function startOnboarding(root: HTMLElement, extension: OnboardingBrowser, closeGuide: () => void | Promise<void> = () => window.close()): Promise<void> {
  const store = createSettingsStore(createExtensionBrowserAdapter(extension));
  const params = new URLSearchParams(location.search);
  let flow: Flow = params.get('flow') === 'upgrade' ? 'upgrade' : params.get('flow') === 'history' ? 'history' : params.get('flow') === 'slider' ? 'slider' : 'welcome';
  const manifest = extension.runtime.getManifest();
  const sliderSupported = supportsPuzzleSliders(manifest);
  const version = manifest.version ?? releases[0].version;
  const release = releases.find((item) => item.version === (params.get('version') ?? version));
  const unavailableRelease = flow === 'upgrade' && !release;
  if (unavailableRelease) flow = 'history';
  let settings = await store.read();
  if (flow === 'upgrade' && release?.version === version) {
    if (params.get('manual') !== '1' && settings.lastSeenUpgradeGuide === version) { await closeGuide(); return; }
    await store.setLastSeenUpgradeGuide(version);
    if (params.get('manual') !== '1') window.history.replaceState(null, '', releaseUrl(version));
  }
  let stage: Stage = flow === 'slider' ? 'slider' : 'setup';
  let scope: AccessMode = settings.accessMode;
  let sliderScope: AccessMode = settings.sliderAccessMode;
  let sliderConfigured = false;
  let busy = false;
  let debuggerGranted = flow === 'slider' && sliderSupported && await extension.permissions.contains({ permissions: ['debugger'] }).catch(() => false);
  let chapter = flow === 'upgrade' ? 'release-welcome' : flow === 'slider' ? 'setup-slider' : 'setup-welcome';
  let journey: ReturnType<typeof bindScrollJourney> | undefined;
  let transition: ViewTransition | undefined;
  const preferences = { autoFill: settings.autoFill, directFill: settings.directFill, copyOnNoField: settings.copyOnNoField, recognitionShortcut: settings.recognitionShortcut };
  const reconcile = () => extension.runtime.sendMessage({ type: 'captcha:reconcile-access' });
  const openTab = async (path: string) => {
    const url = /^https?:/.test(path) ? path : extension.runtime.getURL(path);
    if (extension.tabs) await extension.tabs.create({ url });
    else window.open(url, '_blank', 'noopener,noreferrer');
  };

  const render = async (target?: string): Promise<void> => {
    settings = await store.read();
    const locale = resolveUiLocale(settings.interfaceLocale, extension.i18n?.getUILanguage() ?? navigator.language);
    const zh = locale === 'zh_CN';
    const t = createTranslator(locale);
    const words = (cn: string, en: string) => zh ? cn : en;
    document.documentElement.lang = zh ? 'zh-CN' : 'en';
    document.title = flow === 'history' ? words('版本记录 · Captcha Helper', 'Release history · Captcha Helper') : flow === 'upgrade' ? `Captcha Helper ${release!.version} · ${words('版本介绍', 'Release introduction')}` : words('开始使用 Captcha Helper', 'Set up Captcha Helper');
    const previousChapter = root.querySelector<HTMLElement>(`#${chapter}`);
    const previousOffset = previousChapter ? -previousChapter.getBoundingClientRect().top : 0;
    const disclosureState = new Map([...root.querySelectorAll<HTMLDetailsElement>('details[id]')].map((details) => [details.id, details.open]));
    if (target) chapter = target;
    const scopeChoices = (slider: boolean) => {
      const value = slider ? sliderScope : scope;
      return `<div class="scope-options" role="radiogroup" aria-label="${t('accessChoice')}">${(['selected', 'all'] as const).map((mode) => `<label class="scope-option"><input type="radio" name="${slider ? 'slider-scope' : 'static-scope'}" data-${slider ? 'slider-choice' : 'onboarding-mode'}="${mode}" value="${mode}" ${value === mode ? 'checked' : ''} /><span><strong>${mode === 'selected' ? t('selectedSites') : t('allSites')}${mode === 'selected' ? `<small class="recommendation">${words('推荐', 'Recommended')}</small>` : ''}</strong><p>${mode === 'selected' ? slider ? words('从 GeeTest 演示网站开始，之后按需添加。', 'Start with the GeeTest demo site, then add other sites as needed.') : words('在需要的网站打开扩展，再单独允许访问。', 'Open the extension on a site and allow access when needed.') : words('在所有普通网页上使用，可随时单独关闭。', 'Use on all regular websites, with individual sites easy to turn off.')}</p></span></label>`).join('')}</div>`;
    };
    const accessNote = () => scope === 'selected'
      ? words('先保存使用范围。访问网站时，再由你允许访问。', 'Save your preference now. Allow access when you visit a site.')
      : words('点击“完成设置”时，浏览器会请求所有网站的访问权限。', 'Finish setup opens the browser’s request for access to all sites.');
    const chapterLink = (id: string, label: string, attributes = '') => `<a href="#${id}" data-journey-link="${id}" ${attributes}>${label}</a>`;
    const backLink = (id: string, label: string) => chapterLink(id, label, 'class="journey-return" data-back');
    const guideError = '<p class="inline-error" data-guide-error role="alert"></p>';
    const welcome = `<section class="journey-section welcome-section" id="setup-welcome" data-chapter data-page="welcome">
      <div class="welcome-content intro-content"><div class="brand-lens"><img class="intro-mark" src="/icons/icon-128.png" width="96" height="96" alt="" /></div><p class="welcome-brand">Captcha Helper</p><h1 tabindex="-1">${words('验证码，在本机处理。', 'Your CAPTCHA. Handled locally.')}</h1><p class="lead">${words('识别常见验证码，帮你完成填写。', 'Recognize everyday CAPTCHAs. Fill with confidence.')}</p>${chapterLink('setup-access', `<span>${words('向下，开始设置', 'Scroll to get started')}</span><span class="page-icon icon-scroll-down" aria-hidden="true"></span>`, 'class="journey-forward welcome-action" data-start')}</div>
    </section>`;
    const access = `<section class="journey-section" id="setup-access" data-chapter data-page="static-settings"><div class="journey-scene setup-scene">
      ${backLink('setup-welcome', words('回看欢迎', 'Back to welcome'))}
      <div class="chapter-heading"><p class="chapter-label">${words('网站范围', 'Site access')}</p><h2 tabindex="-1">${words('在你需要的地方。', 'Right where you need it.')}</h2><p class="lead">${words('选择在哪些网站识别文字与算术验证码。', 'Choose where text and arithmetic recognition can run.')}</p></div>
      <div class="setup-controls">${scopeChoices(false)}<p class="permission-note" data-static-permission-note>${accessNote()}</p></div>
      ${chapterLink('setup-filling', `<span>${words('继续向下，选择填写方式', 'Continue to filling preferences')}</span><span class="page-icon icon-scroll-down" aria-hidden="true"></span>`, 'class="journey-forward" data-next')}
    </div></section>`;
    const filling = `<section class="journey-section" id="setup-filling" data-chapter data-page="preferences"><div class="journey-scene setup-scene">
      ${backLink('setup-access', words('回看网站范围', 'Back to site access'))}
      <div class="chapter-heading"><p class="chapter-label">${words('识别与填写', 'Recognition and filling')}</p><h2 tabindex="-1">${words('识别之后，交给你。', 'The answer is yours.')}</h2><p class="lead">${words('选择结果如何填写，表单始终由你提交。', 'Choose how answers are filled. You always submit the form.')}</p></div>
      <div class="setup-controls"><div class="preference-list">${switchRow('onboarding-auto-fill', preferences.autoFill, t('autoFill'), words('结果足够确定时，填入空输入框。', 'Fill an empty input when the result is reliable.'))}${switchRow('onboarding-direct-fill', preferences.directFill, t('directFill'), t('directFillBody'))}${switchRow('onboarding-copy', preferences.copyOnNoField, t('copyOnNoField'), words('未找到输入框时，将结果复制到剪贴板。', 'Copy the answer when no matching input is found.'))}</div><details class="more-settings" id="setup-more"><summary>${words('更多设置', 'More options')}</summary><label class="shortcut-row" for="onboarding-shortcut">${t('shortcut')}<select id="onboarding-shortcut">${[['middle', t('shortcutMiddle')], ['ctrl-click', t('shortcutCtrl')], ['alt-click', t('shortcutAlt')], ['shift-click', t('shortcutShift')]].map(([value, label]) => `<option value="${value}" ${preferences.recognitionShortcut === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></details><p class="permission-note">${words('图片与识别结果，留在你的浏览器。', 'Images and results stay in your browser.')}</p>${guideError}<footer class="setup-actions"><button type="button" class="primary-button" data-primary data-finish-setup>${words('完成设置', 'Finish setup')}</button></footer></div>
    </div></section>`;
    const practice = `<section class="practice" data-practice hidden><label>${words('示例验证码', 'Sample CAPTCHA')}</label><canvas width="240" height="80" data-demo-canvas aria-label="20 + 22"></canvas><div><button type="button" class="secondary-button" data-run-demo>${t('runDemo')}</button><p data-demo-status role="status">${t('demoIdle')}</p></div></section>`;
    const sliderDone = stage === 'slider-complete';
    const completion = `<section class="journey-section completion-section" id="setup-complete" data-chapter data-page="complete"><div class="journey-scene setup-scene">
      <div class="chapter-heading"><div class="completion-mark" aria-hidden="true">✓</div><h1 tabindex="-1">${sliderDone ? words('滑块，也准备好了。', 'Sliders are ready too.') : words('准备好了。', 'You’re all set.')}</h1><p class="lead">${sliderDone ? words('已保存滑块处理范围。回到网页就能使用，也可以先试试 GeeTest 演示。', 'Your slider scope is saved. Return to a website, or try the GeeTest demo first.') : scope === 'selected' ? words('打开需要验证码的网页，点击工具栏中的 Captcha Helper，允许访问这个网站。', 'Open a website with a CAPTCHA, then choose Captcha Helper in the toolbar to allow that site.') : words('回到网页即可开始使用。需要帮助时，打开工具栏中的 Captcha Helper。', 'Return to a website to begin. Open Captcha Helper in the toolbar whenever you need help.')}</p></div>
      <div class="setup-controls"><div class="completion-actions">${sliderDone ? `<button type="button" class="secondary-button" data-open-geetest>${t('openGeeTestDemo')} <span aria-hidden="true">↗</span></button>` : `<button type="button" class="secondary-button" data-show-demo>${words('体验本地识别', 'Try recognition')}</button>`}<button type="button" class="text-button" data-open-settings>${t('openSettings')}</button></div>${sliderDone ? '' : practice}
      ${sliderSupported && flow === 'welcome' ? `<div class="optional-setup"><div><strong>${sliderConfigured ? words('滑块设置已保存', 'Slider settings saved') : words('也想处理拼图滑块？', 'Use puzzle sliders too?')}</strong><p>${sliderConfigured ? words('按你选择的网站范围自动处理。', 'Automatic handling follows your selected site scope.') : words('可选设置，单独选择运行的网站。', 'An optional setup with its own site access.')}</p></div><button type="button" class="text-button" data-open-slider>${sliderConfigured ? words('调整滑块设置', 'Adjust sliders') : words('设置滑块', 'Set up sliders')}</button></div>` : ''}${guideError}<footer class="wizard-actions"><span class="saved-note">${words('设置已保存', 'Settings saved')}</span><button type="button" class="primary-button" data-primary data-close-guide>${words('开始使用', 'Start using')}</button></footer></div>
    </div></section>`;
    const slider = `<section class="journey-section" id="setup-slider" data-chapter data-page="slider-settings"><div class="journey-scene setup-scene">
      <button type="button" class="journey-return" data-back-slider>${flow === 'welcome' ? t('back') : words('返回设置', 'Back to settings')}</button>
      <div class="chapter-heading"><p class="chapter-label">${words('拼图滑块 · 可选', 'Puzzle sliders · Optional')}</p><h1 tabindex="-1">${sliderSupported ? words('让拼图滑块，也省一步。', 'A little help with puzzle sliders.') : t('firefoxSliderUnavailableTitle')}</h1><p class="lead">${sliderSupported ? words('选择自动处理滑块的网站范围。', 'Choose where sliders can be handled automatically.') : t('firefoxSliderUnavailableBody')}</p></div>
      <div class="setup-controls">${sliderSupported ? scopeChoices(true) + `<p class="permission-note">${t('sliderPermissionBody')}</p>` : ''}${guideError}${sliderSupported ? `<footer class="setup-actions"><button type="button" class="primary-button" data-primary data-enable-slider>${words('开启滑块处理', 'Enable sliders')}</button></footer>` : ''}</div>
    </div></section>`;
    const progress = [['setup-welcome', words('欢迎', 'Welcome')], ['setup-access', words('网站范围', 'Site access')], ['setup-filling', words('填写方式', 'Filling')]];
    const navigation = flow === 'welcome' && stage === 'setup' ? `<nav class="journey-nav" aria-label="${words('设置步骤', 'Setup steps')}"><ol>${progress.map(([id, label]) => `<li>${chapterLink(id, label)}</li>`).join('')}</ol></nav>` : '';
    const content = flow === 'upgrade' ? releaseIntroductionMarkup(release!, version, locale, { directFill: settings.directFill }) : flow === 'history' ? releaseHistoryMarkup(version, locale, unavailableRelease) : stage === 'setup' ? welcome + access + filling : stage === 'slider' ? slider : completion;

    const paint = () => {
      journey?.dispose();
      root.innerHTML = `<div class="setup-page" data-flow="${flow}" data-stage="${stage}">${pageHeaderMarkup(locale, t)}<main class="setup-content" id="setup-content">${content}</main>${navigation}</div>`;
      const canvas = root.querySelector<HTMLCanvasElement>('[data-demo-canvas]');
      if (canvas) drawDemo(canvas);
      if (!target) disclosureState.forEach((open, id) => { const details = root.querySelector<HTMLDetailsElement>(`#${id}`); if (details) details.open = open; });
      if (flow !== 'history') {
        journey = bindScrollJourney(root, (id) => { chapter = id; });
        journey.goTo(chapter, Boolean(target), 'instant');
        if (!target && previousChapter) window.scrollBy({ top: previousOffset, behavior: 'instant' });
      }
      wire();
    };
    if (target && document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      transition?.skipTransition();
      transition = document.startViewTransition(paint);
      await transition.updateCallbackDone;
      void transition.finished.catch(() => undefined);
    } else paint();

    function wire(): void {
      const showError = (message: string) => { const error = root.querySelector('[data-guide-error]'); if (error) error.textContent = message; };
      bindLanguageSwitch(root, async (value) => { await store.setInterfaceLocale(value); await render(); });
      root.querySelectorAll<HTMLInputElement>('[data-onboarding-mode], [data-slider-choice]').forEach((input) => input.addEventListener('change', () => {
        if (!isAccessMode(input.value)) return;
        if (input.hasAttribute('data-slider-choice')) sliderScope = input.value;
        else {
          scope = input.value;
          root.querySelector('[data-static-permission-note]')!.textContent = accessNote();
        }
      }));
      root.querySelector<HTMLInputElement>('#onboarding-auto-fill')?.addEventListener('change', (event) => { preferences.autoFill = (event.target as HTMLInputElement).checked; });
      root.querySelector<HTMLInputElement>('#onboarding-direct-fill')?.addEventListener('change', (event) => { preferences.directFill = (event.target as HTMLInputElement).checked; });
      root.querySelector<HTMLInputElement>('#onboarding-copy')?.addEventListener('change', (event) => { preferences.copyOnNoField = (event.target as HTMLInputElement).checked; });
      root.querySelector<HTMLInputElement>('#release-direct-fill')?.addEventListener('change', (event) => { void store.setDirectFill((event.target as HTMLInputElement).checked); });
      root.querySelector('#onboarding-shortcut')?.addEventListener('change', (event) => { const value = (event.target as HTMLSelectElement).value; if (isRecognitionShortcut(value)) preferences.recognitionShortcut = value; });
      root.querySelector('[data-open-settings]')?.addEventListener('click', () => { void openTab(`options.html#${stage === 'slider-complete' ? 'slider' : 'static'}`); });
      root.querySelector('[data-open-geetest]')?.addEventListener('click', () => { void openTab('https://2captcha.com/demo/geetest'); });
      root.querySelector('[data-open-slider]')?.addEventListener('click', () => {
        if (busy) return;
        busy = true;
        void (async () => {
          debuggerGranted = await extension.permissions.contains({ permissions: ['debugger'] }).catch(() => false);
          stage = 'slider';
          await render('setup-slider');
        })().finally(() => { busy = false; });
      });
      root.querySelector('[data-back-slider]')?.addEventListener('click', () => {
        if (busy) return;
        if (flow === 'slider') { void closeGuide(); return; }
        stage = sliderConfigured ? 'slider-complete' : 'complete';
        void render('setup-complete');
      });
      root.querySelector('[data-show-demo]')?.addEventListener('click', () => {
        root.querySelector<HTMLElement>('[data-practice]')!.hidden = false;
        root.querySelector('[data-practice]')?.scrollIntoView?.({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
      });
      root.querySelector('[data-run-demo]')?.addEventListener('click', () => {
        void (async () => {
          const button = root.querySelector<HTMLButtonElement>('[data-run-demo]')!;
          const status = root.querySelector<HTMLElement>('[data-demo-status]')!;
          const canvas = root.querySelector<HTMLCanvasElement>('[data-demo-canvas]')!;
          button.disabled = true; status.textContent = t('demoRunning');
          try {
            const response = await extension.runtime.sendMessage({ type: 'captcha:recognize', imageDataUrl: canvas.toDataURL('image/png'), revision: `tutorial-${Date.now()}`, modes: ['arithmetic'] });
            const best = Array.isArray(response) ? [...response].filter((item) => typeof item?.text === 'string' && Number.isFinite(item.confidence)).sort((a, b) => b.confidence - a.confidence)[0] : undefined;
            const arithmetic = best ? parseArithmetic(best.text) : null;
            status.textContent = arithmetic ? t('demoResult', { value: `${arithmetic.expression} = ${arithmetic.value}` }) : t('demoFailed');
          } catch { status.textContent = t('demoFailed'); } finally { button.disabled = false; }
        })();
      });
      root.querySelector('[data-close-guide]')?.addEventListener('click', () => { void closeGuide(); });
      root.querySelector<HTMLButtonElement>('[data-finish-setup], [data-enable-slider]')?.addEventListener('click', (event) => {
        if (busy) return;
        const configuringSlider = (event.currentTarget as HTMLElement).hasAttribute('data-enable-slider');
        if (configuringSlider && !debuggerGranted) { showError(t('sliderPermissionRequired')); return; }
        busy = true;
        showError('');
        root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select').forEach((control) => { control.disabled = true; });
        const origins = configuringSlider ? sliderScope === 'all' ? [...GLOBAL_HTTP_ORIGINS] : DEMO_ORIGINS : [...GLOBAL_HTTP_ORIGINS];
        const accessRequest = configuringSlider || scope === 'all' ? extension.permissions.request({ origins }) : Promise.resolve(true);
        void (async () => {
          try {
            if (!await accessRequest) { showError(t((configuringSlider ? sliderScope : scope) === 'all' ? 'settingsAllDenied' : 'permissionDenied')); return; }
            if (configuringSlider) {
              await store.setSliderAccessMode(sliderScope);
              await store.setSliderOnboardingChoice(sliderScope);
              if (sliderScope === 'selected') await store.setSliderEnabled('2captcha.com', true);
              await reconcile();
              sliderConfigured = true;
              stage = 'slider-complete';
            } else {
              await store.setAccessMode(scope);
              await store.setAutoFill(preferences.autoFill);
              await store.setDirectFill(preferences.directFill);
              await store.setCopyOnNoField(preferences.copyOnNoField);
              await store.setRecognitionShortcut(preferences.recognitionShortcut);
              await reconcile();
              await store.setOnboardingComplete(true);
              stage = 'complete';
            }
            await render('setup-complete');
          } catch { showError(words('未能保存设置，请重试。', 'Could not save your settings. Please try again.')); }
          finally {
            busy = false;
            root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select').forEach((control) => { control.disabled = false; });
          }
        })();
      });
    }
  };
  window.addEventListener('pagehide', (event) => { if (!event.persisted) { journey?.dispose(); transition?.skipTransition(); } });
  await render();
}

const root = document.querySelector<HTMLElement>('#app');
if (root !== null && typeof browser !== 'undefined') {
  void startOnboarding(root, {
    storage: browser.storage, permissions: browser.permissions,
    tabs: { create: (details) => browser.tabs.create(details) },
    runtime: { sendMessage: (message) => sendRuntimeMessage(browser.runtime, message), getURL: (path) => (browser.runtime.getURL as (value: string) => string)(path), getManifest: () => browser.runtime.getManifest() },
    i18n: browser.i18n,
  });
}
