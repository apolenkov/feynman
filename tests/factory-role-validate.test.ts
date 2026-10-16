import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { it } from 'node:test';
import { produceReceipt, sha256 } from '../scripts/factory-protocol.ts';
import { ROLE_CONTROL_FILES } from '../scripts/factory-roles.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

function fixture() {
  const source = 'a'.repeat(40);
  const digest = 'c'.repeat(64);
  const bindings = {
    repository_id: '1230959148',
    workflow_id: '703',
    workflow_source_sha: source,
    control_release_sha: source,
    run_id: '17',
    run_attempt: 1,
  };
  const reservation = produceReceipt({
    ...bindings,
    epoch_id: 'epoch1',
    sequence: 2,
    parent_head: source,
    parent_checkpoint_head: source,
    repository_full_name: 'apolenkov/feynman',
    workflow_path: '.github/workflows/factory-control.yml',
    control_manifest_sha256: digest,
    default_ref: 'refs/heads/main',
    default_head: source,
    event: 'workflow_dispatch',
    actor_id: '23296915',
    actor_login: 'apolenkov',
    actor_decision: 'owner',
    producer_phase: 'reserve',
    request_key: digest,
    lineage_id: digest,
    issue_node_id: 'I_CANONICAL',
    issue_number: 42,
    fingerprint_policy_revision: 'fp1',
    fingerprint: digest,
    baseline_sha: source,
    current_source_head: source,
    expected_transition: 'reserved',
    reservation_number: 1,
    operation: null,
    aliases: [],
    outcome: 'consumed',
    evidence: { scan: null, verifier: null },
  });
  const manifest = ROLE_CONTROL_FILES.map((file) => ({ path: file, blob_sha: source }));
  const allocations = [
    'research',
    'architecture',
    'test',
    'baseline',
    'developer',
    'candidate',
    'publish',
    'review-ocr',
    'review-independent',
    'release',
  ].map((role) => ({ role, token_budget: 100, timeout_seconds: 10 }));
  const payload = { result: 'research' };
  const receipt = {
    schema: 'factory-role/v2',
    ...bindings,
    lineage_id: digest,
    reservation_number: 1,
    reservation_receipt_sha256: sha256(reservation),
    role_control_manifest_sha256: sha256(manifest),
    role_config_sha256: sha256(allocations),
    role: 'research',
    predecessor_sha256: sha256(reservation),
    baseline_sha: source,
    final_sha: null,
    payload_sha256: sha256(payload),
    outcome: 'completed',
    token_budget: 100,
    timeout_seconds: 10,
    token_usage: 50,
    elapsed_ms: 1000,
  };
  return {
    reservation,
    context: {
      ...bindings,
      owner_id: '23296915',
      owner_login: 'apolenkov',
      token_budget: 1000,
      timeout_seconds: 100,
      role_manifest: manifest,
      role_config_sha256: sha256(allocations),
    },
    allocations,
    roles: [
      {
        receipt,
        receipt_sha256: sha256(receipt),
        payload,
        transport: {
          artifact_id: '100',
          archive_sha256: digest,
          producer_job_id: '200',
          producer_log_sha256: digest,
        },
      },
    ],
  };
}

it('CLI reports structure only and rejects unsafe input without echoing it', () => {
  const dir = fs.mkdtempSync(path.join(ROOT, '.factory-role-validate-test-'));
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['scripts/factory-role-validate.ts', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 5000,
    });
  try {
    const chain = fixture();
    const valid = path.join(dir, 'valid.json');
    const serialized = JSON.stringify(chain);
    fs.writeFileSync(valid, serialized);
    const success = run('validate', valid);
    assert.equal(success.status, 0, success.stderr);
    assert.equal(success.stderr, '');
    assert.deepEqual(JSON.parse(success.stdout), {
      status: 'validated-structure',
      receipt_sha256: chain.roles[0]?.receipt_sha256,
    });

    const boundary = path.join(dir, 'boundary.json');
    fs.writeFileSync(boundary, serialized.padEnd(1_000_000, ' '));
    assert.equal(run('validate', boundary).status, 0);
    const oversized = path.join(dir, 'oversized.json');
    fs.writeFileSync(oversized, serialized.padEnd(1_000_001, ' '));
    const malformed = path.join(dir, 'malformed.json');
    fs.writeFileSync(malformed, '{"secret-marker-cli":');
    const invalid = path.join(dir, 'invalid.json');
    fs.writeFileSync(invalid, '{"secret-marker-cli":"not a chain"}');
    const symlink = path.join(dir, 'symlink.json');
    fs.symlinkSync(valid, symlink);
    const fifo = path.join(dir, 'fifo');
    assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
    for (const args of [
      [],
      ['validate'],
      ['publish', valid],
      ['validate', valid, '--extra'],
      ['validate', '--help'],
      ...[
        oversized,
        malformed,
        invalid,
        symlink,
        fifo,
        dir,
        path.join(dir, 'secret-marker-cli'),
      ].map((file) => ['validate', file]),
    ]) {
      const rejected = run(...args);
      assert.equal(rejected.error, undefined, 'CLI must not block on non-regular files');
      assert.equal(rejected.status, 1, JSON.stringify(args));
      assert.equal(rejected.stdout, '');
      assert.match(rejected.stderr, /Invalid role chain input or command/);
      assert.doesNotMatch(
        rejected.stderr,
        /secret-marker-cli|Error:|\bat .*:\d|factory-role-validate-test/,
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
