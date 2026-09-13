import { describe, expect, it, vi } from 'vitest';
import { createImageCapture } from '../../src/background/image-capture';

const tab = { id: 4, windowId: 1, url: 'http://localhost:5173/login' };
const area = { left: 10, top: 20, width: 180, height: 64, viewportWidth: 800, viewportHeight: 600 };
function harness() {
  const query = vi.fn(async () => [tab]);
  const captureVisibleTab = vi.fn(async () => 'data:image/png;base64,AQ==');
  const crop = vi.fn(async () => 'data:image/png;base64,Ag==');
  const onActivated = { addListener: vi.fn(), removeListener: vi.fn() };
  const onUpdated = { addListener: vi.fn(), removeListener: vi.fn() };
  return { query, captureVisibleTab, crop, onActivated, onUpdated, capture: createImageCapture({ tabs: { query, captureVisibleTab, onActivated, onUpdated }, crop }) };
}

describe('visible CAPTCHA capture', () => {
  it('returns only the cropped CAPTCHA from the requesting active tab', async () => {
    const app = harness();
    await expect(app.capture.capture(tab, area)).resolves.toEqual({ state: 'ready', dataUrl: 'data:image/png;base64,Ag==' });
    expect(app.captureVisibleTab).toHaveBeenCalledWith(1, { format: 'png' });
    expect(app.crop).toHaveBeenCalledWith('data:image/png;base64,AQ==', area);
    expect(app.onActivated.removeListener).toHaveBeenCalledWith(app.onActivated.addListener.mock.calls[0][0]);
  });

  it('reports browser permission denial without invoking crop', async () => {
    const app = harness();
    app.captureVisibleTab.mockRejectedValue(new Error("Either the '<all_urls>' or 'activeTab' permission is required."));
    await expect(app.capture.capture(tab, area)).resolves.toEqual({ state: 'image_unavailable', reason: 'permission' });
    expect(app.crop).not.toHaveBeenCalled();
  });

  it('discards a capture if a tab is switched away and back while capturing', async () => {
    const app = harness();
    app.captureVisibleTab.mockImplementation(async () => { app.onActivated.addListener.mock.calls[0][0]({ tabId: 5, windowId: 1 }); return 'data:image/png;base64,AQ=='; });
    await expect(app.capture.capture(tab, area)).resolves.toEqual({ state: 'image_unavailable', reason: 'stale' });
    expect(app.crop).not.toHaveBeenCalled();
  });

  it('discards a result if the source page navigates while cropping', async () => {
    const app = harness();
    app.crop.mockImplementation(async () => { app.onUpdated.addListener.mock.calls[0][0](tab.id, { status: 'loading' }); return 'data:image/png;base64,Ag=='; });
    await expect(app.capture.capture(tab, area)).resolves.toEqual({ state: 'image_unavailable', reason: 'stale' });
  });

  it('does not capture another tab or an area extending outside the viewport', async () => {
    const app = harness();
    app.query.mockResolvedValue([{ ...tab, id: 5 }]);
    await expect(app.capture.capture(tab, area)).resolves.toMatchObject({ reason: 'stale' });
    await expect(app.capture.capture(tab, { ...area, left: 799 })).resolves.toMatchObject({ reason: 'viewport' });
    expect(app.captureVisibleTab).not.toHaveBeenCalled();
  });
});
