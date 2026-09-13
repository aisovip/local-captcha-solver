import { test, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { DEFAULT_SETTINGS } from '../../src/platform/settings-store';

declare const chrome: {
  storage: { local: { set(values: Record<string, unknown>): Promise<void>; get(key: string): Promise<Record<string, unknown>> } };
  permissions: { contains(details: { origins: string[] }): Promise<boolean>; remove(details: { origins: string[] }): Promise<boolean> };
  scripting: { getRegisteredContentScripts(): Promise<readonly { id: string }[]> };
  tabs: { captureVisibleTab(windowId: number, options: { format: 'png' }): Promise<string> };
};

const target = process.env.CAPTCHA_E2E_TARGET === 'edge' ? 'edge' : 'chrome';
let context: BrowserContext;
let worker: Worker;
let profile: string;
let extensionDirectory: string | undefined;
let frontend: Server;
let backend: Server;
let pageOrigin: string;
let imageRequests = 0;

test.beforeAll(async () => {
  await promisify(execFile)('npm', ['run', target === 'edge' ? 'build:edge' : 'build'], { env: { ...process.env, CAPTCHA_E2E_PREGRANT: '1' } });
  const images = await Promise.all(['digits-002.png', 'digits-017.png'].map((name) => readFile(resolve('benchmark/fixtures/generated', name))));
  backend = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
    response.end(images[imageRequests++ % 2]);
  });
  backend.listen(0); await once(backend, 'listening');
  const imageOrigin = `http://127.0.0.1:${(backend.address() as { port: number }).port}`;
  frontend = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><body><form style="margin:30px"><label>验证码<img alt="验证码" src="${imageOrigin}/captcha" width="180" height="64"><input id="answer" aria-label="验证码"></label></form></body></html>`);
  });
  frontend.listen(0); await once(frontend, 'listening');
  pageOrigin = `http://localhost:${(frontend.address() as { port: number }).port}`;
});

