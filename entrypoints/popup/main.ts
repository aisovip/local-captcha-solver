import { createModelStatusController, createPopupController, type PopupControllerAdapter, type PopupControllerLabels, type PopupView, type PopupViewState } from '../../src/popup/controller';
import type { ModelLog, ModelStatusSnapshot } from '../../src/background/model-status';
import { createTranslator, resolveUiLocale, type UiLocale } from '../../src/platform/i18n';
import { createSettingsStore, hostnameForPage, type SiteRecognitionMode } from '../../src/platform/settings-store';
import { originsForPage } from '../../src/platform/permissions';
import { createExtensionBrowserAdapter } from '../../src/background/extension-browser';
import { sendRuntimeMessage } from '../../src/platform/runtime-messaging';
import { SLIDER_RESULT_STATES, type SliderActivity, type SliderResultState, type SliderSiteState } from '../../src/slider/types';
import { supportsPuzzleSliders } from '../../src/platform/extension-capabilities';
import { bindingControls, startPopupBindings } from '../../src/popup/bindings';
import { version } from '../../package.json';

type SliderDisplayState = 'loading' | 'off' | 'idle' | 'running' | 'unavailable' | SliderResultState;

export interface PopupViewElements extends PopupView {
  checkbox: HTMLInputElement;
  accessButton: HTMLButtonElement;
  modelRetry: HTMLButtonElement;
  recognizeButton: HTMLButtonElement;
  settingsButton: HTMLButtonElement;
  modeSelect: HTMLSelectElement;
  sliderButton: HTMLButtonElement;
  sliderCheckbox: HTMLInputElement;
  sliderPanel: HTMLElement;
  sliderStateMode: HTMLElement;
  sliderStateTitle: HTMLElement;
  sliderStatus: HTMLElement;
  showContext(kind: 'text' | 'slider' | 'none'): void;
  renderModelStatus(snapshot: ModelStatusSnapshot): void;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`Popup view is missing ${selector}`);
  return element;
}

function activityText(log: ModelLog | undefined, locale: UiLocale): string {
  if (log === undefined) return '';
  if (locale === 'zh_CN') return log.message;
  if (log.kind === 'slider') return log.outcome === 'success' ? 'Slider verification completed' : 'Slider verification did not complete';
  if (log.outcome === 'failure') return 'Recognition failed';
  if (log.outcome === 'skipped') return 'No safe automatic action';
  if (log.kind === 'warmup') return log.outcome === 'success' ? 'Local model is ready' : 'Preparing the local model';
  return log.outcome === 'started' ? 'Recognition started' : 'Recognition completed';
}

