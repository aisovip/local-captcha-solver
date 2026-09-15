import { describe, expect, it, vi } from 'vitest';
import { createRuntimeRouter } from '../../src/background/runtime-router';
import { createModelStatusStore } from '../../src/background/model-status';
import { createBindingStore, type CaptchaBinding } from '../../src/platform/binding-store';

const scope = 'https://example.test/login';
const sender = { tab: { id: 7, url: scope, windowId: 1 }, url: scope, frameId: 0 };
const text: CaptchaBinding = { kind: 'text', scope, image: '#picture', field: '#answer' };

function harness(permission = true) {
  let stored: unknown;
  const bindings = createBindingStore({ getLocal: async <T>() => stored as T, setLocal: async (_key, value) => { stored = value; } });
  const solve = vi.fn(async () => ({ state: 'success' as const }));
  const router = createRuntimeRouter({
    bindings, modelStatus: createModelStatusStore(),
    permissions: { contains: async () => permission },
    imageCapture: { capture: async () => ({ state: 'image_unavailable', reason: 'permission' }) },
    inferenceHost: { recognize: async () => [] },
    siteState: { isEnabled: async () => true, enablePage: async () => undefined, disablePage: async () => undefined },
    activeTab: async () => sender.tab,
    sliderSolver: { solve },
  });
  return { bindings, router, solve };
}

describe('binding authorization', () => {
  it('records binding diagnostics only from a valid top-level page and strips page-derived values', async () => {
    const { router } = harness();
    const diagnostic = {
      attemptId: 'abc123-def456', kind: 'text', step: 'field', event: 'rejected', reason: 'selector-unavailable',
      tag: 'input', attributes: ['placeholder', 'class', 'SECRET'], closestMatchCount: 3, selectorAttempts: 12,
      fieldValue: 'SECRET', selector: 'input[placeholder="SECRET"]', pageUrl: 'https://secret.test/?token=SECRET',
    };
    const request = { type: 'captcha:record-binding', diagnostic };
    for (const source of [{}, { ...sender, frameId: 2 }, { ...sender, url: 'https://other.test/' }]) {
      await expect(router.handle(request, source)).resolves.toEqual({ recorded: false });
    }
    await expect(router.handle({ ...request, diagnostic: { ...diagnostic, event: 'SECRET' } }, sender)).resolves.toEqual({ recorded: false });
    await expect(router.handle(request, { ...sender, url: `${scope}?token=SECRET#secret` })).resolves.toEqual({ recorded: true });
    const snapshot = await router.handle({ type: 'captcha:get-model-status' }, {});
    expect(snapshot).toMatchObject({ logs: [{ kind: 'binding', outcome: 'failure', site: 'example.test', binding: { event: 'rejected', step: 'field', reason: 'selector-unavailable', attributes: ['placeholder', 'class'], closestMatchCount: 3 } }] });
    expect(JSON.stringify(snapshot)).not.toContain('SECRET');
  });

  it('saves only authorized current-document bindings and lets the popup remove them', async () => {
    const { bindings, router } = harness();
    await expect(router.handle({ type: 'captcha:save-binding', binding: text }, sender)).resolves.toEqual({ ok: true });
    await expect(router.handle({ type: 'captcha:get-bindings' }, {})).resolves.toEqual({ ok: true, scope, bindings: [text] });
    await expect(router.handle({ type: 'captcha:remove-binding', scope, kind: 'text' }, sender)).resolves.toEqual({ ok: false });
    await expect(router.handle({ type: 'captcha:remove-binding', scope, kind: 'text' }, {})).resolves.toEqual({ ok: true });
    expect(await bindings.read()).toEqual([]);
  });

  it('rejects missing permission, other origins, stale pages, embedded frames, and malformed rules', async () => {
    const noPermission = harness(false);
    await expect(noPermission.router.handle({ type: 'captcha:save-binding', binding: text }, sender)).resolves.toEqual({ ok: false });
    const { bindings, router } = harness();
    for (const source of [{}, { ...sender, frameId: 2 }, { ...sender, url: 'https://other.test/login' }, { ...sender, tab: { ...sender.tab, url: 'https://example.test/account' } }]) {
      await expect(router.handle({ type: 'captcha:save-binding', binding: text }, source)).resolves.toEqual({ ok: false });
    }
    for (const binding of [{ ...text, scope: 'https://other.test/login' }, { ...text, field: '' }, { ...text, scope: `${scope}?token=x` }]) {
      await expect(router.handle({ type: 'captcha:save-binding', binding }, sender)).resolves.toEqual({ ok: false });
    }
    expect(await bindings.read()).toEqual([]);
  });

  it('requires a saved slider on the active page before handling it from the binding picker', async () => {
    const { bindings, router, solve } = harness();
    await expect(router.handle({ type: 'captcha:run-bound-slider' }, sender)).resolves.toMatchObject({ state: 'permission-denied' });
    await bindings.save({ kind: 'slider', scope, image: '#picture', handle: '#knob', track: '#rail' });
    await expect(router.handle({ type: 'captcha:run-bound-slider' }, { ...sender, tab: { ...sender.tab, id: 8 } })).resolves.toMatchObject({ state: 'permission-denied' });
    await expect(router.handle({ type: 'captcha:run-bound-slider' }, sender)).resolves.toMatchObject({ state: 'success' });
    expect(solve).toHaveBeenCalledExactlyOnceWith(sender.tab, 'manual', undefined);
  });
});
