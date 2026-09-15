import { describe, expect, it, vi } from 'vitest';

import { registerInstallExperience } from '../../src/background/install-experience';

describe('install experience', () => {
  it('opens the full onboarding tab only after a fresh installation', async () => {
    let listener!: (details: { reason: string; previousVersion?: string }) => void;
    const create = vi.fn(async () => undefined);
    registerInstallExperience({
      onInstalled: { addListener(next) { listener = next; } },
      getURL: (path) => `chrome-extension://test/${path}`,
    }, { create }, '1.4.0');
    listener({ reason: 'update' });
    expect(create).not.toHaveBeenCalled();
    listener({ reason: 'install' });
    await vi.waitFor(() => expect(create).toHaveBeenCalledWith({ url: 'chrome-extension://test/onboarding.html?flow=welcome' }));
  });

  it('opens the one-time upgrade guide for every newer version with a known previous version', async () => {
    let listener!: (details: { reason: string; previousVersion?: string }) => void;
    const create = vi.fn(async () => undefined);
    registerInstallExperience({
      onInstalled: { addListener(next) { listener = next; } },
      getURL: (path) => `chrome-extension://test/${path}`,
    }, { create }, '1.4.0');
    listener({ reason: 'update', previousVersion: '1.3.3' });
    await vi.waitFor(() => expect(create).toHaveBeenCalledWith({ url: 'chrome-extension://test/onboarding.html?flow=upgrade&version=1.4.0' }));
  });

  it('does not open an upgrade guide for unknown, current, or malformed versions', async () => {
    let listener!: (details: { reason: string; previousVersion?: string }) => void;
    const create = vi.fn(async () => undefined);
    registerInstallExperience({
      onInstalled: { addListener(next) { listener = next; } },
      getURL: (path) => `chrome-extension://test/${path}`,
    }, { create }, '1.4.0');
    listener({ reason: 'update' });
    listener({ reason: 'update', previousVersion: '1.4.0' });
    listener({ reason: 'update', previousVersion: 'dev' });
    listener({ reason: 'update', previousVersion: '1.5.0' });
    listener({ reason: 'chrome_update', previousVersion: '1.3.3' });
    expect(create).not.toHaveBeenCalled();
  });
});