export function createPopupView(root: HTMLElement, locale: UiLocale = 'zh_CN', sliderSupported = true): PopupViewElements {
  const t = createTranslator(locale);
  const zh = locale === 'zh_CN';
  const updatesLabel = zh ? '新功能' : 'What’s new';
  const historyLabel = zh ? '版本记录' : 'Release history';
  const supportLabel = zh ? '请我喝杯咖啡' : 'Buy me a coffee';
  const supportCaption = zh ? '支持开发者' : 'Support the developer';
  root.innerHTML = `
    <div class="popup-shell" data-context="text">
      <header class="popup-header">
        <div class="brand"><img class="brand-mark" src="/icons/icon-48.png" alt="" width="28" height="28" /><h1>Captcha Helper</h1></div>
        <nav aria-label="${zh ? '扩展菜单' : 'Extension menu'}">
          <button type="button" class="popup-tool" data-open-updates aria-label="${updatesLabel}" data-tooltip="${updatesLabel}"><span class="page-icon icon-sparkle" aria-hidden="true"></span></button>
          <button type="button" class="popup-tool" data-open-settings aria-label="${t('navSettings')}" data-tooltip="${t('navSettings')}"><span class="page-icon icon-settings" aria-hidden="true"></span></button>
        </nav>
      </header>
      <section class="page-context"><span>${t('currentSite')}</span><strong data-popup-hostname>${zh ? '正在读取…' : 'Loading…'}</strong></section>
      <section class="workspace" aria-label="${zh ? '当前页面' : 'Current page'}">
        <div data-text-state><h2 data-context-title>${zh ? '处理这一页的验证码' : 'Handle this page’s CAPTCHA'}</h2><p data-context-body>${zh ? '识别完成后，结果会显示在验证码旁。' : 'Results appear beside the CAPTCHA.'}</p></div>
        <div data-slider-panel hidden><div class="workspace-heading"><h2 data-slider-state-title></h2><span data-slider-state-mode hidden></span></div><p data-slider-status role="status" aria-live="polite"></p></div>
        <button type="button" class="primary-command" data-recognize-page>${t('recognizePage')}</button>
        <button type="button" class="primary-command" data-run-slider hidden>${zh ? '处理当前滑块' : 'Handle slider'}</button>
      </section>
      ${bindingControls(locale, sliderSupported)}
      <p class="workspace-error" data-workspace-error role="alert" hidden></p>
      <details class="site-options" data-page-options><summary data-site-summary>${zh ? '此网站的设置' : 'Settings for this site'}</summary>
        <section class="access-panel" data-access-panel hidden><p data-access-copy></p><button type="button" class="secondary-command" data-access-button>${t('grantAll')}</button></section>
        <div data-controls-panel><div class="control-row"><div><label for="site-enabled">${zh ? '自动识别文字' : 'Recognize text automatically'}</label><p data-popup-status role="status"></p></div><label class="switch"><input id="site-enabled" type="checkbox" aria-label="${t('siteControl')}" /><span></span></label></div>
        <label class="control-row" for="captcha-mode"><span>${t('captchaType')}</span><select id="captcha-mode" data-captcha-mode><option value="auto">${t('modeAuto')}</option><option value="digits">${t('modeDigits')}</option><option value="letters">${t('modeLetters')}</option><option value="alphanumeric">${t('modeAlphanumeric')}</option><option value="arithmetic">${t('modeArithmetic')}</option></select></label></div>
        ${sliderSupported ? `<div class="control-row"><div><label for="slider-enabled">${zh ? '自动处理滑块' : 'Handle sliders automatically'}</label><p>${zh ? '只在此网站生效' : 'Applies to this site'}</p></div><label class="switch"><input id="slider-enabled" data-slider-enabled type="checkbox" aria-label="${zh ? '在此网站自动处理滑块' : 'Automatically handle sliders on this site'}" /><span></span></label></div>` : '<input data-slider-enabled type="checkbox" hidden disabled />'}
      </details>
      <footer class="popup-footer">
        <div class="footer-utilities">
          <div class="model-strip">
            <div class="model-state" role="status"><span data-model-indicator data-state="loading" aria-hidden="true"></span><span data-model-summary>${zh ? '正在准备' : 'Preparing locally'}</span></div>
            <button type="button" data-model-retry aria-label="${t('retryModel')}" hidden>${zh ? '重试' : 'Retry'}</button>
          </div>
          <nav class="popup-links" aria-label="${zh ? '项目信息' : 'Project information'}">
            <a class="popup-tool popup-version" href="onboarding.html?flow=history" target="_blank" rel="noreferrer" data-open-history aria-label="${historyLabel}, v${version}" data-tooltip="${historyLabel}"><span class="page-icon icon-history" aria-hidden="true"></span><span>v${version}</span></a>
            <a class="popup-tool popup-support" href="support.html" target="_blank" rel="noreferrer" data-open-support aria-label="${supportCaption}, ${supportLabel}" data-tooltip="${supportLabel}"><span class="page-icon icon-coffee" aria-hidden="true"></span><span class="support-caption">${supportCaption}</span></a>
          </nav>
        </div>
        <p class="latest-activity" data-latest-activity role="status" hidden></p>
      </footer>
    </div>`;
  const shell = required<HTMLElement>(root, '.popup-shell');
  shell.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') shell.dataset.tooltipsDismissed = '';
  });
  for (const type of ['pointerover', 'focusin']) {
    shell.addEventListener(type, (event) => {
      if (event.target instanceof Element && event.target.closest('.popup-tool')) delete shell.dataset.tooltipsDismissed;
    });
  }
  const checkbox = required<HTMLInputElement>(root, '#site-enabled');
  const accessButton = required<HTMLButtonElement>(root, '[data-access-button]');
  const recognizeButton = required<HTMLButtonElement>(root, '[data-recognize-page]');
  const sliderButton = required<HTMLButtonElement>(root, '[data-run-slider]');
  const sliderPanel = required<HTMLElement>(root, '[data-slider-panel]');
  const modelRetry = required<HTMLButtonElement>(root, '[data-model-retry]');
  let available = false;
  let context: 'text' | 'slider' | 'none' | undefined;
  const renderContext = () => {
    if (!available) return;
    required(root, '[data-context-title]').textContent = context === 'none' ? zh ? '还没找到验证码' : 'No CAPTCHA in view yet' : context === 'text' ? zh ? '验证码，可以开始识别' : 'Ready to recognize' : zh ? '处理这一页的验证码' : 'Handle this page’s CAPTCHA';
    required(root, '[data-context-body]').textContent = context === 'none' ? zh ? '先打开网页中的验证码，也可以手动指定位置。' : 'Open the CAPTCHA on the page, or choose its location below.' : zh ? '识别结果会显示在图片或输入框旁。' : 'The result appears beside the image or input.';
    recognizeButton.textContent = context === 'none' ? zh ? '重新检测当前页' : 'Check this page again' : t('recognizePage');
  };
  return {
    checkbox, accessButton, recognizeButton, sliderButton, sliderPanel, modelRetry,
    settingsButton: required(root, '[data-open-settings]'),
    modeSelect: required(root, '[data-captcha-mode]'),
    sliderCheckbox: required(root, '[data-slider-enabled]'),
    sliderStateMode: required(root, '[data-slider-state-mode]'),
    sliderStateTitle: required(root, '[data-slider-state-title]'),
    sliderStatus: required(root, '[data-slider-status]'),
    showContext(kind) {
      const slider = sliderSupported && kind === 'slider';
      required<HTMLElement>(root, '.popup-shell').dataset.context = kind;
      required<HTMLElement>(root, '[data-text-state]').hidden = slider;
      sliderPanel.hidden = !slider;
      sliderButton.hidden = !slider;
      recognizeButton.hidden = slider;
      context = kind;
      renderContext();
    },
    render(state) {
      available = state.recognitionAvailable;
      required(root, '[data-popup-hostname]').textContent = state.hostname;
      checkbox.checked = state.checked;
      checkbox.disabled = state.disabled;
      recognizeButton.disabled = !available;
      required<HTMLElement>(root, '[data-access-panel]').hidden = state.accessGranted || !available;
      required(root, '[data-access-copy]').textContent = state.error ?? state.status;
      accessButton.textContent = state.accessMode === 'all' ? t('grantAll') : zh ? '允许此网站' : 'Allow this site';
      required(root, '[data-site-summary]').textContent = available && !state.accessGranted ? zh ? '允许此网站自动识别' : 'Allow automatic recognition here' : zh ? '此网站的设置' : 'Settings for this site';
      const error = required<HTMLElement>(root, '[data-workspace-error]');
      error.textContent = state.error ?? '';
      error.hidden = !state.error;
      root.querySelectorAll<HTMLElement>('[data-controls-panel]').forEach((el) => { el.hidden = !state.accessGranted && available; });
      required(root, '[data-popup-status]').textContent = state.error ?? state.status;
      renderContext();
      if (!available) {
        required(root, '[data-context-title]').textContent = zh ? '在网页中使用 Captcha Helper' : 'Open a website to begin';
        required(root, '[data-context-body]').textContent = zh ? '切换到需要验证码的网页，再打开扩展。' : 'Switch to the website with a CAPTCHA, then open the extension.';
      }
    },
    renderModelStatus(snapshot) {
      required(root, '[data-model-summary]').textContent = snapshot.status === 'ready' ? zh ? '本地就绪' : 'Local ready' : snapshot.status === 'error' ? zh ? '识别暂不可用' : 'Unavailable' : zh ? '正在准备' : 'Preparing locally';
      required<HTMLElement>(root, '.model-state').title = snapshot.status === 'ready' ? zh ? '验证码在本机处理' : 'CAPTCHAs are processed on this device' : snapshot.status === 'error' ? zh ? '本地识别暂不可用，请重试' : 'Local recognition is unavailable. Try again.' : zh ? '正在准备本地识别' : 'Preparing local recognition';
      required<HTMLElement>(root, '[data-model-indicator]').dataset.state = snapshot.status;
      required<HTMLElement>(root, '.model-strip').dataset.state = snapshot.status;
      modelRetry.hidden = snapshot.status !== 'error';
      modelRetry.disabled = snapshot.status === 'loading';
      const latest = [...snapshot.logs].reverse().find((log) => log.kind === 'workflow') ?? [...snapshot.logs].reverse().find((log) => log.kind === 'recognition' && log.outcome !== 'started');
      const activity = required<HTMLElement>(root, '[data-latest-activity]');
      activity.textContent = activityText(latest, locale);
      activity.title = activity.textContent;
      activity.hidden = latest === undefined;
    },
  };
}

