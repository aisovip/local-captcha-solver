import { describe, expect, it, vi } from 'vitest';

import { startOptions, type OptionsBrowser } from '../../entrypoints/options/main';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../../src/platform/settings-store';
import type { ModelStatusSnapshot } from '../../src/background/model-status';

function harness() {
  const values = new Map<string, unknown>();
  const request = vi.fn(async () => true);
  const remove = vi.fn(async () => true);
  const contains = vi.fn(async (_details: { origins: string[] }) => false);
  let retrying = false;
  const sendMessage = vi.fn(async (message: { type?: string }): Promise<unknown> => {
    if (message.type === 'captcha:retry-model-warmup') {
      retrying = true;
      return { status: 'loading', progress: 50, message: 'loading', logs: [] };
    }
    if (message.type === 'captcha:get-model-status') {
      if (retrying) retrying = false;
      return { status: 'ready', progress: 100, message: 'ready', logs: [] };
    }
    if (message.type === 'captcha:clear-diagnostics') {
      return { cleared: true, snapshot: { status: 'ready', progress: 100, message: 'ready', logs: [] } };
    }
    return { reconciled: true };
  });
  const extension: OptionsBrowser = {
    storage: { local: {
      async get(key) { return { [key]: values.get(key) }; },
      async set(next) { for (const [key, value] of Object.entries(next)) values.set(key, value); },
    } },
    permissions: { request, remove, contains },
    runtime: { sendMessage, getManifest: () => ({ version: '1.0.0', permissions: ['debugger'] }), getURL: (path) => `chrome-extension://test/${path}` },
    i18n: { getUILanguage: () => 'zh-CN' },
  };
  return { extension, values, request, remove, contains, sendMessage };
}

