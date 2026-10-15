import fs from 'node:fs';
import { isCanonicalIssueAuthor } from './factory-publication.ts';
import {
  resolveFactoryContext,
  FactoryFailure,
  safeReason,
  arrayField,
  authorityMarker,
  canonicalBytes,
  effectPolicy,
  factoryMain,
  GitHubFailure,
  githubPages,
  githubRequest,
  numberField,
  parseFactoryJson,
  parseProtocol,
  produceReceipt,
  producerActor,
  assertParentUnused,
  nightParentKey,
  readAuthorityArchive,
  readAuthorityLog,
  resolveReceipt,
  record,
  sha256,
  stringField,
  validateProtocol,
  verifyArchiveAuthority,
  verifyAuthority,
  verifyControlSource,
  verifyEvidenceReference,
} from './factory-protocol.ts';
import type {
  CheckpointCore,
  FactoryContext,
  FactoryDecision,
  JsonRecord,
  Lineage,
} from './factory-protocol.ts';

interface StateSnapshot {
  readonly head: string;
  readonly checkpoint: JsonRecord;
  readonly files: ReadonlyMap<string, JsonRecord>;
  readonly commit: JsonRecord;
}
function base(context: FactoryContext): string {
  return `/repos/${stringField(context.policy, 'repository_full_name')}`;
}
async function stateHead(context: FactoryContext): Promise<string> {
  return stringField(
    record(
      record(await githubRequest(context, `${base(context)}/git/ref/heads/factory-state`))[
        'object'
      ],
    ),
    'sha',
  );
}
async function readState(context: FactoryContext, head: string): Promise<StateSnapshot> {
  const commit = record(await githubRequest(context, `${base(context)}/git/commits/${head}`));
  const tree = record(
    await githubRequest(
      context,
      `${base(context)}/git/trees/${stringField(record(commit['tree']), 'sha')}?recursive=1`,
    ),
  );
  if (tree['truncated'] !== false) throw new FactoryFailure('Incomplete state tree');
  const files = new Map<string, JsonRecord>();
  for (const entry of arrayField(tree, 'tree').map(record)) {
    if (entry['type'] === 'tree') continue;
    const file = stringField(entry, 'path');
    if (
      entry['type'] !== 'blob' ||
      entry['mode'] !== '100644' ||
      !/^(checkpoint\.json|bootstrap-ticket\.json|legacy-inventory\.json|stop\.json|observation\.json|lineages\/[a-f0-9]{64}\.json|receipts\/\d+-\d+-[a-f0-9]{64}\.json)$/.test(
        file,
      )
    )
      throw new FactoryFailure('Unauthorized state path/mode');
    const blob = record(
      await githubRequest(context, `${base(context)}/git/blobs/${stringField(entry, 'sha')}`),
    );
    if (blob['encoding'] !== 'base64' || numberField(blob, 'size') > 1_000_000)
      throw new FactoryFailure('Unknown state blob');
    const bytes = Buffer.from(stringField(blob, 'content'), 'base64');
    const kind =
      file === 'checkpoint.json'
        ? 'checkpoint'
        : file === 'bootstrap-ticket.json'
          ? 'ticket'
          : file === 'legacy-inventory.json'
            ? 'inventory'
            : file.startsWith('lineages/')
              ? 'lineage'
              : file.startsWith('receipts/')
                ? 'envelope'
                : null;
    if (kind !== null) files.set(file, parseProtocol(bytes, kind));
    else {
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!canonicalBytes(value).equals(bytes)) throw new FactoryFailure('Noncanonical state data');
      files.set(file, record(value));
    }
  }
  const checkpoint = files.get('checkpoint.json');
  if (checkpoint === undefined) throw new FactoryFailure('Missing state checkpoint');
  const payload = [...files.entries()]
    .filter(([file]) => file !== 'checkpoint.json')
    .map(([file, contents]) => ({ path: file, 'blob-content-sha256': sha256(contents) }))
    .toSorted((a, b) => Buffer.compare(canonicalBytes(a.path), canonicalBytes(b.path)));
  if (sha256(payload) !== checkpoint['state_payload_sha256'])
    throw new FactoryFailure('State payload hash mismatch');
  const bootstrap = validateProtocol(checkpoint['bootstrap'], 'bootstrap');
  for (const key of [
    'repository_id',
    'epoch_id',
    'genesis_receipt_sha256',
    'legacy_inventory_sha256',
  ]) {
    if (
      context.role === 'bootstrap' &&
      ['genesis_receipt_sha256', 'legacy_inventory_sha256'].includes(key)
    )
      continue;
    if (bootstrap[key] !== context.policy[key])
      throw new FactoryFailure('Permanent bootstrap anchor mismatch');
  }
  const ticket = files.get('bootstrap-ticket.json');
  const inventory = files.get('legacy-inventory.json');
  if (
    ticket === undefined ||
    inventory === undefined ||
    sha256(ticket) !== sha256(context.policy['bootstrap_ticket']) ||
    sha256(inventory) !== bootstrap['legacy_inventory_sha256']
  )
    throw new FactoryFailure('Missing or changed bootstrap ticket/inventory');
  const parents = arrayField(commit, 'parents');
  if (bootstrap['phase'] === 'genesis') {
    if (
      (context.role !== 'bootstrap' && head !== context.policy['genesis_head']) ||
      parents.length !== 0 ||
      numberField(checkpoint, 'sequence') !== 0
    )
      throw new FactoryFailure('Unreviewed genesis/rebootstrap');
  } else if (
    parents.length !== 1 ||
    bootstrap['genesis_head'] !== context.policy['genesis_head'] ||
    bootstrap['activation_policy_sha256'] !==
      stringField(context.policy, 'activation_policy_sha256')
  )
    throw new FactoryFailure('State parent or active policy anchor mismatch');
  return { head, checkpoint, files, commit };
}
async function discoverCheckpoint(
  context: FactoryContext,
  state: StateSnapshot,
  pendingTransition: string | null = null,
): Promise<CheckpointCore> {
  const artifacts = (
    await githubPages(context, `${base(context)}/actions/artifacts`, 'artifacts')
  ).map(record);
  const runs = (
    await githubPages(
      context,
      `${base(context)}/actions/workflows/${stringField(context.policy, 'controller_workflow_id')}/runs`,
      'workflow_runs',
    )
  ).map(record);
  const attempted: {
    readonly runId: string;
    readonly attempt: number;
    readonly started: number;
    readonly updated: number;
    readonly status: string;
    readonly jobs: readonly JsonRecord[];
  }[] = [];
  const candidates: {
    readonly core: CheckpointCore;
    readonly transition: string;
    readonly completed: number;
  }[] = [];
  for (const run of runs) {
    const count = numberField(run, 'run_attempt');
    for (let attempt = 1; attempt <= count; attempt++) {
      const attemptRecord = record(
        await githubRequest(
          context,
          `${base(context)}/actions/runs/${String(run['id'])}/attempts/${attempt}`,
        ),
      );
      const started =
        attemptRecord['run_started_at'] === null
          ? Date.parse(stringField(attemptRecord, 'created_at'))
          : Date.parse(stringField(attemptRecord, 'run_started_at'));
      const updated = Date.parse(stringField(attemptRecord, 'updated_at'));
      const status = stringField(attemptRecord, 'status');
      if (
        !Number.isFinite(started) ||
        !Number.isFinite(updated) ||
        attemptRecord['run_attempt'] !== attempt ||
        String(attemptRecord['workflow_id']) !== context.policy['controller_workflow_id']
      )
        throw new FactoryFailure('Unknown controller attempt interval');
      const jobs = (
        await githubPages(
          context,
          `${base(context)}/actions/runs/${String(run['id'])}/attempts/${attempt}/jobs`,
          'jobs',
        )
      ).map(record);
      attempted.push({ runId: String(run['id']), attempt, started, updated, status, jobs });
      const producers = jobs.filter((job) => job['name'] === 'factory-authority-checkpoint');
      if (producers.length > 1) throw new FactoryFailure('Conflicting checkpoint producers');
      const producer = producers[0];
      if (producer === undefined) continue;
      const matching = artifacts.filter(
        (artifact) =>
          String(record(artifact['workflow_run'])['id']) === String(run['id']) &&
          typeof artifact['name'] === 'string' &&
          artifact['name'].startsWith(`factory-v1-checkpoint-${String(run['id'])}-${attempt}-`),
      );
      if (matching.length === 0) {
        if (producer['conclusion'] === 'success')
          throw new FactoryFailure('Newest known checkpoint archive missing');
        continue;
      }
      // Discovery names only locate transport; the archive/log/attempt proof authenticates it.
      for (const artifact of matching) {
        const log = await readAuthorityLog(context, String(producer['id']));
        const marker = authorityMarker(log);
        if (
          marker['artifact_id'] !== String(artifact['id']) ||
          marker['kind'] !== 'checkpoint' ||
          marker['phase'] !== 'checkpoint' ||
          marker['run_attempt'] !== attempt
        )
          throw new FactoryFailure('Checkpoint actual output/attempt mismatch');
        const core = parseProtocol(
          await readAuthorityArchive(
            context,
            stringField(marker, 'artifact_id'),
            stringField(marker, 'archive_sha256'),
            'checkpoint',
          ),
          'checkpoint-core',
        );
        const anchored = await readState(context, stringField(core, 'state_head'));
        if (marker['transition_id'] !== anchored.checkpoint['last_transition_id'])
          throw new FactoryFailure('Checkpoint transition does not match independent Git');
        if (
          core['epoch_id'] !== anchored.checkpoint['epoch_id'] ||
          core['epoch_id'] !== context.policy['epoch_id'] ||
          core['sequence'] !== anchored.checkpoint['sequence'] ||
          core['previous_checkpoint_head'] !==
            anchored.checkpoint['previous_external_checkpoint_head']
        )
          throw new FactoryFailure('Checkpoint epoch/sequence/predecessor mismatch');
        if (
          core['checkpoint_file_sha256'] !== sha256(anchored.checkpoint) ||
          core['state_payload_sha256'] !== anchored.checkpoint['state_payload_sha256']
        )
          throw new FactoryFailure('Checkpoint file/payload mismatch');
        const envelope = [...anchored.files.entries()].find(
          ([file, value]) =>
            file.startsWith('receipts/') &&
            value['receipt_sha256'] === anchored.checkpoint['receipt_sha256'],
        )?.[1];
        if (
          envelope === undefined ||
          core['receipt_sha256'] !== envelope['receipt_sha256'] ||
          record(envelope['receipt'])['transition_id'] !== marker['transition_id']
        )
          throw new FactoryFailure('Checkpoint referenced receipt binding mismatch');
        const transport = {
          artifact_id: marker['artifact_id'],
          archive_sha256: marker['archive_sha256'],
          producer_job_id: String(producer['id']),
          producer_log_sha256: sha256(log),
        };
        await verifyArchiveAuthority(
          context,
          core,
          transport,
          'checkpoint',
          'checkpoint',
          stringField(anchored.checkpoint, 'last_transition_id'),
        );
        const completed = Date.parse(stringField(producer, 'completed_at'));
        if (!Number.isFinite(completed))
          throw new FactoryFailure('Unknown checkpoint completion interval');
        candidates.push({ core, transition: stringField(marker, 'transition_id'), completed });
      }
    }
  }
  if (candidates.length === 0)
    throw new FactoryFailure('No independently authenticated external checkpoint');
  candidates.sort((a, b) => numberField(b.core, 'sequence') - numberField(a.core, 'sequence'));
  const latest = candidates[0];
  if (
    latest === undefined ||
    candidates.some(
      (candidate) =>
        candidate.core['sequence'] === latest.core['sequence'] &&
        candidate.core['state_head'] !== latest.core['state_head'],
    )
  )
    throw new FactoryFailure('Conflicting highest checkpoint heads');
  const intervening = attempted.filter(
    (attempt) =>
      !(
        attempt.runId === latest.core['run_id'] && attempt.attempt === latest.core['run_attempt']
      ) &&
      (attempt.started > latest.completed ||
        attempt.updated > latest.completed ||
        attempt.status !== 'completed'),
  );
  if (intervening.length > numberField(context.policy, 'recovery_attempts_cap'))
    throw new FactoryFailure(
      'Recovery exceeds 100 intervening controller attempts; no partial acceptance',
    );
  const recordedTransitions = new Set(
    [...state.files.entries()]
      .filter(([file]) => file.startsWith('receipts/'))
      .map(([, envelope]) => record(envelope['receipt'])['transition_id']),
  );
  for (const attempt of attempted) {
    for (const producer of attempt.jobs.filter(
      (job) =>
        job['name'] === 'factory-authority-reserve' &&
        // GitHub lists a job whose `if` was false as completed/skipped; it never ran, so it reserved nothing.
        job['conclusion'] !== 'skipped' &&
        (job['status'] !== 'completed' ||
          Date.parse(stringField(job, 'completed_at')) > latest.completed),
    )) {
      if (producer['status'] !== 'completed')
        throw new FactoryFailure('In-flight reservation producer: global provider deny');
      const envelope = await resolveReceipt(context, attempt.runId, 'reserve');
      const receipt = record(envelope['receipt']);
      if (receipt['epoch_id'] !== context.policy['epoch_id'])
        throw new FactoryFailure('Foreign orphan epoch: global provider deny');
      if (
        !recordedTransitions.has(receipt['transition_id']) &&
        receipt['transition_id'] !== pendingTransition
      )
        throw new FactoryFailure(
          'Authoritative orphan reservation is spent; block next reserve until reconciliation',
        );
    }
  }
  let cursor = state;
  let appends = 0;
  while (cursor.head !== latest.core['state_head']) {
    if (++appends > numberField(context.policy, 'recovery_appends_cap'))
      throw new FactoryFailure('Recovery exceeds 100 appends');
    const parents = arrayField(cursor.commit, 'parents').map(record);
    if (parents.length !== 1 || parents[0] === undefined)
      throw new FactoryFailure('Foreign/sibling/merge/rollback state continuity');
    const predecessor = await readState(context, stringField(parents[0], 'sha'));
    if (
      numberField(cursor.checkpoint, 'sequence') !==
      numberField(predecessor.checkpoint, 'sequence') + 1
    )
      throw new FactoryFailure('State sequence gap');
    const envelopes = [...cursor.files.entries()].filter(
      ([file, contents]) =>
        file.startsWith('receipts/') &&
        record(contents['receipt'])['transition_id'] === cursor.checkpoint['last_transition_id'],
    );
    if (envelopes.length !== 1 || envelopes[0] === undefined)
      throw new FactoryFailure('Missing authoritative append receipt');
    const receipt = await verifyAuthority(context, envelopes[0][1]);
    if (
      receipt['parent_head'] !== predecessor.head ||
      receipt['sequence'] !== cursor.checkpoint['sequence']
    )
      throw new FactoryFailure('Foreign append parent/receipt');
    const expected = await transitionFiles(context, predecessor, envelopes[0][1], receipt);
    const receiptPath = `receipts/${stringField(receipt, 'run_id')}-${numberField(receipt, 'run_attempt')}-${stringField(receipt, 'transition_id')}.json`;
    if (
      envelopes[0][0] !== receiptPath ||
      expected.size !== cursor.files.size ||
      [...expected.entries()].some(
        ([file, contents]) =>
          !cursor.files.has(file) || sha256(cursor.files.get(file)) !== sha256(contents),
      )
    )
      throw new FactoryFailure(
        'Git append payload differs from authenticated transition recipe; preserve history',
      );
    cursor = predecessor;
  }
  if (
    latest.core['checkpoint_file_sha256'] !== sha256(cursor.checkpoint) ||
    latest.core['state_payload_sha256'] !== cursor.checkpoint['state_payload_sha256'] ||
    latest.core['receipt_sha256'] !== cursor.checkpoint['receipt_sha256'] ||
    latest.transition !== cursor.checkpoint['last_transition_id']
  )
    throw new FactoryFailure('External checkpoint does not bind actual Git state');
  return latest.core;
}
async function publicationIdentity(
  context: FactoryContext,
  state: StateSnapshot,
  publication: JsonRecord,
): Promise<Lineage> {
  if (
    publication['producer_phase'] !== 'publication' ||
    publication['outcome'] !== 'confirmed' ||
    publication['expected_transition'] !== 'eligible' ||
    publication['reservation_number'] !== null
  )
    throw new FactoryFailure(
      'Only authenticated confirmed publication can establish first lineage',
    );
  const evidence = record(publication['evidence']);
  await verifyEvidenceReference(
    context,
    evidence['scan'],
    'scan',
    stringField(publication, 'current_source_head'),
    stringField(publication, 'fingerprint_policy_revision'),
  );
  const verifier = await verifyEvidenceReference(
    context,
    evidence['verifier'],
    'verifier',
    stringField(publication, 'current_source_head'),
    stringField(publication, 'fingerprint'),
  );
  if (verifier['outcome'] !== 'confirmed')
    throw new FactoryFailure('Independent verifier cannot authorize new confirmed lineage');
  const issueNumber = numberField(publication, 'issue_number');
  const issue = record(await githubRequest(context, `${base(context)}/issues/${issueNumber}`));
  const cutoff = Date.parse(
    stringField(record(state.files.get('bootstrap-ticket.json')), 'legacy_cutoff_at'),
  );
  if (
    !isCanonicalIssueAuthor(context, issue) ||
    issue['node_id'] !== publication['issue_node_id'] ||
    issue['pull_request'] !== undefined ||
    issue['state'] !== 'open' ||
    !(Date.parse(stringField(issue, 'created_at')) > cutoff)
  )
    throw new FactoryFailure('New lineage not proved first post-cutoff canonical issue');
  const identity = {
    repository_id: context.policy['repository_id'],
    fingerprint_policy_revision: stringField(publication, 'fingerprint_policy_revision'),
    fingerprint: stringField(publication, 'fingerprint'),
    issue_node_id: stringField(issue, 'node_id'),
  };
  const lineageId = sha256(identity);
  if (
    publication['lineage_id'] !== lineageId ||
    [...state.files.entries()].some(
      ([file, lineage]) =>
        file.startsWith('lineages/') &&
        (record(lineage['identity'])['fingerprint'] === identity.fingerprint ||
          record(lineage['identity'])['issue_node_id'] === identity.issue_node_id),
    )
  )
    throw new FactoryFailure('Existing or aliased identity cannot start at zero');
  const issues = (await githubPages(context, `${base(context)}/issues?state=all`)).map(record);
  const marker = `<!-- factory-finding-v1 ${JSON.stringify({ repository_id: identity.repository_id, fingerprint_policy_revision: identity.fingerprint_policy_revision, fingerprint: identity.fingerprint })} -->`;
  const matches = issues.filter(
    (candidate) =>
      isCanonicalIssueAuthor(context, candidate) &&
      candidate['pull_request'] === undefined &&
      typeof candidate['body'] === 'string' &&
      candidate['body'].split('\n').includes(marker),
  );
  if (matches.length !== 1 || matches[0]?.['node_id'] !== issue['node_id'])
    throw new FactoryFailure('Recreated or ambiguous finding issue cannot reset lineage');
  return validateProtocol(
    {
      schema: 'factory/v1',
      epoch_id: context.policy['epoch_id'],
      lineage_id: lineageId,
      identity,
      confidence: 'confirmed',
      repair_state: 'eligible',
      history_status: 'verified',
      reservations: [],
      operations: {},
      aliases: [
        {
          kind: 'issue',
          id: String(issueNumber),
          head: null,
          original_identity_sha256: sha256(identity),
        },
      ],
      last_transition_id: publication['transition_id'],
    },
    'lineage',
  );
}
async function prepareRegistration(
  context: FactoryContext,
  state: StateSnapshot,
  checkpoint: CheckpointCore,
  request: JsonRecord,
): Promise<FactoryDecision> {
  const publication = await verifyAuthority(context, record(request['publication_authority']));
  const lineage = await publicationIdentity(context, state, publication);
  const fields = {
    ...publication,
    ...(await producerActor(context, request, false)),
    producer_phase: 'register',
    run_id: context.job['run_id'],
    run_attempt: 1,
    workflow_source_sha: context.job['workflow_source_sha'],
    sequence: numberField(state.checkpoint, 'sequence') + 1,
    parent_head: state.head,
    parent_checkpoint_head: checkpoint['state_head'],
    request_key: sha256({ publication: sha256(publication), lineage_id: lineage['lineage_id'] }),
    expected_transition: 'eligible',
    outcome: 'confirmed',
  };
  const receipt = produceReceipt(fields);
  return {
    status: 'accepted',
    reason: 'Authenticated first post-cutoff lineage receipt prepared',
    record: receipt,
  };
}
async function canonicalLineage(
  context: FactoryContext,
  state: StateSnapshot,
  request: JsonRecord,
): Promise<Lineage> {
  const issueNumber = numberField(request, 'issue_number');
  const issue = record(await githubRequest(context, `${base(context)}/issues/${issueNumber}`));
  if (!isCanonicalIssueAuthor(context, issue))
    throw new FactoryFailure('Canonical issue author untrusted');
  if (issue['state'] !== 'open' || issue['pull_request'] !== undefined)
    throw new FactoryFailure('Canonical issue closed or not an issue');
  const currentLabels = arrayField(issue, 'labels').map((label) =>
    typeof label === 'string' ? label : stringField(record(label), 'name'),
  );
  if (!currentLabels.includes('factory-fix'))
    throw new FactoryFailure('Current owner opt-in label removed or absent');
  const candidates = [...state.files.entries()].filter(
    ([file, lineage]) =>
      file.startsWith('lineages/') &&
      record(lineage['identity'])['issue_node_id'] === issue['node_id'],
  );
  if (candidates.length !== 1 || candidates[0] === undefined)
    throw new FactoryFailure('Unknown/ambiguous canonical lineage');
  const lineage = validateProtocol(candidates[0][1], 'lineage');
  if (lineage['confidence'] !== 'confirmed' || lineage['history_status'] !== 'verified')
    throw new FactoryFailure('Disputed/refuted/unknown history cannot repair');
  const events = (await githubPages(context, `${base(context)}/issues/${issueNumber}/events`)).map(
    record,
  );
  const event = events.find((entry) => String(entry['id']) === request['event_id']);
  if (
    event?.['event'] !== 'labeled' ||
    record(event['label'])['name'] !== 'factory-fix' ||
    String(record(event['actor'])['id']) !== context.policy['owner_id'] ||
    record(event['actor'])['login'] !== context.policy['owner_login']
  )
    throw new FactoryFailure('Owner opt-in event not authenticated');
  return lineage;
}
export async function submitIngress(
  inputContext: FactoryContext,
  request: JsonRecord,
): Promise<FactoryDecision> {
  try {
    const context = await resolveFactoryContext(inputContext);
    effectPolicy(context);
    await verifyControlSource(context);
    const issueNumber = numberField(request, 'issue_number');
    const eventId = stringField(request, 'event_id');
    await githubRequest(
      context,
      `${base(context)}/actions/workflows/${stringField(context.policy, 'controller_workflow_id')}/dispatches`,
      'POST',
      {
        ref: 'main',
        inputs: {
          command: 'admit',
          request: JSON.stringify({ issue_number: issueNumber, event_id: eventId }),
        },
      },
    );
    return {
      status: 'accepted',
      reason: 'Identifiers dispatched only; admission/delivery not inferred',
    };
  } catch (error: unknown) {
    return { status: 'denied', reason: safeReason(error) };
  }
}
const NIGHT_REVIEW_PATH = '.github/workflows/night-review.yml';
// The scheduled review asks the native controller for a night scan; only its own main run may.
export async function nightScan(inputContext: FactoryContext): Promise<FactoryDecision> {
  try {
    const context = await resolveFactoryContext(inputContext);
    effectPolicy(context);
    await verifyControlSource(context, false, NIGHT_REVIEW_PATH);
    const repository = stringField(context.policy, 'repository_full_name');
    if (context.job['workflow_ref'] !== `${repository}/${NIGHT_REVIEW_PATH}@refs/heads/main`)
      throw new FactoryFailure('Night scan may be requested only by the night-review run on main');
    const runId = stringField(context.job, 'run_id');
    const run = record(await githubRequest(context, `${base(context)}/actions/runs/${runId}`));
    const registered = arrayField(context.policy, 'workflow_registry')
      .map(record)
      .find((entry) => entry['path'] === NIGHT_REVIEW_PATH);
    if (
      registered === undefined ||
      (typeof run['path'] === 'string' ? run['path'].split('@')[0] : null) !== NIGHT_REVIEW_PATH ||
      String(run['workflow_id']) !== registered['id'] ||
      run['head_branch'] !== 'main' ||
      !['schedule', 'workflow_dispatch'].includes(String(run['event'])) ||
      String(record(run['repository'])['id']) !== context.policy['repository_id']
    )
      throw new FactoryFailure('Current run is not the night-review workflow on main');
    await githubRequest(
      context,
      `${base(context)}/actions/workflows/${stringField(context.policy, 'controller_workflow_id')}/dispatches`,
      'POST',
      {
        ref: 'main',
        inputs: { command: 'night-scan', request: JSON.stringify({ parent_run_id: runId }) },
      },
    );
    return { status: 'accepted', reason: 'Night scan dispatched; completion not inferred' };
  } catch (error: unknown) {
    return { status: 'denied', reason: safeReason(error) };
  }
}
const NIGHT_VERDICTS = ['confirmed', 'disputed'];
const NIGHT_RECORD_LIMIT = 1_000_000;
// shortcut: one finding per night because a run carries one verifier receipt (F1); lift with protocol v2.
function nightDraft(context: FactoryContext, request: JsonRecord): JsonRecord {
  const file = stringField(request, 'draft_file');
  if (fs.statSync(file).size > NIGHT_RECORD_LIMIT)
    throw new FactoryFailure('Night draft too large');
  const draft = parseFactoryJson(fs.readFileSync(file));
  const findings = arrayField(draft, 'findings').map(record);
  if (findings.length > 1) throw new FactoryFailure('Night draft may carry at most one finding');
  if (
    ['token_budget', 'authority', 'disappearance_authority', 'reopen_authority'].some(
      (key) => draft[key] !== undefined,
    ) ||
    findings.some((finding) => finding['authority'] !== undefined)
  )
    throw new FactoryFailure('Night draft must not carry token_budget or authority');
  if (
    draft['source_sha'] !== context.job['workflow_source_sha'] ||
    draft['repository_id'] !== context.policy['repository_id']
  )
    throw new FactoryFailure('Night draft source_sha differs from the checked-out workflow sha');
  if (
    stringField(draft, 'fingerprint_policy_revision') === '' ||
    draft['fingerprint_policy_revision'] !==
      record(context.staticPolicy['night_scan'] ?? {})['fingerprint_policy_revision']
  )
    throw new FactoryFailure('Night draft fingerprint policy revision differs from the policy');
  for (const finding of findings) {
    if (!/^[0-9a-f]{64}$/.test(stringField(finding, 'fingerprint')))
      throw new FactoryFailure('Night finding fingerprint invalid');
    if (!NIGHT_VERDICTS.includes(String(finding['verdict'])))
      throw new FactoryFailure('Night finding verdict must be confirmed or disputed');
  }
  return draft;
}
async function prepareNightEvidence(
  context: FactoryContext,
  state: StateSnapshot,
  checkpoint: CheckpointCore,
  request: JsonRecord,
  phase: 'verifier' | 'scan',
): Promise<FactoryDecision> {
  const draft = nightDraft(context, request);
  const finding = arrayField(draft, 'findings').map(record)[0];
  const sourceSha = stringField(draft, 'source_sha');
  let payload: JsonRecord;
  let target: string;
  let outcome: string;
  let scanRecord: JsonRecord | null = null;
  if (phase === 'verifier') {
    if (finding === undefined) throw new FactoryFailure('Night verifier needs exactly one finding');
    payload = finding;
    target = stringField(finding, 'fingerprint');
    outcome = stringField(finding, 'verdict');
  } else {
    const budget = context.policy['token_budget'];
    if (typeof budget !== 'number' || !Number.isSafeInteger(budget) || budget <= 0)
      throw new FactoryFailure('Activation policy token_budget unknown');
    let findings: JsonRecord[] = [];
    if (finding !== undefined) {
      // The scan record carries the same-run verifier receipt so its hash covers the adjudication.
      const verifier = await resolveReceipt(
        context,
        stringField(context.job, 'run_id'),
        'verifier',
      );
      const proof = record(verifier['receipt']);
      const operation = record(proof['operation']);
      if (
        proof['outcome'] !== finding['verdict'] ||
        operation['target_id'] !== finding['fingerprint'] ||
        operation['payload_sha256'] !== sha256(finding) ||
        operation['expected_head'] !== sourceSha
      )
        throw new FactoryFailure('Verifier receipt does not bind the draft finding');
      findings = [{ ...finding, authority: verifier }];
    }
    scanRecord = { ...draft, token_budget: budget, findings };
    if (canonicalBytes(scanRecord).length > NIGHT_RECORD_LIMIT)
      throw new FactoryFailure('Scan record exceeds 1 MB');
    payload = scanRecord;
    target = stringField(draft, 'fingerprint_policy_revision');
    outcome =
      draft['successful'] === true &&
      draft['truncated'] === false &&
      arrayField(draft, 'failed').length === 0
        ? 'complete'
        : 'incomplete';
  }
  const defaultHead = stringField(
    record(record(await githubRequest(context, `${base(context)}/git/ref/heads/main`))['object']),
    'sha',
  );
  const payloadSha = sha256(payload);
  const actor = await producerActor(context, request, true);
  const parentId = actor.actor_decision === 'owner' ? null : stringField(request, 'parent_run_id');
  const requestKey =
    parentId === null
      ? sha256({
          phase,
          run_id: context.job['run_id'],
          parent_run_id: null,
          payload_sha256: payloadSha,
        })
      : nightParentKey(phase, parentId);
  if (parentId !== null) await assertParentUnused(context, parentId, [requestKey]);
  const receipt = produceReceipt({
    epoch_id: context.policy['epoch_id'],
    sequence: numberField(state.checkpoint, 'sequence') + 1,
    parent_head: state.head,
    parent_checkpoint_head: checkpoint['state_head'],
    repository_id: context.policy['repository_id'],
    repository_full_name: context.policy['repository_full_name'],
    workflow_id: context.policy['controller_workflow_id'],
    workflow_path: context.policy['controller_workflow_path'],
    workflow_source_sha: context.job['workflow_source_sha'],
    control_release_sha: context.policy['control_release_sha'],
    control_manifest_sha256: sha256(context.policy['control_manifest']),
    default_ref: context.policy['default_ref'],
    default_head: defaultHead,
    run_id: context.job['run_id'],
    run_attempt: 1,
    event: 'workflow_dispatch',
    ...actor,
    producer_phase: phase,
    request_key: requestKey,
    lineage_id: null,
    issue_node_id: null,
    issue_number: null,
    fingerprint_policy_revision: null,
    fingerprint: null,
    baseline_sha: null,
    current_source_head: null,
    expected_transition: 'detached',
    reservation_number: null,
    operation: {
      initial_claimed: true,
      retry_claimed: false,
      status: 'succeeded',
      payload_sha256: payloadSha,
      target_id: target,
      expected_head: sourceSha,
      result_id: null,
      reason: null,
    },
    aliases: [],
    outcome,
    evidence: { scan: null, verifier: null },
  });
  if (scanRecord !== null && request['record_file'] !== undefined)
    fs.writeFileSync(stringField(request, 'record_file'), canonicalBytes(scanRecord));
  return {
    status: 'accepted',
    reason: `Detached ${phase} receipt prepared; authority exists only after immutable upload`,
    record: receipt,
  };
}
export async function runController(
  inputContext: FactoryContext,
  request: JsonRecord,
): Promise<FactoryDecision> {
  try {
    const context = await resolveFactoryContext(inputContext);
    if (request['command'] === 'preflight' && context.policy['activation'] !== true)
      return {
        status: 'prepared',
        reason: 'Disabled source; no mutation/dispatch/provider',
        record: { authorized: false, control_release_sha: null },
      };
    effectPolicy(context);
    await verifyControlSource(context);
    if (
      context.job['workflow_ref'] !==
      `${stringField(context.policy, 'repository_full_name')}/${stringField(context.policy, 'controller_workflow_path')}@refs/heads/main`
    )
      throw new FactoryFailure('Only exact native controller may mutate state/reserve');
    const command = stringField(request, 'command');
    if (
      context.role === 'bootstrap' &&
      !['bootstrap', 'checkpoint', 'source-preflight'].includes(command)
    )
      throw new FactoryFailure('Bootstrap role cannot admit/reserve/repair');
    if (command === 'source-preflight')
      return {
        status: 'accepted',
        reason: 'Independent role/source/policy admitted; no mutation',
        record: { authorized: true, control_release_sha: context.policy['control_release_sha'] },
      };
    if (command === 'bootstrap') return await bootstrapGenesis(context, request);
    const state = await readState(context, await stateHead(context));
    if (command === 'checkpoint' && context.role === 'bootstrap') {
      const envelope = [...state.files.entries()].find(
        ([file, value]) =>
          file.startsWith('receipts/') &&
          value['receipt_sha256'] === state.checkpoint['receipt_sha256'],
      )?.[1];
      if (envelope === undefined) throw new FactoryFailure('Genesis receipt envelope missing');
      const genesis = await verifyAuthority(context, envelope);
      if (
        genesis['producer_phase'] !== 'bootstrap' ||
        genesis['legacy_inventory_sha256'] !==
          record(state.checkpoint['bootstrap'])['legacy_inventory_sha256']
      )
        throw new FactoryFailure('Genesis producer/inventory mismatch');
      return checkpointResult(context, state);
    }
    const pendingEnvelope =
      command === 'append'
        ? request['envelope'] === undefined
          ? await resolveReceipt(
              context,
              stringField(context.job, 'run_id'),
              stringField(request, 'producer_phase'),
            )
          : record(request['envelope'])
        : null;
    const pending =
      pendingEnvelope === null ? null : await verifyAuthority(context, pendingEnvelope);
    if (pending !== null) {
      const existing = [...state.files.entries()].find(
        ([file, value]) =>
          file.startsWith('receipts/') &&
          record(value['receipt'])['transition_id'] === pending['transition_id'],
      );
      if (existing !== undefined) {
        if (sha256(existing[1]['receipt']) !== sha256(pending))
          throw new FactoryFailure('Conflicting identical transition identity');
        await discoverCheckpoint(context, state);
        return {
          status: 'accepted',
          reason: 'Identical authenticated transition already present; no repeated effects',
          record: {
            state_head: state.head,
            sequence: state.checkpoint['sequence'],
            transition_id: pending['transition_id'],
            provider_allowed: false,
          },
        };
      }
    }
    if (
      pending !== null &&
      (pending['run_id'] !== context.job['run_id'] ||
        pending['parent_head'] !== state.head ||
        pending['sequence'] !== numberField(state.checkpoint, 'sequence') + 1)
    )
      throw new FactoryFailure('Fresh append producer/predecessor conflict');
    const checkpoint = await discoverCheckpoint(
      context,
      state,
      pending === null ? null : stringField(pending, 'transition_id'),
    );
    if (command === 'recover')
      return {
        status: 'accepted',
        reason:
          'Exact checkpoint and complete state continuity recovered; prior reservations never reinvoked',
        record: {
          state_head: state.head,
          checkpoint_head: checkpoint['state_head'],
          sequence: state.checkpoint['sequence'],
        },
      };
    if (command === 'append')
      return await appendTransition(context, state, record(pendingEnvelope));
    if (command === 'checkpoint') return checkpointResult(context, state);
    if (command === 'register')
      return await prepareRegistration(context, state, checkpoint, request);
    if (command === 'verifier' || command === 'scan')
      return await prepareNightEvidence(context, state, checkpoint, request, command);
    const lineage = await canonicalLineage(context, state, request);
    const reservations = arrayField(lineage, 'reservations');
    if (command === 'effect-gate')
      return {
        status: 'denied',
        reason:
          'No approved external fixer configured; recovery never reinvokes a provider reservation',
      };
    if (command === 'admit' || command === 'preflight')
      return {
        status: reservations.length >= 2 ? 'denied' : 'accepted',
        reason:
          reservations.length >= 2
            ? 'Two reservations exhausted'
            : 'Authentic owner/canonical confirmed lineage admitted',
        record: {
          authorized: reservations.length < 2,
          control_release_sha: context.policy['control_release_sha'],
          lineage_id: lineage['lineage_id'],
          issue_number: request['issue_number'],
          consumed: reservations.length,
        },
      };
    if (
      ['operation-intent', 'operation-outcome', 'retry-claim', 'operation-gate'].includes(command)
    )
      return await transportOperation(context, state, checkpoint, lineage, request);
    if (command !== 'reserve' && command !== 'outcome')
      return { status: 'denied', reason: 'Unknown controller command' };
    if (command === 'reserve' && reservations.length >= 2)
      return { status: 'denied', reason: 'Two reservations exhausted' };
    const sequence = numberField(state.checkpoint, 'sequence') + 1;
    const requestKey = sha256({ event_id: request['event_id'], lineage_id: lineage['lineage_id'] });
    if (
      command === 'reserve' &&
      reservations.map(record).some((reservation) => reservation['request_key'] === requestKey)
    )
      throw new FactoryFailure('Identical opt-in already consumed; no second reservation');
    const identity = record(lineage['identity']);
    const defaultHead = stringField(
      record(record(await githubRequest(context, `${base(context)}/git/ref/heads/main`))['object']),
      'sha',
    );
    const receipt = produceReceipt({
      epoch_id: context.policy['epoch_id'],
      sequence,
      parent_head: state.head,
      parent_checkpoint_head: checkpoint['state_head'],
      repository_id: context.policy['repository_id'],
      repository_full_name: context.policy['repository_full_name'],
      workflow_id: context.policy['controller_workflow_id'],
      workflow_path: context.policy['controller_workflow_path'],
      workflow_source_sha: context.job['workflow_source_sha'],
      control_release_sha: context.policy['control_release_sha'],
      control_manifest_sha256: sha256(context.policy['control_manifest']),
      default_ref: context.policy['default_ref'],
      default_head: defaultHead,
      run_id: context.job['run_id'],
      run_attempt: 1,
      event: 'workflow_dispatch',
      ...(await producerActor(context, request, false)),
      producer_phase: command,
      request_key: requestKey,
      lineage_id: lineage['lineage_id'],
      issue_node_id: identity['issue_node_id'],
      issue_number: request['issue_number'],
      fingerprint_policy_revision: identity['fingerprint_policy_revision'],
      fingerprint: identity['fingerprint'],
      baseline_sha: defaultHead,
      current_source_head: defaultHead,
      expected_transition: command === 'reserve' ? 'reserved' : request['outcome'],
      reservation_number: command === 'reserve' ? reservations.length + 1 : reservations.length,
      operation: null,
      aliases: lineage['aliases'],
      outcome: command === 'reserve' ? 'consumed' : request['outcome'],
      evidence: latestLineageReceipt(state, lineage)['evidence'],
    });
    return {
      status: 'accepted',
      reason:
        'Canonical receipt ready; quota consumed only with authenticated immutable upload, no provider yet',
      record: receipt,
    };
  } catch (error: unknown) {
    return { status: 'denied', reason: safeReason(error) };
  }
}
function latestLineageReceipt(state: StateSnapshot, lineage: Lineage): JsonRecord {
  const envelope = [...state.files.entries()].find(
    ([file, value]) =>
      file.startsWith('receipts/') &&
      record(value['receipt'])['transition_id'] === lineage['last_transition_id'],
  )?.[1];
  if (envelope === undefined) throw new FactoryFailure('Latest lineage receipt missing');
  return record(envelope['receipt']);
}
async function transportOperation(
  context: FactoryContext,
  state: StateSnapshot,
  checkpoint: CheckpointCore,
  lineage: Lineage,
  request: JsonRecord,
): Promise<FactoryDecision> {
  const stage = stringField(request, 'stage');
  if (
    ![
      'receipt-upload',
      'state-publication',
      'patch-upload',
      'expected-head-push',
      'issue-publication',
      'pr-publication',
      'dispatch',
      'checkpoint-upload',
    ].includes(stage)
  )
    throw new FactoryFailure('Unknown named transport stage');
  const proof = await verifyAuthority(context, record(request['operation_authority']));
  if (
    proof['lineage_id'] !== lineage['lineage_id'] ||
    proof['reservation_number'] !== arrayField(lineage, 'reservations').length ||
    proof['actor_decision'] === 'denied'
  )
    throw new FactoryFailure('Transport claim lineage/reservation mismatch');
  const proofOperation = record(proof['operation']);
  const branch = `factory/${stringField(lineage, 'lineage_id')}/${numberField(proof, 'reservation_number')}`;
  const canonicalPayload =
    stage === 'expected-head-push'
      ? {
          repository_id: context.policy['repository_id'],
          branch,
          head: proof['current_source_head'],
        }
      : stage === 'pr-publication'
        ? {
            title: `fix: verified finding ${stringField(lineage, 'lineage_id').slice(0, 12)}`,
            head: branch,
            base: 'main',
            body: `Fixes #${numberField(proof, 'issue_number')}\n\nFactory lineage: ${stringField(lineage, 'lineage_id')}`,
          }
        : null;
  const payload: JsonRecord =
    canonicalPayload === null
      ? proofOperation
      : {
          ...proofOperation,
          payload_sha256: sha256(canonicalPayload),
          expected_head: proof['current_source_head'],
          target_id: branch,
        };
  const key = sha256({
    lineage_id: lineage['lineage_id'],
    reservation_number: proof['reservation_number'],
    stage,
    exact_payload_sha256: payload['payload_sha256'],
    expected_head: payload['expected_head'],
    target_id: payload['target_id'],
  });
  const previous = record(lineage['operations'])[key];
  const command = stringField(request, 'command');
  if (command === 'operation-gate') {
    const operation = record(previous);
    const recorded = [...state.files.entries()].find(
      ([file, value]) => file.startsWith('receipts/') && value['receipt_sha256'] === sha256(proof),
    );
    if (
      recorded === undefined ||
      proof['run_id'] !== context.job['run_id'] ||
      proof['request_key'] !== key ||
      !['operation-intent', 'retry-claim'].includes(stringField(proof, 'producer_phase')) ||
      operation['initial_claimed'] !== true ||
      !['intent', 'retryable-failure'].includes(stringField(operation, 'status')) ||
      (operation['status'] === 'retryable-failure' && operation['retry_claimed'] !== true)
    )
      throw new FactoryFailure(
        'No exact durable current-run initial/retry claim; ambiguous adoption forbidden',
      );
    return {
      status: 'accepted',
      reason: 'Exact named operation durably claimed under sole native controller',
      record: {
        operation_key: key,
        payload_sha256: operation['payload_sha256'],
        target_id: operation['target_id'],
        expected_head: operation['expected_head'],
        retry: operation['retry_claimed'],
      },
    };
  }
  let operation: JsonRecord;
  if (command === 'operation-intent') {
    if (
      previous !== undefined ||
      payload['status'] !== 'succeeded' ||
      proof['outcome'] !== 'patch-ready'
    )
      throw new FactoryFailure('Initial operation already claimed or exact patch not proved');
    operation = {
      ...payload,
      initial_claimed: true,
      retry_claimed: false,
      status: 'intent',
      result_id: null,
      reason: null,
    };
  } else if (command === 'retry-claim') {
    const old = record(previous);
    if (
      old['initial_claimed'] !== true ||
      old['retry_claimed'] !== false ||
      old['status'] !== 'retryable-failure' ||
      payload['status'] !== 'retryable-failure' ||
      proof['request_key'] !== key ||
      !['operation-outcome'].includes(stringField(proof, 'producer_phase'))
    )
      throw new FactoryFailure(
        'Retry denied: no definitive durable retryable failure or allowance exhausted',
      );
    operation = { ...old, retry_claimed: true };
  } else {
    const old = record(previous);
    if (
      old['initial_claimed'] !== true ||
      proof['producer_phase'] !== 'patch' ||
      !['succeeded', 'retryable-failure', 'ambiguous', 'denied'].includes(
        stringField(payload, 'status'),
      )
    )
      throw new FactoryFailure('Unproved operation result/classification');
    operation = {
      ...old,
      status: payload['status'],
      result_id: payload['result_id'],
      reason: payload['reason'],
    };
  }
  const last = latestLineageReceipt(state, lineage);
  const receipt = produceReceipt({
    ...last,
    run_id: context.job['run_id'],
    run_attempt: 1,
    workflow_source_sha: context.job['workflow_source_sha'],
    sequence: numberField(state.checkpoint, 'sequence') + 1,
    parent_head: state.head,
    parent_checkpoint_head: checkpoint['state_head'],
    producer_phase: command,
    request_key: key,
    current_source_head: proof['current_source_head'],
    baseline_sha: proof['baseline_sha'],
    reservation_number: proof['reservation_number'],
    operation,
    expected_transition: lineage['repair_state'],
    outcome: 'transport-accounting',
  });
  return {
    status: 'accepted',
    reason:
      'Named transport claim/result prepared; upload+append+checkpoint must complete before operation',
    record: receipt,
  };
}
function checkpointResult(context: FactoryContext, state: StateSnapshot): FactoryDecision {
  const core = validateProtocol(
    {
      schema: 'factory/v1',
      kind: 'checkpoint',
      epoch_id: context.policy['epoch_id'],
      sequence: state.checkpoint['sequence'],
      state_head: state.head,
      checkpoint_file_sha256: sha256(state.checkpoint),
      state_payload_sha256: state.checkpoint['state_payload_sha256'],
      previous_checkpoint_head: state.checkpoint['previous_external_checkpoint_head'],
      receipt_sha256: state.checkpoint['receipt_sha256'],
      run_id: context.job['run_id'],
      run_attempt: context.job['run_attempt'],
      workflow_id: context.policy['controller_workflow_id'],
      workflow_source_sha: context.job['workflow_source_sha'],
      control_release_sha: context.policy['control_release_sha'],
      control_manifest_sha256: sha256(context.policy['control_manifest']),
    },
    'checkpoint-core',
  );
  return {
    status: 'accepted',
    reason: 'Canonical actual-head checkpoint core prepared for immutable native upload',
    record: core,
  };
}
async function bootstrapGenesis(
  context: FactoryContext,
  request: JsonRecord,
): Promise<FactoryDecision> {
  if (context.role !== 'bootstrap')
    throw new FactoryFailure('Bootstrap requires explicit role and reviewed disabled policy');
  try {
    await stateHead(context);
    throw new FactoryFailure('State already exists; no rebootstrap');
  } catch (error: unknown) {
    if (!(error instanceof GitHubFailure) || error.status !== 404) throw error;
  }
  const historicalRuns = (
    await githubPages(
      context,
      `${base(context)}/actions/workflows/${stringField(context.policy, 'controller_workflow_id')}/runs`,
      'workflow_runs',
    )
  ).map(record);
  for (const run of historicalRuns) {
    if (String(run['id']) === context.job['run_id']) continue;
    for (let attempt = 1; attempt <= numberField(run, 'run_attempt'); attempt++) {
      const jobs = (
        await githubPages(
          context,
          `${base(context)}/actions/runs/${String(run['id'])}/attempts/${attempt}/jobs`,
          'jobs',
        )
      ).map(record);
      if (
        jobs.some(
          (job) => job['name'] === 'factory-authority-bootstrap' && job['status'] !== 'queued',
        )
      )
        throw new FactoryFailure(
          'Prior bootstrap history exists; a missing ref cannot authorize rebootstrap',
        );
    }
  }
  const ticket = validateProtocol(context.policy['bootstrap_ticket'], 'ticket');
  if (sha256(request['bootstrap_ticket']) !== sha256(ticket))
    throw new FactoryFailure('Unreviewed bootstrap ticket');
  const issues = (await githubPages(context, `${base(context)}/issues?state=all`))
    .map(record)
    .filter(
      (issue) => isCanonicalIssueAuthor(context, issue) && issue['pull_request'] === undefined,
    );
  const prs = (await githubPages(context, `${base(context)}/pulls?state=all`)).map(record);
  const imported: Lineage[] = [];
  for (const issue of issues) {
    if (typeof issue['body'] !== 'string' || !issue['body'].includes('<!-- factory-finding-v1 '))
      continue;
    const marker = /<!-- factory-finding-v1 (\{[^\n]*\}) -->/.exec(issue['body'])?.[1];
    if (marker === undefined)
      throw new FactoryFailure('Unidentifiable legacy canonical issue; inventory unknown');
    const markerValue: unknown = JSON.parse(marker);
    const finding = record(markerValue);
    if (finding['repository_id'] !== context.policy['repository_id'])
      throw new FactoryFailure('Foreign legacy finding binding');
    const identity = {
      repository_id: context.policy['repository_id'],
      fingerprint_policy_revision: stringField(finding, 'fingerprint_policy_revision'),
      fingerprint: stringField(finding, 'fingerprint'),
      issue_node_id: stringField(issue, 'node_id'),
    };
    const lineageId = sha256(identity);
    imported.push(
      validateProtocol(
        {
          schema: 'factory/v1',
          epoch_id: ticket['epoch_id'],
          lineage_id: lineageId,
          identity,
          confidence: 'unknown',
          repair_state: 'needs-human',
          history_status: 'unknown',
          reservations: [],
          operations: {},
          aliases: [
            {
              kind: 'issue',
              id: String(issue['number']),
              head: null,
              original_identity_sha256: sha256(identity),
            },
          ],
          last_transition_id: sha256(ticket),
        },
        'lineage',
      ),
    );
  }
  for (const pr of prs) {
    const identity = {
      repository_id: context.policy['repository_id'],
      kind: 'pr',
      original_update_identity: `quarantined-pr:${stringField(pr, 'node_id')}`,
    };
    imported.push(
      validateProtocol(
        {
          schema: 'factory/v1',
          epoch_id: ticket['epoch_id'],
          lineage_id: sha256(identity),
          identity,
          confidence: 'unknown',
          repair_state: 'needs-human',
          history_status: 'unknown',
          reservations: [],
          operations: {},
          aliases: [
            {
              kind: 'pr',
              id: String(pr['number']),
              head: stringField(record(pr['head']), 'sha'),
              original_identity_sha256: sha256(identity),
            },
          ],
          last_transition_id: sha256(ticket),
        },
        'lineage',
      ),
    );
  }
  const inventory = validateProtocol(
    {
      schema: 'factory/v1',
      repository_id: ticket['repository_id'],
      epoch_id: ticket['epoch_id'],
      legacy_cutoff_sha: ticket['legacy_cutoff_sha'],
      legacy_cutoff_at: ticket['legacy_cutoff_at'],
      lineages: imported
        .map((lineage) => ({ lineage_id: lineage['lineage_id'], file_sha256: sha256(lineage) }))
        .toSorted((a, b) => Buffer.compare(canonicalBytes(a), canonicalBytes(b))),
    },
    'inventory',
  );
  const defaultHead = stringField(
    record(record(await githubRequest(context, `${base(context)}/git/ref/heads/main`))['object']),
    'sha',
  );
  const receipt = produceReceipt({
    epoch_id: ticket['epoch_id'],
    sequence: 0,
    parent_head: null,
    parent_checkpoint_head: null,
    repository_id: context.policy['repository_id'],
    repository_full_name: context.policy['repository_full_name'],
    workflow_id: context.policy['controller_workflow_id'],
    workflow_path: context.policy['controller_workflow_path'],
    workflow_source_sha: context.job['workflow_source_sha'],
    control_release_sha: context.policy['control_release_sha'],
    control_manifest_sha256: sha256(context.policy['control_manifest']),
    default_ref: context.policy['default_ref'],
    default_head: defaultHead,
    run_id: context.job['run_id'],
    run_attempt: 1,
    event: 'workflow_dispatch',
    actor_id: context.policy['owner_id'],
    actor_login: context.policy['owner_login'],
    actor_decision: 'owner',
    producer_phase: 'bootstrap',
    request_key: sha256(ticket),
    lineage_id: null,
    issue_node_id: null,
    issue_number: null,
    fingerprint_policy_revision: null,
    fingerprint: null,
    baseline_sha: null,
    current_source_head: null,
    expected_transition: 'genesis',
    reservation_number: null,
    operation: null,
    aliases: [],
    outcome: 'quarantine',
    evidence: { scan: null, verifier: null },
    bootstrap_ticket: ticket,
    legacy_inventory_sha256: sha256(inventory),
  });
  if (request['envelope'] === undefined)
    return {
      status: 'accepted',
      reason: 'Complete quarantine inventory and genesis receipt prepared; no ref created',
      record: { receipt, inventory, lineages: imported },
    };
  const envelope = validateProtocol(request['envelope'], 'envelope');
  const authenticated = await verifyAuthority(context, envelope);
  if (sha256(authenticated) !== sha256(receipt))
    throw new FactoryFailure('Genesis inventory/receipt changed after authentication');
  const files = new Map<string, JsonRecord>([
    ['bootstrap-ticket.json', ticket],
    ['legacy-inventory.json', inventory],
    ['stop.json', { schema: 'factory/v1', stopped: false }],
    [
      `receipts/${stringField(receipt, 'run_id')}-1-${stringField(receipt, 'transition_id')}.json`,
      envelope,
    ],
  ]);
  for (const lineage of imported)
    files.set(`lineages/${stringField(lineage, 'lineage_id')}.json`, lineage);
  const payload = [...files.entries()]
    .map(([file, contents]) => ({ path: file, 'blob-content-sha256': sha256(contents) }))
    .toSorted((a, b) => Buffer.compare(canonicalBytes(a.path), canonicalBytes(b.path)));
  const bootstrap = validateProtocol(
    {
      schema: 'factory/v1',
      repository_id: ticket['repository_id'],
      epoch_id: ticket['epoch_id'],
      genesis_head: null,
      genesis_receipt_sha256: sha256(receipt),
      activation_policy_sha256: null,
      legacy_mode: 'quarantine',
      legacy_cutoff_sha: ticket['legacy_cutoff_sha'],
      legacy_cutoff_at: ticket['legacy_cutoff_at'],
      bootstrap_completed: false,
      phase: 'genesis',
      legacy_inventory_sha256: sha256(inventory),
    },
    'bootstrap',
  );
  const checkpoint = validateProtocol(
    {
      schema: 'factory/v1',
      epoch_id: ticket['epoch_id'],
      sequence: 0,
      bootstrap,
      previous_external_checkpoint_head: null,
      last_transition_id: receipt['transition_id'],
      receipt_sha256: sha256(receipt),
      state_payload_sha256: sha256(payload),
    },
    'checkpoint',
  );
  files.set('checkpoint.json', checkpoint);
  await verifyControlSource(context);
  try {
    await stateHead(context);
    throw new FactoryFailure('Ref appeared before bootstrap; no update');
  } catch (error: unknown) {
    if (!(error instanceof GitHubFailure) || error.status !== 404) throw error;
  }
  const entries: JsonRecord[] = [];
  for (const [file, contents] of files) {
    const blob = record(
      await githubRequest(context, `${base(context)}/git/blobs`, 'POST', {
        content: canonicalBytes(contents).toString('base64'),
        encoding: 'base64',
      }),
    );
    entries.push({ path: file, type: 'blob', mode: '100644', sha: blob['sha'] });
  }
  const tree = record(
    await githubRequest(context, `${base(context)}/git/trees`, 'POST', { tree: entries }),
  );
  const root = record(
    await githubRequest(context, `${base(context)}/git/commits`, 'POST', {
      tree: tree['sha'],
      parents: [],
      message: `factory genesis: ${stringField(ticket, 'epoch_id')}`,
    }),
  );
  await githubRequest(context, `${base(context)}/git/refs`, 'POST', {
    ref: 'refs/heads/factory-state',
    sha: root['sha'],
  });
  if ((await stateHead(context)) !== root['sha'])
    throw new FactoryFailure('Genesis publication ambiguous; reconcile, never rebootstrap');
  return {
    status: 'accepted',
    reason:
      'One root created; external genesis checkpoint and separately reviewed active policy required',
    record: {
      genesis_head: root['sha'],
      genesis_receipt_sha256: sha256(receipt),
      legacy_inventory_sha256: sha256(inventory),
      bootstrap_completed: false,
    },
  };
}
async function transitionFiles(
  context: FactoryContext,
  state: StateSnapshot,
  envelope: JsonRecord,
  receipt: JsonRecord,
): Promise<Map<string, JsonRecord>> {
  const files = new Map(state.files);
  const lineageId = stringField(receipt, 'lineage_id');
  const file = `lineages/${lineageId}.json`;
  let lineage = files.get(file);
  if (receipt['producer_phase'] === 'register') {
    if (
      lineage !== undefined ||
      receipt['reservation_number'] !== null ||
      receipt['outcome'] !== 'confirmed'
    )
      throw new FactoryFailure('Registration cannot reset existing lineage');
    lineage = await publicationIdentity(context, state, {
      ...receipt,
      producer_phase: 'publication',
    });
  }
  if (lineage === undefined) throw new FactoryFailure('Unmapped new/legacy lineage');
  const reservations = arrayField(lineage, 'reservations');
  const operations = record(lineage['operations']);
  if (receipt['operation'] !== null) {
    const next = record(receipt['operation']);
    const previous = operations[stringField(receipt, 'request_key')];
    if (previous !== undefined) {
      const old = record(previous);
      if (
        old['payload_sha256'] !== next['payload_sha256'] ||
        old['expected_head'] !== next['expected_head'] ||
        old['target_id'] !== next['target_id'] ||
        (old['initial_claimed'] === true && next['initial_claimed'] !== true) ||
        (old['retry_claimed'] === true && next['retry_claimed'] !== true)
      )
        throw new FactoryFailure('Transport operation change/refund denied');
    }
  }
  const reserve = receipt['producer_phase'] === 'reserve';
  if (
    reserve &&
    (reservations.length >= 2 || receipt['reservation_number'] !== reservations.length + 1)
  )
    throw new FactoryFailure('Reservation exhausted/conflict');
  const reservation = {
    number: reservations.length + 1,
    transition_id: receipt['transition_id'],
    request_key: receipt['request_key'],
    provider_owner_run_id: receipt['run_id'],
    provider_owner_run_attempt: receipt['run_attempt'],
    baseline_sha: receipt['baseline_sha'],
    current_source_head: receipt['current_source_head'],
    consumed: true,
    outcome: receipt['outcome'],
  };
  files.set(
    file,
    validateProtocol(
      {
        ...lineage,
        repair_state: reserve ? 'reserved' : receipt['expected_transition'],
        reservations: reserve ? [...reservations, reservation] : reservations,
        operations:
          receipt['operation'] === null
            ? operations
            : { ...operations, [stringField(receipt, 'request_key')]: receipt['operation'] },
        last_transition_id: receipt['transition_id'],
      },
      'lineage',
    ),
  );
  files.set(
    `receipts/${stringField(receipt, 'run_id')}-${numberField(receipt, 'run_attempt')}-${stringField(receipt, 'transition_id')}.json`,
    envelope,
  );
  const oldBootstrap = record(state.checkpoint['bootstrap']);
  const bootstrap = {
    ...oldBootstrap,
    phase: 'active',
    genesis_head: context.policy['genesis_head'],
    activation_policy_sha256: stringField(context.policy, 'activation_policy_sha256'),
    bootstrap_completed: true,
  };
  const payload = [...files.entries()]
    .filter(([name]) => name !== 'checkpoint.json')
    .map(([name, contents]) => ({ path: name, 'blob-content-sha256': sha256(contents) }))
    .toSorted((a, b) => Buffer.compare(canonicalBytes(a.path), canonicalBytes(b.path)));
  const checkpoint = validateProtocol(
    {
      ...state.checkpoint,
      sequence: receipt['sequence'],
      bootstrap,
      previous_external_checkpoint_head: receipt['parent_checkpoint_head'],
      last_transition_id: receipt['transition_id'],
      receipt_sha256: sha256(receipt),
      state_payload_sha256: sha256(payload),
    },
    'checkpoint',
  );
  files.set('checkpoint.json', checkpoint);
  return files;
}
async function appendTransition(
  context: FactoryContext,
  state: StateSnapshot,
  envelope: JsonRecord,
): Promise<FactoryDecision> {
  const receipt = await verifyAuthority(context, envelope);
  if (
    receipt['parent_head'] !== state.head ||
    receipt['sequence'] !== numberField(state.checkpoint, 'sequence') + 1
  )
    throw new FactoryFailure('Receipt predecessor conflict; no transplant');
  const files = await transitionFiles(context, state, envelope, receipt);
  await verifyControlSource(context);
  if ((await stateHead(context)) !== state.head)
    throw new FactoryFailure('Sibling conflict before append; preserve candidates');
  const entries: JsonRecord[] = [];
  for (const [name, contents] of files) {
    const blob = record(
      await githubRequest(context, `${base(context)}/git/blobs`, 'POST', {
        content: canonicalBytes(contents).toString('base64'),
        encoding: 'base64',
      }),
    );
    entries.push({ path: name, mode: '100644', type: 'blob', sha: stringField(blob, 'sha') });
  }
  const tree = record(
    await githubRequest(context, `${base(context)}/git/trees`, 'POST', { tree: entries }),
  );
  const commit = record(
    await githubRequest(context, `${base(context)}/git/commits`, 'POST', {
      message: `factory: ${stringField(receipt, 'transition_id')}`,
      tree: stringField(tree, 'sha'),
      parents: [state.head],
    }),
  );
  const head = stringField(commit, 'sha');
  if ((await stateHead(context)) !== state.head)
    throw new FactoryFailure('Sibling conflict; preserve prepared commit, no CAS claim');
  try {
    await githubRequest(context, `${base(context)}/git/refs/heads/factory-state`, 'PATCH', {
      sha: head,
      force: false,
    });
  } catch {
    if ((await stateHead(context)) !== head)
      throw new FactoryFailure('Append ambiguous/conflicting; orphan consumed, provider denied');
  }
  const readback = await readState(context, await stateHead(context));
  if (
    readback.head !== head ||
    readback.checkpoint['last_transition_id'] !== receipt['transition_id']
  )
    throw new FactoryFailure('Append readback mismatch');
  return {
    status: 'accepted',
    reason: 'Consumed single-parent append verified; external checkpoint required before effects',
    record: {
      state_head: head,
      sequence: receipt['sequence'],
      transition_id: receipt['transition_id'],
      provider_allowed: false,
    },
  };
}
if (process.argv[1] === import.meta.filename) {
  await factoryMain(async (context, input): Promise<FactoryDecision> => {
    if (input['command'] === 'ingress') return await submitIngress(context, input);
    if (input['command'] === 'night-scan') return await nightScan(context);
    const request =
      input['command'] === 'bootstrap' && input['commit_bootstrap'] === true
        ? {
            ...input,
            envelope: await resolveReceipt(
              await resolveFactoryContext(context),
              stringField(context.job, 'run_id'),
              'bootstrap',
            ),
          }
        : input;
    const result = await runController(context, request);
    if (input['output_file'] !== undefined && result.record !== undefined) {
      const output =
        input['command'] === 'bootstrap' && result.record['receipt'] !== undefined
          ? record(result.record['receipt'])
          : result.record;
      fs.writeFileSync(stringField(input, 'output_file'), canonicalBytes(output));
      if (output['kind'] === 'checkpoint') {
        const resolved = await resolveFactoryContext(context);
        const snapshot = await readState(resolved, stringField(output, 'state_head'));
        fs.writeFileSync(
          `${stringField(input, 'output_file')}.transition`,
          stringField(snapshot.checkpoint, 'last_transition_id'),
        );
      }
    }
    return result;
  });
}
