import { isImageCaptureArea, type ImageCaptureArea, type ImageCaptureResult } from '../core/image-capture';
import { MAX_CAPTCHA_IMAGE_DIMENSION, MAX_CAPTCHA_IMAGE_PIXELS, MAX_IMAGE_BYTES } from '../core/image-limits';

export interface CaptureTab { id: number; url: string; windowId: number; }
export interface ImageCaptureAdapter {
  tabs: {
    query(details: { active: true; windowId: number }): Promise<readonly { id?: number; url?: string }[]>;
    captureVisibleTab(windowId: number, options: { format: 'png' }): Promise<string>;
    onActivated: { addListener(listener: (info: { tabId: number; windowId: number }) => void): void; removeListener(listener: (info: { tabId: number; windowId: number }) => void): void };
    onUpdated: { addListener(listener: (tabId: number, change: { url?: string; status?: string }) => void): void; removeListener(listener: (tabId: number, change: { url?: string; status?: string }) => void): void };
  };
  crop?(dataUrl: string, area: ImageCaptureArea): Promise<string>;
}

export interface ImageCapture { capture(tab: CaptureTab, area: ImageCaptureArea): Promise<ImageCaptureResult>; }

export async function cropCapture(dataUrl: string, area: ImageCaptureArea): Promise<string> {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  try {
    const scaleX = bitmap.width / area.viewportWidth;
    const scaleY = bitmap.height / area.viewportHeight;
    const width = Math.round(area.width * scaleX);
    const height = Math.round(area.height * scaleY);
    if (width <= 0 || height <= 0 || width > MAX_CAPTCHA_IMAGE_DIMENSION || height > MAX_CAPTCHA_IMAGE_DIMENSION || width * height > MAX_CAPTCHA_IMAGE_PIXELS) throw new RangeError('Capture dimensions exceed image limits');
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Canvas is unavailable');
    context.drawImage(bitmap, area.left * scaleX, area.top * scaleY, area.width * scaleX, area.height * scaleY, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    if (blob.size > MAX_IMAGE_BYTES) throw new RangeError('Capture exceeds image byte limit');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return `data:image/png;base64,${btoa(binary)}`;
  } finally { bitmap.close(); }
}

export function createImageCapture(adapter: ImageCaptureAdapter): ImageCapture {
  let queue: Promise<void> = Promise.resolve();
  let lastCaptureAt = 0;
  const capture = async (tab: CaptureTab, area: ImageCaptureArea): Promise<ImageCaptureResult> => {
    if (!isImageCaptureArea(area)) return { state: 'image_unavailable', reason: 'viewport' };
    let changed = false;
    const activated = (info: { tabId: number; windowId: number }) => { if (info.windowId === tab.windowId && info.tabId !== tab.id) changed = true; };
    const updated = (tabId: number, change: { url?: string; status?: string }) => {
      if (tabId === tab.id && (change.url !== undefined || change.status === 'loading')) changed = true;
    };
    const current = async () => (await adapter.tabs.query({ active: true, windowId: tab.windowId })).some((item) => item.id === tab.id && item.url === tab.url);
    adapter.tabs.onActivated.addListener(activated);
    adapter.tabs.onUpdated.addListener(updated);
    try {
      // Chrome limits visible-tab captures to two calls per second.
      const delay = Math.max(0, lastCaptureAt + 550 - Date.now());
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      if (changed || !await current()) return { state: 'image_unavailable', reason: 'stale' };
      let screenshot: string;
      try {
        lastCaptureAt = Date.now();
        screenshot = await adapter.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      } catch (error) {
        const permission = /permission|activeTab|all_urls|not allowed|denied/i.test(error instanceof Error ? error.message : String(error));
        return { state: 'image_unavailable', reason: permission ? 'permission' : 'network' };
      }
      if (changed || !await current()) return { state: 'image_unavailable', reason: 'stale' };
      const dataUrl = await (adapter.crop ?? cropCapture)(screenshot, area);
      if (changed || !await current()) return { state: 'image_unavailable', reason: 'stale' };
      return { state: 'ready', dataUrl };
    } catch (error) {
      return { state: 'image_unavailable', reason: error instanceof RangeError ? 'size' : 'network' };
    } finally {
      adapter.tabs.onActivated.removeListener(activated);
      adapter.tabs.onUpdated.removeListener(updated);
    }
  };
  return {
    capture(tab, area) {
      const result = queue.then(() => capture(tab, area));
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}
