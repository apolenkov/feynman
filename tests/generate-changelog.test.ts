// tests/generate-changelog.test.ts — release-note preservation tests.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classify, promoteUnreleased, render, type Commit } from '../scripts/generate-changelog.ts';

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

describe('changelog rendering', () => {
  it('classifies conventional commit families and breaking changes', () => {
    assert.deepEqual(classify('feat: add diagrams'), ['Features', 'add diagrams']);
    assert.deepEqual(classify('fix(parser): handle fences'), ['Fixes', 'handle fences']);
    assert.deepEqual(classify('docs: explain install'), ['Documentation', 'explain install']);
    assert.deepEqual(classify('test: add coverage'), ['Tests', 'add coverage']);
    assert.deepEqual(classify('ci: run checks'), ['CI/CD', 'run checks']);
    assert.deepEqual(classify('refactor: simplify layers'), ['Maintenance', 'simplify layers']);
    assert.deepEqual(classify('perf: cache rules'), ['Performance', 'cache rules']);
    assert.deepEqual(classify('build: update tooling'), ['Build', 'update tooling']);
    assert.deepEqual(classify('feat!: remove legacy adapter'), ['Breaking Changes', 'remove legacy adapter']);
    assert.deepEqual(classify('miscellaneous note'), ['Other', 'miscellaneous note']);
  });

  it('renders grouped release notes, tag context, and empty releases', () => {
    const commits: Commit[] = [
      { hash: 'aaaaaaa', subject: 'feat: new view', body: '' },
      { hash: 'bbbbbbb', subject: 'fix: align output', body: '' },
      { hash: 'ccccccc', subject: 'chore: tidy', body: '' },
    ];
    const rendered = render('2.0.0', 'v1.4.0', commits);
    assert.match(rendered, /## 2\.0\.0 - \d{4}-\d{2}-\d{2}/);
    assert.match(rendered, /Changes since v1\.4\.0/);
    assert.match(rendered, /### Features/);
    assert.match(rendered, /### Fixes/);
    assert.match(rendered, /### Maintenance/);
    assert.match(render('2.0.0', '', []), /No code changes since the latest tag/);
  });
});
