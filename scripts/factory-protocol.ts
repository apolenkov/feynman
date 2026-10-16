import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import canonicalize from 'canonicalize';

export type JsonRecord = Readonly<Record<string, unknown>>;
export type FactoryPolicy = JsonRecord;
export type ReceiptCore = JsonRecord;
export type ReceiptEnvelope = JsonRecord;
export type CheckpointCore = JsonRecord;
export type CheckpointFile = JsonRecord;
export type Lineage = JsonRecord;
export type Operation = JsonRecord;
export interface FactoryDecision {
  readonly status: string;
  readonly reason: string;
  readonly record?: JsonRecord;
}
export interface FactoryContext {
  readonly policy: FactoryPolicy;
  readonly staticPolicy: FactoryPolicy;
  readonly token: string;
  readonly job: JsonRecord;
  readonly role: 'repair' | 'bootstrap' | 'stop';
}
export class GitHubFailure extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`GitHub request failed status ${status}`);
    this.status = status;
  }
}
export class FactoryFailure extends Error {}
export function safeReason(error: unknown): string {
  return error instanceof FactoryFailure || error instanceof GitHubFailure
    ? error.message
    : 'Invalid or unavailable authority; preserve work and consumption';
}

export function record(value: unknown): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new FactoryFailure('Expected object');
  return Object.fromEntries(Object.entries(value));
}
export function parseFactoryJson(bytes: string | Buffer): JsonRecord {
  try {
    return record(JSON.parse(bytes.toString()));
  } catch {
    throw new FactoryFailure('Invalid factory JSON; preserve work');
  }
}
export function stringField(value: JsonRecord, key: string): string {
  const field = value[key];
  if (typeof field !== 'string' || !field) throw new FactoryFailure(`Invalid string ${key}`);
  return field;
}
export function numberField(value: JsonRecord, key: string): number {
  const field = value[key];
  if (typeof field !== 'number' || !Number.isSafeInteger(field) || field < 0)
    throw new FactoryFailure(`Invalid integer ${key}`);
  return field;
}
export function arrayField(value: JsonRecord, key: string): readonly unknown[] {
  const field = value[key];
  if (!Array.isArray(field)) throw new FactoryFailure(`Invalid array ${key}`);
  return field;
}
export function booleanField(value: JsonRecord, key: string): boolean {
  const field = value[key];
  if (typeof field !== 'boolean') throw new FactoryFailure(`Invalid boolean ${key}`);
  return field;
}
function jsonValue(value: unknown): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new FactoryFailure('JSON number must be finite');
    return;
  }
  if (typeof value === 'string') {
    if (/[\uD800-\uDFFF]/u.test(value)) throw new FactoryFailure('JSON lone surrogate');
    return;
  }
  if (value === null || typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    for (const item of value) jsonValue(item);
    return;
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    throw new FactoryFailure('JSON value required');
  for (const [key, item] of Object.entries(value)) {
    jsonValue(key);
    jsonValue(item);
  }
}
export function canonicalBytes(value: unknown): Buffer {
  jsonValue(value);
  const serialized = canonicalize(value);
  if (serialized === undefined) throw new FactoryFailure('JSON value required');
  return Buffer.from(serialized, 'utf8');
}
export function sha256(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(Buffer.isBuffer(value) ? value : canonicalBytes(value))
    .digest('hex');
}

type Validator = (value: unknown) => boolean;
const text: Validator = (v) => typeof v === 'string' && v.length > 0 && !/[\uD800-\uDFFF]/u.test(v);
const id: Validator = (v) => typeof v === 'string' && /^[1-9]\d*$/.test(v);
const gitId: Validator = (v) => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v);
const digest: Validator = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer: Validator = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const bool: Validator = (v) => typeof v === 'boolean';
const timestamp: Validator = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 19) === v.slice(0, 19);
const nullable =
  (validator: Validator): Validator =>
  (v) =>
    v === null || validator(v);
const choice =
  (...values: readonly unknown[]): Validator =>
  (v) =>
    values.includes(v);
const list =
  (validator: Validator): Validator =>
  (v) =>
    Array.isArray(v) && v.every(validator);
function closed(value: unknown, fields: Readonly<Record<string, Validator>>): JsonRecord {
  const object = record(value);
  if (
    Object.keys(object).length !== Object.keys(fields).length ||
    Object.keys(object).some((key) => !Object.hasOwn(fields, key))
  )
    throw new FactoryFailure('Closed protocol fields mismatch');
  for (const [key, validate] of Object.entries(fields))
    if (!validate(object[key])) throw new FactoryFailure(`Invalid protocol field ${key}`);
  return object;
}
const objectSchema =
  (fields: Readonly<Record<string, Validator>>): Validator =>
  (v) => {
    closed(v, fields);
    return true;
  };
const schema = choice('factory/v1');
const ticketFields = {
  schema,
  repository_id: id,
  epoch_id: text,
  control_release_sha: gitId,
  legacy_mode: choice('quarantine'),
  legacy_cutoff_sha: gitId,
  legacy_cutoff_at: timestamp,
};
const aliasFields = {
  kind: choice('issue', 'pr', 'branch', 'ci-run'),
  id: text,
  head: nullable(gitId),
  original_identity_sha256: digest,
};
const evidenceFields = {
  artifact_id: id,
  archive_sha256: digest,
  receipt_sha256: digest,
  run_id: id,
  run_attempt: integer,
  producer_job_id: id,
  source_sha: gitId,
};
const reservationFields = {
  number: choice(1, 2),
  transition_id: digest,
  request_key: digest,
  provider_owner_run_id: id,
  provider_owner_run_attempt: choice(1),
  baseline_sha: gitId,
  current_source_head: gitId,
  consumed: choice(true),
  outcome: text,
};
const operationFields = {
  initial_claimed: bool,
  retry_claimed: bool,
  status: choice('intent', 'succeeded', 'retryable-failure', 'ambiguous', 'denied', 'exhausted'),
  payload_sha256: digest,
  target_id: text,
  expected_head: nullable(gitId),
  result_id: nullable(text),
  reason: nullable(text),
};
const bootstrapFields = {
  schema,
  repository_id: id,
  epoch_id: text,
  genesis_head: nullable(gitId),
  genesis_receipt_sha256: digest,
  activation_policy_sha256: nullable(digest),
  legacy_mode: choice('quarantine'),
  legacy_cutoff_sha: gitId,
  legacy_cutoff_at: timestamp,
  bootstrap_completed: bool,
  phase: choice('genesis', 'active'),
  legacy_inventory_sha256: digest,
};
const markerFields = {
  schema,
  kind: choice('receipt', 'checkpoint'),
  run_id: id,
  run_attempt: integer,
  workflow_id: id,
  workflow_source_sha: gitId,
  control_release_sha: gitId,
  phase: text,
  transition_id: digest,
  artifact_id: id,
  archive_sha256: digest,
  receipt_sha256: digest,
};
const receiptFields = {
  schema,
  kind: choice('receipt'),
  transition_id: digest,
  epoch_id: text,
  sequence: integer,
  parent_head: nullable(gitId),
  parent_checkpoint_head: nullable(gitId),
  repository_id: id,
  repository_full_name: text,
  workflow_id: id,
  workflow_path: text,
  workflow_source_sha: gitId,
  control_release_sha: gitId,
  control_manifest_sha256: digest,
  default_ref: choice('refs/heads/main'),
  default_head: gitId,
  run_id: id,
  run_attempt: choice(1),
  event: text,
  actor_id: id,
  actor_login: text,
  actor_decision: choice('owner', 'approved-publisher', 'denied'),
  producer_phase: text,
  request_key: digest,
  lineage_id: nullable(digest),
  issue_node_id: nullable(text),
  issue_number: nullable(integer),
  fingerprint_policy_revision: nullable(text),
  fingerprint: nullable(digest),
  baseline_sha: nullable(gitId),
  current_source_head: nullable(gitId),
  expected_transition: text,
  reservation_number: nullable(choice(1, 2)),
  operation: nullable(objectSchema(operationFields)),
  aliases: list(objectSchema(aliasFields)),
  outcome: text,
  evidence: objectSchema({
    scan: nullable(objectSchema(evidenceFields)),
    verifier: nullable(objectSchema(evidenceFields)),
  }),
};
const checkpointFields = {
  schema,
  epoch_id: text,
  sequence: integer,
  bootstrap: objectSchema(bootstrapFields),
  previous_external_checkpoint_head: nullable(gitId),
  last_transition_id: digest,
  receipt_sha256: digest,
  state_payload_sha256: digest,
};
const checkpointCoreFields = {
  schema,
  kind: choice('checkpoint'),
  epoch_id: text,
  sequence: integer,
  state_head: gitId,
  checkpoint_file_sha256: digest,
  state_payload_sha256: digest,
  previous_checkpoint_head: nullable(gitId),
  receipt_sha256: digest,
  run_id: id,
  run_attempt: choice(1),
  workflow_id: id,
  workflow_source_sha: gitId,
  control_release_sha: gitId,
  control_manifest_sha256: digest,
};

