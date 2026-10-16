import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { produceReceipt, sha256 } from '../scripts/factory-protocol.ts';

import { ROLE_CONTROL_FILES, validateRoleChain as validate } from '../scripts/factory-roles.ts';

const SHA = 'a'.repeat(40);
const FINAL = 'b'.repeat(40);
const DIGEST = 'c'.repeat(64);
const ORDER = [
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
];
const OUTCOMES = [
  'completed',
  'completed',
  'completed',
  'behavioral-red',
  'completed',
  'behavioral-green',
  'published',
  'approved',
  'approved',
  'manual',
];
function fixture(length = 10) {
  const reservation = produceReceipt({
    epoch_id: 'epoch1',
    sequence: 2,
    parent_head: SHA,
    parent_checkpoint_head: SHA,
    repository_id: '1230959148',
    repository_full_name: 'apolenkov/feynman',
    workflow_id: '703',
    workflow_path: '.github/workflows/factory-control.yml',
    workflow_source_sha: SHA,
    control_release_sha: SHA,
    control_manifest_sha256: DIGEST,
    default_ref: 'refs/heads/main',
    default_head: SHA,
    run_id: '17',
    run_attempt: 1,
    event: 'workflow_dispatch',
    actor_id: '23296915',
    actor_login: 'apolenkov',
    actor_decision: 'owner',
    producer_phase: 'reserve',
    request_key: DIGEST,
    lineage_id: DIGEST,
    issue_node_id: 'I_CANONICAL',
    issue_number: 42,
    fingerprint_policy_revision: 'fp1',
    fingerprint: DIGEST,
    baseline_sha: SHA,
    current_source_head: SHA,
    expected_transition: 'reserved',
    reservation_number: 1,
    operation: null,
    aliases: [],
    outcome: 'consumed',
    evidence: { scan: null, verifier: null },
  });
  const manifest = ROLE_CONTROL_FILES.map((path) => ({ path, blob_sha: SHA }));
  const allocations = ORDER.map((role) => ({ role, token_budget: 100, timeout_seconds: 10 }));
  const context = {
    owner_id: '23296915',
    owner_login: 'apolenkov',
    repository_id: '1230959148',
    workflow_id: '703',
    workflow_source_sha: SHA,
    control_release_sha: SHA,
    run_id: '17',
    run_attempt: 1,
    token_budget: 1000,
    timeout_seconds: 100,
    role_manifest: manifest,
    role_config_sha256: sha256(allocations),
  };
  let predecessor = sha256(reservation);
  const roles = ORDER.slice(0, length).map((role, index) => {
    const payload = { result: role };
    const receipt: Record<string, unknown> = {
      schema: 'factory-role/v2',
      repository_id: '1230959148',
      lineage_id: DIGEST,
      reservation_number: 1,
      reservation_receipt_sha256: sha256(reservation),
      run_id: '17',
      run_attempt: 1,
      workflow_id: '703',
      workflow_source_sha: SHA,
      control_release_sha: SHA,
      role_control_manifest_sha256: sha256(manifest),
      role_config_sha256: sha256(allocations),
      role,
      predecessor_sha256: predecessor,
      baseline_sha: SHA,
      final_sha: index >= 5 ? FINAL : null,
      payload_sha256: sha256(payload),
      outcome: OUTCOMES[index],
      token_budget: 100,
      timeout_seconds: 10,
      token_usage: 50,
      elapsed_ms: 1000,
    };
    predecessor = sha256(receipt);
    return {
      receipt,
      receipt_sha256: predecessor,
      payload,
      transport: {
        artifact_id: String(index + 100),
        archive_sha256: DIGEST,
        producer_job_id: String(index + 200),
        producer_log_sha256: DIGEST,
      },
    };
  });
  return { reservation, context, allocations, roles };
}
function item<T>(values: readonly T[], index = 0): T {
  const value = values[index];
  assert.ok(value !== undefined);
  return value;
}
function reseal(input: ReturnType<typeof fixture>) {
  let previous = sha256(input.reservation);
  for (const envelope of input.roles) {
    envelope.receipt['predecessor_sha256'] = previous;
    envelope.receipt_sha256 = sha256(envelope.receipt);
    previous = envelope.receipt_sha256;
  }
}

