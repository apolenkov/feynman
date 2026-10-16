import crypto from 'node:crypto';
import fs from 'node:fs';
import { runController } from './factory-control.ts';
import { isCanonicalIssueAuthor } from './factory-publication.ts';
import { ROLE_CONTROL_FILES } from './factory-roles.ts';
import {
  FactoryFailure,
  arrayField,
  githubPages,
  githubRequest,
  numberField,
  parseFactoryJson,
  parseProtocol,
  record,
  resolveFactoryContext,
  resolveReceipt,
  sha256,
  stringField,
} from './factory-protocol.ts';
import type { FactoryContext, JsonRecord } from './factory-protocol.ts';

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
const SHA = /^[a-f0-9]{40}$/;

function closed(value: unknown, keys: readonly string[]): JsonRecord {
  const object = record(value);
  if (Object.keys(object).length !== keys.length || keys.some((key) => !Object.hasOwn(object, key)))
    throw new FactoryFailure('Invalid role authority fields');
  return object;
}
function base(context: FactoryContext): string {
  return `/repos/${stringField(context.policy, 'repository_full_name')}`;
}
function blobId(bytes: Buffer): string {
  return crypto.hash('sha1', Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));
}
async function contents(
  context: FactoryContext,
  file: string,
  revision: string,
): Promise<{ readonly bytes: Buffer; readonly sha: string }> {
  if (!SHA.test(revision)) throw new FactoryFailure('Immutable role authority revision required');
  const result = record(
    await githubRequest(context, `${base(context)}/contents/${file}?ref=${revision}`),
  );
  if (
    result['type'] !== 'file' ||
    result['encoding'] !== 'base64' ||
    numberField(result, 'size') > 1_000_000
  )
    throw new FactoryFailure('Invalid role authority file');
  const bytes = Buffer.from(stringField(result, 'content'), 'base64');
  const sha = stringField(result, 'sha');
  if (bytes.length !== result['size'] || blobId(bytes) !== sha)
    throw new FactoryFailure('Role authority blob bytes mismatch');
  return { bytes, sha };
}
async function recoveredHead(context: FactoryContext): Promise<string> {
  const result = await runController(context, { command: 'recover' });
  if (result.status !== 'accepted')
    throw new FactoryFailure(`Role journal recovery denied: ${result.reason}`);
  return stringField(record(result.record), 'state_head');
}
function budget(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new FactoryFailure('Invalid finite role budget');
  return value;
}
function allocation(total: number, share: unknown): number {
  const basisPoints = budget(share);
  if (basisPoints > 10_000) throw new FactoryFailure('Role budget share exceeds reservation');
  return budget(Number((BigInt(total) * BigInt(basisPoints)) / 10_000n));
}