export function parseProtocol(bytes: Buffer, kind: string): JsonRecord {
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const parsed: unknown = JSON.parse(decoded);
  if (!canonicalBytes(parsed).equals(bytes))
    throw new FactoryFailure('Protocol bytes must be canonical (no duplicate keys/BOM/newline)');
  return validateProtocol(parsed, kind);
}
export function validateProtocol(value: unknown, kind: string): JsonRecord {
  const input = record(value);
  let result: JsonRecord;
  switch (kind) {
    case 'ticket':
      result = closed(input, ticketFields);
      break;
    case 'marker':
      result = closed(input, markerFields);
      break;
    case 'bootstrap': {
      result = closed(input, bootstrapFields);
      const genesis = result['phase'] === 'genesis';
      if (
        genesis !== (result['genesis_head'] === null) ||
        genesis !== (result['activation_policy_sha256'] === null) ||
        booleanField(result, 'bootstrap_completed') === genesis
      )
        throw new FactoryFailure('Invalid genesis/active bindings');
      break;
    }
    case 'receipt': {
      const genesis = input['producer_phase'] === 'bootstrap';
      result = closed(
        input,
        genesis
          ? {
              ...receiptFields,
              bootstrap_ticket: objectSchema(ticketFields),
              legacy_inventory_sha256: digest,
            }
          : receiptFields,
      );
      if (genesis) {
        if (
          numberField(result, 'sequence') !== 0 ||
          result['parent_head'] !== null ||
          result['parent_checkpoint_head'] !== null ||
          result['reservation_number'] !== null
        )
          throw new FactoryFailure('Invalid genesis receipt');
      } else if (
        result['parent_head'] === null ||
        result['parent_checkpoint_head'] === null ||
        numberField(result, 'sequence') === 0
      )
        throw new FactoryFailure('Missing receipt predecessor');
      const lineageFields = [
        'lineage_id',
        'issue_node_id',
        'issue_number',
        'fingerprint_policy_revision',
        'fingerprint',
        'baseline_sha',
        'current_source_head',
        'reservation_number',
      ];
      if (result['lineage_id'] === null && lineageFields.some((key) => result[key] !== null))
        throw new FactoryFailure('Non-lineage fields must all be null');
      if (
        stringField(result, 'transition_id') !==
        sha256({
          epoch_id: result['epoch_id'],
          request_key: result['request_key'],
          phase: result['producer_phase'],
          ordinal: result['sequence'],
        })
      )
        throw new FactoryFailure('Transition identity mismatch');
      break;
    }
    case 'envelope': {
      result = closed(input, {
        schema,
        receipt: (v) => {
          validateProtocol(v, 'receipt');
          return true;
        },
        receipt_sha256: digest,
        transport: objectSchema({
          artifact_id: id,
          archive_sha256: digest,
          producer_job_id: id,
          producer_log_sha256: digest,
        }),
      });
      if (sha256(result['receipt']) !== result['receipt_sha256'])
        throw new FactoryFailure('Receipt digest mismatch');
      break;
    }
    case 'checkpoint': {
      result = closed(input, checkpointFields);
      const bootstrap = validateProtocol(result['bootstrap'], 'bootstrap');
      if (
        (bootstrap['phase'] === 'genesis') !== (numberField(result, 'sequence') === 0) ||
        (numberField(result, 'sequence') === 0) !==
          (result['previous_external_checkpoint_head'] === null)
      )
        throw new FactoryFailure('Checkpoint phase/sequence mismatch');
      break;
    }
    case 'checkpoint-core': {
      result = closed(input, checkpointCoreFields);
      if ((numberField(result, 'sequence') === 0) !== (result['previous_checkpoint_head'] === null))
        throw new FactoryFailure('Checkpoint predecessor mismatch');
      break;
    }
    case 'inventory':
      result = closed(input, {
        schema,
        repository_id: id,
        epoch_id: text,
        legacy_cutoff_sha: gitId,
        legacy_cutoff_at: timestamp,
        lineages: list(objectSchema({ lineage_id: digest, file_sha256: digest })),
      });
      break;
    case 'lineage': {
      result = closed(input, {
        schema,
        epoch_id: text,
        lineage_id: digest,
        identity: (v) => {
          const identity = record(v);
          closed(
            identity,
            identity['kind'] === undefined
              ? {
                  repository_id: id,
                  fingerprint_policy_revision: text,
                  fingerprint: digest,
                  issue_node_id: text,
                }
              : { repository_id: id, kind: choice('pr'), original_update_identity: text },
          );
          return true;
        },
        confidence: choice('confirmed', 'disputed', 'refuted', 'unknown'),
        repair_state: choice(
          'not-requested',
          'eligible',
          'reserved',
          'running',
          'patch-ready',
          'pushed',
          'pr-open',
          'merged',
          'closed',
          'needs-human',
          'exhausted',
        ),
        history_status: choice('verified', 'unknown'),
        reservations: list(objectSchema(reservationFields)),
        operations: (v) => {
          for (const [key, operation] of Object.entries(record(v))) {
            if (!digest(key)) throw new FactoryFailure('Operation key mismatch');
            closed(operation, operationFields);
          }
          return true;
        },
        aliases: list(objectSchema(aliasFields)),
        last_transition_id: digest,
      });
      if (result['lineage_id'] !== sha256(result['identity']))
        throw new FactoryFailure('Lineage identity mismatch');
      const reservations = arrayField(result, 'reservations');
      if (reservations.length > 2 || reservations.some((r, i) => record(r)['number'] !== i + 1))
        throw new FactoryFailure('Reservation sequence mismatch');
      break;
    }
    default:
      throw new FactoryFailure(`Unknown protocol schema ${kind}`);
  }
  if (result['aliases'] !== undefined) canonicalSet(arrayField(result, 'aliases'));
  if (kind === 'inventory') canonicalSet(arrayField(result, 'lineages'));
  return result;
}
function canonicalSet(values: readonly unknown[]): void {
  const sorted = values.map((value) => canonicalBytes(value));
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous === undefined || current === undefined || Buffer.compare(previous, current) >= 0)
      throw new FactoryFailure('Protocol set must be sorted and duplicate-free');
  }
}

