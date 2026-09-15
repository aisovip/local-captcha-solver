import { describe, expect, it } from 'vitest';

import { extractChangelogSection, versionFromStableTag } from '../../scripts/prepare-release.mjs';

describe('release notes preparation', () => {
  it('accepts stable semantic version tags', () => {
    expect(versionFromStableTag('v1.2.3')).toBe('1.2.3');
    expect(() => versionFromStableTag('1.2.3')).toThrow(/vMAJOR\.MINOR\.PATCH/);
  });

  it('extracts a bilingual version section', () => {
    const changelog = [
      '# Changelog',
      '',
      '## [1.2.3] - 2026-07-31',
      '',
      '### 中文',
      '',
      '- 中文说明 [#15](https://github.com/hongshuo-wang/local-captcha-solver/issues/15)',
      '',
      '### English',
      '',
      '- English notes [#15](https://github.com/hongshuo-wang/local-captcha-solver/issues/15)',
      '',
      '## [1.2.2] - 2026-07-30',
    ].join('\n');

    expect(extractChangelogSection(changelog, '1.2.3')).toContain('### 中文');
    expect(extractChangelogSection(changelog, '1.2.3')).toContain('### English');
    expect(extractChangelogSection(changelog, '1.2.3').match(/\[#15\]\(https:\/\/github\.com\/hongshuo-wang\/local-captcha-solver\/issues\/15\)/g)).toHaveLength(2);
  });

  it('rejects release notes missing either language', () => {
    const changelog = '## [1.2.3]\n\n### English\n\n- English only\n';

    expect(() => extractChangelogSection(changelog, '1.2.3')).toThrow(/both/);
  });
});
