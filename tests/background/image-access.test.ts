import { describe, expect, it, vi } from 'vitest';
import { createImageAccess } from '../../src/background/image-access';

function harness(granted = true) {
  const get = vi.fn(async () => ({ id: 4, url: 'http://localhost:5173/login' }));
  const sendMessage = vi.fn(async (): Promise<unknown> => ({ requestId: 'image-request', imageOrigin: 'http://localhost:8080' }));
  const setAccessMode = vi.fn(async () => undefined);
  const reconcile = vi.fn(async () => undefined);
  const openDialog = vi.fn(async () => undefined);
  const access = createImageAccess({ tabs: { get, sendMessage }, permissions: { contains: async () => granted }, settings: { setAccessMode }, reconcile, openDialog });
  return { access, get, sendMessage, setAccessMode, reconcile, openDialog };
}

describe('image access consent', () => {
  it.each([['site', 'selected'], ['all', 'all']] as const)('saves the %s scope and resumes the same CAPTCHA after browser authorization', async (scope, mode) => {
    const app = harness();
    await expect(app.access.complete({ tabId: 4, pageUrl: 'http://localhost:5173/login', requestId: 'image-request', scope })).resolves.toEqual({ granted: true });
    expect(app.setAccessMode).toHaveBeenCalledWith(mode, 'localhost');
    expect(app.sendMessage).toHaveBeenLastCalledWith(4, { type: 'captcha:retry-image', requestId: 'image-request' });
  });

  it('keeps settings intact when browser permission was declined', async () => {
    const app = harness(false);
    await expect(app.access.complete({ tabId: 4, pageUrl: 'http://localhost:5173/login', requestId: 'image-request', scope: 'all' })).resolves.toEqual({ granted: false, reason: 'permission' });
    expect(app.setAccessMode).not.toHaveBeenCalled();
  });

  it('rejects stale page and image requests before changing settings', async () => {
    const app = harness();
    for (const change of [{ pageUrl: 'http://localhost:5173/other' }, { requestId: 'previous-image' }]) {
      await expect(app.access.complete({ tabId: 4, pageUrl: 'http://localhost:5173/login', requestId: 'image-request', scope: 'site', ...change })).resolves.toMatchObject({ granted: false, reason: 'stale' });
    }
    expect(app.setAccessMode).not.toHaveBeenCalled();
  });

  it('opens the permission dialog only for an existing page request', async () => {
    const app = harness();
    await expect(app.access.open(4)).resolves.toBe(true);
    expect(app.openDialog).toHaveBeenCalledWith(4);
    app.sendMessage.mockResolvedValueOnce(undefined);
    await expect(app.access.open(4)).resolves.toBe(false);
    expect(app.openDialog).toHaveBeenCalledOnce();
  });
});
