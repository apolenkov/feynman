import {
  FactoryFailure,
  canonicalBytes,
  record,
  sha256,
  validateProtocol,
} from './factory-protocol.ts';
import type { JsonRecord } from './factory-protocol.ts';

// Kept separate from CONTROL_FILES: v2 must not change the v1 activation manifest.
export const ROLE_CONTROL_FILES: readonly string[] = Object.freeze(['scripts/factory-roles.ts']);
const ROLES = [
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
] as const;
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
const ID = /^[1-9]\d*$/;
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BINDINGS = [
  'repository_id',
  'workflow_id',
  'workflow_source_sha',
  'control_release_sha',
  'run_id',
  'run_attempt',
];

function fail(message: string): never {
  throw new FactoryFailure(`Invalid v2 ${message}`);
}
function closed(input: unknown, keys: readonly string[]): JsonRecord {
  const value = record(input);
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
    fail('closed fields');
  return value;
}
function text(value: unknown, name: string, pattern?: RegExp): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    (pattern !== undefined && !pattern.test(value))
  )
    fail(name);
  return value;
}
function integer(value: unknown, name: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) fail(name);
  return value;
}
function list(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(name);
  return value;
}

/** Validates data, not authority. Consumers must independently authenticate context and its configuration digest,
 * the reserve artifact AND durable journal inclusion before any role/effect. */
