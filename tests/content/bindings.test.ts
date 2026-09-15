import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindingScope, type CaptchaBinding } from '../../src/platform/binding-store';
import { pageBinding, resolveSliderBinding, resolveTextBinding, selectorForBinding } from '../../src/content/binding-targets';
import { createCaptchaWorkflow } from '../../src/content/workflow';
import { observeCaptchaImages } from '../../src/content/observer';
import { discoverSliderChallenge } from '../../src/slider/challenge-discovery';
import { startBindingPicker } from '../../src/content/binding-picker';

afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); });

const binding: Extract<CaptchaBinding, { kind: 'text' }> = { kind: 'text', scope: 'https://example.test/login', image: 'img.picture', field: 'input[name=answer]' };
const markup = '<div id="dialog"><img class="picture" width="120" height="40" src="data:image/png;base64,AQ=="><input name="answer"><input aria-label="captcha" id="distractor"></div>';
const acquire = async () => ({ state: 'ready' as const, dataUrl: 'data:image/png;base64,AQ==', mimeType: 'image/png', revision: 'r1' });

describe('saved CAPTCHA targets', () => {
  it('locates a recreated popup with a refreshed image and rejects duplicate visible targets', () => {
    document.body.innerHTML = markup;
    const original = resolveTextBinding(binding)!;
    const selector = selectorForBinding(original.image)!;
    expect(selector).not.toContain('src');
    document.body.innerHTML = markup;
    const recreated = resolveTextBinding({ ...binding, image: selector })!;
    expect(recreated.image).not.toBe(original.image);
    recreated.image.src = 'data:image/png;base64,Ag==';
    expect(resolveTextBinding(binding)?.image).toBe(recreated.image);
    recreated.image.after(recreated.image.cloneNode());
    expect(resolveTextBinding(binding)).toBeUndefined();
  });

  it('remembers the CAPTCHA input among repeated login fields and rejects ambiguous replacements', async () => {
    const loginMarkup = `<form class="login-form">
      <div class="form-item"><div class="form-input"><input class="input-inner" type="text" placeholder="账号"></div></div>
      <div class="form-item"><div class="form-input"><input class="input-inner" type="password" placeholder="密码"></div></div>
      <div class="form-item"><div class="form-input"><input class="input-inner" type="text" placeholder="验证码"></div><img class="login-code-img" width="100" height="40"></div>
    </form>`;
    document.body.innerHTML = loginMarkup;
    const originalField = document.querySelector<HTMLInputElement>('input[placeholder="验证码"]')!;
    originalField.value = 'user-entered-answer';
    const save = vi.fn(async (_binding: CaptchaBinding) => undefined);
    const record = vi.fn();
    const stop = startBindingPicker({
      kind: 'text', locale: 'zh_CN',
      validate: async (value) => value.kind === 'text' && resolveTextBinding(value)?.field === originalField,
      save, record, onFinish: () => undefined,
    });
    try {
      const shadow = document.querySelector('[data-local-captcha-binding]')!.shadowRoot!;
      shadow.querySelector<HTMLButtonElement>('[data-start]')!.click();
      document.querySelector<HTMLImageElement>('img')!.click();
      originalField.click();
      expect(shadow.querySelector<HTMLButtonElement>('[data-save]')!.hidden).toBe(false);
      shadow.querySelector<HTMLButtonElement>('[data-save]')!.click();
      await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
      const saved = save.mock.calls[0]![0] as Extract<CaptchaBinding, { kind: 'text' }>;
      expect(JSON.stringify(saved)).not.toContain(originalField.value);
      expect(record.mock.calls.map(([event]) => [event.event, event.step])).toEqual([
        ['started', 'image'], ['selected', 'image'], ['selected', 'field'], ['saved', 'confirm'],
      ]);
      expect(record.mock.calls[2]![0]).toMatchObject({ strategy: 'placeholder', closestMatchCount: 1, tag: 'input', attributes: ['placeholder', 'class'] });
      expect(new Set(record.mock.calls.map(([event]) => event.attemptId)).size).toBe(1);
      for (const value of ['user-entered-answer', '验证码', 'login-code-img']) expect(JSON.stringify(record.mock.calls)).not.toContain(value);

      document.body.innerHTML = loginMarkup;
      const recreatedField = document.querySelector<HTMLInputElement>('input[placeholder="验证码"]')!;
      const row = recreatedField.closest('.form-item')!;
      row.parentElement!.prepend(row);
      expect(resolveTextBinding(saved)?.field).toBe(recreatedField);
      expect(recreatedField).not.toBe(originalField);

      row.after(row.cloneNode(true));
      expect(resolveTextBinding(saved)).toBeUndefined();
      expect(selectorForBinding(recreatedField)).toBeUndefined();
    } finally { stop(); }
  });

  it('records selection and save failures, back, and cancellation without page data', async () => {
    document.body.innerHTML = '<img class="picture"><div><input class="same"></div><div><input class="same"></div>';
    const record = vi.fn();
    const save = vi.fn(async () => { throw new Error('SECRET storage error'); });
    const stop = startBindingPicker({ kind: 'text', locale: 'en', validate: async () => true, save, record, onFinish: () => undefined });
    try {
      const shadow = document.querySelector('[data-local-captcha-binding]')!.shadowRoot!;
      const image = document.querySelector('img')!;
      const field = document.querySelector('input')!;
      shadow.querySelector<HTMLButtonElement>('[data-start]')!.click();
      image.click();
      field.click();
      expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'rejected', step: 'field', reason: 'selector-unavailable', tag: 'input', attributes: ['class'], sameTagCount: 2, closestMatchCount: 2 }));
      expect(shadow.querySelector('[data-error]')!.textContent).toContain('Settings → Diagnostics');
      shadow.querySelector<HTMLButtonElement>('[data-back]')!.click();
      expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'back', step: 'image' }));
      image.click();
      field.placeholder = 'SECRET field label';
      field.value = 'SECRET typed content';
      field.click();
      shadow.querySelector<HTMLButtonElement>('[data-save]')!.click();
      await vi.waitFor(() => expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'failed', step: 'confirm', reason: 'save-failed' })));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'cancelled', reason: 'escape' }));
      expect(JSON.stringify(record.mock.calls)).not.toContain('SECRET');
    } finally { stop(); }
  });

  it('scopes bindings to the origin and path while discarding query parameters and fragments', () => {
    expect(bindingScope('https://example.test/login?token=private#password')).toBe(binding.scope);
    expect(pageBinding([binding], 'text', 'https://example.test/login?q=next')).toEqual(binding);
    for (const url of ['http://example.test/login', 'https://example.test:8443/login', 'https://example.test/account']) expect(pageBinding([binding], 'text', url)).toBeUndefined();
  });

  it('rejects hidden, disabled, and password inputs', () => {
    document.body.innerHTML = markup;
    const field = resolveTextBinding(binding)!.field as HTMLInputElement;
    field.type = 'password';
    expect(resolveTextBinding(binding)).toBeUndefined();
    field.type = 'text';
    field.disabled = true;
    expect(resolveTextBinding(binding)).toBeUndefined();
    field.disabled = false;
    document.querySelector<HTMLElement>('#dialog')!.hidden = true;
    expect(resolveTextBinding(binding)).toBeUndefined();
  });

  it.each(['fill', 'low-confidence', 'disabled-fill', 'nonempty'] as const)('uses the bound field with the existing %s policy', async (mode) => {
    document.body.innerHTML = markup;
    const { image, field } = resolveTextBinding(binding)!;
    if (mode === 'nonempty') field.value = 'user input';
    const workflow = createCaptchaWorkflow({
      acquire,
      boundField: () => resolveTextBinding(binding)?.field ?? null,
      autoFillEnabled: () => mode !== 'disabled-fill',
      recognize: async () => [{ mode: 'digits', text: '8642', confidence: mode === 'low-confidence' ? .1 : .99 }],
    });
    await expect(workflow.run(image, 'automatic')).resolves.toMatchObject({ state: mode === 'fill' ? 'filled' : 'needs_confirmation' });
    expect(field.value).toBe(mode === 'fill' ? '8642' : mode === 'nonempty' ? 'user input' : '');
    expect(document.querySelector<HTMLInputElement>('#distractor')!.value).toBe('');
  });

  it('discards an OCR result if the bound input is replaced while recognition is running', async () => {
    document.body.innerHTML = markup;
    const { image, field } = resolveTextBinding(binding)!;
    const workflow = createCaptchaWorkflow({
      acquire,
      boundField: () => resolveTextBinding(binding)?.field ?? null,
      recognize: async () => {
        field.replaceWith(field.cloneNode());
        return [{ mode: 'digits', text: '8642', confidence: .99 }];
      },
    });
    await expect(workflow.run(image, 'automatic')).resolves.toMatchObject({ state: 'stale' });
    expect(resolveTextBinding(binding)!.field.value).toBe('');
  });

  it('waits for the bound popup instead of processing another candidate', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<form>captcha<img alt="captcha" width="120" height="40"><input aria-label="captcha"></form>';
    const run = vi.fn(async () => ({ state: 'filled' as const, candidateId: 'image', fieldId: 'field', displayText: '8642', fillValue: '8642' }));
    const observer = observeCaptchaImages({ run }, document, { boundImage: () => resolveTextBinding(binding)?.image ?? null });
    expect(run).not.toHaveBeenCalled();
    document.body.insertAdjacentHTML('beforeend', markup);
    await vi.advanceTimersByTimeAsync(200);
    expect(run).toHaveBeenCalledExactlyOnceWith(resolveTextBinding(binding)!.image, 'automatic');
    observer.disconnect();
  });

  it('discovers explicitly selected slider parts without CAPTCHA naming hints and rechecks geometry', async () => {
    document.body.innerHTML = '<section><img id="picture" src="data:image/png;base64,AQ=="><div id="rail"><div id="knob"></div></div></section>';
    const image = document.querySelector('#picture')!;
    const track = document.querySelector('#rail')!;
    const handle = document.querySelector('#knob')!;
    for (const [element, y, width, height] of [[image, 20, 300, 160], [track, 190, 300, 40], [handle, 190, 40, 40]] as const) {
      element.getBoundingClientRect = () => ({ x: 20, y, width, height, left: 20, top: y, right: 20 + width, bottom: y + height, toJSON: () => ({}) });
    }
    const rule: CaptchaBinding = { kind: 'slider', scope: binding.scope, image: '#picture', track: '#rail', handle: '#knob' };
    await expect(discoverSliderChallenge()).resolves.toMatchObject({ state: 'not-found' });
    const parts = resolveSliderBinding(rule)!;
    await expect(discoverSliderChallenge(document, parts)).resolves.toMatchObject({ state: 'ready', challenge: { handle: { width: 40 }, image: { width: 300 } } });
    handle.getBoundingClientRect = () => ({ x: 500, y: 190, width: 40, height: 40, left: 500, top: 190, right: 540, bottom: 230, toJSON: () => ({}) });
    await expect(discoverSliderChallenge(document, parts)).resolves.toEqual({ state: 'unsupported' });
  });

  it('intercepts selection clicks, saves only on confirmation, and removes its UI on Escape', async () => {
    document.body.innerHTML = markup;
    const save = vi.fn(async () => undefined);
    const onFinish = vi.fn();
    const pageClick = vi.fn();
    document.querySelector('img')!.addEventListener('click', pageClick);
    const stop = startBindingPicker({ kind: 'text', locale: 'en', validate: async () => true, save, onFinish, record: () => { throw new Error('Recorder unavailable'); } });
    document.querySelector('[data-local-captcha-binding]')!.shadowRoot!.querySelector<HTMLButtonElement>('[data-start]')!.click();
    (document.querySelector('img') as HTMLElement).click();
    document.querySelector<HTMLInputElement>('input')!.click();
    expect(pageClick).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    const shadow = document.querySelector('[data-local-captcha-binding]')!.shadowRoot!;
    expect(shadow.textContent).toContain('Check your targets');
    shadow.querySelector<HTMLButtonElement>('[data-save]')!.click();
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(document.querySelector('[data-local-captcha-binding]')).toBeNull());
    stop();
    expect(onFinish).toHaveBeenCalledOnce();
    startBindingPicker({ kind: 'text', locale: 'en', validate: async () => true, save, onFinish });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[data-local-captcha-binding]')).toBeNull();
    expect(save).toHaveBeenCalledOnce();
  });

  it('cancels selection when the page replaces its dialog', async () => {
    document.body.innerHTML = `<dialog>${markup}</dialog>`;
    const dialog = document.querySelector<HTMLDialogElement>('dialog')!;
    dialog.showModal();
    const save = vi.fn(async () => undefined);
    const onFinish = vi.fn();
    startBindingPicker({ kind: 'text', locale: 'en', validate: async () => true, save, onFinish });
    document.body.replaceChildren();
    await vi.waitFor(() => expect(onFinish).toHaveBeenCalledOnce());
    expect(save).not.toHaveBeenCalled();
  });
});