async function startContext(captureGranted: boolean): Promise<void> {
  profile = await mkdtemp(join(tmpdir(), 'captcha-image-access-'));
  let extensionPath = resolve(`.output/${target}-mv3`);
  if (captureGranted) {
    extensionDirectory = await mkdtemp(join(tmpdir(), 'captcha-capture-extension-'));
    await cp(extensionPath, extensionDirectory, { recursive: true });
    const path = join(extensionDirectory, 'manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.host_permissions = ['<all_urls>'];
    await writeFile(path, JSON.stringify(manifest));
    extensionPath = extensionDirectory;
  }
  context = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium', deviceScaleFactor: captureGranted ? 2 : 1,
    ...(target === 'edge' ? { executablePath: process.env.CAPTCHA_EDGE_EXECUTABLE ?? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' } : {}),
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(async (settings) => {
    await chrome.storage.local.set({ 'captcha-settings': settings });
  }, { ...DEFAULT_SETTINGS, interfaceLocale: 'zh_CN', onboardingComplete: true, selectedSites: [{ hostname: 'localhost', includeSubdomains: false }] });
  await expect.poll(() => worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length), { timeout: 15_000 }).toBeGreaterThan(0);
}

test.afterAll(async () => {
  if (frontend) await new Promise<void>((resolve) => frontend.close(() => resolve()));
  if (backend) await new Promise<void>((resolve) => backend.close(() => resolve()));
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const pages = await Promise.all(context.pages().map(async (page) => ({ url: page.url(), text: await page.locator('body').innerText().catch(() => ''), status: await page.locator('[data-local-captcha-status]').locator('.message').textContent({ timeout: 500 }).catch(() => '') })));
    const logs = await worker.evaluate(() => chrome.storage.local.get('captcha-diagnostic-logs')).catch(() => ({}));
    const path = testInfo.outputPath('image-access-state.json');
    await writeFile(path, JSON.stringify({ pages, logs }, null, 2));
    await testInfo.attach('image-access-state', { path, contentType: 'application/json' });
  }
  await context?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (extensionDirectory) await rm(extensionDirectory, { recursive: true, force: true });
  extensionDirectory = undefined;
});

async function consentWindow(): Promise<Page> {
  await expect.poll(() => context.pages().find((page) => page.url().includes('/image-access.html'))?.url(), { timeout: 20_000 }).toBeTruthy();
  return context.pages().find((page) => page.url().includes('/image-access.html'))!;
}

test('explains missing capture permission and preserves cancellation', async ({}, testInfo) => {
  await startContext(false);
  imageRequests = 0;
  const page = await context.newPage();
  await page.goto(pageOrigin);
  let dialog = await consentWindow();
  await dialog.setViewportSize({ width: 460, height: 660 });
  await expect(dialog.locator('[data-page]')).toHaveText(pageOrigin);
  await expect(dialog.locator('[data-scope="site"]')).toBeEnabled();
  await expect(page.locator('#answer')).toHaveValue('');
  expect(imageRequests).toBe(1);
  expect(await dialog.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await dialog.screenshot({ path: testInfo.outputPath('image-access-consent.png'), fullPage: true });
  await dialog.locator('[data-cancel]').click();
  await expect.poll(() => dialog.isClosed()).toBe(true);
  expect(await worker.evaluate(() => chrome.permissions.contains({ origins: ['<all_urls>'] }))).toBe(false);
  await page.locator('[data-local-captcha-status]').locator('button.action', { hasText: '选择授权范围' }).click();
  dialog = await consentWindow();
  await expect(dialog.locator('[data-scope="all"]')).toBeEnabled();
  await dialog.locator('[data-cancel]').click();
  await expect(page.locator('#answer')).toHaveValue('');
  expect(imageRequests).toBe(1);
});

test('captures the displayed cross-origin CAPTCHA with granted access and selected or global scope', async () => {
  await startContext(true);
  imageRequests = 0;
  const page = await context.newPage();
  await page.goto(pageOrigin);
  await expect(page.locator('#answer')).toHaveValue('14975', { timeout: 30_000 });
  expect(imageRequests).toBe(1);
  expect(context.pages().some((item) => item.url().includes('/image-access.html'))).toBe(false);
  const other = await context.newPage();
  await other.goto(pageOrigin.replace('localhost', '127.0.0.1'));
  await expect(other.locator('#answer')).toHaveValue('');
  expect(await other.locator('[data-local-captcha-status]').count()).toBe(0);
  await other.close();
  await page.bringToFront();
  await context.setOffline(true);
  await page.locator('#answer').fill('');
  await page.locator('img').click({ button: 'middle' });
  await expect(page.locator('#answer')).toHaveValue('14975', { timeout: 15_000 });
  expect(imageRequests).toBe(2);
  await context.setOffline(false);
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get('captcha-settings'))['captcha-settings'] as Record<string, unknown>;
    await chrome.storage.local.set({ 'captcha-settings': { ...settings, accessMode: 'all' } });
  });
  await expect.poll(() => worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((item) => item.id))).toContain('captcha-auto-global');
  const global = await context.newPage();
  await global.goto(pageOrigin.replace('localhost', '127.0.0.1'));
  await expect(global.locator('#answer')).toHaveValue('14975', { timeout: 15_000 });
  expect(imageRequests).toBe(3);
});

test('resumes the same CAPTCHA after either consent choice with browser access granted', async () => {
  await startContext(true);
  imageRequests = 0;
  for (const scope of ['site', 'all']) {
    await worker.evaluate(() => {
      const capture = chrome.tabs.captureVisibleTab.bind(chrome.tabs);
      // Exercise the consent transition with an already-granted browser permission.
      chrome.tabs.captureVisibleTab = async (windowId, options) => {
        chrome.tabs.captureVisibleTab = capture;
        throw new Error("The '<all_urls>' permission is required.");
      };
    });
    const page = await context.newPage();
    await page.goto(`${pageOrigin}/${scope}`);
    const dialog = await consentWindow();
    const before = imageRequests;
    await dialog.locator(`[data-scope="${scope}"]`).click();
    await expect(page.locator('#answer')).toHaveValue(before % 2 === 1 ? '14975' : '99067', { timeout: 15_000 });
    await expect.poll(() => dialog.isClosed()).toBe(true);
    expect(imageRequests).toBe(before);
    expect(await worker.evaluate(async () => (await chrome.storage.local.get('captcha-settings'))['captcha-settings'])).toMatchObject({ accessMode: scope === 'site' ? 'selected' : 'all' });
    await page.close();
  }
});
