// tests/generate-changelog.test.ts — release-note preservation tests.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { promoteUnreleased } from '../scripts/generate-changelog.ts';

describe('promoteUnreleased', () => {
  it('promotes curated notes without duplicating legacy tag history', () => {
    const changelog = [
      '# Changelog',
      '',
      'All notable changes to this project are documented here.',
      '',
      '## [Unreleased]',
      '',
      '### Fixed',
      '',
      '- Kept hand-written release notes.',
      '',
      '## 1.4.0 - 2026-05-25',
      '',
      '### Features',
      '',
      '- Previous release.',
      '',
    ].join('\n');

    const promoted = promoteUnreleased(changelog, '2.0.0', '2026-09-01');

    assert.equal(promoted, changelog.replace('## [Unreleased]', '## 2.0.0 - 2026-09-01'));
  });

  it('falls back to git history when Unreleased is empty', () => {
    const changelog = '# Changelog\n\n## [Unreleased]\n\n## 1.4.0 - 2026-05-25\n';

    assert.equal(promoteUnreleased(changelog, '2.0.0', '2026-09-01'), undefined);
  });
});
