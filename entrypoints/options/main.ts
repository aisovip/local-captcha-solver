import { createExtensionBrowserAdapter, type ExtensionBrowserStoragePermissions } from '../../src/background/extension-browser';
import type { ModelLog, ModelStatusSnapshot } from '../../src/background/model-status';
import { GLOBAL_HTTP_ORIGINS, originsForPage, originsForSelectedSite } from '../../src/platform/permissions';
import {
  createSettingsStore,
  isRecognitionShortcut,
  normalizeHostname,
  type CaptchaSettings,
  type SiteRecognitionMode,
  type SelectedSiteRule,
  SETTINGS_STORAGE_KEY,
} from '../../src/platform/settings-store';
import { createTranslator, resolveUiLocale, type Translator, type UiLocale } from '../../src/platform/i18n';
import { sendRuntimeMessage } from '../../src/platform/runtime-messaging';
import { supportsPuzzleSliders } from '../../src/platform/extension-capabilities';
import { bindLanguageSwitch, languageSwitchMarkup } from '../../src/ui/language-switch';
import { bindingDiagnosticMessage } from '../../src/platform/binding-diagnostics';

type ViewName = 'static' | 'slider' | 'diagnostics' | 'about';
const MODEL_STATUS_POLL_INTERVAL_MS = 250;
const MODEL_STATUS_POLL_LIMIT = 64;
const MODEL_STATUS_REFRESH_MS = 500;

interface SelectedSiteAccess {
  readonly rule: SelectedSiteRule;
  readonly granted: boolean;
}

export interface OptionsBrowser extends ExtensionBrowserStoragePermissions {
  storage: ExtensionBrowserStoragePermissions['storage'] & {
    onChanged?: {
      addListener(listener: (changes: Record<string, unknown>, areaName: string) => void): void;
    };
  };
  permissions: ExtensionBrowserStoragePermissions['permissions'] & {
    contains(details: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
    remove(details: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
    onAdded?: { addListener(listener: () => void): void };
    onRemoved?: { addListener(listener: () => void): void };
  };
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
    getManifest(): { version: string; permissions?: readonly string[] };
    getURL(path: string): string;
  };
  tabs?: { create(details: { url: string }): Promise<unknown> };
  i18n?: { getUILanguage(): string };
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`Options view is missing ${selector}`);
  return element;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);
}

function diagnosticNumber(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(Math.round(value * 100) / 100);
}

function diagnosticDetails(log: ModelLog): string {
  const common = [
    log.site,
    log.recognizedText,
    log.fillValue,
    log.durationMs === undefined ? undefined : `${Math.round(log.durationMs)} ms`,
  ];
  if (log.kind === 'binding' && log.binding) {
    const binding = log.binding;
    const fields = [
      `attempt=${binding.attemptId}`, `kind=${binding.kind}`, `step=${binding.step}`, `event=${binding.event}`,
      binding.reason && `reason=${binding.reason}`, binding.tag && `tag=${binding.tag}`,
      binding.inputType && `type=${binding.inputType}`, binding.attributes && `attributes=${binding.attributes.join(',') || 'none'}`,
      binding.strategy && `strategy=${binding.strategy}`,
      binding.selectorAttempts === undefined ? undefined : `attempts=${binding.selectorAttempts}`,
      binding.closestMatchCount === undefined ? undefined : `matches=${binding.closestMatchCount}`,
    ];
    return [...common, ...fields].filter((value): value is string => typeof value === 'string' && value !== '').map(escapeHtml).join(' · ');
  }
  if (log.kind !== 'slider') return common.filter((value): value is string => value !== undefined && value !== '').map(escapeHtml).join(' · ');
  const fields: Array<[string, string | undefined]> = [
    ['provider', log.provider],
    ['frameSite', log.frameSite],
    ['frameId', diagnosticNumber(log.frameId)],
    ['trigger', log.trigger],
    ['attempt', log.attemptId],
    ['challenge', log.challengeId],
    ['phase', log.phase],
    ['result', log.sliderState],
    ['imageSource', log.imageSource],
    ['method', log.localizationMethod],
    ['confidence', diagnosticNumber(log.confidence)],
    ['threshold', diagnosticNumber(log.confidenceThreshold)],
    ['score', diagnosticNumber(log.localizationScore)],
    ['alternativeSource', log.alternativeImageSource],
    ['alternativeConfidence', diagnosticNumber(log.alternativeConfidence)],
    ['gapX', diagnosticNumber(log.gapX)],
    ['gapY', diagnosticNumber(log.gapY)],
    ['pieceOffsetX', diagnosticNumber(log.pieceOffsetX)],
    ['pieceOffsetY', diagnosticNumber(log.pieceOffsetY)],
    ['desiredPieceOffsetX', diagnosticNumber(log.desiredPieceOffsetX)],
    ['actualPieceOffsetX', diagnosticNumber(log.actualPieceOffsetX)],
    ['pieceErrorX', diagnosticNumber(log.pieceErrorX)],
    ['correctionX', diagnosticNumber(log.correctionX)],
    ['imageWidth', diagnosticNumber(log.imageWidth)],
    ['imageHeight', diagnosticNumber(log.imageHeight)],
    ['trackWidth', diagnosticNumber(log.trackWidth)],
    ['handleWidth', diagnosticNumber(log.handleWidth)],
    ['scaleX', diagnosticNumber(log.scaleX)],
    ['scaleY', diagnosticNumber(log.scaleY)],
    ['startX', diagnosticNumber(log.startX)],
    ['requestedEndX', diagnosticNumber(log.requestedEndX)],
    ['endX', diagnosticNumber(log.endX)],
    ['releaseX', diagnosticNumber(log.releaseX)],
    ['plannedDragX', diagnosticNumber(log.plannedDragX)],
    ['finalDragX', diagnosticNumber(log.finalDragX)],
    ['observations', log.outcomeSequence],
    ['reason', log.reason],
  ];
  return [...common, ...fields.map(([name, value]) => value === undefined ? undefined : `${name}=${value}`)]
    .filter((value): value is string => value !== undefined && value !== '')
    .map(escapeHtml)
    .join(' · ');
}