/** Read-only evidence preparation. This is not permission to execute a role or repeat a provider. */
export async function authenticateRoleReservation(
  inputContext: FactoryContext,
  roleControlPin: string,
  input: { readonly issue_number: number; readonly event_id: string },
): Promise<{
  readonly context: JsonRecord;
  readonly reservation: JsonRecord;
  readonly allocations: readonly JsonRecord[];
  readonly state_head: string;
}> {
  if (!/^[a-f0-9]{40}:[a-f0-9]{40}$/.test(roleControlPin))
    throw new FactoryFailure('Independent role control pin required');
  const request = closed(input, ['issue_number', 'event_id']);
  if (
    !/^[1-9]\d*$/.test(stringField(request, 'event_id')) ||
    !Number.isSafeInteger(request['issue_number']) ||
    numberField(request, 'issue_number') < 1
  )
    throw new FactoryFailure('Invalid role opt-in request');
  const context = await resolveFactoryContext(inputContext);
  if (context.role !== 'repair' || context.job['run_attempt'] !== 1)
    throw new FactoryFailure('Role requires repair attempt 1');
  const stateHead = await recoveredHead(context);
  const runId = stringField(context.job, 'run_id');
  const attempt = record(
    await githubRequest(context, `${base(context)}/actions/runs/${runId}/attempts/1`),
  );
  if (
    attempt['event'] !== 'workflow_dispatch' ||
    ['actor', 'triggering_actor'].some((key) => {
      const actor = record(attempt[key]);
      return (
        String(actor['id']) !== context.policy['owner_id'] ||
        actor['login'] !== context.policy['owner_login']
      );
    })
  )
    throw new FactoryFailure('Role requires direct owner actor');
  const envelope = await resolveReceipt(context, runId, 'reserve');
  const reservation = record(envelope['receipt']);
  if (
    reservation['run_id'] !== runId ||
    reservation['run_attempt'] !== 1 ||
    reservation['workflow_source_sha'] !== context.job['workflow_source_sha'] ||
    reservation['producer_phase'] !== 'reserve' ||
    reservation['outcome'] !== 'consumed' ||
    reservation['expected_transition'] !== 'reserved' ||
    reservation['actor_decision'] !== 'owner' ||
    reservation['actor_id'] !== context.policy['owner_id'] ||
    reservation['actor_login'] !== context.policy['owner_login'] ||
    reservation['issue_number'] !== request['issue_number'] ||
    reservation['request_key'] !==
      sha256({ event_id: request['event_id'], lineage_id: reservation['lineage_id'] })
  )
    throw new FactoryFailure('Role reservation/request binding mismatch');
  const transition = stringField(reservation, 'transition_id');
  const lineageId = stringField(reservation, 'lineage_id');
  const journal = parseProtocol(
    (await contents(context, `receipts/${runId}-1-${transition}.json`, stateHead)).bytes,
    'envelope',
  );
  if (sha256(journal) !== sha256(envelope))
    throw new FactoryFailure('Role reserve absent or changed in journal');
  const lineage = parseProtocol(
    (await contents(context, `lineages/${lineageId}.json`, stateHead)).bytes,
    'lineage',
  );
  const reservations = arrayField(lineage, 'reservations');
  const latest = record(reservations.at(-1));
  if (
    lineage['confidence'] !== 'confirmed' ||
    lineage['history_status'] !== 'verified' ||
    lineage['repair_state'] !== 'reserved' ||
    lineage['last_transition_id'] !== transition ||
    reservations.length !== reservation['reservation_number'] ||
    latest['number'] !== reservation['reservation_number'] ||
    latest['transition_id'] !== transition ||
    latest['request_key'] !== reservation['request_key'] ||
    latest['provider_owner_run_id'] !== runId ||
    latest['provider_owner_run_attempt'] !== 1 ||
    latest['consumed'] !== true ||
    latest['outcome'] !== 'consumed' ||
    latest['baseline_sha'] !== reservation['baseline_sha']
  )
    throw new FactoryFailure('Role reservation stale or replayed in journal');
  const issuePath = `${base(context)}/issues/${numberField(request, 'issue_number')}`;
  const issue = record(await githubRequest(context, issuePath));
  if (
    !isCanonicalIssueAuthor(context, issue) ||
    issue['state'] !== 'open' ||
    issue['pull_request'] !== undefined ||
    issue['node_id'] !== reservation['issue_node_id'] ||
    !arrayField(issue, 'labels').some(
      (label) => (typeof label === 'string' ? label : record(label)['name']) === 'factory-fix',
    )
  )
    throw new FactoryFailure('Role canonical issue opt-in revoked');
  const events = (await githubPages(context, `${issuePath}/events`)).map(record);
  const event = events.filter((entry) => String(entry['id']) === request['event_id']);
  const selected = event[0];
  if (
    event.length !== 1 ||
    selected?.['event'] !== 'labeled' ||
    record(selected['label'])['name'] !== 'factory-fix' ||
    String(record(selected['actor'])['id']) !== context.policy['owner_id'] ||
    record(selected['actor'])['login'] !== context.policy['owner_login']
  )
    throw new FactoryFailure('Role owner opt-in event not authenticated');
  const [revision = '', expectedBlob = ''] = roleControlPin.split(':');
  const pinned = await contents(context, 'role-control-manifest.json', revision);
  if (pinned.sha !== expectedBlob) throw new FactoryFailure('Role control pin blob mismatch');
  const release = closed(parseFactoryJson(pinned.bytes), [
    'schema',
    'repository_id',
    'source_sha',
    'manifest',
  ]);
  if (
    release['schema'] !== 'factory-role-release/v2' ||
    release['repository_id'] !== context.policy['repository_id'] ||
    release['source_sha'] !== context.job['workflow_source_sha']
  )
    throw new FactoryFailure('Stale role control source');
  const manifest = arrayField(release, 'manifest').map((entry) =>
    closed(entry, ['path', 'blob_sha']),
  );
  if (
    manifest.length !== ROLE_CONTROL_FILES.length ||
    manifest.some(
      (entry, index) =>
        entry['path'] !== ROLE_CONTROL_FILES[index] || !SHA.test(stringField(entry, 'blob_sha')),
    )
  )
    throw new FactoryFailure('Role control manifest mismatch');
  for (const entry of manifest) {
    const file = stringField(entry, 'path');
    const remote = await contents(context, file, stringField(release, 'source_sha'));
    if (
      remote.sha !== entry['blob_sha'] ||
      blobId(fs.readFileSync(new URL(`../${file}`, import.meta.url))) !== remote.sha
    )
      throw new FactoryFailure('Role control source bytes mismatch');
  }
  const config = closed(
    parseFactoryJson(
      (
        await contents(
          context,
          'scripts/factory-role-config.json',
          stringField(release, 'source_sha'),
        )
      ).bytes,
    ),
    ['schema', 'slots'],
  );
  if (config['schema'] !== 'factory-role-config/v2')
    throw new FactoryFailure('Role configuration schema mismatch');
  const tokens = budget(context.policy['token_budget']);
  const seconds = budget(context.policy['timeout_seconds']);
  const slots = arrayField(config, 'slots').map((slot) =>
    closed(slot, ['role', 'token_share_bps', 'time_share_bps']),
  );
  if (
    slots.length !== ORDER.length ||
    slots.some((slot, index) => slot['role'] !== ORDER[index]) ||
    ['token_share_bps', 'time_share_bps'].some(
      (key) => slots.reduce((sum, slot) => sum + budget(slot[key]), 0) > 10_000,
    )
  )
    throw new FactoryFailure('Role budget shares exceed reservation or order mismatch');
  const allocations = slots.map((slot) => ({
    role: slot['role'],
    token_budget: allocation(tokens, slot['token_share_bps']),
    timeout_seconds: allocation(seconds, slot['time_share_bps']),
  }));
  if ((await recoveredHead(context)) !== stateHead)
    throw new FactoryFailure('Role journal changed during authentication');
  return {
    reservation,
    state_head: stateHead,
    allocations,
    context: {
      owner_id: context.policy['owner_id'],
      owner_login: context.policy['owner_login'],
      repository_id: context.policy['repository_id'],
      workflow_id: context.policy['controller_workflow_id'],
      workflow_source_sha: context.job['workflow_source_sha'],
      control_release_sha: context.policy['control_release_sha'],
      run_id: runId,
      run_attempt: 1,
      token_budget: tokens,
      timeout_seconds: seconds,
      role_manifest: manifest,
      role_config_sha256: sha256(allocations),
    },
  };
}