export function loadFactoryPolicy(): FactoryPolicy {
  const input: unknown = JSON.parse(
    fs.readFileSync(new URL('./factory-policy.json', import.meta.url), 'utf8'),
  );
  const policy = record(input);
  if (
    policy['schema'] !== 'factory/v1' ||
    policy['repository_id'] !== '1230959148' ||
    policy['repository_full_name'] !== 'apolenkov/feynman'
  )
    throw new FactoryFailure('Unknown factory policy binding');
  booleanField(policy, 'activation');
  return policy;
}
export function createFactoryContext(
  policy: FactoryPolicy,
  token: string,
  job: JsonRecord = {
    run_id: process.env['GITHUB_RUN_ID'] ?? '',
    run_attempt: Number(process.env['GITHUB_RUN_ATTEMPT'] ?? '0'),
    workflow_source_sha: process.env['GITHUB_WORKFLOW_SHA'] ?? '',
    workflow_ref: process.env['GITHUB_WORKFLOW_REF'] ?? '',
    activation_policy_pin: process.env['FACTORY_ACTIVATION_POLICY_PIN'] ?? '',
  },
  role: FactoryContext['role'] = 'repair',
): FactoryContext {
  return { policy, staticPolicy: policy, token, job, role };
}
export async function resolveFactoryContext(context: FactoryContext): Promise<FactoryContext> {
  const pin = context.job['activation_policy_pin'];
  if (typeof pin !== 'string' || !/^[a-f0-9]{40}:[a-f0-9]{40}$/.test(pin)) {
    if (context.role === 'repair')
      throw new FactoryFailure(
        'Factory disabled: independently approved activation policy pin unknown',
      );
    throw new FactoryFailure('Independent bootstrap/stop policy pin unknown');
  }
  const [revision, blobId] = pin.split(':');
  if (revision === undefined || blobId === undefined)
    throw new FactoryFailure('Independent activation policy pin invalid');
  const metadata = record(
    await githubRequest(
      context,
      `/repos/apolenkov/feynman/contents/activation-policy.json?ref=${revision}`,
    ),
  );
  if (
    metadata['type'] !== 'file' ||
    metadata['sha'] !== blobId ||
    metadata['encoding'] !== 'base64'
  )
    throw new FactoryFailure('Independent activation policy Git locator mismatch');
  const bytes = Buffer.from(stringField(metadata, 'content'), 'base64');
  const gitHash = crypto
    .createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest('hex');
  if (gitHash !== blobId) throw new FactoryFailure('Activation policy pinned blob bytes mismatch');
  const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const activation = closed(parsed, {
    schema,
    repository_id: id,
    activation: bool,
    control_release_sha: gitId,
    control_manifest: list(objectSchema({ path: text, blob_sha: gitId })),
    controller_workflow_id: id,
    workflow_registry: list(objectSchema({ id, path: text, mutating: bool })),
    epoch_id: text,
    genesis_head: nullable(gitId),
    genesis_receipt_sha256: nullable(digest),
    bootstrap_ticket: nullable(objectSchema(ticketFields)),
    legacy_inventory_sha256: nullable(digest),
    bootstrap_completed: bool,
    provider_transport: nullable(text),
    token_budget: nullable(integer),
    timeout_seconds: nullable(integer),
  });
  if (activation['repository_id'] !== '1230959148')
    throw new FactoryFailure('Foreign activation policy repository');
  const staticRegistry = arrayField(context.staticPolicy, 'workflow_registry').map(record);
  const registry = arrayField(activation, 'workflow_registry').map(record);
  if (
    registry.length !== staticRegistry.length ||
    new Set(registry.map((entry) => entry['id'])).size !== registry.length ||
    new Set(registry.map((entry) => entry['path'])).size !== registry.length ||
    !registry.some(
      (entry) =>
        entry['id'] === activation['controller_workflow_id'] &&
        entry['path'] === context.staticPolicy['controller_workflow_path'],
    ) ||
    registry.some(
      (entry) =>
        !staticRegistry.some(
          (staticEntry) =>
            staticEntry['path'] === entry['path'] && staticEntry['mutating'] === entry['mutating'],
        ),
    )
  )
    throw new FactoryFailure('Activation cannot choose executable workflow paths/roles');
  const manifest = arrayField(activation, 'control_manifest').map(record);
  const requiredManifest = [
    ...staticRegistry.map((entry) => stringField(entry, 'path')),
    ...CONTROL_FILES,
  ];
  if (
    manifest.length !== requiredManifest.length ||
    new Set(manifest.map((entry) => entry['path'])).size !== manifest.length ||
    manifest.some((entry) => !requiredManifest.includes(stringField(entry, 'path')))
  )
    throw new FactoryFailure(
      'Complete static control release manifest required; activation cannot choose executable paths',
    );
  const activeDigest = sha256(activation);
  if (
    context.policy['activation_policy_sha256'] !== undefined &&
    context.policy['activation_policy_sha256'] !== activeDigest
  )
    throw new FactoryFailure('Activation policy changed during operation');
  return {
    ...context,
    policy: { ...context.staticPolicy, ...activation, activation_policy_sha256: activeDigest },
  };
}
export function effectPolicy(context: FactoryContext): void {
  const p = context.policy;
  if (p['activation_policy_sha256'] === undefined)
    throw new FactoryFailure(
      context.role === 'repair'
        ? 'Factory disabled: independent activation policy not verified'
        : 'Independent role policy not verified',
    );
  if (context.role === 'repair' && p['activation'] !== true)
    throw new FactoryFailure('Factory disabled');
  for (const key of ['controller_workflow_id', 'control_release_sha'])
    if (p[key] === null || p[key] === undefined)
      throw new FactoryFailure(`Unknown authority ${key}`);
  if (arrayField(p, 'control_manifest').length === 0)
    throw new FactoryFailure('Unknown control manifest');
  if (numberField(context.job, 'run_attempt') !== 1)
    throw new FactoryFailure('Rerun cannot perform effects');
  if (context.role === 'stop') {
    if (
      arrayField(p, 'workflow_registry')
        .map(record)
        .some((entry) => entry['id'] === null)
    )
      throw new FactoryFailure('Unknown stop registry');
    return;
  }
  if (context.role === 'bootstrap') {
    if (
      p['activation'] !== false ||
      p['bootstrap_completed'] !== false ||
      p['genesis_head'] !== null ||
      p['bootstrap_ticket'] === null
    )
      throw new FactoryFailure('Explicit reviewed disabled bootstrap ticket required');
    const ticket = validateProtocol(p['bootstrap_ticket'], 'ticket');
    if (
      ticket['repository_id'] !== p['repository_id'] ||
      ticket['epoch_id'] !== p['epoch_id'] ||
      ticket['control_release_sha'] !== p['control_release_sha']
    )
      throw new FactoryFailure('Bootstrap policy/ticket mismatch');
    return;
  }
  for (const key of [
    'epoch_id',
    'genesis_head',
    'genesis_receipt_sha256',
    'legacy_inventory_sha256',
    'provider_transport',
  ])
    if (p[key] === null || p[key] === undefined)
      throw new FactoryFailure(`Unknown authority/budget ${key}`);
  if (
    numberField(p, 'token_budget') === 0 ||
    numberField(p, 'timeout_seconds') === 0 ||
    p['bootstrap_completed'] !== true
  )
    throw new FactoryFailure('Unknown finite budget or bootstrap');
}
export async function githubRequest(
  context: FactoryContext,
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<unknown> {
  const prefix = '/repos/apolenkov/feynman';
  if (
    context.policy['repository_id'] !== '1230959148' ||
    context.policy['repository_full_name'] !== 'apolenkov/feynman' ||
    context.policy['api_origin'] !== 'https://api.github.com'
  )
    throw new FactoryFailure('Unknown fixed API/repository binding');
  if (method !== 'GET') effectPolicy(context);
  if (method !== 'GET' && context.role === 'bootstrap') {
    if (
      !/^\/repos\/apolenkov\/feynman\/git\/(blobs|trees|commits|refs)$/.test(path) ||
      method !== 'POST'
    )
      throw new FactoryFailure('Bootstrap role cannot mutate ordinary refs or workflows');
    if (path.endsWith('/refs') && record(body)['ref'] !== 'refs/heads/factory-state')
      throw new FactoryFailure('Bootstrap ref must be exact new state ref');
    if (path.endsWith('/commits') && arrayField(record(body), 'parents').length !== 0)
      throw new FactoryFailure('Bootstrap commit must be root');
  }
  if (
    method !== 'GET' &&
    context.role === 'stop' &&
    !(
      (method === 'PUT' &&
        /^\/repos\/apolenkov\/feynman\/actions\/workflows\/\d+\/disable$/.test(path)) ||
      (method === 'POST' && /^\/repos\/apolenkov\/feynman\/actions\/runs\/\d+\/cancel$/.test(path))
    )
  )
    throw new FactoryFailure('Emergency stop role cannot perform repair or unrelated mutations');
  if (!context.token) throw new FactoryFailure('Missing authenticated transport');
  const endpoint = new URL(path, stringField(context.policy, 'api_origin'));
  const decodedPath = decodeURIComponent(endpoint.pathname);
  if (
    endpoint.origin !== 'https://api.github.com' ||
    (decodedPath !== prefix && !decodedPath.startsWith(`${prefix}/`)) ||
    decodedPath.includes('\\') ||
    decodedPath.split('/').some((part) => part === '.' || part === '..') ||
    /[\x00-\x1f]/.test(decodedPath)
  )
    throw new FactoryFailure('Foreign normalized API route/origin');
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
    Authorization: `Bearer ${context.token}`,
    'Content-Type': 'application/json',
  };
  const response = await fetch(endpoint, {
    method,
    headers,
    redirect: 'error',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new GitHubFailure(response.status);
  if (response.status === 204) return null;
  const value: unknown = await response.json();
  return value;
}
export async function githubPages(
  context: FactoryContext,
  path: string,
  member?: string,
): Promise<readonly unknown[]> {
  const values: unknown[] = [];
  let next: string | null = `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=1`;
  const visited = new Set<string>();
  const initial = new URL(path, 'https://api.github.com');
  let expectedCount: number | null = null;
  for (let page = 1; page <= 100; page++) {
    if (visited.has(next)) throw new FactoryFailure('Unknown/cyclic pagination');
    visited.add(next);
    if (context.policy['api_origin'] !== 'https://api.github.com' || !context.token)
      throw new FactoryFailure('Unknown authenticated fixed pagination origin');
    const endpoint = new URL(next, 'https://api.github.com');
    // GitHub Link headers may identify the same repository by its immutable numeric ID.
    const route = endpoint.pathname.replace(
      /^\/repositories\/1230959148\//,
      '/repos/apolenkov/feynman/',
    );
    const decoded = decodeURIComponent(route);
    if (
      endpoint.origin !== 'https://api.github.com' ||
      route !== initial.pathname ||
      !decoded.startsWith('/repos/apolenkov/feynman/') ||
      decoded.includes('\\') ||
      context.policy['repository_id'] !== '1230959148'
    )
      throw new FactoryFailure('Foreign pagination origin/route');
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${context.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new GitHubFailure(response.status);
    const result: unknown = await response.json();
    const items: readonly unknown[] =
      member === undefined
        ? Array.isArray(result)
          ? result
          : (() => {
              throw new FactoryFailure('Unknown pagination');
            })()
        : arrayField(record(result), member);
    values.push(...items);
    const count = member === undefined ? null : numberField(record(result), 'total_count');
    if (count !== null && expectedCount !== null && count !== expectedCount)
      throw new FactoryFailure('Pagination count changed');
    if (count !== null) expectedCount = count;
    const links = response.headers.get('link');
    if (
      links !== null &&
      !links
        .split(',')
        .every((link) => /^\s*<[^>]+>;\s*rel="(?:next|prev|first|last)"\s*$/.test(link))
    )
      throw new FactoryFailure('Malformed pagination Link');
    const following = links === null ? [] : [...links.matchAll(/<([^>]+)>;\s*rel="next"/g)];
    if (following.length > 1) throw new FactoryFailure('Ambiguous pagination Link');
    next = following[0]?.[1] ?? null;
    if (next === null) {
      if (count !== null && count !== values.length)
        throw new FactoryFailure('Incomplete pagination count');
      return values;
    }
  }
  throw new FactoryFailure('Incomplete pagination ceiling');
}
// Controlled files beyond the workflow registry; every local import of a factory script must be listed.
export const CONTROL_FILES: readonly string[] = [
  'scripts/factory-policy.json',
  'scripts/factory-protocol.ts',
  'scripts/factory-paths.ts',
  'scripts/factory-control.ts',
  'scripts/factory-publication.ts',
  'scripts/factory-writer.ts',
  'scripts/factory-operations.ts',
  'scripts/factory-preservation.ts',
  'scripts/factory-model.ts',
  'scripts/factory-scan-record.ts',
  'scripts/check-factory-workflows.ts',
  'package.json',
  'package-lock.json',
  'tools/ocr/package.json',
  'tools/ocr/package-lock.json',
  '.github/workflows/ci.yml',
];
// `scheduledPath` additionally lets that one registered workflow run on `schedule` (the night review).
export async function verifyControlSource(
  context: FactoryContext,
  stopping = false,
  scheduledPath?: string,
): Promise<void> {
  // The relaxed control-closure check is for the dedicated stop role only (ADR 0007, emergency stop exception).
  if (stopping && context.role !== 'stop')
    throw new FactoryFailure('Emergency stop verification requires the stop role');
  effectPolicy(context);
  const p = context.policy;
  const base = `/repos/${stringField(p, 'repository_full_name')}`;
  const repo = record(await githubRequest(context, base));
  if (
    String(repo['id']) !== p['repository_id'] ||
    repo['full_name'] !== p['repository_full_name'] ||
    repo['default_branch'] !== 'main' ||
    String(record(repo['owner'])['id']) !== p['owner_id'] ||
    repo['visibility'] !== 'public'
  )
    throw new FactoryFailure('Repository/owner/default/public visibility drift');
  const attempt = record(
    await githubRequest(
      context,
      `${base}/actions/runs/${stringField(context.job, 'run_id')}/attempts/1`,
    ),
  );
  if (
    context.role !== 'repair' &&
    (String(record(attempt['actor'])['id']) !== p['owner_id'] ||
      String(record(attempt['triggering_actor'])['id']) !== p['owner_id'])
  )
    throw new FactoryFailure('Owner bootstrap/stop actor not authenticated');
  const registered = arrayField(p, 'workflow_registry')
    .map(record)
    .find((entry) => entry['id'] === String(attempt['workflow_id']));
  if (registered === undefined) throw new FactoryFailure('Unregistered job workflow');
  const workflow = record(
    await githubRequest(context, `${base}/actions/workflows/${stringField(registered, 'id')}`),
  );
  if (
    String(workflow['id']) !== registered['id'] ||
    workflow['path'] !== registered['path'] ||
    (!stopping && workflow['state'] !== 'active')
  )
    throw new FactoryFailure('Foreign/disabled job workflow');
  if (
    !(
      attempt['event'] === 'workflow_dispatch' ||
      (attempt['event'] === 'schedule' &&
        scheduledPath !== undefined &&
        registered['path'] === scheduledPath)
    ) ||
    attempt['head_branch'] !== 'main' ||
    attempt['run_attempt'] !== 1 ||
    attempt['head_sha'] !== context.job['workflow_source_sha'] ||
    String(record(attempt['repository'])['id']) !== p['repository_id'] ||
    String(record(attempt['head_repository'])['id']) !== p['repository_id']
  )
    throw new FactoryFailure('Untrusted job run/attempt/source');
  if (
    context.job['workflow_ref'] !==
    `${stringField(p, 'repository_full_name')}/${stringField(registered, 'path')}@refs/heads/main`
  )
    throw new FactoryFailure('Untrusted workflow ref');
  // Emergency stop only disables, cancels and unarms: it keeps the repository, owner, actor, registry and
  // run identity checks above but must not depend on the control files still matching the release.
  if (stopping) return;
  const live = stringField(
    record(record(await githubRequest(context, `${base}/git/ref/heads/main`))['object']),
    'sha',
  );
  const ancestry = record(
    await githubRequest(
      context,
      `${base}/compare/${stringField(p, 'control_release_sha')}...${live}`,
    ),
  );
  if (!['ahead', 'identical'].includes(stringField(ancestry, 'status')))
    throw new FactoryFailure('Control release is not ancestor');
  for (const entry of arrayField(p, 'control_manifest')) {
    const manifest = record(entry);
    for (const revision of [
      live,
      stringField(context.job, 'workflow_source_sha'),
      stringField(p, 'control_release_sha'),
    ]) {
      const blob = record(
        await githubRequest(
          context,
          `${base}/contents/${stringField(manifest, 'path')}?ref=${revision}`,
        ),
      );
      if (blob['type'] !== 'file' || blob['sha'] !== manifest['blob_sha'])
        throw new FactoryFailure('Changed approved control blob');
    }
  }
  if (context.role === 'stop' || context.role === 'bootstrap') return;
  // Fail closed: an absent, unreadable or non-false stop.json denies ordinary effects.
  const stop = record(await githubRequest(context, `${base}/contents/stop.json?ref=factory-state`));
  const stopped: unknown = JSON.parse(
    Buffer.from(stringField(stop, 'content'), 'base64').toString('utf8'),
  );
  if (record(stopped)['stopped'] !== false) throw new FactoryFailure('Stop active or unknown');
}
export async function githubGraphQL(
  context: FactoryContext,
  query: string,
  variables: JsonRecord,
  mutation = false,
): Promise<JsonRecord> {
  if (mutation) {
    effectPolicy(context);
    if (
      context.role === 'bootstrap' ||
      (context.role === 'stop' &&
        query !==
          'mutation($id:ID!){disablePullRequestAutoMerge(input:{pullRequestId:$id}){clientMutationId}}')
    )
      throw new FactoryFailure('Role cannot perform unrelated GraphQL mutation');
  }
  if (!context.token) throw new FactoryFailure('Missing authenticated GraphQL transport');
  if (
    context.policy['api_origin'] !== 'https://api.github.com' ||
    context.policy['repository_id'] !== '1230959148'
  )
    throw new FactoryFailure('Unknown fixed GraphQL origin/repository');
  const endpoint = new URL('/graphql', stringField(context.policy, 'api_origin'));
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${context.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new FactoryFailure('Unknown GraphQL response');
  const value: unknown = await response.json();
  const result = record(value);
  if (result['errors'] !== undefined) throw new FactoryFailure('Unknown GraphQL result');
  return record(result['data']);
}
export function produceReceipt(fields: JsonRecord): ReceiptCore {
  const receipt = {
    ...fields,
    schema: 'factory/v1',
    kind: 'receipt',
    transition_id: sha256({
      epoch_id: fields['epoch_id'],
      request_key: fields['request_key'],
      phase: fields['producer_phase'],
      ordinal: fields['sequence'],
    }),
  };
  return validateProtocol(receipt, 'receipt');
}
export function emitAuthority(fields: JsonRecord): string {
  return `FACTORY_AUTHORITY_V1 ${canonicalBytes(validateProtocol(fields, 'marker')).toString('utf8')}`;
}
export async function verifyAuthority(
  context: FactoryContext,
  envelope: JsonRecord,
): Promise<ReceiptCore> {
  const receipt = validateProtocol(envelope['receipt'], 'receipt');
  validateProtocol(envelope, 'envelope');
  await verifyArchiveAuthority(
    context,
    receipt,
    record(envelope['transport']),
    'receipt',
    stringField(receipt, 'producer_phase'),
    stringField(receipt, 'transition_id'),
  );
  return receipt;
}
export async function verifyEvidenceReference(
  context: FactoryContext,
  value: unknown,
  phase: 'scan' | 'verifier',
  expectedHead: string,
  target: string,
): Promise<ReceiptCore> {
  const reference = closed(value, evidenceFields);
  const core = parseProtocol(
    await readAuthorityArchive(
      context,
      stringField(reference, 'artifact_id'),
      stringField(reference, 'archive_sha256'),
      'receipt',
    ),
    'receipt',
  );
  const log = await readAuthorityLog(context, stringField(reference, 'producer_job_id'));
  const envelope = {
    schema: 'factory/v1',
    receipt: core,
    receipt_sha256: sha256(core),
    transport: {
      artifact_id: reference['artifact_id'],
      archive_sha256: reference['archive_sha256'],
      producer_job_id: reference['producer_job_id'],
      producer_log_sha256: sha256(log),
    },
  };
  await verifyAuthority(context, envelope);
  const operation = record(core['operation']);
  if (
    core['producer_phase'] !== phase ||
    core['lineage_id'] !== null ||
    sha256(core) !== reference['receipt_sha256'] ||
    core['run_id'] !== reference['run_id'] ||
    core['run_attempt'] !== reference['run_attempt'] ||
    core['workflow_source_sha'] !== reference['source_sha'] ||
    operation['expected_head'] !== expectedHead ||
    operation['target_id'] !== target
  )
    throw new FactoryFailure('Independent scan/verifier reference binding mismatch');
  return core;
}
export async function readAuthorityLog(context: FactoryContext, jobId: string): Promise<Buffer> {
  const p = context.policy;
  if (
    p['api_origin'] !== 'https://api.github.com' ||
    p['repository_id'] !== '1230959148' ||
    p['repository_full_name'] !== 'apolenkov/feynman' ||
    !id(jobId) ||
    !context.token
  )
    throw new FactoryFailure('Unknown authority log origin/namespace');
  const route = `/repos/apolenkov/feynman/actions/jobs/${jobId}/logs`;
  const response = await fetch(new URL(route, stringField(p, 'api_origin')), {
    headers: {
      Authorization: `Bearer ${context.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });
  const bytes = await downloadRedirect(response);
  if (bytes.length > 10_000_000) throw new FactoryFailure('Log size exceeds bound');
  return bytes;
}
async function downloadRedirect(response: Response): Promise<Buffer> {
  if (response.status === 302) {
    const location = response.headers.get('location');
    if (location === null || new URL(location).protocol !== 'https:')
      throw new FactoryFailure('Unknown download origin');
    const download = await fetch(location, {
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (!download.ok) throw new FactoryFailure('Download unavailable');
    return Buffer.from(await download.arrayBuffer());
  }
  if (!response.ok) throw new FactoryFailure('Download unavailable');
  return Buffer.from(await response.arrayBuffer());
}
export function authorityMarker(logBytes: Buffer): JsonRecord {
  const markers = logBytes
    .toString('utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes('FACTORY_AUTHORITY_V1 '));
  if (markers.length !== 1 || markers[0] === undefined)
    throw new FactoryFailure('Missing/duplicate log marker');
  const line = markers[0];
  return parseProtocol(
    Buffer.from(line.slice(line.indexOf('FACTORY_AUTHORITY_V1 ') + 21)),
    'marker',
  );
}
export async function readAuthorityArchive(
  context: FactoryContext,
  artifactId: string,
  archiveSha: string,
  kind: 'receipt' | 'checkpoint' | 'scan',
): Promise<Buffer> {
  if (
    context.policy['api_origin'] !== 'https://api.github.com' ||
    context.policy['repository_id'] !== '1230959148' ||
    context.policy['repository_full_name'] !== 'apolenkov/feynman' ||
    !id(artifactId) ||
    !context.token
  )
    throw new FactoryFailure('Unknown authority archive origin/namespace');
  const route = `/repos/apolenkov/feynman/actions/artifacts/${artifactId}/zip`;
  const response = await fetch(new URL(route, stringField(context.policy, 'api_origin')), {
    headers: { Authorization: `Bearer ${context.token}`, 'X-GitHub-Api-Version': '2026-03-10' },
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });
  if (response.status !== 302) throw new FactoryFailure('Unknown archive download');
  const archive = await downloadRedirect(response);
  if (archive.length > 2_000_000 || sha256(archive) !== archiveSha)
    throw new FactoryFailure('Archive digest/size mismatch');
  const names = execFileSync('bsdtar', ['-tf', '-'], {
    input: archive,
    encoding: 'utf8',
    maxBuffer: 100_000,
  })
    .trim()
    .split('\n');
  const basename = `${kind}.json`;
  if (names.length !== 1 || names[0] !== basename)
    throw new FactoryFailure('Unsafe archive members');
  const types = execFileSync('bsdtar', ['-tvf', '-'], {
    input: archive,
    encoding: 'utf8',
    maxBuffer: 100_000,
  });
  if (!types.startsWith('-')) throw new FactoryFailure('Unsafe archive member type');
  try {
    return execFileSync('bsdtar', ['-xOf', '-', basename], {
      input: archive,
      maxBuffer: 1_000_000,
    });
  } catch {
    throw new FactoryFailure('Archive member unreadable or too large');
  }
}
const ACTIONS_BOT = { id: '41898282', login: 'github-actions[bot]' } as const;
export function isApprovedPublisher(policy: FactoryPolicy, id: unknown, login: unknown): boolean {
  return (
    (id === policy['owner_id'] && login === policy['owner_login']) ||
    (id === ACTIONS_BOT.id && login === ACTIONS_BOT.login)
  );
}
// Phases the scheduled review's Actions bot may sign; repair reservations stay owner-only.
const BOT_PHASES = ['scan', 'verifier', 'publication'];
// Owner runs sign as owner; the Actions bot signs as approved-publisher only where `allowBot` is set and its
// dispatching run proves a fresh main-branch night-review parent. parent_run_id is a correlation bound by
// freshness and single use (the producer refuses a replayed parent), not authentication: the trust
// boundary of approved-publisher is push access to the repository (ADR 0007).
export async function producerActor(
  context: FactoryContext,
  request: JsonRecord,
  allowBot: boolean,
): Promise<{
  actor_id: string;
  actor_login: string;
  actor_decision: 'owner' | 'approved-publisher';
}> {
  const p = context.policy;
  const base = `/repos/${stringField(p, 'repository_full_name')}/actions/runs`;
  const run = record(
    await githubRequest(context, `${base}/${stringField(context.job, 'run_id')}/attempts/1`),
  );
  const actor = record(run['actor']);
  const actorId = String(actor['id']);
  const actorLogin = actor['login'];
  if (actorId === p['owner_id'] && actorLogin === p['owner_login'])
    return {
      actor_id: actorId,
      actor_login: stringField(p, 'owner_login'),
      actor_decision: 'owner',
    };
  if (!isApprovedPublisher(p, actorId, actorLogin))
    throw new FactoryFailure('Producer actor not authorized');
  if (!allowBot) throw new FactoryFailure('This phase accepts only the owner actor');
  const parentId = request['parent_run_id'];
  if (
    typeof parentId !== 'string' ||
    !/^[1-9]\d{0,18}$/u.test(parentId) ||
    parentId === context.job['run_id']
  )
    throw new FactoryFailure('Bot producer requires a distinct parent_run_id');
  const parent = record(await githubRequest(context, `${base}/${parentId}`));
  const night = arrayField(p, 'workflow_registry')
    .map(record)
    .find((entry) => entry['path'] === '.github/workflows/night-review.yml');
  const parentPath = typeof parent['path'] === 'string' ? parent['path'].split('@')[0] : null;
  const window = record(p['night_scan'] ?? {})['parent_window_minutes'];
  if (typeof window !== 'number' || !Number.isSafeInteger(window) || window <= 0)
    throw new FactoryFailure('Night parent window unknown');
  const created = Date.parse(stringField(run, 'created_at'));
  const parentCreated = Date.parse(stringField(parent, 'created_at'));
  if (
    night === undefined ||
    parentPath !== night['path'] ||
    String(parent['workflow_id']) !== night['id'] ||
    parent['head_branch'] !== 'main' ||
    !['schedule', 'workflow_dispatch'].includes(String(parent['event'])) ||
    String(record(parent['repository'])['id']) !== p['repository_id'] ||
    String(record(parent['head_repository'])['id']) !== p['repository_id'] ||
    !(parentCreated < created) ||
    !(created <= Date.parse(stringField(parent, 'updated_at'))) ||
    created - parentCreated > window * 60_000
  )
    throw new FactoryFailure('Bot producer parent is not a fresh night-review run on main');
  return {
    actor_id: actorId,
    actor_login: ACTIONS_BOT.login,
    actor_decision: 'approved-publisher',
  };
}
// A bot night receipt is keyed by its parent and phase only, so a replayed parent collides whatever it carries.
export const nightParentKey = (phase: string, parentId: string): string =>
  sha256({ phase, parent_run_id: parentId });
// Single use: a parent's first night receipt wins; a later run finds an earlier run's receipt with its request key.
export async function assertParentUnused(
  context: FactoryContext,
  parentId: string,
  requestKeys: readonly string[],
): Promise<void> {
  const base = `/repos/${stringField(context.policy, 'repository_full_name')}`;
  const parent = record(await githubRequest(context, `${base}/actions/runs/${parentId}`));
  const since = Date.parse(stringField(parent, 'created_at'));
  const earlier = (await githubPages(context, `${base}/actions/artifacts`, 'artifacts'))
    .map(record)
    .filter(
      (artifact) =>
        typeof artifact['name'] === 'string' &&
        artifact['name'].startsWith('factory-v1-receipt-') &&
        artifact['expired'] === false &&
        String(record(artifact['workflow_run'])['id']) !== context.job['run_id'] &&
        Date.parse(stringField(artifact, 'created_at')) >= since,
    );
  for (const artifact of earlier) {
    const digest = stringField(artifact, 'digest').replace(/^sha256:/, '');
    const prior = parseFactoryJson(
      await readAuthorityArchive(context, String(artifact['id']), digest, 'receipt'),
    );
    if (requestKeys.includes(String(prior['request_key'])))
      throw new FactoryFailure('Night parent_run_id already used by an earlier run');
  }
}
export async function resolveReceipt(
  context: FactoryContext,
  runId: string,
  phase: string,
): Promise<JsonRecord> {
  if (
    ![
      'reserve',
      'outcome',
      'bootstrap',
      'retry-claim',
      'publication',
      'scan',
      'verifier',
      'patch',
      'register',
      'operation-intent',
      'operation-outcome',
    ].includes(phase)
  )
    throw new FactoryFailure('Unapproved producer phase');
  const jobs = (
    await githubPages(
      context,
      `/repos/${stringField(context.policy, 'repository_full_name')}/actions/runs/${runId}/attempts/1/jobs`,
      'jobs',
    )
  )
    .map(record)
    .filter((job) => job['name'] === `factory-authority-${phase}`);
  const job = jobs[0];
  if (jobs.length !== 1 || job?.['status'] !== 'completed' || job['conclusion'] !== 'success')
    throw new FactoryFailure('Prior authority producer not completed uniquely');
  const log = await readAuthorityLog(context, String(job['id']));
  const marker = authorityMarker(log);
  if (marker['run_id'] !== runId || marker['phase'] !== phase || marker['kind'] !== 'receipt')
    throw new FactoryFailure('Wrong prior producer marker');
  const core = parseProtocol(
    await readAuthorityArchive(
      context,
      stringField(marker, 'artifact_id'),
      stringField(marker, 'archive_sha256'),
      'receipt',
    ),
    'receipt',
  );
  const envelope = {
    schema: 'factory/v1',
    receipt: core,
    receipt_sha256: sha256(core),
    transport: {
      artifact_id: marker['artifact_id'],
      archive_sha256: marker['archive_sha256'],
      producer_job_id: String(job['id']),
      producer_log_sha256: sha256(log),
    },
  };
  await verifyAuthority(context, envelope);
  return envelope;
}

export async function verifyArchiveAuthority(
  context: FactoryContext,
  core: JsonRecord,
  transport: JsonRecord,
  kind: 'receipt' | 'checkpoint',
  phase: string,
  transitionId: string,
): Promise<void> {
  validateProtocol(core, kind === 'receipt' ? 'receipt' : 'checkpoint-core');
  if (
    ![
      'bootstrap',
      'checkpoint',
      'reserve',
      'outcome',
      'register',
      'retry-claim',
      'publication',
      'scan',
      'verifier',
      'patch',
      'operation-intent',
      'operation-outcome',
    ].includes(phase)
  )
    throw new FactoryFailure('Unapproved fixed producer phase');
  closed(transport, {
    artifact_id: id,
    archive_sha256: digest,
    producer_job_id: id,
    producer_log_sha256: digest,
  });
  if (
    kind === 'receipt' &&
    (core['workflow_path'] !== context.policy['controller_workflow_path'] ||
      core['repository_id'] !== context.policy['repository_id'])
  )
    throw new FactoryFailure('Foreign receipt namespace');
  const receipt: JsonRecord = {
    ...core,
    workflow_path: context.policy['controller_workflow_path'],
    repository_id: context.policy['repository_id'],
    producer_phase: phase,
    transition_id: transitionId,
  };
  const p = context.policy;
  const base = `/repos/${stringField(p, 'repository_full_name')}`;
  if (
    receipt['repository_id'] !== p['repository_id'] ||
    receipt['workflow_id'] !== p['controller_workflow_id'] ||
    receipt['workflow_path'] !== p['controller_workflow_path'] ||
    receipt['control_release_sha'] !== p['control_release_sha'] ||
    receipt['control_manifest_sha256'] !== sha256(p['control_manifest'])
  )
    throw new FactoryFailure('Foreign authority release/repository');
  const attempt = record(
    await githubRequest(
      context,
      `${base}/actions/runs/${stringField(receipt, 'run_id')}/attempts/${numberField(receipt, 'run_attempt')}`,
    ),
  );
  if (
    attempt['run_attempt'] !== receipt['run_attempt'] ||
    String(attempt['workflow_id']) !== receipt['workflow_id'] ||
    attempt['head_sha'] !== receipt['workflow_source_sha'] ||
    attempt['event'] !== 'workflow_dispatch' ||
    attempt['head_branch'] !== 'main' ||
    String(record(attempt['repository'])['id']) !== p['repository_id'] ||
    String(record(attempt['head_repository'])['id']) !== p['repository_id']
  )
    throw new FactoryFailure('Receipt attempt provenance mismatch');
  if (
    kind === 'receipt' &&
    (core['epoch_id'] !== p['epoch_id'] ||
      core['repository_full_name'] !== p['repository_full_name'] ||
      core['event'] !== attempt['event'] ||
      String(record(attempt['actor'])['id']) !== core['actor_id'] ||
      record(attempt['actor'])['login'] !== core['actor_login'] ||
      core['actor_decision'] === 'denied' ||
      (core['actor_decision'] === 'owner' &&
        (core['actor_id'] !== p['owner_id'] || core['actor_login'] !== p['owner_login'])) ||
      (core['actor_decision'] === 'approved-publisher' &&
        (!isApprovedPublisher(p, core['actor_id'], core['actor_login']) ||
          !BOT_PHASES.includes(phase))))
  )
    throw new FactoryFailure('Receipt actor/event/epoch authority mismatch');
  for (const entry of arrayField(p, 'control_manifest').map(record)) {
    const source = record(
      await githubRequest(
        context,
        `${base}/contents/${stringField(entry, 'path')}?ref=${stringField(receipt, 'workflow_source_sha')}`,
      ),
    );
    if (source['type'] !== 'file' || source['sha'] !== entry['blob_sha'])
      throw new FactoryFailure('Historical producer source drift');
  }
  const jobs = await githubPages(
    context,
    `${base}/actions/runs/${stringField(receipt, 'run_id')}/attempts/${numberField(receipt, 'run_attempt')}/jobs`,
    'jobs',
  );
  const matching = jobs
    .map(record)
    .filter((job) => job['name'] === `factory-authority-${stringField(receipt, 'producer_phase')}`);
  if (matching.length !== 1) throw new FactoryFailure('Producer job missing/duplicate');
  const candidate = matching[0];
  if (candidate === undefined || String(candidate['id']) !== transport['producer_job_id'])
    throw new FactoryFailure('Wrong producer membership');
  const job = record(
    await githubRequest(
      context,
      `${base}/actions/jobs/${stringField(transport, 'producer_job_id')}`,
    ),
  );
  if (
    job['status'] !== 'completed' ||
    job['conclusion'] !== 'success' ||
    String(job['id']) !== transport['producer_job_id'] ||
    job['run_attempt'] !== receipt['run_attempt'] ||
    String(job['run_id']) !== receipt['run_id'] ||
    job['head_sha'] !== receipt['workflow_source_sha']
  )
    throw new FactoryFailure('Producer not completed successfully');
  for (const name of ['Upload authority', 'Emit authority']) {
    const steps = arrayField(job, 'steps')
      .map(record)
      .filter((step) => step['name'] === name);
    if (steps.length !== 1 || steps[0]?.['conclusion'] !== 'success')
      throw new FactoryFailure('Authority step missing/failed');
  }
  const logBytes = await readAuthorityLog(context, stringField(transport, 'producer_job_id'));
  if (logBytes.length > 10_000_000 || sha256(logBytes) !== transport['producer_log_sha256'])
    throw new FactoryFailure('Log integrity/size mismatch');
  const marker = authorityMarker(logBytes);
  for (const key of [
    'run_id',
    'run_attempt',
    'workflow_id',
    'workflow_source_sha',
    'control_release_sha',
    'transition_id',
  ])
    if (marker[key] !== receipt[key]) throw new FactoryFailure('Marker replay/provenance mismatch');
  if (
    marker['kind'] !== kind ||
    marker['phase'] !== phase ||
    marker['artifact_id'] !== transport['artifact_id'] ||
    marker['archive_sha256'] !== transport['archive_sha256'] ||
    marker['receipt_sha256'] !== sha256(core)
  )
    throw new FactoryFailure('Upload output/core mismatch');
  const artifact = record(
    await githubRequest(
      context,
      `${base}/actions/artifacts/${stringField(transport, 'artifact_id')}`,
    ),
  );
  const run = record(artifact['workflow_run']);
  if (
    artifact['expired'] !== false ||
    String(artifact['id']) !== transport['artifact_id'] ||
    artifact['digest'] !== `sha256:${stringField(transport, 'archive_sha256')}` ||
    String(run['id']) !== receipt['run_id'] ||
    String(run['repository_id']) !== p['repository_id'] ||
    String(run['head_repository_id']) !== p['repository_id'] ||
    run['head_sha'] !== receipt['workflow_source_sha']
  )
    throw new FactoryFailure('Artifact identity/expiry/digest mismatch');
  const names = (await githubPages(context, `${base}/actions/artifacts`, 'artifacts'))
    .map(record)
    .filter((candidate) => candidate['name'] === artifact['name']);
  const expectedName = `factory-v1-${kind}-${stringField(receipt, 'run_id')}-${numberField(receipt, 'run_attempt')}-${transitionId}`;
  if (
    artifact['name'] !== expectedName ||
    names.length !== 1 ||
    String(names[0]?.['id']) !== transport['artifact_id']
  )
    throw new FactoryFailure('Artifact name collision or producer identity mismatch');
  const created = Date.parse(stringField(artifact, 'created_at'));
  const expiry = Date.parse(stringField(artifact, 'expires_at'));
  // GitHub counts retention from the run start, not from the upload; a changed setting moves it by whole days.
  const drift =
    expiry -
    Date.parse(stringField(attempt, 'run_started_at')) -
    numberField(p, 'artifact_retention_days') * 86400000;
  if (!Number.isFinite(drift) || Math.abs(drift) >= 43_200_000)
    throw new FactoryFailure('Authority artifact retention drift');
  if (!(
    created >= Date.parse(stringField(job, 'started_at')) &&
    created <= Date.parse(stringField(job, 'completed_at'))
  ))
    throw new FactoryFailure('Artifact outside producer interval');
  const archiveCore = await readAuthorityArchive(
    context,
    stringField(transport, 'artifact_id'),
    stringField(transport, 'archive_sha256'),
    kind,
  );
  if (!canonicalBytes(core).equals(archiveCore)) throw new FactoryFailure('Edited archive/core');
  parseProtocol(archiveCore, kind === 'receipt' ? 'receipt' : 'checkpoint-core');
}

export async function factoryMain(
  handler: (context: FactoryContext, input: JsonRecord) => Promise<FactoryDecision>,
): Promise<void> {
  try {
    const command = process.argv[2] ?? '';
    const inputPath = process.argv[3] === '--input' ? process.argv[4] : process.argv[3];
    const input: unknown =
      inputPath === undefined ? {} : parseFactoryJson(fs.readFileSync(inputPath, 'utf8'));
    const role = process.env['FACTORY_ROLE'];
    const context = createFactoryContext(
      loadFactoryPolicy(),
      process.env['GITHUB_TOKEN'] ?? '',
      undefined,
      command === 'stop' || role === 'stop'
        ? 'stop'
        : command === 'bootstrap' || role === 'bootstrap'
          ? 'bootstrap'
          : 'repair',
    );
    const result = await handler(context, { ...record(input), command });
    console.log(JSON.stringify(result));
    if (!['accepted', 'prepared', 'STOPPED'].includes(result.status)) process.exitCode = 1;
  } catch {
    console.error(
      JSON.stringify({
        status: 'needs-human',
        reason: 'Factory operation failed; inspect authenticated evidence',
      }),
    );
    process.exitCode = 1;
  }
}

function protocolMain(): void {
  try {
    if (process.argv[2] !== 'emit') throw new FactoryFailure('Unknown protocol command');
    const file = process.argv[3];
    if (file === undefined) throw new FactoryFailure('Authority file required');
    const bytes = fs.readFileSync(file);
    const kind = file.endsWith('checkpoint.json') ? 'checkpoint' : 'receipt';
    const core = parseProtocol(bytes, kind === 'checkpoint' ? 'checkpoint-core' : 'receipt');
    const transition =
      kind === 'checkpoint'
        ? fs.readFileSync(`${file}.transition`, 'utf8')
        : stringField(core, 'transition_id');
    console.log(
      emitAuthority({
        schema: 'factory/v1',
        kind,
        run_id: core['run_id'],
        run_attempt: core['run_attempt'],
        workflow_id: core['workflow_id'],
        workflow_source_sha: core['workflow_source_sha'],
        control_release_sha: core['control_release_sha'],
        phase: kind === 'checkpoint' ? 'checkpoint' : core['producer_phase'],
        transition_id: transition,
        artifact_id: process.env['FACTORY_ARTIFACT_ID'],
        archive_sha256: process.env['FACTORY_ARTIFACT_DIGEST'],
        receipt_sha256: sha256(core),
      }),
    );
  } catch {
    console.error('Authority emission denied');
    process.exitCode = 1;
  }
}

if (process.argv[1] === import.meta.filename) protocolMain();