export function validateRoleChain(input: unknown): JsonRecord {
  if (canonicalBytes(input).length > 1_000_000) fail('chain size');
  const chain = closed(input, ['reservation', 'context', 'allocations', 'roles']);
  const reservation = validateProtocol(chain['reservation'], 'receipt');
  const context = closed(chain['context'], [
    'owner_id',
    'owner_login',
    ...BINDINGS,
    'token_budget',
    'timeout_seconds',
    'role_manifest',
    'role_config_sha256',
  ]);
  for (const key of ['owner_id', 'repository_id', 'workflow_id', 'run_id'])
    text(context[key], key, ID);
  for (const key of ['workflow_source_sha', 'control_release_sha']) text(context[key], key, SHA);
  text(context['owner_login'], 'owner_login');
  if (context['run_attempt'] !== 1) fail('run_attempt');
  if (
    reservation['actor_decision'] !== 'owner' ||
    reservation['actor_id'] !== context['owner_id'] ||
    reservation['actor_login'] !== context['owner_login'] ||
    reservation['event'] !== 'workflow_dispatch' ||
    reservation['producer_phase'] !== 'reserve' ||
    reservation['outcome'] !== 'consumed' ||
    reservation['expected_transition'] !== 'reserved' ||
    BINDINGS.some((key) => reservation[key] !== context[key])
  )
    fail('reservation binding');
  text(reservation['lineage_id'], 'lineage_id', DIGEST);
  text(reservation['baseline_sha'], 'baseline_sha', SHA);
  text(reservation['issue_node_id'], 'issue_node_id');
  integer(reservation['issue_number'], 'issue_number', 1);
  if (reservation['reservation_number'] !== 1 && reservation['reservation_number'] !== 2)
    fail('reservation number');

  const manifest = list(context['role_manifest'], 'role manifest');
  if (manifest.length !== ROLE_CONTROL_FILES.length) fail('role manifest');
  for (const [index, entry] of manifest.entries()) {
    const file = closed(entry, ['path', 'blob_sha']);
    if (file['path'] !== ROLE_CONTROL_FILES[index]) fail('role manifest path');
    text(file['blob_sha'], 'role manifest blob', SHA);
  }
  const manifestDigest = sha256(manifest);
  const allocations = list(chain['allocations'], 'allocation');
  if (allocations.length !== ROLES.length) fail('allocation count');
  const slots = allocations.map((entry, index) => {
    const slot = closed(entry, ['role', 'token_budget', 'timeout_seconds']);
    if (slot['role'] !== ROLES[index]) fail('allocation order');
    return slot;
  });
  slots.reduce<{ readonly tokens: number; readonly seconds: number }>(
    (remaining, slot) => {
      const tokens = remaining.tokens - integer(slot['token_budget'], 'allocation token_budget', 1);
      const seconds =
        remaining.seconds - integer(slot['timeout_seconds'], 'allocation timeout_seconds', 1);
      if (tokens < 0 || seconds < 0) fail('allocation exceeds reservation');
      return { tokens, seconds };
    },
    {
      tokens: integer(context['token_budget'], 'token_budget', 1),
      seconds: integer(context['timeout_seconds'], 'timeout_seconds', 1),
    },
  );
  text(context['role_config_sha256'], 'role configuration digest', DIGEST);
  if (sha256(allocations) !== context['role_config_sha256']) fail('role configuration digest');
  const roles = list(chain['roles'], 'roles');
  if (roles.length === 0 || roles.length > ROLES.length) fail('role count');
  const reservationDigest = sha256(reservation);
  const envelopes = roles.map((value) =>
    closed(value, ['receipt', 'receipt_sha256', 'payload', 'transport']),
  );
  for (const [index, envelope] of envelopes.entries()) {
    const receipt = closed(envelope['receipt'], [
      'schema',
      ...BINDINGS,
      'lineage_id',
      'reservation_number',
      'reservation_receipt_sha256',
      'role_control_manifest_sha256',
      'role_config_sha256',
      'role',
      'predecessor_sha256',
      'baseline_sha',
      'final_sha',
      'payload_sha256',
      'outcome',
      'token_budget',
      'timeout_seconds',
      'token_usage',
      'elapsed_ms',
    ]);
    if (
      receipt['schema'] !== 'factory-role/v2' ||
      BINDINGS.some((key) => receipt[key] !== context[key]) ||
      receipt['lineage_id'] !== reservation['lineage_id'] ||
      receipt['reservation_number'] !== reservation['reservation_number'] ||
      receipt['reservation_receipt_sha256'] !== reservationDigest ||
      receipt['baseline_sha'] !== reservation['baseline_sha'] ||
      receipt['role_control_manifest_sha256'] !== manifestDigest ||
      receipt['role_config_sha256'] !== context['role_config_sha256']
    )
      fail('role binding');
    if (receipt['role'] !== ROLES[index]) fail('role order');
    if (
      receipt['outcome'] !== OUTCOMES[index] &&
      !(receipt['role'] === 'release' && receipt['outcome'] === 'released')
    )
      fail('role outcome');
    const predecessor = index === 0 ? reservationDigest : sha256(envelopes[index - 1]?.['receipt']);
    if (receipt['predecessor_sha256'] !== predecessor) fail('predecessor');
    const finalHead =
      index < 5 ? null : text(record(envelopes[5]?.['receipt'])['final_sha'], 'final head', SHA);
    if (receipt['final_sha'] !== finalHead) fail('final head drift');
    const slot = slots[index];
    if (
      slot === undefined ||
      receipt['token_budget'] !== slot['token_budget'] ||
      receipt['timeout_seconds'] !== slot['timeout_seconds'] ||
      integer(receipt['token_usage'], 'token_usage') >
        integer(slot['token_budget'], 'token_budget') ||
      integer(receipt['elapsed_ms'], 'elapsed_ms') / 1000 >
        integer(slot['timeout_seconds'], 'timeout_seconds')
    )
      fail('role budget');
    if (sha256(record(envelope['payload'])) !== receipt['payload_sha256']) fail('payload digest');
    if (envelope['receipt_sha256'] !== sha256(receipt)) fail('receipt digest');
    const transport = closed(envelope['transport'], [
      'artifact_id',
      'archive_sha256',
      'producer_job_id',
      'producer_log_sha256',
    ]);
    const artifactId = text(transport['artifact_id'], 'artifact_id', ID);
    const producerId = text(transport['producer_job_id'], 'producer_job_id', ID);
    text(transport['archive_sha256'], 'archive_sha256', DIGEST);
    text(transport['producer_log_sha256'], 'producer_log_sha256', DIGEST);
    if (
      envelopes.slice(0, index).some((previous) => {
        const identity = record(previous['transport']);
        return identity['artifact_id'] === artifactId || identity['producer_job_id'] === producerId;
      })
    )
      fail('duplicate transport identity');
  }
  return record(envelopes.at(-1)?.['receipt']);
}