describe('options entrypoint', () => {
  it('switches languages directly, retries a failed save, and preserves the current view and preferences', async () => {
    const app = harness();
    const saved = { ...DEFAULT_SETTINGS, autoFill: false, copyOnNoField: true, onboardingComplete: true, lastSeenUpgradeGuide: '1.3.3' };
    app.values.set(SETTINGS_STORAGE_KEY, saved);
    const save = vi.spyOn(app.extension.storage.local, 'set').mockRejectedValueOnce(new Error('Storage unavailable'));
    await new Promise<void>((resolve) => {
      window.addEventListener('hashchange', () => resolve(), { once: true });
      location.hash = 'about';
    });
    const root = document.createElement('div');
    document.body.append(root);
    await startOptions(root, app.extension);
    expect(root.querySelectorAll('[data-language]')).toHaveLength(2);
    expect(root.querySelector('[data-language="zh_CN"]')?.getAttribute('aria-pressed')).toBe('true');
    const english = root.querySelector<HTMLButtonElement>('[data-language="en"]')!;
    english.focus();
    english.click();
    await vi.waitFor(() => expect(root.querySelector<HTMLElement>('.language-error')?.hidden).toBe(false));
    expect(app.values.get(SETTINGS_STORAGE_KEY)).toEqual(saved);
    expect(root.querySelector('[data-language="zh_CN"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(english.hasAttribute('aria-disabled')).toBe(false);

    english.click();
    await vi.waitFor(() => expect(root.querySelector('[data-language="en"]')?.getAttribute('aria-pressed')).toBe('true'));
    expect(app.values.get(SETTINGS_STORAGE_KEY)).toEqual({ ...saved, interfaceLocale: 'en' });
    expect(root.querySelector<HTMLElement>('[data-view="about"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('.language-error')?.hidden).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('[data-language="en"]'));
    expect(location.hash).toBe('#about');
    expect(app.request).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(2);
    root.remove();
    location.hash = '';
  });

  it('keeps settings focused on static recognition when sliders are unavailable', async () => {
    const app = harness();
    app.extension.runtime.getManifest = () => ({ version: '1.0.0', permissions: [] });
    location.hash = 'slider';
    const root = document.createElement('div');
    document.body.append(root);

    await startOptions(root, app.extension);

    expect(root.querySelector('[data-nav="slider"]')).toBeNull();
    expect((root.querySelector('[data-view="static"]') as HTMLElement).hidden).toBe(false);
    expect((root.querySelector('[data-view="slider"]') as HTMLElement).textContent).toBe('');
    root.remove();
    location.hash = '';
  });

  it('renders the privacy-first selected-site default and can switch access modes', async () => {
    const app = harness();
    const root = document.createElement('div');
    document.body.append(root);
    await startOptions(root, app.extension);
    expect(root.textContent).toContain('静态验证码');
    expect(root.textContent).toContain('在哪些网站运行');
    expect(root.querySelector('[data-mode="selected"]')?.getAttribute('aria-pressed')).toBe('true');
    (root.querySelector('[data-mode="all"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(app.request).toHaveBeenCalledWith({ origins: ['http://*/*', 'https://*/*'] }));
    await vi.waitFor(() => expect(app.values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ accessMode: 'all' }));
    await vi.waitFor(() => expect(root.querySelector('[data-mode="selected"]')).not.toBeNull());
    (root.querySelector('[data-mode="selected"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(app.remove).toHaveBeenCalledWith({ origins: ['http://*/*', 'https://*/*'] }));
    expect(app.values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ accessMode: 'selected' });
    root.remove();
  });

  it.each(['static', 'slider'] as const)('recovers missing all-sites access from %s settings after a denied request', async (view) => {
    const app = harness();
    const saved = { ...DEFAULT_SETTINGS, accessMode: 'all', sliderAccessMode: 'all' };
    app.values.set(SETTINGS_STORAGE_KEY, saved);
    app.request.mockResolvedValueOnce(false);
    await new Promise<void>((resolve) => {
      window.addEventListener('hashchange', () => resolve(), { once: true });
      location.hash = view;
    });
    const root = document.createElement('div');
    document.body.append(root);
    await startOptions(root, app.extension);
    const panel = () => root.querySelector(`[data-view="${view}"]`)!;
    const grant = () => panel().querySelector<HTMLButtonElement>(`[data-grant-${view}]`)!;
    expect(panel().querySelector('.access-state')?.getAttribute('data-granted')).toBe('false');
    expect(app.request).not.toHaveBeenCalled();
    grant().click();
    await vi.waitFor(() => expect(panel().querySelector('.inline-status.error')?.textContent).toBe('未获得所有网站的访问权限，请重试。'));
    expect(app.values.get(SETTINGS_STORAGE_KEY)).toEqual(saved);
    app.contains.mockResolvedValue(true);
    grant().click();
    await vi.waitFor(() => expect(panel().querySelector('.access-state')?.getAttribute('data-granted')).toBe('true'));
    expect(app.request).toHaveBeenCalledTimes(2);
    expect(app.request).toHaveBeenLastCalledWith({ origins: ['http://*/*', 'https://*/*'] });
    expect(grant()).toBeNull();
    root.remove();
    location.hash = '';
  });

  it('adds an exact authorized hostname through a direct permission gesture', async () => {
    const app = harness();
    app.values.set(SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, accessMode: 'selected', onboardingComplete: true });
    location.hash = 'settings';
    const root = document.createElement('div');
    document.body.append(root);
    await startOptions(root, app.extension);
    const form = root.querySelector('[data-site-form]') as HTMLFormElement;
    (form.elements.namedItem('hostname') as HTMLInputElement).value = 'Login.Example.test/path';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(app.request).toHaveBeenCalledWith({ origins: ['http://login.example.test/*', 'https://login.example.test/*'] }));
    await vi.waitFor(() => expect(app.values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ selectedSites: [{ hostname: 'login.example.test', includeSubdomains: false }] }));
    root.remove();
  });

  it('polls a model retry through to its final status', async () => {
    const app = harness();
    location.hash = 'diagnostics';
    const root = document.createElement('div');
    document.body.append(root);
    await startOptions(root, app.extension);

    (root.querySelector('[data-retry-model]') as HTMLButtonElement).click();
    expect((root.querySelector('[data-retry-model]') as HTMLButtonElement).disabled).toBe(true);
    expect(root.textContent).toContain('正在重新加载');
    await vi.waitFor(() => expect(root.querySelector('.model-state')?.getAttribute('data-state')).toBe('ready'), { timeout: 1_500 });
    expect(app.sendMessage).toHaveBeenCalledWith({ type: 'captcha:retry-model-warmup' });
    expect(app.sendMessage).toHaveBeenCalledWith({ type: 'captcha:get-model-status' });

    root.remove();
    location.hash = '';
  });

  it('clears diagnostics from the full-tab options page', async () => {
    const app = harness();
    location.hash = 'diagnostics';
    const root = document.createElement('div');
    document.body.append(root);
    await startOptions(root, app.extension);

    (root.querySelector('[data-clear-diagnostics]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(app.sendMessage).toHaveBeenCalledWith({ type: 'captcha:clear-diagnostics' }));
    await vi.waitFor(() => expect(root.textContent).toContain('暂无诊断记录'));

    root.remove();
    location.hash = '';
  });

  it('shows binding failures and copies the latest records with issue formatting and environment details', async () => {
    const app = harness();
    app.values.set(SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, interfaceLocale: 'en' });
    let latest: ModelStatusSnapshot = {
      status: 'ready', progress: 100, message: 'ready',
      logs: [{ at: 1000, kind: 'binding', outcome: 'failure', message: '未能选中绑定目标', site: 'example.test',
        binding: { attemptId: 'abc123-def456', kind: 'text', step: 'field', event: 'rejected', reason: 'selector-unavailable', tag: 'input', attributes: ['class'], closestMatchCount: 2 } }],
    };
    app.sendMessage.mockImplementation(async () => latest);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    location.hash = 'diagnostics';
    const root = document.createElement('div');
    document.body.append(root);
    try {
      await startOptions(root, app.extension);
      expect(root.querySelector('.diagnostic-stream')!.textContent).toContain('Binding target could not be selected');
      expect(root.querySelector('.diagnostic-stream')!.textContent).toContain('reason=selector-unavailable');
      latest = { ...latest, logs: [...latest.logs, { at: 1100, kind: 'binding', outcome: 'success', message: '手动绑定已保存', binding: { attemptId: 'abc123-def456', kind: 'text', step: 'confirm', event: 'saved' } }] };
      const button = root.querySelector<HTMLButtonElement>('[data-copy-diagnostics]')!;
      button.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
      const report = writeText.mock.calls[0]![0];
      expect(report).toMatch(/^```json\n[\s\S]+\n```$/);
      expect(JSON.parse(report.slice(8, -4))).toEqual({ extensionVersion: '1.0.0', browser: navigator.userAgent, interfaceLocale: 'en', ...latest });
      await vi.waitFor(() => expect(button.textContent).toBe('Copied'));
      writeText.mockRejectedValueOnce(new Error('Clipboard unavailable'));
      button.click();
      await vi.waitFor(() => expect(button.textContent).toBe('Copy failed'));
      expect(button.disabled).toBe(false);
    } finally { writeText.mockRestore(); root.remove(); location.hash = ''; }
  });

  it('shows slider result and drag geometry in local diagnostics', async () => {
    const app = harness();
    app.sendMessage.mockImplementation(async (message: { type?: string }) => message.type === 'captcha:get-model-status'
      ? {
          status: 'ready', progress: 100, message: 'ready', logs: [{
            at: 1000,
            kind: 'slider',
            outcome: 'failure',
            message: '滑块验证未通过',
            site: '2captcha.com',
            trigger: 'automatic',
            sliderState: 'failed',
            provider: 'geetest-v4',
            attemptId: 'a31f950c-4',
            challengeId: 'a31f950c',
            phase: 'outcome',
            imageSource: 'paired-background',
            localizationMethod: 'reference-difference',
            localizationScore: 72.5,
            confidenceThreshold: .68,
            alternativeImageSource: 'viewport',
            alternativeConfidence: .61,
            confidence: .72,
            durationMs: 812,
            gapX: 184.25,
            gapY: 31,
            pieceOffsetX: 7.5,
            desiredPieceOffsetX: 184.25,
            actualPieceOffsetX: 184,
            pieceErrorX: .25,
            correctionX: 1,
            imageWidth: 300,
            imageHeight: 180,
            trackWidth: 300,
            handleWidth: 40,
            scaleX: 2,
            scaleY: 2,
            startX: 20,
            requestedEndX: 196.75,
            endX: 196.75,
            releaseX: 196.75,
            plannedDragX: 176.75,
            finalDragX: 176.75,
            outcomeSequence: 'pending>failure',
          }],
        }
      : { reconciled: true });
    location.hash = 'diagnostics';
    const root = document.createElement('div');
    document.body.append(root);

    await startOptions(root, app.extension);

    expect(root.textContent).toContain('provider=geetest-v4');
    expect(root.textContent).toContain('attempt=a31f950c-4');
    expect(root.textContent).toContain('phase=outcome');
    expect(root.textContent).toContain('imageSource=paired-background');
    expect(root.textContent).toContain('method=reference-difference');
    expect(root.textContent).toContain('threshold=0.68');
    expect(root.textContent).toContain('result=failed');
    expect(root.textContent).toContain('gapX=184.25');
    expect(root.textContent).toContain('pieceErrorX=0.25');
    expect(root.textContent).toContain('correctionX=1');
    expect(root.textContent).toContain('requestedEndX=196.75');
    expect(root.textContent).toContain('releaseX=196.75');
    expect(root.textContent).toContain('plannedDragX=176.75');
    expect(root.textContent).toContain('observations=pending>failure');
    root.remove();
    location.hash = '';
  });

  it('shows effective selected-site permissions instead of the global grant', async () => {
    const app = harness();
    app.values.set(SETTINGS_STORAGE_KEY, {
      ...DEFAULT_SETTINGS,
      accessMode: 'selected',
      selectedSites: [{ hostname: 'portal.example.test', includeSubdomains: false }],
    });
    app.contains.mockImplementation(async (details) => details.origins.includes('https://portal.example.test/*'));
    const root = document.createElement('div');
    document.body.append(root);
    await startOptions(root, app.extension);

    const staticView = root.querySelector('[data-view="static"]') as HTMLElement;
    expect(staticView.textContent).toContain('已授权 1/1 个指定网站');
    expect(staticView.textContent).toContain('已授权 · 仅此主机名');
    expect(staticView.textContent).not.toContain('尚未获得网站访问权限');

    root.remove();
  });

  it('lists site CAPTCHA type overrides and restores automatic detection', async () => {
    const app = harness();
    app.values.set(SETTINGS_STORAGE_KEY, {
      ...DEFAULT_SETTINGS,
      siteRecognitionModes: [{ hostname: 'portal.example.test', mode: 'letters' }],
    });
    location.hash = 'static';
    const root = document.createElement('div');
    document.body.append(root);
    await startOptions(root, app.extension);
    expect(root.textContent).toContain('为网站指定验证码类型');
    expect(root.textContent).toContain('portal.example.test');
    expect(root.textContent).toContain('纯英文');
    const disclosure = root.querySelector<HTMLDetailsElement>('#static-types')!;
    expect(disclosure.open).toBe(false);
    disclosure.open = true;
    (root.querySelector('[data-restore-mode]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(app.values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ siteRecognitionModes: [] }));
    await vi.waitFor(() => expect(root.querySelector('[data-restore-mode]')).toBeNull());
    expect(root.querySelector<HTMLDetailsElement>('#static-types')?.open).toBe(true);
    (root.querySelector<HTMLButtonElement>('[data-language="en"]'))!.click();
    await vi.waitFor(() => expect(root.querySelector('[data-language="en"]')?.getAttribute('aria-pressed')).toBe('true'));
    expect(root.querySelector<HTMLDetailsElement>('#static-types')?.open).toBe(true);
    expect(root.querySelector('#static-types')?.textContent).toContain('Every site uses automatic detection.');
    root.remove();
    location.hash = '';
  });

  it('configures slider handling globally or for selected sites from Slider settings', async () => {
    const app = harness();
    app.values.set(SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, accessMode: 'selected', sliderAccessMode: 'selected' });
    location.hash = 'slider';
    const root = document.createElement('div');
    document.body.append(root);
    await startOptions(root, app.extension);
    expect(root.textContent).toContain('拼图滑块验证码');
    expect(root.querySelector('[data-slider-mode="selected"]')?.getAttribute('aria-pressed')).toBe('true');
    (root.querySelector('[data-slider-mode="all"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(app.request).toHaveBeenCalledWith({ origins: ['http://*/*', 'https://*/*'] }));
    await vi.waitFor(() => expect(app.values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ sliderAccessMode: 'all' }));
    (root.querySelector('[data-slider-mode="selected"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(app.values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ sliderAccessMode: 'selected' }));
    root.remove();
    location.hash = '';
  });

  it.each([true, false])('opens the requested guide while preserving preferences (slider support: %s)', async (sliderSupported) => {
    const app = harness();
    app.extension.runtime.getManifest = () => ({ version: '1.4.0', permissions: sliderSupported ? ['debugger'] : [] });
    const settings = { ...DEFAULT_SETTINGS, autoFill: false, copyOnNoField: true, onboardingComplete: true, lastSeenUpgradeGuide: '1.3.3' };
    app.values.set(SETTINGS_STORAGE_KEY, settings);
    const navigate = vi.fn();
    const createTab = vi.fn(async () => undefined);
    app.extension.tabs = { create: createTab };
    const root = document.createElement('div');
    document.body.append(root);
    await startOptions(root, app.extension, navigate);
    (root.querySelector('[data-open-guide="welcome"]') as HTMLButtonElement).click();
    expect(createTab).toHaveBeenCalledWith({ url: 'chrome-extension://test/onboarding.html?flow=welcome' });
    if (sliderSupported) {
      (root.querySelector('[data-open-guide="slider"]') as HTMLButtonElement).click();
      expect(createTab).toHaveBeenLastCalledWith({ url: 'chrome-extension://test/onboarding.html?flow=slider' });
    } else {
      expect(root.querySelector('[data-open-guide="slider"]')).toBeNull();
    }
    expect(navigate).not.toHaveBeenCalled();
    expect(app.request).not.toHaveBeenCalled();
    expect(app.values.get(SETTINGS_STORAGE_KEY)).toEqual(settings);
    root.remove();
  });

  it.each(['all', 'selected'] as const)('restores a disabled slider site from %s mode settings', async (sliderAccessMode) => {
    const app = harness();
    app.values.set(SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, sliderAccessMode, sliderDisabledHosts: ['login.example.test'] });
    location.hash = 'slider';
    const root = document.createElement('div');
    document.body.append(root);
    await startOptions(root, app.extension);
    expect(root.querySelector('#slider-disabled-title')?.textContent).toBe('已禁用网站');
    (root.querySelector('[data-restore-slider="login.example.test"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(app.values.get(SETTINGS_STORAGE_KEY)).toMatchObject({
      accessMode: 'selected',
      sliderAccessMode,
      sliderDisabledHosts: [],
      sliderEnabledHosts: ['login.example.test'],
    }));
    expect(app.request).toHaveBeenCalledWith({ origins: ['http://login.example.test/*', 'https://login.example.test/*'] });
    await vi.waitFor(() => expect(root.querySelector('[data-restore-slider]')).toBeNull());
    root.remove();
    location.hash = '';
  });
});
