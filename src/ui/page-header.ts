import type { Translator, UiLocale } from '../platform/i18n';
import { languageSwitchMarkup } from './language-switch';

export function pageHeaderMarkup(locale: UiLocale, t: Translator): string {
  return `<header class="page-header"><div class="page-brand"><img src="/icons/icon-48.png" width="32" height="32" alt="" /><strong>Captcha Helper</strong></div>${languageSwitchMarkup(locale, t)}</header>`;
}
