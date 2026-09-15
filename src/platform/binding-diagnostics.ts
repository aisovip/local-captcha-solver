import { isBindingKind, type BindingKind } from './binding-store';

export const BINDING_ATTRIBUTES = ['id', 'data-testid', 'data-test', 'name', 'aria-label', 'placeholder', 'class'] as const;
const TAGS = ['input', 'textarea', 'img', 'canvas', 'button', 'div', 'span', 'label', 'form', 'other'] as const;
const INPUT_TYPES = ['text', 'password', 'search', 'email', 'tel', 'url', 'number', 'hidden', 'checkbox', 'radio', 'submit', 'button', 'other'] as const;
const STEPS = ['intro', 'image', 'field', 'handle', 'track', 'confirm'] as const;
const EVENTS = ['started', 'selected', 'rejected', 'back', 'saved', 'cancelled', 'failed'] as const;
const REASONS = ['ineligible-target', 'selector-unavailable', 'page-changed', 'target-changed', 'validation-failed', 'save-failed', 'escape', 'cancel', 'page-closed', 'interrupted'] as const;
const STRATEGIES = [...BINDING_ATTRIBUTES, 'tag', 'ancestor'] as const;

export interface BindingTargetDiagnostic {
  tag?: typeof TAGS[number];
  inputType?: typeof INPUT_TYPES[number];
  attributes?: readonly typeof BINDING_ATTRIBUTES[number][];
  connected?: boolean;
  visible?: boolean;
  sameTagCount?: number;
  selectorAttempts?: number;
  closestMatchCount?: number;
  strategy?: typeof STRATEGIES[number];
}

export interface BindingDiagnostic extends BindingTargetDiagnostic {
  attemptId: string;
  kind: BindingKind;
  step: typeof STEPS[number];
  event: typeof EVENTS[number];
  reason?: typeof REASONS[number];
}

function member<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

export function parseBindingDiagnostic(value: unknown): BindingDiagnostic | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  if (!isBindingKind(item.kind) || !member(STEPS, item.step) || !member(EVENTS, item.event)
    || typeof item.attemptId !== 'string' || !/^[a-z0-9]{1,16}-[a-z0-9]{1,12}$/.test(item.attemptId)) return undefined;
  const attributes = item.attributes;
  const count = (key: string) => typeof item[key] === 'number' && Number.isInteger(item[key]) && item[key] >= 0 && item[key] <= 100_000 ? item[key] : undefined;
  return {
    attemptId: item.attemptId, kind: item.kind, step: item.step, event: item.event,
    ...(member(REASONS, item.reason) ? { reason: item.reason } : {}),
    ...(member(TAGS, item.tag) ? { tag: item.tag } : {}),
    ...(member(INPUT_TYPES, item.inputType) ? { inputType: item.inputType } : {}),
    ...(Array.isArray(attributes) ? { attributes: BINDING_ATTRIBUTES.filter(attribute => attributes.includes(attribute)) } : {}),
    ...(typeof item.connected === 'boolean' ? { connected: item.connected } : {}),
    ...(typeof item.visible === 'boolean' ? { visible: item.visible } : {}),
    ...(count('sameTagCount') === undefined ? {} : { sameTagCount: count('sameTagCount') }),
    ...(count('selectorAttempts') === undefined ? {} : { selectorAttempts: count('selectorAttempts') }),
    ...(count('closestMatchCount') === undefined ? {} : { closestMatchCount: count('closestMatchCount') }),
    ...(member(STRATEGIES, item.strategy) ? { strategy: item.strategy } : {}),
  };
}

export function bindingDiagnosticMessage(binding: BindingDiagnostic, locale = 'zh_CN'): string {
  const messages = {
    zh_CN: { started: '已开始手动绑定', selected: '已选中绑定目标', rejected: '未能选中绑定目标', back: '手动绑定返回上一步', saved: '手动绑定已保存', cancelled: '手动绑定已取消', failed: '手动绑定未能保存' },
    en: { started: 'Manual binding started', selected: 'Binding target selected', rejected: 'Binding target could not be selected', back: 'Returned to the previous binding step', saved: 'Manual binding saved', cancelled: 'Manual binding cancelled', failed: 'Manual binding could not be saved' },
  };
  return messages[locale === 'en' ? 'en' : 'zh_CN'][binding.event];
}
