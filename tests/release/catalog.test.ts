import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { introductions, parseReleases, releases } from '../../src/releases/catalog';

describe('local release catalog', () => {
  it('includes a bilingual introduction and full notes for every shipped version', () => {
    expect(releases[0].version).toBe(pkg.version);
    expect(new Set(releases.map((release) => release.version)).size).toBe(releases.length);
    for (const release of releases) {
      expect(introductions[release.version], release.version).toBeDefined();
      expect(release.notes.zh_CN.flatMap((section) => section.changes).length).toBeGreaterThan(0);
      expect(release.notes.en.flatMap((section) => section.changes).length).toBeGreaterThan(0);
      expect(Date.parse(release.date)).not.toBeNaN();
    }
  });

  it('keeps published versions, languages, and section boundaries separate', () => {
    const parsed = parseReleases(`## [Unreleased]
### 中文
- 尚未发布
## [2.0.0] - 2026-10-01
### 中文
- 主要变化
#### 修复
- 问题修复
### English
- Main change
## [1.0.0] - 2026-07-31
### 中文
- 首次发布
### English
- First release
[1.0.0]: https://example.test
`);
    expect(parsed).toEqual([
      { version: '2.0.0', date: '2026-10-01', notes: { zh_CN: [{ title: '', changes: ['主要变化'] }, { title: '修复', changes: ['问题修复'] }], en: [{ title: '', changes: ['Main change'] }] } },
      { version: '1.0.0', date: '2026-07-31', notes: { zh_CN: [{ title: '', changes: ['首次发布'] }], en: [{ title: '', changes: ['First release'] }] } },
    ]);
  });
});