function labels(locale: UiLocale): PopupControllerLabels {
  if (locale === 'zh_CN') {
    return {
      loadingHostname: '正在读取网站…', loadingSite: '正在读取网站设置…', off: '此网站未开启自动识别。', on: '此网站已开启自动识别。',
      unsupported: '当前页面不支持自动识别。', unsupportedHostname: '不支持的页面', allSitesHostname: '所有网站',
      accessNeeded: (mode) => mode === 'all' ? '启用全站访问后开始自动识别。' : '允许访问此网站后开始自动识别。',
      requestingAccess: (mode) => mode === 'all' ? '正在请求全站访问权限…' : '正在请求此网站访问权限…',
      accessDenied: '需要授权后才能自动识别。', accessFailed: '无法完成网站授权。', updating: '正在更新网站设置…', readFailed: '无法读取网站设置。', updateFailed: '无法更新网站设置。',
      pageRecognitionFailed: '无法在当前页面启动识别。',
    };
  }
  return {
    loadingHostname: 'Reading site...', loadingSite: 'Reading site settings...', off: 'Automatic recognition is disabled on this site.', on: 'Automatic recognition is enabled on this site.',
    unsupported: 'This page is not supported.', unsupportedHostname: 'Unsupported page', allSitesHostname: 'All sites',
    accessNeeded: (mode) => mode === 'all' ? 'Allow all sites to start automatic recognition.' : 'Allow this site to start automatic recognition.',
    requestingAccess: (mode) => mode === 'all' ? 'Requesting access to all sites...' : 'Requesting access to this site...',
    accessDenied: 'Site access is required for automatic recognition.', accessFailed: 'Could not complete site authorization.', updating: 'Updating site settings...', readFailed: 'Could not read site settings.', updateFailed: 'Could not update site settings.',
    pageRecognitionFailed: 'Could not start recognition on this page.',
  };
}

