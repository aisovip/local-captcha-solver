import { expect, test, chromium, type BrowserContext, type Page, type Route, type Worker } from '@playwright/test';
import { execFile } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { startFixtureServer, type FixtureServer } from './fixtures/server';
import { DEFAULT_SETTINGS } from '../../src/platform/settings-store';
import { MODEL_LOGS_STORAGE_KEY, type ModelStatusSnapshot } from '../../src/background/model-status';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '../..');
const e2eTarget = process.env.CAPTCHA_E2E_TARGET === 'edge' ? 'edge' : 'chrome';
const extensionPath = join(
  repositoryRoot,
  `.output/${e2eTarget}-mv3`,
);

interface ExtensionApi {
  runtime: {
    getManifest(): { options_ui?: { open_in_tab?: boolean } };
    sendMessage(message: unknown, callback?: (response: unknown) => void): Promise<unknown>;
  };
  storage: {
    local: { set(values: Record<string, unknown>): Promise<void>; get(key: string): Promise<Record<string, unknown>> };
  };
  scripting: { getRegisteredContentScripts(): Promise<readonly { id: string }[]> };
  permissions: { contains(details: { permissions: string[] }): Promise<boolean> };
  tabs: {
    query(query: { url?: string[]; active?: boolean; currentWindow?: boolean }): Promise<readonly { id?: number; url?: string }[]>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
    update(tabId: number, properties: { active: boolean }): Promise<unknown>;
  };
}

let server: FixtureServer;
let context: BrowserContext;
let extensionPage: Page;
let extensionOrigin: string;
let profileDirectory: string | undefined;
const extensionNetworkRequests: string[] = [];

async function currentWorker(): Promise<Worker> {
  await extensionPage.evaluate(async () => {
    const api = (globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi }).browser ?? (globalThis as { chrome?: ExtensionApi }).chrome;
    if (api === undefined) throw new Error('Extension API unavailable');
    await api.runtime.sendMessage({ type: 'captcha:get-model-status' });
  });
  return context.serviceWorkers().at(-1) ?? await context.waitForEvent('serviceworker');
}

async function extensionMessage(message: unknown): Promise<unknown> {
  return extensionPage.evaluate((payload) => new Promise((resolveResponse) => {
    (globalThis as { chrome?: ExtensionApi }).chrome!.runtime.sendMessage(payload, resolveResponse);
  }), message);
}

async function contentMessage(page: Page, request: unknown): Promise<unknown> {
  return (await currentWorker()).evaluate(async ({ payload, pageUrl }) => {
    const api = (globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi }).browser ?? (globalThis as { chrome?: ExtensionApi }).chrome;
    if (api === undefined) throw new Error('Extension API unavailable');
    const tab = (await api.tabs.query({})).find((candidate) => candidate.url === pageUrl);
    if (tab?.id === undefined) throw new Error(`No fixture tab for ${pageUrl}`);
    return api.tabs.sendMessage(tab.id, payload);
  }, { payload: request, pageUrl: page.url() });
}

async function waitForContent(page: Page): Promise<void> {
  await page.bringToFront();
  await expect.poll(async () => {
    try { return await contentMessage(page, { type: 'captcha:ping' }); } catch (error) {
      if (error instanceof Error && error.message.includes('Receiving end does not exist')) return undefined;
      throw error;
    }
  }).toEqual({ ok: true });
}

async function open(path: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${server.origin}${path}`);
  return page;
}

async function submitCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as typeof window & { __submitCount: number }).__submitCount);
}

async function fulfillFixtureRequest(route: Route): Promise<void> {
  const requestUrl = new URL(route.request().url());
  const response = await fetch(`${server.serverOrigin}${requestUrl.pathname}${requestUrl.search}`);
  await route.fulfill({
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: Buffer.from(await response.arrayBuffer()),
  });
}

async function openActionPopup(activePage: Page): Promise<Page> {
  await activePage.bringToFront();
  const activeTabId = await (await currentWorker()).evaluate(async () => {
    const api = (globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi }).browser ?? (globalThis as { chrome?: ExtensionApi }).chrome;
    if (api === undefined) throw new Error('Extension API unavailable');
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error('No active browser tab');
    return tab.id;
  });
  const popup = await context.newPage();
  await popup.goto(`${extensionOrigin}/popup.html`);
  await (await currentWorker()).evaluate(async ({ tabId }) => {
    const api = (globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi }).browser ?? (globalThis as { chrome?: ExtensionApi }).chrome;
    if (api === undefined) throw new Error('Extension API unavailable');
    await api.tabs.update(tabId, { active: true });
  }, { tabId: activeTabId });
  await popup.reload();
  return popup;
}

async function openOptionsPage(): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${extensionOrigin}/options.html`);
  return page;
}

