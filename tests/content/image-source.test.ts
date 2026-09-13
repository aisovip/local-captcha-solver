import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_CAPTCHA_IMAGE_PIXELS, MAX_IMAGE_BASE64_BYTES, MAX_IMAGE_BYTES } from '../../src/core/image-limits';
import { isInferenceRequest } from '../../src/ocr/protocol';
import { MAX_CAPTCHA_IMAGE_DIMENSION, acquireImage } from '../../src/content/image-source';

function image(src: string): HTMLImageElement {
  const element = document.createElement('img');
  element.src = src;
  element.width = 20;
  element.height = 10;
  Object.defineProperty(element, 'complete', { value: true });
  element.getBoundingClientRect = () => ({ left: 10, top: 20, width: 20, height: 10 }) as DOMRect;
  document.body.append(element);
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(element);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  return element;
}

function expectOcrImageDataUrl(dataUrl: string): void {
  expect(isInferenceRequest({
    type: 'ocr:recognize', requestId: 'request', imageRevision: 'revision', imageDataUrl: dataUrl, modes: ['digits'],
  })).toBe(true);
}

describe('acquireImage', () => {
  afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });
  it('acquires image data URLs and produces a stable SHA-256 revision', async () => {
    const result = await acquireImage(image('data:image/png;base64,AQID'));

    expect(result).toEqual({
      state: 'ready',
      dataUrl: 'data:image/png;base64,AQID',
      mimeType: 'image/png',
      revision: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
    });
  });

  it.each([
    {} as Pick<Crypto, 'subtle'>,
    { subtle: { digest: vi.fn(async () => { throw new Error('digest failed'); }) } } as unknown as Pick<Crypto, 'subtle'>,
  ])('uses the local SHA-256 fallback when Web Crypto is unavailable', async (crypto) => {
    await expect(acquireImage(image('data:image/png;base64,AQID'), { crypto })).resolves.toEqual({
      state: 'ready',
      dataUrl: 'data:image/png;base64,AQID',
      mimeType: 'image/png',
      revision: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
    });
  });

  it('accepts case-insensitive base64 data URLs and rejects malformed encoded data', async () => {
    await expect(acquireImage(image('data:image/png;BASE64,AQID'))).resolves.toMatchObject({
      state: 'ready', mimeType: 'image/png',
    });
    await expect(acquireImage(image('data:image/png,%zz'))).resolves.toEqual({
      state: 'image_unavailable', reason: 'type',
    });
  });

  it('normalizes parameterized and percent-encoded data URLs for the OCR protocol', async () => {
    const result = await acquireImage(image('data:image/png;charset=utf-8,%01%02%03'));

    expect(result).toMatchObject({ state: 'ready', dataUrl: 'data:image/png;base64,AQID', mimeType: 'image/png' });
    if (result.state === 'ready') expectOcrImageDataUrl(result.dataUrl);
  });

  it('preserves high-octet percent-encoded image bytes', async () => {
    const result = await acquireImage(image('data:image/png,%89PNG%0D%0A%1A%0A'));

    expect(result).toMatchObject({ state: 'ready', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' });
    if (result.state === 'ready') expectOcrImageDataUrl(result.dataUrl);
  });

  it.each(['%', '%0', '%GG'])('rejects malformed percent-encoded image bytes: %s', async (payload) => {
    await expect(acquireImage(image(`data:image/png,${payload}`))).resolves.toEqual({
      state: 'image_unavailable', reason: 'type',
    });
  });

  it('acquires blob URLs through its injected fetch primitive', async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([4, 5]), { headers: { 'content-type': 'image/gif; charset=binary' } }));

    const result = await acquireImage(image('blob:https://page.example.test/captcha'), { fetch });
    expect(result).toMatchObject({
      state: 'ready', dataUrl: 'data:image/gif;base64,BAU=', mimeType: 'image/gif',
      revision: '2fa1b377bf67309f65e5e7bc9d924345ca648dec4e601a398a9cb497dcba3765',
    });
    if (result.state === 'ready') expectOcrImageDataUrl(result.dataUrl);
  });

  it('bounds blob streams before reading an oversized response into an ArrayBuffer', async () => {
    const cancel = vi.fn(async () => undefined);
    const reader = {
      read: vi.fn(async () => ({ done: false, value: new Uint8Array(MAX_IMAGE_BYTES + 1) })),
      cancel,
    };
    const response = {
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      body: { getReader: () => reader },
      arrayBuffer: vi.fn(async () => { throw new Error('must not read whole body'); }),
    } as unknown as Response;

    await expect(acquireImage(image('blob:https://page.example.test/captcha'), { fetch: async () => response })).resolves.toEqual({
      state: 'image_unavailable', reason: 'size',
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('converts a CORS-readable cross-origin image with the canvas before permission fallback', async () => {
    const toDataUrl = vi.fn(() => 'data:image/jpeg;base64,Bgc=');
    const capture = vi.fn();

    const result = await acquireImage(image('https://cdn.example.test/captcha.jpg'), {
      toDataUrl, capture,
    });
    expect(result).toMatchObject({
      state: 'ready', mimeType: 'image/jpeg',
      revision: '4e399d0536e9eb556ea05e7c19f52034fc44dc7eea2f3b5af2da5336ca9c9cf1',
    });
    if (result.state === 'ready') expectOcrImageDataUrl(result.dataUrl);
    expect(toDataUrl).toHaveBeenCalledOnce();
    expect(capture).not.toHaveBeenCalled();
  });

  it('uses the permission-aware fallback only after a tainted canvas failure', async () => {
    const capture = vi.fn(async () => ({ state: 'image_unavailable' as const, reason: 'permission' as const }));

    await expect(acquireImage(image('https://cdn.example.test/captcha.jpg'), {
      toDataUrl: () => { throw new DOMException('tainted canvas', 'SecurityError'); },
      capture,
    })).resolves.toEqual({ state: 'image_unavailable', reason: 'permission' });
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ left: 10, top: 20, width: 20, height: 10 }));
  });

  it('does not trust a capture result with a non-image MIME type', async () => {
    await expect(acquireImage(image('https://cdn.example.test/captcha'), {
      toDataUrl: () => { throw new DOMException('tainted canvas', 'SecurityError'); },
      capture: async () => ({ state: 'ready', dataUrl: 'data:text/plain;base64,AQ==' }),
    })).resolves.toEqual({ state: 'image_unavailable', reason: 'type' });
  });

  it('returns a SHA-256 revision for a successful capture', async () => {
    const result = await acquireImage(image('https://cdn.example.test/captcha'), {
      toDataUrl: () => { throw new DOMException('tainted canvas', 'SecurityError'); },
      capture: async () => ({ state: 'ready', dataUrl: 'data:image/png;base64,CAk=' }),
    });
    expect(result).toEqual({
      state: 'ready', dataUrl: 'data:image/png;base64,CAk=', mimeType: 'image/png',
      revision: '73907589101a7e8ab83178e7db2997aab7272cd02d364e8e3ecc2beccda4b631',
    });
    if (result.state === 'ready') expectOcrImageDataUrl(result.dataUrl);
  });

  it('rejects giant natural dimensions before calling the canvas converter', async () => {
    const candidate = image('https://cdn.example.test/captcha.jpg');
    Object.defineProperty(candidate, 'naturalWidth', { configurable: true, value: MAX_CAPTCHA_IMAGE_DIMENSION + 1 });
    Object.defineProperty(candidate, 'naturalHeight', { configurable: true, value: 1 });
    const toDataUrl = vi.fn(() => 'data:image/png;base64,AQ==');

    await expect(acquireImage(candidate, { toDataUrl })).resolves.toEqual({ state: 'image_unavailable', reason: 'size' });
    expect(toDataUrl).not.toHaveBeenCalled();
  });

  it('rejects dimensions beyond the canvas pixel budget before calling the converter', async () => {
    const candidate = image('https://cdn.example.test/captcha.jpg');
    Object.defineProperty(candidate, 'naturalWidth', { configurable: true, value: MAX_CAPTCHA_IMAGE_DIMENSION });
    Object.defineProperty(candidate, 'naturalHeight', { configurable: true, value: Math.floor(MAX_CAPTCHA_IMAGE_PIXELS / MAX_CAPTCHA_IMAGE_DIMENSION) + 1 });
    const toDataUrl = vi.fn(() => 'data:image/png;base64,AQ==');

    await expect(acquireImage(candidate, { toDataUrl })).resolves.toEqual({ state: 'image_unavailable', reason: 'size' });
    expect(toDataUrl).not.toHaveBeenCalled();
  });

  it('maps a capture message failure to network', async () => {
    await expect(acquireImage(image('https://cdn.example.test/captcha'), {
      toDataUrl: () => { throw new DOMException('tainted canvas', 'SecurityError'); },
      capture: async () => { throw new Error('message disconnected'); },
    })).resolves.toEqual({ state: 'image_unavailable', reason: 'network' });
  });

  it('rejects a non-image data URL', async () => {
    await expect(acquireImage(image('data:text/plain;base64,AA=='))).resolves.toEqual({ state: 'image_unavailable', reason: 'type' });
  });

  it('discards a capture after the image changes or the page scrolls', async () => {
    for (const change of ['image', 'scroll']) {
      const candidate = image('https://cdn.example.test/captcha');
      const result = await acquireImage(candidate, {
        toDataUrl: () => { throw new DOMException('tainted canvas', 'SecurityError'); },
        capture: async () => {
          if (change === 'image') candidate.src = 'https://cdn.example.test/refreshed';
          else window.dispatchEvent(new Event('scroll'));
          return { state: 'ready', dataUrl: 'data:image/png;base64,AQID' };
        },
      });
      expect(result).toEqual({ state: 'image_unavailable', reason: 'stale' });
    }
  });

  it('does not capture an image covered by another element', async () => {
    const candidate = image('https://cdn.example.test/captcha');
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(document.body);
    const capture = vi.fn();
    await expect(acquireImage(candidate, {
      toDataUrl: () => { throw new DOMException('tainted canvas', 'SecurityError'); }, capture,
    })).resolves.toEqual({ state: 'image_unavailable', reason: 'viewport' });
    expect(capture).not.toHaveBeenCalled();
  });

  it('rejects a data URL whose decoded payload exceeds the raw byte limit', async () => {
    await expect(acquireImage(image(`data:image/png;base64,${'A'.repeat(MAX_IMAGE_BASE64_BYTES)}`))).resolves.toEqual({
      state: 'image_unavailable', reason: 'size',
    });
  });
});
