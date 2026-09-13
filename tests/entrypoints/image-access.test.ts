import { afterEach, describe, expect, it, vi } from 'vitest';
import { startImageAccess } from '../../entrypoints/image-access/main';

const details = { tabId: 4, pageUrl: 'http://localhost:5173/login', pageHostname: 'localhost', imageOrigin: 'http://localhost:8080', requestId: 'image-request' };
afterEach(() => document.body.replaceChildren());
async function harness(granted = true) {
  const root = document.createElement('main'); document.body.append(root);
  const sendMessage = vi.fn(async (message: { type: string }) => message.type === 'captcha:get-image-access-details' ? details : { granted: true });
  const requestPermissions = vi.fn(async () => granted);
  const close = vi.fn();
  await startImageAccess(root, 4, { sendMessage, requestPermissions, close });
  return { root, sendMessage, requestPermissions, close };
}

describe('image access dialog', () => {
  it.each(['site', 'all'])('explains browser permission and requests it directly from the %s choice', async (scope) => {
    const app = await harness();
    expect(app.root.textContent).toContain('两种选择都需要此权限');
    expect(app.root.querySelector('[data-image]')?.textContent).toBe('http://localhost:8080');
    app.root.querySelector<HTMLButtonElement>(`[data-scope="${scope}"]`)!.click();
    expect(app.requestPermissions).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
    await vi.waitFor(() => expect(app.sendMessage).toHaveBeenCalledWith({ type: 'captcha:complete-image-access', tabId: 4, pageUrl: details.pageUrl, requestId: details.requestId, scope }));
    await vi.waitFor(() => expect(app.close).toHaveBeenCalledOnce());
  });

  it('leaves the dialog usable and sends no grant when the browser declines', async () => {
    const app = await harness(false);
    app.root.querySelector<HTMLButtonElement>('[data-scope="all"]')!.click();
    await vi.waitFor(() => expect(app.root.querySelector('[data-status]')?.textContent).toContain('尚未授予权限'));
    expect(app.sendMessage).toHaveBeenCalledOnce();
    expect(app.close).not.toHaveBeenCalled();
  });

  it('cancels without requesting browser access', async () => {
    const app = await harness();
    app.root.querySelector<HTMLButtonElement>('[data-cancel]')!.click();
    expect(app.close).toHaveBeenCalledOnce();
    expect(app.requestPermissions).not.toHaveBeenCalled();
  });
});