async function openOnboardingPage(): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${extensionOrigin}/onboarding.html`);
  return page;
}

async function configureBindingTest(sliderEnabled: boolean): Promise<void> {
  await (await currentWorker()).evaluate(async (settings) => {
    const api = (globalThis as { chrome?: ExtensionApi }).chrome!;
    await api.storage.local.set({ 'captcha-settings': settings });
  }, { ...DEFAULT_SETTINGS, accessMode: 'all', sliderAccessMode: sliderEnabled ? 'all' : 'selected', onboardingComplete: true });
  await expect.poll(async () => (await currentWorker()).evaluate(async () => (await (globalThis as { chrome?: ExtensionApi }).chrome!.scripting.getRegisteredContentScripts()).map((script) => script.id))).toContain('captcha-auto-global');
}

test.beforeAll(async () => {
  const buildScript = e2eTarget === 'edge' ? 'build:edge' : 'build';
  await execFileAsync('npm', ['run', buildScript], {
    cwd: repositoryRoot,
    env: { ...process.env, CAPTCHA_E2E_PREGRANT: '1' },
  });
  profileDirectory = await mkdtemp(join(tmpdir(), 'local-captcha-solver-e2e-'));
  let executablePath: string | undefined;
  if (e2eTarget === 'edge') {
    executablePath = process.env.CAPTCHA_EDGE_EXECUTABLE
      ?? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
    await access(executablePath);
  }
  try {
    context = await chromium.launchPersistentContext(profileDirectory, {
      headless: true,
      channel: 'chromium',
      ...(executablePath === undefined ? {} : { executablePath }),
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
  } catch (error) {
    throw new Error(`Playwright Chromium is required for extension E2E tests. Run: npx playwright install chromium. Original error: ${error instanceof Error ? error.message : String(error)}`);
  }
  server = await startFixtureServer();
  await context.route(`${server.origin}/**`, fulfillFixtureRequest);
  const initialWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  extensionOrigin = `chrome-extension://${new URL(initialWorker.url()).host}`;
  extensionPage = await context.newPage();
  await extensionPage.goto(`${extensionOrigin}/options.html`);
  context.on('request', (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith(server.origin)) extensionNetworkRequests.push(url);
  });
});

test.afterAll(async () => {
  await context?.close();
  await server?.close();
  if (profileDirectory !== undefined) await rm(profileDirectory, { recursive: true, force: true });
});

test('registers globally and automatically fills after all-site access is explicitly selected', async () => {
  await (await currentWorker()).evaluate(async () => {
    const api = (globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi }).browser ?? (globalThis as { chrome?: ExtensionApi }).chrome;
    if (api === undefined) throw new Error('Extension API unavailable');
    await api.storage.local.set({
      'captcha-settings': {
        version: 4,
        accessMode: 'all',
        disabledHosts: [],
        selectedSites: [],
        siteRecognitionModes: [],
        copyOnNoField: false,
        autoFill: true,
        recognitionShortcut: 'middle',
        interfaceLocale: 'system',
        onboardingComplete: false,
      },
    });
  });
  await expect.poll(async () => (await currentWorker()).evaluate(async () => {
    const api = (globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi }).browser ?? (globalThis as { chrome?: ExtensionApi }).chrome;
    if (api === undefined) throw new Error('Extension API unavailable');
    return (await api.scripting.getRegisteredContentScripts()).map((script) => script.id);
  }), { timeout: 15_000 }).toContain('captcha-auto-global');
  const page = await open('/automatic.html');
  await expect(page.locator('#captcha-answer')).toHaveValue('14975', { timeout: 30_000 });
  await page.close();
});

test('fills known local digit CAPTCHAs without submitting or overwriting user input', async () => {
  const automatic = await open('/automatic.html');
  await expect(automatic.locator('#captcha-answer')).toHaveValue('14975', { timeout: 30_000 });
  await expect(automatic.locator('#captcha-answer')).toHaveAttribute('data-controlled-value', '14975');
  expect(await submitCount(automatic)).toBe(0);

  const dynamic = await open('/dynamic.html');
  await expect(dynamic.locator('#captcha-answer')).toHaveValue('14975', { timeout: 30_000 });
  await dynamic.locator('#refresh').click();
  await expect(dynamic.locator('#captcha-answer')).toHaveValue('14975');
  const replace = dynamic.locator('[data-local-captcha-status]').locator('button.action', { hasText: /替换|Replace/ });
  await expect(replace).toBeVisible({ timeout: 30_000 });
  await replace.click();
  await expect(dynamic.locator('#captcha-answer')).toHaveValue('99067', { timeout: 30_000 });
  expect(await submitCount(dynamic)).toBe(0);

  const prefilled = await open('/automatic.html?prefilled=1');
  await expect(prefilled.locator('#captcha-answer')).toHaveValue('already-entered');
  await expect.poll(() => submitCount(prefilled)).toBe(0);

  const ambiguous = await open('/ambiguous.html');
  await waitForContent(ambiguous);
  await ambiguous.locator('#focused-answer').focus();
  await expect(contentMessage(ambiguous, { type: 'captcha:context-image', srcUrl: `${server.origin}/fixtures/digits-002.png` })).resolves.toMatchObject({ state: 'filled' });
  await expect(ambiguous.locator('#first-answer')).toHaveValue('already-entered');
  await expect(ambiguous.locator('#focused-answer')).toHaveValue('14975');
  expect(await submitCount(ambiguous)).toBe(0);

  await automatic.close();
  await dynamic.close();
  await prefilled.close();
  await ambiguous.close();
});

test('recognizes already-loaded CAPTCHA data offline and keeps popup unsupported state disabled', async ({}, testInfo) => {
  const page = await open('/automatic.html');
  await waitForContent(page);
  await expect(page.locator('#captcha-answer')).toHaveValue('14975', { timeout: 30_000 });
  await page.evaluate(() => { (document.querySelector('#captcha-answer') as HTMLInputElement).value = ''; });
  await context.setOffline(true);
  await expect(contentMessage(page, { type: 'captcha:context-image', srcUrl: `${server.origin}/fixtures/digits-002.png` })).resolves.toMatchObject({ state: 'filled' });
  await expect(page.locator('#captcha-answer')).toHaveValue('14975', { timeout: 30_000 });
  expect(await submitCount(page)).toBe(0);
  await context.setOffline(false);

  const unsupported = await context.newPage();
  await unsupported.goto('chrome://version/');
  await unsupported.bringToFront();
  const popup = await openActionPopup(unsupported);
  await expect(popup.locator('#site-enabled')).toBeDisabled();
  await popup.locator('[data-page-options] > summary').click();
  await expect(popup.locator('[data-popup-status]')).toHaveText(/当前页面不支持自动识别。|This page is not supported\./);
  await expect(popup.locator('.brand-mark')).toHaveJSProperty('complete', true);
  await expect(popup.locator('h1')).toHaveText('Captcha Helper');
  expect(await popup.locator('#app').evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }))).toEqual({ clientWidth: 384, scrollWidth: 384 });
  await popup.locator('#app').screenshot({ path: testInfo.outputPath('captcha-helper-popup.png') });
  await page.close();
  await popup.close();
  await unsupported.close();

  expect(extensionNetworkRequests).toEqual([]);
  expect(server.requests.every((path) => path === '/automatic.html' || path === '/dynamic.html' || path === '/ambiguous.html' || path === '/fixtures/digits-002.png' || path === '/fixtures/digits-017.png')).toBe(true);
});

test('renders standalone onboarding and settings without horizontal overflow', async ({}, testInfo) => {
  expect(await (await currentWorker()).evaluate(() => {
    const api = (globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi }).browser ?? (globalThis as { chrome?: ExtensionApi }).chrome;
    return api?.runtime.getManifest().options_ui?.open_in_tab;
  })).toBe(true);
  const onboarding = await openOnboardingPage();
  await expect(onboarding).toHaveURL(/onboarding\.html/);
  await expect(onboarding.locator('.intro-content h1')).toHaveText(/验证码，在本机处理。|Your CAPTCHA. Handled locally./);
  await expect(onboarding.locator('[data-start]')).toBeVisible();
  expect(await onboarding.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await onboarding.screenshot({ path: testInfo.outputPath('captcha-helper-onboarding-access.png'), fullPage: true });

  await onboarding.setViewportSize({ width: 390, height: 844 });
  expect(await onboarding.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await onboarding.screenshot({ path: testInfo.outputPath('captcha-helper-onboarding-access-mobile.png'), fullPage: true });
  await onboarding.setViewportSize({ width: 1024, height: 720 });
  await expect(onboarding.locator('[data-start]')).toBeInViewport();
  expect(await onboarding.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(720);
  await onboarding.setViewportSize({ width: 1280, height: 720 });

  await onboarding.locator('[data-language="zh_CN"]').click();
  await expect(onboarding.locator('.intro-content h1')).toHaveText('验证码，在本机处理。');

  await onboarding.locator('[data-start]').click();
  await expect(onboarding.locator('[data-page="static-settings"]')).toBeInViewport();
  await onboarding.locator('[data-onboarding-mode="selected"]').click();
  await expect(onboarding.locator('[data-primary]')).toBeEnabled();
  await onboarding.locator('[data-next]').click();
  await expect(onboarding.locator('[data-page="preferences"]')).toBeInViewport();
  await onboarding.locator('[data-primary]').click();
  await expect(onboarding.locator('[data-page="complete"]')).toBeVisible();
  await expect(onboarding.locator('[data-open-slider]')).toBeVisible();
  await onboarding.locator('[data-show-demo]').click();
  await expect(onboarding.locator('[data-demo-canvas]')).toBeVisible();
  expect(await onboarding.locator('[data-demo-canvas]').evaluate((canvas) => {
    const context2d = (canvas as HTMLCanvasElement).getContext('2d');
    if (context2d === null) return 0;
    const pixels = context2d.getImageData(0, 0, 240, 80).data;
    let nonBackgroundPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 230 || pixels[index + 1] < 230 || pixels[index + 2] < 210) nonBackgroundPixels += 1;
    }
    return nonBackgroundPixels;
  })).toBeGreaterThan(100);
  await onboarding.locator('[data-run-demo]').click();
  await expect(onboarding.locator('[data-demo-status]')).toContainText('= 42', { timeout: 30_000 });
  await expect(onboarding.locator('[data-demo-status]')).toContainText('识别结果：');
  await onboarding.screenshot({ path: testInfo.outputPath('captcha-helper-onboarding-complete-zh.png'), fullPage: true });
  await onboarding.locator('[data-language="en"]').click();
  await expect(onboarding.locator('[data-primary]')).toHaveText('Start using');
  const pagesBeforeSliders = context.pages().length;
  await onboarding.locator('[data-open-slider]').click();
  await expect(onboarding.locator('[data-page="slider-settings"]')).toBeInViewport();
  await onboarding.locator('[data-back-slider]').click();
  await expect(onboarding.locator('[data-page="complete"]')).toBeVisible();
  await onboarding.locator('[data-open-slider]').click();
  await onboarding.locator('[data-enable-slider]').click();
  await expect(onboarding.locator('[data-open-geetest]')).toBeVisible();
  await expect(onboarding.locator('[data-finish-setup]')).toHaveCount(0);
  await expect(onboarding.locator('[data-page="static-settings"]')).toHaveCount(0);
  expect(context.pages().length).toBe(pagesBeforeSliders);
  const onboardingClosed = onboarding.waitForEvent('close');
  await onboarding.locator('[data-primary]').click();
  await onboardingClosed;

  const options = await openOptionsPage();
  await expect(options.locator('[data-view="static"]')).toBeVisible();
  await expect(options.locator('[data-access-mode]')).toBeVisible();
  expect(await options.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await options.screenshot({ path: testInfo.outputPath('captcha-helper-options-static.png'), fullPage: true });

  const openingWelcome = context.waitForEvent('page');
  await options.locator('[data-open-guide="welcome"]').click();
  const welcomeGuide = await openingWelcome;
  await expect(welcomeGuide).toHaveURL(/onboarding\.html\?flow=welcome/);
  await expect(welcomeGuide.locator('.journey-nav li')).toHaveCount(3);
  await expect(options).toHaveURL(/options\.html/);
  await welcomeGuide.close();

  await options.locator('[data-nav="slider"]').click();
  await expect(options.locator('[data-view="slider"]')).toBeVisible();
  await expect(options.locator('.language-switch')).toBeVisible();

  const openingSlider = context.waitForEvent('page');
  await options.locator('[data-open-guide="slider"]').click();
  const sliderGuide = await openingSlider;
  await expect(sliderGuide).toHaveURL(/onboarding\.html\?flow=slider/);
  await expect(sliderGuide.locator('[data-page="slider-settings"]')).toBeVisible();
  await expect(options).toHaveURL(/options\.html/);
  await sliderGuide.close();

  await options.locator('[data-nav="diagnostics"]').click();
  await expect(options.locator('[data-view="diagnostics"]')).toBeVisible();
  await options.locator('[data-retry-model]').click();
  await expect(options.locator('.model-state')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(options.locator('[data-retry-model]')).toBeEnabled();
  await options.screenshot({ path: testInfo.outputPath('captcha-helper-options-diagnostics.png'), fullPage: true });

  await options.locator('[data-clear-diagnostics]').click();
  await expect(options.locator('.diagnostic-stream')).toContainText(/暂无诊断记录。|No diagnostic records./);
  const statusPopup = await openActionPopup(options);
  await expect(statusPopup.locator('[data-model-indicator]')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(statusPopup.locator('[data-latest-activity]')).toBeHidden();
  await statusPopup.close();

  const manualPage = await open('/automatic.html');
  const manualPopup = await openActionPopup(manualPage);
  await expect.poll(() => manualPopup.evaluate(() => ({
    hostname: document.querySelector<HTMLElement>('[data-popup-hostname]')?.textContent,
    accessHidden: (document.querySelector<HTMLElement>('[data-access-panel]'))?.hidden,
    recognizeDisabled: document.querySelector<HTMLButtonElement>('[data-recognize-page]')?.disabled,
  }))).toEqual({
    hostname: 'captcha.e2e.test',
    accessHidden: true,
    recognizeDisabled: false,
  });
  await manualPopup.screenshot({ path: testInfo.outputPath('captcha-helper-popup-manual.png'), fullPage: true });
  await manualPopup.locator('[data-recognize-page]').click();
  await expect(manualPage.locator('#captcha-answer')).toHaveValue('14975', { timeout: 30_000 });
  expect(await submitCount(manualPage)).toBe(0);
  if (!manualPopup.isClosed()) await manualPopup.close();
  await manualPage.close();

  await options.bringToFront();
  await options.locator('.settings-nav [data-nav="static"]').click();
  await expect(options.locator('[data-mode="selected"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(options.locator('[data-view="static"] .site-empty')).toBeVisible();

  await options.locator('[data-nav="slider"]').click();
  await expect(options.locator('[data-view="slider"]')).toBeVisible();

  await options.setViewportSize({ width: 390, height: 844 });
  expect(await options.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await options.screenshot({ path: testInfo.outputPath('captcha-helper-options-slider-mobile.png'), fullPage: true });
  await options.close();
});

test('automatically handles a supported slider after the site is explicitly enabled', async ({}, testInfo) => {
  const page = await open('/slider.html');
  const popup = await openActionPopup(page);
  await popup.locator('[data-page-options] > summary').click();
  await expect(popup.locator('[data-slider-panel]')).toBeVisible();
  await expect(popup.locator('[data-slider-enabled]')).toBeEnabled();
  await expect(popup.locator('[data-run-slider]')).toBeEnabled();
  await expect(popup.locator('[data-slider-state-title]')).toHaveText(/发现拼图滑块|Puzzle slider found/);
  await popup.locator('[data-slider-enabled]').click();
  await expect(popup.locator('[data-slider-enabled]')).toBeChecked();
  await expect.poll(async () => (await currentWorker()).evaluate(async () => {
    const api = (globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi }).browser ?? (globalThis as { chrome?: ExtensionApi }).chrome;
    return api?.permissions.contains({ permissions: ['debugger'] });
  })).toBe(true);
  await expect(page.locator('#status')).toHaveText('验证成功', { timeout: 15_000 });
  await expect(page.locator('[data-local-captcha-status]')).toContainText(/滑块已自动完成|Slider drag completed/);
  await page.waitForTimeout(250);
  await page.screenshot({ path: testInfo.outputPath('captcha-helper-slider-page-success.png'), fullPage: true });
  await expect(popup.locator('[data-slider-state-title]')).toHaveText(/已自动完成拖动|Automatic drag completed/);
  await expect(popup.locator('[data-slider-panel]')).toHaveAttribute('data-state', 'success');
  await popup.locator('#app').screenshot({ path: testInfo.outputPath('captcha-helper-popup-slider-success.png') });
  await popup.close();
  await page.close();

  const aliyunPage = await open('/aliyun-slider.html');
  await waitForContent(aliyunPage);
  await expect.poll(() => contentMessage(aliyunPage, { type: 'captcha:slider-discover' })).toMatchObject({
    state: 'ready',
    challenge: {
      provider: 'aliyun',
      pieceMask: { width: expect.any(Number), height: expect.any(Number) },
    },
  });
  await expect(aliyunPage.locator('#aliyunCaptcha-result')).toHaveText('滑动成功!', { timeout: 15_000 });
  await expect(aliyunPage.locator('[data-local-captcha-status]')).toContainText(/滑块已自动完成|Slider drag completed/);
  await aliyunPage.screenshot({ path: testInfo.outputPath('captcha-helper-aliyun-slider-success.png'), fullPage: true });
  await aliyunPage.close();

  const aliyunShapePage = await open('/aliyun-slider.html?mode=shape');
  await waitForContent(aliyunShapePage);
  await expect(aliyunShapePage.locator('#aliyunCaptcha-result')).toHaveText('滑动成功!', { timeout: 15_000 });
  await expect(aliyunShapePage.locator('[data-local-captcha-status]')).toContainText(/滑块已自动完成|Slider drag completed/);
  await aliyunShapePage.screenshot({ path: testInfo.outputPath('captcha-helper-aliyun-shape-slider-success.png'), fullPage: true });
  await aliyunShapePage.close();
});

test('keeps a site disabled in global slider mode across popup and page reloads', async () => {
  const options = await openOptionsPage();
  await options.locator('[data-nav="slider"]').click();
  await options.locator('[data-slider-mode="all"]').click();
  await expect(options.locator('[data-slider-mode="all"]')).toHaveAttribute('aria-pressed', 'true');
  await options.close();

  const page = await open('/slider.html');
  await waitForContent(page);
  await expect(page.locator('#status')).toHaveText('验证成功', { timeout: 15_000 });
  const popup = await openActionPopup(page);
  await popup.locator('[data-page-options] > summary').click();
  await expect(popup.locator('[data-slider-enabled]')).toBeChecked();
  await popup.locator('[data-slider-enabled]').click();
  await expect(popup.locator('[data-slider-enabled]')).not.toBeChecked();
  await popup.waitForTimeout(1_200);
  await expect(popup.locator('[data-slider-enabled]')).not.toBeChecked();
  await expect(popup.locator('[data-slider-state-title]')).toHaveText(/发现拼图滑块|Puzzle slider found/);
  await popup.reload();
  await popup.locator('[data-page-options] > summary').click();
  await expect(popup.locator('[data-slider-enabled]')).not.toBeChecked();
  await popup.close();

  await page.reload();
  await waitForContent(page);
  await page.locator('#reset').click();
  await page.waitForTimeout(2_000);
  await expect(page.locator('#status')).toBeEmpty();
  await expect(page.locator('#handle')).toHaveCSS('left', '0px');
  await expect(page.locator('[data-local-captcha-status]')).toHaveCount(0);

  const disabledOptions = await openOptionsPage();
  await disabledOptions.locator('[data-nav="slider"]').click();
  await expect(disabledOptions.locator('[data-slider-mode="all"]')).toHaveAttribute('aria-pressed', 'true');
  await disabledOptions.locator('#slider-disabled > summary').click();
  await expect(disabledOptions.locator('[data-restore-slider="captcha.e2e.test"]')).toBeVisible();
  await disabledOptions.close();

  const restoredPopup = await openActionPopup(page);
  await restoredPopup.locator('[data-page-options] > summary').click();
  await expect(restoredPopup.locator('[data-slider-enabled]')).not.toBeChecked();
  await restoredPopup.locator('[data-slider-enabled]').click();
  await expect(restoredPopup.locator('[data-slider-enabled]')).toBeChecked();
  await page.bringToFront();
  await expect(page.locator('#status')).toHaveText('验证成功', { timeout: 15_000 });
  await restoredPopup.close();
  await page.close();
});

test('binds a text CAPTCHA across popup recreation, image refresh, and page reload', async ({}, testInfo) => {
  await configureBindingTest(false);
  const page = await open('/binding.html?token=BINDING_SECRET#private');
  await waitForContent(page);
  await page.locator('#open').click();
  const popup = await openActionPopup(page);
  await popup.emulateMedia({ colorScheme: 'dark' });
  await popup.locator('#app').screenshot({ path: testInfo.outputPath('popup-binding-dark.png') });
  await popup.locator('[data-binding-help] > summary').click();
  await popup.locator('#app').screenshot({ path: testInfo.outputPath('popup-binding-expanded-dark.png') });
  await popup.locator('[data-bind="text"]').click();
  if (!popup.isClosed()) await popup.close();
  await page.bringToFront();
  const picker = page.locator('[data-local-captcha-binding]');
  await expect(picker).toBeVisible();
  await picker.locator('[data-start]').click();
  await page.locator('img.picture').click();
  await page.locator('input.form-field').evaluateAll(inputs => inputs.forEach(input => input.removeAttribute('placeholder')));
  await page.locator('input.form-field').nth(1).click();
  await expect(picker.locator('[data-error]')).toContainText(/诊断|Diagnostics/);
  await expect.poll(async () => (await extensionMessage({ type: 'captcha:get-model-status' }) as ModelStatusSnapshot).logs.find(log => log.binding?.event === 'rejected')?.binding).toMatchObject({ kind: 'text', step: 'field', reason: 'selector-unavailable', attributes: ['class'], closestMatchCount: 2 });
  await page.locator('input.form-field').evaluateAll(inputs => inputs.forEach((input, index) => input.setAttribute('placeholder', index === 0 ? 'First value' : 'Second value')));
  await page.getByPlaceholder('Second value').click();
  await expect(picker.locator('[data-save]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('captcha-binding-preview.png') });
  await picker.locator('[data-save]').click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByPlaceholder('Second value')).toHaveValue('14975', { timeout: 30_000 });
  await expect(page.getByPlaceholder('First value')).toHaveValue('');
  await expect.poll(async () => (await (await currentWorker()).evaluate(async key => {
    return (await (globalThis as { chrome?: ExtensionApi }).chrome!.storage.local.get(key))[key];
  }, MODEL_LOGS_STORAGE_KEY) as { logs: ModelStatusSnapshot['logs'] }).logs.some(log => log.binding?.event === 'saved')).toBe(true);
  const diagnostics = await context.newPage();
  await diagnostics.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value: string) => { (globalThis as { __bindingReport?: string }).__bindingReport = value; },
    } });
  });
  await diagnostics.goto(`${extensionOrigin}/options.html#diagnostics`);
  await expect(diagnostics.locator('.diagnostic-stream')).toContainText('selector-unavailable');
  await diagnostics.locator('[data-copy-diagnostics]').click();
  await expect.poll(() => diagnostics.evaluate(() => (globalThis as { __bindingReport?: string }).__bindingReport ?? '')).toContain('```json');
  const reportText = await diagnostics.evaluate(() => (globalThis as { __bindingReport?: string }).__bindingReport!);
  const report = JSON.parse(reportText.slice(8, -4)) as ModelStatusSnapshot & { extensionVersion: string; browser: string };
  expect(report.extensionVersion).toBe('1.4.0');
  expect(report.browser).toContain('Chrome/');
  expect(report.logs.filter(log => log.kind === 'binding').map(log => log.binding?.event)).toEqual(['started', 'selected', 'rejected', 'selected', 'saved']);
  expect(reportText).not.toContain('BINDING_SECRET');
  expect(reportText).not.toContain('input[placeholder');
  await diagnostics.setViewportSize({ width: 390, height: 844 });
  expect(await diagnostics.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await diagnostics.screenshot({ path: testInfo.outputPath('binding-diagnostics.png'), fullPage: true });
  await diagnostics.locator('[data-clear-diagnostics]').click();
  await expect(diagnostics.locator('.diagnostic-stream')).toContainText(/暂无诊断记录|No diagnostic records/);
  await diagnostics.close();
  await page.bringToFront();
  expect(await extensionMessage({ type: 'captcha:set-preferences', autoFill: false })).toMatchObject({ autoFill: false });
  await page.locator('#refresh').click();
  const confirmation = page.locator('[data-local-captcha-status]').getByRole('button', { name: /^(填入|Fill)$/ });
  await expect(confirmation).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: testInfo.outputPath('captcha-binding-confirmation.png') });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await page.locator('[data-local-captcha-status]').boundingBox())?.width).toBe(366);
  const feedback = await page.locator('[data-local-captcha-status]').boundingBox();
  expect(feedback?.width).toBe(366);
  expect((feedback?.y ?? 0) + (feedback?.height ?? 0)).toBeLessThanOrEqual(832);
  await page.locator('[data-local-captcha-status]').screenshot({ path: testInfo.outputPath('captcha-result-mobile-dark.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ colorScheme: 'light' });
  await confirmation.click({ timeout: 10_000 });
  await expect(page.getByPlaceholder('Second value')).toHaveValue('99067', { timeout: 30_000 });
  await extensionMessage({ type: 'captcha:set-preferences', autoFill: true });
  await page.locator('#close').click();
  await page.locator('#open').click();
  await expect(page.getByPlaceholder('Second value')).toHaveValue('14975', { timeout: 30_000 });
  await page.reload();
  await page.locator('#open').click();
  await expect(page.getByPlaceholder('Second value')).toHaveValue('14975', { timeout: 30_000 });
  await page.goto(`${server.origin}/binding.html?reuse=1`);
  await waitForContent(page);
  await page.waitForFunction(() => document.querySelector<HTMLImageElement>('img.picture')?.complete);
  await page.waitForTimeout(300);
  await expect(page.getByPlaceholder('Second value')).toHaveValue('');
  await page.locator('#open').click();
  await expect(page.getByPlaceholder('Second value')).toHaveValue('14975', { timeout: 10_000 });
  expect(await submitCount(page)).toBe(0);
  const manage = await openActionPopup(page);
  await expect(manage.locator('[data-bind="text"]')).toHaveText(/重新绑定|Rebind CAPTCHA/);
  await manage.locator('[data-binding-help] > summary').click();
  await manage.locator('[data-remove-binding="text"]').click();
  await expect(manage.locator('[data-remove-binding="text"]')).toBeHidden();
  await manage.close();
  await page.close();
});

test('binds popup slider parts and automatically handles the saved targets after reload', async ({}, testInfo) => {
  await configureBindingTest(false);
  const page = await open('/aliyun-slider.html?mode=shape&binding=1');
  await waitForContent(page);
  await page.locator('#open').click();
  await expect(contentMessage(page, { type: 'captcha:slider-discover' })).resolves.toMatchObject({ state: 'not-found' });
  const popup = await openActionPopup(page);
  await popup.locator('[data-page-options] > summary').click();
  await popup.locator('[data-binding-help] > summary').click();
  await popup.locator('[data-bind="slider"]').click();
  if (!popup.isClosed()) await popup.close();
  await page.bringToFront();
  const picker = page.locator('[data-local-captcha-binding]');
  await picker.locator('[data-start]').click();
  await page.locator('#scene').click({ position: { x: 200, y: 30 } });
  await page.locator('#knob').click();
  await page.locator('#rail').click({ position: { x: 230, y: 20 } });
  await expect(picker.locator('[data-save]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('slider-binding-preview.png') });
  await picker.locator('[data-save]').click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator('#outcome')).toHaveText('滑动成功!', { timeout: 30_000 });
  await page.reload();
  await page.locator('#open').click();
  await page.waitForTimeout(1600);
  await expect(page.locator('#outcome')).toBeEmpty();
  const automatic = await openActionPopup(page);
  await automatic.locator('[data-page-options] > summary').click();
  await automatic.locator('[data-slider-enabled]').check();
  await automatic.close();
  await page.bringToFront();
  await expect(page.locator('#outcome')).toHaveText('滑动成功!', { timeout: 30_000 });
  await page.close();
});

test('preserves search input until the user submits with automatic slider handling enabled', async () => {
  const page = await open('/search.html');
  const popup = await openActionPopup(page);
  await popup.locator('[data-page-options] > summary').click();
  const wasEnabled = await popup.locator('[data-slider-enabled]').isChecked();
  await popup.locator('[data-slider-enabled]').check();
  await expect(popup.locator('[data-slider-enabled]')).toBeChecked();
  await popup.close();

  try {
    for (let visit = 0; visit < 2; visit += 1) {
      if (visit > 0) await page.reload();
      await waitForContent(page);
      const input = page.locator('.nav-search-input');
      await input.click();
      await expect(page.locator('.search-panel')).toBeVisible();
      await page.waitForTimeout(6_000);

      expect(await submitCount(page)).toBe(0);
      await expect(page).toHaveURL(`${server.origin}/search.html`);
      await expect(input).toHaveValue('');
      await expect(input).toBeFocused();
      await expect(page.locator('[data-local-captcha-status]')).toHaveCount(0);
      await expect(contentMessage(page, { type: 'captcha:slider-discover' })).resolves.toEqual({ state: 'not-found' });
    }

    await page.locator('.nav-search-input').fill('MiniMax M3');
    await page.locator('.nav-search-btn').click();
    expect(await submitCount(page)).toBe(1);
    await expect(page).toHaveURL(`${server.origin}/search.html?keyword=MiniMax+M3`);
  } finally {
    if (!wasEnabled) {
      const restorePopup = await openActionPopup(page);
      await restorePopup.locator('[data-page-options] > summary').click();
      await restorePopup.locator('[data-slider-enabled]').uncheck();
      await restorePopup.close();
    }
    await page.close();
  }
});


test('renders the release introduction in both languages and themes and reopens it from the popup', async ({}, testInfo) => {
  const page = await open('/automatic.html');
  const popup = await openActionPopup(page);
  const opened = context.waitForEvent('page');
  await popup.locator('[data-open-updates]').click();
  const guide = await opened;
  await expect(guide).toHaveURL(/flow=upgrade&manual=1/);
  for (const locale of ['zh_CN', 'en']) {
    await guide.locator(`[data-language="${locale}"]`).click();
    await expect(guide.locator('[data-primary]')).toHaveText(locale === 'zh_CN' ? '开始使用' : 'Start using');
    for (const colorScheme of ['light', 'dark'] as const) {
      await guide.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await guide.setViewportSize({ width: 1280, height: 800 });
      await expect.poll(() => guide.locator('.release-visual img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      expect(await guide.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await guide.screenshot({ path: testInfo.outputPath(`release-${locale}-${colorScheme}.png`), fullPage: true });
      await guide.setViewportSize({ width: 390, height: 844 });
      expect(await guide.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await guide.screenshot({ path: testInfo.outputPath(`release-${locale}-${colorScheme}-mobile.png`), fullPage: true });
    }
  }
  const closed = guide.waitForEvent('close');
  await guide.locator('[data-primary]').click();
  await closed;
  await popup.close();
  await page.close();
  const automatic = await context.newPage();
  const automaticClosed = automatic.waitForEvent('close');
  await automatic.goto(`${extensionOrigin}/onboarding.html?flow=upgrade`).catch(() => undefined);
  await automaticClosed;
});

test('browses the offline release archive and returns to an automatically opened introduction', async ({}, testInfo) => {
  const page = await open('/automatic.html');
  const popup = await openActionPopup(page);
  const opened = context.waitForEvent('page');
  await popup.locator('[data-open-history]').click();
  const archive = await opened;
  await expect(archive).toHaveURL(/flow=history/);
  await expect(archive.locator('[data-release]')).toHaveCount(8);
  await expect(archive.locator('[data-current]')).toHaveAttribute('data-release', '1.4.0');
  await context.setOffline(true);
  try {
    for (const locale of ['zh_CN', 'en']) {
      await archive.locator(`[data-language="${locale}"]`).click();
      for (const colorScheme of ['light', 'dark'] as const) {
        await archive.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await archive.setViewportSize({ width: 1280, height: 800 });
        await archive.screenshot({ path: testInfo.outputPath(`archive-${locale}-${colorScheme}.png`), fullPage: true });
        await archive.setViewportSize({ width: 390, height: 844 });
        expect(await archive.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await archive.screenshot({ path: testInfo.outputPath(`archive-${locale}-${colorScheme}-mobile.png`), fullPage: true });
      }
    }
    const versions = await archive.locator('[data-release]').evaluateAll((links) => links.map((link) => (link as HTMLElement).dataset.release!));
    for (const version of versions) {
      await archive.locator(`[data-release="${version}"]`).click();
      await expect(archive.locator('[data-release-version]')).toHaveAttribute('data-release-version', version);
      await expect(archive.locator('.release-notes-body li').first()).not.toBeEmpty();
      if (version === '1.2.0') {
        await expect(archive.locator('h1')).toHaveText('A little help with puzzle sliders.');
        await archive.setViewportSize({ width: 1280, height: 800 });
        await archive.screenshot({ path: testInfo.outputPath('release-1.2.0-en-dark.png'), fullPage: true });
      }
      await archive.goBack();
      await expect(archive.locator('[data-page="history"]')).toBeVisible();
    }
    await archive.evaluate(async () => {
      const api = (globalThis as { chrome?: { storage: { local: { get(key: string): Promise<Record<string, unknown>>; set(value: unknown): Promise<void> } } } }).chrome!;
      const stored = await api.storage.local.get('captcha-settings');
      await api.storage.local.set({ 'captcha-settings': { ...(stored['captcha-settings'] as object), lastSeenUpgradeGuide: '1.3.3' } });
    });
    await archive.goto(`${extensionOrigin}/onboarding.html?flow=upgrade&version=1.4.0`);
    await expect(archive).toHaveURL(/manual=1/);
    await archive.locator('[data-release-history]').click();
    await expect(archive.locator('[data-page="history"]')).toBeVisible();
    await archive.goBack();
    await expect(archive.locator('[data-release-version="1.4.0"]')).toBeVisible();
    await archive.reload();
    await expect(archive.locator('[data-release-version="1.4.0"]')).toBeVisible();
  } finally {
    await context.setOffline(false);
    await archive.close();
    await popup.close();
    await page.close();
  }
});