function parseHostname(value: string): string {
  const input = value.trim();
  if (input === '') throw new Error('empty hostname');
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withScheme);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported scheme');
  return normalizeHostname(url.hostname);
}

function diagnosticEnvironment() {
  const userAgent = navigator.userAgent;
  const edge = /Edg\/([\d.]+)/.exec(userAgent);
  const chrome = /Chrome\/([\d.]+)/.exec(userAgent);
  const firefox = /Firefox\/([\d.]+)/.exec(userAgent);
  const gecko = /rv:([\d.]+).*Gecko\//.exec(userAgent);
  const browser = edge ? { name: 'Microsoft Edge', version: edge[1] }
    : firefox ? { name: 'Firefox', version: firefox[1] }
      : chrome ? { name: 'Chrome', version: chrome[1] }
        : { name: 'Unknown', version: undefined };
  const engine = firefox
    ? { name: 'Gecko', version: gecko?.[1] ?? firefox[1] }
    : chrome ? { name: 'Blink', version: chrome[1] } : { name: 'Unknown', version: undefined };
  return {
    browser,
    engine,
    platform: navigator.platform,
    language: navigator.language,
    userAgent,
  };
}

function canIncludeSubdomains(hostname: string): boolean {
  return hostname.includes('.') && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) && !hostname.startsWith('[');
}

function uniqueOrigins(rules: readonly SelectedSiteRule[]): string[] {
  return [...new Set(rules.flatMap((rule) => originsForSelectedSite(rule)))];
}

function shell(locale: UiLocale, sliderSupported: boolean, t: Translator): string {
  return `<div class="settings-shell">
    <aside class="settings-sidebar">
      <a class="brand" href="#static" data-nav="static" aria-label="Captcha Helper">
        <img src="/icons/icon-48.png" width="40" height="40" alt="" />
        <span><strong>Captcha Helper</strong><small>${t('productSubtitle')}</small></span>
      </a>
      <nav class="settings-nav" aria-label="Primary">
        <button type="button" data-nav="static"><span class="nav-mark static-mark" aria-hidden="true">Aa</span><span><strong>${t('navAccess')}</strong><small>${t('accessHeading')}</small></span></button>
        ${sliderSupported ? `<button type="button" data-nav="slider"><span class="nav-mark slider-mark" aria-hidden="true"><i></i></span><span><strong>${t('navBehavior')}</strong><small>${t('sliderScopeTitle')}</small></span></button>` : ''}
        <button type="button" data-nav="diagnostics"><span class="nav-mark diagnostic-mark" aria-hidden="true"><i></i></span><span><strong>${t('navDiagnostics')}</strong><small>${t('recentStatus')}</small></span></button>
        <button type="button" data-nav="about"><span class="nav-mark about-mark" aria-hidden="true">i</span><span><strong>${t('navAbout')}</strong><small>Captcha Helper</small></span></button>
      </nav>
      <div class="sidebar-footer"><div class="sidebar-language"><span>${t('languageHeading')}</span>${languageSwitchMarkup(locale, t)}</div><button type="button" class="sidebar-guide" data-open-guide="welcome"><span class="page-icon icon-book" aria-hidden="true"></span><span class="sidebar-guide-copy"><strong>${t('gettingStarted')}</strong><small>${t('gettingStartedBody')}</small></span><span class="page-icon icon-arrow-up-right" aria-hidden="true"></span></button><p><i aria-hidden="true"></i>${t('footerPrivacy')}</p></div>
    </aside>
    <main class="settings-content" id="content">
      <section class="view" data-view="static"></section>
      <section class="view" data-view="slider" hidden></section>
      <section class="view" data-view="diagnostics" hidden></section>
      <section class="view" data-view="about" hidden></section>
    </main>
  </div>`;
}

