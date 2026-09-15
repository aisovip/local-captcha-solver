import { chromium } from '@playwright/test';
import { cp, mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startFixtureServer } from '../tests/e2e/fixtures/server';
import { DEFAULT_SETTINGS } from '../src/platform/settings-store';

const buildPath = resolve('.output/chrome-mv3');
const output = resolve('public/guide');
const profile = await mkdtemp(join(tmpdir(), 'captcha-guide-'));
const extensionPath = join(profile, 'extension');
await cp(buildPath, extensionPath, { recursive: true });
const manifestPath = join(extensionPath, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.host_permissions = ['http://captcha.e2e.test/*'];
await writeFile(manifestPath, JSON.stringify(manifest));
const server = await startFixtureServer();
const context = await chromium.launchPersistentContext(join(profile, 'browser'), {
  headless: true, channel: 'chromium', viewport: { width: 1040, height: 640 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
try {
  await mkdir(output, { recursive: true });
  await context.route(`${server.origin}/**`, async route => {
    const url = new URL(route.request().url());
    const response = await fetch(`${server.serverOrigin}${url.pathname}${url.search}`);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionOrigin = `chrome-extension://${new URL(worker.url()).host}`;
  const settingsPage = await context.newPage();
  await settingsPage.goto(`${extensionOrigin}/options.html`);
  for (const lang of ['zh', 'en'] as const) {
    await settingsPage.evaluate(async settings => { await (globalThis as any).chrome.storage.local.set({ 'captcha-settings': settings }); }, { ...DEFAULT_SETTINGS, interfaceLocale: lang === 'zh' ? 'zh_CN' : 'en', onboardingComplete: true });
    for (const colorScheme of ['light', 'dark'] as const) {
      const page = await context.newPage();
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto(`${server.origin}/guide.html?lang=${lang}`);
      await page.locator('#sample').evaluate(async (image: HTMLImageElement) => { if (!image.complete) await new Promise(resolve => image.addEventListener('load', resolve, { once: true })); });
      const tabId = await worker.evaluate(async pageUrl => {
        const api = (globalThis as any).chrome;
        const tabs = await api.tabs.query({});
        const tab = tabs.find((candidate: { url?: string; id?: number }) => candidate.url === pageUrl);
        if (!tab?.id) throw new Error('The practice tab is unavailable');
        await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-scripts/content.js'] });
        return tab.id;
      }, page.url());
      await worker.evaluate(async ({ tabId, scope }) => (globalThis as any).chrome.tabs.sendMessage(tabId, { type: 'captcha:begin-binding', kind: 'text', scope }), { tabId, scope: `${server.origin}/guide.html` });
      await page.locator('[data-local-captcha-binding] [data-start]').click();
      await page.locator('#sample').click();
      await page.locator('#answer').click();
      await page.mouse.move(20, 600);
      await page.screenshot({ path: join(output, `binding-${lang}${colorScheme === 'dark' ? '-dark' : ''}.png`) });
      await page.close();
    }
  }
} finally { await context.close(); await server.close(); await rm(profile, { recursive: true, force: true }); }