export function formatDiagnosticSnapshot(snapshot: ModelStatusSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export function startPopup(
  root: HTMLElement,
  adapter: PopupControllerAdapter,
  locale: UiLocale = 'zh_CN',
  openSettings: () => Promise<void> = async () => undefined,
  closePopup: () => void = () => window.close(),
  siteModes?: {
    read(): Promise<SiteRecognitionMode>;
    write(mode: SiteRecognitionMode): Promise<void>;
  },
  sliderCapability = true,
  openUpdates: () => Promise<unknown> = async () => undefined,
): void {
  const view = createPopupView(root, locale, sliderCapability);
  const t = createTranslator(locale);
  const controller = createPopupController(adapter, view, labels(locale));
  const modelController = createModelStatusController(adapter, view);
  startPopupBindings(root, adapter, locale, closePopup, sliderCapability);
  required(root, '[data-open-updates]').addEventListener('click', () => { void openUpdates(); });
  view.accessButton.addEventListener('click', () => { void controller.grantAccess().then(() => readPageContext(true)); });
  view.checkbox.addEventListener('change', () => { void controller.setEnabled(view.checkbox.checked); });
  view.modelRetry.addEventListener('click', () => { void modelController.retry(); });
  let textBusy = false;
  view.recognizeButton.addEventListener('click', () => {
    if (textBusy) return;
    textBusy = true;
    view.recognizeButton.disabled = true;
    void (async () => {
      const pageContext = await readPageContext(true);
      if (pageContext === 'slider' && sliderCapability) {
        textBusy = false;
        view.recognizeButton.disabled = false;
        view.sliderButton.click();
        return;
      }
      const original = view.recognizeButton.textContent;
      view.recognizeButton.disabled = true;
      view.recognizeButton.textContent = t('recognizingPage');
      const started = await controller.recognizeCurrentPage();
      textBusy = false;
      if (started && pageContext !== 'none') closePopup();
      else {
        if (pageContext === 'none') required<HTMLDetailsElement>(root, '[data-binding-help]').open = true;
        view.recognizeButton.disabled = false;
        view.recognizeButton.textContent = original;
      }
    })();
  });
  view.settingsButton.addEventListener('click', () => { void openSettings(); });
  const sliderText = locale === 'zh_CN' ? {
    off: ['发现拼图滑块', '点击下方按钮处理，也可在网站设置中开启自动处理。'],
    idle: ['滑块自动处理已开启', '检测到滑块后会自动处理，也可以立即重试。'],
    automaticRunning: ['正在自动拖动', '已发现滑块，正在定位并拖动。'],
    manualRunning: ['正在处理当前滑块', '正在定位缺口，请稍候。'],
    automaticSuccess: ['已自动完成拖动', '本次滑块验证已通过。'],
    manualSuccess: ['本次处理已完成', '滑块验证已通过。'],
    notFound: ['未发现可处理的滑块', '已停止操作，可等待滑块出现或再次检测。'],
    lowConfidence: ['请手动完成当前滑块', '定位结果不够确定，为避免误操作已停止。'],
    inactive: ['等待页面恢复', '页面当前不可操作，返回页面后会再次检测。'],
    userActive: ['已暂停自动拖动', '请先完成当前操作，之后会继续检测。'],
    permission: ['未获得拖动权限', '请在扩展设置中检查滑块权限。'],
    failed: ['本次未能完成', '操作已停止，可手动再次检测。'],
    unavailable: ['当前页面不可用', '请在包含拼图滑块的网页使用。'],
    automatic: '自动处理', manual: '手动处理', command: '处理当前滑块', retry: '重新处理滑块', working: '正在处理…',
  } : {
    off: ['Puzzle slider found', 'Handle it below, or enable automatic handling in site settings.'],
    idle: ['Automatic sliders enabled', 'Sliders will be handled when detected. You can also retry now.'],
    automaticRunning: ['Dragging automatically', 'Locating and dragging the slider.'],
    manualRunning: ['Handling the current slider', 'Locating the gap. Please wait.'],
    automaticSuccess: ['Automatic drag completed', 'This slider verification passed.'],
    manualSuccess: ['Current slider completed', 'Slider verification passed.'],
    notFound: ['No supported slider found', 'No input was sent; wait for a slider or check again.'],
    lowConfidence: ['Complete this slider manually', 'The location was uncertain, so the extension stopped to avoid a wrong action.'],
    inactive: ['Waiting for the page', 'The page is not currently actionable; it will be checked again when you return.'],
    userActive: ['Automatic drag paused', 'Finish your current action; detection will resume afterward.'],
    permission: ['Drag permission unavailable', 'Check slider access in extension settings.'],
    failed: ['This attempt did not complete', 'The operation stopped; check the current slider again.'],
    unavailable: ['Current page unavailable', 'Open a website with a puzzle slider to begin.'],
    automatic: 'Automatic', manual: 'Manual', command: 'Handle slider', retry: 'Retry slider', working: 'Working…',
  };
  let sliderHostname: string | undefined;
  let debuggerGranted = false;
  let sliderSupported = false;
  let sliderEnabled = false;
  let sliderBusy = false;
  let sliderDisplayState: SliderDisplayState = 'loading';
  let sliderReadGeneration = 0;

  const sliderActivity = (value: unknown): SliderActivity | undefined => {
    if (typeof value !== 'object' || value === null) return undefined;
    const candidate = value as { state?: unknown; trigger?: unknown; at?: unknown; confidence?: unknown; reason?: unknown };
    if (candidate.state !== 'running' && !SLIDER_RESULT_STATES.includes(candidate.state as SliderResultState)) return undefined;
    if (candidate.trigger !== 'manual' && candidate.trigger !== 'automatic') return undefined;
    if (typeof candidate.at !== 'number' || !Number.isFinite(candidate.at)) return undefined;
    return {
      state: candidate.state as SliderActivity['state'],
      trigger: candidate.trigger,
      at: candidate.at,
      ...(typeof candidate.confidence === 'number' ? { confidence: candidate.confidence } : {}),
      ...(typeof candidate.reason === 'string' ? { reason: candidate.reason } : {}),
    };
  };
  const displayForActivity = (activity: SliderActivity): SliderDisplayState => {
    if (activity.state === 'unsupported') return 'not-found';
    return activity.state;
  };
  const displayForResult = (state: SliderResultState): SliderDisplayState => state === 'unsupported' ? 'not-found' : state;
  const updateSliderControls = (): void => {
    const running = sliderDisplayState === 'running';
    view.sliderCheckbox.disabled = !sliderSupported || sliderBusy || running || !debuggerGranted;
    view.sliderButton.disabled = !sliderSupported || sliderBusy || running || !debuggerGranted;
  };
  const renderSliderState = (enabled: boolean, state: SliderDisplayState, trigger?: SliderActivity['trigger']): void => {
    const previousState = sliderDisplayState;
    sliderEnabled = enabled;
    sliderDisplayState = state;
    view.sliderCheckbox.checked = enabled;
    view.sliderPanel.dataset.state = state;

    if (state === 'running' || (state === 'success' && previousState === 'running')) view.showContext('slider');
    const automatic = trigger === 'automatic';
    const content = state === 'off' ? sliderText.off
      : state === 'idle' || state === 'loading' ? sliderText.idle
        : state === 'running' ? (automatic ? sliderText.automaticRunning : sliderText.manualRunning)
          : state === 'success' ? (automatic ? sliderText.automaticSuccess : sliderText.manualSuccess)
            : state === 'not-found' ? sliderText.notFound
              : state === 'low-confidence' ? sliderText.lowConfidence
                : state === 'page-inactive' ? sliderText.inactive
                  : state === 'user-active' ? sliderText.userActive
                    : state === 'permission-denied' ? sliderText.permission
                      : state === 'unavailable' ? sliderText.unavailable
                        : sliderText.failed;
    view.sliderStateTitle.textContent = content[0];
    view.sliderStatus.textContent = content[1];
    view.sliderStateMode.hidden = trigger === undefined;
    view.sliderStateMode.textContent = automatic ? sliderText.automatic : sliderText.manual;
    view.sliderButton.textContent = state === 'running' ? sliderText.working
      : state === 'success' || state === 'not-found' || state === 'low-confidence' || state === 'failed' || state === 'uncertain' ? sliderText.retry
        : sliderText.command;
    updateSliderControls();
  };
  const readSliderState = async (): Promise<void> => {
    const generation = ++sliderReadGeneration;
    const value = await adapter.runtime.sendMessage({ type: 'captcha:get-slider-state' });
    if (generation !== sliderReadGeneration || sliderBusy) return;
    if (typeof value !== 'object' || value === null || (value as { supported?: unknown }).supported !== true) {
      sliderHostname = undefined;
      sliderSupported = false;
      renderSliderState(false, 'unavailable');
      return;
    }
    const state = value as Partial<SliderSiteState>;
    sliderSupported = true;
    sliderHostname = typeof state.hostname === 'string' ? state.hostname : undefined;
    debuggerGranted = state.debuggerGranted === true;
    const enabled = state.enabled === true;
    const activity = sliderActivity(state.activity);
    if (!debuggerGranted) renderSliderState(false, 'permission-denied');
    else if (activity !== undefined) renderSliderState(enabled, displayForActivity(activity), activity.trigger);
    else renderSliderState(enabled, enabled ? 'idle' : 'off');

  };
  const ensureSliderPageAccess = async (): Promise<boolean> => {
    const tabs = await adapter.tabs.query({ active: true, currentWindow: true });
    const pageUrl = typeof tabs[0]?.url === 'string' ? tabs[0].url : undefined;
    if (pageUrl === undefined) return false;
    const frameOrigins = typeof tabs[0]?.id === 'number' ? await adapter.scripting?.frameOrigins?.(tabs[0].id).catch(() => []) ?? [] : [];
    const origins = [...new Set([...originsForPage(pageUrl), ...frameOrigins.flatMap((origin) => {
      try { return originsForPage(origin); } catch { return []; }
    })])];
    if (await adapter.permissions.contains({ origins })) return true;
    return adapter.permissions.request({ origins });
  };
  const ensurePageContent = async (tabId: number): Promise<void> => {
    const response = await adapter.tabs.sendMessage?.(tabId, { type: 'captcha:ping' }).catch(() => undefined);
    if (response && typeof response === 'object' && 'ok' in response && response.ok === true) return;
    await adapter.scripting?.executeScript({ target: { tabId, allFrames: true }, files: ['content-scripts/content.js'] });
  };
  const readPageContext = async (inject = false): Promise<'text' | 'slider' | 'none' | undefined> => {
    try {
      const [tab] = await adapter.tabs.query({ active: true, currentWindow: true });
      if (typeof tab?.id !== 'number' || typeof tab.url !== 'string' || !/^https?:/.test(tab.url)) return;
      if (inject) await ensurePageContent(tab.id);
      const context = await adapter.tabs.sendMessage?.(tab.id, { type: 'captcha:page-context' });
      if (context && typeof context === 'object' && 'kind' in context && ['text', 'slider', 'none'].includes(String(context.kind))) {
        const kind = context.kind as 'text' | 'slider' | 'none';
        if (!sliderBusy && sliderDisplayState !== 'running' && !(kind === 'none' && sliderDisplayState === 'success')) view.showContext(kind);
        return kind;
      }
    } catch { return; }
  };
  const ensureSliderContent = async (): Promise<void> => {
    await adapter.runtime.sendMessage({ type: 'captcha:reconcile-access' });
    const [tab] = await adapter.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id === 'number') await ensurePageContent(tab.id);
  };
  view.sliderButton.addEventListener('click', () => {
    void (async () => {
      sliderBusy = true;
      sliderReadGeneration += 1;
      renderSliderState(sliderEnabled, 'running', 'manual');
      try {
        if (!debuggerGranted || !await ensureSliderPageAccess()) {
          renderSliderState(sliderEnabled, 'permission-denied', 'manual');
          return;
        }
        await ensureSliderContent();
        const result = await adapter.runtime.sendMessage({ type: 'captcha:run-slider' });
        const state = typeof result === 'object' && result !== null ? (result as { state?: unknown }).state : undefined;
        renderSliderState(sliderEnabled, SLIDER_RESULT_STATES.includes(state as SliderResultState) ? displayForResult(state as SliderResultState) : 'failed', 'manual');
      } catch {
        renderSliderState(sliderEnabled, 'failed', 'manual');
      } finally {
        sliderBusy = false;
        updateSliderControls();
      }
    })();
  });
  view.sliderCheckbox.addEventListener('change', () => {
    void (async () => {
      const requested = view.sliderCheckbox.checked;
      sliderBusy = true;
      sliderReadGeneration += 1;
      updateSliderControls();
      try {
        if (sliderHostname === undefined || (requested && (!debuggerGranted || !await ensureSliderPageAccess()))) {
          renderSliderState(false, 'permission-denied');
          return;
        }
        const value = await adapter.runtime.sendMessage({ type: 'captcha:set-slider-enabled', enabled: requested, hostname: sliderHostname });
        if (requested) await ensureSliderContent();
        const saved = typeof value === 'object' && value !== null && (value as { enabled?: unknown }).enabled === requested;
        renderSliderState(saved ? requested : !requested, saved ? (requested ? 'idle' : 'off') : 'failed');
      } catch {
        renderSliderState(!requested, 'failed');
      } finally {
        sliderBusy = false;
        updateSliderControls();
      }
    })();
  });
  if (siteModes !== undefined) {
    view.modeSelect.disabled = true;
    void siteModes.read().then((mode) => {
      view.modeSelect.value = mode;
      view.modeSelect.disabled = false;
    }).catch(() => { view.modeSelect.value = 'auto'; view.modeSelect.disabled = false; });
    view.modeSelect.addEventListener('change', () => {
      const mode = view.modeSelect.value as SiteRecognitionMode;
      view.modeSelect.disabled = true;
      void siteModes.write(mode).then(() => {
        view.modeSelect.value = mode;
      }).catch(() => {
        void siteModes.read().then((current) => { view.modeSelect.value = current; }).catch(() => { view.modeSelect.value = 'auto'; });
      }).finally(() => { view.modeSelect.disabled = false; });
    });
  }
  void controller.start().then(() => readPageContext(true));
  void modelController.start();
  const schedulePageRefresh = (): void => {
    globalThis.setTimeout(() => {
      if (!root.isConnected) return;
      if (sliderBusy || textBusy) {
        schedulePageRefresh();
        return;
      }
      void (async () => {
        if (sliderCapability) await readSliderState();
        await readPageContext();
      })().catch(() => undefined).finally(schedulePageRefresh);
    }, 700);
  };
  if (sliderCapability) {
    void readSliderState().then(schedulePageRefresh).catch(() => {
      sliderSupported = false;
      renderSliderState(false, 'failed');
      schedulePageRefresh();
    });
  } else schedulePageRefresh();
}