function pageHeading(eyebrow: string, title: string, body: string): string {
  return `<header class="page-heading" aria-label="${eyebrow}"><h1>${title}</h1><span>${body}</span></header>`;
}

function siteList(sites: readonly SelectedSiteAccess[], t: Translator): string {
  return `<ul class="site-list">${sites.map(({ rule, granted }) => `<li><div><strong>${rule.includeSubdomains ? `*.${rule.hostname}` : rule.hostname}</strong><small data-permission="${granted ? 'granted' : 'missing'}">${granted ? t('sitePermissionGranted') : t('sitePermissionMissing')} · ${rule.includeSubdomains ? t('includesSubdomains') : t('exactHostname')}</small></div><button type="button" class="icon-command" data-remove-site="${rule.hostname}" data-subdomains="${rule.includeSubdomains}" title="${t('remove')}" aria-label="${t('remove')} ${rule.hostname}">×</button></li>`).join('')}</ul>`;
}

function disabledList(hosts: readonly string[], t: Translator, scope: 'site' | 'slider' = 'site'): string {
  if (hosts.length === 0) return `<p class="empty-state">${t('noDisabledSites')}</p>`;
  return `<ul class="site-list">${hosts.map((host) => `<li><strong>${host}</strong><button type="button" class="text-button" data-restore-${scope}="${host}">${t('restore')}</button></li>`).join('')}</ul>`;
}

function accessChoices(scope: 'static' | 'slider', mode: 'all' | 'selected', t: Translator): string {
  const attribute = scope === 'static' ? 'data-mode' : 'data-slider-mode';
  return `<div class="access-choices" role="group" aria-labelledby="${scope}-access-title" ${scope === 'static' ? 'data-access-mode' : 'data-slider-access-mode'}>
    <button type="button" ${attribute}="selected" aria-pressed="${mode === 'selected'}"><span class="choice-indicator" aria-hidden="true"></span><span><strong>${t('selectedSites')}</strong><small>${t('settingsSelectedScope')}</small></span></button>
    <button type="button" ${attribute}="all" aria-pressed="${mode === 'all'}"><span class="choice-indicator" aria-hidden="true"></span><span><strong>${t('allSites')}</strong><small>${t('settingsAllScope')}</small></span></button>
  </div>`;
}

function globalAccessState(scope: 'static' | 'slider', granted: boolean, t: Translator): string {
  return `<div class="access-state" data-granted="${granted}"><p><i class="status-dot" data-granted="${granted}" aria-hidden="true"></i>${granted ? t('settingsAllGranted') : t('settingsAllMissing')}</p>
    ${granted ? (scope === 'static' ? `<button type="button" class="text-button" data-revoke-global>${t('revokeGlobal')}</button>` : '') : `<button type="button" class="primary-button" data-grant-${scope}>${t('grantAll')}</button>`}
  </div>`;
}

function siteDisclosure(id: string, title: string, count: number, body: string, content: string): string {
  return `<details class="settings-disclosure" id="${id}"><summary><span id="${id}-title">${title}</span><span class="count">${count}</span></summary><div class="disclosure-content"><p class="group-description">${body}</p>${content}</div></details>`;
}

function staticMarkup(settings: CaptchaSettings, globalGranted: boolean, selectedAccess: readonly SelectedSiteAccess[], t: Translator): string {
  const selectedGranted = selectedAccess.filter((site) => site.granted).length;
  return `${pageHeading(t('navSettings'), t('welcomeStaticTitle'), t('settingsStaticIntro'))}
    <section class="settings-section" aria-labelledby="static-access-title">
      <h2 id="static-access-title">${t('settingsRunWhere')}</h2>
      <div class="settings-group">
        <div class="access-controls">${accessChoices('static', settings.accessMode, t)}
          ${settings.accessMode === 'all' ? globalAccessState('static', globalGranted, t) : ''}
          <p class="inline-status" data-static-status role="status"></p>
        </div>
        ${settings.accessMode === 'selected' ? `<div class="site-manager">
          <div class="group-heading"><h3>${t('settingsAllowedSites')}</h3>${selectedAccess.length > 0 ? `<span>${t('selectedAccessStatus', { granted: selectedGranted, total: selectedAccess.length })}</span>` : ''}</div>
          <form class="site-form" data-site-form>
            <label><span>${t('addSite')}</span><input id="static-hostname" name="hostname" type="text" inputmode="url" autocomplete="off" placeholder="${t('hostnamePlaceholder')}" /></label>
            <label class="check-row"><input name="subdomains" type="checkbox" /><span>${t('includeSubdomains')}</span></label>
            <button type="submit" class="primary-button">${t('settingsAddAndAllow')}</button>
          </form>
          ${selectedAccess.length === 0 ? `<p class="site-empty">${t('settingsAddFirstSite')}</p>` : siteList(selectedAccess, t)}
        </div>` : selectedAccess.length > 0 ? siteDisclosure('static-saved', t('settingsSavedSites'), selectedAccess.length, t('settingsSavedSitesBody'), siteList(selectedAccess, t)) : ''}
        ${siteDisclosure('static-disabled', t('disabledSites'), settings.disabledHosts.length, t('settingsDisabledStaticBody'), disabledList(settings.disabledHosts, t))}
      </div>
    </section>
    <section class="settings-section" aria-labelledby="static-filling-title">
      <h2 id="static-filling-title">${t('settingsFillingTitle')}</h2>
      <div class="settings-group">
        <div class="setting-list">${switchControl('settings-auto-fill', settings.autoFill, t('autoFill'), t('autoFillBody'))}${switchControl('settings-copy', settings.copyOnNoField, t('copyOnNoField'), t('copyOnNoFieldBody'))}<label class="setting-row select-row" for="settings-shortcut"><span><strong>${t('shortcut')}</strong><small>${t('settingsShortcutBody')}</small></span><select id="settings-shortcut">${shortcutOptions(settings.recognitionShortcut, t)}</select></label></div>
        ${siteDisclosure('static-types', t('settingsSiteTypes'), settings.siteRecognitionModes.length, t('settingsSiteTypesBody'), siteModeOverrides(settings.siteRecognitionModes, t))}
      </div>
    </section>`;
}

