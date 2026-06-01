// tests/check-docs.test.ts — unit tests for the doc-drift guard.
// Pure-function checks for scripts/check-docs.ts (capability: doc-drift-guard).
// Zero deps. node:test + node:assert/strict.
//
// NOTE: forbidden phrases are referenced via the imported FORBIDDEN_PHRASES
// array, never written as literals here — a literal would make this very test
// file a "live surface" hit when the real guard scans the tracked tree.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectDrift,
  isDriftExcluded,
  FORBIDDEN_PHRASES,
  DRIFT_EXCLUDED_PATHS,
} from '../scripts/check-docs.ts';

const phrase = FORBIDDEN_PHRASES[0];
if (phrase === undefined) throw new Error('FORBIDDEN_PHRASES must not be empty');
const withPhrase = `intro text ${phrase} trailing text`;

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
    assert.ok(first);
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
      { rel: 'install.sh', content: 'Node >=22.6 required' },
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
