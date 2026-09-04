import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { productionSourceFiles } from '../scripts/check-coverage.ts';

import {
  scanSource,
  summarizeMutations,
  validateMutationPolicy,
  type MutationCandidate,
  type MutationSummary,
} from './helpers/mutation-policy.ts';

function fixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-mutation-policy-test-'));
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'tests', 'owner.test.ts'), 'export {};\n');
  return root;
}

function permission(summary: MutationSummary): Record<string, unknown> {
  return {
    file: summary.file,
    owner: summary.owner,
    mutationHash: summary.mutationHash,
    count: summary.count,
    reason: 'A concrete bounded scanner buffer is linear and does not escape.',
    test: 'tests/owner.test.ts',
  };
}

function firstCandidate(candidates: readonly MutationCandidate[]): MutationCandidate {
  const first = candidates[0];
  if (first === undefined) throw new Error('expected a mutation candidate');
  return first;
}

function firstSummary(candidates: readonly MutationCandidate[]): MutationSummary {
  const first = summarizeMutations(candidates)[0];
  if (first === undefined) throw new Error('expected a mutation summary');
  return first;
}

describe('mutation policy AST guard', () => {
  it('requires an exact reviewed permission for every production mutation owner', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const policy: unknown = JSON.parse(
      fs.readFileSync(path.join(root, 'tests/fixtures/mutation-policy.json'), 'utf8'),
    );
    const candidates = productionSourceFiles(root).flatMap((file) =>
      scanSource(file, fs.readFileSync(path.join(root, file), 'utf8')),
    );
    assert.deepEqual(validateMutationPolicy(candidates, policy, root), []);
  });

  it('records a streaming builder update as owned mutable state', () => {
    const candidates = scanSource(
      'scripts/hash.ts',
      'function hashFiles() { const hash = createHash("sha256"); hash.update(bytes); }',
    );
    assert.deepEqual(
      candidates.map(({ owner, kind }) => ({ owner, kind })),
      [{ owner: 'hashFiles', kind: 'builder-mutator' }],
    );
  });

  it('rejects six mutable CLI flags individually', () => {
    const candidates = scanSource(
      'bin/cli.ts',
      `function parseArgs() {
        let help = false, json = false, force = false;
        let quiet = false;
        let mode = 'show', target = 'codex';
      }`,
    );
    assert.equal(candidates.filter((candidate) => candidate.kind === 'let').length, 6);
    assert.equal(
      validateMutationPolicy(candidates, { permissions: [] }, '/').filter((issue) =>
        issue.startsWith('unexpected mutation owner:'),
      ).length,
      1,
    );
  });

  it('detects assignment through a const object and computed literal mutators', () => {
    const candidates = scanSource(
      'bin/state.ts',
      `function update() {
        const state = { ready: false };
        state.ready = true;
        const values = [1];
        values['push'](2);
      }`,
    );
    assert.deepEqual(
      candidates.map((candidate) => candidate.kind),
      ['assignment', 'array-mutator'],
    );
  });

  it('rejects a new mutation inside a permitted scanner', () => {
    const root = fixtureRoot();
    try {
      const one = scanSource('lib/scanner.ts', 'function scan() { items.push(value); }');
      const two = scanSource(
        'lib/scanner.ts',
        'function scan() { items.push(value); items.push(value); }',
      );
      const issues = validateMutationPolicy(
        two,
        { permissions: [permission(firstSummary(one))] },
        root,
      );
      assert.ok(
        issues.some((issue) => issue.includes('/1, actual') && issue.includes('/2; lines')),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a permission whose mutation was removed', () => {
    const root = fixtureRoot();
    try {
      const previous = scanSource('lib/scanner.ts', 'function scan() { items.push(value); }');
      const issues = validateMutationPolicy(
        [],
        { permissions: [permission(firstSummary(previous))] },
        root,
      );
      assert.ok(issues.some((issue) => issue.includes('actual <none>/0')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects changed hashes and duplicate owner permissions', () => {
    const root = fixtureRoot();
    try {
      const before = firstSummary(
        scanSource('lib/scanner.ts', 'function scan() { items.push(before); }'),
      );
      const after = scanSource('lib/scanner.ts', 'function scan() { items.push(after); }');
      const approved = permission(before);
      const changed = validateMutationPolicy(after, { permissions: [approved] }, root);
      assert.ok(changed.some((issue) => issue.includes('unused or changed owner permission')));
      const duplicate = validateMutationPolicy(
        scanSource('lib/scanner.ts', 'function scan() { items.push(before); }'),
        { permissions: [approved, approved] },
        root,
      );
      assert.ok(duplicate.some((issue) => issue.startsWith('duplicate owner permission:')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps fingerprints stable across formatting changes', () => {
    const compact = scanSource('lib/scanner.ts', 'function scan(){items.push(value)}');
    const formatted = scanSource(
      'lib/scanner.ts',
      `function scan() {
        items.push(value);
      }`,
    );
    assert.equal(compact[0]?.normalizedText, formatted[0]?.normalizedText);
    assert.equal(compact[0]?.fingerprint, formatted[0]?.fingerprint);
    assert.equal(firstSummary(compact).mutationHash, firstSummary(formatted).mutationHash);
  });

  it('inherits anonymous callback scope without covering another named function', () => {
    const candidates = scanSource(
      'lib/scanner.ts',
      `function scan() { values.forEach(() => items.push(value)); }
       function update() { items.push(value); }`,
    );
    assert.deepEqual(
      candidates.map((candidate) => candidate.owner),
      ['scan', 'update'],
    );
    const root = fixtureRoot();
    try {
      const issues = validateMutationPolicy(
        candidates,
        { permissions: [permission(firstSummary([firstCandidate(candidates)]))] },
        root,
      );
      assert.ok(issues.some((issue) => issue.includes('lib/scanner.ts update')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires process.exitCode to be approved at a named main boundary', () => {
    const candidate = scanSource('lib/runtime.ts', 'function helper() { process.exitCode = 1; }');
    const root = fixtureRoot();
    try {
      const issues = validateMutationPolicy(
        candidate,
        { permissions: [permission(firstSummary(candidate))] },
        root,
      );
      assert.ok(issues.some((issue) => issue.includes('restricted to a named main boundary')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires permission evidence to be a regular repo-relative file inside tests', () => {
    const root = fixtureRoot();
    const candidate = firstCandidate(
      scanSource('lib/scanner.ts', 'function scan() { items.push(value); }'),
    );
    try {
      const invalidPaths = [
        path.join(root, 'tests', 'owner.test.ts'),
        '../outside.test.ts',
        'tests',
        'tests/missing.test.ts',
      ];
      for (const test of invalidPaths) {
        const invalid = { ...permission(firstSummary([candidate])), test };
        const issues = validateMutationPolicy([candidate], { permissions: [invalid] }, root);
        assert.ok(issues.some((issue) => issue.startsWith('permission test ')));
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