function switchControl(id: string, checked: boolean, label: string, body: string): string {
  return `<div class="setting-row"><div><label for="${id}">${label}</label><p>${body}</p></div><label class="switch"><input id="${id}" type="checkbox" ${checked ? 'checked' : ''} /><span aria-hidden="true"></span></label></div>`;
}

function shortcutOptions(value: string, t: Translator): string {
  const options = [['middle', t('shortcutMiddle')], ['ctrl-click', t('shortcutCtrl')], ['alt-click', t('shortcutAlt')], ['shift-click', t('shortcutShift')]];
  return options.map(([key, label]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${label}</option>`).join('');
}

function recognitionModeLabel(mode: SiteRecognitionMode, t: Translator): string {
  return mode === 'auto' ? t('modeAuto')
    : mode === 'digits' ? t('modeDigits')
      : mode === 'letters' ? t('modeLetters')
        : mode === 'alphanumeric' ? t('modeAlphanumeric')
          : t('modeArithmetic');
}

function siteModeOverrides(overrides: CaptchaSettings['siteRecognitionModes'], t: Translator): string {
  if (overrides.length === 0) return `<p class="empty-state">${t('noSiteModeOverrides')}</p>`;
  return `<ul class="site-list">${overrides.map((entry) => `<li><div><strong>${entry.hostname}</strong><small>${recognitionModeLabel(entry.mode, t)}</small></div><button type="button" class="text-button" data-restore-mode="${entry.hostname}">${t('restoreAutomatic')}</button></li>`).join('')}</ul>`;
}

function sliderMarkup(settings: CaptchaSettings, globalGranted: boolean, debuggerGranted: boolean, t: Translator): string {
  const sliderSites = settings.sliderEnabledHosts.length === 0
    ? `<p class="site-empty">${t('settingsAddFirstSite')}</p>`
    : `<ul class="site-list">${settings.sliderEnabledHosts.map((host) => `<li><div><strong>${host}</strong><small>${t('sliderSiteEnabled')}</small></div><button type="button" class="text-button danger" data-remove-slider="${host}">${t('remove')}</button></li>`).join('')}</ul>`;
  return `${pageHeading(t('navSettings'), `${t('welcomeSliderTitle')} <span class="feature-label">Beta</span>`, t('settingsSliderIntro'))}
    <section class="settings-section" aria-labelledby="slider-access-title">
      <h2 id="slider-access-title">${t('settingsRunWhere')}</h2>
      <div class="settings-group">
        <div class="access-controls">${accessChoices('slider', settings.sliderAccessMode, t)}
          <p class="permission-note${debuggerGranted ? '' : ' permission-missing'}"><span class="page-icon icon-shield" aria-hidden="true"></span>${debuggerGranted ? t('settingsSliderPermission') : t('sliderPermissionRequired')}</p>
          ${settings.sliderAccessMode === 'all' ? globalAccessState('slider', globalGranted, t) : ''}
          <p class="inline-status" data-slider-settings-status role="status"></p>
        </div>
        ${settings.sliderAccessMode === 'selected' ? `<div class="site-manager">
          <div class="group-heading"><h3>${t('settingsAllowedSites')}</h3>${settings.sliderEnabledHosts.length > 0 ? `<span class="count">${settings.sliderEnabledHosts.length}</span>` : ''}</div>
          <form class="site-form" data-slider-site-form><label><span>${t('addSite')}</span><input id="slider-hostname" name="hostname" type="text" inputmode="url" autocomplete="off" placeholder="${t('hostnamePlaceholder')}" /></label><button type="submit" class="primary-button">${t('settingsAddAndAllow')}</button></form>
          ${sliderSites}
        </div>` : ''}
        ${siteDisclosure('slider-disabled', t('disabledSites'), settings.sliderDisabledHosts.length, t('settingsDisabledSliderBody'), disabledList(settings.sliderDisabledHosts, t, 'slider'))}
      </div>
    </section>
    <section class="settings-section" aria-labelledby="slider-try-title">
      <h2 id="slider-try-title">${t('settingsSliderTry')}</h2>
      <div class="settings-group settings-help">
        <h3>${t('settingsSliderDemoTitle')}</h3><p>${t('settingsSliderDemoBody')}</p><div class="help-actions"><button type="button" class="secondary-button" data-open-geetest>${t('openGeeTestDemo')}<span class="page-icon icon-arrow-up-right" aria-hidden="true"></span></button><button type="button" class="text-button" data-open-guide="slider"><span class="page-icon icon-book" aria-hidden="true"></span>${t('sliderGuide')}</button></div>
      </div>
    </section>`;
}

function diagnosticsMarkup(snapshot: ModelStatusSnapshot | undefined, t: Translator, locale: UiLocale): string {
  const logs = snapshot?.logs.slice().reverse() ?? [];
  return `${pageHeading(t('navDiagnostics'), t('diagnosticsHeading'), t('diagnosticsBody'))}
    <section class="content-section diagnostics-summary"><div><span class="model-state" data-state="${snapshot?.status ?? 'loading'}"></span><div><strong>${snapshot?.message ?? t('modelLoading')}</strong><progress value="${snapshot?.progress ?? 0}" max="100"></progress></div></div><div class="toolbar"><button type="button" class="secondary-button" data-retry-model>${t('retryModel')}</button><button type="button" class="secondary-button" data-copy-diagnostics>${t('copyDiagnostics')}</button><button type="button" class="text-button danger" data-clear-diagnostics>${t('clearDiagnostics')}</button></div></section>
    <section class="content-section diagnostic-stream">${logs.length === 0 ? `<p class="empty-state">${t('noDiagnostics')}</p>` : `<ol>${logs.map((log) => `<li><time>${new Date(log.at).toLocaleString()}</time><div><strong>${escapeHtml(log.binding ? bindingDiagnosticMessage(log.binding, locale) : log.message)}</strong><p>${diagnosticDetails(log)}</p></div></li>`).join('')}</ol>`}</section>`;
}

function aboutMarkup(version: string, t: Translator, locale: UiLocale): string {
  const words = (cn: string, en: string) => locale === 'zh_CN' ? cn : en;
  return `${pageHeading(t('navAbout'), t('aboutHeading'), t('aboutBody'))}
    <section class="content-section about-section">
      <div class="about-brand"><img src="/brand/captcha-helper.svg" alt="Captcha Helper" /><div><strong>Captcha Helper</strong><span>${t('localBadge')}</span></div></div>
      <dl><div><dt>${t('version')}</dt><dd>${version}</dd></div><div><dt>${t('developer')}</dt><dd>Hongshuo Wang</dd></div></dl>
      <nav class="about-actions" aria-label="${words('版本与支持', 'Releases and support')}">
        <a class="about-resource" href="onboarding.html?flow=history" target="_blank" rel="noopener noreferrer"><span class="resource-icon"><span class="page-icon icon-history" aria-hidden="true"></span></span><span class="resource-copy"><strong>${words('版本记录', 'Release history')}</strong><small>${words('回看每个版本的介绍与更新', 'Explore every release and its changes.')}</small></span><span class="page-icon icon-arrow-up-right" aria-hidden="true"></span></a>
        <a class="about-resource" href="support.html" target="_blank" rel="noopener noreferrer"><span class="resource-icon"><span class="page-icon icon-coffee" aria-hidden="true"></span></span><span class="resource-copy"><strong>${words('请我喝杯咖啡', 'Buy me a coffee')}</strong><small>${words('通过微信或 Ko-fi 支持开发', 'Support the project with WeChat or Ko-fi.')}</small></span><span class="page-icon icon-arrow-up-right" aria-hidden="true"></span></a>
      </nav>
      <nav class="about-project-links" aria-label="${words('项目资料', 'Project information')}">
        <a href="https://github.com/hongshuo-wang/local-captcha-solver" target="_blank" rel="noopener noreferrer"><span class="page-icon icon-github" aria-hidden="true"></span>${t('sourceCode')}</a>
        <a href="https://github.com/hongshuo-wang/local-captcha-solver/blob/main/PRIVACY.md" target="_blank" rel="noopener noreferrer"><span class="page-icon icon-shield" aria-hidden="true"></span>${t('privacy')}</a>
        <a href="https://github.com/hongshuo-wang/local-captcha-solver/blob/main/LICENSE" target="_blank" rel="noopener noreferrer"><span class="page-icon icon-file" aria-hidden="true"></span>${t('license')}</a>
      </nav>
    </section>`;
}

export async function startOptions(
  root: HTMLElement,
  extension: OptionsBrowser,
  navigate: (url: string) => void = (url) => window.location.assign(url),
): Promise<void> {
  const settingsStore = createSettingsStore(createExtensionBrowserAdapter(extension));
  const sliderSupported = supportsPuzzleSliders(extension.runtime.getManifest());
  let settings = await settingsStore.read();
  let locale: UiLocale = resolveUiLocale(settings.interfaceLocale, extension.i18n?.getUILanguage() ?? navigator.language);
  let t = createTranslator(locale);
  let snapshot: ModelStatusSnapshot | undefined;
  let renderGeneration = 0;
  const disclosureState = new Map<string, boolean>();
  let modelRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  const readModelStatus = async (): Promise<ModelStatusSnapshot | undefined> => {
    try { return await extension.runtime.sendMessage({ type: 'captcha:get-model-status' }) as ModelStatusSnapshot; }
    catch { return undefined; }
  };
  snapshot = await readModelStatus();

  const reconcile = async (): Promise<void> => { await extension.runtime.sendMessage({ type: 'captcha:reconcile-access' }); };
  const readGlobal = async (): Promise<boolean> => extension.permissions.contains({ origins: [...GLOBAL_HTTP_ORIGINS] });
  const currentView = (): ViewName => {
    const hash = location.hash.replace('#', '');
    if (sliderSupported && (hash === 'behavior' || hash === 'slider')) return 'slider';
    if (hash === 'diagnostics' || hash === 'about') return hash;
    return 'static';
  };
  const setInlineStatus = (selector: string, message: string, error = false): void => {
    const element = root.querySelector<HTMLElement>(selector);
    if (element === null) return;
    element.textContent = message;
    element.classList.toggle('error', error);
  };

  const show = async (view: ViewName): Promise<void> => {
    const generation = ++renderGeneration;
    if (modelRefreshTimer !== undefined) clearTimeout(modelRefreshTimer);
    settings = await settingsStore.read();
    locale = resolveUiLocale(settings.interfaceLocale, extension.i18n?.getUILanguage() ?? navigator.language);
    t = createTranslator(locale);
    document.documentElement.lang = locale === 'zh_CN' ? 'zh-CN' : 'en';
    if (view === 'diagnostics') snapshot = await readModelStatus() ?? snapshot;
    const globalGranted = await readGlobal().catch(() => false);
    const debuggerGranted = sliderSupported && await extension.permissions.contains({ permissions: ['debugger'] }).catch(() => false);
    const selectedAccess = await Promise.all(settings.selectedSites.map(async (rule): Promise<SelectedSiteAccess> => ({
      rule,
      granted: await extension.permissions.contains({ origins: [...originsForSelectedSite(rule)] }).catch(() => false),
    })));
    if (generation !== renderGeneration) return;
    root.querySelectorAll<HTMLDetailsElement>('.settings-disclosure').forEach((details) => disclosureState.set(details.id, details.open));
    const focused = document.activeElement as HTMLElement | null;
    let focusSelector: string | undefined;
    if (focused && root.contains(focused)) {
      if (focused.id) focusSelector = `#${CSS.escape(focused.id)}`;
      else if (focused.matches('.settings-disclosure > summary')) focusSelector = `#${focused.parentElement!.id} > summary`;
      else {
        const attribute = ['data-language', 'data-mode', 'data-slider-mode'].find((name) => focused.hasAttribute(name));
        if (attribute) focusSelector = `[${attribute}="${focused.getAttribute(attribute)}"]`;
      }
    }
    root.innerHTML = shell(locale, sliderSupported, t);
    required<HTMLElement>(root, '[data-view="static"]').innerHTML = staticMarkup(settings, globalGranted, selectedAccess, t);
    required<HTMLElement>(root, '[data-view="slider"]').innerHTML = sliderSupported ? sliderMarkup(settings, globalGranted, debuggerGranted, t) : '';
    required<HTMLElement>(root, '[data-view="diagnostics"]').innerHTML = diagnosticsMarkup(snapshot, t, locale);
    required<HTMLElement>(root, '[data-view="about"]').innerHTML = aboutMarkup(extension.runtime.getManifest().version, t, locale);
    root.querySelectorAll<HTMLElement>('[data-view]').forEach((element) => { element.hidden = element.dataset.view !== view; });
    root.querySelectorAll<HTMLElement>('[data-nav]').forEach((control) => control.setAttribute('aria-current', control.dataset.nav === view ? 'page' : 'false'));
    wire(view);
    root.querySelectorAll<HTMLDetailsElement>('.settings-disclosure').forEach((details) => { details.open = disclosureState.get(details.id) ?? false; });
    if (focusSelector) {
      const control = root.querySelector<HTMLElement>(focusSelector);
      if (control?.closest('[hidden]') === null) control.focus({ preventScroll: true });
    }
    if (view === 'diagnostics' && snapshot?.status === 'loading') {
      modelRefreshTimer = setTimeout(() => { if (currentView() === 'diagnostics') void show('diagnostics'); }, MODEL_STATUS_REFRESH_MS);
    }
  };

  const selectMode = async (mode: 'all' | 'selected'): Promise<void> => {
    if (mode === 'all') {
      const granted = await extension.permissions.request({ origins: [...GLOBAL_HTTP_ORIGINS] });
      if (!granted) { setInlineStatus('[data-static-status]', t('settingsAllDenied'), true); return; }
      await settingsStore.setAccessMode('all');
    } else {
      await settingsStore.setAccessMode('selected');
      await extension.permissions.remove({ origins: [...GLOBAL_HTTP_ORIGINS] }).catch(() => false);
      const origins = uniqueOrigins((await settingsStore.read()).selectedSites);
      if (origins.length > 0) await extension.permissions.request({ origins });
    }
    await reconcile();
    await show('static');
  };

  const enableSliderSite = async (hostname: string): Promise<void> => {
    const granted = await extension.permissions.request({ origins: [`http://${hostname}/*`, `https://${hostname}/*`] });
    if (!granted) { setInlineStatus('[data-slider-settings-status]', t('permissionRequestFailed'), true); return; }
    await settingsStore.setSliderEnabled(hostname, true);
    await reconcile();
    await show('slider');
  };

  const wire = (view: ViewName): void => {
    root.querySelectorAll<HTMLElement>('[data-nav]').forEach((control) => control.addEventListener('click', (event) => {
      event.preventDefault();
      const next = control.dataset.nav as ViewName;
      location.hash = next;
      void show(next);
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-open-guide]').forEach((button) => button.addEventListener('click', () => {
      const url = extension.runtime.getURL(button.dataset.openGuide === 'slider'
        ? 'onboarding.html?flow=slider'
        : 'onboarding.html?flow=welcome');
      if (extension.tabs) void extension.tabs.create({ url });
      else navigate(url);
    }));
    root.querySelector<HTMLButtonElement>('[data-open-geetest]')?.addEventListener('click', () => {
      const url = 'https://2captcha.com/demo/geetest';
      if (extension.tabs) void extension.tabs.create({ url });
      else navigate(url);
    });
    root.querySelectorAll<HTMLButtonElement>('[data-mode], [data-grant-static]').forEach((button) => button.addEventListener('click', () => { void selectMode((button.dataset.mode ?? 'all') as 'all' | 'selected'); }));
    root.querySelector<HTMLInputElement>('#settings-auto-fill')?.addEventListener('change', (event) => { void settingsStore.setAutoFill((event.currentTarget as HTMLInputElement).checked); });
    root.querySelector<HTMLInputElement>('#settings-copy')?.addEventListener('change', (event) => { void settingsStore.setCopyOnNoField((event.currentTarget as HTMLInputElement).checked); });
    root.querySelector<HTMLSelectElement>('#settings-shortcut')?.addEventListener('change', (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      if (isRecognitionShortcut(value)) void settingsStore.setRecognitionShortcut(value);
    });
    root.querySelectorAll<HTMLButtonElement>('[data-restore-mode]').forEach((button) => button.addEventListener('click', () => {
      void settingsStore.setSiteRecognitionMode(button.dataset.restoreMode!, 'auto').then(() => show(view));
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-remove-slider]').forEach((button) => button.addEventListener('click', () => {
      void settingsStore.setSliderEnabled(button.dataset.removeSlider!, false).then(() => show(view));
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-restore-slider]').forEach((button) => button.addEventListener('click', () => {
      void enableSliderSite(button.dataset.restoreSlider!);
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-slider-mode], [data-grant-slider]').forEach((button) => button.addEventListener('click', () => {
      void (async () => {
        const mode = (button.dataset.sliderMode ?? 'all') as 'all' | 'selected';
        if (mode === 'all') {
          const granted = await extension.permissions.request({ origins: [...GLOBAL_HTTP_ORIGINS] });
          if (!granted) { setInlineStatus('[data-slider-settings-status]', t('settingsAllDenied'), true); return; }
        } else {
          const current = await settingsStore.read();
          if (current.accessMode !== 'all') await extension.permissions.remove({ origins: [...GLOBAL_HTTP_ORIGINS] }).catch(() => false);
        }
        await settingsStore.setSliderAccessMode(mode);
        await reconcile();
        await show('slider');
      })();
    }));
    root.querySelector<HTMLFormElement>('[data-slider-site-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const input = required<HTMLInputElement>(form, 'input[name="hostname"]');
      void (async () => {
        let hostname: string;
        try { hostname = parseHostname(input.value); } catch { setInlineStatus('[data-slider-settings-status]', t('invalidHostname'), true); return; }
        await enableSliderSite(hostname);
      })();
    });
    bindLanguageSwitch(root, async (value) => {
      await settingsStore.setInterfaceLocale(value);
      await show(currentView());
    });
    root.querySelector<HTMLButtonElement>('[data-revoke-global]')?.addEventListener('click', () => { void extension.permissions.remove({ origins: [...GLOBAL_HTTP_ORIGINS] }).then(reconcile).then(() => show('static')); });
    root.querySelector<HTMLFormElement>('[data-site-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const input = required<HTMLInputElement>(form, 'input[name="hostname"]');
      const include = required<HTMLInputElement>(form, 'input[name="subdomains"]');
      void (async () => {
        let hostname: string;
        try { hostname = parseHostname(input.value); } catch { setInlineStatus('[data-static-status]', t('invalidHostname'), true); return; }
        const rule = { hostname, includeSubdomains: include.checked && canIncludeSubdomains(hostname) };
        const granted = await extension.permissions.request({ origins: [...originsForSelectedSite(rule)] });
        if (!granted) { setInlineStatus('[data-static-status]', t('permissionRequestFailed'), true); return; }
        await settingsStore.addSelectedSite(rule);
        await reconcile();
        await show('static');
      })();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-remove-site]').forEach((button) => button.addEventListener('click', () => {
      const rule = { hostname: button.dataset.removeSite!, includeSubdomains: button.dataset.subdomains === 'true' };
      void settingsStore.removeSelectedSite(rule).then(() => extension.permissions.remove({ origins: [...originsForSelectedSite(rule)] })).then(reconcile).then(() => show('static'));
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-restore-site]').forEach((button) => button.addEventListener('click', () => {
      void (async () => {
        const pageUrl = `https://${button.dataset.restoreSite}/`;
        const current = await settingsStore.read();
        if (current.accessMode === 'selected' && !await extension.permissions.request({ origins: [...originsForPage(pageUrl)] })) return;
        await settingsStore.enable(button.dataset.restoreSite!);
        await reconcile();
        await show('static');
      })();
    }));
    root.querySelector<HTMLButtonElement>('[data-retry-model]')?.addEventListener('click', (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      void (async () => {
        button.disabled = true;
        button.textContent = t('retryingModel');
        const state = root.querySelector<HTMLElement>('.model-state');
        const message = root.querySelector<HTMLElement>('.diagnostics-summary strong');
        if (state !== null) state.dataset.state = 'loading';
        if (message !== null) message.textContent = t('modelLoading');
        try {
          snapshot = await extension.runtime.sendMessage({ type: 'captcha:retry-model-warmup' }) as ModelStatusSnapshot;
          for (let attempt = 0; snapshot?.status === 'loading' && attempt < MODEL_STATUS_POLL_LIMIT; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, MODEL_STATUS_POLL_INTERVAL_MS));
            snapshot = await readModelStatus();
          }
          if (snapshot === undefined) {
            snapshot = { status: 'error', progress: 0, message: t('modelStatusUnavailable'), logs: [] };
          }
        } catch {
          snapshot = { status: 'error', progress: 0, message: t('modelStatusUnavailable'), logs: snapshot?.logs ?? [] };
        }
        await show('diagnostics');
      })();
    });
    root.querySelector<HTMLButtonElement>('[data-clear-diagnostics]')?.addEventListener('click', (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      void (async () => {
        button.disabled = true;
        try {
          const response = await extension.runtime.sendMessage({ type: 'captcha:clear-diagnostics' }) as { cleared?: boolean; snapshot?: ModelStatusSnapshot };
          if (response.cleared !== true || response.snapshot === undefined) throw new Error('clear rejected');
          snapshot = response.snapshot;
          await show('diagnostics');
        } catch {
          button.disabled = false;
          button.textContent = t('clearDiagnosticsFailed');
        }
      })();
    });
    root.querySelector<HTMLButtonElement>('[data-copy-diagnostics]')?.addEventListener('click', (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      void (async () => {
        try {
          const latest = await readModelStatus();
          if (!latest) throw new Error('Diagnostic snapshot unavailable');
          snapshot = latest;
          const report = {
            extension: { name: 'Captcha Helper', version: extension.runtime.getManifest().version },
            environment: diagnosticEnvironment(),
            interfaceLocale: locale,
            generatedAt: new Date().toISOString(),
            ...latest,
          };
          await navigator.clipboard.writeText(`\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\``);
          button.textContent = t('copied');
        } catch { button.textContent = t('copyFailed'); }
        finally { button.disabled = false; }
      })();
    });
  };

  window.addEventListener('hashchange', () => { void show(currentView()); });
  window.addEventListener('focus', () => { void show(currentView()); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void show(currentView()); });
  extension.storage.onChanged?.addListener((changes, areaName) => {
    if (areaName === 'local' && Object.hasOwn(changes, SETTINGS_STORAGE_KEY)) void show(currentView());
  });
  extension.permissions.onAdded?.addListener(() => { void show(currentView()); });
  extension.permissions.onRemoved?.addListener(() => { void show(currentView()); });
  await show(currentView());
}

const root = document.querySelector<HTMLElement>('#app');
if (root !== null && typeof browser !== 'undefined') {
  void startOptions(root, {
    storage: browser.storage,
    permissions: browser.permissions,
    tabs: browser.tabs,
    runtime: {
      sendMessage: (message) => sendRuntimeMessage(browser.runtime, message),
      getManifest: () => browser.runtime.getManifest(),
      getURL: (path) => (browser.runtime.getURL as (value: string) => string)(path),
    },
    i18n: browser.i18n,
  });
}
