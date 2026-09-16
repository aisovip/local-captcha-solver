import { afterEach, describe, expect, it, vi } from 'vitest';
import { startOnboarding, type OnboardingBrowser } from '../../entrypoints/onboarding/main';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../../src/platform/settings-store';

function harness() {
  const values = new Map<string, unknown>();
  const request = vi.fn(async () => true);
  const contains = vi.fn(async (details: { origins?: string[]; permissions?: string[] }) => details.permissions?.includes('debugger') ?? false);
  const sendMessage = vi.fn(async (message: { type?: string }) => message.type === 'captcha:recognize'
    ? [{ mode: 'arithmetic', text: '20+22', confidence: .97 }]
    : { reconciled: true });
  const create = vi.fn(async () => undefined);
  const extension: OnboardingBrowser = {
    storage: { local: {
      async get(key) { return { [key]: values.get(key) }; },
      async set(next) { for (const [key, value] of Object.entries(next)) values.set(key, value); },
    } },
    permissions: { request, remove: vi.fn(async () => true), contains },
    tabs: { create },
    runtime: { sendMessage, getURL: (path) => `chrome-extension://test/${path}`, getManifest: () => ({ version: '1.4.0', permissions: ['debugger'] }) },
    i18n: { getUILanguage: () => 'zh-CN' },
  };
  const root = document.createElement('div');
  document.body.append(root);
  const close = vi.fn();
  return { extension, values, request, sendMessage, contains, create, root, close };
}
const click = (root: HTMLElement, selector = '[data-primary]') => root.querySelector<HTMLButtonElement>(selector)!.click();
const atPage = (root: HTMLElement, page: string) => vi.waitFor(() => expect(root.querySelector(`[data-page="${page}"]`)).not.toBeNull());
afterEach(() => { document.body.replaceChildren(); window.history.replaceState({}, '', '/onboarding.html'); });

