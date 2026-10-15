import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fingerprintFinding } from '../scripts/factory-scan-record.ts';

const base = {
  path: 'src/a.ts',
  category: 'Security',
  existing_code: 'eval(  input )',
  start_line: 10,
};
describe('fingerprintFinding', () => {
  it('survives line shifts, whitespace, path spelling and category case', () => {
    const fingerprint = fingerprintFinding('r1', base);
    assert.match(fingerprint ?? '', /^[0-9a-f]{64}$/);
    assert.equal(fingerprintFinding('r1', { ...base, start_line: 99 }), fingerprint);
    assert.equal(
      fingerprintFinding('r1', { ...base, existing_code: ' eval( input )\n' }),
      fingerprint,
    );
    assert.equal(
      fingerprintFinding('r1', { ...base, path: './src\\a.ts', category: 'SECURITY' }),
      fingerprint,
    );
  });
  it('changes with policy revision, path, category and code', () => {
    const fingerprint = fingerprintFinding('r1', base);
    for (const [rev, change] of [
      ['r2', {}],
      ['r1', { path: 'src/b.ts' }],
      ['r1', { category: 'bug' }],
      ['r1', { existing_code: 'eval(x)' }],
    ] as const)
      assert.notEqual(fingerprintFinding(rev, { ...base, ...change }), fingerprint);
  });
  it('refuses findings that cannot be identified', () => {
    assert.equal(fingerprintFinding('r1', { ...base, start_line: 0 }), null);
    assert.equal(fingerprintFinding('r1', { ...base, existing_code: ' \n ' }), null);
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { arrayField, record } from '../scripts/factory-protocol.ts';
import type { JsonRecord } from '../scripts/factory-protocol.ts';

const rows = (value: unknown): JsonRecord[] => arrayField({ value }, 'value').map(record);
import { buildScanDraft } from '../scripts/factory-scan-record.ts';
import { loadFactoryPolicy } from '../scripts/factory-protocol.ts';

const SHA = 'a'.repeat(40);
const REV = 'night-v1';
const comment = (
  index: number,
  file: string,
  code: string,
  extra: JsonRecord = {},
): JsonRecord => ({
  index,
  path: file,
  start_line: 10 + index,
  end_line: 12 + index,
  category: 'bug',
  severity: 'high',
  existing_code: code,
  content: `problem ${index}`,
  ...extra,
});
const fp = (c: JsonRecord): string => {
  const value = fingerprintFinding(REV, {
    path: String(c['path']),
    category: String(c['category']),
    existing_code: String(c['existing_code']),
    start_line: Number(c['start_line']),
  });
  assert.ok(value !== null);
  return value;
};
function rawScan(overrides: JsonRecord = {}, comments: JsonRecord[] = []): JsonRecord {
  return {
    schema: 'factory-night-scan-raw/v1',
    source_sha: SHA,
    tool: {
      version: '1.13.0',
      git_head: '1672852',
      lock_integrity: 'sha512-x',
      binary_version: 'v',
    },
    config: {
      scan_model: 'm',
      protocol: 'openai',
      exclude: ['**/package-lock.json'],
      flags: ['--no-summary', '--concurrency', '--max-tokens-budget=5'],
      concurrency: 4,
      max_tokens_budget: 1000,
      repo_rule_sha256: null,
    },
    exit_code: 0,
    stdout_json: true,
    status: 'success',
    budget_exceeded: false,
    total_tokens: 500,
    warnings: [],
    preview: [
      { path: 'a.ts', will_review: true, exclude_reason: null },
      { path: 'b.ts', will_review: true, exclude_reason: null },
      { path: 'package-lock.json', will_review: false, exclude_reason: 'excluded' },
    ],
    session: [
      { type: 'done', file_path: 'a.ts' },
      { type: 'done', file_path: 'b.ts' },
    ],
    comments,
    comments_truncated: false,
    auth_fallback_used: false,
    probe_status: 200,
    probe_error: {
      code: null,
      type: null,
      message_signals: [],
      message_length: null,
      key_source: 'primary',
    },
    stderr_signals: { http_statuses: [], messages: [] },
    deadline_hit: false,
    ...overrides,
  };
}
const verdicts = (rows: [JsonRecord, string][], extra: JsonRecord = {}): JsonRecord => ({
  schema: 'factory-night-verdicts/v1',
  source_sha: SHA,
  verifier_model: 'v',
  token_usage: 40,
  token_budget: 100,
  known_skipped: [],
  verdicts: rows.map(([c, verdict]) => ({
    index: c['index'],
    fingerprint: fp(c),
    verdict,
    reason: `why ${verdict}`,
  })),
  ...extra,
});
const acceptance = (indexes: number[]): JsonRecord => ({
  schema: 'factory-night-acceptance/v1',
  source_sha: SHA,
  analyst_model: 'a',
  token_usage: 10,
  items: indexes.map((index) => ({ index, criteria: ['it works'] })),
});
const adapt = (raw: JsonRecord, v: JsonRecord, a: unknown = acceptance([])) =>
  buildScanDraft(raw, v, a, REV, '1230959148');

describe('adapt', () => {
  const c0 = comment(0, 'a.ts', 'eval(x)');
  const c1 = comment(1, 'b.ts', 'exec(y)');
  const c2 = comment(2, 'b.ts', 'run(z)');
  it('full scan: selects the first non-refuted verdict, defers the rest, sums tokens', () => {
    const { draft, selected } = adapt(
      rawScan({}, [c0, c1, c2]),
      verdicts([
        [c0, 'refuted'],
        [c1, 'confirmed'],
        [c2, 'disputed'],
      ]),
      acceptance([1]),
    );
    assert.equal(selected, true);
    const findings = rows(draft['findings']);
    assert.deepEqual(
      findings.map((f) => [f['fingerprint'], f['verdict'], f['acceptance_criteria']]),
      [[fp(c1), 'confirmed', ['it works']]],
    );
    assert.deepEqual(draft['deferred_findings'], [
      { fingerprint: fp(c2), path: 'b.ts', severity: 'high' },
    ]);
    assert.equal(draft['token_usage'], 550);
    assert.equal(draft['truncated'], true);
    assert.equal(draft['successful'], true);
    assert.deepEqual(draft['inventory'], ['a.ts', 'b.ts', 'package-lock.json']);
    assert.deepEqual(draft['excluded'], [{ path: 'package-lock.json', reason: 'excluded' }]);
    assert.ok(!('token_budget' in draft) && !('authority' in draft));
  });
  it('slot goes to confirmed, then severity, then index', () => {
    const critical = comment(2, 'b.ts', 'run(z)', { severity: 'critical' });
    const medium = comment(1, 'b.ts', 'exec(y)', { severity: 'medium' });
    const disputedCritical = comment(0, 'a.ts', 'eval(x)', { severity: 'critical' });
    const { draft } = adapt(
      rawScan({}, [disputedCritical, medium, critical]),
      verdicts([
        [disputedCritical, 'disputed'],
        [medium, 'confirmed'],
        [critical, 'confirmed'],
      ]),
    );
    assert.deepEqual(
      rows(draft['findings']).map((f) => f['fingerprint']),
      [fp(critical)],
    );
    assert.deepEqual(
      rows(draft['deferred_findings']).map((f) => f['fingerprint']),
      [fp(medium), fp(disputedCritical)],
    );
  });
  it('single finding on a full scan is complete and criteria belong to confirmed only', () => {
    const one = adapt(rawScan({}, [c0]), verdicts([[c0, 'disputed']]), acceptance([0]));
    assert.equal(one.draft['truncated'], false);
    assert.deepEqual(
      rows(one.draft['findings']).map((f) => [f['acceptance_criteria'], f['verdict_reason']]),
      [[null, 'why disputed']],
    );
  });
  it('invalid acceptance drops criteria without losing the finding', () => {
    const { draft } = adapt(rawScan({}, [c0]), verdicts([[c0, 'confirmed']]), { bogus: 1 });
    assert.equal(rows(draft['findings'])[0]?.['acceptance_criteria'], null);
  });
  it('truncated scan: budget, deadline or an unreached file marks the record incomplete', () => {
    for (const overrides of [
      { budget_exceeded: true },
      { deadline_hit: true },
      { comments_truncated: true },
      { session: [{ type: 'done', file_path: 'a.ts' }] },
    ]) {
      const { draft } = adapt(rawScan(overrides, [c0]), verdicts([[c0, 'confirmed']]));
      assert.equal(draft['truncated'], true, JSON.stringify(overrides));
    }
  });
  it('failed file: not successful, listed as failed, finding still selectable', () => {
    const { draft, selected } = adapt(
      rawScan(
        {
          session: [
            { type: 'done', file_path: 'a.ts' },
            { type: 'failed', file_path: 'b.ts' },
          ],
          warnings: [{ file: 'b.ts', type: 'scan_subtask_error' }],
        },
        [c0],
      ),
      verdicts([[c0, 'confirmed']]),
    );
    assert.equal(selected, true);
    assert.equal(draft['successful'], false);
    assert.deepEqual(draft['failed'], ['b.ts']);
    assert.equal(draft['truncated'], false);
  });
  it('empty scan selects nothing', () => {
    const { draft, selected } = adapt(rawScan({}, []), verdicts([]));
    assert.equal(selected, false);
    assert.deepEqual(draft['findings'], []);
    assert.equal(draft['successful'], true);
  });
  it('429 scan (no JSON, no session) selects nothing and is neither successful nor covered', () => {
    const { draft, selected } = adapt(
      rawScan({
        exit_code: 1,
        stdout_json: false,
        status: null,
        total_tokens: null,
        session: null,
      }),
      verdicts([]),
    );
    assert.equal(selected, false);
    assert.equal(draft['successful'], false);
    assert.equal(draft['truncated'], true);
    assert.deepEqual(draft['covered'], []);
  });
  it('known-skipped, unverified and unidentifiable comments are all deferred', () => {
    const lineZero = comment(3, 'a.ts', 'q()', { start_line: 0 });
    const badSeverity = comment(4, 'a.ts', 'w()', { severity: 'urgent' });
    const { draft, selected } = adapt(
      rawScan({}, [c0, c1, lineZero, badSeverity]),
      verdicts([[badSeverity, 'confirmed']], { known_skipped: [0] }),
    );
    assert.equal(selected, false);
    assert.equal(draft['truncated'], true);
    assert.deepEqual(draft['deferred_findings'], [
      { fingerprint: fp(c0), path: 'a.ts', severity: 'high' },
      { fingerprint: fp(c1), path: 'b.ts', severity: 'high' },
      { fingerprint: null, path: 'a.ts', severity: 'high' },
      { fingerprint: fp(badSeverity), path: 'a.ts', severity: null },
    ]);
  });
  it('rejects mismatched sources and unknown fields', () => {
    assert.throws(() =>
      adapt(rawScan({}, [c0]), verdicts([[c0, 'confirmed']], { source_sha: 'b'.repeat(40) })),
    );
    assert.throws(() => adapt(rawScan({ extra: 1 }, []), verdicts([])));
  });
  it('config revision ignores budget/concurrency flags but not the model', () => {
    const base = adapt(rawScan({}, []), verdicts([])).draft['config_revision'];
    const other = rawScan({}, []);
    assert.notEqual(
      adapt({ ...other, config: { ...record(other['config']), scan_model: 'm2' } }, verdicts([]))
        .draft['config_revision'],
      base,
    );
    assert.equal(
      adapt(
        {
          ...other,
          config: { ...record(other['config']), concurrency: 8, max_tokens_budget: 9 },
        },
        verdicts([]),
      ).draft['config_revision'],
      base,
    );
  });
  it('config revision follows meaningful flags and exclude set, not their order or run knobs', () => {
    const raw = rawScan({}, []);
    const config = record(raw['config']);
    const revision = (patch: JsonRecord): unknown =>
      adapt({ ...raw, config: { ...config, ...patch } }, verdicts([])).draft['config_revision'];
    const base = revision({ exclude: ['a/**', 'b/**'], flags: ['--no-summary', '--x'] });
    assert.equal(
      revision({ exclude: ['b/**', 'a/**'], flags: ['--x', '--no-summary', '--concurrency=8'] }),
      base,
    );
    assert.notEqual(revision({ exclude: ['a/**'], flags: ['--no-summary', '--x'] }), base);
    assert.notEqual(revision({ exclude: ['a/**', 'b/**'], flags: ['--no-summary'] }), base);
    assert.notEqual(
      revision({ exclude: ['a/**', 'b/**'], flags: ['--no-summary', '--x', '--y'] }),
      base,
    );
  });
  it('CLI writes the draft and prints selected=', (test) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-record-'));
    test.after(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });
    fs.writeFileSync(path.join(dir, 'scan-raw.json'), JSON.stringify(rawScan({}, [c0])));
    fs.writeFileSync(
      path.join(dir, 'verdicts.json'),
      JSON.stringify(verdicts([[c0, 'confirmed']])),
    );
    const run = (revision: string) =>
      spawnSync(
        process.execPath,
        [
          'scripts/factory-scan-record.ts',
          'adapt',
          '--bundle',
          dir,
          '--out',
          path.join(dir, 'd.json'),
          '--revision',
          revision,
        ],
        { encoding: 'utf8' },
      );
    const ok = run(REV);
    assert.equal(ok.stdout.trim(), 'selected=true', ok.stderr);
    assert.equal(
      rows(record(JSON.parse(fs.readFileSync(path.join(dir, 'd.json'), 'utf8')))['findings'])
        .length,
      1,
    );
    const bad = run('other-rev');
    assert.equal(bad.status, 1);
    assert.equal(bad.stdout, '');
  });
  it('CLI takes the revision from policy without --revision and demands --bundle/--out', (test) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-record-'));
    test.after(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const policyRevision = String(
      record(loadFactoryPolicy()['night_scan'])['fingerprint_policy_revision'],
    );
    const fingerprint = fingerprintFinding(policyRevision, {
      path: 'a.ts',
      category: 'bug',
      existing_code: 'eval(x)',
      start_line: 10,
    });
    fs.writeFileSync(path.join(dir, 'scan-raw.json'), JSON.stringify(rawScan({}, [c0])));
    fs.writeFileSync(
      path.join(dir, 'verdicts.json'),
      JSON.stringify({
        ...verdicts([[c0, 'confirmed']]),
        verdicts: [{ index: 0, fingerprint, verdict: 'confirmed', reason: 'why' }],
      }),
    );
    const cli = (...args: string[]) =>
      spawnSync(process.execPath, ['scripts/factory-scan-record.ts', 'adapt', ...args], {
        encoding: 'utf8',
      });
    const out = path.join(dir, 'd.json');
    const ok = cli('--bundle', dir, '--out', out);
    assert.equal(ok.stdout.trim(), 'selected=true', ok.stderr);
    assert.equal(cli('--out', out).status, 1);
    assert.equal(cli('--bundle', dir).status, 1);
  });
});
