import type { UiLocale } from '../platform/i18n';
import { introductions, releaseCopy, releases, releaseUrl, type Release } from './catalog';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function dateLabel(date: string, locale: UiLocale): string {
  return new Intl.DateTimeFormat(locale === 'zh_CN' ? 'zh-CN' : 'en', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

function releaseText(value: string): string {
  return escapeHtml(value).replace(/`([^`]+)`|\[#([1-9]\d*)\]\(https:\/\/github\.com\/hongshuo-wang\/local-captcha-solver\/issues\/\2\)/g, (_match, code: string | undefined, issue: string) => code !== undefined
    ? `<code>${code}</code>`
    : `<a class="release-issue" href="https://github.com/hongshuo-wang/local-captcha-solver/issues/${issue}" target="_blank" rel="noopener noreferrer">#${issue}</a>`);
}

function notesMarkup(release: Release, locale: UiLocale): string {
  return release.notes[locale].map((section) => `${section.title ? `<h3>${escapeHtml(section.title)}</h3>` : ''}<ul>${section.changes.map((change) => `<li>${releaseText(change)}</li>`).join('')}</ul>`).join('');
}

export function releaseHistoryMarkup(currentVersion: string, locale: UiLocale, unavailable = false): string {
  const zh = locale === 'zh_CN';
  return `<section class="history-intro" data-page="history">
    <p class="release-version">${zh ? '版本记录' : 'Release history'}</p>
    <h1 tabindex="-1">${zh ? '每次更新，都在这里。' : 'Every update. All here.'}</h1>
    <p class="lead">${zh ? '看看每个版本带来的变化，随时重看功能介绍。' : 'Explore what each version brings and revisit its introduction anytime.'}</p>
    ${unavailable ? `<p class="history-notice" role="status">${zh ? '这个版本的介绍尚未收录。以下版本可以随时查看。' : 'That introduction is not in the archive yet. Browse the available versions below.'}</p>` : ''}
  </section>
  <ol class="release-list" aria-label="${zh ? '所有版本' : 'All versions'}">${releases.map((release) => {
    const intro = introductions[release.version];
    const current = release.version === currentVersion;
    return `<li><a class="release-entry" href="${releaseUrl(release.version)}" data-release="${release.version}" ${current ? 'data-current="true"' : ''}>
      <div class="release-entry-meta"><strong>${release.version}</strong><time datetime="${release.date}">${dateLabel(release.date, locale)}</time>${current ? `<span class="current-release">${zh ? '当前版本' : 'Installed version'}</span>` : ''}</div>
      <div class="release-entry-copy"><h2>${escapeHtml(intro ? releaseCopy(intro.title, locale) : zh ? '功能与体验更新' : 'Features and improvements')}</h2><p>${escapeHtml(intro ? releaseCopy(intro.summary, locale) : release.notes[locale][0]?.changes[0] ?? '')}</p><span>${zh ? '查看介绍与更新内容' : 'Explore this release'} <span aria-hidden="true">→</span></span></div>
    </a></li>`;
  }).join('')}</ol>`;
}

export function releaseIntroductionMarkup(release: Release, currentVersion: string, locale: UiLocale, options: { directFill?: boolean } = {}): string {
  const zh = locale === 'zh_CN';
  const intro = introductions[release.version];
  const current = release.version === currentVersion;
  const copy = (value: readonly [string, string]) => escapeHtml(releaseCopy(value, locale));
  const title = intro ? copy(intro.title) : zh ? '功能与体验更新' : 'Features and improvements';
  const directFillSetting = current && intro?.setting === 'directFill'
    ? `<div class="release-setting preference-list"><div class="preference-row"><div><label for="release-direct-fill">${zh ? '识别后直接填入' : 'Fill recognized results directly'}</label><p>${zh ? '开启后立即生效：识别结果直接填入输入框，不再弹出确认提示，填错时自行修改。可随时在“设置 → 静态验证码 → 填写”中调整。' : 'Applies immediately: recognized answers are filled without a confirmation prompt, and you can correct any mistake yourself. Change it anytime in Settings → Static CAPTCHAs → Filling.'}</p></div><label class="switch"><input id="release-direct-fill" type="checkbox" ${options.directFill === true ? 'checked' : ''} /><span aria-hidden="true"></span></label></div></div>`
    : '';
  return `<section class="journey-section welcome-section release-hero" id="release-welcome" data-chapter data-page="upgrade" data-release-version="${release.version}">
      <div class="welcome-content"><div class="brand-lens"><img class="intro-mark" src="/icons/icon-128.png" width="96" height="96" alt="" /></div><p class="release-version">${current ? zh ? '本次更新' : 'What’s new' : zh ? '版本介绍' : 'Release introduction'} ${release.version}</p><h1 tabindex="-1">${intro ? copy(intro.headline) : `Captcha Helper ${release.version}`}</h1><a class="primary-button welcome-action" href="#release-overview" data-journey-link="release-overview" data-start>${zh ? '看看新变化' : 'Explore the update'} <span aria-hidden="true">↓</span></a><nav class="release-navigation" aria-label="${zh ? '版本导航' : 'Release navigation'}"><a href="${releaseUrl()}" data-release-history>${zh ? '所有版本' : 'All versions'}</a><time datetime="${release.date}">${dateLabel(release.date, locale)}</time></nav></div>
    </section>
    <section class="journey-section release-overview" id="release-overview" data-chapter>
      <div class="journey-scene release-story"><header class="chapter-heading"><h2 tabindex="-1">${title}</h2><p class="lead">${intro ? copy(intro.summary) : zh ? '了解这个版本的功能与体验改进。' : 'Explore the features and improvements in this version.'}</p></header>
      ${intro?.image === 'binding' ? `<figure class="release-visual"><picture><source media="(prefers-color-scheme: dark)" srcset="/guide/binding-${zh ? 'zh' : 'en'}-dark.png" /><img src="/guide/binding-${zh ? 'zh' : 'en'}.png" width="1040" height="640" alt="${zh ? '手动绑定界面，图片和输入框带有清晰的选择标签' : 'The binding guide labels the selected CAPTCHA image and input'}" /></picture></figure>` : ''}
      ${intro ? `<div class="release-details">${intro.highlights.map((highlight) => `<article><h3>${copy(highlight.title)}</h3><p>${releaseText(releaseCopy(highlight.body, locale))}</p></article>`).join('')}</div>${directFillSetting}${intro.note ? `<p class="release-privacy">${copy(intro.note)}</p>` : ''}` : ''}</div></div>
    </section>
    <section class="journey-section release-finish" id="release-finish" data-chapter><div class="journey-scene release-records"><h2 tabindex="-1">${zh ? '准备好，开始使用。' : 'Ready when you are.'}</h2><p class="lead">${zh ? '打开工具栏中的 Captcha Helper，继续手边的事。' : 'Open Captcha Helper in the toolbar and get back to your day.'}</p><details class="release-notes" id="release-notes" ${current ? '' : 'open'}><summary>${zh ? '完整更新记录' : 'Full release notes'}<span aria-hidden="true">+</span></summary><div class="release-notes-body">${notesMarkup(release, locale)}</div></details><footer class="wizard-actions"><a class="text-button" href="#release-overview" data-journey-link="release-overview"><span aria-hidden="true">↑</span> ${zh ? '回看介绍' : 'Back to the update'}</a><button type="button" class="primary-button" data-primary data-close-guide>${zh ? '开始使用' : 'Start using'}</button></footer></div></section>`;
}
