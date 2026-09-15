import type { BrowserAdapter } from './browser-adapter';
import { hostnameForPage } from './settings-store';

export const BINDINGS_STORAGE_KEY = 'captcha-bindings';
export type BindingKind = 'text' | 'slider';
export type CaptchaBinding = { scope: string; image: string } & (
  | { kind: 'text'; field: string }
  | { kind: 'slider'; handle: string; track: string }
);

export function bindingScope(pageUrl: string): string {
  hostnameForPage(pageUrl);
  const url = new URL(pageUrl);
  return `${url.origin}${url.pathname}`;
}

export function isBindingKind(value: unknown): value is BindingKind {
  return value === 'text' || value === 'slider';
}

export function normalizeBinding(value: unknown): CaptchaBinding {
  if (value === null || typeof value !== 'object') throw new Error('Invalid CAPTCHA binding');
  const binding = value as Record<string, unknown>;
  const selector = (key: string): string => {
    const value = binding[key];
    if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\u0000-\u001f]/.test(value)) throw new Error('Invalid element selector');
    return value;
  };
  if (typeof binding.scope !== 'string' || binding.scope.length > 2048 || bindingScope(binding.scope) !== binding.scope) throw new Error('Invalid binding scope');
  const base = { scope: binding.scope, image: selector('image') };
  if (binding.kind === 'text') return { ...base, kind: 'text', field: selector('field') };
  if (binding.kind === 'slider') return { ...base, kind: 'slider', handle: selector('handle'), track: selector('track') };
  throw new Error('Invalid binding kind');
}

export function parseBindings(value: unknown): CaptchaBinding[] {
  if (!Array.isArray(value)) return [];
  const bindings = new Map<string, CaptchaBinding>();
  for (const item of value.slice(0, 200)) {
    try {
      const binding = normalizeBinding(item);
      bindings.set(`${binding.scope}|${binding.kind}`, binding);
    } catch { /* Invalid entries must not disable other saved bindings. */ }
  }
  return [...bindings.values()];
}

export interface BindingStore {
  read(): Promise<CaptchaBinding[]>;
  save(binding: CaptchaBinding): Promise<void>;
  remove(scope: string, kind: BindingKind): Promise<void>;
}

export function createBindingStore(adapter: Pick<BrowserAdapter, 'getLocal' | 'setLocal'>): BindingStore {
  const read = async () => parseBindings(await adapter.getLocal(BINDINGS_STORAGE_KEY));
  let queue = Promise.resolve();
  const mutate = (update: (bindings: CaptchaBinding[]) => CaptchaBinding[]) => {
    const next = queue.catch(() => undefined).then(async () => {
      await adapter.setLocal(BINDINGS_STORAGE_KEY, update(await read()));
    });
    queue = next;
    return next;
  };
  return {
    read,
    save(value) {
      const binding = normalizeBinding(value);
      return mutate((bindings) => {
        const retained = bindings.filter((item) => item.scope !== binding.scope || item.kind !== binding.kind);
        if (retained.length >= 200) throw new Error('Binding storage is full');
        return [...retained, binding];
      });
    },
    remove(scope, kind) {
      if (bindingScope(scope) !== scope || !isBindingKind(kind)) throw new Error('Invalid binding');
      return mutate((bindings) => bindings.filter((item) => item.scope !== scope || item.kind !== kind));
    },
  };
}
