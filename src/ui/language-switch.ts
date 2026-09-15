import type { Translator, UiLocale } from '../platform/i18n';

export function languageSwitchMarkup(locale: UiLocale, t: Translator): string {
  return `<div class="language-control"><div class="language-switch" role="group" aria-label="${t('languageLabel')}"><button type="button" data-language="zh_CN" lang="zh-CN" aria-label="${t('languageChinese')}" aria-pressed="${locale === 'zh_CN'}">中文</button><button type="button" data-language="en" lang="en" aria-label="${t('languageEnglish')}" aria-pressed="${locale === 'en'}">EN</button></div><p class="language-error" role="alert" hidden>${t('languageSaveFailed')}</p></div>`;
}

export function bindLanguageSwitch(root: HTMLElement, changeLanguage: (locale: UiLocale) => Promise<void>): void {
  const group = root.querySelector<HTMLElement>('.language-switch')!;
  const buttons = group.querySelectorAll<HTMLButtonElement>('[data-language]');
  const error = root.querySelector<HTMLElement>('.language-error')!;
  buttons.forEach((button) => button.addEventListener('click', () => {
    const locale = button.dataset.language;
    if (group.getAttribute('aria-busy') === 'true' || button.getAttribute('aria-pressed') === 'true' || (locale !== 'zh_CN' && locale !== 'en')) return;
    const restoreFocus = document.activeElement === button;
    error.hidden = true;
    group.setAttribute('aria-busy', 'true');
    buttons.forEach((control) => control.setAttribute('aria-disabled', 'true'));
    void changeLanguage(locale).then(() => {
      if (restoreFocus) root.querySelector<HTMLButtonElement>(`[data-language="${locale}"]`)?.focus({ preventScroll: true });
    }).catch(() => {
      group.removeAttribute('aria-busy');
      buttons.forEach((control) => control.removeAttribute('aria-disabled'));
      error.hidden = false;
    });
  }));
}
