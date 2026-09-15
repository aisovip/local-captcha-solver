import { describe, expect, it } from 'vitest';
import { releases, type Release } from '../../src/releases/catalog';
import { releaseIntroductionMarkup } from '../../src/releases/view';

describe('release issue links', () => {
  it('renders the issue references from both languages in introductions and full notes', () => {
    for (const locale of ['zh_CN', 'en'] as const) {
      for (const [version, issues] of [['1.4.0', [15]], ['1.3.2', [14]], ['1.3.1', [11, 12]], ['1.3.0', [10]]] as const) {
        const release = releases.find((item) => item.version === version)!;
        const root = document.createElement('div');
        root.innerHTML = releaseIntroductionMarkup(release, '1.4.0', locale);
        for (const issue of issues) {
          for (const section of ['.release-details', '.release-notes-body']) {
            const link = root.querySelector<HTMLAnchorElement>(`${section} a[href="https://github.com/hongshuo-wang/local-captcha-solver/issues/${issue}"]`);
            expect(link?.textContent, `${release.version}/${locale}/${section}`).toBe(`#${issue}`);
            expect(link?.target).toBe('_blank');
            expect(link?.rel).toBe('noopener noreferrer');
          }
        }
      }
    }
  });

  it('keeps inline code literal and escapes HTML and unsupported link destinations', () => {
    const changes = [
      '<img src=x onerror=alert(1)> [#15](https://github.com/hongshuo-wang/local-captcha-solver/issues/15)',
      '`[#15](https://github.com/hongshuo-wang/local-captcha-solver/issues/15)`',
      '[#15](javascript:alert(1)) [#15](https://example.com/issues/15)',
      '[#15](https://github.com/hongshuo-wang/local-captcha-solver/issues/14)',
    ];
    const release: Release = { version: '0.0.1', date: '2026-07-01', notes: { zh_CN: [{ title: '', changes }], en: [] } };
    const root = document.createElement('div');
    root.innerHTML = releaseIntroductionMarkup(release, '1.4.0', 'zh_CN');
    const notes = root.querySelector('.release-notes-body')!;
    expect(notes.querySelectorAll('a')).toHaveLength(1);
    expect(notes.querySelector('img, script')).toBeNull();
    expect(notes.querySelector('code')?.textContent).toBe(changes[1].slice(1, -1));
    expect(notes.textContent).toContain(changes[2]);
    expect(notes.textContent).toContain(changes[3]);
  });
});