const root = document.querySelector<HTMLElement>('#app');
if (root !== null && typeof browser !== 'undefined') {
  const settingsStore = createSettingsStore(createExtensionBrowserAdapter(browser));
  void settingsStore.read().then((settings) => {
    const locale = resolveUiLocale(settings.interfaceLocale, browser.i18n.getUILanguage());
    startPopup(root, {
      tabs: {
        query: (queryInfo) => browser.tabs.query(queryInfo),
        sendMessage: (tabId, message) => browser.tabs.sendMessage(tabId, message),
      },
      scripting: {
        executeScript: (details) => (browser.scripting as unknown as { executeScript(value: { target: { tabId: number; allFrames?: boolean }; files: string[] }): Promise<unknown> }).executeScript({ target: details.target, files: [...details.files] }),
        async frameOrigins(tabId) {
          const results = await (browser.scripting as unknown as {
            executeScript(value: { target: { tabId: number }; func: () => string[] }): Promise<readonly { result?: string[] }[]>;
          }).executeScript({
            target: { tabId },
            func: () => [...document.querySelectorAll('iframe')].flatMap((frame) => {
              const rect = frame.getBoundingClientRect();
              if (rect.width < 160 || rect.height < 80 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight) return [];
              const signal = `${frame.src} ${frame.id} ${frame.className} ${frame.title}`;
              if (!/captcha|verify|verification|challenge|security/i.test(signal)) return [];
              try {
                const url = new URL(frame.src, location.href);
                return url.protocol === 'http:' || url.protocol === 'https:' ? [url.origin] : [];
              } catch { return []; }
            }),
          });
          return results.flatMap((entry) => entry.result ?? []);
        },
      },
      runtime: { sendMessage: (message) => sendRuntimeMessage(browser.runtime, message) },
      permissions: browser.permissions,
      settings: { readAccessMode: async () => (await settingsStore.read()).accessMode },
    }, locale, () => browser.runtime.openOptionsPage(), () => window.close(), {
      async read() {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const url = tabs[0]?.url;
        if (typeof url !== 'string') throw new Error('unsupported page');
        return settingsStore.recognitionModeForPage(url);
      },
      async write(mode) {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const url = tabs[0]?.url;
        if (typeof url !== 'string') throw new Error('unsupported page');
        await settingsStore.setSiteRecognitionMode(hostnameForPage(url), mode);
      },
    }, supportsPuzzleSliders(browser.runtime.getManifest()), () => browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') + '?flow=upgrade&manual=1' }));
  });
}
