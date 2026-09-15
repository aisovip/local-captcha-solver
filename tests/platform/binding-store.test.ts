import { describe, expect, it } from 'vitest';
import { createBindingStore, normalizeBinding, parseBindings, type CaptchaBinding } from '../../src/platform/binding-store';

const text: CaptchaBinding = { kind: 'text', scope: 'https://example.test/login', image: 'img.picture', field: '#answer' };

describe('binding storage', () => {
  it('serializes concurrent edits and preserves unrelated bindings across replacement and deletion', async () => {
    let saved: unknown;
    const store = createBindingStore({ getLocal: async <T>() => saved as T, setLocal: async (_key, value) => { saved = value; } });
    const slider: CaptchaBinding = { kind: 'slider', scope: text.scope, image: '#picture', track: '#rail', handle: '#knob' };
    await Promise.all([store.save(text), store.save(slider)]);
    expect(await store.read()).toHaveLength(2);
    await store.save({ ...text, field: '#new-answer' });
    expect(await store.read()).toContainEqual({ ...text, field: '#new-answer' });
    await store.remove(text.scope, 'text');
    expect(await store.read()).toEqual([slider]);
  });

  it('stores only locator metadata and isolates malformed entries', () => {
    expect(normalizeBinding({ ...text, value: 'secret', imageDataUrl: 'private' })).toEqual(text);
    expect(parseBindings([text, { ...text, scope: `${text.scope}?token=private` }, { ...text, kind: 'script' }, { ...text, field: 'a'.repeat(3000) }])).toEqual([text]);
    expect(() => normalizeBinding({ ...text, scope: 'javascript:alert(1)' })).toThrow();
  });
});
