import { IMAGE_CAPTURE_ORIGINS } from '../platform/permissions';
import { hostnameForPage, type SettingsStore } from '../platform/settings-store';

export interface PendingImageAccess { requestId: string; imageOrigin: string; }
export interface ImageAccessDetails extends PendingImageAccess { tabId: number; pageUrl: string; pageHostname: string; }
export interface ImageAccessAdapter {
  permissions: { contains(details: { origins: readonly string[] }): Promise<boolean> };
  settings: Pick<SettingsStore, 'setAccessMode'>;
  reconcile(): Promise<void>;
  tabs: {
    get(tabId: number): Promise<{ id?: number; url?: string }>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
  openDialog(tabId: number): Promise<unknown>;
}

export function isPendingImageAccess(value: unknown): value is PendingImageAccess {
  if (typeof value !== 'object' || value === null) return false;
  const pending = value as PendingImageAccess;
  if (typeof pending.requestId !== 'string' || pending.requestId.length === 0 || pending.requestId.length > 100 || typeof pending.imageOrigin !== 'string') return false;
  try { hostnameForPage(pending.imageOrigin); return new URL(pending.imageOrigin).origin === pending.imageOrigin; } catch { return false; }
}

export interface ImageAccess {
  open(tabId: number): Promise<boolean>;
  details(tabId: number): Promise<ImageAccessDetails | undefined>;
  complete(details: { tabId: number; pageUrl: string; requestId: string; scope: 'site' | 'all' }): Promise<{ granted: boolean; reason?: 'permission' | 'stale' | 'settings' }>;
}

export function createImageAccess(adapter: ImageAccessAdapter): ImageAccess {
  const details = async (tabId: number): Promise<ImageAccessDetails | undefined> => {
    if (!Number.isSafeInteger(tabId) || tabId < 0) return undefined;
    try {
      const tab = await adapter.tabs.get(tabId);
      if (typeof tab.url !== 'string') return undefined;
      const pageHostname = hostnameForPage(tab.url);
      const pending = await adapter.tabs.sendMessage(tabId, { type: 'captcha:get-image-access' });
      return isPendingImageAccess(pending) ? { tabId, pageUrl: tab.url, pageHostname, ...pending } : undefined;
    } catch { return undefined; }
  };
  return {
    details,
    async open(tabId) {
      if (await details(tabId) === undefined) return false;
      try { await adapter.openDialog(tabId); return true; } catch { return false; }
    },
    async complete(request) {
      if (request.scope !== 'site' && request.scope !== 'all') return { granted: false, reason: 'settings' };
      const current = await details(request.tabId);
      if (current === undefined || current.pageUrl !== request.pageUrl || current.requestId !== request.requestId) return { granted: false, reason: 'stale' };
      if (!await adapter.permissions.contains({ origins: IMAGE_CAPTURE_ORIGINS }).catch(() => false)) return { granted: false, reason: 'permission' };
      try {
        await adapter.settings.setAccessMode(request.scope === 'all' ? 'all' : 'selected', current.pageHostname);
        await adapter.reconcile();
      } catch { return { granted: false, reason: 'settings' }; }
      // The content script checks its request again after navigation or an image refresh.
      await adapter.tabs.sendMessage(request.tabId, { type: 'captcha:retry-image', requestId: request.requestId }).catch(() => undefined);
      return { granted: true };
    },
  };
}