describe('onboarding entrypoint', () => {
  it('keeps setup choices while navigating the scroll journey and saves them once', async () => {
    const app = harness();
    await startOnboarding(app.root, app.extension, app.close);
    expect(app.root.querySelectorAll('.journey-nav li')).toHaveLength(3);
    click(app.root, '[data-start]');
    expect(app.root.dataset.chapter).toBe('setup-access');
    expect(app.root.querySelector<HTMLInputElement>('[data-onboarding-mode="selected"]')?.checked).toBe(true);
    click(app.root, '[data-next]');
    expect(app.root.dataset.chapter).toBe('setup-filling');
    click(app.root, '#onboarding-auto-fill');
    click(app.root, '#onboarding-direct-fill');
    click(app.root, '#onboarding-copy');
    click(app.root, '[data-language="en"]');
    await vi.waitFor(() => expect(app.root.querySelector('[data-primary]')?.textContent).toBe('Finish setup'));
    expect(app.root.dataset.chapter).toBe('setup-filling');
    expect(app.root.querySelector<HTMLInputElement>('#onboarding-auto-fill')?.checked).toBe(false);
    expect(app.root.querySelector<HTMLInputElement>('#onboarding-direct-fill')?.checked).toBe(true);
    expect(app.root.querySelector<HTMLInputElement>('#onboarding-copy')?.checked).toBe(true);
    click(app.root, '#setup-filling [data-back]');
    expect(app.root.dataset.chapter).toBe('setup-access');
    click(app.root, '[data-next]');
    expect(app.values.get(SETTINGS_STORAGE_KEY)).not.toMatchObject({ onboardingComplete: true });
    click(app.root); await atPage(app.root, 'complete');
    expect(app.values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ accessMode: 'selected', autoFill: false, directFill: true, copyOnNoField: true, onboardingComplete: true });
    expect(app.request).not.toHaveBeenCalled();
    expect(app.contains).not.toHaveBeenCalled();
    click(app.root, '[data-show-demo]');
    click(app.root, '[data-run-demo]');
    await vi.waitFor(() => expect(app.root.querySelector('[data-demo-status]')?.textContent).toContain('20+22 = 42'));
    click(app.root); await vi.waitFor(() => expect(app.close).toHaveBeenCalledOnce());
  });

  it('returns from optional slider setup in the same tab and finishes without repeating static setup', async () => {
    const app = harness();
    await startOnboarding(app.root, app.extension, app.close);
    click(app.root, '#onboarding-auto-fill');
    click(app.root); await atPage(app.root, 'complete');
    const staticSettings = app.values.get(SETTINGS_STORAGE_KEY);
    click(app.root, '[data-open-slider]'); await atPage(app.root, 'slider-settings');
    click(app.root, '[data-slider-choice="all"]');
    click(app.root, '[data-back-slider]'); await atPage(app.root, 'complete');
    expect(app.values.get(SETTINGS_STORAGE_KEY)).toEqual(staticSettings);
    expect(app.request).not.toHaveBeenCalled();
    click(app.root, '[data-open-slider]'); await atPage(app.root, 'slider-settings');
    expect(app.root.querySelector<HTMLInputElement>('[data-slider-choice="all"]')?.checked).toBe(true);
    click(app.root); await atPage(app.root, 'complete');
    expect(app.values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ autoFill: false, accessMode: 'selected', sliderAccessMode: 'all', onboardingComplete: true });
    expect(app.request).toHaveBeenCalledOnce();
    expect(app.root.querySelector('[data-page="static-settings"]')).toBeNull();
    expect(app.root.querySelector('[data-finish-setup]')).toBeNull();
    expect(app.root.querySelector('[data-show-demo]')).toBeNull();
    expect(app.root.querySelector('[data-open-geetest]')).not.toBeNull();
    expect(app.create).not.toHaveBeenCalled();
    click(app.root); await vi.waitFor(() => expect(app.close).toHaveBeenCalledOnce());
  });

  it('requests access only on Finish setup and retains choices when permission is denied', async () => {
    const app = harness();
    app.request.mockResolvedValueOnce(false);
    await startOnboarding(app.root, app.extension, app.close);
    click(app.root, '[data-start]');
    click(app.root, '[data-onboarding-mode="all"]');
    click(app.root, '[data-next]');
    expect(app.request).not.toHaveBeenCalled();
    expect(app.values.size).toBe(0);
    click(app.root);
    expect(app.request).toHaveBeenCalledWith({ origins: ['http://*/*', 'https://*/*'] });
    await vi.waitFor(() => expect(app.root.querySelector('[data-guide-error]')?.textContent).not.toBe(''));
    expect(app.root.querySelector<HTMLInputElement>('[data-onboarding-mode="all"]')?.checked).toBe(true);
    expect(app.values.size).toBe(0);
    click(app.root); await atPage(app.root, 'complete');
    expect(app.values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ accessMode: 'all', onboardingComplete: true });
  });

  it('offers Firefox practice after setup with its supported capabilities', async () => {
    const app = harness();
    app.extension.runtime.getManifest = () => ({ version: '1.4.0', permissions: [] });
    await startOnboarding(app.root, app.extension, app.close);
    click(app.root); await atPage(app.root, 'complete');
    expect(app.root.querySelector('[data-show-demo]')).not.toBeNull();
    expect(app.root.querySelector('[data-open-slider]')).toBeNull();
    expect(app.contains).not.toHaveBeenCalled();
  });

  it('shows the installed release once and supports reopening it from the popup', async () => {
    const app = harness();
    app.values.set(SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, autoFill: false, accessMode: 'all', onboardingComplete: true });
    window.history.replaceState({}, '', '/onboarding.html?flow=upgrade&version=1.4.0');
    await startOnboarding(app.root, app.extension, app.close);
    expect(app.root.querySelector('.release-version')?.textContent).toContain('1.4.0');
    expect(app.root.querySelector('input')).toBeNull();
    expect(app.root.querySelector('picture img')?.getAttribute('src')).toBe('/guide/binding-zh.png');
    click(app.root); await vi.waitFor(() => expect(app.close).toHaveBeenCalledOnce());
    expect(app.values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ lastSeenUpgradeGuide: '1.4.0', autoFill: false, accessMode: 'all', onboardingComplete: true });
    window.history.replaceState({}, '', '/onboarding.html?flow=upgrade&version=1.4.0');
    await startOnboarding(app.root, app.extension, app.close);
    expect(app.close).toHaveBeenCalledTimes(2);
    window.history.replaceState({}, '', '/onboarding.html?flow=upgrade&manual=1');
    await startOnboarding(app.root, app.extension, app.close);
    expect(app.close).toHaveBeenCalledTimes(2);
    expect(app.request).not.toHaveBeenCalled();
  });

  it('offers the direct-fill switch on the installed introduction and saves it immediately', async () => {
    const app = harness();
    app.extension.runtime.getManifest = () => ({ version: '1.4.1', permissions: ['debugger'] });
    app.values.set(SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, autoFill: false, accessMode: 'all', onboardingComplete: true });
    window.history.replaceState({}, '', '/onboarding.html?flow=upgrade&version=1.4.1');
    await startOnboarding(app.root, app.extension, app.close);
    const toggle = app.root.querySelector<HTMLInputElement>('#release-direct-fill')!;
    expect(toggle.checked).toBe(false);
    expect(app.root.querySelector('.release-setting')?.textContent).toContain('设置 → 静态验证码 → 填写');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(app.values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ directFill: true }));
    click(app.root); await vi.waitFor(() => expect(app.close).toHaveBeenCalledOnce());
    expect(app.values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ lastSeenUpgradeGuide: '1.4.1', directFill: true, autoFill: false });
    expect(app.request).not.toHaveBeenCalled();
  });

  it('opens a historical introduction with its own notes and preserves the current release reminder', async () => {
    const app = harness();
    const saved = { ...DEFAULT_SETTINGS, lastSeenUpgradeGuide: '1.3.3', autoFill: false, onboardingComplete: true };
    app.values.set(SETTINGS_STORAGE_KEY, saved);
    window.history.replaceState({}, '', '/onboarding.html?flow=upgrade&version=1.2.0&manual=1');
    await startOnboarding(app.root, app.extension, app.close);
    expect(document.title).toContain('1.2.0');
    expect(app.root.querySelector('.release-version')?.textContent).toContain('1.2.0');
    expect(app.root.querySelector('h1')?.textContent).toContain('让拼图滑块');
    expect(app.root.querySelector('.release-notes')?.textContent).toContain('GeeTest 演示页');
    expect(app.root.querySelector('picture')).toBeNull();
    expect(app.root.querySelector('[data-release-history]')?.getAttribute('href')).toBe('onboarding.html?flow=history');
    expect(app.values.get(SETTINGS_STORAGE_KEY)).toEqual(saved);
    app.root.querySelector<HTMLDetailsElement>('#release-notes')!.open = false;
    const language = app.root.querySelector<HTMLButtonElement>('[data-language="en"]')!;
    language.focus();
    language.click();
    await vi.waitFor(() => expect(app.root.querySelector('h1')?.textContent).toBe('A little help with puzzle sliders.'));
    expect(document.activeElement).toBe(app.root.querySelector('[data-language="en"]'));
    expect(app.root.querySelector<HTMLDetailsElement>('#release-notes')!.open).toBe(false);
    expect(app.values.get(SETTINGS_STORAGE_KEY)).toEqual({ ...saved, interfaceLocale: 'en' });
    expect(app.request).not.toHaveBeenCalled();
    expect(app.sendMessage).not.toHaveBeenCalled();
  });

  it('lists every local release and marks the installed version', async () => {
    const app = harness();
    window.history.replaceState({}, '', '/onboarding.html?flow=history');
    await startOnboarding(app.root, app.extension, app.close);
    expect(app.root.querySelectorAll('[data-release]')).toHaveLength(9);
    expect(app.root.querySelector('[data-current]')?.getAttribute('data-release')).toBe('1.4.0');
    expect(app.root.querySelector('[data-release="1.0.0"]')?.getAttribute('href')).toBe('onboarding.html?flow=upgrade&version=1.0.0&manual=1');
    expect(app.values.size).toBe(0);
    expect(app.close).not.toHaveBeenCalled();
  });

  it('shows the archive when an unknown version is requested without changing the update reminder', async () => {
    const app = harness();
    window.history.replaceState({}, '', '/onboarding.html?flow=upgrade&version=%3Csvg%20onload%3Dalert(1)%3E');
    await startOnboarding(app.root, app.extension, app.close);
    expect(app.root.querySelector('[data-page="history"]')).not.toBeNull();
    expect(app.root.querySelector('.history-notice')?.textContent).toContain('尚未收录');
    expect(app.root.querySelector('svg')).toBeNull();
    expect(app.values.size).toBe(0);
  });

  it('configures slider access independently and preserves filling preferences', async () => {
    const app = harness();
    app.values.set(SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, autoFill: false, onboardingComplete: true });
    window.history.replaceState({}, '', '/onboarding.html?flow=slider');
    await startOnboarding(app.root, app.extension, app.close);
    expect(app.request).not.toHaveBeenCalled();
    expect(app.root.querySelector('[data-back-slider]')).not.toBeNull();
    click(app.root); await atPage(app.root, 'complete');
    expect(app.request).toHaveBeenCalledWith({ origins: ['http://2captcha.com/*', 'https://2captcha.com/*'] });
    expect(app.values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ sliderAccessMode: 'selected', sliderEnabledHosts: ['2captcha.com'], autoFill: false, onboardingComplete: true });
  });
});
