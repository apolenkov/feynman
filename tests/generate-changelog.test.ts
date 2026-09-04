// tests/generate-changelog.test.ts — release-note preservation tests.

import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

import {
  classify,
  generateChangelog,
  mergeGeneratedChangelog,
  promoteUnreleased,
  render,
  type Commit,
} from '../scripts/generate-changelog.ts';

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

  it('does not duplicate an existing current-release heading when Unreleased has new notes', () => {
    const existing =
      '# Changelog\n\n## [Unreleased]\n\n- Pending note.\n\n## 2.0.0 - old\n\n- Released note.\n';
    assert.equal(promoteUnreleased(existing, '2.0.0', 'today'), undefined);
    assert.equal(mergeGeneratedChangelog(existing, render('2.0.0', '', []), '2.0.0'), existing);
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
    assert.deepEqual(classify('feat!: remove legacy adapter'), [
      'Breaking Changes',
      'remove legacy adapter',
    ]);
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

describe('changelog loss and failure regressions', () => {
  it('recognizes a breaking footer in the body without promoting ordinary features', () => {
    const breaking = render('2.0.0', '', [
      {
        hash: 'a',
        subject: 'feat: change API',
        body: 'Details.\n\nBREAKING CHANGE: removed old API',
      },
    ]);
    assert.match(breaking, /### Breaking Changes\n\n- change API/);
    assert.doesNotMatch(breaking, /### Features/);
    assert.deepEqual(classify('feat: new API', 'Ordinary body'), ['Features', 'new API']);
    assert.deepEqual(classify('FEAT: new API', 'Ordinary body'), ['Features', 'new API']);
    assert.deepEqual(classify('feat: new API', 'breaking change: ordinary lowercase text'), [
      'Features',
      'new API',
    ]);
    assert.deepEqual(classify('fix: changed wire format', 'BREAKING-CHANGE: old format removed'), [
      'Breaking Changes',
      'changed wire format',
    ]);
  });

  it('regenerates the current section twice without deleting older releases', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-changelog-test-'));
    t.after(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '2.0.0' }),
    );
    const older = '## 1.4.0 - 2026-05-25\n\n- Historical release must remain.\n';
    fs.writeFileSync(
      path.join(root, 'CHANGELOG.md'),
      render('2.0.0', '', [
        { hash: 'oldhash', subject: 'fix: previous generation', body: '' },
      ]).replace(
        'All notable changes to this project are documented here.',
        'Maintained introduction.',
      ) +
        '\n' +
        older,
    );
    const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
    execFileSync('git', ['init', '-q'], { cwd: root, env });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '--allow-empty',
        '-qm',
        'feat: change API',
        '-m',
        'BREAKING CHANGE: removed old API',
      ],
      { cwd: root, env },
    );
    generateChangelog(root);
    const first = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    generateChangelog(root);
    const second = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    assert.equal(first, second);
    assert.ok(second.endsWith(older));
    assert.equal(Array.from(second.matchAll(/^## 2\.0\.0 /gm)).length, 1);
    assert.match(second, /Maintained introduction/);
    assert.match(second, /### Breaking Changes/);
    assert.doesNotMatch(second, /previous generation/);
  });

  it('keeps an empty Unreleased section above the generated release', () => {
    const existing = '# Changelog\n\n## [Unreleased]\n\n## 1.0.0 - old\n\n- Kept.\n';
    const merged = mergeGeneratedChangelog(existing, render('2.0.0', '', []), '2.0.0');
    assert.ok(merged.indexOf('## [Unreleased]') < merged.indexOf('## 2.0.0'));
    assert.ok(merged.endsWith('## 1.0.0 - old\n\n- Kept.\n'));
    assert.equal(mergeGeneratedChangelog(merged, render('2.0.0', '', []), '2.0.0'), merged);
  });

  it('promotes maintained Unreleased content without invoking git', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-curated-test-'));
    t.after(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '2.0.0' }),
    );
    const old = '## 1.0.0 - old\n\n- Historic detail.\n';
    fs.writeFileSync(
      path.join(root, 'CHANGELOG.md'),
      '# Changelog\n\n## [Unreleased]\n\n- Curated detail.\n\n' + old,
    );
    generateChangelog(root, () => {
      throw new Error('curated notes must not depend on git');
    });
    const result = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    assert.match(result, /- Curated detail/);
    assert.ok(result.endsWith(old));
    assert.doesNotMatch(result, /\[Unreleased\]/);
    generateChangelog(root, () => {
      throw new Error('a repeated run must not replace promoted curated notes');
    });
    assert.equal(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), result);
  });

  it('preserves manual edits to a previously generated current release', () => {
    const generated = render('2.0.0', '', [
      { hash: 'abc', subject: 'fix: original note', body: '' },
    ]);
    const edited = generated.replace('original note', 'manually clarified note');
    const refreshed = render('2.0.0', '', [{ hash: 'def', subject: 'fix: new note', body: '' }]);
    assert.equal(mergeGeneratedChangelog(edited, refreshed, '2.0.0'), edited);
    const handWritten = '# Changelog\n\n## [2.0.0] - today\n\n- Maintained legacy notes.\n';
    assert.equal(mergeGeneratedChangelog(handWritten, refreshed, '2.0.0'), handWritten);
  });

  it('retains original bytes when history cannot be read', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-git-failure-'));
    t.after(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '2.0.0' }),
    );
    const original = '# Changelog\n\n## 1.0.0 - old\n\n- Must not be overwritten.\n';
    const file = path.join(root, 'CHANGELOG.md');
    fs.writeFileSync(file, original);
    assert.throws(() => {
      generateChangelog(root, (_directory, args) => {
        if (args[0] === 'log') throw new Error('git history read failed');
        return '';
      });
    }, /git history read failed/);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    assert.throws(() => {
      generateChangelog(root);
    }, /git tag failed/);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  });
});
