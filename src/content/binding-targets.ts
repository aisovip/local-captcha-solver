import { bindingScope, type BindingKind, type CaptchaBinding } from '../platform/binding-store';
import { isVisible } from './dom-snapshot';
import { isEligibleField, type TextFieldElement } from './field-fill';
import { BINDING_ATTRIBUTES, type BindingTargetDiagnostic } from '../platform/binding-diagnostics';

export function pageBinding<K extends BindingKind>(bindings: readonly CaptchaBinding[], kind: K, pageUrl = location.href): Extract<CaptchaBinding, { kind: K }> | undefined {
  return bindings.find((binding) => binding.kind === kind && binding.scope === bindingScope(pageUrl)) as Extract<CaptchaBinding, { kind: K }> | undefined;
}

function visibleBindingMatches(selector: string, root: ParentNode): Element[] {
  return [...root.querySelectorAll(selector)].filter(element => element.isConnected && isVisible(element));
}

export function resolveBindingElement(selector: string, root: ParentNode = document): Element | undefined {
  try {
    const matches = visibleBindingMatches(selector, root);
    return matches.length === 1 ? matches[0] : undefined;
  } catch { return undefined; }
}

function selectorParts(element: Element): string[] {
  const tag = element.localName;
  const parts: string[] = [];
  if (element.id && !/\d{6,}|[a-f\d]{12,}/i.test(element.id)) parts.push(`${tag}#${CSS.escape(element.id)}`);
  for (const name of ['data-testid', 'data-test', 'name', 'aria-label', 'placeholder']) {
    const value = element.getAttribute(name);
    if (value && value.length <= 100) parts.push(`${tag}[${name}=${CSS.escape(value)}]`);
  }
  const classes = [...element.classList].filter((name) => !/^(?:active|open|show|hidden|visible|focus|hover|selected|disabled|is-|has-)/i.test(name) && name.length <= 100);
  parts.push(...classes.map((name) => `${tag}.${CSS.escape(name)}`));
  if (classes.length > 1) parts.push(`${tag}${classes.map((name) => `.${CSS.escape(name)}`).join('')}`);
  return [...new Set([...parts, tag])];
}

export function bindingTargetDiagnostic(element: Element): BindingTargetDiagnostic {
  const tag = element.localName;
  return {
    tag: ['input', 'textarea', 'img', 'canvas', 'button', 'div', 'span', 'label', 'form'].includes(tag) ? tag as BindingTargetDiagnostic['tag'] : 'other',
    ...(element instanceof HTMLInputElement ? { inputType: element.type as BindingTargetDiagnostic['inputType'] } : {}),
    attributes: BINDING_ATTRIBUTES.filter(name => Boolean(element.getAttribute(name))),
    connected: element.isConnected,
    visible: isVisible(element),
  };
}

export function inspectBindingTarget(element: Element, root: Document = document): { selector?: string; diagnostic: BindingTargetDiagnostic } {
  const diagnostic: BindingTargetDiagnostic = { ...bindingTargetDiagnostic(element), selectorAttempts: 0 };
  const result = (selector?: string) => ({ selector, diagnostic });
  if (element.ownerDocument !== root || element.getRootNode() !== root || !element.isConnected) return result();
  diagnostic.sameTagCount = visibleBindingMatches(element.localName, root).length;
  const matches = (selector: string, strategy: BindingTargetDiagnostic['strategy']): boolean => {
    if (selector.length > 2048) return false;
    diagnostic.selectorAttempts! += 1;
    try {
      const targets = visibleBindingMatches(selector, root);
      diagnostic.closestMatchCount = Math.min(diagnostic.closestMatchCount ?? Infinity, targets.length);
      if (targets.length !== 1 || targets[0] !== element) return false;
      diagnostic.strategy = strategy;
      return true;
    } catch { return false; }
  };
  const local = selectorParts(element);
  for (const selector of local) {
    const strategy = selector.startsWith(`${element.localName}#`) ? 'id'
      : selector.startsWith(`${element.localName}.`) ? 'class'
      : BINDING_ATTRIBUTES.find(name => selector.startsWith(`${element.localName}[${name}=`)) ?? 'tag';
    if (matches(selector, strategy)) return result(selector);
  }
  let path = element.localName;
  for (let parent = element.parentElement, depth = 0; parent !== null && depth < 5; parent = parent.parentElement, depth += 1) {
    for (const prefix of selectorParts(parent)) {
      for (const suffix of local) {
        const selector = `${prefix} ${suffix}`;
        if (matches(selector, 'ancestor')) return result(selector);
      }
      const selector = `${prefix} > ${path}`;
      if (matches(selector, 'ancestor')) return result(selector);
    }
    path = `${parent.localName} > ${path}`;
  }
  return result();
}

export function selectorForBinding(element: Element, root: Document = document): string | undefined {
  return inspectBindingTarget(element, root).selector;
}

export function resolveTextBinding(binding: Extract<CaptchaBinding, { kind: 'text' }>): { image: HTMLImageElement; field: TextFieldElement } | undefined {
  const image = resolveBindingElement(binding.image);
  const field = resolveBindingElement(binding.field);
  if (!(image instanceof HTMLImageElement) || !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) || !isEligibleField(field)) return undefined;
  return { image, field };
}

export interface SliderBindingElements { image: Element; handle: Element; track: Element }

export function resolveSliderBinding(binding: Extract<CaptchaBinding, { kind: 'slider' }>): SliderBindingElements | undefined {
  const image = resolveBindingElement(binding.image);
  const handle = resolveBindingElement(binding.handle);
  const track = resolveBindingElement(binding.track);
  return image && handle && track && image !== handle && image !== track && handle !== track && track.contains(handle)
    ? { image, handle, track }
    : undefined;
}
