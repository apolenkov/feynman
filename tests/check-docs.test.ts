// tests/check-docs.test.ts — unit tests for the doc-drift guard.
// Pure-function checks for scripts/check-docs.ts (capability: doc-drift-guard).
// Zero deps. node:test + node:assert/strict.
//
// NOTE: forbidden phrases are referenced via the imported FORBIDDEN_PHRASES
// array, never written as literals here — a literal would make this very test
// file a "live surface" hit when the real guard scans the tracked tree.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  detectDrift,
  isDriftExcluded,
  FORBIDDEN_PHRASES,
  DRIFT_EXCLUDED_PATHS,
  checkDocs,
  runDocsCheck,
} from '../scripts/check-docs.ts';
import { assertDefined } from './helpers/assertions.ts';

const phrase = FORBIDDEN_PHRASES[0];
if (phrase === undefined) throw new Error('FORBIDDEN_PHRASES must not be empty');
const withPhrase = `intro text ${phrase} trailing text`;

function docsFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-docs-'));
  for (const [file, content] of [
    ['README.md', '# Readme\n'],
    ['CONTRIBUTING.md', '# Contributing\n'],
    ['CHANGELOG.md', '# Changelog\n'],
    ['docs/guide.md', '# Guide\n'],
    ['examples/sample.md', '# Sample\n'],
    ['bin/feynman.ts', '#!/usr/bin/env node\n'],
    [
      'bin/feynman-lint.ts',
      "import fs from 'node:fs'; const text = fs.readFileSync(process.argv[2], 'utf8'); if (text.includes('LINT_FAIL')) process.exit(2);\n",
    ],
  ] as const) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: root }).status, 0);
  assert.equal(spawnSync('git', ['add', '.'], { cwd: root }).status, 0);
  return root;
}

describe('isDriftExcluded', () => {
  it('excludes decision-record directories by prefix', () => {
    assert.equal(isDriftExcluded('docs/adr/0001-foo.md'), true);
    assert.equal(isDriftExcluded('openspec/changes/some-change/proposal.md'), true);
  });

  it('excludes exact-file entries', () => {
    assert.equal(isDriftExcluded('CHANGELOG.md'), true);
    assert.equal(isDriftExcluded('scripts/check-docs.ts'), true);
    // the guard's own spec, promoted to openspec/specs/ on archive
    assert.equal(isDriftExcluded('openspec/specs/doc-drift-guard/spec.md'), true);
  });

  it('does not exclude live surfaces', () => {
    assert.equal(isDriftExcluded('README.md'), false);
    assert.equal(isDriftExcluded('install.sh'), false);
    assert.equal(isDriftExcluded('AGENTS.md'), false);
  });

  it('does not partial-match a prefix that is not a path boundary', () => {
    // 'CHANGELOG.md' is an exact entry, not a prefix.
    assert.equal(isDriftExcluded('CHANGELOG.md.bak'), false);
  });
});

describe('detectDrift', () => {
  it('flags a forbidden phrase on a live surface, naming file and phrase', () => {
    const findings = detectDrift([{ rel: 'install.sh', content: withPhrase }]);
    assert.equal(findings.length, 1);
    const [first] = findings;
    assertDefined(first);
    assert.match(first, /install\.sh/);
    assert.ok(first.includes(phrase));
  });

  it('passes the same phrase inside a decision record', () => {
    const findings = detectDrift([
      { rel: 'docs/adr/0001-typescript-source-with-packaging-build.md', content: withPhrase },
      { rel: 'CHANGELOG.md', content: withPhrase },
    ]);
    assert.deepEqual(findings, []);
  });

  it("passes the guard's own capability spec promoted to openspec/specs", () => {
    // On archive, doc-drift-guard/spec.md moves from openspec/changes/ (excluded
    // by prefix) to openspec/specs/, where it documents the very phrases it forbids.
    const findings = detectDrift([
      { rel: 'openspec/specs/doc-drift-guard/spec.md', content: withPhrase },
    ]);
    assert.deepEqual(findings, []);
  });

  it('passes a clean tree', () => {
    const findings = detectDrift([
      { rel: 'README.md', content: 'all current, no stale wording here' },
      { rel: 'install.sh', content: 'Node >=22.18 required' },
    ]);
    assert.deepEqual(findings, []);
  });

  it('skips binary files (NUL byte) even with a phrase present', () => {
    const findings = detectDrift([{ rel: 'asset.bin', content: '\u0000' + phrase }]);
    assert.deepEqual(findings, []);
  });

  it('reports every forbidden phrase, once per (file, phrase)', () => {
    const content = FORBIDDEN_PHRASES.join(' and ');
    const findings = detectDrift([{ rel: 'AGENTS.md', content }]);
    assert.equal(findings.length, FORBIDDEN_PHRASES.length);
  });
});

describe('guard constants', () => {
  it('keeps the superseded-contract phrase set non-empty', () => {
    assert.ok(FORBIDDEN_PHRASES.length >= 5);
  });

  it('excludes the guard script itself so it does not flag its own constants', () => {
    assert.ok(DRIFT_EXCLUDED_PATHS.includes('scripts/check-docs.ts'));
  });
});

describe('docs CLI boundary', () => {
  it('passes a complete temporary documentation tree without touching the workspace', () => {
    const root = docsFixture();
    try {
      assert.deepEqual(checkDocs(root), {
        files: [
          'README.md',
          'CONTRIBUTING.md',
          'CHANGELOG.md',
          'docs/guide.md',
          'examples/sample.md',
        ],
        lintFailures: [],
        hasInvalidPublicInstallExample: false,
        driftFindings: [],
      });
      const stdout: string[] = [];
      const stderr: string[] = [];
      assert.equal(
        runDocsCheck(root, {
          stdout: (text) => stdout.push(text),
          stderr: (text) => stderr.push(text),
        }),
        0,
      );
      assert.deepEqual(stdout, ['docs lint OK (5 files)\n']);
      assert.deepEqual(stderr, []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports lint, public-command, and tracked-drift failures together', () => {
    const root = docsFixture();
    try {
      fs.writeFileSync(path.join(root, 'README.md'), `npx feynman install\n${withPhrase}\n`);
      fs.writeFileSync(path.join(root, 'docs', 'guide.md'), 'LINT_FAIL\n');
      const result = checkDocs(root);
      assert.deepEqual(
        result.lintFailures.map(({ file }) => file),
        ['docs/guide.md'],
      );
      assert.equal(result.hasInvalidPublicInstallExample, true);
      assert.equal(result.driftFindings.length, 1);

      const errors: string[] = [];
      assert.equal(
        runDocsCheck(root, {
          stdout: () => undefined,
          stderr: (text) => errors.push(text),
        }),
        1,
      );
      const message = errors.join('');
      assert.match(message, /docs lint failed: docs\/guide\.md/);
      assert.match(message, /public install examples/);
      assert.match(message, /superseded toolchain contract/);
      assert.match(message, /README\.md/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves the original git diagnostic when tracked files cannot be listed', () => {
    const root = docsFixture();
    try {
      fs.rmSync(path.join(root, '.git'), { recursive: true, force: true });
      assert.throws(
        () => checkDocs(root),
        /unable to list tracked files via git: .*fatal: not a git repository/is,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