describe('additive v2 role contract (structural validation, not authority)', () => {
  it('accepts an ordered prefix and complete manual-release chain without mutating input', () => {
    const prefix = fixture(1);
    const before = structuredClone(prefix);
    assert.equal(validate(prefix)['role'], 'research');
    assert.deepEqual(prefix, before);
    assert.equal(validate(fixture())['outcome'], 'manual');
  });
  it('rejects a modified payload even when later receipt digests are recomputed', () => {
    const input = fixture();
    item(input.roles, 0).payload.result = 'substituted';
    reseal(input);
    assert.throws(() => validate(input), /payload digest/);
  });
  it('rejects recomputed envelopes for a different attempt, reservation or source', () => {
    for (const [field, value] of [
      ['run_attempt', 2],
      ['run_id', '18'],
      ['repository_id', '2'],
      ['lineage_id', 'd'.repeat(64)],
      ['reservation_number', 2],
      ['reservation_receipt_sha256', 'd'.repeat(64)],
      ['workflow_id', '704'],
      ['workflow_source_sha', FINAL],
      ['control_release_sha', FINAL],
      ['baseline_sha', FINAL],
      ['role_control_manifest_sha256', 'd'.repeat(64)],
    ] as const) {
      const input = fixture();
      item(input.roles, 0).receipt[field] = value;
      reseal(input);
      assert.throws(() => validate(input), /role binding|run_attempt/, field);
    }
  });
  it('rejects bot admission, non-reserve evidence and a replayed native run', () => {
    for (const change of [
      {
        actor_id: '41898282',
        actor_login: 'github-actions[bot]',
        actor_decision: 'approved-publisher',
      },
      { event: 'issues' },
      { producer_phase: 'verifier' },
      { outcome: 'confirmed' },
      { expected_transition: 'eligible' },
      { lineage_id: null },
      { reservation_number: null },
    ]) {
      const input = fixture();
      const candidate = { ...input.reservation, ...change };
      input.reservation = 'producer_phase' in change ? produceReceipt(candidate) : candidate;
      assert.throws(() => validate(input));
    }
    for (const change of [
      { run_id: '18' },
      { run_attempt: 2 },
      { owner_id: '2' },
      { owner_login: 'other' },
    ]) {
      const input = fixture();
      Object.assign(input.context, change);
      assert.throws(() => validate(input), /reservation binding|run_attempt/);
    }
  });
  it('rejects skipped, duplicated or unsuccessful predecessors', () => {
    for (const change of ['skip', 'duplicate', 'failed', 'predecessor']) {
      const input = fixture();
      if (change === 'skip') input.roles.splice(1, 1);
      if (change === 'duplicate') item(input.roles, 1).receipt['role'] = 'research';
      if (change === 'failed') item(input.roles, 0).receipt['outcome'] = 'denied';
      reseal(input);
      if (change === 'predecessor') {
        item(input.roles, 1).receipt['predecessor_sha256'] = DIGEST;
        item(input.roles, 1).receipt_sha256 = sha256(item(input.roles, 1).receipt);
      }
      assert.throws(() => validate(input), /role order|role outcome|predecessor/);
    }
  });
  it('requires candidate head only from GREEN onward and keeps it immutable', () => {
    for (const [index, value] of [
      [0, FINAL],
      [5, null],
      [7, SHA],
    ] as const) {
      const input = fixture();
      item(input.roles, index).receipt['final_sha'] = value;
      reseal(input);
      assert.throws(() => validate(input), /final head/);
    }
    const unchanged = fixture();
    for (const envelope of unchanged.roles.slice(5)) envelope.receipt['final_sha'] = SHA;
    reseal(unchanged);
    assert.throws(() => validate(unchanged), /final head/);
  });
  it('bounds the total allocation and refuses unused-budget transfer between roles', () => {
    for (const key of ['token_budget', 'timeout_seconds'] as const) {
      const input = fixture();
      item(input.allocations, 0)[key] += 1;
      assert.throws(() => validate(input), /allocation exceeds reservation/);
    }
    for (const change of [
      { token_usage: 101 },
      { elapsed_ms: 10001 },
      { token_budget: 101 },
      { timeout_seconds: 11 },
    ]) {
      const input = fixture();
      Object.assign(item(input.roles, 1).receipt, change);
      reseal(input);
      assert.throws(() => validate(input), /role budget/);
    }
    for (const value of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const input = fixture();
      input.context.token_budget = value;
      assert.throws(() => validate(input), /token_budget|JSON number must be finite/);
    }
  });
  it('rejects reassigned budget shares even when totals remain within the reservation', () => {
    const input = fixture();
    item(input.allocations, 0).token_budget = 90;
    item(input.roles, 0).receipt['token_budget'] = 90;
    item(input.allocations, 1).token_budget = 110;
    item(input.roles, 1).receipt['token_budget'] = 110;
    reseal(input);
    assert.throws(() => validate(input), /role configuration digest/);
  });
  it('rejects unknown, missing and malformed envelope fields and duplicate transport identities', () => {
    const mutations = [
      (input: ReturnType<typeof fixture>) => {
        item(input.roles, 0).receipt['unknown'] = true;
      },
      (input: ReturnType<typeof fixture>) => {
        delete item(input.roles, 0).receipt['payload_sha256'];
      },
      (input: ReturnType<typeof fixture>) => {
        item(input.roles, 0).receipt['token_usage'] = -1;
      },
      (input: ReturnType<typeof fixture>) => {
        item(input.roles, 0).transport.artifact_id = '01';
      },
      (input: ReturnType<typeof fixture>) => {
        item(input.roles, 1).transport.artifact_id = '100';
      },
      (input: ReturnType<typeof fixture>) => {
        item(input.roles, 1).transport.producer_job_id = '200';
      },
    ];
    for (const mutate of mutations) {
      const input = fixture();
      mutate(input);
      reseal(input);
      assert.throws(() => validate(input));
    }
    for (const input of [null, {}, { ...fixture(), extra: true }, { ...fixture(), roles: [] }])
      assert.throws(() => validate(input));
  });
  it('binds the exact separate source manifest and refuses duplicates or missing role slots', () => {
    for (const path of ['scripts/factory-protocol.ts', '../factory-roles.ts']) {
      const input = fixture();
      item(input.context.role_manifest, 0).path = path;
      assert.throws(() => validate(input), /role manifest/);
    }
    const input = fixture();
    input.context.role_manifest.push(item(input.context.role_manifest, 0));
    assert.throws(() => validate(input), /role manifest/);
    for (const length of [0, 9, 11]) {
      const bad = fixture();
      bad.allocations = Array.from({ length }, () => item(bad.allocations, 0));
      assert.throws(() => validate(bad), /allocation/);
    }
  });
});
